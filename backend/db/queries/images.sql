-- name: CreateImage :one
INSERT INTO images (owner_id, content_type, data)
VALUES ($1, $2, $3)
RETURNING id;

-- name: GetImage :one
SELECT content_type, data, tg_file_id FROM images WHERE id = $1;

-- name: GetImageOwner :one
SELECT owner_id FROM images WHERE id = $1;

-- name: CountImagesByOwnerSince :one
SELECT count(*)::BIGINT FROM images WHERE owner_id = $1 AND created_at > $2;

-- name: SetImageFileID :exec
UPDATE images SET tg_file_id = $2 WHERE id = $1;
