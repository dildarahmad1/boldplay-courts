-- Keep privileged support creation outside the exposed API schema.
CREATE OR REPLACE FUNCTION private.create_dispute_with_support_thread(
  p_booking_id uuid,
  p_category public.dispute_category,
  p_subject text,
  p_description text,
  p_requested_refund_amount numeric DEFAULT NULL,
  p_attachment_urls text[] DEFAULT ARRAY[]::text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_booking public.bookings%ROWTYPE;
  v_host uuid;
  v_admin uuid;
  v_thread uuid;
  v_dispute uuid;
  v_existing public.disputes%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user AND status = 'active') THEN
    RAISE EXCEPTION 'Your account has been suspended. Please contact support.' USING ERRCODE = '42501';
  END IF;
  -- Lock the booking so simultaneous retries cannot create duplicate cases.
  SELECT b.* INTO v_booking FROM public.bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE = '22023'; END IF;
  SELECT host_user_id INTO v_host FROM public.listings WHERE id = v_booking.listing_id;
  IF v_user IS DISTINCT FROM v_booking.guest_user_id AND v_user IS DISTINCT FROM v_host THEN
    RAISE EXCEPTION 'You can only contact support about your own booking.' USING ERRCODE = '42501';
  END IF;
  IF p_category IS NULL OR p_subject IS NULL OR length(btrim(p_subject)) NOT BETWEEN 1 AND 200
     OR p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'Please fill in all required fields' USING ERRCODE = '22023';
  END IF;
  IF p_requested_refund_amount IS NOT NULL AND
     (p_requested_refund_amount::text IN ('NaN', 'Infinity', '-Infinity')
      OR p_requested_refund_amount <= 0 OR trunc(p_requested_refund_amount) <> p_requested_refund_amount) THEN
    RAISE EXCEPTION 'Enter a positive whole amount in IQD.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(coalesce(p_attachment_urls, ARRAY[]::text[])) > 5 OR EXISTS (
    SELECT 1 FROM unnest(coalesce(p_attachment_urls, ARRAY[]::text[])) AS a(url)
    WHERE url IS NULL OR length(url) > 4096
  ) THEN RAISE EXCEPTION 'You can upload a maximum of 5 images' USING ERRCODE = '22023'; END IF;

  SELECT d.* INTO v_existing FROM public.disputes d
    WHERE d.booking_id = p_booking_id AND d.initiated_by_user_id = v_user
      AND d.category = p_category AND d.subject = btrim(p_subject)
      AND d.description = btrim(p_description)
      AND d.requested_refund_amount IS NOT DISTINCT FROM p_requested_refund_amount
      AND coalesce(d.attachment_urls, ARRAY[]::text[]) = coalesce(p_attachment_urls, ARRAY[]::text[])
      AND d.status IN ('open', 'pending', 'in_progress', 'on_hold', 'escalated')
      AND d.support_thread_id IS NOT NULL
    ORDER BY d.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'dispute_id', v_existing.id, 'thread_id', v_existing.support_thread_id);
  END IF;

  SELECT r.user_id INTO v_admin FROM public.user_roles r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.role = 'admin' AND p.status = 'active' AND r.user_id <> v_user
    ORDER BY p.created_at, r.user_id LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Failed to submit dispute. Please try again.'; END IF;

  INSERT INTO public.message_threads(listing_id, booking_id, thread_type)
    VALUES (v_booking.listing_id, p_booking_id, 'user_to_support') RETURNING id INTO v_thread;
  INSERT INTO public.disputes(booking_id, listing_id, initiated_by_user_id, user_role,
    category, status, subject, description, requested_refund_amount, attachment_urls, assigned_admin_id, support_thread_id)
    VALUES (p_booking_id, v_booking.listing_id, v_user,
      CASE WHEN v_user = v_booking.guest_user_id THEN 'guest' ELSE 'host' END,
      p_category, 'open', btrim(p_subject), btrim(p_description), p_requested_refund_amount,
      coalesce(p_attachment_urls, ARRAY[]::text[]), v_admin, v_thread) RETURNING id INTO v_dispute;
  INSERT INTO public.messages(thread_id, booking_id, from_user_id, to_user_id, body)
    VALUES (v_thread, p_booking_id, v_user, v_admin, btrim(p_description));
  RETURN jsonb_build_object('success', true, 'dispute_id', v_dispute, 'thread_id', v_thread);
END;
$function$;
REVOKE ALL ON FUNCTION private.create_dispute_with_support_thread(uuid, public.dispute_category, text, text, numeric, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.create_dispute_with_support_thread(uuid, public.dispute_category, text, text, numeric, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_dispute_with_support_thread(
  p_booking_id uuid,
  p_category public.dispute_category,
  p_subject text,
  p_description text,
  p_requested_refund_amount numeric DEFAULT NULL,
  p_attachment_urls text[] DEFAULT ARRAY[]::text[]
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT private.create_dispute_with_support_thread(p_booking_id, p_category, p_subject,
    p_description, p_requested_refund_amount, p_attachment_urls);
$function$;
REVOKE ALL ON FUNCTION public.create_dispute_with_support_thread(uuid, public.dispute_category, text, text, numeric, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_dispute_with_support_thread(uuid, public.dispute_category, text, text, numeric, text[]) TO authenticated;

-- Uploads to private buckets also need SELECT to generate a signed URL.
DROP POLICY IF EXISTS storage_private_attachment_owner_read ON storage.objects;
CREATE POLICY storage_private_attachment_owner_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('dispute-attachments', 'message-attachments')
    AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR private.has_role((SELECT auth.uid()), 'admin'::public.app_role)));
NOTIFY pgrst, 'reload schema';
