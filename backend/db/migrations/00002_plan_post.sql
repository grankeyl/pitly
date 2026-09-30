-- +goose Up

-- Картинки, загруженные авторами (обложки постов с тарифами).
-- Хранятся в базе: объёмы маленькие, зато не нужен отдельный диск или хранилище.
CREATE TABLE images (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type    TEXT NOT NULL,
    data            BYTEA NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX images_owner_idx ON images(owner_id);

-- Оформление поста и способы оплаты тарифа.
ALTER TABLE plans
    ADD COLUMN button_text      TEXT NOT NULL DEFAULT 'Подписаться',
    ADD COLUMN image_id         UUID REFERENCES images(id) ON DELETE SET NULL,
    -- Пустой массив = доступны все способы, которые умеет провайдер.
    ADD COLUMN payment_methods  TEXT[] NOT NULL DEFAULT '{}';

-- +goose Down
ALTER TABLE plans
    DROP COLUMN payment_methods,
    DROP COLUMN image_id,
    DROP COLUMN button_text;
DROP TABLE images;
