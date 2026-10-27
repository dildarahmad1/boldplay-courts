-- The dashboard query used an integer return type for `nights`, while the
-- bookings table stores it as numeric. PostgreSQL rejects the entire RPC when
-- it encounters a real booking, so hosts were unable to see any bookings.
-- Keep the public response shape stable and normalize the value explicitly.

CREATE OR REPLACE FUNCTION public.host_search_bookings(
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
  id uuid,
  listing_id uuid,
  listing_title text,
  guest_user_id uuid,
  guest_name text,
  guest_email text,
  guest_avatar text,
  checkin_date date,
  checkout_date date,
  nights integer,
  booking_date date,
  start_time time without time zone,
  end_time time without time zone,
  hours numeric,
  guests integer,
  host_payout_gross numeric,
  status public.booking_status,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- A host can only read their own bookings. Administrators may inspect a
  -- host's bookings when needed for support.
  IF auth.uid() IS NULL OR (
    auth.uid() <> host_id
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'You do not have permission to view these bookings';
  END IF;

  IF NOT public.has_role(host_id, 'host'::public.app_role)
     AND NOT public.has_role(host_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'This account is not a host';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.listing_id,
    l.title::text,
    b.guest_user_id,
    COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Guest')::text,
    COALESCE(p.email, '')::text,
    p.avatar_url::text,
    b.checkin_date,
    b.checkout_date,
    COALESCE(b.nights, 1)::integer,
    COALESCE(b.booking_date, b.checkin_date),
    b.start_time,
    b.end_time,
    b.hours,
    b.guests,
    COALESCE(b.host_payout_gross, b.subtotal, 0)::numeric,
    b.status,
    b.created_at
  FROM public.bookings b
  INNER JOIN public.listings l ON l.id = b.listing_id
  LEFT JOIN public.profiles p ON p.id = b.guest_user_id
  WHERE l.host_user_id = host_id
    AND (
      search_query IS NULL
      OR l.title ILIKE '%' || search_query || '%'
      OR COALESCE(p.first_name, '') ILIKE '%' || search_query || '%'
      OR COALESCE(p.last_name, '') ILIKE '%' || search_query || '%'
      OR COALESCE(p.email, '') ILIKE '%' || search_query || '%'
    )
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

CREATE OR REPLACE FUNCTION public.admin_search_bookings(
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
  id uuid, booking_display_id text, listing_id uuid, listing_title text,
  listing_city text, listing_country text, host_user_id uuid, host_name text,
  host_email text, host_avatar text, guest_user_id uuid, guest_name text,
  guest_email text, guest_avatar text, checkin_date date, checkout_date date,
  nights integer, booking_date date, start_time time without time zone,
  end_time time without time zone, hours numeric, guests integer,
  total_price numeric, status public.booking_status,
  created_at timestamp with time zone, updated_at timestamp with time zone
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can search all bookings';
  END IF;

  RETURN QUERY
  SELECT b.id, substring(b.id::text, 1, 8), b.listing_id, l.title::text,
    l.city::text, l.country::text, l.host_user_id,
    COALESCE(NULLIF(trim(concat_ws(' ', host_prof.first_name, host_prof.last_name)), ''), 'Host')::text,
    COALESCE(host_prof.email, '')::text, host_prof.avatar_url::text,
    b.guest_user_id,
    COALESCE(NULLIF(trim(concat_ws(' ', guest_prof.first_name, guest_prof.last_name)), ''), 'Guest')::text,
    COALESCE(guest_prof.email, '')::text, guest_prof.avatar_url::text,
    b.checkin_date, b.checkout_date, COALESCE(b.nights, 1)::integer,
    COALESCE(b.booking_date, b.checkin_date), b.start_time, b.end_time,
    b.hours, b.guests, b.total_price, b.status, b.created_at, b.updated_at
  FROM public.bookings b
  INNER JOIN public.listings l ON l.id = b.listing_id
  LEFT JOIN public.profiles host_prof ON host_prof.id = l.host_user_id
  LEFT JOIN public.profiles guest_prof ON guest_prof.id = b.guest_user_id
  WHERE (search_query IS NULL OR l.title ILIKE '%' || search_query || '%'
    OR COALESCE(host_prof.first_name, '') ILIKE '%' || search_query || '%'
    OR COALESCE(host_prof.last_name, '') ILIKE '%' || search_query || '%'
    OR COALESCE(host_prof.email, '') ILIKE '%' || search_query || '%'
    OR COALESCE(guest_prof.first_name, '') ILIKE '%' || search_query || '%'
    OR COALESCE(guest_prof.last_name, '') ILIKE '%' || search_query || '%'
    OR COALESCE(guest_prof.email, '') ILIKE '%' || search_query || '%')
    AND (status_filter IS NULL OR b.status = status_filter)
    AND (min_price IS NULL OR b.total_price >= min_price)
    AND (max_price IS NULL OR b.total_price <= max_price)
    AND (checkin_start IS NULL OR COALESCE(b.booking_date, b.checkin_date) >= checkin_start)
    AND (checkin_end IS NULL OR COALESCE(b.booking_date, b.checkin_date) <= checkin_end)
    AND (checkout_start IS NULL OR b.checkout_date >= checkout_start)
    AND (checkout_end IS NULL OR b.checkout_date <= checkout_end)
  ORDER BY
    CASE WHEN sort_by = 'created_at' AND sort_order = 'desc' THEN b.created_at END DESC,
    CASE WHEN sort_by = 'created_at' AND sort_order = 'asc' THEN b.created_at END ASC,
    CASE WHEN sort_by = 'checkin_date' AND sort_order = 'desc' THEN COALESCE(b.booking_date, b.checkin_date) END DESC,
    CASE WHEN sort_by = 'checkin_date' AND sort_order = 'asc' THEN COALESCE(b.booking_date, b.checkin_date) END ASC,
    CASE WHEN sort_by = 'total_price' AND sort_order = 'desc' THEN b.total_price END DESC,
    CASE WHEN sort_by = 'total_price' AND sort_order = 'asc' THEN b.total_price END ASC,
    b.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.host_search_bookings(uuid, text, public.booking_status, numeric, numeric, date, date, date, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_search_bookings(text, public.booking_status, numeric, numeric, date, date, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_search_bookings(uuid, text, public.booking_status, numeric, numeric, date, date, date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_search_bookings(text, public.booking_status, numeric, numeric, date, date, date, date, text, text) TO authenticated;
