-- Metadata needed by the new frontend's connection and sync-run contracts.
-- These columns deliberately extend the existing control-plane tables rather
-- than creating a second connection model for /api/v1.

ALTER TABLE app.connections
    ADD COLUMN IF NOT EXISTS display_name text;

UPDATE app.connections
SET display_name = initcap(replace(source_type, '_', ' ')) || ' connection'
WHERE display_name IS NULL;

ALTER TABLE app.connections
    ALTER COLUMN display_name SET NOT NULL;

ALTER TABLE app.job_runs
    ADD COLUMN IF NOT EXISTS idempotency_key uuid,
    ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS job_runs_connection_idempotency_key_key
    ON app.job_runs (connection_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
