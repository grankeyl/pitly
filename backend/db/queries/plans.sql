-- name: CreatePlan :one
INSERT INTO plans (channel_id, product_id, title, price, currency, period_days, sort_order)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdatePlan :one
UPDATE plans SET
    title       = $2,
    price       = $3,
    period_days = $4,
    is_active   = $5,
    updated_at  = now()
WHERE id = $1
RETURNING *;

-- name: GetPlan :one
SELECT * FROM plans WHERE id = $1;

-- name: ListPlansByProduct :many
SELECT * FROM plans WHERE product_id = $1 ORDER BY sort_order, period_days = 0, period_days, price;

-- name: ListActivePlansByProduct :many
SELECT * FROM plans WHERE product_id = $1 AND is_active ORDER BY sort_order, period_days = 0, period_days, price;
