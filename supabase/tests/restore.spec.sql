BEGIN;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES (
 '00000000-0000-4000-8000-000000000001',
 'restore-test@example.invalid',
 '{"first_name":"Restore","last_name":"Test","requested_role":"admin"}'::jsonb
);
DO $test$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id='00000000-0000-4000-8000-000000000001' AND first_name='Restore') THEN RAISE EXCEPTION 'New account profile was not created'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id='00000000-0000-4000-8000-000000000001' AND role='guest') THEN RAISE EXCEPTION 'New account guest role was not created'; END IF;
 IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id='00000000-0000-4000-8000-000000000001' AND role='admin') THEN RAISE EXCEPTION 'User metadata granted admin access'; END IF;
 IF (SELECT count(*) FROM public.cities) <> 12 THEN RAISE EXCEPTION 'Reference cities not restored'; END IF;
 IF (SELECT count(*) FROM storage.buckets) <> 4 THEN RAISE EXCEPTION 'Storage configuration missing'; END IF;
 IF has_function_privilege('anon','public.create_dispute_with_support_thread(uuid,public.dispute_category,text,text,numeric,text[])','EXECUTE') THEN RAISE EXCEPTION 'Anonymous support write access'; END IF;
 IF NOT has_function_privilege('authenticated','public.create_dispute_with_support_thread(uuid,public.dispute_category,text,text,numeric,text[])','EXECUTE') THEN RAISE EXCEPTION 'Signed-in support access missing'; END IF;
 IF NOT has_table_privilege('service_role','public.listings','SELECT') OR NOT has_table_privilege('service_role','public.bookings','SELECT') THEN RAISE EXCEPTION 'Server role cannot read bookings/listings'; END IF;
 IF has_table_privilege('authenticated','public.transactions','TRUNCATE') OR has_table_privilege('anon','public.bookings','TRUNCATE') THEN RAISE EXCEPTION 'Application user has destructive table grants'; END IF;
END;
$test$;
UPDATE auth.users SET email_confirmed_at=now() WHERE id='00000000-0000-4000-8000-000000000001';
DO $test$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id='00000000-0000-4000-8000-000000000001' AND verified) THEN RAISE EXCEPTION 'Email verification profile trigger missing'; END IF;
END;
$test$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.user_roles WHERE user_id=auth.uid())<>1 THEN RAISE EXCEPTION 'Signed-in role lookup failed'; END IF;
 BEGIN
  PERFORM public.create_dispute_with_support_thread('00000000-0000-4000-8000-000000000099','other','Restore test','Restore test',NULL,ARRAY[]::text[]);
  RAISE EXCEPTION 'Unknown booking accepted';
 EXCEPTION WHEN invalid_parameter_value THEN
  IF SQLERRM<>'Booking not found' THEN RAISE; END IF;
 END;
END;
$test$;
RESET ROLE;
SELECT 'PASS: fresh schema, reference data, Auth triggers, storage, server permissions and support authorization' AS result;
ROLLBACK;
