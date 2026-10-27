-- A guest's cash checkout submits a request. The booking remains reserved until its host accepts or declines it.
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
           AND b.status IN ('pending_payment','pending_host_confirmation','confirmed','completed')
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
       AND b.status IN ('pending_payment','pending_host_confirmation','confirmed','completed')
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

create or replace function public.confirm_booking_payment(
  p_booking_id uuid, p_amount numeric, p_provider text, p_currency text default 'IQD'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_booking public.bookings; v_transaction uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if (select auth.uid()) is null or v_booking.guest_user_id <> (select auth.uid()) then raise exception 'Access denied'; end if;
  if v_booking.status = 'pending_host_confirmation' then return jsonb_build_object('success', true, 'booking_id', p_booking_id, 'status', v_booking.status); end if;
  if v_booking.status <> 'pending_payment' then raise exception 'Booking is not awaiting payment'; end if;
  if p_provider <> 'cash' then raise exception 'Only cash payment is available'; end if;
  if p_amount <> v_booking.total_price then raise exception 'Payment amount does not match booking total'; end if;
  insert into public.transactions(booking_id, amount, currency, provider, status, type)
  values (p_booking_id, p_amount, p_currency, 'cash', 'confirmed', 'booking_payment') returning id into v_transaction;
  update public.bookings set status='pending_host_confirmation', updated_at=now() where id=p_booking_id;
  return jsonb_build_object('success', true, 'booking_id', p_booking_id, 'transaction_id', v_transaction, 'payment_method', 'cash', 'status', 'pending_host_confirmation');
end;
$$;

CREATE OR REPLACE FUNCTION public.host_accept_booking(p_booking_id uuid)
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

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'status', v_booking.status
  );
END;
$$;

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
     AND b.status = 'pending_host_confirmation'::public.booking_status
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

create or replace function public.cancel_booking_with_refund(p_booking_id uuid, p_cancellation_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_booking public.bookings; v_refund numeric := 0;
begin
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if (select auth.uid()) is null or v_booking.guest_user_id <> (select auth.uid()) then raise exception 'Access denied'; end if;
  if v_booking.status not in ('pending_payment','pending_host_confirmation','confirmed') then raise exception 'Booking cannot be cancelled'; end if;
  if v_booking.status = 'confirmed' then v_refund := v_booking.total_price; end if;
  update public.bookings set status='cancelled_guest', notes=concat_ws(E'\n', notes, p_cancellation_reason), updated_at=now() where id=p_booking_id;
  return jsonb_build_object('success', true, 'booking_id', p_booking_id, 'refund_amount', v_refund, 'refund_method', 'cash');
end;
$$;


-- Keep host approval requests visible in admin booking totals.
create or replace function public.get_admin_dashboard_kpis()
returns table (
  active_bookings numeric, cancelled_bookings numeric, occupancy_rate numeric,
  open_disputes numeric, pending_listings numeric, total_revenue numeric
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not private.has_role((select auth.uid()), 'admin') then raise exception 'Administrator access required'; end if;
  return query select
    (select count(*)::numeric from public.bookings where status in ('pending_payment','pending_host_confirmation','confirmed')),
    (select count(*)::numeric from public.bookings where status in ('cancelled_guest','cancelled_host','expired')),
    case when (select count(*) from public.listings where status='approved') = 0 then 0 else
      least(100, (select count(*)::numeric from public.bookings where status in ('confirmed','completed')) /
      ((select count(*) from public.listings where status='approved') * 30)::numeric * 100) end,
    (select count(*)::numeric from public.disputes where status in ('open','in_progress','escalated','pending')),
    (select count(*)::numeric from public.listings where status='pending'),
    (select coalesce(sum(platform_revenue_total),0) from public.bookings where status in ('confirmed','completed'));
end;
$$;

-- Projects that revoke EXECUTE from PUBLIC require explicit app-role grants.
GRANT EXECUTE ON FUNCTION public.get_listing_slot_grid(uuid, date, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_hourly_booking(uuid, date, time without time zone, time without time zone, integer, numeric, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_booking_payment(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_accept_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_reject_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_with_refund(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_kpis() TO authenticated;
