-- +goose Up

-- Подписка — то, что автор продаёт в канале: название, описание, оформление поста и способы оплаты.
-- Цены и сроки живут в plans: у одной подписки несколько периодов («месяц за 490 ₽», «год за 4 900 ₽»).
CREATE TABLE products (
    id              BIGSERIAL PRIMARY KEY,
    channel_id      BIGINT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    button_text     TEXT NOT NULL DEFAULT 'Подписаться',
    image_id        UUID REFERENCES images(id) ON DELETE SET NULL,
    -- Пустой массив = доступны все способы, которые умеет провайдер.
    payment_methods TEXT[] NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    legacy_plan_id  BIGINT
);
CREATE INDEX products_channel_idx ON products(channel_id);

-- Каждый прежний тариф становится отдельной подпиской с одним периодом: так ничего не теряется.
INSERT INTO products (channel_id, title, description, button_text, image_id, payment_methods, is_active, created_at, legacy_plan_id)
SELECT channel_id, title, description, button_text, image_id, payment_methods, is_active, created_at, id FROM plans;

ALTER TABLE plans ADD COLUMN product_id BIGINT REFERENCES products(id) ON DELETE CASCADE;
UPDATE plans p SET product_id = pr.id FROM products pr WHERE pr.legacy_plan_id = p.id;
ALTER TABLE plans ALTER COLUMN product_id SET NOT NULL;
CREATE INDEX plans_product_idx ON plans(product_id);

ALTER TABLE products DROP COLUMN legacy_plan_id;
ALTER TABLE plans
    DROP COLUMN payment_methods,
    DROP COLUMN image_id,
    DROP COLUMN button_text;

-- Название периода теперь собирается из срока; прежние названия тарифов переехали в подписки.
UPDATE plans SET title = CASE period_days
    WHEN 0 THEN 'Навсегда' WHEN 7 THEN '1 неделя' WHEN 30 THEN '1 месяц' WHEN 90 THEN '3 месяца'
    WHEN 180 THEN '6 месяцев' WHEN 365 THEN '1 год' ELSE period_days || ' дн.' END;

-- +goose Down
ALTER TABLE plans
    ADD COLUMN button_text      TEXT NOT NULL DEFAULT 'Подписаться',
    ADD COLUMN image_id         UUID REFERENCES images(id) ON DELETE SET NULL,
    ADD COLUMN payment_methods  TEXT[] NOT NULL DEFAULT '{}';
UPDATE plans p SET button_text = pr.button_text, image_id = pr.image_id, payment_methods = pr.payment_methods
FROM products pr WHERE pr.id = p.product_id;
ALTER TABLE plans DROP COLUMN product_id;
DROP TABLE products;
