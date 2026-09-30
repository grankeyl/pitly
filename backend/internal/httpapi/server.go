// Package httpapi реализует api.StrictServerInterface (сгенерирован из api/openapi.yaml).
package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"pitly/internal/api"
	"pitly/internal/apperr"
	"pitly/internal/auth"
	"pitly/internal/billing"
	"pitly/internal/config"
	"pitly/internal/jobs"
	"pitly/internal/money"
	"pitly/internal/payments"
	"pitly/internal/store"
	"pitly/internal/tg"
)

type Server struct {
	Queries *store.Queries
	Billing *billing.Service
	Jobs    *jobs.Deps
	Links   tg.Links
	Cfg     config.Config
	Log     *slog.Logger
}

var _ api.StrictServerInterface = (*Server)(nil)

// ErrorHandler превращает ошибки хендлеров в JSON {code, message}.
func ErrorHandler(log *slog.Logger) func(w http.ResponseWriter, r *http.Request, err error) {
	return func(w http.ResponseWriter, r *http.Request, err error) {
		e, ok := apperr.As(err)
		if !ok {
			if errors.Is(err, pgx.ErrNoRows) {
				e = apperr.NotFound("Объект")
			} else {
				log.Error("request failed", "err", err, "method", r.Method, "path", r.URL.Path)
				e = apperr.New(http.StatusInternalServerError, "internal", "Внутренняя ошибка")
			}
		}
		WriteError(w, e)
	}
}

func RequestErrorHandler(w http.ResponseWriter, _ *http.Request, err error) {
	WriteError(w, apperr.Validation("Некорректный запрос: %s", err.Error()))
}

func WriteError(w http.ResponseWriter, e *apperr.Error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(e.Status)
	_ = json.NewEncoder(w).Encode(api.Error{Code: e.Code, Message: e.Message})
}

func userID(ctx context.Context) int64 {
	u, _ := auth.FromContext(ctx)
	return u.ID
}

// ownedChannel возвращает канал, только если текущий пользователь — владелец.
// Для чужих каналов отвечаем 404, чтобы не раскрывать их существование.
func (s *Server) ownedChannel(ctx context.Context, id int64) (store.Channel, error) {
	ch, err := s.Queries.GetChannel(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && (ch.OwnerID != userID(ctx) || ch.DeletedAt != nil)) {
		return store.Channel{}, apperr.NotFound("Канал")
	}
	return ch, err
}

// Проверка бота в канале. Telegram сообщает боту об изменении прав сам, но сообщение может потеряться
// (сервер был выключен, сеть упала), поэтому при открытии канала спрашиваем ещё раз — не чаще раза в 20 секунд на канал.
var botChecks = struct {
	sync.Mutex
	at map[int64]time.Time
}{at: map[int64]time.Time{}}

const botCheckEvery = 20 * time.Second

// Демо-каналы из тестовых данных не существуют в Telegram, их не проверяем.
func isDemoChat(chatID int64) bool { return chatID <= -1009999999000 && chatID >= -1009999999999 }

// checkBot сверяет права бота с Telegram и возвращает канал с актуальным состоянием.
func (s *Server) checkBot(ctx context.Context, ch store.Channel) store.Channel {
	if isDemoChat(ch.ChatID) {
		return ch
	}
	botChecks.Lock()
	recent := time.Since(botChecks.at[ch.ID]) < botCheckEvery
	if !recent {
		botChecks.at[ch.ID] = time.Now()
	}
	botChecks.Unlock()
	if recent {
		return ch
	}
	ctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	state, err := s.Jobs.TG.BotState(ctx, ch.ChatID)
	if err != nil {
		if !errors.Is(err, tg.ErrDisabled) {
			s.Log.Warn("check bot in channel", "err", err, "channel_id", ch.ID)
		}
		return ch
	}
	if state == ch.BotIssue {
		return ch
	}
	if err := s.Queries.SetChannelBotState(ctx, store.SetChannelBotStateParams{ChatID: ch.ChatID, BotIssue: state}); err != nil {
		s.Log.Warn("save bot state", "err", err, "channel_id", ch.ID)
		return ch
	}
	s.Log.Info("bot state changed", "channel_id", ch.ID, "from", ch.BotIssue, "to", state)
	ch.BotIssue, ch.BotIsAdmin = state, state == ""
	return ch
}

func (s *Server) DeleteChannel(ctx context.Context, req api.DeleteChannelRequestObject) (api.DeleteChannelResponseObject, error) {
	ch, err := s.ownedChannel(ctx, req.ChannelId)
	if err != nil {
		return nil, err
	}
	if err := s.Queries.SoftDeleteChannel(ctx, ch.ID); err != nil {
		return nil, err
	}
	// Бот выходит из канала: он больше никого не впускает и не удаляет. Кто уже внутри, остаётся
	if !isDemoChat(ch.ChatID) {
		if err := s.Jobs.TG.LeaveChat(ctx, ch.ChatID); err != nil && !errors.Is(err, tg.ErrDisabled) {
			s.Log.Warn("leave chat", "err", err, "channel_id", ch.ID)
		}
	}
	s.Log.Info("channel deleted", "channel_id", ch.ID, "owner_id", ch.OwnerID)
	return api.DeleteChannel204Response{}, nil
}

// ---- профиль ----

func (s *Server) GetMe(ctx context.Context, _ api.GetMeRequestObject) (api.GetMeResponseObject, error) {
	u, err := s.Queries.GetUser(ctx, userID(ctx))
	if err != nil {
		return nil, err
	}
	bal, err := s.balance(ctx, u.ID)
	if err != nil {
		return nil, err
	}
	return api.GetMe200JSONResponse{
		User: api.User{
			Id: u.ID, Username: u.Username, FirstName: u.FirstName, LastName: u.LastName, PhotoUrl: u.PhotoUrl,
		},
		Balance:       bal,
		CommissionBps: s.Billing.CommissionBps(u),
		MinPayout:     s.Cfg.MinPayout,
		HoldHours:     s.Cfg.HoldHours,
		PayoutMethods: []api.PayoutMethod{api.PayoutMethodCard, api.PayoutMethodSbp, api.PayoutMethodUsdtTon},
	}, nil
}

func (s *Server) balance(ctx context.Context, creatorID int64) (api.Balance, error) {
	b, err := s.Queries.CreatorBalances(ctx, store.CreatorBalancesParams{CreatorID: &creatorID, Currency: s.Cfg.Currency})
	if err != nil {
		return api.Balance{}, err
	}
	return api.Balance{Currency: s.Cfg.Currency, Pending: b.Pending, Available: b.Available, PaidOut: b.PaidOut}, nil
}

// ---- каналы (автор) ----

func (s *Server) ListChannels(ctx context.Context, _ api.ListChannelsRequestObject) (api.ListChannelsResponseObject, error) {
	rows, err := s.Queries.ListChannelsByOwner(ctx, userID(ctx))
	if err != nil {
		return nil, err
	}
	out := make(api.ListChannels200JSONResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, s.channelDTO(s.checkBot(ctx, store.Channel{
			ID: r.ID, OwnerID: r.OwnerID, ChatID: r.ChatID, ChatType: r.ChatType, Title: r.Title,
			Username: r.Username, Description: r.Description, BotIsAdmin: r.BotIsAdmin, BotIssue: r.BotIssue,
			InviteLink: r.InviteLink, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
		}), r.ActiveSubscribers))
	}
	return out, nil
}

func (s *Server) GetConnectLink(context.Context, api.GetConnectLinkRequestObject) (api.GetConnectLinkResponseObject, error) {
	return api.GetConnectLink200JSONResponse{Url: s.Links.ConnectChannel(), BotUsername: s.Links.BotUsername}, nil
}

func (s *Server) GetChannel(ctx context.Context, req api.GetChannelRequestObject) (api.GetChannelResponseObject, error) {
	ch, err := s.ownedChannel(ctx, req.ChannelId)
	if err != nil {
		return nil, err
	}
	ch = s.checkBot(ctx, ch)
	rows, err := s.Queries.ListProductsByChannel(ctx, ch.ID)
	if err != nil {
		return nil, err
	}
	products := make([]api.Product, 0, len(rows))
	for _, r := range rows {
		dto, err := s.productDTO(ctx, r, ch)
		if err != nil {
			return nil, err
		}
		products = append(products, dto)
	}
	active, err := s.activeSubscribers(ctx, ch)
	if err != nil {
		return nil, err
	}
	return api.GetChannel200JSONResponse{Channel: s.channelDTO(ch, active), Products: products}, nil
}

func (s *Server) UpdateChannel(ctx context.Context, req api.UpdateChannelRequestObject) (api.UpdateChannelResponseObject, error) {
	ch, err := s.ownedChannel(ctx, req.ChannelId)
	if err != nil {
		return nil, err
	}
	ch, err = s.Queries.UpdateChannelDescription(ctx, store.UpdateChannelDescriptionParams{
		ID: ch.ID, Description: strings.TrimSpace(req.Body.Description),
	})
	if err != nil {
		return nil, err
	}
	active, err := s.activeSubscribers(ctx, ch)
	if err != nil {
		return nil, err
	}
	return api.UpdateChannel200JSONResponse(s.channelDTO(ch, active)), nil
}

func (s *Server) activeSubscribers(ctx context.Context, ch store.Channel) (int64, error) {
	return s.Queries.CountActiveSubscribers(ctx, ch.ID)
}

func (s *Server) channelDTO(ch store.Channel, active int64) api.Channel {
	return api.Channel{
		Id:                ch.ID,
		Title:             ch.Title,
		Username:          ch.Username,
		ChatType:          api.ChannelChatType(ch.ChatType),
		Description:       ch.Description,
		BotIsAdmin:        ch.BotIsAdmin,
		BotIssue:          botIssueDTO(ch.BotIssue),
		ActiveSubscribers: active,
		OfferUrl:          s.Links.Offer(ch.ID),
		ConnectedAt:       ch.UpdatedAt,
	}
}

func botIssueDTO(v string) api.ChannelBotIssue {
	switch v {
	case "removed":
		return api.Removed
	case "no_rights":
		return api.NoRights
	}
	return api.None
}

// ---- подписки автора и их периоды ----

// periodTitle — название периода из срока: «1 месяц», «3 месяца», «Навсегда».
func periodTitle(days int) string {
	plural := func(n int, one, few, many string) string {
		m10, m100 := n%10, n%100
		w := many
		switch {
		case m10 == 1 && m100 != 11:
			w = one
		case m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14):
			w = few
		}
		return fmt.Sprintf("%d %s", n, w)
	}
	switch {
	case days == 0:
		return "Навсегда"
	case days%365 == 0:
		return plural(days/365, "год", "года", "лет")
	case days%30 == 0:
		return plural(days/30, "месяц", "месяца", "месяцев")
	case days%7 == 0:
		return plural(days/7, "неделя", "недели", "недель")
	}
	return plural(days, "день", "дня", "дней")
}

func validatePlan(in api.PlanInput) error {
	// Лимиты как у Tribute: от 100 ₽ до 300 000 ₽.
	if in.Price < 100_00 || in.Price > 300_000_00 {
		return apperr.Validation("Цена — от 100 до 300 000 ₽")
	}
	if in.PeriodDays < 0 || in.PeriodDays > 3650 {
		return apperr.Validation("Некорректный срок")
	}
	return nil
}

// productFields — поля подписки после проверки.
type productFields struct {
	Title       string
	Description string
	ButtonText  string
	ImageID     *uuid.UUID
	Methods     []string
}

const defaultButtonText = "Подписаться"

func (s *Server) validateProduct(ctx context.Context, in api.ProductInput) (productFields, error) {
	out := productFields{ButtonText: defaultButtonText, Methods: []string{}}
	out.Title = strings.TrimSpace(in.Title)
	if out.Title == "" || len([]rune(out.Title)) > 64 {
		return out, apperr.Validation("Название — от 1 до 64 символов")
	}
	if in.Description != nil {
		out.Description = strings.TrimSpace(*in.Description)
		if len([]rune(out.Description)) > 500 {
			return out, apperr.Validation("Описание — до 500 символов")
		}
	}
	if in.ButtonText != nil {
		if t := strings.TrimSpace(*in.ButtonText); t != "" {
			if len([]rune(t)) > 32 {
				return out, apperr.Validation("Текст кнопки — до 32 символов")
			}
			out.ButtonText = t
		}
	}
	if in.ImageId != nil {
		owner, err := s.Queries.GetImageOwner(ctx, *in.ImageId)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && owner != userID(ctx)) {
			return out, apperr.Validation("Картинка не найдена, загрузите её заново")
		}
		if err != nil {
			return out, err
		}
		id := *in.ImageId
		out.ImageID = &id
	}
	if in.PaymentMethods != nil {
		seen := map[string]bool{}
		for _, m := range *in.PaymentMethods {
			if !s.Billing.SupportsMethod(payments.Method(m)) {
				return out, apperr.Validation("Способ оплаты недоступен")
			}
			if !seen[string(m)] {
				seen[string(m)] = true
				out.Methods = append(out.Methods, string(m))
			}
		}
	}
	return out, nil
}

// ownedProduct возвращает подписку и её канал, если канал принадлежит текущему пользователю.
func (s *Server) ownedProduct(ctx context.Context, id int64) (store.Product, store.Channel, error) {
	pr, err := s.Queries.GetProduct(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && pr.DeletedAt != nil) {
		return pr, store.Channel{}, apperr.NotFound("Подписка")
	}
	if err != nil {
		return pr, store.Channel{}, err
	}
	ch, err := s.ownedChannel(ctx, pr.ChannelID)
	if err != nil {
		return pr, ch, apperr.NotFound("Подписка")
	}
	return pr, ch, nil
}

func (s *Server) CreateProduct(ctx context.Context, req api.CreateProductRequestObject) (api.CreateProductResponseObject, error) {
	ch, err := s.ownedChannel(ctx, req.ChannelId)
	if err != nil {
		return nil, err
	}
	b := req.Body
	f, err := s.validateProduct(ctx, api.ProductInput{Title: b.Title, Description: b.Description, ButtonText: b.ButtonText, ImageId: b.ImageId, PaymentMethods: b.PaymentMethods})
	if err != nil {
		return nil, err
	}
	if len(b.Plans) == 0 || len(b.Plans) > 6 {
		return nil, apperr.Validation("У подписки должно быть от 1 до 6 периодов")
	}
	seen := map[int]bool{}
	for _, p := range b.Plans {
		if err := validatePlan(p); err != nil {
			return nil, err
		}
		if seen[p.PeriodDays] {
			return nil, apperr.Validation("Сроки периодов не должны повторяться")
		}
		seen[p.PeriodDays] = true
	}
	var pr store.Product
	err = pgx.BeginFunc(ctx, s.Billing.Pool, func(tx pgx.Tx) error {
		q := s.Queries.WithTx(tx)
		var err error
		pr, err = q.CreateProduct(ctx, store.CreateProductParams{
			ChannelID: ch.ID, Title: f.Title, Description: f.Description, ButtonText: f.ButtonText, ImageID: f.ImageID, PaymentMethods: f.Methods,
		})
		if err != nil {
			return err
		}
		for _, p := range b.Plans {
			if _, err := q.CreatePlan(ctx, store.CreatePlanParams{
				ChannelID: ch.ID, ProductID: pr.ID, Title: periodTitle(p.PeriodDays), Price: p.Price,
				Currency: s.Cfg.Currency, PeriodDays: int32(p.PeriodDays),
			}); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	dto, err := s.productDTO(ctx, pr, ch)
	if err != nil {
		return nil, err
	}
	return api.CreateProduct201JSONResponse(dto), nil
}

func (s *Server) DeleteProduct(ctx context.Context, req api.DeleteProductRequestObject) (api.DeleteProductResponseObject, error) {
	pr, _, err := s.ownedProduct(ctx, req.ProductId)
	if err != nil {
		return nil, err
	}
	if err := s.Queries.SoftDeleteProduct(ctx, pr.ID); err != nil {
		return nil, err
	}
	s.Log.Info("product deleted", "product_id", pr.ID, "channel_id", pr.ChannelID)
	return api.DeleteProduct204Response{}, nil
}

func (s *Server) GetProduct(ctx context.Context, req api.GetProductRequestObject) (api.GetProductResponseObject, error) {
	pr, ch, err := s.ownedProduct(ctx, req.ProductId)
	if err != nil {
		return nil, err
	}
	dto, err := s.productDTO(ctx, pr, ch)
	if err != nil {
		return nil, err
	}
	return api.GetProduct200JSONResponse(dto), nil
}

func (s *Server) UpdateProduct(ctx context.Context, req api.UpdateProductRequestObject) (api.UpdateProductResponseObject, error) {
	pr, ch, err := s.ownedProduct(ctx, req.ProductId)
	if err != nil {
		return nil, err
	}
	b := req.Body
	f, err := s.validateProduct(ctx, api.ProductInput{Title: b.Title, Description: b.Description, ButtonText: b.ButtonText, ImageId: b.ImageId, PaymentMethods: b.PaymentMethods})
	if err != nil {
		return nil, err
	}
	pr, err = s.Queries.UpdateProduct(ctx, store.UpdateProductParams{
		ID: pr.ID, Title: f.Title, Description: f.Description, ButtonText: f.ButtonText, ImageID: f.ImageID, PaymentMethods: f.Methods, IsActive: b.IsActive,
	})
	if err != nil {
		return nil, err
	}
	dto, err := s.productDTO(ctx, pr, ch)
	if err != nil {
		return nil, err
	}
	return api.UpdateProduct200JSONResponse(dto), nil
}

func (s *Server) CreatePlan(ctx context.Context, req api.CreatePlanRequestObject) (api.CreatePlanResponseObject, error) {
	pr, ch, err := s.ownedProduct(ctx, req.ProductId)
	if err != nil {
		return nil, err
	}
	if err := validatePlan(*req.Body); err != nil {
		return nil, err
	}
	existing, err := s.Queries.ListPlansByProduct(ctx, pr.ID)
	if err != nil {
		return nil, err
	}
	for _, e := range existing {
		if int(e.PeriodDays) == req.Body.PeriodDays {
			return nil, apperr.Validation("Такой срок у подписки уже есть")
		}
	}
	p, err := s.Queries.CreatePlan(ctx, store.CreatePlanParams{
		ChannelID: ch.ID, ProductID: pr.ID, Title: periodTitle(req.Body.PeriodDays), Price: req.Body.Price,
		Currency: s.Cfg.Currency, PeriodDays: int32(req.Body.PeriodDays),
	})
	if err != nil {
		return nil, err
	}
	return api.CreatePlan201JSONResponse(planDTO(p)), nil
}

func (s *Server) UpdatePlan(ctx context.Context, req api.UpdatePlanRequestObject) (api.UpdatePlanResponseObject, error) {
	p, err := s.Queries.GetPlan(ctx, req.PlanId)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.NotFound("Период")
	}
	if err != nil {
		return nil, err
	}
	if _, err := s.ownedChannel(ctx, p.ChannelID); err != nil {
		return nil, apperr.NotFound("Период")
	}
	b := req.Body
	if err := validatePlan(api.PlanInput{Price: b.Price, PeriodDays: b.PeriodDays}); err != nil {
		return nil, err
	}
	p, err = s.Queries.UpdatePlan(ctx, store.UpdatePlanParams{
		ID: p.ID, Title: periodTitle(b.PeriodDays), Price: b.Price, PeriodDays: int32(b.PeriodDays), IsActive: b.IsActive,
	})
	if err != nil {
		return nil, err
	}
	return api.UpdatePlan200JSONResponse(planDTO(p)), nil
}

// ShareProduct готовит пост подписки: название, описание, цены по периодам, картинка и кнопка со ссылкой на оплату.
func (s *Server) ShareProduct(ctx context.Context, req api.ShareProductRequestObject) (api.ShareProductResponseObject, error) {
	pr, _, err := s.ownedProduct(ctx, req.ProductId)
	if err != nil {
		return nil, err
	}
	plans, err := s.Queries.ListActivePlansByProduct(ctx, pr.ID)
	if err != nil {
		return nil, err
	}
	if !pr.IsActive || len(plans) == 0 {
		return nil, apperr.Conflict("not_on_sale", "Подписка не в продаже: включите её и добавьте период")
	}
	var b strings.Builder
	b.WriteString("<b>" + html.EscapeString(pr.Title) + "</b>")
	if pr.Description != "" {
		b.WriteString("\n\n" + html.EscapeString(pr.Description))
	}
	b.WriteString("\n")
	for _, p := range plans {
		b.WriteString("\n" + html.EscapeString(p.Title) + " — " + html.EscapeString(money.Format(p.Price, p.Currency)))
	}
	post := tg.Post{Title: pr.Title, HTML: b.String(), ButtonText: pr.ButtonText, ButtonURL: s.Links.Product(pr.ID)}
	if pr.ImageID != nil {
		if img, err := s.Queries.GetImage(ctx, *pr.ImageID); err == nil {
			switch {
			case img.TgFileID != nil && *img.TgFileID != "":
				post.ImageFileID = *img.TgFileID
			default:
				// Первый раз загружаем картинку в Telegram и запоминаем её там
				fileID, err := s.Jobs.TG.UploadPhoto(ctx, userID(ctx), img.Data)
				if err == nil {
					post.ImageFileID = fileID
					if err := s.Queries.SetImageFileID(ctx, store.SetImageFileIDParams{ID: *pr.ImageID, TgFileID: &fileID}); err != nil {
						s.Log.Warn("save image file id", "err", err)
					}
				} else {
					s.Log.Warn("upload photo to telegram", "err", err, "product_id", pr.ID)
				}
			}
			// Запасной путь — ссылка на наш сервер с размерами картинки
			if post.ImageFileID == "" && strings.HasPrefix(s.Cfg.PublicURL, "https://") {
				post.ImageURL = s.Cfg.PublicURL + imageURL(*pr.ImageID)
				if cfg, _, err := image.DecodeConfig(bytes.NewReader(img.Data)); err == nil {
					post.ImageWidth, post.ImageHeight = cfg.Width, cfg.Height
				}
			}
		}
	}
	id, err := s.Jobs.TG.PrepareShare(ctx, userID(ctx), post)
	if err != nil {
		s.Log.Warn("prepare share", "err", err, "product_id", pr.ID)
		return nil, apperr.New(http.StatusBadGateway, "telegram_error", "Telegram не принял пост, попробуйте ещё раз")
	}
	return api.ShareProduct200JSONResponse{PreparedMessageId: id}, nil
}

func (s *Server) productDTO(ctx context.Context, pr store.Product, ch store.Channel) (api.Product, error) {
	plans, err := s.Queries.ListPlansByProduct(ctx, pr.ID)
	if err != nil {
		return api.Product{}, err
	}
	subs, err := s.Queries.CountProductSubscribers(ctx, pr.ID)
	if err != nil {
		return api.Product{}, err
	}
	dto := api.Product{
		Id: pr.ID, ChannelId: ch.ID, ChannelTitle: ch.Title, Title: pr.Title, Description: pr.Description,
		ButtonText: pr.ButtonText, PaymentMethods: methodsDTO(pr.PaymentMethods), IsActive: pr.IsActive,
		ActiveSubscribers: subs, Url: s.Links.Product(pr.ID), Plans: plansDTO(plans),
	}
	if pr.ImageID != nil {
		id := *pr.ImageID
		url := imageURL(id)
		dto.ImageId = &id
		dto.ImageUrl = &url
	}
	return dto, nil
}

func methodsDTO(in []string) []api.PaymentMethod {
	out := make([]api.PaymentMethod, 0, len(in))
	for _, m := range in {
		out = append(out, api.PaymentMethod(m))
	}
	return out
}

func planDTO(p store.Plan) api.Plan {
	return api.Plan{
		Id: p.ID, ChannelId: p.ChannelID, ProductId: p.ProductID, Title: p.Title, Price: p.Price,
		Currency: p.Currency, PeriodDays: int(p.PeriodDays), IsActive: p.IsActive,
	}
}

func plansDTO(ps []store.Plan) []api.Plan {
	out := make([]api.Plan, 0, len(ps))
	for _, p := range ps {
		out = append(out, planDTO(p))
	}
	return out
}

// ---- подписчик: оффер, оплата, подписки ----

func (s *Server) GetOffer(ctx context.Context, req api.GetOfferRequestObject) (api.GetOfferResponseObject, error) {
	ch, err := s.Queries.GetChannel(ctx, req.ChannelId)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && ch.DeletedAt != nil) {
		return nil, apperr.NotFound("Канал")
	}
	if err != nil {
		return nil, err
	}
	// Ссылка на канал открывает первую подписку, которая в продаже и у которой есть период
	products, err := s.Queries.ListProductsByChannel(ctx, ch.ID)
	if err != nil {
		return nil, err
	}
	var chosen *store.Product
	for i := range products {
		if !products[i].IsActive {
			continue
		}
		plans, err := s.Queries.ListActivePlansByProduct(ctx, products[i].ID)
		if err != nil {
			return nil, err
		}
		if len(plans) > 0 {
			chosen = &products[i]
			break
		}
	}
	offer, err := s.offer(ctx, ch, chosen)
	if err != nil {
		return nil, err
	}
	return api.GetOffer200JSONResponse(offer), nil
}

func (s *Server) GetProductOffer(ctx context.Context, req api.GetProductOfferRequestObject) (api.GetProductOfferResponseObject, error) {
	pr, err := s.Queries.GetProduct(ctx, req.ProductId)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && pr.DeletedAt != nil) {
		return nil, apperr.NotFound("Подписка")
	}
	if err != nil {
		return nil, err
	}
	ch, err := s.Queries.GetChannel(ctx, pr.ChannelID)
	if err != nil {
		return nil, err
	}
	offer, err := s.offer(ctx, ch, &pr)
	if err != nil {
		return nil, err
	}
	return api.GetProductOffer200JSONResponse(offer), nil
}

// offer собирает страницу оплаты. pr == nil — у канала нечего продавать.
func (s *Server) offer(ctx context.Context, ch store.Channel, pr *store.Product) (api.Offer, error) {
	owner, err := s.Queries.GetUser(ctx, ch.OwnerID)
	if err != nil {
		return api.Offer{}, err
	}
	offer := api.Offer{
		ChannelId: ch.ID, Title: ch.Title, Username: ch.Username, Description: ch.Description,
		ButtonText: defaultButtonText, Plans: []api.Plan{}, PaymentMethods: []api.PaymentMethod{},
		Own: ch.OwnerID == userID(ctx),
	}
	if pr != nil {
		plans, err := s.Queries.ListActivePlansByProduct(ctx, pr.ID)
		if err != nil {
			return offer, err
		}
		id, title := pr.ID, pr.Title
		offer.ProductId, offer.ProductTitle = &id, &title
		offer.ButtonText = pr.ButtonText
		if pr.Description != "" {
			offer.Description = pr.Description
		}
		if pr.ImageID != nil {
			url := imageURL(*pr.ImageID)
			offer.ImageUrl = &url
		}
		offer.Plans = plansDTO(plans)
		for _, m := range s.Billing.Provider.Methods() {
			if len(pr.PaymentMethods) == 0 || slices.Contains(pr.PaymentMethods, string(m)) {
				offer.PaymentMethods = append(offer.PaymentMethods, api.PaymentMethod(m))
			}
		}
		offer.Available = ch.BotIsAdmin && !owner.IsBlocked && pr.IsActive && len(plans) > 0 && len(offer.PaymentMethods) > 0
	}

	sub, err := s.Queries.GetSubscription(ctx, store.GetSubscriptionParams{ChannelID: ch.ID, UserID: userID(ctx)})
	if err == nil {
		dto, err := s.mySubscription(ctx, sub, ch)
		if err != nil {
			return offer, err
		}
		offer.Subscription = &dto
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return offer, err
	}
	return offer, nil
}

func (s *Server) mySubscription(ctx context.Context, sub store.Subscription, ch store.Channel) (api.MySubscription, error) {
	plan, err := s.Queries.GetPlan(ctx, sub.PlanID)
	if err != nil {
		return api.MySubscription{}, err
	}
	dto := api.MySubscription{
		Id: sub.ID, ChannelId: ch.ID, ChannelTitle: ch.Title, ChannelUsername: ch.Username,
		PlanTitle: plan.Title, Status: api.MySubscriptionStatus(sub.Status), StartedAt: sub.StartedAt, ExpiresAt: sub.ExpiresAt,
	}
	if sub.Status == "active" {
		dto.InviteLink = ch.InviteLink
	}
	return dto, nil
}

func (s *Server) CreateCheckout(ctx context.Context, req api.CreateCheckoutRequestObject) (api.CreateCheckoutResponseObject, error) {
	p, err := s.Billing.Checkout(ctx, userID(ctx), req.Body.PlanId, payments.Method(req.Body.Method))
	if err != nil {
		return nil, err
	}
	return api.CreateCheckout201JSONResponse{PaymentId: p.ID, PaymentUrl: deref(p.PaymentUrl)}, nil
}

func (s *Server) GetPayment(ctx context.Context, req api.GetPaymentRequestObject) (api.GetPaymentResponseObject, error) {
	p, err := s.Queries.GetPayment(ctx, req.PaymentId)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && p.UserID != userID(ctx)) {
		return nil, apperr.NotFound("Платёж")
	}
	if err != nil {
		return nil, err
	}
	ch, err := s.Queries.GetChannel(ctx, p.ChannelID)
	if err != nil {
		return nil, err
	}
	out := api.GetPayment200JSONResponse{
		Id: p.ID, Status: api.PaymentStatusStatus(p.Status), Amount: p.Amount, Currency: p.Currency,
		ChannelId: ch.ID, ChannelTitle: ch.Title,
	}
	if p.Status == "succeeded" {
		// Ссылка обычно уже создана воркером; если нет — создаём сразу, чтобы не заставлять ждать.
		link, err := jobs.EnsureInviteLink(ctx, s.Jobs, ch)
		if err != nil {
			s.Log.Warn("ensure invite link", "err", err, "channel_id", ch.ID)
		} else {
			out.InviteLink = &link
		}
	}
	return out, nil
}

func (s *Server) ListMySubscriptions(ctx context.Context, _ api.ListMySubscriptionsRequestObject) (api.ListMySubscriptionsResponseObject, error) {
	rows, err := s.Queries.ListSubscriptionsByUser(ctx, userID(ctx))
	if err != nil {
		return nil, err
	}
	out := make(api.ListMySubscriptions200JSONResponse, 0, len(rows))
	for _, r := range rows {
		dto := api.MySubscription{
			Id: r.ID, ChannelId: r.ChannelID, ChannelTitle: r.ChannelTitle, ChannelUsername: r.ChannelUsername,
			PlanTitle: r.PlanTitle, Status: api.MySubscriptionStatus(r.Status), StartedAt: r.StartedAt, ExpiresAt: r.ExpiresAt,
		}
		if r.Status == "active" {
			dto.InviteLink = r.ChannelInviteLink
		}
		out = append(out, dto)
	}
	return out, nil
}

// ---- статистика ----

func (s *Server) GetStats(ctx context.Context, req api.GetStatsRequestObject) (api.GetStatsResponseObject, error) {
	days := 30
	if req.Params.Days != nil {
		days = *req.Params.Days
	}
	if days < 1 || days > 365 {
		return nil, apperr.Validation("days — от 1 до 365")
	}
	loc, err := time.LoadLocation(s.Cfg.StatsTZ)
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, -(days - 1))
	uid := userID(ctx)

	sum, err := s.Queries.CreatorStatsSummary(ctx, store.CreatorStatsSummaryParams{CreatorID: uid, Since: start, ChannelID: req.Params.ChannelId})
	if err != nil {
		return nil, err
	}
	subs, err := s.Queries.CreatorSubscriberCounts(ctx, store.CreatorSubscriberCountsParams{CreatorID: uid, Since: start, ChannelID: req.Params.ChannelId})
	if err != nil {
		return nil, err
	}
	daily, err := s.Queries.CreatorDailyRevenue(ctx, store.CreatorDailyRevenueParams{Tz: loc.String(), CreatorID: uid, Since: start, ChannelID: req.Params.ChannelId})
	if err != nil {
		return nil, err
	}

	byDay := make(map[string]store.CreatorDailyRevenueRow, len(daily))
	for _, d := range daily {
		byDay[d.Day.Format(time.DateOnly)] = d
	}
	points := make([]api.DailyPoint, 0, days)
	for i := 0; i < days; i++ {
		day := start.AddDate(0, 0, i)
		d := byDay[day.Format(time.DateOnly)]
		points = append(points, api.DailyPoint{
			Date: openapi_types.Date{Time: time.Date(day.Year(), day.Month(), day.Day(), 0, 0, 0, 0, time.UTC)},
			Net:  d.Net, Payments: d.Payments,
		})
	}

	return api.GetStats200JSONResponse{
		Days: days, Currency: s.Cfg.Currency,
		NetRevenue: sum.NetRevenue, GrossRevenue: sum.GrossRevenue, PaymentsCount: sum.PaymentsCount, PayingUsers: sum.PayingUsers,
		ActiveSubscribers: subs.Active, NewSubscribers: subs.NewActive, ChurnedSubscribers: subs.Churned,
		Daily: points,
	}, nil
}

// ListDayPayments — успешные оплаты автора: за один календарный день или последние, при желании по одному каналу.
func (s *Server) ListDayPayments(ctx context.Context, req api.ListDayPaymentsRequestObject) (api.ListDayPaymentsResponseObject, error) {
	loc, err := time.LoadLocation(s.Cfg.StatsTZ)
	if err != nil {
		loc = time.UTC
	}
	params := store.CreatorDayPaymentsParams{CreatorID: userID(ctx), ChannelID: req.Params.ChannelId, MaxRows: 200}
	if req.Params.Limit != nil {
		if *req.Params.Limit < 1 || *req.Params.Limit > 200 {
			return nil, apperr.Validation("limit — от 1 до 200")
		}
		params.MaxRows = int32(*req.Params.Limit)
	}
	if req.Params.Date != nil {
		d := req.Params.Date.Time
		start := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, loc)
		end := start.AddDate(0, 0, 1)
		params.DayStart, params.DayEnd = &start, &end
	}
	rows, err := s.Queries.CreatorDayPayments(ctx, params)
	if err != nil {
		return nil, err
	}
	out := make(api.ListDayPayments200JSONResponse, 0, len(rows))
	for _, r := range rows {
		paid := time.Time{}
		if r.PaidAt != nil {
			paid = *r.PaidAt
		}
		out = append(out, api.DayPayment{
			Id: r.ID, PaidAt: paid, Amount: r.Amount, Net: r.Net, Method: api.PaymentMethod(r.Method),
			ChannelTitle: r.ChannelTitle, PlanTitle: r.PlanTitle, PayerName: r.PayerName,
		})
	}
	return out, nil
}

// ---- выводы ----

func (s *Server) ListPayouts(ctx context.Context, _ api.ListPayoutsRequestObject) (api.ListPayoutsResponseObject, error) {
	rows, err := s.Queries.ListPayoutsByCreator(ctx, store.ListPayoutsByCreatorParams{CreatorID: userID(ctx), Limit: 50})
	if err != nil {
		return nil, err
	}
	out := make(api.ListPayouts200JSONResponse, 0, len(rows))
	for _, p := range rows {
		out = append(out, payoutDTO(p))
	}
	return out, nil
}

func (s *Server) RequestPayout(ctx context.Context, req api.RequestPayoutRequestObject) (api.RequestPayoutResponseObject, error) {
	p, err := s.Billing.RequestPayout(ctx, userID(ctx), req.Body.Amount, string(req.Body.Method), req.Body.Destination)
	if err != nil {
		return nil, err
	}
	return api.RequestPayout201JSONResponse(payoutDTO(p)), nil
}

func payoutDTO(p store.Payout) api.Payout {
	dto := api.Payout{
		Id: p.ID, Amount: p.Amount, Currency: p.Currency, Method: api.PayoutMethod(p.Method),
		Destination: billing.MaskDestination(p.Method, p.Destination), Status: api.PayoutStatus(p.Status),
		CreatedAt: p.CreatedAt, ProcessedAt: p.ProcessedAt,
	}
	if p.Comment != "" {
		dto.Comment = &p.Comment
	}
	return dto
}

func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}
