// Package billing — деньги: создание платежа, зачисление, холд, выводы.
// Каждая операция с балансом — одна транзакция PostgreSQL, фоновые задачи
// ставятся в очередь в той же транзакции.
package billing

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"
	"unicode"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"pitly/internal/apperr"
	"pitly/internal/config"
	"pitly/internal/money"
	"pitly/internal/payments"
	"pitly/internal/store"
	"pitly/internal/tasks"
	"pitly/internal/tg"
)

type JobInserter interface {
	InsertTx(ctx context.Context, tx pgx.Tx, args river.JobArgs, opts *river.InsertOpts) (*rivertype.JobInsertResult, error)
}

type Service struct {
	Pool     *pgxpool.Pool
	Queries  *store.Queries
	Provider payments.Provider
	Jobs     JobInserter
	Links    tg.Links
	Cfg      config.Config
	Log      *slog.Logger
}

// Ledger accounts / kinds — должны совпадать с CHECK в миграции.
const (
	accPending   = "creator_pending"
	accAvailable = "creator_available"
	accPayout    = "creator_payout"
	accFee       = "platform_fee"
)

func (s *Service) CommissionBps(u store.User) int {
	if u.CommissionBps != nil {
		return int(*u.CommissionBps)
	}
	return s.Cfg.CommissionBps
}

func (s *Service) SupportsMethod(m payments.Method) bool {
	for _, x := range s.Provider.Methods() {
		if x == m {
			return true
		}
	}
	return false
}

// Checkout создаёт платёж и ссылку на страницу оплаты провайдера.
func (s *Service) Checkout(ctx context.Context, userID, planID int64, method payments.Method) (store.Payment, error) {
	if !s.SupportsMethod(method) {
		return store.Payment{}, apperr.Validation("Способ оплаты недоступен")
	}
	plan, err := s.Queries.GetPlan(ctx, planID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && !plan.IsActive) {
		return store.Payment{}, apperr.NotFound("Тариф")
	}
	if err != nil {
		return store.Payment{}, err
	}
	product, err := s.Queries.GetProduct(ctx, plan.ProductID)
	if err != nil {
		return store.Payment{}, err
	}
	if !product.IsActive {
		return store.Payment{}, apperr.NotFound("Подписка")
	}
	// Пустой список у подписки означает «любой способ, который умеет провайдер».
	if len(product.PaymentMethods) > 0 && !slices.Contains(product.PaymentMethods, string(method)) {
		return store.Payment{}, apperr.Validation("Эту подписку нельзя оплатить таким способом")
	}
	channel, err := s.Queries.GetChannel(ctx, plan.ChannelID)
	if err != nil {
		return store.Payment{}, err
	}
	if !channel.BotIsAdmin {
		return store.Payment{}, apperr.Conflict("channel_unavailable", "Канал временно не принимает оплату")
	}
	if channel.OwnerID == userID {
		return store.Payment{}, apperr.Conflict("own_channel", "Это ваш канал: купить подписку у себя нельзя")
	}
	creator, err := s.Queries.GetUser(ctx, channel.OwnerID)
	if err != nil {
		return store.Payment{}, err
	}
	if creator.IsBlocked {
		return store.Payment{}, apperr.Conflict("channel_unavailable", "Канал временно не принимает оплату")
	}

	fee, net := money.Split(plan.Price, s.CommissionBps(creator))
	p, err := s.Queries.CreatePayment(ctx, store.CreatePaymentParams{
		ID:        uuid.New(),
		UserID:    userID,
		CreatorID: channel.OwnerID,
		ChannelID: channel.ID,
		PlanID:    plan.ID,
		Amount:    plan.Price,
		Fee:       fee,
		Net:       net,
		Currency:  plan.Currency,
		Method:    string(method),
		Provider:  s.Provider.Name(),
	})
	if err != nil {
		return store.Payment{}, err
	}

	res, err := s.Provider.Create(ctx, payments.CreateRequest{
		PaymentID:   p.ID,
		Amount:      p.Amount,
		Currency:    p.Currency,
		Method:      method,
		Description: fmt.Sprintf("%s — %s, %s", channel.Title, product.Title, plan.Title),
		ReturnURL:   s.Links.Payment(p.ID.String()),
	})
	if err != nil {
		_ = s.Queries.MarkPaymentFailed(ctx, p.ID)
		s.Log.Error("provider create payment", "err", err, "payment_id", p.ID)
		return store.Payment{}, apperr.New(http.StatusBadGateway, "provider_error", "Платёжная система недоступна, попробуйте позже")
	}
	if err := s.Queries.SetPaymentProviderData(ctx, store.SetPaymentProviderDataParams{
		ID: p.ID, ProviderPaymentID: &res.ProviderPaymentID, PaymentUrl: &res.PaymentURL,
	}); err != nil {
		return store.Payment{}, err
	}
	p.ProviderPaymentID, p.PaymentUrl = &res.ProviderPaymentID, &res.PaymentURL
	return p, nil
}

// HandleEvent применяет уведомление провайдера. Идемпотентен: повторный вебхук ничего не меняет.
func (s *Service) HandleEvent(ctx context.Context, ev payments.Event) error {
	if ev.Status == payments.EventFailed {
		return s.Queries.MarkPaymentFailed(ctx, ev.PaymentID)
	}
	return pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		q := s.Queries.WithTx(tx)
		p, err := q.MarkPaymentSucceeded(ctx, ev.PaymentID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil // уже обработан или не pending
		}
		if err != nil {
			return err
		}

		if err := q.InsertLedgerEntry(ctx, store.InsertLedgerEntryParams{
			Account: accPending, CreatorID: &p.CreatorID, Amount: p.Net, Currency: p.Currency, PaymentID: &p.ID, Kind: "payment",
		}); err != nil {
			return err
		}
		if p.Fee > 0 {
			if err := q.InsertLedgerEntry(ctx, store.InsertLedgerEntryParams{
				Account: accFee, Amount: p.Fee, Currency: p.Currency, PaymentID: &p.ID, Kind: "payment",
			}); err != nil {
				return err
			}
		}

		plan, err := q.GetPlan(ctx, p.PlanID)
		if err != nil {
			return err
		}
		var period *int32
		if plan.PeriodDays > 0 {
			period = &plan.PeriodDays
		}
		sub, err := q.ActivateSubscription(ctx, store.ActivateSubscriptionParams{
			ChannelID: p.ChannelID, UserID: p.UserID, PlanID: p.PlanID, PeriodDays: period,
		})
		if err != nil {
			return err
		}

		if _, err := s.Jobs.InsertTx(ctx, tx, tasks.GrantAccess{SubscriptionID: sub.ID, PaymentID: p.ID}, nil); err != nil {
			return err
		}
		_, err = s.Jobs.InsertTx(ctx, tx, tasks.ReleaseHold{PaymentID: p.ID}, &river.InsertOpts{
			ScheduledAt: time.Now().Add(s.Cfg.Hold()),
		})
		return err
	})
}

// ReleaseHold переводит деньги платежа из холда в доступные. Идемпотентен.
func (s *Service) ReleaseHold(ctx context.Context, paymentID uuid.UUID) error {
	return pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		q := s.Queries.WithTx(tx)
		p, err := q.GetPaymentForUpdate(ctx, paymentID)
		if err != nil {
			return err
		}
		if p.Status != "succeeded" {
			return nil // возврат/чарджбэк — холд не освобождаем
		}
		if err := q.LockCreatorLedger(ctx, p.CreatorID); err != nil {
			return err
		}
		done, err := q.HoldReleased(ctx, &p.ID)
		if err != nil || done {
			return err
		}
		for _, e := range []store.InsertLedgerEntryParams{
			{Account: accPending, CreatorID: &p.CreatorID, Amount: -p.Net, Currency: p.Currency, PaymentID: &p.ID, Kind: "hold_release"},
			{Account: accAvailable, CreatorID: &p.CreatorID, Amount: p.Net, Currency: p.Currency, PaymentID: &p.ID, Kind: "hold_release"},
		} {
			if err := q.InsertLedgerEntry(ctx, e); err != nil {
				return err
			}
		}
		return nil
	})
}

// RequestPayout списывает сумму с доступного баланса и создаёт заявку на вывод.
// Саму отправку денег делает оператор (позже — автоматически через API провайдера).
func (s *Service) RequestPayout(ctx context.Context, creatorID, amount int64, method, destination string) (store.Payout, error) {
	destination = strings.TrimSpace(destination)
	if err := validateDestination(method, destination); err != nil {
		return store.Payout{}, err
	}
	if amount < s.Cfg.MinPayout {
		return store.Payout{}, apperr.Validation("Минимальная сумма вывода — %s", money.Format(s.Cfg.MinPayout, s.Cfg.Currency))
	}

	var out store.Payout
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		q := s.Queries.WithTx(tx)
		if err := q.LockCreatorLedger(ctx, creatorID); err != nil {
			return err
		}
		bal, err := q.CreatorBalances(ctx, store.CreatorBalancesParams{CreatorID: &creatorID, Currency: s.Cfg.Currency})
		if err != nil {
			return err
		}
		if amount > bal.Available {
			return apperr.Validation("Недостаточно средств: доступно %s", money.Format(bal.Available, s.Cfg.Currency))
		}
		out, err = q.CreatePayout(ctx, store.CreatePayoutParams{
			CreatorID: creatorID, Amount: amount, Currency: s.Cfg.Currency, Method: method, Destination: destination,
		})
		if err != nil {
			return err
		}
		for _, e := range []store.InsertLedgerEntryParams{
			{Account: accAvailable, CreatorID: &creatorID, Amount: -amount, Currency: s.Cfg.Currency, PayoutID: &out.ID, Kind: "payout"},
			{Account: accPayout, CreatorID: &creatorID, Amount: amount, Currency: s.Cfg.Currency, PayoutID: &out.ID, Kind: "payout"},
		} {
			if err := q.InsertLedgerEntry(ctx, e); err != nil {
				return err
			}
		}
		return nil
	})
	return out, err
}

func validateDestination(method, dest string) error {
	digits := strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, dest)
	switch method {
	case "card":
		if len(digits) < 16 || len(digits) > 19 {
			return apperr.Validation("Введите номер карты")
		}
	case "sbp":
		if len(digits) != 11 {
			return apperr.Validation("Введите телефон в формате +7XXXXXXXXXX")
		}
	case "usdt_ton":
		if len(dest) < 48 {
			return apperr.Validation("Введите адрес кошелька TON")
		}
	default:
		return apperr.Validation("Неизвестный способ вывода")
	}
	return nil
}

// MaskDestination скрывает реквизиты: "2200 **** **** 1234".
func MaskDestination(method, dest string) string {
	if len(dest) <= 8 {
		return dest
	}
	if method == "usdt_ton" {
		return dest[:4] + "…" + dest[len(dest)-4:]
	}
	return "•••• " + dest[len(dest)-4:]
}
