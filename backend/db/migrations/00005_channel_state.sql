-- +goose Up
-- bot_issue: что не так с ботом в канале. '' — всё в порядке, 'removed' — бота убрали из канала или из админов,
-- 'no_rights' — бот админ, но без прав приглашать или блокировать.
-- deleted_at: автор удалил канал из Pitly. Строка остаётся ради истории оплат; повторное подключение её возвращает.
ALTER TABLE channels
    ADD COLUMN bot_issue  TEXT NOT NULL DEFAULT '' CHECK (bot_issue IN ('', 'removed', 'no_rights')),
    ADD COLUMN deleted_at TIMESTAMPTZ;
UPDATE channels SET bot_issue = 'removed' WHERE NOT bot_is_admin;

-- +goose Down
ALTER TABLE channels DROP COLUMN deleted_at, DROP COLUMN bot_issue;
