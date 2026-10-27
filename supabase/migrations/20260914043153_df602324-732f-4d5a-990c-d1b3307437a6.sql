-- 1. Hourly columns on bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_date date,
  ADD COLUMN IF NOT EXISTS start_time time without time zone,
  ADD COLUMN IF NOT EXISTS end_time time without time zone,
  ADD COLUMN IF NOT EXISTS hours numeric,
  ADD COLUMN IF NOT EXISTS price_per_hour numeric;

CREATE INDEX IF NOT EXISTS bookings_listing_date_idx ON public.bookings (listing_id, booking_date);

-- 2. Hourly limits on listings
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS min_hours integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_hours integer DEFAULT 4;

-- 3. Optional intra-day windows on availability rules
ALTER TABLE public.listing_availability
  ADD COLUMN IF NOT EXISTS start_time time without time zone,
  ADD COLUMN IF NOT EXISTS end_time time without time zone;

-- 4. Slot availability helper
CREATE OR REPLACE FUNCTION public.get_listing_slots(p_listing_id uuid, p_date date)
RETURNS TABLE (
  slot_start time without time zone,
  slot_end time without time zone,
  is_available boolean,
  price numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_open time;
  v_close time;
  v_duration integer;
  v_base_price numeric;
  v_cursor time;
  v_next time;
  v_blocked boolean;
  v_custom numeric;
BEGIN
  SELECT COALESCE(l.opening_time, '08:00'::time),
         COALESCE(l.closing_time, '22:00'::time),
         COALESCE(NULLIF(l.slot_duration_minutes, 0), 60),
         l.base_price
    INTO v_open, v_close, v_duration, v_base_price
  FROM public.listings l
  WHERE l.id = p_listing_id;

  IF v_open IS NULL THEN
    RETURN;
  END IF;

  v_cursor := v_open;
  WHILE v_cursor + (v_duration || ' minutes')::interval <= v_close LOOP
    v_next := v_cursor + (v_duration || ' minutes')::interval;

    -- blocked by an availability rule with no price (full day or matching window)
    SELECT EXISTS (
      SELECT 1 FROM public.listing_availability a
      WHERE a.listing_id = p_listing_id
        AND a.price IS NULL
        AND p_date BETWEEN a.start_date AND a.end_date
        AND (
          a.start_time IS NULL OR a.end_time IS NULL
          OR (a.start_time < v_next AND a.end_time > v_cursor)
        )
    ) INTO v_blocked;

    -- blocked by an existing booking overlapping this slot
    IF NOT v_blocked THEN
      SELECT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.listing_id = p_listing_id
          AND b.booking_date = p_date
          AND b.status IN ('pending_payment','confirmed','completed')
          AND b.start_time < v_next
          AND b.end_time > v_cursor
      ) INTO v_blocked;
    END IF;

    -- custom hourly price for this window
    SELECT a.price INTO v_custom
    FROM public.listing_availability a
    WHERE a.listing_id = p_listing_id
      AND a.price IS NOT NULL
      AND p_date BETWEEN a.start_date AND a.end_date
      AND (
        a.start_time IS NULL OR a.end_time IS NULL
        OR (a.start_time < v_next AND a.end_time > v_cursor)
      )
    ORDER BY a.start_time NULLS LAST
    LIMIT 1;

    slot_start := v_cursor;
    slot_end := v_next;
    is_available := NOT v_blocked;
    price := COALESCE(v_custom, v_base_price);
    RETURN NEXT;

    v_custom := NULL;
    v_cursor := v_next;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_listing_slots(uuid, date) TO anon, authenticated, service_role;

-- 5. Hourly booking creation with financial snapshot
CREATE OR REPLACE FUNCTION public.create_hourly_booking(
  p_listing_id uuid,
  p_booking_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_players integer,
  p_subtotal numeric,
  p_pricing_breakdown jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_guest_user_id uuid;
  v_listing RECORD;
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
BEGIN
  v_guest_user_id := auth.uid();
  IF v_guest_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  IF check_guest_outstanding_debts(v_guest_user_id) THEN
    RAISE EXCEPTION 'OUTSTANDING_DEBT::You have an outstanding debt that must be paid before making new bookings. Please visit your Payments page to resolve this.';
  END IF;

  SELECT * INTO v_listing FROM public.listings WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court not found';
  END IF;
  IF v_listing.status <> 'approved'::listing_status THEN
    RAISE EXCEPTION 'This court is not available for booking';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'End time must be after start time';
  END IF;

  v_hours := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 3600.0;

  IF v_listing.min_hours IS NOT NULL AND v_hours < v_listing.min_hours THEN
    RAISE EXCEPTION 'Minimum booking length is % hour(s)', v_listing.min_hours;
  END IF;
  IF v_listing.max_hours IS NOT NULL AND v_hours > v_listing.max_hours THEN
    RAISE EXCEPTION 'Maximum booking length is % hour(s)', v_listing.max_hours;
  END IF;

  IF v_listing.opening_time IS NOT NULL AND p_start_time < v_listing.opening_time THEN
    RAISE EXCEPTION 'Court opens at %', v_listing.opening_time;
  END IF;
  IF v_listing.closing_time IS NOT NULL AND p_end_time > v_listing.closing_time THEN
    RAISE EXCEPTION 'Court closes at %', v_listing.closing_time;
  END IF;

  IF p_players IS NOT NULL AND v_listing.guests_max IS NOT NULL AND p_players > v_listing.guests_max THEN
    RAISE EXCEPTION 'This court allows a maximum of % players', v_listing.guests_max;
  END IF;

  IF (p_booking_date + p_start_time) < (now() AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'That time slot is in the past';
  END IF;

  -- blocked windows
  IF EXISTS (
    SELECT 1 FROM public.listing_availability a
    WHERE a.listing_id = p_listing_id
      AND a.price IS NULL
      AND p_booking_date BETWEEN a.start_date AND a.end_date
      AND (a.start_time IS NULL OR a.end_time IS NULL OR (a.start_time < p_end_time AND a.end_time > p_start_time))
  ) THEN
    RAISE EXCEPTION 'That time slot is unavailable';
  END IF;

  -- overlapping bookings
  IF EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.listing_id = p_listing_id
      AND b.booking_date = p_booking_date
      AND b.status IN ('pending_payment','confirmed','completed')
      AND b.start_time < p_end_time
      AND b.end_time > p_start_time
  ) THEN
    RAISE EXCEPTION 'That time slot has just been booked. Please pick another slot.';
  END IF;

  SELECT setting_value::numeric INTO v_service_fee_rate
  FROM public.platform_settings WHERE setting_key = 'default_guest_service_fee_rate' AND is_active = true;
  SELECT setting_value::numeric INTO v_tax_rate
  FROM public.platform_settings WHERE setting_key = 'default_tax_rate' AND is_active = true;
  SELECT setting_value::numeric INTO v_host_commission_rate
  FROM public.platform_settings WHERE setting_key = 'default_host_commission_rate' AND is_active = true;

  IF v_service_fee_rate IS NULL OR v_tax_rate IS NULL OR v_host_commission_rate IS NULL THEN
    RAISE EXCEPTION 'Platform financial settings not configured';
  END IF;

  v_service_fee := p_subtotal * v_service_fee_rate;
  v_taxes := (p_subtotal + v_service_fee) * v_tax_rate;
  v_total_price := p_subtotal + v_service_fee + v_taxes;
  v_host_payout_gross := p_subtotal;
  v_host_commission_amount := v_host_payout_gross * v_host_commission_rate;
  v_host_payout_net := v_host_payout_gross - v_host_commission_amount;
  v_platform_revenue_total := v_service_fee + v_taxes + v_host_commission_amount;

  SELECT jsonb_build_object(
    'policy_key', cp.policy_key,
    'name', cp.name,
    'description', cp.description,
    'refund_percentage', cp.refund_percentage,
    'days_before_checkin', cp.days_before_checkin
  ) INTO v_cancellation_policy
  FROM public.cancellation_policies cp
  WHERE cp.id = v_listing.cancellation_policy_id;

  INSERT INTO public.bookings (
    listing_id, guest_user_id,
    booking_date, start_time, end_time, hours, price_per_hour,
    checkin_date, checkout_date, nights,
    guests, subtotal, cleaning_fee, service_fee, taxes, total_price,
    guest_service_fee_rate, tax_rate, host_commission_rate,
    host_commission_amount, host_payout_gross, host_payout_net,
    platform_revenue_total, cancellation_policy_snapshot,
    pricing_breakdown, notes, status
  ) VALUES (
    p_listing_id, v_guest_user_id,
    p_booking_date, p_start_time, p_end_time, v_hours,
    ROUND(p_subtotal / NULLIF(v_hours, 0), 2),
    p_booking_date, p_booking_date, 1,
    COALESCE(p_players, 1), p_subtotal, 0, v_service_fee, v_taxes, v_total_price,
    v_service_fee_rate, v_tax_rate, v_host_commission_rate,
    v_host_commission_amount, v_host_payout_gross, v_host_payout_net,
    v_platform_revenue_total, v_cancellation_policy,
    p_pricing_breakdown, p_notes, 'pending_payment'::booking_status
  ) RETURNING id INTO v_booking_id;

  RETURN json_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'hours', v_hours,
    'total_price', v_total_price
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_hourly_booking(uuid, date, time without time zone, time without time zone, integer, numeric, jsonb, text) TO authenticated, service_role;

-- 6. Backfill hourly fields for existing seeded bookings so screens render consistently
UPDATE public.bookings b
SET booking_date = b.checkin_date,
    start_time = COALESCE(l.opening_time, '18:00'::time),
    end_time = COALESCE(l.opening_time, '18:00'::time) + interval '1 hour',
    hours = 1,
    price_per_hour = ROUND(b.subtotal, 2)
FROM public.listings l
WHERE l.id = b.listing_id AND b.booking_date IS NULL;
