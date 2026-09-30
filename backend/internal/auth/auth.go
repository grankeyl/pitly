// Package auth проверяет initData Telegram Mini App и кладёт пользователя в контекст.
package auth

import (
	"context"
	"encoding/json"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	initdata "github.com/telegram-mini-apps/init-data-golang"

	"pitly/internal/store"
)

type ctxKey struct{}

// User — авторизованный пользователь запроса.
type User struct {
	ID         int64
	StartParam string
}

func FromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(ctxKey{}).(User)
	return u, ok
}

func WithUser(ctx context.Context, u User) context.Context {
	return context.WithValue(ctx, ctxKey{}, u)
}

type Middleware struct {
	BotToken string
	TTL      time.Duration
	// DevBypass разрешает заголовок `Authorization: dev <userID>` — только для ENV=dev,
	// чтобы открывать mini app в обычном браузере.
	DevBypass bool
	Queries   *store.Queries
	Log       *slog.Logger
}

// isLocal — запрос пришёл с этой же машины и не через туннель или прокси.
// Вход `dev <id>` нужен только для вёрстки в браузере; снаружи он дал бы войти под любым пользователем.
func isLocal(r *http.Request) bool {
	for _, h := range []string{"Cf-Connecting-Ip", "Cf-Ray", "X-Forwarded-For", "X-Real-Ip", "Forwarded"} {
		if r.Header.Get(h) != "" {
			return false
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func (m *Middleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		scheme, value, _ := strings.Cut(r.Header.Get("Authorization"), " ")

		var (
			user store.UpsertUserParams
			sp   string
		)
		switch {
		case scheme == "tma" && m.BotToken != "":
			if err := initdata.Validate(value, m.BotToken, m.TTL); err != nil {
				writeErr(w, "Неверные данные авторизации Telegram")
				return
			}
			data, err := initdata.Parse(value)
			if err != nil || data.User.ID == 0 {
				writeErr(w, "Не удалось прочитать данные пользователя")
				return
			}
			u := data.User
			user = store.UpsertUserParams{
				ID:           u.ID,
				Username:     optional(u.Username),
				FirstName:    u.FirstName,
				LastName:     u.LastName,
				PhotoUrl:     optional(u.PhotoURL),
				LanguageCode: optional(u.LanguageCode),
			}
			sp = data.StartParam
		case scheme == "dev" && m.DevBypass && isLocal(r):
			id, err := strconv.ParseInt(value, 10, 64)
			if err != nil || id <= 0 {
				writeErr(w, "dev: ожидается числовой user id")
				return
			}
			user = store.UpsertUserParams{ID: id, FirstName: "Dev", LastName: strconv.FormatInt(id, 10)}
		default:
			writeErr(w, "Откройте приложение из Telegram")
			return
		}

		dbUser, err := m.Queries.UpsertUser(r.Context(), user)
		if err != nil {
			m.Log.Error("upsert user", "err", err)
			http.Error(w, `{"code":"internal","message":"Внутренняя ошибка"}`, http.StatusInternalServerError)
			return
		}
		if dbUser.IsBlocked {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"code": "blocked", "message": "Аккаунт заблокирован"})
			return
		}
		next.ServeHTTP(w, r.WithContext(WithUser(r.Context(), User{ID: dbUser.ID, StartParam: sp})))
	})
}

func writeErr(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.NewEncoder(w).Encode(map[string]string{"code": "unauthorized", "message": msg})
}

func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
