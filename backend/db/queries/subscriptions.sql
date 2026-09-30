-- name: GetSubscription :one
SELECT * FROM subscriptions WHERE channel_id = $1 AND user_id = $2;

-- name: GetSubscriptionByID :one
SELECT * FROM subscriptions WHERE id = $1;

-- name: ActivateSubscription :one
-- Создаёт подписку или продлевает существующую.
-- Если подписка ещё активна — время добавляется к текущему expires_at, иначе считается от now().
-- sqlc.narg('period_days') = NULL означает бессрочный доступ.
INSERT INTO subscriptions (channel_id, user_id, plan_id, status, started_at, expires_at)
VALUES (
    @channel_id, @user_id, @plan_id, 'active', now(),
    CASE WHEN sqlc.narg('period_days')::INT IS NULL THEN NULL
         ELSE now() + make_interval(days => sqlc.narg('period_days')::INT) END
)
ON CONFLICT (channel_id, user_id) DO UPDATE SET
    plan_id    = EXCLUDED.plan_id,
    status     = 'active',
    started_at = CASE WHEN subscriptions.status = 'active' THEN subscriptions.started_at ELSE now() END,
    expires_at = CASE
        WHEN sqlc.narg('period_days')::INT IS NULL THEN NULL
        WHEN subscriptions.status = 'active' AND subscriptions.expires_at IS NULL THEN NULL
        WHEN subscriptions.status = 'active' AND subscriptions.expires_at > now()
            THEN subscriptions.expires_at + make_interval(days => sqlc.narg('period_days')::INT)
        ELSE now() + make_interval(days => sqlc.narg('period_days')::INT)
    END,
    updated_at = now()
RETURNING *;

-- name: ExpireDueSubscriptions :many
-- Помечает истёкшие подписки и возвращает их, чтобы воркер удалил людей из канала.
UPDATE subscriptions SET status = 'expired', updated_at = now()
WHERE id IN (
    SELECT id FROM subscriptions
    WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()
    ORDER BY expires_at
    LIMIT $1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: HasActiveSubscription :one
SELECT EXISTS (
    SELECT 1 FROM subscriptions
    WHERE channel_id = $1 AND user_id = $2 AND status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
);

-- name: ListSubscriptionsByUser :many
SELECT
    s.*,
    c.title    AS channel_title,
    c.username AS channel_username,
    c.invite_link AS channel_invite_link,
    p.title    AS plan_title,
    p.price    AS plan_price,
    p.currency AS plan_currency
FROM subscriptions s
JOIN channels c ON c.id = s.channel_id
JOIN plans p ON p.id = s.plan_id
WHERE s.user_id = $1
ORDER BY (s.status = 'active') DESC, s.expires_at DESC NULLS FIRST;

-- name: CountActiveSubscribers :one
SELECT count(*)::BIGINT FROM subscriptions WHERE channel_id = $1 AND status = 'active';
