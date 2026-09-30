// Package tasks — аргументы фоновых задач River. Отдельный пакет, чтобы
// ставить задачи можно было из любого места без циклических импортов.
package tasks

import (
	"time"

	"github.com/google/uuid"
	"github.com/riverqueue/river"
)

// GrantAccess — после оплаты: убедиться, что у канала есть ссылка-заявка, и отправить её подписчику.
type GrantAccess struct {
	SubscriptionID int64     `json:"subscription_id"`
	PaymentID      uuid.UUID `json:"payment_id"`
}

func (GrantAccess) Kind() string { return "grant_access" }

// ReleaseHold — перевести деньги платежа из холда в доступные к выводу.
type ReleaseHold struct {
	PaymentID uuid.UUID `json:"payment_id"`
}

func (ReleaseHold) Kind() string { return "release_hold" }

// ExpireSubscriptions — периодическая задача: найти истёкшие подписки.
type ExpireSubscriptions struct{}

func (ExpireSubscriptions) Kind() string { return "expire_subscriptions" }

// Не больше одной такой задачи в минуту, даже если запущено несколько инстансов.
func (ExpireSubscriptions) InsertOpts() river.InsertOpts {
	return river.InsertOpts{UniqueOpts: river.UniqueOpts{ByPeriod: time.Minute}}
}

// RevokeAccess — удалить подписчика из канала после окончания подписки.
type RevokeAccess struct {
	SubscriptionID int64 `json:"subscription_id"`
}

func (RevokeAccess) Kind() string { return "revoke_access" }
