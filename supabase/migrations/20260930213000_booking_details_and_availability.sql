-- Public availability contains no private booking data. Run the availability
-- calculation with the function owner's read access so private bookings still
-- block a slot for every other player.
ALTER FUNCTION public.get_listing_slots(uuid, date) SECURITY DEFINER;
ALTER FUNCTION public.get_listing_slots(uuid, date) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_listing_slot_grid(uuid, date, integer) SECURITY DEFINER;
ALTER FUNCTION public.get_listing_slot_grid(uuid, date, integer) SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.get_listing_slot_grid(
  p_listing_id uuid, p_date date, p_step_minutes integer DEFAULT 30
)
RETURNS TABLE(slot_start time without time zone, slot_end time without time zone, is_available boolean, price numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_open_min integer;
  v_close_min integer;
  v_step integer := GREATEST(COALESCE(NULLIF(p_step_minutes, 0), 30), 15);
  v_base_price numeric;
  v_cursor integer;
  v_next integer;
  v_start time;
  v_end time;
  v_blocked boolean;
  v_custom numeric;
BEGIN
  SELECT (EXTRACT(HOUR FROM COALESCE(l.opening_time, '08:00'::time)) * 60 + EXTRACT(MINUTE FROM COALESCE(l.opening_time, '08:00'::time)))::int,
         (EXTRACT(HOUR FROM COALESCE(l.closing_time, '22:00'::time)) * 60 + EXTRACT(MINUTE FROM COALESCE(l.closing_time, '22:00'::time)))::int,
         l.base_price
    INTO v_open_min, v_close_min, v_base_price
    FROM public.listings l
   WHERE l.id = p_listing_id AND l.status = 'approved'::public.listing_status;
  IF v_open_min IS NULL OR v_close_min IS NULL OR v_close_min <= v_open_min THEN RETURN; END IF;

  v_cursor := v_open_min;
  WHILE v_cursor + v_step <= v_close_min LOOP
    v_next := v_cursor + v_step;
    v_start := make_time(v_cursor / 60, v_cursor % 60, 0);
    v_end := make_time((v_next / 60) % 24, v_next % 60, 0);
    v_blocked := p_date < (now() AT TIME ZONE 'Asia/Baghdad')::date
      OR (p_date = (now() AT TIME ZONE 'Asia/Baghdad')::date AND v_start <= (now() AT TIME ZONE 'Asia/Baghdad')::time);

    IF NOT v_blocked THEN
      SELECT EXISTS (
        SELECT 1 FROM public.listing_availability a
         WHERE a.listing_id = p_listing_id AND a.price IS NULL
           AND p_date BETWEEN a.start_date AND a.end_date
           AND (a.start_time IS NULL OR a.end_time IS NULL OR (a.start_time < v_end AND a.end_time > v_start))
      ) INTO v_blocked;
    END IF;
    IF NOT v_blocked THEN
      SELECT EXISTS (
        SELECT 1 FROM public.bookings b
         WHERE b.listing_id = p_listing_id AND COALESCE(b.booking_date, b.checkin_date) = p_date
           AND b.status IN ('pending_payment','confirmed','completed')
           AND b.start_time < v_end AND b.end_time > v_start
      ) INTO v_blocked;
    END IF;
    SELECT a.price INTO v_custom FROM public.listing_availability a
     WHERE a.listing_id = p_listing_id AND a.price IS NOT NULL
       AND p_date BETWEEN a.start_date AND a.end_date
       AND (a.start_time IS NULL OR a.end_time IS NULL OR (a.start_time < v_end AND a.end_time > v_start))
     ORDER BY a.start_time NULLS LAST LIMIT 1;

    slot_start := v_start;
    slot_end := v_end;
    is_available := NOT v_blocked;
    price := COALESCE(v_custom, v_base_price);
    RETURN NEXT;
    v_custom := NULL;
    v_cursor := v_next;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_listing_bookable_dates(
  p_listing_id uuid,
  p_start_date date,
  p_end_date date,
  p_duration_hours integer DEFAULT 1,
  p_step_minutes integer DEFAULT 30
)
RETURNS TABLE(bookable_date date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_date date;
  v_min_hours integer;
  v_max_hours integer;
  v_step integer := GREATEST(COALESCE(NULLIF(p_step_minutes, 0), 30), 15);
  v_required_slots integer;
  v_streak integer;
  v_slot record;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date
     OR p_end_date - p_start_date > 62 THEN
    RAISE EXCEPTION 'Invalid availability date range';
  END IF;
  IF p_duration_hours IS NULL OR p_duration_hours < 1 OR p_duration_hours > 5 THEN
    RAISE EXCEPTION 'Booking duration must be between one and five hours';
  END IF;

  SELECT COALESCE(l.min_hours, 1), COALESCE(l.max_hours, 5)
    INTO v_min_hours, v_max_hours
    FROM public.listings l
   WHERE l.id = p_listing_id AND l.status = 'approved'::public.listing_status;
  IF NOT FOUND THEN RETURN; END IF;
  IF p_duration_hours < v_min_hours OR p_duration_hours > v_max_hours THEN RETURN; END IF;

  v_required_slots := CEIL((p_duration_hours * 60.0) / v_step)::integer;
  FOR v_date IN SELECT day_value::date FROM generate_series(p_start_date, p_end_date, interval '1 day') AS days(day_value) LOOP
    IF v_date < (now() AT TIME ZONE 'Asia/Baghdad')::date THEN CONTINUE; END IF;
    v_streak := 0;
    FOR v_slot IN
      SELECT g.* FROM public.get_listing_slot_grid(p_listing_id, v_date, v_step) g ORDER BY g.slot_start
    LOOP
      IF v_slot.is_available THEN
        v_streak := v_streak + 1;
        IF v_streak >= v_required_slots THEN
          bookable_date := v_date;
          RETURN NEXT;
          EXIT;
        END IF;
      ELSE
        v_streak := 0;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_listing_bookable_dates(uuid, date, date, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_listing_bookable_dates(uuid, date, date, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_listing_slot_grid(uuid, date, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_listing_slots(uuid, date) TO anon, authenticated;

-- Host booking RPC now returns the full financial and booking snapshot needed
-- by the host's View Details panel. LEFT JOIN preserves bookings even if an
-- old player profile is missing.
DROP FUNCTION public.host_search_bookings(uuid, text, public.booking_status, numeric, numeric, date, date, date, date, text, text);
CREATE FUNCTION public.host_search_bookings(
  host_id uuid,
  search_query text DEFAULT NULL,
  status_filter public.booking_status DEFAULT NULL,
  min_price numeric DEFAULT NULL,
  max_price numeric DEFAULT NULL,
  checkin_start date DEFAULT NULL,
  checkin_end date DEFAULT NULL,
  checkout_start date DEFAULT NULL,
  checkout_end date DEFAULT NULL,
  sort_by text DEFAULT 'created_at',
  sort_order text DEFAULT 'desc'
)
RETURNS TABLE(
  id uuid, listing_id uuid, listing_title text, guest_user_id uuid, guest_name text,
  guest_email text, guest_avatar text, checkin_date date, checkout_date date, nights integer,
  booking_date date, start_time time without time zone, end_time time without time zone,
  hours numeric, guests integer, host_payout_gross numeric, status public.booking_status,
  created_at timestamp with time zone, subtotal numeric, service_fee numeric, taxes numeric,
  total_price numeric, currency text, host_commission_amount numeric,
  host_payout_net numeric, notes text, pricing_breakdown jsonb,
  cancellation_policy_snapshot jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> host_id AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'You do not have permission to view these bookings';
  END IF;
  IF NOT public.has_role(host_id, 'host'::public.app_role) AND NOT public.has_role(host_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'This account is not a host';
  END IF;
  RETURN QUERY
  SELECT b.id, b.listing_id, l.title::text, b.guest_user_id,
    COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Guest')::text,
    COALESCE(p.email, '')::text, p.avatar_url::text, b.checkin_date, b.checkout_date,
    COALESCE(b.nights, 1)::integer, COALESCE(b.booking_date, b.checkin_date),
    b.start_time, b.end_time, b.hours, COALESCE(b.guests, 1)::integer,
    COALESCE(b.host_payout_gross, b.subtotal, 0)::numeric, b.status, b.created_at,
    b.subtotal, COALESCE(b.service_fee, 0), COALESCE(b.taxes, 0), b.total_price,
    COALESCE(b.currency, 'IQD')::text, COALESCE(b.host_commission_amount, 0),
    COALESCE(b.host_payout_net, b.host_payout_gross, b.subtotal, 0)::numeric,
    b.notes, b.pricing_breakdown, b.cancellation_policy_snapshot
  FROM public.bookings b
  INNER JOIN public.listings l ON l.id = b.listing_id
  LEFT JOIN public.profiles p ON p.id = b.guest_user_id
  WHERE l.host_user_id = host_id
    AND (search_query IS NULL OR l.title ILIKE '%' || search_query || '%'
      OR COALESCE(p.first_name, '') ILIKE '%' || search_query || '%'
      OR COALESCE(p.last_name, '') ILIKE '%' || search_query || '%'
      OR COALESCE(p.email, '') ILIKE '%' || search_query || '%')
    AND (status_filter IS NULL OR b.status = status_filter)
    AND (min_price IS NULL OR COALESCE(b.host_payout_gross, b.subtotal, 0) >= min_price)
    AND (max_price IS NULL OR COALESCE(b.host_payout_gross, b.subtotal, 0) <= max_price)
    AND (checkin_start IS NULL OR COALESCE(b.booking_date, b.checkin_date) >= checkin_start)
    AND (checkin_end IS NULL OR COALESCE(b.booking_date, b.checkin_date) <= checkin_end)
    AND (checkout_start IS NULL OR b.checkout_date >= checkout_start)
    AND (checkout_end IS NULL OR b.checkout_date <= checkout_end)
  ORDER BY
    CASE WHEN sort_by = 'created_at' AND sort_order = 'desc' THEN b.created_at END DESC,
    CASE WHEN sort_by = 'created_at' AND sort_order = 'asc' THEN b.created_at END ASC,
    CASE WHEN sort_by = 'host_payout_gross' AND sort_order = 'desc' THEN COALESCE(b.host_payout_gross, b.subtotal, 0) END DESC,
    CASE WHEN sort_by = 'host_payout_gross' AND sort_order = 'asc' THEN COALESCE(b.host_payout_gross, b.subtotal, 0) END ASC,
    CASE WHEN sort_by = 'checkin_date' AND sort_order = 'desc' THEN COALESCE(b.booking_date, b.checkin_date) END DESC,
    CASE WHEN sort_by = 'checkin_date' AND sort_order = 'asc' THEN COALESCE(b.booking_date, b.checkin_date) END ASC,
    b.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.host_search_bookings(uuid, text, public.booking_status, numeric, numeric, date, date, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_search_bookings(uuid, text, public.booking_status, numeric, numeric, date, date, date, date, text, text) TO authenticated;

-- Serialize new reservations per court, independently validate the requested
-- slot and calculate the charge from database prices (never from browser input).
CREATE OR REPLACE FUNCTION public.create_hourly_booking(
  p_listing_id uuid, p_booking_date date, p_start_time time without time zone,
  p_end_time time without time zone, p_players integer, p_subtotal numeric,
  p_pricing_breakdown jsonb DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_guest_user_id uuid := auth.uid();
  v_listing public.listings%ROWTYPE;
  v_hours numeric;
  v_cancellation_policy jsonb;
  v_service_fee_rate numeric;
  v_tax_rate numeric;
  v_host_commission_rate numeric;
  v_service_fee numeric;
  v_taxes numeric;
  v_total_price numeric;
  v_host_payout_gross numeric;
  v_host_commission_amount numeric;
  v_host_payout_net numeric;
  v_platform_revenue_total numeric;
  v_booking_id uuid;
  v_verified_subtotal numeric;
  v_slot_count integer;
  v_expected_slots integer;
  v_slots jsonb;
BEGIN
  IF v_guest_user_id IS NULL OR NOT public.has_role(v_guest_user_id, 'guest'::public.app_role) THEN
    RAISE EXCEPTION 'Player account required';
  END IF;
  IF public.check_guest_outstanding_debts(v_guest_user_id) THEN
    RAISE EXCEPTION 'OUTSTANDING_DEBT::Resolve your outstanding balance before making a new booking.';
  END IF;

  -- Court row lock serializes simultaneous requests for the same court.
  SELECT * INTO v_listing FROM public.listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND OR v_listing.status <> 'approved'::public.listing_status THEN
    RAISE EXCEPTION 'This court is not available for booking';
  END IF;
  IF p_booking_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL OR p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'Choose a valid booking date and time';
  END IF;
  v_hours := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 3600.0;
  IF v_hours <> trunc(v_hours) OR v_hours < GREATEST(COALESCE(v_listing.min_hours, 1), 1)
     OR v_hours > LEAST(COALESCE(v_listing.max_hours, 5), 5) THEN
    RAISE EXCEPTION 'Choose a whole-hour booking within this court''s booking limits';
  END IF;
  IF p_start_time < COALESCE(v_listing.opening_time, '08:00'::time)
     OR p_end_time > COALESCE(v_listing.closing_time, '22:00'::time) THEN
    RAISE EXCEPTION 'The requested time is outside court opening hours';
  END IF;
  IF p_players IS NULL OR p_players < 1 OR p_players > LEAST(COALESCE(v_listing.guests_max, 25), 25) THEN
    RAISE EXCEPTION 'Choose a valid number of players';
  END IF;
  IF (p_booking_date + p_start_time) < (now() AT TIME ZONE 'Asia/Baghdad') THEN
    RAISE EXCEPTION 'That time slot is in the past';
  END IF;

  SELECT count(*)::integer,
         COALESCE(sum(g.price * 0.5), 0),
         jsonb_agg(jsonb_build_object('start', g.slot_start, 'end', g.slot_end, 'price', g.price) ORDER BY g.slot_start)
    INTO v_slot_count, v_verified_subtotal, v_slots
    FROM public.get_listing_slot_grid(p_listing_id, p_booking_date, 30) g
   WHERE g.slot_start >= p_start_time AND g.slot_end <= p_end_time AND g.is_available;
  v_expected_slots := (v_hours * 2)::integer;
  IF v_slot_count <> v_expected_slots OR v_slots IS NULL
     OR (v_slots->0->>'start')::time <> p_start_time
     OR (v_slots->(v_expected_slots - 1)->>'end')::time <> p_end_time THEN
    RAISE EXCEPTION 'That date or time is unavailable. Please select an available slot.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.listing_availability a
     WHERE a.listing_id = p_listing_id AND a.price IS NULL
       AND p_booking_date BETWEEN a.start_date AND a.end_date
       AND (a.start_time IS NULL OR a.end_time IS NULL OR (a.start_time < p_end_time AND a.end_time > p_start_time))
  ) OR EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.listing_id = p_listing_id AND b.booking_date = p_booking_date
       AND b.status IN ('pending_payment','confirmed','completed')
       AND b.start_time < p_end_time AND b.end_time > p_start_time
  ) THEN
    RAISE EXCEPTION 'That date or time was just booked. Please choose another slot.';
  END IF;

  SELECT setting_value::numeric INTO v_service_fee_rate FROM public.platform_settings WHERE setting_key = 'default_guest_service_fee_rate' AND is_active;
  SELECT setting_value::numeric INTO v_tax_rate FROM public.platform_settings WHERE setting_key = 'default_tax_rate' AND is_active;
  SELECT setting_value::numeric INTO v_host_commission_rate FROM public.platform_settings WHERE setting_key = 'default_host_commission_rate' AND is_active;
  IF v_service_fee_rate IS NULL OR v_tax_rate IS NULL OR v_host_commission_rate IS NULL THEN
    RAISE EXCEPTION 'Platform financial settings not configured';
  END IF;

  v_service_fee := v_verified_subtotal * v_service_fee_rate;
  v_taxes := (v_verified_subtotal + v_service_fee) * v_tax_rate;
  v_total_price := v_verified_subtotal + v_service_fee + v_taxes;
  v_host_payout_gross := v_verified_subtotal;
  v_host_commission_amount := v_host_payout_gross * v_host_commission_rate;
  v_host_payout_net := v_host_payout_gross - v_host_commission_amount;
  v_platform_revenue_total := v_service_fee + v_taxes + v_host_commission_amount;

  SELECT jsonb_build_object('policy_key', cp.policy_key, 'name', cp.name, 'description', cp.description,
    'refund_percentage', cp.refund_percentage, 'days_before_checkin', cp.days_before_checkin)
    INTO v_cancellation_policy FROM public.cancellation_policies cp WHERE cp.id = v_listing.cancellation_policy_id;

  INSERT INTO public.bookings (
    listing_id, guest_user_id, booking_date, start_time, end_time, hours, price_per_hour,
    checkin_date, checkout_date, nights, guests, subtotal, cleaning_fee, service_fee, taxes,
    total_price, guest_service_fee_rate, tax_rate, host_commission_rate, host_commission_amount,
    host_payout_gross, host_payout_net, platform_revenue_total, cancellation_policy_snapshot,
    pricing_breakdown, notes, status, currency
  ) VALUES (
    p_listing_id, v_guest_user_id, p_booking_date, p_start_time, p_end_time, v_hours,
    ROUND(v_verified_subtotal / NULLIF(v_hours, 0), 2), p_booking_date, p_booking_date, 1,
    p_players, v_verified_subtotal, 0, v_service_fee, v_taxes, v_total_price,
    v_service_fee_rate, v_tax_rate, v_host_commission_rate, v_host_commission_amount,
    v_host_payout_gross, v_host_payout_net, v_platform_revenue_total, v_cancellation_policy,
    jsonb_build_object('hours', v_hours, 'slot_minutes', 30, 'price_per_hour', ROUND(v_verified_subtotal / NULLIF(v_hours, 0), 2), 'slots', v_slots),
    p_notes, 'pending_payment'::public.booking_status, COALESCE(v_listing.currency, 'IQD')
  ) RETURNING id INTO v_booking_id;

  RETURN json_build_object('success', true, 'booking_id', v_booking_id, 'hours', v_hours, 'total_price', v_total_price);
END;
$$;

REVOKE ALL ON FUNCTION public.create_hourly_booking(uuid, date, time without time zone, time without time zone, integer, numeric, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_hourly_booking(uuid, date, time without time zone, time without time zone, integer, numeric, jsonb, text) TO authenticated;

-- Make inbox message changes available to the app's unread badge and live toast.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
