-- Send the player the approved court, time, price, and reference in their inbox.
CREATE OR REPLACE FUNCTION public.host_accept_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_host_id uuid := auth.uid();
  v_booking public.bookings%ROWTYPE;
  v_title text;
  v_language text;
  v_body text;
  v_thread_id uuid;
BEGIN
  IF v_host_id IS NULL OR NOT public.has_role(v_host_id, 'host'::public.app_role) THEN
    RAISE EXCEPTION 'Host account required';
  END IF;

  UPDATE public.bookings b
     SET status = 'confirmed'::public.booking_status,
         updated_at = now()
    FROM public.listings l
   WHERE b.id = p_booking_id
     AND b.listing_id = l.id
     AND l.host_user_id = v_host_id
     AND b.status = 'pending_host_confirmation'::public.booking_status
  RETURNING b.* INTO v_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking is not awaiting host acceptance or does not belong to this host';
  END IF;

  SELECT title INTO v_title FROM public.listings WHERE id=v_booking.listing_id;
  SELECT raw_user_meta_data->>'language' INTO v_language FROM auth.users WHERE id=v_booking.guest_user_id;
  v_body := format(CASE v_language
    WHEN 'ar' THEN E'تمت الموافقة على حجزك.\nالملعب: %s\nالتاريخ: %s\nالوقت: %s – %s\nالإجمالي: %s IQD\nرقم الحجز: %s\nادفع نقدًا في الملعب.'
    WHEN 'ckb' THEN E'حجزەکەت پەسەند کرا.\nیاریگا: %s\nبەروار: %s\nکات: %s – %s\nکۆی گشتی: %s IQD\nژمارەی حجز: %s\nلە یاریگا بە نەقد پارە بدە.'
    WHEN 'kmr' THEN E'حجزا تە هاتە پەسەندکرن.\nیاریگەه: %s\nروژ: %s\nدەم: %s – %s\nکۆم: %s IQD\nژمارا حجزێ: %s\nل یاریگەهێ ب نەقد پارە بدە.'
    ELSE E'Your booking is approved.\nCourt: %s\nDate: %s\nTime: %s – %s\nTotal: %s IQD\nBooking reference: %s\nPay in cash at the venue.' END,
    v_title, to_char(COALESCE(v_booking.booking_date,v_booking.checkin_date),'YYYY-MM-DD'),
    to_char(v_booking.start_time,'HH24:MI'),to_char(v_booking.end_time,'HH24:MI'),
    round(v_booking.total_price)::text, upper(left(v_booking.id::text,8)));
  v_thread_id := public.get_or_create_thread(v_host_id,v_booking.guest_user_id,v_booking.listing_id,v_booking.id);
  INSERT INTO public.messages(thread_id,booking_id,from_user_id,to_user_id,body,read)
  VALUES(v_thread_id,v_booking.id,v_host_id,v_booking.guest_user_id,v_body,false);
  UPDATE public.message_threads SET last_message_at=now() WHERE id=v_thread_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'status', v_booking.status
  );
END;
$$;

