-- +goose Up
-- Идентификатор картинки на серверах Telegram. Загружаем её туда один раз и дальше отправляем посты с готовым файлом:
-- так картинку одинаково показывают все приложения Telegram, и она не зависит от доступности нашего сервера.
ALTER TABLE images ADD COLUMN tg_file_id TEXT;

-- +goose Down
ALTER TABLE images DROP COLUMN tg_file_id;
