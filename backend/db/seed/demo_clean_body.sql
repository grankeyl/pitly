DELETE FROM ledger_entries WHERE payment_id IN (SELECT id FROM payments WHERE provider = 'demo')
   OR payout_id IN (SELECT id FROM payouts WHERE comment = 'demo');
DELETE FROM payouts WHERE comment = 'demo';
DELETE FROM payments WHERE provider = 'demo';
DELETE FROM subscriptions WHERE user_id BETWEEN 990000001 AND 990000999;
DELETE FROM users WHERE id BETWEEN 990000001 AND 990000999;
