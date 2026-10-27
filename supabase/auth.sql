-- Application-owned triggers on Supabase-managed auth.users.
-- Apply after schema.sql; does not modify Supabase-managed Auth triggers.
DROP TRIGGER IF EXISTS "on_auth_email_verified" ON auth.users;
CREATE TRIGGER on_auth_email_verified AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION private.sync_verified_profile();
DROP TRIGGER IF EXISTS "on_auth_user_created" ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();
