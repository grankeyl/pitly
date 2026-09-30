package payments

import (
	"context"
	"fmt"
	"html/template"
	"net/http"
	"net/url"

	"github.com/google/uuid"
)

// Fake — тестовый провайдер для разработки. Показывает страницу с кнопками
// «Оплатить» / «Отклонить» и шлёт на наш же вебхук. Реальных денег нет.
// В ENV != dev запрещён конфигом.
type Fake struct {
	PublicURL string
}

func (f *Fake) Name() string      { return "fake" }
func (f *Fake) Methods() []Method { return []Method{MethodCard, MethodSBP} }

func (f *Fake) Create(_ context.Context, req CreateRequest) (CreateResult, error) {
	q := url.Values{}
	q.Set("amount", fmt.Sprint(req.Amount))
	q.Set("currency", req.Currency)
	q.Set("method", string(req.Method))
	q.Set("desc", req.Description)
	q.Set("return", req.ReturnURL)
	return CreateResult{
		ProviderPaymentID: "fake_" + req.PaymentID.String(),
		PaymentURL:        fmt.Sprintf("%s/dev/pay/%s?%s", f.PublicURL, req.PaymentID, q.Encode()),
	}, nil
}

func (f *Fake) ParseWebhook(r *http.Request) (Event, error) {
	if err := r.ParseForm(); err != nil {
		return Event{}, err
	}
	id, err := uuid.Parse(r.PostForm.Get("payment_id"))
	if err != nil {
		return Event{}, fmt.Errorf("bad payment_id: %w", err)
	}
	switch EventStatus(r.PostForm.Get("status")) {
	case EventSucceeded:
		return Event{PaymentID: id, Status: EventSucceeded}, nil
	case EventFailed:
		return Event{PaymentID: id, Status: EventFailed}, nil
	default:
		return Event{}, ErrIgnoreEvent
	}
}

var fakePage = template.Must(template.New("pay").Parse(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Тестовая оплата</title>
<style>
body{font-family:system-ui,sans-serif;background:#0f1115;color:#f2f3f5;margin:0;display:grid;place-items:center;min-height:100vh}
.card{background:#1a1d24;border-radius:20px;padding:28px;width:min(360px,calc(100% - 32px));box-sizing:border-box}
h1{font-size:15px;font-weight:500;color:#9aa0ab;margin:0 0 8px}
.sum{font-size:34px;font-weight:700;margin:0 0 4px}
.desc{color:#9aa0ab;margin:0 0 24px}
.badge{display:inline-block;background:#f5a524;color:#111;border-radius:8px;padding:2px 8px;font-size:12px;font-weight:600;margin-bottom:16px}
button{width:100%;border:0;border-radius:14px;padding:15px;font-size:16px;font-weight:600;cursor:pointer;margin-top:10px}
.ok{background:#5b8cff;color:#fff}.no{background:#2a2e37;color:#f2f3f5}
</style></head><body><div class="card">
<span class="badge">ТЕСТОВЫЙ РЕЖИМ</span>
<h1>{{.Method}}</h1>
<p class="sum">{{.Amount}}</p>
<p class="desc">{{.Desc}}</p>
<form method="post" action="/webhooks/payments/fake">
<input type="hidden" name="payment_id" value="{{.ID}}"><input type="hidden" name="return" value="{{.Return}}">
<button class="ok" name="status" value="succeeded">Оплатить</button>
<button class="no" name="status" value="failed">Отклонить</button>
</form></div></body></html>`))

var fakeDone = template.Must(template.New("done").Parse(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Готово</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1115;color:#f2f3f5;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}
a{display:inline-block;margin-top:20px;background:#5b8cff;color:#fff;text-decoration:none;border-radius:14px;padding:14px 22px;font-weight:600}</style>
</head><body><div><h2>{{.Title}}</h2><p>Можно вернуться в Telegram.</p>{{if .Return}}<a href="{{.Return}}">Вернуться</a>{{end}}</div></body></html>`))

// PageHandler отдаёт страницу тестовой оплаты: GET /dev/pay/{id}.
func (f *Fake) PageHandler(w http.ResponseWriter, r *http.Request, id string) {
	q := r.URL.Query()
	var amount int64
	fmt.Sscan(q.Get("amount"), &amount)
	method := "Банковская карта"
	if q.Get("method") == string(MethodSBP) {
		method = "СБП"
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = fakePage.Execute(w, map[string]string{
		"ID":     id,
		"Amount": fmt.Sprintf("%d,%02d %s", amount/100, amount%100, q.Get("currency")),
		"Method": method,
		"Desc":   q.Get("desc"),
		"Return": q.Get("return"),
	})
}

// DoneHandler — что увидит пользователь после отправки формы.
func (f *Fake) DoneHandler(w http.ResponseWriter, r *http.Request, ev Event) {
	title := "Оплата прошла"
	if ev.Status == EventFailed {
		title = "Оплата отклонена"
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = fakeDone.Execute(w, map[string]string{"Title": title, "Return": r.PostForm.Get("return")})
}
