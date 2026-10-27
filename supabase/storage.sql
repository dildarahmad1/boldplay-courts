-- Storage configuration only. Apply to a new Supabase project after schema.sql.
-- No uploaded objects or object metadata are included.
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) SELECT id,name,public,file_size_limit,allowed_mime_types FROM jsonb_populate_record(NULL::storage.buckets, '{"allowed_mime_types":null,"file_size_limit":null,"id":"listing-images","name":"listing-images","public":true}'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) SELECT id,name,public,file_size_limit,allowed_mime_types FROM jsonb_populate_record(NULL::storage.buckets, '{"allowed_mime_types":null,"file_size_limit":null,"id":"avatars","name":"avatars","public":true}'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) SELECT id,name,public,file_size_limit,allowed_mime_types FROM jsonb_populate_record(NULL::storage.buckets, '{"allowed_mime_types":null,"file_size_limit":null,"id":"message-attachments","name":"message-attachments","public":false}'::jsonb) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) SELECT id,name,public,file_size_limit,allowed_mime_types FROM jsonb_populate_record(NULL::storage.buckets, '{"allowed_mime_types":null,"file_size_limit":null,"id":"dispute-attachments","name":"dispute-attachments","public":false}'::jsonb) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "storage_owner_delete" ON storage.objects;
CREATE POLICY "storage_owner_delete" ON storage.objects AS PERMISSIVE FOR DELETE TO "authenticated" USING (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text));
DROP POLICY IF EXISTS "storage_owner_update" ON storage.objects;
CREATE POLICY "storage_owner_update" ON storage.objects AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)) WITH CHECK (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text));
DROP POLICY IF EXISTS "storage_owner_upload" ON storage.objects;
CREATE POLICY "storage_owner_upload" ON storage.objects AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text));
DROP POLICY IF EXISTS "storage_private_attachment_owner_read" ON storage.objects;
CREATE POLICY "storage_private_attachment_owner_read" ON storage.objects AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = ANY (ARRAY['dispute-attachments'::text, 'message-attachments'::text])) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.has_role(( SELECT auth.uid() AS uid), 'admin'::app_role))));
DROP POLICY IF EXISTS "storage_public_images_read" ON storage.objects;
CREATE POLICY "storage_public_images_read" ON storage.objects AS PERMISSIVE FOR SELECT TO "anon", "authenticated" USING ((bucket_id = ANY (ARRAY['listing-images'::text, 'avatars'::text])));
