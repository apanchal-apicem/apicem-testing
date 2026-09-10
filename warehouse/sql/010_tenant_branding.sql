-- Lets a workspace set its own display name (already existed, just never had an update
-- path) and upload a logo (doc Sec 9 update, 2026-08-21). logo_url stores a relative path
-- served by the backend's own static mount (backend/app/main.py) -- local-only by design,
-- same as everything else in this product's current scope; a real deployment would swap
-- this for S3/Cloud Storage without changing the column's meaning.
ALTER TABLE app.tenants ADD COLUMN IF NOT EXISTS logo_url text;
