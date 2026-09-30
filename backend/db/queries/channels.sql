-- name: UpsertChannel :one
-- Бот добавлен админом в канал. Если канал уже был — обновляем данные и владельца.
INSERT INTO channels (owner_id, chat_id, chat_type, title, username, bot_is_admin)
VALUES ($1, $2, $3, $4, $5, TRUE)
ON CONFLICT (chat_id) DO UPDATE SET
    owner_id     = EXCLUDED.owner_id,
    chat_type    = EXCLUDED.chat_type,
    title        = EXCLUDED.title,
    username     = EXCLUDED.username,
    bot_is_admin = TRUE,
    bot_issue    = '',
    deleted_at   = NULL,
    updated_at   = now()
RETURNING *;

-- name: SetChannelBotState :exec
-- Продавать можно только когда бот админ со всеми нужными правами.
UPDATE channels SET bot_is_admin = (sqlc.arg(bot_issue)::TEXT = ''), bot_issue = sqlc.arg(bot_issue)::TEXT WHERE chat_id = sqlc.arg(chat_id);

-- name: GetChannel :one
SELECT * FROM channels WHERE id = $1;

-- name: GetChannelByChatID :one
SELECT * FROM channels WHERE chat_id = $1;

-- name: ListChannelsByOwner :many
SELECT
    c.*,
    (SELECT count(*) FROM subscriptions s WHERE s.channel_id = c.id AND s.status = 'active')::BIGINT AS active_subscribers
FROM channels c
WHERE c.owner_id = $1 AND c.deleted_at IS NULL
ORDER BY c.created_at DESC;

-- name: UpdateChannelDescription :one
UPDATE channels SET description = $2
WHERE id = $1
RETURNING *;

-- name: SetChannelInviteLink :exec
UPDATE channels SET invite_link = $2 WHERE id = $1;

-- name: SoftDeleteChannel :exec
-- Канал пропадает из приложения, продажи останавливаются. История оплат остаётся.
UPDATE channels SET deleted_at = now(), bot_is_admin = FALSE, invite_link = NULL WHERE id = $1;
