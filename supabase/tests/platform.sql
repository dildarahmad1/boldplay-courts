-- Minimal Supabase-managed dependencies for an isolated SQL restore test.
-- This test fixture is not a replacement for the Supabase platform.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users (
 id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
 raw_app_meta_data jsonb DEFAULT '{}'::jsonb, email_confirmed_at timestamptz,
 created_at timestamptz DEFAULT now()
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY,name text,public boolean DEFAULT false,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
