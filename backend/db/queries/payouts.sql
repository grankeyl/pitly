-- name: CreatePayout :one
INSERT INTO payouts (creator_id, amount, currency, method, destination, status)
VALUES ($1, $2, $3, $4, $5, 'requested')
RETURNING *;

-- name: ListPayoutsByCreator :many
SELECT * FROM payouts WHERE creator_id = $1 ORDER BY created_at DESC LIMIT $2;
