-- +goose Up
-- Автор удалил подписку. Строка остаётся: на её периоды ссылаются оплаты и действующие доступы.
ALTER TABLE products ADD COLUMN deleted_at TIMESTAMPTZ;

-- +goose Down
ALTER TABLE products DROP COLUMN deleted_at;
