-- Демо-данные для локальной разработки: подписчики, оплаты, баланс и один вывод у автора с id = 1.
-- Всё помечено: пользователи 990000001…, provider = 'demo', comment = 'demo'. Повторный запуск пересоздаёт данные.
-- Запуск:  psql "$DATABASE_URL" -f db/seed/demo.sql
-- Очистка: psql "$DATABASE_URL" -f db/seed/demo_clean.sql
BEGIN;
\i db/seed/demo_clean_body.sql

SELECT setseed(0.42);

INSERT INTO users (id, username, first_name)
SELECT 990000000 + n, 'demo_user_' || n,
       (ARRAY['Анна','Иван','Мария','Дмитрий','Ольга','Артём','Елена','Максим','София','Никита','Дарья','Кирилл'])[1 + n % 12]
FROM generate_series(1, 70) n;

-- Оплаты: канал 3 — пользователи 1…45, канал 4 — 40…70. Ближе к сегодняшнему дню оплат больше.
CREATE TEMP TABLE demo_pay ON COMMIT DROP AS
SELECT gen_random_uuid() AS id, 990000000 + n AS user_id, ch.channel_id, ch.plan_id, p.price AS amount,
       now() - (power(random(), 1.6) * 29 || ' days')::interval - (random() * 20 || ' hours')::interval AS paid_at,
       CASE WHEN random() < 0.6 THEN 'sbp' ELSE 'card' END AS method
FROM generate_series(1, 70) n
JOIN LATERAL (
    SELECT 3 AS channel_id, CASE WHEN n % 3 = 0 THEN 4 ELSE 3 END AS plan_id WHERE n <= 45
    UNION ALL
    SELECT 4, 5 WHERE n >= 40
) ch ON TRUE
JOIN plans p ON p.id = ch.plan_id;

-- Прошлый период: часть подписчиков платила месяц назад и продлила или ушла
INSERT INTO demo_pay
SELECT gen_random_uuid(), 990000000 + n, 3, 3, 49000,
       now() - ((31 + random() * 25) || ' days')::interval, 'sbp'
FROM generate_series(1, 22) n;

INSERT INTO payments (id, user_id, creator_id, channel_id, plan_id, amount, fee, net, currency, method, provider, provider_payment_id, status, created_at, paid_at, updated_at)
SELECT id, user_id, 1, channel_id, plan_id, amount, amount / 5, amount - amount / 5, 'RUB', method, 'demo', 'demo-' || id, 'succeeded', paid_at - interval '2 minutes', paid_at, paid_at
FROM demo_pay;

INSERT INTO subscriptions (channel_id, user_id, plan_id, status, started_at, expires_at, created_at, updated_at)
SELECT DISTINCT ON (channel_id, user_id) channel_id, user_id, plan_id, 'active', first_paid, paid_at + interval '30 days', first_paid, paid_at
FROM (SELECT *, min(paid_at) OVER (PARTITION BY channel_id, user_id) AS first_paid FROM demo_pay) d
ORDER BY channel_id, user_id, paid_at DESC;

-- Несколько ушедших подписчиков за последние две недели
INSERT INTO users (id, username, first_name) SELECT 990000100 + n, 'demo_left_' || n, 'Гость' FROM generate_series(1, 6) n;
INSERT INTO subscriptions (channel_id, user_id, plan_id, status, started_at, expires_at, created_at, updated_at)
SELECT 3, 990000100 + n, 3, 'expired', now() - interval '45 days', now() - (n * 2 || ' days')::interval, now() - interval '45 days', now() - (n * 2 || ' days')::interval
FROM generate_series(1, 6) n;

-- Проводки: оплата → холд; оплаты старше суток уже освобождены
INSERT INTO ledger_entries (account, creator_id, amount, payment_id, kind, created_at)
SELECT 'creator_pending', 1, amount - amount / 5, id, 'payment', paid_at FROM demo_pay;
INSERT INTO ledger_entries (account, creator_id, amount, payment_id, kind, created_at)
SELECT 'platform_fee', NULL, amount / 5, id, 'payment', paid_at FROM demo_pay;
INSERT INTO ledger_entries (account, creator_id, amount, payment_id, kind, created_at)
SELECT a.account, 1, a.sign * (amount - amount / 5), id, 'hold_release', paid_at + interval '24 hours'
FROM demo_pay, (VALUES ('creator_pending', -1), ('creator_available', 1)) a(account, sign)
WHERE paid_at < now() - interval '24 hours';

-- Один выполненный вывод
WITH po AS (
    INSERT INTO payouts (creator_id, amount, method, destination, status, comment, created_at, processed_at)
    VALUES (1, 1200000, 'sbp', '+79990000000', 'paid', 'demo', now() - interval '9 days', now() - interval '9 days' + interval '20 minutes')
    RETURNING id, created_at
)
INSERT INTO ledger_entries (account, creator_id, amount, payout_id, kind, created_at)
SELECT a.account, 1, a.sign * 1200000, po.id, 'payout', po.created_at
FROM po, (VALUES ('creator_available', -1), ('creator_payout', 1)) a(account, sign);

COMMIT;
