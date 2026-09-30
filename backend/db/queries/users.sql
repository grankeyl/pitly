-- name: UpsertUser :one
INSERT INTO users (id, username, first_name, last_name, photo_url, language_code)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (id) DO UPDATE SET
    username      = EXCLUDED.username,
    first_name    = EXCLUDED.first_name,
    last_name     = EXCLUDED.last_name,
    photo_url     = COALESCE(EXCLUDED.photo_url, users.photo_url),
    language_code = EXCLUDED.language_code,
    updated_at    = now()
RETURNING *;

-- name: EnsureUser :exec
-- Используется ботом, когда о пользователе известно только id и имя.
INSERT INTO users (id, username, first_name, last_name)
VALUES ($1, $2, $3, $4)
ON CONFLICT (id) DO NOTHING;

-- name: GetUser :one
SELECT * FROM users WHERE id = $1;
