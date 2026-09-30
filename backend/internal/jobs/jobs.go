// Package jobs — воркеры River: выдача/отзыв доступа, холд, истечение подписок.
package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"

	"pitly/internal/billing"
	"pitly/internal/money"
	"pitly/internal/store"
	"pitly/internal/tasks"
	"pitly/internal/tg"
)

type Deps struct {
	Queries *store.Queries
	Billing *billing.Service
	TG      tg.Client
	Links   tg.Links
	Log     *slog.Logger
}

func Register(workers *river.Workers, d *Deps) {
	river.AddWorker(workers, &grantAccess{d: d})
	river.AddWorker(workers, &releaseHold{d: d})
	river.AddWorker(workers, &expireSubscriptions{d: d})
	river.AddWorker(workers, &revokeAccess{d: d})
}

func PeriodicJobs() []*river.PeriodicJob {
	return []*river.PeriodicJob{
		river.NewPeriodicJob(
			river.PeriodicInterval(time.Minute),
			func() (river.JobArgs, *river.InsertOpts) { return tasks.ExpireSubscriptions{}, nil },
			&river.PeriodicJobOpts{RunOnStart: true},
		),
	}
}

// EnsureInviteLink возвращает ссылку-заявку канала, создавая её при первом обращении.
func EnsureInviteLink(ctx context.Context, d *Deps, ch store.Channel) (string, error) {
	if ch.InviteLink != nil && *ch.InviteLink != "" {
		return *ch.InviteLink, nil
	}
	link, err := d.TG.CreateJoinRequestLink(ctx, ch.ChatID, "Pitly")
	if err != nil {
		return "", fmt.Errorf("create invite link: %w", err)
	}
	if err := d.Queries.SetChannelInviteLink(ctx, store.SetChannelInviteLinkParams{ID: ch.ID, InviteLink: &link}); err != nil {
		return "", err
	}
	return link, nil
}

type grantAccess struct {
	river.WorkerDefaults[tasks.GrantAccess]
	d *Deps
}

func (w *grantAccess) Work(ctx context.Context, job *river.Job[tasks.GrantAccess]) error {
	sub, err := w.d.Queries.GetSubscriptionByID(ctx, job.Args.SubscriptionID)
	if err != nil {
		return err
	}
	ch, err := w.d.Queries.GetChannel(ctx, sub.ChannelID)
	if err != nil {
		return err
	}
	link, err := EnsureInviteLink(ctx, w.d, ch)
	if err != nil {
		return cancelIfPermanent(err)
	}
	p, err := w.d.Queries.GetPayment(ctx, job.Args.PaymentID)
	if err != nil {
		return err
	}

	until := "бессрочно"
	if sub.ExpiresAt != nil {
		until = "до " + sub.ExpiresAt.In(moscow).Format("02.01.2006")
	}
	text := fmt.Sprintf("✅ Оплата %s прошла.\nДоступ к «%s» — %s.\n\nНажмите кнопку и подайте заявку — бот одобрит её автоматически.",
		money.Format(p.Amount, p.Currency), ch.Title, until)
	// Пользователь мог не запускать бота — тогда ссылку он увидит в mini app. Не ретраим.
	if err := w.d.TG.SendMessage(ctx, sub.UserID, text, tg.Button{Text: "Вступить в канал", URL: link}); err != nil {
		w.d.Log.Warn("notify subscriber", "err", err, "user_id", sub.UserID)
	}

	owner := fmt.Sprintf("💸 Новая оплата в «%s»: %s\nВам зачислено %s (станет доступно к выводу после холда).",
		ch.Title, money.Format(p.Amount, p.Currency), money.Format(p.Net, p.Currency))
	if err := w.d.TG.SendMessage(ctx, ch.OwnerID, owner, tg.Button{Text: "Открыть Pitly", URL: w.d.Links.MiniApp("")}); err != nil {
		w.d.Log.Warn("notify owner", "err", err, "user_id", ch.OwnerID)
	}
	return nil
}

type releaseHold struct {
	river.WorkerDefaults[tasks.ReleaseHold]
	d *Deps
}

func (w *releaseHold) Work(ctx context.Context, job *river.Job[tasks.ReleaseHold]) error {
	return w.d.Billing.ReleaseHold(ctx, job.Args.PaymentID)
}

type expireSubscriptions struct {
	river.WorkerDefaults[tasks.ExpireSubscriptions]
	d *Deps
}

func (w *expireSubscriptions) Work(ctx context.Context, _ *river.Job[tasks.ExpireSubscriptions]) error {
	client := river.ClientFromContext[pgx.Tx](ctx)
	for {
		var n int
		err := pgx.BeginFunc(ctx, w.d.Billing.Pool, func(tx pgx.Tx) error {
			subs, err := w.d.Queries.WithTx(tx).ExpireDueSubscriptions(ctx, 100)
			if err != nil {
				return err
			}
			n = len(subs)
			for _, s := range subs {
				if _, err := client.InsertTx(ctx, tx, tasks.RevokeAccess{SubscriptionID: s.ID}, nil); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
		if n < 100 {
			return nil
		}
	}
}

type revokeAccess struct {
	river.WorkerDefaults[tasks.RevokeAccess]
	d *Deps
}

func (w *revokeAccess) Work(ctx context.Context, job *river.Job[tasks.RevokeAccess]) error {
	sub, err := w.d.Queries.GetSubscriptionByID(ctx, job.Args.SubscriptionID)
	if err != nil {
		return err
	}
	if sub.Status == "active" {
		return nil // успел продлить, пока задача ждала
	}
	ch, err := w.d.Queries.GetChannel(ctx, sub.ChannelID)
	if err != nil {
		return err
	}
	if sub.UserID == ch.OwnerID {
		return nil
	}
	if err := w.d.TG.Kick(ctx, ch.ChatID, sub.UserID); err != nil {
		return cancelIfPermanent(err)
	}
	text := fmt.Sprintf("Подписка на «%s» закончилась. Продлите её, чтобы вернуть доступ.", ch.Title)
	if err := w.d.TG.SendMessage(ctx, sub.UserID, text, tg.Button{Text: "Продлить", URL: w.d.Links.Offer(ch.ID)}); err != nil {
		w.d.Log.Warn("notify expired", "err", err, "user_id", sub.UserID)
	}
	return nil
}

// cancelIfPermanent останавливает ретраи, если Telegram отказал окончательно.
func cancelIfPermanent(err error) error {
	if errors.Is(err, tg.ErrPermanent) {
		return river.JobCancel(err)
	}
	return err
}

var moscow = func() *time.Location {
	loc, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		return time.FixedZone("MSK", 3*3600)
	}
	return loc
}()
