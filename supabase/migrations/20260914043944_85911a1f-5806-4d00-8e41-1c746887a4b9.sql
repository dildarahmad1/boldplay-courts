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
  v_open_min integer;
  v_close_min integer;
  v_duration integer;
  v_base_price numeric;
  v_cursor integer;
  v_next integer;
  v_start time;
  v_end time;
  v_blocked boolean;
  v_custom numeric;
BEGIN
  SELECT (EXTRACT(HOUR FROM COALESCE(l.opening_time, '08:00'::time)) * 60
          + EXTRACT(MINUTE FROM COALESCE(l.opening_time, '08:00'::time)))::int,
         (EXTRACT(HOUR FROM COALESCE(l.closing_time, '22:00'::time)) * 60
          + EXTRACT(MINUTE FROM COALESCE(l.closing_time, '22:00'::time)))::int,
         COALESCE(NULLIF(l.slot_duration_minutes, 0), 60),
         l.base_price
    INTO v_open_min, v_close_min, v_duration, v_base_price
  FROM public.listings l
  WHERE l.id = p_listing_id;

  IF v_open_min IS NULL OR v_close_min IS NULL OR v_close_min <= v_open_min THEN
    RETURN;
  END IF;

  v_cursor := v_open_min;
  WHILE v_cursor + v_duration <= v_close_min LOOP
    v_next := v_cursor + v_duration;
    v_start := make_time(v_cursor / 60, v_cursor % 60, 0);
    v_end := make_time((v_next / 60) % 24, v_next % 60, 0);

    SELECT EXISTS (
      SELECT 1 FROM public.listing_availability a
      WHERE a.listing_id = p_listing_id
        AND a.price IS NULL
        AND p_date BETWEEN a.start_date AND a.end_date
        AND (
          a.start_time IS NULL OR a.end_time IS NULL
          OR (a.start_time < v_end AND a.end_time > v_start)
        )
    ) INTO v_blocked;

    IF NOT v_blocked THEN
      SELECT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.listing_id = p_listing_id
          AND b.booking_date = p_date
          AND b.status IN ('pending_payment','confirmed','completed')
          AND b.start_time < v_end
          AND b.end_time > v_start
      ) INTO v_blocked;
    END IF;

    SELECT a.price INTO v_custom
    FROM public.listing_availability a
    WHERE a.listing_id = p_listing_id
      AND a.price IS NOT NULL
      AND p_date BETWEEN a.start_date AND a.end_date
      AND (
        a.start_time IS NULL OR a.end_time IS NULL
        OR (a.start_time < v_end AND a.end_time > v_start)
      )
    ORDER BY a.start_time NULLS LAST
    LIMIT 1;

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

GRANT EXECUTE ON FUNCTION public.get_listing_slots(uuid, date) TO anon, authenticated, service_role;
