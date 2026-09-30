package config

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	Env         string `env:"ENV" envDefault:"dev"`
	HTTPAddr    string `env:"HTTP_ADDR" envDefault:":8080"`
	DatabaseURL string `env:"DATABASE_URL,required"`
	// Публичный HTTPS-адрес сервера. Нужен для вебхуков и страницы тестовой оплаты.
	PublicURL string `env:"PUBLIC_URL" envDefault:"http://localhost:8080"`
	// Папка со сборкой mini app. Если пусто — статика не раздаётся (в dev её отдаёт Vite).
	StaticDir string `env:"STATIC_DIR"`

	// Без токена сервер стартует, но бот не работает (удобно для вёрстки в браузере).
	BotToken string `env:"BOT_TOKEN"`
	// Короткое имя mini app из BotFather (t.me/<bot>/<short_name>). Пусто — используется main mini app бота.
	MiniAppShortName string `env:"MINIAPP_SHORT_NAME"`
	// Если задан — бот работает через вебхук на PUBLIC_URL/bot/webhook, иначе long polling.
	BotWebhookSecret string `env:"BOT_WEBHOOK_SECRET"`

	InitDataTTL time.Duration `env:"INIT_DATA_TTL" envDefault:"24h"`

	// Комиссия платформы по умолчанию в базисных пунктах: 2000 = 20%.
	CommissionBps int `env:"COMMISSION_BPS" envDefault:"2000"`
	// Сколько часов деньги автора лежат в холде до того, как станут доступны к выводу.
	HoldHours int `env:"HOLD_HOURS" envDefault:"24"`
	// Минимальная сумма вывода в копейках.
	MinPayout int64  `env:"MIN_PAYOUT" envDefault:"50000"`
	Currency  string `env:"CURRENCY" envDefault:"RUB"`
	StatsTZ   string `env:"STATS_TZ" envDefault:"Europe/Moscow"`

	// fake — тестовая оплата без реальных денег. Реальные провайдеры подключаются здесь же.
	PaymentProvider string `env:"PAYMENT_PROVIDER" envDefault:"fake"`
}

func Load() (Config, error) {
	cfg, err := env.ParseAs[Config]()
	if err != nil {
		return cfg, err
	}
	// Хостинги вроде Render сами выдают порт и публичный адрес: подхватываем их, если свои не заданы
	if port := os.Getenv("PORT"); port != "" && os.Getenv("HTTP_ADDR") == "" {
		cfg.HTTPAddr = ":" + port
	}
	if ext := os.Getenv("RENDER_EXTERNAL_URL"); ext != "" && os.Getenv("PUBLIC_URL") == "" {
		cfg.PublicURL = ext
	}
	cfg.PublicURL = strings.TrimRight(cfg.PublicURL, "/")
	if cfg.CommissionBps < 0 || cfg.CommissionBps > 10000 {
		return cfg, fmt.Errorf("COMMISSION_BPS must be in [0, 10000], got %d", cfg.CommissionBps)
	}
	if cfg.HoldHours < 0 {
		return cfg, fmt.Errorf("HOLD_HOURS must be >= 0")
	}
	if !cfg.IsDev() && cfg.PaymentProvider == "fake" {
		return cfg, fmt.Errorf("PAYMENT_PROVIDER=fake is not allowed when ENV=%s", cfg.Env)
	}
	return cfg, nil
}

func (c Config) IsDev() bool { return c.Env == "dev" }

func (c Config) Hold() time.Duration { return time.Duration(c.HoldHours) * time.Hour }
