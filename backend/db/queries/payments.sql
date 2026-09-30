-- name: CreatePayment :one
INSERT INTO payments (id, user_id, creator_id, channel_id, plan_id, amount, fee, net, currency, method, provider, status)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
RETURNING *;

-- name: SetPaymentProviderData :exec
UPDATE payments SET provider_payment_id = $2, payment_url = $3, updated_at = now() WHERE id = $1;

-- name: GetPayment :one
SELECT * FROM payments WHERE id = $1;

-- name: GetPaymentForUpdate :one
SELECT * FROM payments WHERE id = $1 FOR UPDATE;

-- name: MarkPaymentSucceeded :one
-- Переход только из pending — повторный вебхук ничего не изменит.
UPDATE payments SET status = 'succeeded', paid_at = now(), updated_at = now()
WHERE id = $1 AND status = 'pending'
RETURNING *;

-- name: MarkPaymentFailed :exec
UPDATE payments SET status = 'failed', updated_at = now()
WHERE id = $1 AND status = 'pending';
