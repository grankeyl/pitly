-- +goose Up

-- Пользователи Telegram. id = telegram user id.
-- Один и тот же человек может быть и автором, и подписчиком.
CREATE TABLE users (
    id              BIGINT PRIMARY KEY,
    username        TEXT,
    first_name      TEXT NOT NULL DEFAULT '',
    last_name       TEXT NOT NULL DEFAULT '',
    photo_url       TEXT,
    language_code   TEXT,
    -- Индивидуальная комиссия автора в базисных пунктах (2000 = 20%).
    -- NULL = берём значение по умолчанию из конфига.
    commission_bps  INT CHECK (commission_bps BETWEEN 0 AND 10000),
    is_blocked      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Каналы и группы, куда наш бот добавлен администратором.
CREATE TABLE channels (
    id              BIGSERIAL PRIMARY KEY,
    owner_id        BIGINT NOT NULL REFERENCES users(id),
    chat_id         BIGINT NOT NULL UNIQUE,
    chat_type       TEXT NOT NULL CHECK (chat_type IN ('channel', 'supergroup', 'group')),
    title           TEXT NOT NULL,
    username        TEXT,
    description     TEXT NOT NULL DEFAULT '',
    -- Бот сейчас админ и может приглашать/удалять участников.
    bot_is_admin    BOOLEAN NOT NULL DEFAULT TRUE,
    -- Ссылка-заявка (creates_join_request). Бот одобряет заявку только оплатившим,
    -- поэтому пересланная ссылка бесполезна для посторонних.
    invite_link     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX channels_owner_idx ON channels(owner_id);

-- Тарифы подписки на канал.
CREATE TABLE plans (
    id              BIGSERIAL PRIMARY KEY,
    channel_id      BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    -- Все суммы в минимальных единицах валюты (копейках).
    price           BIGINT NOT NULL CHECK (price > 0),
    currency        TEXT NOT NULL DEFAULT 'RUB',
    -- Длительность доступа в днях. 0 = навсегда (разовая оплата).
    period_days     INT NOT NULL CHECK (period_days >= 0),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plans_channel_idx ON plans(channel_id);

-- Подписки. На один канал у пользователя одна запись; продление двигает expires_at.
CREATE TABLE subscriptions (
    id              BIGSERIAL PRIMARY KEY,
    channel_id      BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    plan_id         BIGINT NOT NULL REFERENCES plans(id),
    status          TEXT NOT NULL CHECK (status IN ('active', 'expired', 'canceled')),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- NULL = бессрочный доступ.
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_id, user_id)
);
CREATE INDEX subscriptions_user_idx ON subscriptions(user_id);
CREATE INDEX subscriptions_expiring_idx ON subscriptions(expires_at) WHERE status = 'active';

-- Платежи подписчиков.
CREATE TABLE payments (
    id                  UUID PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users(id),
    creator_id          BIGINT NOT NULL REFERENCES users(id),
    channel_id          BIGINT NOT NULL REFERENCES channels(id),
    plan_id             BIGINT NOT NULL REFERENCES plans(id),
    amount              BIGINT NOT NULL CHECK (amount > 0),
    -- Комиссия платформы и чистая сумма автору, фиксируются в момент создания.
    fee                 BIGINT NOT NULL CHECK (fee >= 0),
    net                 BIGINT NOT NULL CHECK (net >= 0),
    currency            TEXT NOT NULL,
    method              TEXT NOT NULL CHECK (method IN ('card', 'sbp')),
    provider            TEXT NOT NULL,
    provider_payment_id TEXT,
    payment_url         TEXT,
    status              TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at             TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (fee + net = amount)
);
CREATE INDEX payments_creator_idx ON payments(creator_id, created_at);
CREATE INDEX payments_user_idx ON payments(user_id, created_at);
CREATE UNIQUE INDEX payments_provider_idx ON payments(provider, provider_payment_id);

-- Выводы средств автором.
CREATE TABLE payouts (
    id              BIGSERIAL PRIMARY KEY,
    creator_id      BIGINT NOT NULL REFERENCES users(id),
    amount          BIGINT NOT NULL CHECK (amount > 0),
    currency        TEXT NOT NULL DEFAULT 'RUB',
    method          TEXT NOT NULL CHECK (method IN ('card', 'sbp', 'usdt_ton')),
    -- Номер карты / телефон для СБП / адрес кошелька.
    destination     TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('requested', 'processing', 'paid', 'rejected')),
    comment         TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ
);
CREATE INDEX payouts_creator_idx ON payouts(creator_id, created_at);

-- Журнал проводок. Баланс никогда не хранится числом — он считается суммой проводок.
-- Счета автора:
--   creator_pending   — деньги в холде (защита от чарджбэков)
--   creator_available — можно выводить
--   creator_payout    — выведено
-- Счёт платформы:
--   platform_fee      — наша комиссия
CREATE TABLE ledger_entries (
    id              BIGSERIAL PRIMARY KEY,
    account         TEXT NOT NULL CHECK (account IN ('creator_pending', 'creator_available', 'creator_payout', 'platform_fee')),
    creator_id      BIGINT REFERENCES users(id),
    amount          BIGINT NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'RUB',
    payment_id      UUID REFERENCES payments(id),
    payout_id       BIGINT REFERENCES payouts(id),
    kind            TEXT NOT NULL CHECK (kind IN ('payment', 'hold_release', 'payout', 'payout_reversal', 'refund')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((account = 'platform_fee') = (creator_id IS NULL))
);
CREATE INDEX ledger_creator_idx ON ledger_entries(creator_id, account);
CREATE INDEX ledger_payment_idx ON ledger_entries(payment_id);

-- +goose Down
DROP TABLE ledger_entries;
DROP TABLE payouts;
DROP TABLE payments;
DROP TABLE subscriptions;
DROP TABLE plans;
DROP TABLE channels;
DROP TABLE users;
