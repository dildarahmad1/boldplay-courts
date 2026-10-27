-- Hosts may reject only pending requests belonging to one of their courts.
-- Rejected reservations no longer block availability because availability
-- checks exclude the cancelled_host status.
CREATE OR REPLACE FUNCTION public.host_reject_booking(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_host_id uuid := auth.uid();
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF v_host_id IS NULL OR NOT public.has_role(v_host_id, 'host'::public.app_role) THEN
    RAISE EXCEPTION 'Host account required';
  END IF;

  UPDATE public.bookings b
     SET status = 'cancelled_host'::public.booking_status,
         updated_at = now()
    FROM public.listings l
   WHERE b.id = p_booking_id
     AND b.listing_id = l.id
     AND l.host_user_id = v_host_id
     AND b.status = 'pending_payment'::public.booking_status
  RETURNING b.* INTO v_booking;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking is not awaiting host decision or does not belong to this host';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'status', v_booking.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.host_reject_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_reject_booking(uuid) TO authenticated;
