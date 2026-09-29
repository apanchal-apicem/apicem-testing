-- Backend-for-new-frontend Phase 0: the new frontend's `User` type needs a display name
-- (existing app.users only ever had email/role) and an avatar color. avatarColor is derived
-- deterministically from user_id in application code (no need to persist a value that's a
-- pure function of an id we already have) -- name is real, user-editable data, so it gets a
-- real column. Backfilled from the email's local-part so every existing account has a
-- reasonable display name with no manual data-entry step required.
--
-- Deliberately nullable, not NOT NULL: the OLD frontend's signup/add-teammate flows
-- (routers/auth.py, routers/team.py) don't collect or insert a name at all, and keeping them
-- working unmodified during the transition matters more than enforcing this column everywhere
-- right now. Every read site COALESCEs to the same email-derived fallback used in the backfill
-- below, so a NULL name is never actually visible to either frontend.
ALTER TABLE app.users ADD COLUMN IF NOT EXISTS name text;

UPDATE app.users
SET name = initcap(replace(split_part(email, '@', 1), '.', ' '))
WHERE name IS NULL;
