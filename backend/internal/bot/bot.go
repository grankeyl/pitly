// Package bot — Telegram-бот. Пользователь с ним почти не взаимодействует:
// бот работает админом в каналах (впускает оплативших, удаляет истёкших)
// и шлёт уведомления. Весь интерфейс — в mini app.
package bot

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	tgbot "github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/jackc/pgx/v5"

	"pitly/internal/store"
	"pitly/internal/tg"
)

type Bot struct {
	api        *tgbot.Bot
	username   string
	queries    *store.Queries
	links      func() tg.Links
	log        *slog.Logger
	appURL     string
	hasMainApp bool
	id         int64
}

// New создаёт бота и узнаёт его username через getMe.
func New(ctx context.Context, token, webhookSecret string, q *store.Queries, log *slog.Logger) (*Bot, error) {
	b := &Bot{queries: q, log: log}
	opts := []tgbot.Option{
		// getMe делаем сами ниже — с ретраями, сеть до api.telegram.org бывает медленной.
		tgbot.WithSkipGetMe(),
		tgbot.WithHTTPClient(time.Minute, &http.Client{Timeout: 75 * time.Second}),
		tgbot.WithErrorsHandler(func(err error) { log.Warn("telegram", "err", err) }),
		tgbot.WithDefaultHandler(b.handle),
		tgbot.WithAllowedUpdates(tgbot.AllowedUpdates{"message", "my_chat_member", "chat_join_request"}),
	}
	if webhookSecret != "" {
		opts = append(opts, tgbot.WithWebhookSecretToken(webhookSecret))
	}
	api, err := tgbot.New(token, opts...)
	if err != nil {
		return nil, err
	}
	var me *models.User
	for attempt := 1; ; attempt++ {
		me, err = api.GetMe(ctx)
		if err == nil {
			break
		}
		if attempt == 5 {
			return nil, fmt.Errorf("getMe: %w", err)
		}
		log.Warn("getMe failed, retrying", "attempt", attempt, "err", err)
		time.Sleep(time.Duration(attempt) * time.Second)
	}
	b.api, b.username, b.id = api, me.Username, me.ID
	b.hasMainApp = hasMainWebApp(ctx, token)
	if !b.hasMainApp {
		log.Warn("main mini app is not enabled in BotFather: links go through the bot chat")
	}
	return b, nil
}

// hasMainWebApp спрашивает у Telegram, включено ли у бота основное приложение (Bot Settings → Configure Mini App).
// Библиотека этого поля не отдаёт, поэтому запрос делаем сами. При ошибке считаем, что не включено: запасной путь работает всегда.
func hasMainWebApp(ctx context.Context, token string) bool {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.telegram.org/bot"+token+"/getMe", nil)
	if err != nil {
		return false
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	var out struct {
		Result struct {
			HasMainWebApp bool `json:"has_main_web_app"`
		} `json:"result"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return false
	}
	return out.Result.HasMainWebApp
}

// HasMainApp — включено ли основное приложение в BotFather.
func (b *Bot) HasMainApp() bool { return b.hasMainApp }

// SetLinks — ссылки на mini app (зависят от username бота, поэтому задаются после New).
func (b *Bot) SetLinks(l tg.Links) { b.links = func() tg.Links { return l } }

// SetAppURL запоминает HTTPS-адрес mini app. С ним кнопки в личных сообщениях открывают приложение напрямую.
func (b *Bot) SetAppURL(u string) {
	if strings.HasPrefix(u, "https://") {
		b.appURL = strings.TrimRight(u, "/")
	}
}

// button превращает ссылку вида t.me/<бот>?startapp=… в кнопку, которая открывает mini app прямо в чате с ботом.
// Такая кнопка работает, даже если в BotFather не настроено основное приложение. Остальные ссылки остаются ссылками.
func (b *Bot) button(btn tg.Button) models.InlineKeyboardButton {
	if b.appURL != "" {
		if u, err := url.Parse(btn.URL); err == nil && u.Host == "t.me" && strings.EqualFold(strings.Trim(u.Path, "/"), b.username) && (u.Query().Has("startapp") || u.Query().Has("start") || u.RawQuery == "") {
			app := b.appURL + "/"
			p := u.Query().Get("startapp")
			if p == "" {
				p = u.Query().Get("start")
			}
			if p != "" {
				app += "?startapp=" + url.QueryEscape(p)
			}
			return models.InlineKeyboardButton{Text: btn.Text, WebApp: &models.WebAppInfo{URL: app}}
		}
	}
	return models.InlineKeyboardButton{Text: btn.Text, URL: btn.URL}
}

func (b *Bot) API() *tgbot.Bot { return b.api }

// SetMenuButton ставит кнопку «Открыть» слева от поля ввода в чате с ботом.
// Telegram принимает только HTTPS-адреса.
func (b *Bot) SetMenuButton(ctx context.Context, appURL string) error {
	if !strings.HasPrefix(appURL, "https://") {
		return nil
	}
	_, err := b.api.SetChatMenuButton(ctx, &tgbot.SetChatMenuButtonParams{
		MenuButton: models.MenuButtonWebApp{
			Type:   models.MenuButtonTypeWebApp,
			Text:   "Открыть",
			WebApp: models.WebAppInfo{URL: appURL},
		},
	})
	return err
}

// ---- tg.Client ----

// wrap помечает ошибки, которые бессмысленно ретраить.
func wrap(err error) error {
	if errors.Is(err, tgbot.ErrorBadRequest) || errors.Is(err, tgbot.ErrorForbidden) {
		return fmt.Errorf("%w: %w", tg.ErrPermanent, err)
	}
	return err
}

func (b *Bot) Username() string { return b.username }

func (b *Bot) SendMessage(ctx context.Context, chatID int64, text string, buttons ...tg.Button) error {
	p := &tgbot.SendMessageParams{ChatID: chatID, Text: text}
	if len(buttons) > 0 {
		rows := make([][]models.InlineKeyboardButton, 0, len(buttons))
		for _, btn := range buttons {
			rows = append(rows, []models.InlineKeyboardButton{b.button(btn)})
		}
		p.ReplyMarkup = &models.InlineKeyboardMarkup{InlineKeyboard: rows}
	}
	_, err := b.api.SendMessage(ctx, p)
	return wrap(err)
}

func (b *Bot) BotState(ctx context.Context, chatID int64) (string, error) {
	m, err := b.api.GetChatMember(ctx, &tgbot.GetChatMemberParams{ChatID: chatID, UserID: b.id})
	if err != nil {
		// Telegram отвечает отказом, когда бота в канале уже нет или сам канал удалён
		if errors.Is(err, tgbot.ErrorForbidden) || errors.Is(err, tgbot.ErrorBadRequest) || errors.Is(err, tgbot.ErrorNotFound) {
			return "removed", nil
		}
		return "", err
	}
	switch {
	case m.Administrator == nil:
		return "removed", nil
	case !m.Administrator.CanInviteUsers || !m.Administrator.CanRestrictMembers:
		return "no_rights", nil
	}
	return "", nil
}

func (b *Bot) LeaveChat(ctx context.Context, chatID int64) error {
	_, err := b.api.LeaveChat(ctx, &tgbot.LeaveChatParams{ChatID: chatID})
	return wrap(err)
}

func (b *Bot) UploadPhoto(ctx context.Context, chatID int64, data []byte) (string, error) {
	msg, err := b.api.SendPhoto(ctx, &tgbot.SendPhotoParams{
		ChatID:              chatID,
		Photo:               &models.InputFileUpload{Filename: "cover.jpg", Data: bytes.NewReader(data)},
		DisableNotification: true,
	})
	if err != nil {
		return "", wrap(err)
	}
	// Сообщение служебное: оно нужно только ради file_id
	_, _ = b.api.DeleteMessage(ctx, &tgbot.DeleteMessageParams{ChatID: chatID, MessageID: msg.ID})
	if len(msg.Photo) == 0 {
		return "", errors.New("telegram returned no photo sizes")
	}
	// Размеры идут по возрастанию, последний — самый большой
	return msg.Photo[len(msg.Photo)-1].FileID, nil
}

func (b *Bot) PrepareShare(ctx context.Context, userID int64, post tg.Post) (string, error) {
	markup := &models.InlineKeyboardMarkup{InlineKeyboard: [][]models.InlineKeyboardButton{{{Text: post.ButtonText, URL: post.ButtonURL}}}}
	id := fmt.Sprintf("p%d", time.Now().UnixNano())
	var result models.InlineQueryResult
	if post.ImageFileID != "" {
		result = &models.InlineQueryResultCachedPhoto{
			ID: id, PhotoFileID: post.ImageFileID, Title: post.Title,
			Caption: post.HTML, ParseMode: models.ParseModeHTML, ReplyMarkup: markup,
		}
	} else if post.ImageURL != "" {
		result = &models.InlineQueryResultPhoto{
			ID: id, PhotoURL: post.ImageURL, ThumbnailURL: post.ImageURL, Title: post.Title,
			PhotoWidth: post.ImageWidth, PhotoHeight: post.ImageHeight,
			Caption: post.HTML, ParseMode: models.ParseModeHTML, ReplyMarkup: markup,
		}
	} else {
		result = &models.InlineQueryResultArticle{
			ID: id, Title: post.Title, ReplyMarkup: markup,
			InputMessageContent: &models.InputTextMessageContent{
				MessageText: post.HTML, ParseMode: models.ParseModeHTML,
				LinkPreviewOptions: &models.LinkPreviewOptions{IsDisabled: tgbot.True()},
			},
		}
	}
	msg, err := b.api.SavePreparedInlineMessage(ctx, &tgbot.SavePreparedInlineMessageParams{
		UserID: userID, Result: result,
		AllowUserChats: true, AllowBotChats: true, AllowGroupChats: true, AllowChannelChats: true,
	})
	if err != nil {
		return "", wrap(err)
	}
	return msg.ID, nil
}

func (b *Bot) CreateJoinRequestLink(ctx context.Context, chatID int64, name string) (string, error) {
	l, err := b.api.CreateChatInviteLink(ctx, &tgbot.CreateChatInviteLinkParams{
		ChatID: chatID, Name: name, CreatesJoinRequest: true,
	})
	if err != nil {
		return "", wrap(err)
	}
	return l.InviteLink, nil
}

func (b *Bot) ApproveJoinRequest(ctx context.Context, chatID, userID int64) error {
	_, err := b.api.ApproveChatJoinRequest(ctx, &tgbot.ApproveChatJoinRequestParams{ChatID: chatID, UserID: userID})
	return wrap(err)
}

func (b *Bot) DeclineJoinRequest(ctx context.Context, chatID, userID int64) error {
	_, err := b.api.DeclineChatJoinRequest(ctx, &tgbot.DeclineChatJoinRequestParams{ChatID: chatID, UserID: userID})
	return wrap(err)
}

func (b *Bot) Kick(ctx context.Context, chatID, userID int64) error {
	if _, err := b.api.BanChatMember(ctx, &tgbot.BanChatMemberParams{ChatID: chatID, UserID: userID}); err != nil {
		return wrap(err)
	}
	_, err := b.api.UnbanChatMember(ctx, &tgbot.UnbanChatMemberParams{ChatID: chatID, UserID: userID, OnlyIfBanned: true})
	return wrap(err)
}

// ---- обработка апдейтов ----

func (b *Bot) handle(ctx context.Context, _ *tgbot.Bot, u *models.Update) {
	switch {
	case u.MyChatMember != nil:
		b.onMyChatMember(ctx, u.MyChatMember)
	case u.ChatJoinRequest != nil:
		b.onJoinRequest(ctx, u.ChatJoinRequest)
	case u.Message != nil && u.Message.Chat.Type == models.ChatTypePrivate:
		b.onPrivateMessage(ctx, u.Message)
	}
}

// Бота добавили админом в канал / убрали из админов.
func (b *Bot) onMyChatMember(ctx context.Context, m *models.ChatMemberUpdated) {
	if m.Chat.Type == models.ChatTypePrivate {
		return
	}
	admin := m.NewChatMember.Administrator
	if admin == nil {
		if err := b.queries.SetChannelBotState(ctx, store.SetChannelBotStateParams{ChatID: m.Chat.ID, BotIssue: "removed"}); err != nil {
			b.log.Error("set bot state", "err", err, "chat_id", m.Chat.ID)
		}
		// Автор сам удалил канал из Pitly — бот вышел по его просьбе, предупреждать не о чем
		if ch, err := b.queries.GetChannelByChatID(ctx, m.Chat.ID); err == nil && ch.DeletedAt == nil {
			_ = b.SendMessage(ctx, ch.OwnerID, fmt.Sprintf("Бот больше не админ в «%s». Продажи остановлены, пока вы не вернёте его.", ch.Title),
				tg.Button{Text: "Открыть канал", URL: b.links().MiniApp(fmt.Sprintf("m%d", ch.ID))})
		}
		return
	}
	if !admin.CanInviteUsers || !admin.CanRestrictMembers {
		// Если канал уже подключён, продажи останавливаются, пока права не вернут
		if err := b.queries.SetChannelBotState(ctx, store.SetChannelBotStateParams{ChatID: m.Chat.ID, BotIssue: "no_rights"}); err != nil {
			b.log.Error("set bot state", "err", err, "chat_id", m.Chat.ID)
		}
		_ = b.SendMessage(ctx, m.From.ID, fmt.Sprintf(
			"Боту в «%s» не хватает прав. Включите «Добавление участников» и «Блокировка пользователей», иначе он не сможет пускать и удалять подписчиков.",
			m.Chat.Title))
		return
	}

	if err := b.queries.EnsureUser(ctx, store.EnsureUserParams{
		ID: m.From.ID, Username: optional(m.From.Username), FirstName: m.From.FirstName, LastName: m.From.LastName,
	}); err != nil {
		b.log.Error("ensure user", "err", err)
		return
	}
	ch, err := b.queries.UpsertChannel(ctx, store.UpsertChannelParams{
		OwnerID:  m.From.ID,
		ChatID:   m.Chat.ID,
		ChatType: string(m.Chat.Type),
		Title:    m.Chat.Title,
		Username: optional(m.Chat.Username),
	})
	if err != nil {
		b.log.Error("upsert channel", "err", err, "chat_id", m.Chat.ID)
		return
	}
	b.log.Info("channel connected", "channel_id", ch.ID, "chat_id", ch.ChatID, "owner_id", ch.OwnerID)
	_ = b.SendMessage(ctx, m.From.ID,
		fmt.Sprintf("🎉 Канал «%s» подключён. Создайте тариф в приложении и поделитесь ссылкой на оплату.", ch.Title),
		tg.Button{Text: "Настроить подписку", URL: b.links().MiniApp(fmt.Sprintf("m%d", ch.ID))})
}

// Заявка на вступление: одобряем только тех, у кого активная подписка.
func (b *Bot) onJoinRequest(ctx context.Context, r *models.ChatJoinRequest) {
	ch, err := b.queries.GetChannelByChatID(ctx, r.Chat.ID)
	if errors.Is(err, pgx.ErrNoRows) {
		return // канал не наш — решение за админами
	}
	if err != nil {
		b.log.Error("join request: get channel", "err", err)
		return
	}
	ok, err := b.queries.HasActiveSubscription(ctx, store.HasActiveSubscriptionParams{ChannelID: ch.ID, UserID: r.From.ID})
	if err != nil {
		b.log.Error("join request: check subscription", "err", err)
		return
	}
	if ok || r.From.ID == ch.OwnerID {
		if err := b.ApproveJoinRequest(ctx, r.Chat.ID, r.From.ID); err != nil {
			b.log.Error("approve join request", "err", err)
		}
		return
	}
	if err := b.DeclineJoinRequest(ctx, r.Chat.ID, r.From.ID); err != nil {
		b.log.Error("decline join request", "err", err)
	}
	_ = b.SendMessage(ctx, r.UserChatID,
		fmt.Sprintf("Доступ в «%s» — по подписке. Оформите её, и бот сразу впустит вас.", ch.Title),
		tg.Button{Text: "Оформить подписку", URL: b.links().Offer(ch.ID)})
}

func (b *Bot) onPrivateMessage(ctx context.Context, m *models.Message) {
	if m.From == nil || !strings.HasPrefix(m.Text, "/start") {
		return
	}
	// /start <параметр> приходит по ссылке из поста или после оплаты: отвечаем кнопкой, которая откроет нужный экран
	payload := strings.TrimSpace(strings.TrimPrefix(m.Text, "/start"))
	if len(payload) > 1 {
		kind, rest := payload[0], payload[1:]
		id, _ := strconv.ParseInt(rest, 10, 64)
		switch {
		case kind == 's' && id > 0:
			if pr, err := b.queries.GetProduct(ctx, id); err == nil {
				_ = b.SendMessage(ctx, m.Chat.ID, fmt.Sprintf("«%s»\n\nВыберите срок и оплатите картой или по СБП. Доступ в канал откроется сразу.", pr.Title),
					tg.Button{Text: pr.ButtonText, URL: b.links().Product(pr.ID)})
				return
			}
		case kind == 'c' && id > 0:
			if ch, err := b.queries.GetChannel(ctx, id); err == nil {
				_ = b.SendMessage(ctx, m.Chat.ID, fmt.Sprintf("Подписка на «%s»\n\nВыберите срок и оплатите картой или по СБП. Доступ в канал откроется сразу.", ch.Title),
					tg.Button{Text: "Оформить подписку", URL: b.links().Offer(ch.ID)})
				return
			}
		case kind == 'p':
			_ = b.SendMessage(ctx, m.Chat.ID, "Проверяем оплату. Откройте приложение, там будет ссылка в канал.",
				tg.Button{Text: "Открыть", URL: b.links().Payment(rest)})
			return
		case kind == 'm' && id > 0:
			_ = b.SendMessage(ctx, m.Chat.ID, "Канал подключён. Осталось создать подписку.",
				tg.Button{Text: "Открыть канал", URL: b.links().MiniApp(payload)})
			return
		}
	}
	_ = b.SendMessage(ctx, m.Chat.ID,
		"Pitly — платные подписки на Telegram-каналы.\n\n"+
			"• Авторам: подключите канал, задайте цену и получайте деньги на карту, по СБП или в крипте.\n"+
			"• Подписчикам: оплата картой или по СБП, доступ выдаётся автоматически.",
		tg.Button{Text: "Открыть Pitly", URL: b.links().MiniApp("")})
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
