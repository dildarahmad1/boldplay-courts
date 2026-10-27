DROP FUNCTION IF EXISTS public.host_search_bookings(uuid, text, booking_status, numeric, numeric, date, date, date, date, text, text);
DROP FUNCTION IF EXISTS public.admin_search_bookings(text, booking_status, numeric, numeric, date, date, date, date, text, text);

CREATE FUNCTION public.host_search_bookings(host_id uuid, search_query text DEFAULT NULL::text, status_filter booking_status DEFAULT NULL::booking_status, min_price numeric DEFAULT NULL::numeric, max_price numeric DEFAULT NULL::numeric, checkin_start date DEFAULT NULL::date, checkin_end date DEFAULT NULL::date, checkout_start date DEFAULT NULL::date, checkout_end date DEFAULT NULL::date, sort_by text DEFAULT 'created_at'::text, sort_order text DEFAULT 'desc'::text)
 RETURNS TABLE(id uuid, listing_id uuid, listing_title text, guest_user_id uuid, guest_name text, guest_email text, guest_avatar text, checkin_date date, checkout_date date, nights integer, booking_date date, start_time time without time zone, end_time time without time zone, hours numeric, guests integer, host_payout_gross numeric, status booking_status, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(host_id, 'host'::app_role) AND NOT has_role(host_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only hosts can search their bookings';
  END IF;

  RETURN QUERY
  SELECT 
    b.id,
    b.listing_id,
    l.title as listing_title,
    b.guest_user_id,
    (p.first_name || ' ' || p.last_name) as guest_name,
    p.email as guest_email,
    p.avatar_url as guest_avatar,
    b.checkin_date,
    b.checkout_date,
    b.nights,
    COALESCE(b.booking_date, b.checkin_date) as booking_date,
    b.start_time,
    b.end_time,
    b.hours,
    b.guests,
    b.host_payout_gross,
    b.status,
    b.created_at
  FROM bookings b
  INNER JOIN listings l ON l.id = b.listing_id
  INNER JOIN profiles p ON p.id = b.guest_user_id
  WHERE 
    l.host_user_id = host_id
    AND (search_query IS NULL OR 
         l.title ILIKE '%' || search_query || '%' OR
         p.first_name ILIKE '%' || search_query || '%' OR
         p.last_name ILIKE '%' || search_query || '%' OR
         p.email ILIKE '%' || search_query || '%')
    AND (status_filter IS NULL OR b.status = status_filter)
    AND (min_price IS NULL OR b.host_payout_gross >= min_price)
    AND (max_price IS NULL OR b.host_payout_gross <= max_price)
    AND (checkin_start IS NULL OR COALESCE(b.booking_date, b.checkin_date) >= checkin_start)
    AND (checkin_end IS NULL OR COALESCE(b.booking_date, b.checkin_date) <= checkin_end)
    AND (checkout_start IS NULL OR b.checkout_date >= checkout_start)
    AND (checkout_end IS NULL OR b.checkout_date <= checkout_end)
  ORDER BY
    CASE WHEN sort_by = 'created_at' AND sort_order = 'desc' THEN b.created_at END DESC,
    CASE WHEN sort_by = 'created_at' AND sort_order = 'asc' THEN b.created_at END ASC,
    CASE WHEN sort_by = 'host_payout_gross' AND sort_order = 'desc' THEN b.host_payout_gross END DESC,
    CASE WHEN sort_by = 'host_payout_gross' AND sort_order = 'asc' THEN b.host_payout_gross END ASC,
    CASE WHEN sort_by = 'checkin_date' AND sort_order = 'desc' THEN COALESCE(b.booking_date, b.checkin_date) END DESC,
    CASE WHEN sort_by = 'checkin_date' AND sort_order = 'asc' THEN COALESCE(b.booking_date, b.checkin_date) END ASC,
    b.created_at DESC;
END;
$function$;

CREATE FUNCTION public.admin_search_bookings(search_query text DEFAULT NULL::text, status_filter booking_status DEFAULT NULL::booking_status, min_price numeric DEFAULT NULL::numeric, max_price numeric DEFAULT NULL::numeric, checkin_start date DEFAULT NULL::date, checkin_end date DEFAULT NULL::date, checkout_start date DEFAULT NULL::date, checkout_end date DEFAULT NULL::date, sort_by text DEFAULT 'created_at'::text, sort_order text DEFAULT 'desc'::text)
 RETURNS TABLE(id uuid, booking_display_id text, listing_id uuid, listing_title text, listing_city text, listing_country text, host_user_id uuid, host_name text, host_email text, host_avatar text, guest_user_id uuid, guest_name text, guest_email text, guest_avatar text, checkin_date date, checkout_date date, nights integer, booking_date date, start_time time without time zone, end_time time without time zone, hours numeric, guests integer, total_price numeric, status booking_status, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can search all bookings';
  END IF;

  RETURN QUERY
  SELECT 
    b.id,
    SUBSTRING(b.id::TEXT, 1, 8) as booking_display_id,
    b.listing_id,
    l.title as listing_title,
    l.city as listing_city,
    l.country as listing_country,
    l.host_user_id,
    (host_prof.first_name || ' ' || host_prof.last_name) as host_name,
    host_prof.email as host_email,
    host_prof.avatar_url as host_avatar,
    b.guest_user_id,
    (guest_prof.first_name || ' ' || guest_prof.last_name) as guest_name,
    guest_prof.email as guest_email,
    guest_prof.avatar_url as guest_avatar,
    b.checkin_date,
    b.checkout_date,
    b.nights,
    COALESCE(b.booking_date, b.checkin_date) as booking_date,
    b.start_time,
    b.end_time,
    b.hours,
    b.guests,
    b.total_price,
    b.status,
    b.created_at,
    b.updated_at
  FROM bookings b
  INNER JOIN listings l ON l.id = b.listing_id
  INNER JOIN profiles host_prof ON host_prof.id = l.host_user_id
  INNER JOIN profiles guest_prof ON guest_prof.id = b.guest_user_id
  WHERE 
    (search_query IS NULL OR 
     l.title ILIKE '%' || search_query || '%' OR
     host_prof.first_name ILIKE '%' || search_query || '%' OR
     host_prof.last_name ILIKE '%' || search_query || '%' OR
     host_prof.email ILIKE '%' || search_query || '%' OR
     guest_prof.first_name ILIKE '%' || search_query || '%' OR
     guest_prof.last_name ILIKE '%' || search_query || '%' OR
     guest_prof.email ILIKE '%' || search_query || '%')
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
$function$;

GRANT EXECUTE ON FUNCTION public.host_search_bookings(uuid, text, booking_status, numeric, numeric, date, date, date, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_search_bookings(text, booking_status, numeric, numeric, date, date, date, date, text, text) TO authenticated, service_role;