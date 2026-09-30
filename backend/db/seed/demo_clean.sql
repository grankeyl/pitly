-- Удаляет демо-данные, созданные demo.sql
BEGIN;
\i db/seed/demo_clean_body.sql
COMMIT;
