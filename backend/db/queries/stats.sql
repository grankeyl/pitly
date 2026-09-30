-- name: CreatorStatsSummary :one
SELECT
    COALESCE(SUM(net) FILTER (WHERE status = 'succeeded'), 0)::BIGINT AS net_revenue,
    COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'), 0)::BIGINT AS gross_revenue,
    COUNT(*) FILTER (WHERE status = 'succeeded')::BIGINT AS payments_count,
    COUNT(DISTINCT user_id) FILTER (WHERE status = 'succeeded')::BIGINT AS paying_users
FROM payments
WHERE creator_id = @creator_id AND created_at >= @since::TIMESTAMPTZ
  AND (sqlc.narg(channel_id)::BIGINT IS NULL OR channel_id = sqlc.narg(channel_id)::BIGINT);

-- name: CreatorDailyRevenue :many
SELECT
    date_trunc('day', paid_at AT TIME ZONE @tz::TEXT)::DATE AS day,
    SUM(net)::BIGINT AS net,
    COUNT(*)::BIGINT AS payments
FROM payments
WHERE creator_id = @creator_id AND status = 'succeeded' AND paid_at >= @since::TIMESTAMPTZ
  AND (sqlc.narg(channel_id)::BIGINT IS NULL OR channel_id = sqlc.narg(channel_id)::BIGINT)
GROUP BY 1
ORDER BY 1;

-- name: CreatorSubscriberCounts :one
SELECT
    COUNT(*) FILTER (WHERE s.status = 'active')::BIGINT AS active,
    COUNT(*) FILTER (WHERE s.status = 'active' AND s.started_at >= @since::TIMESTAMPTZ)::BIGINT AS new_active,
    COUNT(*) FILTER (WHERE s.status = 'expired' AND s.updated_at >= @since::TIMESTAMPTZ)::BIGINT AS churned
FROM subscriptions s
JOIN channels c ON c.id = s.channel_id
WHERE c.owner_id = @creator_id
  AND (sqlc.narg(channel_id)::BIGINT IS NULL OR c.id = sqlc.narg(channel_id)::BIGINT);

-- name: CreatorDayPayments :many
SELECT p.id, p.paid_at, p.amount, p.net, p.method,
       c.title AS channel_title, pl.title AS plan_title,
       COALESCE(NULLIF(u.first_name, ''), u.username, 'Подписчик')::TEXT AS payer_name
FROM payments p
JOIN channels c ON c.id = p.channel_id
JOIN plans pl ON pl.id = p.plan_id
JOIN users u ON u.id = p.user_id
WHERE p.creator_id = @creator_id AND p.status = 'succeeded'
  AND (sqlc.narg(day_start)::TIMESTAMPTZ IS NULL OR p.paid_at >= sqlc.narg(day_start)::TIMESTAMPTZ)
  AND (sqlc.narg(day_end)::TIMESTAMPTZ IS NULL OR p.paid_at < sqlc.narg(day_end)::TIMESTAMPTZ)
  AND (sqlc.narg(channel_id)::BIGINT IS NULL OR p.channel_id = sqlc.narg(channel_id)::BIGINT)
ORDER BY p.paid_at DESC
LIMIT @max_rows;
