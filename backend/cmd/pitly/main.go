// Один бинарник: HTTP API + Telegram-бот + фоновые воркеры.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	tgbot "github.com/go-telegram/bot"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"

	"pitly/db"
	"pitly/internal/api"
	"pitly/internal/auth"
	"pitly/internal/billing"
	"pitly/internal/bot"
	"pitly/internal/config"
	"pitly/internal/httpapi"
	"pitly/internal/jobs"
	"pitly/internal/payments"
	"pitly/internal/store"
	"pitly/internal/tg"
)

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	if err := run(log); err != nil {
		log.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := migrate(ctx, pool); err != nil {
		return err
	}
	queries := store.New(pool)

	// Telegram: реальный бот или заглушка, если токена нет.
	var (
		tgClient tg.Client = tg.Noop{Log: log}
		tgBot    *bot.Bot
	)
	if cfg.BotToken != "" {
		tgBot, err = bot.New(ctx, cfg.BotToken, cfg.BotWebhookSecret, queries, log)
		if err != nil {
			return err
		}
		tgClient = tgBot
	} else {
		log.Warn("BOT_TOKEN is empty: bot disabled, Telegram calls are logged only")
	}
	links := tg.Links{BotUsername: tgClient.Username(), ShortName: cfg.MiniAppShortName}
	if tgBot != nil {
		links.ViaChat = !tgBot.HasMainApp()
		tgBot.SetLinks(links)
		tgBot.SetAppURL(cfg.PublicURL)
	}

	provider, fake, err := newProvider(cfg)
	if err != nil {
		return err
	}
	billingSvc := &billing.Service{Pool: pool, Queries: queries, Provider: provider, Links: links, Cfg: cfg, Log: log}
	deps := &jobs.Deps{Queries: queries, Billing: billingSvc, TG: tgClient, Links: links, Log: log}

	workers := river.NewWorkers()
	jobs.Register(workers, deps)
	riverClient, err := river.NewClient(riverpgxv5.New(pool), &river.Config{
		Queues:       map[string]river.QueueConfig{river.QueueDefault: {MaxWorkers: 20}},
		Workers:      workers,
		PeriodicJobs: jobs.PeriodicJobs(),
		Logger:       log,
	})
	if err != nil {
		return err
	}
	billingSvc.Jobs = riverClient

	// ---- HTTP ----
	r := chi.NewRouter()
	r.Use(middleware.Recoverer, middleware.Timeout(30*time.Second))
	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })

	authMW := &auth.Middleware{BotToken: cfg.BotToken, TTL: cfg.InitDataTTL, DevBypass: cfg.IsDev(), Queries: queries, Log: log}
	srv := &httpapi.Server{Queries: queries, Billing: billingSvc, Jobs: deps, Links: links, Cfg: cfg, Log: log}
	strict := api.NewStrictHandlerWithOptions(srv, nil, api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  httpapi.RequestErrorHandler,
		ResponseErrorHandlerFunc: httpapi.ErrorHandler(log),
	})
	r.Group(func(r chi.Router) {
		r.Use(authMW.Handler)
		// Загрузка картинки идёт сырым телом запроса, поэтому вне сгенерированного API.
		r.Post("/api/images", srv.UploadImage)
		api.HandlerWithOptions(strict, api.ChiServerOptions{BaseURL: "/api", BaseRouter: r})
	})
	// Картинки открывает <img> без заголовков авторизации.
	r.Get("/img/{id}", srv.ServeImage)

	r.Post("/webhooks/payments/{provider}", func(w http.ResponseWriter, req *http.Request) {
		if chi.URLParam(req, "provider") != provider.Name() {
			http.NotFound(w, req)
			return
		}
		ev, err := provider.ParseWebhook(req)
		if errors.Is(err, payments.ErrIgnoreEvent) {
			w.WriteHeader(http.StatusOK)
			return
		}
		if err != nil {
			log.Warn("bad payment webhook", "err", err)
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if err := billingSvc.HandleEvent(req.Context(), ev); err != nil {
			log.Error("handle payment event", "err", err, "payment_id", ev.PaymentID)
			// 5xx — провайдер повторит уведомление.
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		if fake != nil {
			fake.DoneHandler(w, req, ev)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	if fake != nil {
		r.Get("/dev/pay/{id}", func(w http.ResponseWriter, req *http.Request) {
			fake.PageHandler(w, req, chi.URLParam(req, "id"))
		})
	}

	if tgBot != nil && cfg.BotWebhookSecret != "" {
		r.Post("/bot/webhook", tgBot.API().WebhookHandler())
	}
	if cfg.StaticDir != "" {
		r.Handle("/*", spaHandler(cfg.StaticDir))
	}

	// ---- запуск ----
	if err := riverClient.Start(ctx); err != nil {
		return err
	}
	if tgBot != nil {
		if err := tgBot.SetMenuButton(ctx, cfg.PublicURL); err != nil {
			log.Warn("set menu button", "err", err)
		}
		if cfg.BotWebhookSecret != "" {
			if _, err := tgBot.API().SetWebhook(ctx, botWebhookParams(cfg)); err != nil {
				return err
			}
			go tgBot.API().StartWebhook(ctx)
		} else {
			if _, err := tgBot.API().DeleteWebhook(ctx, nil); err != nil {
				log.Warn("delete webhook", "err", err)
			}
			go tgBot.API().Start(ctx) // long polling
		}
		log.Info("bot started", "username", tgBot.Username())
	}

	httpSrv := &http.Server{Addr: cfg.HTTPAddr, Handler: r, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		log.Info("http listening", "addr", cfg.HTTPAddr, "public_url", cfg.PublicURL, "env", cfg.Env)
		if err := httpSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http server", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = httpSrv.Shutdown(shutdownCtx)
	_ = riverClient.Stop(shutdownCtx)
	return nil
}

func migrate(ctx context.Context, pool *pgxpool.Pool) error {
	sqlDB := stdlib.OpenDBFromPool(pool)
	defer sqlDB.Close()
	goose.SetBaseFS(db.Migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	if err := goose.UpContext(ctx, sqlDB, "migrations"); err != nil {
		return err
	}
	migrator, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return err
	}
	_, err = migrator.Migrate(ctx, rivermigrate.DirectionUp, nil)
	return err
}

func newProvider(cfg config.Config) (payments.Provider, *payments.Fake, error) {
	switch cfg.PaymentProvider {
	case "fake":
		f := &payments.Fake{PublicURL: cfg.PublicURL}
		return f, f, nil
	default:
		return nil, nil, errors.New("unknown PAYMENT_PROVIDER: " + cfg.PaymentProvider)
	}
}

// spaHandler отдаёт статику mini app, а на неизвестные пути — index.html.
func spaHandler(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := filepath.Join(dir, filepath.Clean("/"+r.URL.Path))
		if st, err := os.Stat(p); err != nil || st.IsDir() {
			if !strings.HasPrefix(r.URL.Path, "/assets/") {
				w.Header().Set("Cache-Control", "no-cache")
				http.ServeFile(w, r, filepath.Join(dir, "index.html"))
				return
			}
		}
		fs.ServeHTTP(w, r)
	})
}

func botWebhookParams(cfg config.Config) *tgbot.SetWebhookParams {
	return &tgbot.SetWebhookParams{
		URL:            cfg.PublicURL + "/bot/webhook",
		SecretToken:    cfg.BotWebhookSecret,
		AllowedUpdates: []string{"message", "my_chat_member", "chat_join_request"},
	}
}
