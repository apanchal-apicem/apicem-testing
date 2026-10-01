-- Allows 'editor' role in app.users table to match app.workspace_memberships and frontend Role contract
ALTER TABLE app.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE app.users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'admin', 'editor', 'viewer'));
