


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'host',
    'guest'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."booking_status" AS ENUM (
    'pending_payment',
    'confirmed',
    'cancelled_guest',
    'cancelled_host',
    'completed',
    'expired',
    'pending_host_confirmation'
);


ALTER TYPE "public"."booking_status" OWNER TO "postgres";


CREATE TYPE "public"."cancellation_policy" AS ENUM (
    'flexible',
    'moderate',
    'strict'
);


ALTER TYPE "public"."cancellation_policy" OWNER TO "postgres";


CREATE TYPE "public"."court_type" AS ENUM (
    'football',
    'padel',
    'basketball',
    'tennis',
    'volleyball',
    'multi_use',
    'other'
);


ALTER TYPE "public"."court_type" OWNER TO "postgres";


CREATE TYPE "public"."dispute_category" AS ENUM (
    'refund_request',
    'policy_violation',
    'property_damage',
    'cleanliness_issue',
    'amenity_issue',
    'safety_concern',
    'billing_dispute',
    'other'
);


ALTER TYPE "public"."dispute_category" OWNER TO "postgres";


CREATE TYPE "public"."dispute_status" AS ENUM (
    'open',
    'in_progress',
    'resolved',
    'closed',
    'escalated',
    'pending',
    'on_hold',
    'resolved_approved',
    'resolved_declined'
);


ALTER TYPE "public"."dispute_status" OWNER TO "postgres";


CREATE TYPE "public"."listing_status" AS ENUM (
    'draft',
    'pending',
    'approved',
    'rejected',
    'blocked'
);


ALTER TYPE "public"."listing_status" OWNER TO "postgres";


CREATE TYPE "public"."payout_status_enum" AS ENUM (
    'pending',
    'completed',
    'failed',
    'cancelled'
);


ALTER TYPE "public"."payout_status_enum" OWNER TO "postgres";


CREATE TYPE "public"."property_type" AS ENUM (
    'court',
    'field',
    'arena',
    'sports_complex',
    'venue'
);


ALTER TYPE "public"."property_type" OWNER TO "postgres";


CREATE TYPE "public"."review_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'blocked'
);


ALTER TYPE "public"."review_status" OWNER TO "postgres";


CREATE TYPE "public"."surface_type" AS ENUM (
    'grass',
    'artificial_turf',
    'hardwood',
    'concrete',
    'clay',
    'sand',
    'rubber',
    'other'
);


ALTER TYPE "public"."surface_type" OWNER TO "postgres";


CREATE TYPE "public"."thread_type" AS ENUM (
    'user_to_user',
    'user_to_support'
);


ALTER TYPE "public"."thread_type" OWNER TO "postgres";


CREATE TYPE "public"."user_status" AS ENUM (
    'active',
    'inactive',
    'suspended'
);


ALTER TYPE "public"."user_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."create_dispute_with_support_thread"("p_booking_id" "uuid", "p_category" "public"."dispute_category", "p_subject" "text", "p_description" "text", "p_requested_refund_amount" numeric DEFAULT NULL::numeric, "p_attachment_urls" "text"[] DEFAULT ARRAY[]::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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
$$;


ALTER FUNCTION "private"."create_dispute_with_support_thread"("p_booking_id" "uuid", "p_category" "public"."dispute_category", "p_subject" "text", "p_description" "text", "p_requested_refund_amount" numeric, "p_attachment_urls" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles(id, email, first_name, last_name, status, verified)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'first_name', split_part(coalesce(new.raw_user_meta_data ->> 'full_name', ''), ' ', 1)),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    'active',
    new.email_confirmed_at is not null
  );
  insert into public.user_roles(user_id, role) values (new.id, 'guest');
  return new;
end;
$$;


ALTER FUNCTION "private"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."has_role"("target_user" "uuid", "target_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists(select 1 from public.user_roles where user_id = target_user and role = target_role);
$$;


ALTER FUNCTION "private"."has_role"("target_user" "uuid", "target_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_verified_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set verified = true, updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."sync_verified_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_user_soft"("p_user_id" "uuid", "p_admin_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid()<>p_admin_user_id or not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  if p_user_id=auth.uid() then raise exception 'you cannot delete your own account'; end if;
  update profiles set status='inactive',first_name='Deleted',last_name='User',phone=null,avatar_url=null,updated_at=now() where id=p_user_id;
  return jsonb_build_object('success',found);
end $$;


ALTER FUNCTION "public"."admin_delete_user_soft"("p_user_id" "uuid", "p_admin_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_export_reviews_custom_report"("p_start_date" "date", "p_end_date" "date", "p_city_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_min_ratings" integer[] DEFAULT NULL::integer[]) RETURNS TABLE("listing_id" "uuid", "listing_name" "text", "city_name" "text", "country_name" "text", "user_full_name" "text", "review_text" "text", "rating" numeric, "review_created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  return query select l.id,l.title,l.city,l.country,trim(concat_ws(' ',p.first_name,p.last_name)),r.text,r.rating,r.created_at
  from reviews r join listings l on l.id=r.listing_id left join profiles p on p.id=r.author_user_id
  where r.created_at::date between p_start_date and p_end_date
    and (p_city_ids is null or l.city_id=any(p_city_ids)) and (p_min_ratings is null or r.rating::integer=any(p_min_ratings))
  order by r.created_at desc;
end $$;


ALTER FUNCTION "public"."admin_export_reviews_custom_report"("p_start_date" "date", "p_end_date" "date", "p_city_ids" "uuid"[], "p_min_ratings" integer[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_detailed_revenue_report"("p_start_date" "date", "p_end_date" "date") RETURNS TABLE("booking_id" "uuid", "booking_display_id" "text", "guest_user_id" "uuid", "guest_first_name" "text", "guest_last_name" "text", "created_at" timestamp with time zone, "listing_title" "text", "checkin_date" "date", "checkout_date" "date", "total_price" numeric, "status" "text", "refunds_amount" numeric, "host_payouts_amount" numeric, "net_revenue" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  return query select b.id,'BKG-'||upper(left(b.id::text,8)),b.guest_user_id,p.first_name,p.last_name,b.created_at,
    l.title,b.checkin_date,b.checkout_date,b.total_price,b.status::text,
    coalesce((select sum(t.amount) from transactions t where t.booking_id=b.id and t.type ilike '%refund%'),0),
    coalesce((select sum(py.amount) from payouts py where py.booking_id=b.id),0),
    case when public.booking_income_is_earned(b.booking_date,b.checkin_date,b.start_time,b.status::text) then b.total_price else 0 end
      -coalesce((select sum(t.amount) from transactions t where t.booking_id=b.id and t.type ilike '%refund%'),0)
      -coalesce((select sum(py.amount) from payouts py where py.booking_id=b.id),0)
  from bookings b join listings l on l.id=b.listing_id left join profiles p on p.id=b.guest_user_id
  where coalesce(b.booking_date,b.checkin_date) between p_start_date and p_end_date order by b.booking_date desc,b.created_at desc;
end $$;


ALTER FUNCTION "public"."admin_get_detailed_revenue_report"("p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_dispute_details"("p_dispute_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare result jsonb;
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  select to_jsonb(d)||jsonb_build_object('dispute_display_id','DSP-'||upper(left(d.id::text,8)),
    'booking_display_id','BKG-'||upper(left(d.booking_id::text,8)),'listing_title',l.title,'listing_city',l.city,
    'listing_country',l.country,'host_user_id',l.host_user_id,'host_name',trim(concat_ws(' ',hp.first_name,hp.last_name)),
    'host_email',hp.email,'host_avatar',hp.avatar_url,'guest_user_id',b.guest_user_id,
    'guest_name',trim(concat_ws(' ',gp.first_name,gp.last_name)),'guest_email',gp.email,'guest_avatar',gp.avatar_url,
    'booking_status',b.status::text,'booking_total',b.total_price)
  into result from disputes d join bookings b on b.id=d.booking_id join listings l on l.id=d.listing_id
    left join profiles hp on hp.id=l.host_user_id left join profiles gp on gp.id=b.guest_user_id where d.id=p_dispute_id;
  return result;
end $$;


ALTER FUNCTION "public"."admin_get_dispute_details"("p_dispute_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_host_commissions"() RETURNS TABLE("host_user_id" "uuid", "host_name" "text", "host_email" "text", "listings_count" bigint, "bookings_count" bigint, "gross_booking_value" numeric, "commission_rate" numeric, "uses_custom_rate" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(), 'admin') then
    raise exception 'admin access required';
  end if;

  return query
  with hosts as (
    select distinct ur.user_id
    from public.user_roles ur
    where ur.role = 'host'::public.app_role
  ), listing_totals as (
    select l.host_user_id, count(*)::bigint as listings_count
    from public.listings l
    group by l.host_user_id
  ), booking_totals as (
    select l.host_user_id,
           count(b.id)::bigint as bookings_count,
           coalesce(sum(b.host_payout_gross), 0)::numeric as gross_booking_value
    from public.listings l
    left join public.bookings b on b.listing_id = l.id
    group by l.host_user_id
  ), default_rate as (
    select coalesce(
      (select ps.setting_value::numeric
       from public.platform_settings ps
       where ps.setting_key = 'default_host_commission_rate' and ps.is_active = true
       limit 1),
      0.15
    ) as rate
  )
  select h.user_id,
         trim(concat_ws(' ', p.first_name, p.last_name)),
         p.email,
         coalesce(lt.listings_count, 0),
         coalesce(bt.bookings_count, 0),
         coalesce(bt.gross_booking_value, 0),
         coalesce(hcr.commission_rate, dr.rate),
         (hcr.host_user_id is not null)
  from hosts h
  join public.profiles p on p.id = h.user_id
  cross join default_rate dr
  left join public.host_commission_rates hcr on hcr.host_user_id = h.user_id
  left join listing_totals lt on lt.host_user_id = h.user_id
  left join booking_totals bt on bt.host_user_id = h.user_id
  order by lower(coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email));
end;
$$;


ALTER FUNCTION "public"."admin_get_host_commissions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_listings_reviews_report"("p_start_date" "date", "p_end_date" "date") RETURNS TABLE("listing_id" "uuid", "listing_title" "text", "listing_city" "text", "total_reviews" bigint, "average_rating" numeric, "last_review_date" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'admin access required'; end if;
  return query select l.id,l.title,l.city,count(r.id),coalesce(round(avg(r.rating),2),0),max(r.created_at)
  from listings l left join reviews r on r.listing_id=l.id and r.created_at::date between p_start_date and p_end_date
  group by l.id,l.title,l.city order by count(r.id) desc,l.title;
end $$;


ALTER FUNCTION "public"."admin_get_listings_reviews_report"("p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_support_conversations"("p_admin_user_id" "uuid", "p_search_query" "text" DEFAULT NULL::"text", "p_sort_by" "text" DEFAULT 'recent'::"text") RETURNS TABLE("thread_id" "uuid", "user_id" "uuid", "user_name" "text", "user_email" "text", "user_avatar" "text", "last_message" "text", "last_message_time" timestamp with time zone, "unread_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_admin_user_id OR NOT private.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  RETURN QUERY
  WITH relevant AS (
    SELECT DISTINCT t.*
      FROM public.message_threads t
      JOIN public.messages m ON m.thread_id = t.id
     WHERE t.thread_type = 'user_to_support'::public.thread_type
       AND (m.from_user_id = p_admin_user_id OR m.to_user_id = p_admin_user_id)
  ), latest AS (
    SELECT DISTINCT ON (m.thread_id) m.thread_id, m.from_user_id, m.to_user_id, m.body, m.created_at
      FROM public.messages m JOIN relevant r ON r.id = m.thread_id
     ORDER BY m.thread_id, m.created_at DESC
  ), other_party AS (
    SELECT l.thread_id, CASE WHEN l.from_user_id = p_admin_user_id THEN l.to_user_id ELSE l.from_user_id END AS user_id
      FROM latest l
  )
  SELECT r.id, o.user_id,
    COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Player')::text,
    COALESCE(p.email, '')::text, p.avatar_url::text, COALESCE(latest.body, '')::text,
    COALESCE(latest.created_at, r.last_message_at),
    (SELECT count(*) FROM public.messages unread
      WHERE unread.thread_id = r.id AND unread.to_user_id = p_admin_user_id AND COALESCE(unread.read, false) = false)
  FROM relevant r
  JOIN other_party o ON o.thread_id = r.id
  JOIN latest ON latest.thread_id = r.id
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE p_search_query IS NULL OR p_search_query = ''
    OR COALESCE(p.email, '') ILIKE '%' || p_search_query || '%'
    OR COALESCE(p.first_name, '') ILIKE '%' || p_search_query || '%'
    OR COALESCE(p.last_name, '') ILIKE '%' || p_search_query || '%'
  ORDER BY
    CASE WHEN p_sort_by = 'oldest' THEN COALESCE(latest.created_at, r.last_message_at) END ASC,
    CASE WHEN p_sort_by <> 'oldest' THEN COALESCE(latest.created_at, r.last_message_at) END DESC;
END;
$$;


ALTER FUNCTION "public"."admin_get_support_conversations"("p_admin_user_id" "uuid", "p_search_query" "text", "p_sort_by" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_weekly_bookings"("weeks_back" integer DEFAULT 4) RETURNS TABLE("week_start" "date", "week_label" "text", "booking_count" bigint)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'admin access required'; end if;
  return query
  with weeks as (
    select generate_series(date_trunc('week', current_date)::date - (greatest(weeks_back,1)-1)*7,
                           date_trunc('week', current_date)::date, interval '1 week')::date d
  )
  select w.d, to_char(w.d, 'Mon DD'), count(b.id)
  from weeks w left join bookings b on b.created_at::date >= w.d and b.created_at::date < w.d+7
  group by w.d order by w.d;
end $$;


ALTER FUNCTION "public"."admin_get_weekly_bookings"("weeks_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_weekly_revenue"("weeks_back" integer DEFAULT 4) RETURNS TABLE("week_start" "date", "week_label" "text", "revenue" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  return query
  with weeks as (
    select generate_series(date_trunc('week', current_date)::date-(greatest(weeks_back,1)-1)*7,
      date_trunc('week', current_date)::date, interval '1 week')::date d
  )
  select w.d,to_char(w.d,'Mon DD'),coalesce(sum(b.platform_revenue_total),0)
  from weeks w left join bookings b
    on coalesce(b.booking_date,b.checkin_date)>=w.d
    and coalesce(b.booking_date,b.checkin_date)<w.d+7
    and public.booking_income_is_earned(b.booking_date,b.checkin_date,b.start_time,b.status::text)
  group by w.d order by w.d;
end $$;


ALTER FUNCTION "public"."admin_get_weekly_revenue"("weeks_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_weekly_revenue_report"("p_start_date" "date", "p_end_date" "date") RETURNS TABLE("week_start" "date", "week_end" "date", "week_label" "text", "bookings_count" bigint, "gross_revenue" numeric, "refunds_amount" numeric, "host_payouts_amount" numeric, "net_revenue" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  return query
  with weeks as (
    select generate_series(date_trunc('week',p_start_date)::date,date_trunc('week',p_end_date)::date,interval '1 week')::date d
  ), bs as (
    select date_trunc('week',coalesce(booking_date,checkin_date))::date d,count(*) c,
      coalesce(sum(total_price) filter(where public.booking_income_is_earned(booking_date,checkin_date,start_time,status::text)),0) gross
    from bookings where coalesce(booking_date,checkin_date) between p_start_date and p_end_date group by 1
  ), tx as (
    select date_trunc('week',created_at)::date d,coalesce(sum(amount) filter(where type ilike '%refund%'),0) refunds
    from transactions where created_at::date between p_start_date and p_end_date group by 1
  ), py as (
    select date_trunc('week',created_at)::date d,coalesce(sum(amount),0) paid
    from payouts where created_at::date between p_start_date and p_end_date group by 1
  )
  select w.d,w.d+6,to_char(w.d,'Mon DD')||' - '||to_char(w.d+6,'Mon DD'),coalesce(bs.c,0),coalesce(bs.gross,0),
    coalesce(tx.refunds,0),coalesce(py.paid,0),coalesce(bs.gross,0)-coalesce(tx.refunds,0)-coalesce(py.paid,0)
  from weeks w left join bs on bs.d=w.d left join tx on tx.d=w.d left join py on py.d=w.d order by w.d;
end $$;


ALTER FUNCTION "public"."admin_get_weekly_revenue_report"("p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_mark_payout_completed"("p_payout_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(),'admin') then return jsonb_build_object('success',false,'error','admin access required'); end if;
  update payouts set status='completed',payout_date=coalesce(payout_date,current_date),updated_at=now() where id=p_payout_id;
  if not found then return jsonb_build_object('success',false,'error','payout not found'); end if;
  return jsonb_build_object('success',true);
end $$;


ALTER FUNCTION "public"."admin_mark_payout_completed"("p_payout_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_resolve_dispute"("p_dispute_id" "uuid", "p_admin_decision" "text", "p_approved_refund_amount" numeric, "p_resolution_notes" "text", "p_is_submit" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(),'admin') then return jsonb_build_object('success',false,'error','admin access required'); end if;
  update disputes set admin_decision=p_admin_decision,approved_refund_amount=p_approved_refund_amount,
    resolution_notes=p_resolution_notes,status=case when p_is_submit then 'resolved'::dispute_status else status end,
    resolved_at=case when p_is_submit then now() else resolved_at end,
    resolved_by_admin_id=case when p_is_submit then auth.uid() else resolved_by_admin_id end,updated_at=now()
  where id=p_dispute_id;
  if not found then return jsonb_build_object('success',false,'error','dispute not found'); end if;
  return jsonb_build_object('success',true);
end $$;


ALTER FUNCTION "public"."admin_resolve_dispute"("p_dispute_id" "uuid", "p_admin_decision" "text", "p_approved_refund_amount" numeric, "p_resolution_notes" "text", "p_is_submit" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_bookings"("search_query" "text" DEFAULT NULL::"text", "status_filter" "public"."booking_status" DEFAULT NULL::"public"."booking_status", "min_price" numeric DEFAULT NULL::numeric, "max_price" numeric DEFAULT NULL::numeric, "checkin_start" "date" DEFAULT NULL::"date", "checkin_end" "date" DEFAULT NULL::"date", "checkout_start" "date" DEFAULT NULL::"date", "checkout_end" "date" DEFAULT NULL::"date", "sort_by" "text" DEFAULT 'created_at'::"text", "sort_order" "text" DEFAULT 'desc'::"text") RETURNS TABLE("id" "uuid", "booking_display_id" "text", "listing_id" "uuid", "listing_title" "text", "listing_city" "text", "listing_country" "text", "host_user_id" "uuid", "host_name" "text", "host_email" "text", "host_avatar" "text", "guest_user_id" "uuid", "guest_name" "text", "guest_email" "text", "guest_avatar" "text", "checkin_date" "date", "checkout_date" "date", "nights" integer, "booking_date" "date", "start_time" time without time zone, "end_time" time without time zone, "hours" numeric, "guests" integer, "total_price" numeric, "status" "public"."booking_status", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only admins can search all bookings';
  END IF;
  RETURN QUERY
  SELECT b.id, substring(b.id::text, 1, 8), b.listing_id, l.title::text, l.city::text,
    l.country::text, l.host_user_id,
    COALESCE(NULLIF(trim(concat_ws(' ', host_prof.first_name, host_prof.last_name)), ''), 'Host')::text,
    COALESCE(host_prof.email, '')::text, host_prof.avatar_url::text, b.guest_user_id,
    COALESCE(NULLIF(trim(concat_ws(' ', guest_prof.first_name, guest_prof.last_name)), ''), 'Guest')::text,
    COALESCE(guest_prof.email, '')::text, guest_prof.avatar_url::text, b.checkin_date,
    b.checkout_date, COALESCE(b.nights, 1)::integer, COALESCE(b.booking_date, b.checkin_date),
    b.start_time, b.end_time, b.hours, COALESCE(b.guests, 1)::integer, b.total_price,
    b.status, b.created_at, b.updated_at
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


ALTER FUNCTION "public"."admin_search_bookings"("search_query" "text", "status_filter" "public"."booking_status", "min_price" numeric, "max_price" numeric, "checkin_start" "date", "checkin_end" "date", "checkout_start" "date", "checkout_end" "date", "sort_by" "text", "sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_disputes"("search_query" "text" DEFAULT NULL::"text", "status_filter" "text" DEFAULT NULL::"text", "category_filter" "text" DEFAULT NULL::"text", "min_amount" numeric DEFAULT NULL::numeric, "max_amount" numeric DEFAULT NULL::numeric, "created_start" "date" DEFAULT NULL::"date", "created_end" "date" DEFAULT NULL::"date", "sort_by" "text" DEFAULT 'created_at'::"text", "sort_order" "text" DEFAULT 'desc'::"text") RETURNS TABLE("id" "uuid", "dispute_display_id" "text", "booking_id" "uuid", "booking_display_id" "text", "listing_id" "uuid", "listing_title" "text", "listing_city" "text", "listing_country" "text", "host_user_id" "uuid", "host_name" "text", "host_email" "text", "host_avatar" "text", "guest_user_id" "uuid", "guest_name" "text", "guest_email" "text", "guest_avatar" "text", "category" "text", "status" "text", "subject" "text", "description" "text", "requested_refund_amount" numeric, "support_thread_id" "uuid", "resolution_notes" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  return query select d.id,'DSP-'||upper(left(d.id::text,8)),d.booking_id,'BKG-'||upper(left(d.booking_id::text,8)),
    d.listing_id,l.title,l.city,l.country,l.host_user_id,trim(concat_ws(' ',hp.first_name,hp.last_name)),hp.email,hp.avatar_url,
    b.guest_user_id,trim(concat_ws(' ',gp.first_name,gp.last_name)),gp.email,gp.avatar_url,d.category::text,d.status::text,
    d.subject,d.description,d.requested_refund_amount,d.support_thread_id,d.resolution_notes,d.created_at,d.updated_at
  from disputes d join bookings b on b.id=d.booking_id join listings l on l.id=d.listing_id
    left join profiles hp on hp.id=l.host_user_id left join profiles gp on gp.id=b.guest_user_id
  where (search_query is null or d.subject ilike '%'||search_query||'%' or l.title ilike '%'||search_query||'%' or gp.email ilike '%'||search_query||'%')
    and (status_filter is null or status_filter='all' or d.status::text=status_filter)
    and (category_filter is null or category_filter='all' or d.category::text=category_filter)
    and (min_amount is null or coalesce(d.requested_refund_amount,0)>=min_amount)
    and (max_amount is null or coalesce(d.requested_refund_amount,0)<=max_amount)
    and (created_start is null or d.created_at::date>=created_start) and (created_end is null or d.created_at::date<=created_end)
  order by case when sort_order='asc' then d.created_at end asc,case when sort_order<>'asc' then d.created_at end desc;
end $$;


ALTER FUNCTION "public"."admin_search_disputes"("search_query" "text", "status_filter" "text", "category_filter" "text", "min_amount" numeric, "max_amount" numeric, "created_start" "date", "created_end" "date", "sort_by" "text", "sort_order" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."faqs" (
    "answer" "text" NOT NULL,
    "category" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by_admin_id" "uuid",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question" "text" NOT NULL,
    "status" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by_admin_id" "uuid"
);


ALTER TABLE "public"."faqs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_faqs"("search_query" "text" DEFAULT NULL::"text", "category_filter" "text" DEFAULT NULL::"text", "status_filter" "text" DEFAULT NULL::"text", "sort_by" "text" DEFAULT 'created_at'::"text", "sort_order" "text" DEFAULT 'desc'::"text") RETURNS SETOF "public"."faqs"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  return query select f.* from faqs f
  where (search_query is null or f.question ilike '%'||search_query||'%' or f.answer ilike '%'||search_query||'%')
    and (category_filter is null or category_filter='all' or f.category=category_filter)
    and (status_filter is null or status_filter='all' or f.status=status_filter)
  order by case when sort_order='asc' then f.created_at end asc,case when sort_order<>'asc' then f.created_at end desc;
end $$;


ALTER FUNCTION "public"."admin_search_faqs"("search_query" "text", "category_filter" "text", "status_filter" "text", "sort_by" "text", "sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_guest_debts"("search_query" "text" DEFAULT NULL::"text", "status_filter" "text" DEFAULT NULL::"text", "reason_filter" "text" DEFAULT NULL::"text", "min_amount" numeric DEFAULT NULL::numeric, "max_amount" numeric DEFAULT NULL::numeric, "sort_by" "text" DEFAULT 'created_at'::"text", "sort_order" "text" DEFAULT 'desc'::"text") RETURNS SETOF "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  return query select to_jsonb(gd)||jsonb_build_object('guest_name',trim(concat_ws(' ',p.first_name,p.last_name)),
    'guest_email',p.email,'guest_avatar',p.avatar_url,'dispute_display_id','DSP-'||upper(left(gd.dispute_id::text,8)),
    'booking_display_id','BKG-'||upper(left(gd.booking_id::text,8)),'listing_title',l.title)
  from guest_debts gd join bookings b on b.id=gd.booking_id join listings l on l.id=b.listing_id left join profiles p on p.id=gd.guest_user_id
  where (search_query is null or p.email ilike '%'||search_query||'%' or l.title ilike '%'||search_query||'%')
    and (status_filter is null or gd.status=status_filter) and (reason_filter is null or gd.reason=reason_filter)
    and (min_amount is null or gd.amount>=min_amount) and (max_amount is null or gd.amount<=max_amount)
  order by case when sort_order='asc' then gd.created_at end asc,case when sort_order<>'asc' then gd.created_at end desc;
end $$;


ALTER FUNCTION "public"."admin_search_guest_debts"("search_query" "text", "status_filter" "text", "reason_filter" "text", "min_amount" numeric, "max_amount" numeric, "sort_by" "text", "sort_order" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listings" (
    "address" "text" NOT NULL,
    "amenities" "text"[],
    "base_price" numeric NOT NULL,
    "bathrooms" numeric,
    "bedrooms" numeric,
    "beds" numeric,
    "cancellation_policy_id" "uuid" NOT NULL,
    "checkin_from" "text",
    "checkout_until" "text",
    "city" "text" NOT NULL,
    "city_id" "uuid",
    "cleaning_fee" numeric,
    "closing_time" time without time zone,
    "country" "text" NOT NULL,
    "country_id" "uuid",
    "court_type" "public"."court_type",
    "cover_image" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" DEFAULT 'IQD'::"text",
    "description" "text",
    "guests_max" numeric NOT NULL,
    "has_changing_rooms" boolean,
    "has_lighting" boolean,
    "has_parking" boolean,
    "has_showers" boolean,
    "host_user_id" "uuid" NOT NULL,
    "house_rules" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "images" "text"[],
    "is_indoor" boolean,
    "latitude" numeric,
    "longitude" numeric,
    "max_hours" numeric DEFAULT 5,
    "max_nights" numeric,
    "min_hours" numeric DEFAULT 1,
    "min_nights" numeric,
    "monthly_discount" numeric,
    "opening_time" time without time zone,
    "postal_code" "text",
    "rating_avg" numeric,
    "rating_count" numeric,
    "rejection_reason" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "text",
    "security_deposit" numeric,
    "size_sqft" numeric,
    "slot_duration_minutes" numeric DEFAULT 60,
    "state" "text",
    "state_region_id" "uuid",
    "status" "public"."listing_status" DEFAULT 'approved'::"public"."listing_status",
    "surface_type" "public"."surface_type",
    "title" "text" NOT NULL,
    "type" "public"."property_type" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "weekly_discount" numeric
);


ALTER TABLE "public"."listings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_listings"("search_query" "text" DEFAULT NULL::"text", "status_filter" "public"."listing_status" DEFAULT NULL::"public"."listing_status", "min_price" numeric DEFAULT NULL::numeric, "max_price" numeric DEFAULT NULL::numeric, "sort_by" "text" DEFAULT 'created_at'::"text", "sort_order" "text" DEFAULT 'desc'::"text") RETURNS SETOF "public"."listings"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'admin access required'; end if;
  return query select l.* from listings l
  where (search_query is null or l.title ilike '%'||search_query||'%' or l.city ilike '%'||search_query||'%' or l.address ilike '%'||search_query||'%')
    and (status_filter is null or l.status=status_filter)
    and (min_price is null or l.base_price>=min_price) and (max_price is null or l.base_price<=max_price)
  order by
    case when sort_by='base_price' and sort_order='asc' then l.base_price end asc,
    case when sort_by='base_price' and sort_order='desc' then l.base_price end desc,
    case when sort_by='title' and sort_order='asc' then l.title end asc,
    case when sort_by='title' and sort_order='desc' then l.title end desc,
    case when sort_order='asc' then l.created_at end asc,
    case when sort_order<>'asc' then l.created_at end desc;
end $$;


ALTER FUNCTION "public"."admin_search_listings"("search_query" "text", "status_filter" "public"."listing_status", "min_price" numeric, "max_price" numeric, "sort_by" "text", "sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_payouts"("search_query" "text" DEFAULT NULL::"text", "transaction_type_filter" "text" DEFAULT NULL::"text", "status_filter" "text" DEFAULT NULL::"text", "min_amount" numeric DEFAULT NULL::numeric, "max_amount" numeric DEFAULT NULL::numeric, "sort_by" "text" DEFAULT 'created_at'::"text", "sort_order" "text" DEFAULT 'desc'::"text") RETURNS TABLE("id" "uuid", "booking_id" "uuid", "host_user_id" "uuid", "amount" numeric, "currency" "text", "status" "text", "payout_date" "date", "created_at" timestamp with time zone, "notes" "text", "booking_subtotal" numeric, "booking_host_commission_amount" numeric, "booking_host_payout_net" numeric, "booking_host_payout_gross" numeric, "checkin_date" "date", "checkout_date" "date", "listing_id" "uuid", "listing_title" "text", "guest_name" "text", "guest_email" "text", "guest_avatar" "text", "host_name" "text", "host_email" "text", "host_avatar" "text", "booking_status" "text", "transaction_type" "text", "original_amount" numeric, "cleaning_fee" numeric, "dispute_ids" "text"[], "total_dispute_refunds" numeric, "refund_percentage_applied" numeric, "host_retained_gross" numeric, "commission_on_retained" numeric, "guest_total_payment" numeric, "base_subtotal" numeric, "base_cleaning_fee" numeric, "gross_revenue" numeric, "commission_amount" numeric, "net_before_adjustments" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'admin access required'; end if;
  return query select py.id,py.booking_id,py.host_user_id,py.amount,py.currency,py.status,py.payout_date,py.created_at,py.notes,
    b.subtotal,b.host_commission_amount,b.host_payout_net,b.host_payout_gross,b.checkin_date,b.checkout_date,l.id,l.title,
    trim(concat_ws(' ',gp.first_name,gp.last_name)),gp.email,gp.avatar_url,
    trim(concat_ws(' ',hp.first_name,hp.last_name)),hp.email,hp.avatar_url,b.status::text,py.transaction_type,
    py.original_amount,b.cleaning_fee,py.dispute_ids,py.total_dispute_refunds,py.refund_percentage_applied,
    py.host_retained_gross,py.commission_on_retained,py.guest_total_payment,py.base_subtotal,py.base_cleaning_fee,
    py.gross_revenue,py.commission_amount,py.net_before_adjustments
  from payouts py join bookings b on b.id=py.booking_id join listings l on l.id=b.listing_id
    left join profiles gp on gp.id=b.guest_user_id left join profiles hp on hp.id=py.host_user_id
  where (search_query is null or l.title ilike '%'||search_query||'%' or gp.email ilike '%'||search_query||'%' or hp.email ilike '%'||search_query||'%')
    and (transaction_type_filter is null or py.transaction_type=transaction_type_filter)
    and (status_filter is null or py.status=status_filter) and (min_amount is null or py.amount>=min_amount) and (max_amount is null or py.amount<=max_amount)
  order by case when sort_order='asc' then py.created_at end asc, case when sort_order<>'asc' then py.created_at end desc;
end $$;


ALTER FUNCTION "public"."admin_search_payouts"("search_query" "text", "transaction_type_filter" "text", "status_filter" "text", "min_amount" numeric, "max_amount" numeric, "sort_by" "text", "sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_reviews"("search_query" "text" DEFAULT NULL::"text", "status_filter" "text" DEFAULT NULL::"text", "sort_by" "text" DEFAULT 'created_at'::"text", "sort_order" "text" DEFAULT 'desc'::"text") RETURNS TABLE("id" "uuid", "booking_id" "uuid", "listing_id" "uuid", "author_user_id" "uuid", "rating" numeric, "text" "text", "status" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "listing_title" "text", "author_name" "text", "author_email" "text", "author_avatar" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'admin access required'; end if;
  return query select r.id,r.booking_id,r.listing_id,r.author_user_id,r.rating,r.text,r.status::text,
    r.created_at,r.updated_at,l.title,trim(concat_ws(' ',p.first_name,p.last_name)),p.email,p.avatar_url
  from reviews r join listings l on l.id=r.listing_id left join profiles p on p.id=r.author_user_id
  where (search_query is null or l.title ilike '%'||search_query||'%' or r.text ilike '%'||search_query||'%' or p.email ilike '%'||search_query||'%')
    and (status_filter is null or r.status::text=status_filter)
  order by case when sort_order='asc' then r.created_at end asc, case when sort_order<>'asc' then r.created_at end desc;
end $$;


ALTER FUNCTION "public"."admin_search_reviews"("search_query" "text", "status_filter" "text", "sort_by" "text", "sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_transactions"("search_query" "text" DEFAULT NULL::"text", "type_filter" "text" DEFAULT NULL::"text", "status_filter" "text" DEFAULT NULL::"text", "min_amount" numeric DEFAULT NULL::numeric, "max_amount" numeric DEFAULT NULL::numeric, "sort_by" "text" DEFAULT 'created_at'::"text", "sort_order" "text" DEFAULT 'desc'::"text") RETURNS TABLE("id" "uuid", "booking_id" "uuid", "type" "text", "amount" numeric, "currency" "text", "provider" "text", "status" "text", "created_at" timestamp with time zone, "guest_user_id" "uuid", "guest_name" "text", "guest_email" "text", "guest_avatar" "text", "listing_id" "uuid", "listing_title" "text")
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'admin access required'; end if;
  return query select t.id,t.booking_id,t.type,t.amount,t.currency,t.provider,t.status,t.created_at,
    b.guest_user_id,trim(concat_ws(' ',p.first_name,p.last_name)),p.email,p.avatar_url,l.id,l.title
  from transactions t join bookings b on b.id=t.booking_id join listings l on l.id=b.listing_id left join profiles p on p.id=b.guest_user_id
  where (search_query is null or l.title ilike '%'||search_query||'%' or p.email ilike '%'||search_query||'%')
    and (type_filter is null or t.type=type_filter) and (status_filter is null or t.status=status_filter)
    and (min_amount is null or t.amount>=min_amount) and (max_amount is null or t.amount<=max_amount)
  order by case when sort_order='asc' then t.created_at end asc, case when sort_order<>'asc' then t.created_at end desc;
end $$;


ALTER FUNCTION "public"."admin_search_transactions"("search_query" "text", "type_filter" "text", "status_filter" "text", "min_amount" numeric, "max_amount" numeric, "sort_by" "text", "sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_users"("search_query" "text" DEFAULT NULL::"text", "status_filter" "text" DEFAULT NULL::"text", "role_filter" "text" DEFAULT NULL::"text", "sort_by" "text" DEFAULT 'created_at'::"text", "sort_order" "text" DEFAULT 'desc'::"text") RETURNS TABLE("id" "uuid", "email" "text", "first_name" "text", "last_name" "text", "full_name" "text", "phone" "text", "avatar_url" "text", "status" "text", "verified" boolean, "created_at" timestamp with time zone, "roles" "text"[])
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'admin access required'; end if;
  return query
  select p.id,p.email,p.first_name,p.last_name,trim(concat_ws(' ',p.first_name,p.last_name)),p.phone,
         p.avatar_url,p.status::text,coalesce(p.verified,false),p.created_at,
         coalesce(array_agg(distinct ur.role::text) filter(where ur.role is not null),array[]::text[])
  from profiles p left join user_roles ur on ur.user_id=p.id
  where (search_query is null or p.email ilike '%'||search_query||'%' or concat_ws(' ',p.first_name,p.last_name) ilike '%'||search_query||'%')
    and (status_filter is null or p.status::text=status_filter)
    and (role_filter is null or exists(select 1 from user_roles x where x.user_id=p.id and x.role::text=role_filter))
  group by p.id
  order by
    case when sort_by='full_name' and sort_order='asc' then concat_ws(' ',p.first_name,p.last_name) end asc,
    case when sort_by='full_name' and sort_order='desc' then concat_ws(' ',p.first_name,p.last_name) end desc,
    case when sort_order='asc' then p.created_at end asc,
    case when sort_order<>'asc' then p.created_at end desc;
end $$;


ALTER FUNCTION "public"."admin_search_users"("search_query" "text", "status_filter" "text", "role_filter" "text", "sort_by" "text", "sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_host_commission"("p_host_user_id" "uuid", "p_commission_rate" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not private.has_role(auth.uid(), 'admin') then
    raise exception 'admin access required';
  end if;
  if p_commission_rate < 0 or p_commission_rate > 1 then
    raise exception 'commission rate must be between 0 and 1';
  end if;
  if not private.has_role(p_host_user_id, 'host') then
    raise exception 'selected user is not a host';
  end if;

  insert into public.host_commission_rates (host_user_id, commission_rate, updated_by)
  values (p_host_user_id, p_commission_rate, auth.uid())
  on conflict (host_user_id) do update
  set commission_rate = excluded.commission_rate,
      updated_by = excluded.updated_by,
      updated_at = now();

  return jsonb_build_object('success', true, 'host_user_id', p_host_user_id, 'commission_rate', p_commission_rate);
end;
$$;


ALTER FUNCTION "public"."admin_set_host_commission"("p_host_user_id" "uuid", "p_commission_rate" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_suspend_user"("p_user_id" "uuid", "p_admin_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid()<>p_admin_user_id or not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  if p_user_id=auth.uid() then raise exception 'you cannot suspend your own account'; end if;
  update profiles set status='suspended',updated_at=now() where id=p_user_id;
  return jsonb_build_object('success',found);
end $$;


ALTER FUNCTION "public"."admin_suspend_user"("p_user_id" "uuid", "p_admin_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_unsuspend_user"("p_user_id" "uuid", "p_admin_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid()<>p_admin_user_id or not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  update profiles set status='active',updated_at=now() where id=p_user_id;
  return jsonb_build_object('success',found);
end $$;


ALTER FUNCTION "public"."admin_unsuspend_user"("p_user_id" "uuid", "p_admin_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_host_commission_to_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_rate numeric;
begin
  select coalesce(
    hcr.commission_rate,
    (select ps.setting_value::numeric
     from public.platform_settings ps
     where ps.setting_key = 'default_host_commission_rate' and ps.is_active = true
     limit 1),
    0.15
  )
  into v_rate
  from public.listings l
  left join public.host_commission_rates hcr on hcr.host_user_id = l.host_user_id
  where l.id = new.listing_id;

  if v_rate is null then
    raise exception 'Host commission is not configured';
  end if;

  new.host_commission_rate := v_rate;
  new.host_payout_gross := coalesce(new.host_payout_gross, new.subtotal, 0);
  new.host_commission_amount := round(new.host_payout_gross * v_rate, 2);
  new.host_payout_net := new.host_payout_gross - new.host_commission_amount;
  new.platform_revenue_total := coalesce(new.service_fee, 0) + coalesce(new.taxes, 0) + new.host_commission_amount;
  return new;
end;
$$;


ALTER FUNCTION "public"."apply_host_commission_to_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."booking_income_is_earned"("p_booking_date" "date", "p_checkin_date" "date", "p_start_time" time without time zone, "p_status" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(p_status = 'completed', false)
    or (
      p_status = 'confirmed'
      and coalesce(p_booking_date, p_checkin_date) is not null
      and coalesce(p_booking_date, p_checkin_date)::timestamp
          + coalesce(p_start_time, time '00:00')
          <= (now() at time zone 'Asia/Baghdad')
    );
$$;


ALTER FUNCTION "public"."booking_income_is_earned"("p_booking_date" "date", "p_checkin_date" "date", "p_start_time" time without time zone, "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_booking_with_refund"("p_booking_id" "uuid", "p_cancellation_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."cancel_booking_with_refund"("p_booking_id" "uuid", "p_cancellation_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_guest_outstanding_debts"("target_guest" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select exists(
    select 1 from public.guest_debts
    where guest_user_id = target_guest and status in ('outstanding', 'pending')
  );
$$;


ALTER FUNCTION "public"."check_guest_outstanding_debts"("target_guest" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_booking_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_provider" "text", "p_currency" "text" DEFAULT 'IQD'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."confirm_booking_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_provider" "text", "p_currency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_dispute_with_support_thread"("p_booking_id" "uuid", "p_category" "public"."dispute_category", "p_subject" "text", "p_description" "text", "p_requested_refund_amount" numeric DEFAULT NULL::numeric, "p_attachment_urls" "text"[] DEFAULT ARRAY[]::"text"[]) RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  SELECT private.create_dispute_with_support_thread(p_booking_id, p_category, p_subject,
    p_description, p_requested_refund_amount, p_attachment_urls);
$$;


ALTER FUNCTION "public"."create_dispute_with_support_thread"("p_booking_id" "uuid", "p_category" "public"."dispute_category", "p_subject" "text", "p_description" "text", "p_requested_refund_amount" numeric, "p_attachment_urls" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_hourly_booking"("p_listing_id" "uuid", "p_booking_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone, "p_players" integer, "p_subtotal" numeric, "p_pricing_breakdown" "jsonb" DEFAULT NULL::"jsonb", "p_notes" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."create_hourly_booking"("p_listing_id" "uuid", "p_booking_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone, "p_players" integer, "p_subtotal" numeric, "p_pricing_breakdown" "jsonb", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_dashboard_kpis"() RETURNS TABLE("active_bookings" numeric, "cancelled_bookings" numeric, "occupancy_rate" numeric, "open_disputes" numeric, "pending_listings" numeric, "total_revenue" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_admin_dashboard_kpis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_eligible_refund_amount"("p_booking_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select case when b.guest_user_id = (select auth.uid()) and b.status = 'confirmed'
    then coalesce(b.total_price,0) else 0 end
  from public.bookings b where b.id = p_booking_id;
$$;


ALTER FUNCTION "public"."get_eligible_refund_amount"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_host_dashboard_kpis"("p_host_user_id" "uuid") RETURNS TABLE("total_gross_revenue" numeric, "host_fees_paid" numeric, "actual_net_revenue" numeric, "pending_payouts" numeric, "average_rate" numeric, "occupancy_rate" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if p_host_user_id <> auth.uid() and not private.has_role(auth.uid(), 'admin') then
    raise exception 'host access required';
  end if;
  return query
  with earned as (
    select b.* from public.bookings b
    join public.listings l on l.id = b.listing_id
    where l.host_user_id = p_host_user_id
      and public.booking_income_is_earned(b.booking_date,b.checkin_date,b.start_time,b.status::text)
  ), listing_count as (
    select count(*)::numeric as total from public.listings where host_user_id = p_host_user_id
  )
  select coalesce(sum(e.host_payout_gross),0),
         coalesce(sum(e.host_commission_amount),0),
         coalesce(sum(e.host_payout_net),0),
         coalesce((select sum(p.amount) from public.payouts p where p.host_user_id=p_host_user_id and p.status='pending'),0),
         coalesce(avg(e.price_per_hour),0),
         case when (select total from listing_count)=0 then 0
           else least(100,count(e.id)::numeric / ((select total from listing_count)*30) * 100) end
  from earned e;
end;
$$;


ALTER FUNCTION "public"."get_host_dashboard_kpis"("p_host_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_host_earnings_report"("p_host_user_id" "uuid", "p_start_month" "date", "p_end_month" "date", "p_search_query" "text" DEFAULT NULL::"text", "p_listing_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_min_gross" numeric DEFAULT NULL::numeric, "p_max_gross" numeric DEFAULT NULL::numeric, "p_min_net" numeric DEFAULT NULL::numeric, "p_max_net" numeric DEFAULT NULL::numeric, "p_sort_by" "text" DEFAULT 'month_date'::"text", "p_sort_order" "text" DEFAULT 'desc'::"text") RETURNS TABLE("listing_id" "uuid", "listing_title" "text", "month_year" "text", "month_date" "date", "nights_booked" numeric, "completed_count" bigint, "cancel_percentage" numeric, "occupancy_percentage" numeric, "average_nightly_rate" numeric, "gross_earnings" numeric, "platform_fees" numeric, "net_earnings" numeric, "last_payout_date" "date", "cancellation_income" numeric, "dispute_refunds" numeric, "dispute_income" numeric, "actual_net_earnings" numeric)
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if p_host_user_id<>auth.uid() and not private.has_role(auth.uid(),'admin') then raise exception 'host access required'; end if;
  return query
  with payout_by_booking as (
    select py.booking_id,sum(coalesce(py.host_retained_gross,0)) retained_gross,
      sum(coalesce(py.total_dispute_refunds,0)) dispute_refunds,
      sum(py.amount) filter(where py.transaction_type='debt_collection') dispute_income,
      max(py.payout_date) last_paid
    from payouts py group by py.booking_id
  ), grouped as (
    select l.id,l.title,date_trunc('month',coalesce(b.booking_date,b.checkin_date))::date md,
      coalesce(sum(coalesce(b.hours,b.nights,1)) filter(where public.booking_income_is_earned(b.booking_date,b.checkin_date,b.start_time,b.status::text)),0) booked,
      count(*) filter(where b.status::text='completed') completed,
      count(*) filter(where b.status::text in ('cancelled_guest','cancelled_host','expired')) cancelled,count(*) total,
      coalesce(avg(b.subtotal/nullif(coalesce(b.hours,b.nights),0)) filter(where public.booking_income_is_earned(b.booking_date,b.checkin_date,b.start_time,b.status::text)),0) avg_rate,
      coalesce(sum(b.host_payout_gross) filter(where public.booking_income_is_earned(b.booking_date,b.checkin_date,b.start_time,b.status::text)),0) gross,
      coalesce(sum(b.host_commission_amount) filter(where public.booking_income_is_earned(b.booking_date,b.checkin_date,b.start_time,b.status::text)),0) fees,
      coalesce(sum(b.host_payout_net) filter(where public.booking_income_is_earned(b.booking_date,b.checkin_date,b.start_time,b.status::text)),0) net,
      coalesce(sum(py.retained_gross) filter(where b.status::text in ('cancelled_guest','cancelled_host','expired')),0) cancel_income,
      coalesce(sum(py.dispute_refunds),0) dispute_refunds,coalesce(sum(py.dispute_income),0) dispute_income,max(py.last_paid) last_paid
    from listings l join bookings b on b.listing_id=l.id left join payout_by_booking py on py.booking_id=b.id
    where l.host_user_id=p_host_user_id and coalesce(b.booking_date,b.checkin_date)>=p_start_month
      and coalesce(b.booking_date,b.checkin_date)<p_end_month
      and (p_search_query is null or l.title ilike '%'||p_search_query||'%')
      and (p_listing_ids is null or l.id=any(p_listing_ids))
    group by l.id,l.title,date_trunc('month',coalesce(b.booking_date,b.checkin_date))
  )
  select g.id,g.title,to_char(g.md,'Mon YYYY'),g.md,g.booked,g.completed,
    case when g.total>0 then round(g.cancelled::numeric/g.total*100,2) else 0 end,
    round(least(100,g.booked/greatest(1,extract(day from (g.md+interval '1 month'-interval '1 day')))*100),2),
    round(g.avg_rate,2),g.gross,g.fees,g.net,g.last_paid,g.cancel_income,g.dispute_refunds,g.dispute_income,
    g.net+g.cancel_income+g.dispute_income-g.dispute_refunds
  from grouped g
  where (p_min_gross is null or g.gross>=p_min_gross) and (p_max_gross is null or g.gross<=p_max_gross)
    and (p_min_net is null or g.net>=p_min_net) and (p_max_net is null or g.net<=p_max_net)
  order by case when p_sort_order='asc' then g.md end asc,case when p_sort_order<>'asc' then g.md end desc;
end $$;


ALTER FUNCTION "public"."get_host_earnings_report"("p_host_user_id" "uuid", "p_start_month" "date", "p_end_month" "date", "p_search_query" "text", "p_listing_ids" "uuid"[], "p_min_gross" numeric, "p_max_gross" numeric, "p_min_net" numeric, "p_max_net" numeric, "p_sort_by" "text", "p_sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_listing_bookable_dates"("p_listing_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_duration_hours" integer DEFAULT 1, "p_step_minutes" integer DEFAULT 30) RETURNS TABLE("bookable_date" "date")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."get_listing_bookable_dates"("p_listing_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_duration_hours" integer, "p_step_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_listing_slot_grid"("p_listing_id" "uuid", "p_date" "date", "p_step_minutes" integer DEFAULT 30) RETURNS TABLE("slot_start" time without time zone, "slot_end" time without time zone, "is_available" boolean, "price" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."get_listing_slot_grid"("p_listing_id" "uuid", "p_date" "date", "p_step_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_listing_slots"("p_listing_id" "uuid", "p_date" "date") RETURNS TABLE("slot_start" time without time zone, "slot_end" time without time zone, "is_available" boolean, "price" numeric)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."get_listing_slots"("p_listing_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_thread"("p_participant_1_id" "uuid", "p_participant_2_id" "uuid", "p_listing_id" "uuid" DEFAULT NULL::"uuid", "p_booking_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_thread uuid;
begin
  if (select auth.uid()) not in (p_participant_1_id, p_participant_2_id) then raise exception 'Access denied'; end if;
  select t.id into v_thread from public.message_threads t
  where (p_listing_id is null or t.listing_id=p_listing_id)
    and (p_booking_id is null or t.booking_id=p_booking_id)
    and exists(select 1 from public.messages m where m.thread_id=t.id and m.from_user_id in (p_participant_1_id,p_participant_2_id) and m.to_user_id in (p_participant_1_id,p_participant_2_id))
  order by t.created_at desc limit 1;
  if v_thread is null then
    insert into public.message_threads(listing_id,booking_id,last_message_at) values(p_listing_id,p_booking_id,now()) returning id into v_thread;
  end if;
  return v_thread;
end;
$$;


ALTER FUNCTION "public"."get_or_create_thread"("p_participant_1_id" "uuid", "p_participant_2_id" "uuid", "p_listing_id" "uuid", "p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select _user_id = (select auth.uid()) and exists(
    select 1 from public.user_roles where user_id = _user_id and role = _role
  );
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."host_accept_booking"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."host_accept_booking"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."host_reject_booking"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."host_reject_booking"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."host_search_bookings"("host_id" "uuid", "search_query" "text" DEFAULT NULL::"text", "status_filter" "public"."booking_status" DEFAULT NULL::"public"."booking_status", "min_price" numeric DEFAULT NULL::numeric, "max_price" numeric DEFAULT NULL::numeric, "checkin_start" "date" DEFAULT NULL::"date", "checkin_end" "date" DEFAULT NULL::"date", "checkout_start" "date" DEFAULT NULL::"date", "checkout_end" "date" DEFAULT NULL::"date", "sort_by" "text" DEFAULT 'created_at'::"text", "sort_order" "text" DEFAULT 'desc'::"text") RETURNS TABLE("id" "uuid", "listing_id" "uuid", "listing_title" "text", "guest_user_id" "uuid", "guest_name" "text", "guest_email" "text", "guest_avatar" "text", "checkin_date" "date", "checkout_date" "date", "nights" integer, "booking_date" "date", "start_time" time without time zone, "end_time" time without time zone, "hours" numeric, "guests" integer, "host_payout_gross" numeric, "status" "public"."booking_status", "created_at" timestamp with time zone, "subtotal" numeric, "service_fee" numeric, "taxes" numeric, "total_price" numeric, "currency" "text", "host_commission_amount" numeric, "host_payout_net" numeric, "notes" "text", "pricing_breakdown" "jsonb", "cancellation_policy_snapshot" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."host_search_bookings"("host_id" "uuid", "search_query" "text", "status_filter" "public"."booking_status", "min_price" numeric, "max_price" numeric, "checkin_start" "date", "checkin_end" "date", "checkout_start" "date", "checkout_end" "date", "sort_by" "text", "sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."host_search_listings"("host_id" "uuid", "search_query" "text" DEFAULT NULL::"text", "status_filter" "public"."listing_status" DEFAULT NULL::"public"."listing_status", "min_price" numeric DEFAULT NULL::numeric, "max_price" numeric DEFAULT NULL::numeric, "sort_by" "text" DEFAULT 'created_at'::"text", "sort_order" "text" DEFAULT 'desc'::"text") RETURNS TABLE("id" "uuid", "title" "text", "type" "public"."property_type", "city" "text", "state" "text", "country" "text", "base_price" numeric, "status" "public"."listing_status", "cover_image" "text", "rating_avg" numeric, "rating_count" numeric, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select l.id, l.title, l.type, l.city, l.state, l.country, l.base_price,
         l.status, l.cover_image, l.rating_avg, l.rating_count, l.created_at, l.updated_at
  from public.listings l
  where l.host_user_id = host_id
    and host_id = (select auth.uid())
    and (search_query is null or l.title ilike '%' || search_query || '%' or l.city ilike '%' || search_query || '%')
    and (status_filter is null or l.status = status_filter)
    and (min_price is null or l.base_price >= min_price)
    and (max_price is null or l.base_price <= max_price)
  order by
    case when sort_by = 'base_price' and sort_order = 'asc' then l.base_price end asc,
    case when sort_by = 'base_price' and sort_order = 'desc' then l.base_price end desc,
    case when sort_order = 'asc' then l.created_at end asc,
    l.created_at desc;
$$;


ALTER FUNCTION "public"."host_search_listings"("host_id" "uuid", "search_query" "text", "status_filter" "public"."listing_status", "min_price" numeric, "max_price" numeric, "sort_by" "text", "sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."host_search_payouts"("p_host_user_id" "uuid", "p_search_query" "text" DEFAULT NULL::"text", "p_status_filter" "text" DEFAULT NULL::"text", "p_transaction_type_filter" "text" DEFAULT NULL::"text", "p_min_amount" numeric DEFAULT NULL::numeric, "p_max_amount" numeric DEFAULT NULL::numeric, "p_sort_by" "text" DEFAULT 'created_at'::"text", "p_sort_order" "text" DEFAULT 'desc'::"text") RETURNS SETOF "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if p_host_user_id<>auth.uid() and not private.has_role(auth.uid(),'admin') then raise exception 'host access required'; end if;
  return query
  select to_jsonb(py) || jsonb_build_object(
    'booking_subtotal',b.subtotal,'booking_host_commission_amount',b.host_commission_amount,
    'booking_host_payout_net',b.host_payout_net,'booking_host_payout_gross',b.host_payout_gross,
    'checkin_date',b.checkin_date,'checkout_date',b.checkout_date,'listing_id',l.id,'listing_title',l.title,
    'guest_name',trim(concat_ws(' ',gp.first_name,gp.last_name)),'guest_email',gp.email,
    'booking_status',b.status::text,'cleaning_fee',b.cleaning_fee)
  from payouts py join bookings b on b.id=py.booking_id join listings l on l.id=b.listing_id
    left join profiles gp on gp.id=b.guest_user_id
  where py.host_user_id=p_host_user_id
    and (p_search_query is null or l.title ilike '%'||p_search_query||'%' or gp.email ilike '%'||p_search_query||'%')
    and (p_status_filter is null or py.status=p_status_filter)
    and (p_transaction_type_filter is null or py.transaction_type=p_transaction_type_filter)
    and (p_min_amount is null or py.amount>=p_min_amount) and (p_max_amount is null or py.amount<=p_max_amount)
  order by case when p_sort_order='asc' then py.created_at end asc, case when p_sort_order<>'asc' then py.created_at end desc;
end $$;


ALTER FUNCTION "public"."host_search_payouts"("p_host_user_id" "uuid", "p_search_query" "text", "p_status_filter" "text", "p_transaction_type_filter" "text", "p_min_amount" numeric, "p_max_amount" numeric, "p_sort_by" "text", "p_sort_order" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_guest_debt_payment"("p_guest_debt_id" "uuid", "p_payment_amount" numeric, "p_payment_currency" "text", "p_payment_provider" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare debt guest_debts%rowtype; transaction_id uuid;
begin
  select * into debt from guest_debts where id=p_guest_debt_id for update;
  if debt.id is null then return jsonb_build_object('success',false,'error','debt not found'); end if;
  if debt.guest_user_id<>auth.uid() and not private.has_role(auth.uid(),'admin') then return jsonb_build_object('success',false,'error','access denied'); end if;
  if debt.status='paid' then return jsonb_build_object('success',true,'transaction_id',debt.payment_transaction_id); end if;
  if p_payment_amount<debt.amount or p_payment_currency<>debt.currency then return jsonb_build_object('success',false,'error','payment amount or currency is invalid'); end if;
  insert into transactions(booking_id,dispute_id,type,amount,currency,provider,status)
  values(debt.booking_id,debt.dispute_id,'debt_payment',p_payment_amount,p_payment_currency,p_payment_provider,'completed') returning id into transaction_id;
  update guest_debts set status='paid',paid_at=now(),payment_transaction_id=transaction_id where id=debt.id;
  return jsonb_build_object('success',true,'transaction_id',transaction_id);
end $$;


ALTER FUNCTION "public"."process_guest_debt_payment"("p_guest_debt_id" "uuid", "p_payment_amount" numeric, "p_payment_currency" "text", "p_payment_provider" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_inbox_conversations"("p_user_id" "uuid", "p_search_query" "text" DEFAULT NULL::"text", "p_sort_by" "text" DEFAULT 'recent'::"text") RETURNS TABLE("thread_id" "uuid", "other_user_id" "uuid", "other_user_name" "text", "other_user_avatar" "text", "listing_id" "uuid", "listing_title" "text", "listing_address" "text", "booking_id" "uuid", "last_message" "text", "last_message_time" timestamp with time zone, "unread_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.uid() <> p_user_id AND NOT private.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'You can only view your own conversations';
  END IF;

  RETURN QUERY
  WITH relevant AS (
    SELECT DISTINCT t.*
      FROM public.message_threads t
      JOIN public.messages m ON m.thread_id = t.id
     WHERE m.from_user_id = p_user_id OR m.to_user_id = p_user_id
  ), latest AS (
    SELECT DISTINCT ON (m.thread_id) m.thread_id, m.from_user_id, m.to_user_id, m.body, m.created_at
      FROM public.messages m JOIN relevant r ON r.id = m.thread_id
     ORDER BY m.thread_id, m.created_at DESC
  ), other_party AS (
    SELECT l.thread_id, CASE WHEN l.from_user_id = p_user_id THEN l.to_user_id ELSE l.from_user_id END AS user_id
      FROM latest l
  )
  SELECT r.id, o.user_id,
    COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email, 'Player')::text,
    p.avatar_url::text, r.listing_id, COALESCE(l.title, 'Yarika')::text,
    COALESCE(l.address, l.city, '')::text, r.booking_id,
    COALESCE(latest.body, '')::text, COALESCE(latest.created_at, r.last_message_at),
    (SELECT count(*) FROM public.messages unread
      WHERE unread.thread_id = r.id AND unread.to_user_id = p_user_id AND COALESCE(unread.read, false) = false)
  FROM relevant r
  JOIN other_party o ON o.thread_id = r.id
  JOIN latest ON latest.thread_id = r.id
  LEFT JOIN public.profiles p ON p.id = o.user_id
  LEFT JOIN public.listings l ON l.id = r.listing_id
  WHERE p_search_query IS NULL OR p_search_query = ''
    OR COALESCE(p.email, '') ILIKE '%' || p_search_query || '%'
    OR COALESCE(p.first_name, '') ILIKE '%' || p_search_query || '%'
    OR COALESCE(p.last_name, '') ILIKE '%' || p_search_query || '%'
    OR l.title ILIKE '%' || p_search_query || '%'
  ORDER BY
    CASE WHEN p_sort_by = 'oldest' THEN COALESCE(latest.created_at, r.last_message_at) END ASC,
    CASE WHEN p_sort_by <> 'oldest' THEN COALESCE(latest.created_at, r.last_message_at) END DESC;
END;
$$;


ALTER FUNCTION "public"."search_inbox_conversations"("p_user_id" "uuid", "p_search_query" "text", "p_sort_by" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "booking_date" "date",
    "cancellation_policy_snapshot" "jsonb",
    "checkin_date" "date" NOT NULL,
    "checkout_date" "date" NOT NULL,
    "cleaning_fee" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" DEFAULT 'IQD'::"text",
    "end_time" time without time zone,
    "guest_service_fee_rate" numeric,
    "guest_user_id" "uuid" NOT NULL,
    "guests" numeric NOT NULL,
    "host_commission_amount" numeric,
    "host_commission_rate" numeric,
    "host_payout_gross" numeric,
    "host_payout_net" numeric,
    "hours" numeric,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "nights" numeric NOT NULL,
    "notes" "text",
    "platform_revenue_total" numeric,
    "price_per_hour" numeric,
    "pricing_breakdown" "jsonb",
    "service_fee" numeric,
    "start_time" time without time zone,
    "status" "public"."booking_status" DEFAULT 'pending_payment'::"public"."booking_status",
    "subtotal" numeric NOT NULL,
    "tax_rate" numeric,
    "taxes" numeric,
    "total_price" numeric NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."bookings" REPLICA IDENTITY FULL;


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cancellation_policies" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "days_before_checkin" numeric NOT NULL,
    "description" "text" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "name" "text" NOT NULL,
    "policy_key" "text" NOT NULL,
    "refund_percentage" numeric NOT NULL
);


ALTER TABLE "public"."cancellation_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cities" (
    "country_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "featured_image_url" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "is_featured" boolean,
    "name" "text" NOT NULL,
    "state_region_id" "uuid",
    "timezone" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."countries" (
    "code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "name" "text" NOT NULL,
    "phone_code" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."countries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."disputes" (
    "admin_decision" "text",
    "approved_refund_amount" numeric,
    "assigned_admin_id" "uuid",
    "attachment_urls" "text"[],
    "booking_id" "uuid" NOT NULL,
    "category" "public"."dispute_category" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "initiated_by_user_id" "uuid" NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "refund_transaction_id" "uuid",
    "requested_refund_amount" numeric,
    "resolution_notes" "text",
    "resolved_at" timestamp with time zone,
    "resolved_by_admin_id" "uuid",
    "status" "public"."dispute_status" NOT NULL,
    "subject" "text" NOT NULL,
    "support_thread_id" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_role" "text" NOT NULL
);


ALTER TABLE "public"."disputes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."guest_debts" (
    "amount" numeric NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" NOT NULL,
    "dispute_id" "uuid" NOT NULL,
    "expires_at" timestamp with time zone,
    "guest_user_id" "uuid" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notes" "text",
    "paid_at" timestamp with time zone,
    "payment_transaction_id" "uuid",
    "reason" "text" NOT NULL,
    "status" "text" NOT NULL,
    "waived_at" timestamp with time zone,
    "waived_by_admin_id" "uuid"
);


ALTER TABLE "public"."guest_debts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."host_commission_rates" (
    "host_user_id" "uuid" NOT NULL,
    "commission_rate" numeric(5,4) NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "host_commission_rates_commission_rate_check" CHECK ((("commission_rate" >= (0)::numeric) AND ("commission_rate" <= (1)::numeric)))
);


ALTER TABLE "public"."host_commission_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_availability" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "end_date" "date" NOT NULL,
    "end_time" time without time zone,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "price" numeric,
    "start_date" "date" NOT NULL,
    "start_time" time without time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."listing_availability" REPLICA IDENTITY FULL;


ALTER TABLE "public"."listing_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."listing_moderation_feedback" (
    "admin_user_id" "uuid" NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_resolved" boolean DEFAULT false NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "section_key" "text" NOT NULL,
    "status" "text" NOT NULL
);


ALTER TABLE "public"."listing_moderation_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_threads" (
    "booking_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_locked" boolean DEFAULT false NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "listing_id" "uuid",
    "locked_at" timestamp with time zone,
    "locked_reason" "text",
    "thread_type" "public"."thread_type" DEFAULT 'user_to_user'::"public"."thread_type",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "attachment_type" "text",
    "attachment_url" "text",
    "body" "text" NOT NULL,
    "booking_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "read" boolean DEFAULT false,
    "thread_id" "uuid",
    "to_user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payouts" (
    "amount" numeric NOT NULL,
    "base_cleaning_fee" numeric,
    "base_subtotal" numeric,
    "booking_id" "uuid" NOT NULL,
    "commission_amount" numeric,
    "commission_on_retained" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" NOT NULL,
    "dispute_ids" "text"[],
    "gross_revenue" numeric,
    "guest_total_payment" numeric,
    "host_retained_gross" numeric,
    "host_user_id" "uuid" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "net_before_adjustments" numeric,
    "notes" "text",
    "original_amount" numeric,
    "payout_date" "date",
    "refund_percentage_applied" numeric,
    "status" "text" NOT NULL,
    "total_dispute_refunds" numeric,
    "transaction_type" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "effective_from" "text" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "setting_key" "text" NOT NULL,
    "setting_type" "text" NOT NULL,
    "setting_value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "about" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text" NOT NULL,
    "first_name" "text",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_demo" boolean,
    "is_system" boolean,
    "last_name" "text",
    "phone" "text",
    "status" "public"."user_status" DEFAULT 'active'::"public"."user_status" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verified" boolean DEFAULT false
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_listings" WITH ("security_invoker"='true') AS
 SELECT "address",
    "amenities",
    "base_price",
    "bathrooms",
    "bedrooms",
    "beds",
    "cancellation_policy_id",
    "checkin_from",
    "checkout_until",
    "city",
    "city_id",
    "cleaning_fee",
    "closing_time",
    "country",
    "country_id",
    "court_type",
    "cover_image",
    "created_at",
    "currency",
    "description",
    "guests_max",
    "has_changing_rooms",
    "has_lighting",
    "has_parking",
    "has_showers",
    "host_user_id",
    "house_rules",
    "id",
    "images",
    "is_indoor",
    "latitude",
    "longitude",
    "max_hours",
    "max_nights",
    "min_hours",
    "min_nights",
    "monthly_discount",
    "opening_time",
    "postal_code",
    "rating_avg",
    "rating_count",
    "rejection_reason",
    "reviewed_at",
    "reviewed_by",
    "security_deposit",
    "size_sqft",
    "slot_duration_minutes",
    "state",
    "state_region_id",
    "status",
    "surface_type",
    "title",
    "type",
    "updated_at",
    "weekly_discount"
   FROM "public"."listings"
  WHERE ("status" = 'approved'::"public"."listing_status");


ALTER VIEW "public"."public_listings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."public_profiles" WITH ("security_invoker"='true') AS
 SELECT "id",
    "first_name",
    "last_name",
    "avatar_url",
    "verified"
   FROM "public"."profiles";


ALTER VIEW "public"."public_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "author_user_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid" NOT NULL,
    "rating" numeric NOT NULL,
    "status" "public"."review_status" DEFAULT 'approved'::"public"."review_status" NOT NULL,
    "text" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."states_regions" (
    "code" "text",
    "country_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "name" "text" NOT NULL,
    "type" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."states_regions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "amount" numeric NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "currency" "text" NOT NULL,
    "dispute_id" "uuid",
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "status" "text" NOT NULL,
    "type" "text" NOT NULL
);


ALTER TABLE "public"."transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "user_id" "uuid" NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cancellation_policies"
    ADD CONSTRAINT "cancellation_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cancellation_policies"
    ADD CONSTRAINT "cancellation_policy_key_unique" UNIQUE ("policy_key");



ALTER TABLE ONLY "public"."cities"
    ADD CONSTRAINT "cities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."countries"
    ADD CONSTRAINT "countries_code_unique" UNIQUE ("code");



ALTER TABLE ONLY "public"."countries"
    ADD CONSTRAINT "countries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."disputes"
    ADD CONSTRAINT "disputes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."faqs"
    ADD CONSTRAINT "faqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."guest_debts"
    ADD CONSTRAINT "guest_debts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."host_commission_rates"
    ADD CONSTRAINT "host_commission_rates_pkey" PRIMARY KEY ("host_user_id");



ALTER TABLE ONLY "public"."listing_availability"
    ADD CONSTRAINT "listing_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listing_moderation_feedback"
    ADD CONSTRAINT "listing_moderation_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_threads"
    ADD CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_setting_key_unique" UNIQUE ("setting_key");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."states_regions"
    ADD CONSTRAINT "states_regions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_unique" UNIQUE ("user_id", "role");



CREATE INDEX "bookings_listing_date_idx" ON "public"."bookings" USING "btree" ("listing_id", "booking_date");



CREATE OR REPLACE TRIGGER "apply_host_commission_before_booking" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."apply_host_commission_to_booking"();



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_guest_fk" FOREIGN KEY ("guest_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_listing_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cities"
    ADD CONSTRAINT "cities_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id");



ALTER TABLE ONLY "public"."cities"
    ADD CONSTRAINT "cities_state_region_id_fkey" FOREIGN KEY ("state_region_id") REFERENCES "public"."states_regions"("id");



ALTER TABLE ONLY "public"."guest_debts"
    ADD CONSTRAINT "guest_debts_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."guest_debts"
    ADD CONSTRAINT "guest_debts_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id");



ALTER TABLE ONLY "public"."host_commission_rates"
    ADD CONSTRAINT "host_commission_rates_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."host_commission_rates"
    ADD CONSTRAINT "host_commission_rates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."listing_availability"
    ADD CONSTRAINT "listing_availability_listing_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_cancellation_fk" FOREIGN KEY ("cancellation_policy_id") REFERENCES "public"."cancellation_policies"("id");



ALTER TABLE ONLY "public"."listings"
    ADD CONSTRAINT "listings_host_fk" FOREIGN KEY ("host_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_thread_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_auth_user_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_author_fk" FOREIGN KEY ("author_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_listing_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."states_regions"
    ADD CONSTRAINT "states_regions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_dispute_id_fkey" FOREIGN KEY ("dispute_id") REFERENCES "public"."disputes"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "availability_host_manage" ON "public"."listing_availability" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "listing_availability"."listing_id") AND (("l"."host_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "listing_availability"."listing_id") AND (("l"."host_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"))))));



CREATE POLICY "availability_read" ON "public"."listing_availability" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_guest_insert" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK (("guest_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "bookings_participant_read" ON "public"."bookings" FOR SELECT TO "authenticated" USING ((("guest_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "bookings"."listing_id") AND ("l"."host_user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "bookings_participant_update" ON "public"."bookings" FOR UPDATE TO "authenticated" USING ((("guest_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "bookings"."listing_id") AND ("l"."host_user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"))) WITH CHECK ((("guest_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."listings" "l"
  WHERE (("l"."id" = "bookings"."listing_id") AND ("l"."host_user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



ALTER TABLE "public"."cancellation_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."countries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "debts_guest_read" ON "public"."guest_debts" FOR SELECT TO "authenticated" USING ((("guest_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



ALTER TABLE "public"."disputes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "disputes_create" ON "public"."disputes" FOR INSERT TO "authenticated" WITH CHECK (("initiated_by_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "disputes_participant" ON "public"."disputes" FOR SELECT TO "authenticated" USING ((("initiated_by_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



ALTER TABLE "public"."faqs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."guest_debts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."host_commission_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_availability" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listing_moderation_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."listings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "listings_host_delete" ON "public"."listings" FOR DELETE TO "authenticated" USING ((("host_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "listings_host_insert" ON "public"."listings" FOR INSERT TO "authenticated" WITH CHECK ((("host_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'host'::"public"."app_role") OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"))));



CREATE POLICY "listings_host_update" ON "public"."listings" FOR UPDATE TO "authenticated" USING ((("host_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"))) WITH CHECK ((("host_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "listings_public_read" ON "public"."listings" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'approved'::"public"."listing_status") OR ("host_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



ALTER TABLE "public"."message_threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_participant_read" ON "public"."messages" FOR SELECT TO "authenticated" USING ((("from_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("to_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "messages_participant_update" ON "public"."messages" FOR UPDATE TO "authenticated" USING (("to_user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("to_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "messages_sender_insert" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK (("from_user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payouts_owner_read" ON "public"."payouts" FOR SELECT TO "authenticated" USING ((("host_user_id" = ( SELECT "auth"."uid"() AS "uid")) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "private_rows_admin" ON "public"."listing_moderation_feedback" TO "authenticated" USING ("private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")) WITH CHECK ("private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_public_card_read" ON "public"."profiles" FOR SELECT TO "authenticated", "anon" USING ((("verified" = true) OR ("id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "id") OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "public_cancellation_read" ON "public"."cancellation_policies" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "public_cities_read" ON "public"."cities" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "public_faq_read" ON "public"."faqs" FOR SELECT TO "authenticated", "anon" USING (("status" = 'published'::"text"));



CREATE POLICY "public_reference_read" ON "public"."countries" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "public_regions_read" ON "public"."states_regions" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "public_settings_read" ON "public"."platform_settings" FOR SELECT TO "authenticated", "anon" USING ("is_active");



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_author_insert" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK (("author_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "reviews_author_update" ON "public"."reviews" FOR UPDATE TO "authenticated" USING (("author_user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("author_user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "reviews_public_read" ON "public"."reviews" FOR SELECT TO "authenticated", "anon" USING (("status" = 'approved'::"public"."review_status"));



CREATE POLICY "roles_admin_manage" ON "public"."user_roles" TO "authenticated" USING ("private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")) WITH CHECK ("private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "roles_select_self" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "user_id") OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



ALTER TABLE "public"."states_regions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "threads_authenticated_insert" ON "public"."message_threads" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "threads_authenticated_read" ON "public"."message_threads" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "threads_authenticated_update" ON "public"."message_threads" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transactions_guest_read" ON "public"."transactions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "transactions"."booking_id") AND ("b"."guest_user_id" = ( SELECT "auth"."uid"() AS "uid"))))) OR "private"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")));



ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "private" TO "anon";
GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."create_dispute_with_support_thread"("p_booking_id" "uuid", "p_category" "public"."dispute_category", "p_subject" "text", "p_description" "text", "p_requested_refund_amount" numeric, "p_attachment_urls" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."create_dispute_with_support_thread"("p_booking_id" "uuid", "p_category" "public"."dispute_category", "p_subject" "text", "p_description" "text", "p_requested_refund_amount" numeric, "p_attachment_urls" "text"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "private"."handle_new_user"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."has_role"("target_user" "uuid", "target_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."has_role"("target_user" "uuid", "target_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "private"."has_role"("target_user" "uuid", "target_role" "public"."app_role") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."sync_verified_profile"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."admin_delete_user_soft"("p_user_id" "uuid", "p_admin_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_user_soft"("p_user_id" "uuid", "p_admin_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_export_reviews_custom_report"("p_start_date" "date", "p_end_date" "date", "p_city_ids" "uuid"[], "p_min_ratings" integer[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_export_reviews_custom_report"("p_start_date" "date", "p_end_date" "date", "p_city_ids" "uuid"[], "p_min_ratings" integer[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_get_detailed_revenue_report"("p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_detailed_revenue_report"("p_start_date" "date", "p_end_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_get_dispute_details"("p_dispute_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_dispute_details"("p_dispute_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_get_host_commissions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_host_commissions"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_get_listings_reviews_report"("p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_listings_reviews_report"("p_start_date" "date", "p_end_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_get_support_conversations"("p_admin_user_id" "uuid", "p_search_query" "text", "p_sort_by" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_support_conversations"("p_admin_user_id" "uuid", "p_search_query" "text", "p_sort_by" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_get_weekly_bookings"("weeks_back" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_weekly_bookings"("weeks_back" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_get_weekly_revenue"("weeks_back" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_weekly_revenue"("weeks_back" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_get_weekly_revenue_report"("p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_weekly_revenue_report"("p_start_date" "date", "p_end_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_mark_payout_completed"("p_payout_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_mark_payout_completed"("p_payout_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_resolve_dispute"("p_dispute_id" "uuid", "p_admin_decision" "text", "p_approved_refund_amount" numeric, "p_resolution_notes" "text", "p_is_submit" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_resolve_dispute"("p_dispute_id" "uuid", "p_admin_decision" "text", "p_approved_refund_amount" numeric, "p_resolution_notes" "text", "p_is_submit" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_search_bookings"("search_query" "text", "status_filter" "public"."booking_status", "min_price" numeric, "max_price" numeric, "checkin_start" "date", "checkin_end" "date", "checkout_start" "date", "checkout_end" "date", "sort_by" "text", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_search_bookings"("search_query" "text", "status_filter" "public"."booking_status", "min_price" numeric, "max_price" numeric, "checkin_start" "date", "checkin_end" "date", "checkout_start" "date", "checkout_end" "date", "sort_by" "text", "sort_order" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_search_bookings"("search_query" "text", "status_filter" "public"."booking_status", "min_price" numeric, "max_price" numeric, "checkin_start" "date", "checkin_end" "date", "checkout_start" "date", "checkout_end" "date", "sort_by" "text", "sort_order" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_search_disputes"("search_query" "text", "status_filter" "text", "category_filter" "text", "min_amount" numeric, "max_amount" numeric, "created_start" "date", "created_end" "date", "sort_by" "text", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_search_disputes"("search_query" "text", "status_filter" "text", "category_filter" "text", "min_amount" numeric, "max_amount" numeric, "created_start" "date", "created_end" "date", "sort_by" "text", "sort_order" "text") TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."faqs" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."faqs" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."faqs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_search_faqs"("search_query" "text", "category_filter" "text", "status_filter" "text", "sort_by" "text", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_search_faqs"("search_query" "text", "category_filter" "text", "status_filter" "text", "sort_by" "text", "sort_order" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_search_guest_debts"("search_query" "text", "status_filter" "text", "reason_filter" "text", "min_amount" numeric, "max_amount" numeric, "sort_by" "text", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_search_guest_debts"("search_query" "text", "status_filter" "text", "reason_filter" "text", "min_amount" numeric, "max_amount" numeric, "sort_by" "text", "sort_order" "text") TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."listings" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."listings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."listings" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_search_listings"("search_query" "text", "status_filter" "public"."listing_status", "min_price" numeric, "max_price" numeric, "sort_by" "text", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_search_listings"("search_query" "text", "status_filter" "public"."listing_status", "min_price" numeric, "max_price" numeric, "sort_by" "text", "sort_order" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_search_payouts"("search_query" "text", "transaction_type_filter" "text", "status_filter" "text", "min_amount" numeric, "max_amount" numeric, "sort_by" "text", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_search_payouts"("search_query" "text", "transaction_type_filter" "text", "status_filter" "text", "min_amount" numeric, "max_amount" numeric, "sort_by" "text", "sort_order" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_search_reviews"("search_query" "text", "status_filter" "text", "sort_by" "text", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_search_reviews"("search_query" "text", "status_filter" "text", "sort_by" "text", "sort_order" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_search_transactions"("search_query" "text", "type_filter" "text", "status_filter" "text", "min_amount" numeric, "max_amount" numeric, "sort_by" "text", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_search_transactions"("search_query" "text", "type_filter" "text", "status_filter" "text", "min_amount" numeric, "max_amount" numeric, "sort_by" "text", "sort_order" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_search_users"("search_query" "text", "status_filter" "text", "role_filter" "text", "sort_by" "text", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_search_users"("search_query" "text", "status_filter" "text", "role_filter" "text", "sort_by" "text", "sort_order" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_set_host_commission"("p_host_user_id" "uuid", "p_commission_rate" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_host_commission"("p_host_user_id" "uuid", "p_commission_rate" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_suspend_user"("p_user_id" "uuid", "p_admin_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_suspend_user"("p_user_id" "uuid", "p_admin_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_unsuspend_user"("p_user_id" "uuid", "p_admin_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_unsuspend_user"("p_user_id" "uuid", "p_admin_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."apply_host_commission_to_booking"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."booking_income_is_earned"("p_booking_date" "date", "p_checkin_date" "date", "p_start_time" time without time zone, "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."booking_income_is_earned"("p_booking_date" "date", "p_checkin_date" "date", "p_start_time" time without time zone, "p_status" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."cancel_booking_with_refund"("p_booking_id" "uuid", "p_cancellation_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_booking_with_refund"("p_booking_id" "uuid", "p_cancellation_reason" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."check_guest_outstanding_debts"("target_guest" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."confirm_booking_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_provider" "text", "p_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_booking_payment"("p_booking_id" "uuid", "p_amount" numeric, "p_provider" "text", "p_currency" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_dispute_with_support_thread"("p_booking_id" "uuid", "p_category" "public"."dispute_category", "p_subject" "text", "p_description" "text", "p_requested_refund_amount" numeric, "p_attachment_urls" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_dispute_with_support_thread"("p_booking_id" "uuid", "p_category" "public"."dispute_category", "p_subject" "text", "p_description" "text", "p_requested_refund_amount" numeric, "p_attachment_urls" "text"[]) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."create_hourly_booking"("p_listing_id" "uuid", "p_booking_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone, "p_players" integer, "p_subtotal" numeric, "p_pricing_breakdown" "jsonb", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_hourly_booking"("p_listing_id" "uuid", "p_booking_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone, "p_players" integer, "p_subtotal" numeric, "p_pricing_breakdown" "jsonb", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_hourly_booking"("p_listing_id" "uuid", "p_booking_date" "date", "p_start_time" time without time zone, "p_end_time" time without time zone, "p_players" integer, "p_subtotal" numeric, "p_pricing_breakdown" "jsonb", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_dashboard_kpis"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_dashboard_kpis"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_eligible_refund_amount"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_host_dashboard_kpis"("p_host_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_host_dashboard_kpis"("p_host_user_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_host_earnings_report"("p_host_user_id" "uuid", "p_start_month" "date", "p_end_month" "date", "p_search_query" "text", "p_listing_ids" "uuid"[], "p_min_gross" numeric, "p_max_gross" numeric, "p_min_net" numeric, "p_max_net" numeric, "p_sort_by" "text", "p_sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_host_earnings_report"("p_host_user_id" "uuid", "p_start_month" "date", "p_end_month" "date", "p_search_query" "text", "p_listing_ids" "uuid"[], "p_min_gross" numeric, "p_max_gross" numeric, "p_min_net" numeric, "p_max_net" numeric, "p_sort_by" "text", "p_sort_order" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_listing_bookable_dates"("p_listing_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_duration_hours" integer, "p_step_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_listing_bookable_dates"("p_listing_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_duration_hours" integer, "p_step_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_listing_bookable_dates"("p_listing_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_duration_hours" integer, "p_step_minutes" integer) TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_listing_slot_grid"("p_listing_id" "uuid", "p_date" "date", "p_step_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_listing_slot_grid"("p_listing_id" "uuid", "p_date" "date", "p_step_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_listing_slot_grid"("p_listing_id" "uuid", "p_date" "date", "p_step_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_listing_slots"("p_listing_id" "uuid", "p_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_listing_slots"("p_listing_id" "uuid", "p_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_listing_slots"("p_listing_id" "uuid", "p_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_or_create_thread"("p_participant_1_id" "uuid", "p_participant_2_id" "uuid", "p_listing_id" "uuid", "p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_or_create_thread"("p_participant_1_id" "uuid", "p_participant_2_id" "uuid", "p_listing_id" "uuid", "p_booking_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."host_accept_booking"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."host_accept_booking"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."host_reject_booking"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."host_reject_booking"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."host_search_bookings"("host_id" "uuid", "search_query" "text", "status_filter" "public"."booking_status", "min_price" numeric, "max_price" numeric, "checkin_start" "date", "checkin_end" "date", "checkout_start" "date", "checkout_end" "date", "sort_by" "text", "sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."host_search_bookings"("host_id" "uuid", "search_query" "text", "status_filter" "public"."booking_status", "min_price" numeric, "max_price" numeric, "checkin_start" "date", "checkin_end" "date", "checkout_start" "date", "checkout_end" "date", "sort_by" "text", "sort_order" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."host_search_listings"("host_id" "uuid", "search_query" "text", "status_filter" "public"."listing_status", "min_price" numeric, "max_price" numeric, "sort_by" "text", "sort_order" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."host_search_payouts"("p_host_user_id" "uuid", "p_search_query" "text", "p_status_filter" "text", "p_transaction_type_filter" "text", "p_min_amount" numeric, "p_max_amount" numeric, "p_sort_by" "text", "p_sort_order" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."host_search_payouts"("p_host_user_id" "uuid", "p_search_query" "text", "p_status_filter" "text", "p_transaction_type_filter" "text", "p_min_amount" numeric, "p_max_amount" numeric, "p_sort_by" "text", "p_sort_order" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."process_guest_debt_payment"("p_guest_debt_id" "uuid", "p_payment_amount" numeric, "p_payment_currency" "text", "p_payment_provider" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."search_inbox_conversations"("p_user_id" "uuid", "p_search_query" "text", "p_sort_by" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_inbox_conversations"("p_user_id" "uuid", "p_search_query" "text", "p_sort_by" "text") TO "authenticated";



GRANT MAINTAIN ON TABLE "public"."bookings" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."bookings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."bookings" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."cancellation_policies" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."cancellation_policies" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cancellation_policies" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."cities" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."cities" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."cities" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."countries" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."countries" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."countries" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."disputes" TO "anon";
GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."disputes" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."disputes" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."guest_debts" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."guest_debts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."guest_debts" TO "service_role";



GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."host_commission_rates" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."listing_availability" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."listing_availability" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."listing_availability" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."listing_moderation_feedback" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."listing_moderation_feedback" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."listing_moderation_feedback" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."message_threads" TO "anon";
GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."message_threads" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."message_threads" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."messages" TO "anon";
GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."messages" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."messages" TO "service_role";



GRANT UPDATE("read") ON TABLE "public"."messages" TO "authenticated";



GRANT MAINTAIN ON TABLE "public"."payouts" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."payouts" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."payouts" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."platform_settings" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."platform_settings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."platform_settings" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT("avatar_url") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("avatar_url") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("first_name") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("first_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("id") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("id") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("last_name") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("last_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT("verified") ON TABLE "public"."profiles" TO "anon";
GRANT SELECT("verified") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."public_listings" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."public_listings" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."public_listings" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."public_profiles" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."public_profiles" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."public_profiles" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."reviews" TO "anon";
GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."reviews" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."reviews" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."states_regions" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."states_regions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."states_regions" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."transactions" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."transactions" TO "authenticated";
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."transactions" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."user_roles" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";







