// Package payments — абстракция платёжного провайдера (карта, СБП).
// Реальный провайдер (ЮKassa, Т-Банк, CloudPayments...) реализует Provider,
// остальной код о нём ничего не знает.
package payments

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
)

type Method string

const (
	MethodCard Method = "card"
	MethodSBP  Method = "sbp"
)

type CreateRequest struct {
	PaymentID   uuid.UUID
	Amount      int64
	Currency    string
	Method      Method
	Description string
	// Куда вернуть пользователя после оплаты (ссылка на mini app).
	ReturnURL string
}

type CreateResult struct {
	ProviderPaymentID string
	// Страница оплаты провайдера. Mini app открывает её через openLink.
	PaymentURL string
}

type EventStatus string

const (
	EventSucceeded EventStatus = "succeeded"
	EventFailed    EventStatus = "failed"
)

// Event — нормализованное уведомление от провайдера.
type Event struct {
	PaymentID uuid.UUID
	Status    EventStatus
}

var ErrIgnoreEvent = errors.New("event is not relevant")

type Provider interface {
	Name() string
	Methods() []Method
	Create(ctx context.Context, req CreateRequest) (CreateResult, error)
	// ParseWebhook проверяет подпись уведомления и приводит его к Event.
	// Для событий, которые нас не интересуют, возвращает ErrIgnoreEvent.
	ParseWebhook(r *http.Request) (Event, error)
}
