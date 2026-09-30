-- name: CreateProduct :one
INSERT INTO products (channel_id, title, description, button_text, image_id, payment_methods)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateProduct :one
UPDATE products SET
    title           = $2,
    description     = $3,
    button_text     = $4,
    image_id        = $5,
    payment_methods = $6,
    is_active       = $7,
    updated_at      = now()
WHERE id = $1
RETURNING *;

-- name: GetProduct :one
SELECT * FROM products WHERE id = $1;

-- name: ListProductsByChannel :many
SELECT * FROM products WHERE channel_id = $1 AND deleted_at IS NULL ORDER BY created_at, id;

-- name: CountProductSubscribers :one
SELECT count(*)::BIGINT
FROM subscriptions s
JOIN plans p ON p.id = s.plan_id
WHERE p.product_id = $1 AND s.status = 'active';

-- name: SoftDeleteProduct :exec
-- Подписка пропадает из приложения и со страницы оплаты. Кто уже оплатил, сохраняет доступ до конца срока.
UPDATE products SET deleted_at = now(), is_active = FALSE WHERE id = $1;
