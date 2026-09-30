-- name: InsertLedgerEntry :exec
INSERT INTO ledger_entries (account, creator_id, amount, currency, payment_id, payout_id, kind)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: CreatorBalances :one
SELECT
    COALESCE(SUM(amount) FILTER (WHERE account = 'creator_pending'), 0)::BIGINT   AS pending,
    COALESCE(SUM(amount) FILTER (WHERE account = 'creator_available'), 0)::BIGINT AS available,
    COALESCE(SUM(amount) FILTER (WHERE account = 'creator_payout'), 0)::BIGINT    AS paid_out
FROM ledger_entries
WHERE creator_id = $1 AND currency = $2;

-- name: LockCreatorLedger :exec
-- Сериализует операции с балансом одного автора (вывод, освобождение холда).
SELECT pg_advisory_xact_lock(hashtext('ledger:' || sqlc.arg(creator_id)::BIGINT));

-- name: HoldReleased :one
SELECT EXISTS (
    SELECT 1 FROM ledger_entries WHERE payment_id = $1 AND kind = 'hold_release'
);
