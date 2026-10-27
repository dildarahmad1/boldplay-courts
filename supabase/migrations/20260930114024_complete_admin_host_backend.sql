-- Complete the RPC surface used by the production host/admin dashboards.
-- All functions run as the caller and rely on RLS. Explicit role checks prevent
-- an authenticated non-admin from using administrative endpoints.

create or replace function public.admin_get_weekly_revenue(weeks_back integer default 4)
returns table(week_start date, week_label text, revenue numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'admin access required'; end if;
  return query
  with weeks as (
    select generate_series(date_trunc('week', current_date)::date - (greatest(weeks_back,1)-1)*7,
                           date_trunc('week', current_date)::date, interval '1 week')::date d
  )
  select w.d, to_char(w.d, 'Mon DD'), coalesce(sum(b.platform_revenue_total),0)
  from weeks w left join bookings b on b.created_at::date >= w.d and b.created_at::date < w.d+7
    and b.status::text in ('confirmed','completed')
  group by w.d order by w.d;
end $$;

create or replace function public.admin_get_weekly_bookings(weeks_back integer default 4)
returns table(week_start date, week_label text, booking_count bigint)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
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

create or replace function public.admin_search_listings(
  search_query text default null, status_filter listing_status default null,
  min_price numeric default null, max_price numeric default null,
  sort_by text default 'created_at', sort_order text default 'desc')
returns setof public.listings
language plpgsql stable security invoker set search_path = public, pg_temp as $$
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

create or replace function public.admin_search_users(
  search_query text default null, status_filter text default null, role_filter text default null,
  sort_by text default 'created_at', sort_order text default 'desc')
returns table(id uuid, email text, first_name text, last_name text, full_name text, phone text,
  avatar_url text, status text, verified boolean, created_at timestamptz, roles text[])
language plpgsql stable security invoker set search_path = public, pg_temp as $$
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

create or replace function public.admin_search_reviews(
  search_query text default null, status_filter text default null,
  sort_by text default 'created_at', sort_order text default 'desc')
returns table(id uuid, booking_id uuid, listing_id uuid, author_user_id uuid, rating numeric, text text,
  status text, created_at timestamptz, updated_at timestamptz, listing_title text,
  author_name text, author_email text, author_avatar text)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'admin access required'; end if;
  return query select r.id,r.booking_id,r.listing_id,r.author_user_id,r.rating,r.text,r.status::text,
    r.created_at,r.updated_at,l.title,trim(concat_ws(' ',p.first_name,p.last_name)),p.email,p.avatar_url
  from reviews r join listings l on l.id=r.listing_id left join profiles p on p.id=r.author_user_id
  where (search_query is null or l.title ilike '%'||search_query||'%' or r.text ilike '%'||search_query||'%' or p.email ilike '%'||search_query||'%')
    and (status_filter is null or r.status::text=status_filter)
  order by case when sort_order='asc' then r.created_at end asc, case when sort_order<>'asc' then r.created_at end desc;
end $$;

create or replace function public.admin_search_transactions(
  search_query text default null, type_filter text default null, status_filter text default null,
  min_amount numeric default null, max_amount numeric default null,
  sort_by text default 'created_at', sort_order text default 'desc')
returns table(id uuid, booking_id uuid, type text, amount numeric, currency text, provider text, status text,
  created_at timestamptz, guest_user_id uuid, guest_name text, guest_email text, guest_avatar text,
  listing_id uuid, listing_title text)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
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

create or replace function public.admin_search_payouts(
  search_query text default null, transaction_type_filter text default null, status_filter text default null,
  min_amount numeric default null, max_amount numeric default null,
  sort_by text default 'created_at', sort_order text default 'desc')
returns table(id uuid, booking_id uuid, host_user_id uuid, amount numeric, currency text, status text,
  payout_date date, created_at timestamptz, notes text, booking_subtotal numeric,
  booking_host_commission_amount numeric, booking_host_payout_net numeric, booking_host_payout_gross numeric,
  checkin_date date, checkout_date date, listing_id uuid, listing_title text, guest_name text, guest_email text,
  guest_avatar text, host_name text, host_email text, host_avatar text, booking_status text, transaction_type text,
  original_amount numeric, cleaning_fee numeric, dispute_ids text[], total_dispute_refunds numeric,
  refund_percentage_applied numeric, host_retained_gross numeric, commission_on_retained numeric,
  guest_total_payment numeric, base_subtotal numeric, base_cleaning_fee numeric, gross_revenue numeric,
  commission_amount numeric, net_before_adjustments numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
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

create or replace function public.host_search_payouts(
  p_host_user_id uuid, p_search_query text default null, p_status_filter text default null,
  p_transaction_type_filter text default null, p_min_amount numeric default null, p_max_amount numeric default null,
  p_sort_by text default 'created_at', p_sort_order text default 'desc')
returns setof jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
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

create or replace function public.admin_get_listings_reviews_report(p_start_date date, p_end_date date)
returns table(listing_id uuid, listing_title text, listing_city text, total_reviews bigint, average_rating numeric, last_review_date timestamptz)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'admin access required'; end if;
  return query select l.id,l.title,l.city,count(r.id),coalesce(round(avg(r.rating),2),0),max(r.created_at)
  from listings l left join reviews r on r.listing_id=l.id and r.created_at::date between p_start_date and p_end_date
  group by l.id,l.title,l.city order by count(r.id) desc,l.title;
end $$;

create or replace function public.admin_get_weekly_revenue_report(p_start_date date, p_end_date date)
returns table(week_start date, week_end date, week_label text, bookings_count bigint, gross_revenue numeric,
  refunds_amount numeric, host_payouts_amount numeric, net_revenue numeric)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if not private.has_role(auth.uid(), 'admin') then raise exception 'admin access required'; end if;
  return query
  with weeks as (select generate_series(date_trunc('week',p_start_date)::date,date_trunc('week',p_end_date)::date,interval '1 week')::date d),
  bs as (select date_trunc('week',created_at)::date d,count(*) c,coalesce(sum(total_price),0) gross from bookings where created_at::date between p_start_date and p_end_date group by 1),
  tx as (select date_trunc('week',created_at)::date d,coalesce(sum(amount) filter(where type ilike '%refund%'),0) refunds from transactions where created_at::date between p_start_date and p_end_date group by 1),
  py as (select date_trunc('week',created_at)::date d,coalesce(sum(amount),0) paid from payouts where created_at::date between p_start_date and p_end_date group by 1)
  select w.d,w.d+6,to_char(w.d,'Mon DD')||' - '||to_char(w.d+6,'Mon DD'),coalesce(bs.c,0),coalesce(bs.gross,0),coalesce(tx.refunds,0),coalesce(py.paid,0),coalesce(bs.gross,0)-coalesce(tx.refunds,0)-coalesce(py.paid,0)
  from weeks w left join bs on bs.d=w.d left join tx on tx.d=w.d left join py on py.d=w.d order by w.d;
end $$;

create or replace function public.admin_mark_payout_completed(p_payout_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if not private.has_role(auth.uid(),'admin') then return jsonb_build_object('success',false,'error','admin access required'); end if;
  update payouts set status='completed',payout_date=coalesce(payout_date,current_date),updated_at=now() where id=p_payout_id;
  if not found then return jsonb_build_object('success',false,'error','payout not found'); end if;
  return jsonb_build_object('success',true);
end $$;

create or replace function public.admin_search_disputes(
  search_query text default null, status_filter text default null, category_filter text default null,
  min_amount numeric default null, max_amount numeric default null, created_start date default null,
  created_end date default null, sort_by text default 'created_at', sort_order text default 'desc')
returns table(id uuid, dispute_display_id text, booking_id uuid, booking_display_id text, listing_id uuid,
  listing_title text, listing_city text, listing_country text, host_user_id uuid, host_name text, host_email text,
  host_avatar text, guest_user_id uuid, guest_name text, guest_email text, guest_avatar text, category text,
  status text, subject text, description text, requested_refund_amount numeric, support_thread_id uuid,
  resolution_notes text, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
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

create or replace function public.admin_get_dispute_details(p_dispute_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
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

create or replace function public.admin_resolve_dispute(p_dispute_id uuid,p_admin_decision text,
  p_approved_refund_amount numeric,p_resolution_notes text,p_is_submit boolean default false)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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

create or replace function public.admin_search_guest_debts(search_query text default null,status_filter text default null,
  reason_filter text default null,min_amount numeric default null,max_amount numeric default null,
  sort_by text default 'created_at',sort_order text default 'desc')
returns setof jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
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

create or replace function public.admin_get_support_conversations(p_admin_user_id uuid,p_search_query text default null,p_sort_by text default 'last_message_time')
returns table(thread_id uuid,user_id uuid,user_name text,last_message text,last_message_time timestamptz,unread_count bigint)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  return query
  with participant as (select mt.id tid,coalesce((select case when m.from_user_id<>p_admin_user_id then m.from_user_id else m.to_user_id end from messages m where m.thread_id=mt.id order by m.created_at desc limit 1),p_admin_user_id) uid from message_threads mt where mt.thread_type::text='support'),
  latest as (select distinct on(m.thread_id) m.thread_id,m.body,m.created_at from messages m order by m.thread_id,m.created_at desc)
  select p.tid,p.uid,coalesce(nullif(trim(concat_ws(' ',pr.first_name,pr.last_name)),''),pr.email,'User'),coalesce(l.body,''),coalesce(l.created_at,mt.last_message_at),
    (select count(*) from messages um where um.thread_id=p.tid and um.to_user_id=p_admin_user_id and coalesce(um.read,false)=false)
  from participant p join message_threads mt on mt.id=p.tid left join latest l on l.thread_id=p.tid left join profiles pr on pr.id=p.uid
  where p_search_query is null or pr.email ilike '%'||p_search_query||'%' or concat_ws(' ',pr.first_name,pr.last_name) ilike '%'||p_search_query||'%'
  order by coalesce(l.created_at,mt.last_message_at) desc;
end $$;

create or replace function public.admin_export_reviews_custom_report(p_start_date date,p_end_date date,p_city_ids uuid[] default null,p_min_ratings integer[] default null)
returns table(listing_id uuid,listing_name text,city_name text,country_name text,user_full_name text,review_text text,rating numeric,review_created_at timestamptz)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
  if not private.has_role(auth.uid(),'admin') then raise exception 'admin access required'; end if;
  return query select l.id,l.title,l.city,l.country,trim(concat_ws(' ',p.first_name,p.last_name)),r.text,r.rating,r.created_at
  from reviews r join listings l on l.id=r.listing_id left join profiles p on p.id=r.author_user_id
  where r.created_at::date between p_start_date and p_end_date
    and (p_city_ids is null or l.city_id=any(p_city_ids)) and (p_min_ratings is null or r.rating::integer=any(p_min_ratings))
  order by r.created_at desc;
end $$;

create or replace function public.get_host_earnings_report(
  p_host_user_id uuid,p_start_month date,p_end_month date,p_search_query text default null,
  p_listing_ids uuid[] default null,p_min_gross numeric default null,p_max_gross numeric default null,
  p_min_net numeric default null,p_max_net numeric default null,p_sort_by text default 'month_date',p_sort_order text default 'desc')
returns table(listing_id uuid,listing_title text,month_year text,month_date date,nights_booked numeric,
  completed_count bigint,cancel_percentage numeric,occupancy_percentage numeric,average_nightly_rate numeric,
  gross_earnings numeric,platform_fees numeric,net_earnings numeric,last_payout_date date,
  cancellation_income numeric,dispute_refunds numeric,dispute_income numeric,actual_net_earnings numeric)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
begin
  if p_host_user_id<>auth.uid() and not private.has_role(auth.uid(),'admin') then raise exception 'host access required'; end if;
  return query
  with grouped as (
    select l.id,l.title,date_trunc('month',b.booking_date)::date md,
      coalesce(sum(coalesce(b.hours,b.nights,1)) filter(where b.status::text in ('confirmed','completed')),0) booked,
      count(*) filter(where b.status::text='completed') completed,
      count(*) filter(where b.status::text in ('cancelled','refunded')) cancelled,count(*) total,
      coalesce(avg(case when coalesce(b.hours,b.nights,0)>0 then b.subtotal/coalesce(b.hours,b.nights) end),0) avg_rate,
      coalesce(sum(b.host_payout_gross) filter(where b.status::text in ('confirmed','completed')),0) gross,
      coalesce(sum(b.host_commission_amount) filter(where b.status::text in ('confirmed','completed')),0) fees,
      coalesce(sum(b.host_payout_net) filter(where b.status::text in ('confirmed','completed')),0) net,
      coalesce(sum(py.host_retained_gross) filter(where b.status::text in ('cancelled','refunded')),0) cancel_income,
      coalesce(sum(py.total_dispute_refunds),0) dispute_refunds,
      coalesce(sum(py.amount) filter(where py.transaction_type='debt_collection'),0) dispute_income,
      max(py.payout_date) last_paid
    from listings l join bookings b on b.listing_id=l.id left join payouts py on py.booking_id=b.id
    where l.host_user_id=p_host_user_id and b.booking_date>=p_start_month and b.booking_date<p_end_month
      and (p_search_query is null or l.title ilike '%'||p_search_query||'%') and (p_listing_ids is null or l.id=any(p_listing_ids))
    group by l.id,l.title,date_trunc('month',b.booking_date)
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

create or replace function public.process_guest_debt_payment(p_guest_debt_id uuid,p_payment_amount numeric,
  p_payment_currency text,p_payment_provider text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
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

revoke execute on function public.get_host_earnings_report(uuid,date,date,text,uuid[],numeric,numeric,numeric,numeric,text,text) from public,anon;
revoke execute on function public.process_guest_debt_payment(uuid,numeric,text,text) from public,anon;

revoke execute on function public.admin_search_disputes(text,text,text,numeric,numeric,date,date,text,text) from public,anon;
revoke execute on function public.admin_get_dispute_details(uuid) from public,anon;
revoke execute on function public.admin_resolve_dispute(uuid,text,numeric,text,boolean) from public,anon;
revoke execute on function public.admin_search_guest_debts(text,text,text,numeric,numeric,text,text) from public,anon;
revoke execute on function public.admin_get_support_conversations(uuid,text,text) from public,anon;
revoke execute on function public.admin_export_reviews_custom_report(date,date,uuid[],integer[]) from public,anon;

revoke execute on function public.admin_get_weekly_revenue(integer) from public, anon;
revoke execute on function public.admin_get_weekly_bookings(integer) from public, anon;
revoke execute on function public.admin_search_listings(text,listing_status,numeric,numeric,text,text) from public, anon;
revoke execute on function public.admin_search_users(text,text,text,text,text) from public, anon;
revoke execute on function public.admin_search_reviews(text,text,text,text) from public, anon;
revoke execute on function public.admin_search_transactions(text,text,text,numeric,numeric,text,text) from public, anon;
revoke execute on function public.admin_search_payouts(text,text,text,numeric,numeric,text,text) from public, anon;
revoke execute on function public.host_search_payouts(uuid,text,text,text,numeric,numeric,text,text) from public, anon;
revoke execute on function public.admin_get_listings_reviews_report(date,date) from public, anon;
revoke execute on function public.admin_get_weekly_revenue_report(date,date) from public, anon;
revoke execute on function public.admin_mark_payout_completed(uuid) from public, anon;
grant execute on function public.admin_get_weekly_revenue(integer) to authenticated;
grant execute on function public.admin_get_weekly_bookings(integer) to authenticated;
grant execute on function public.admin_search_listings(text,listing_status,numeric,numeric,text,text) to authenticated;
grant execute on function public.admin_search_users(text,text,text,text,text) to authenticated;
grant execute on function public.admin_search_reviews(text,text,text,text) to authenticated;
grant execute on function public.admin_search_transactions(text,text,text,numeric,numeric,text,text) to authenticated;
grant execute on function public.admin_search_payouts(text,text,text,numeric,numeric,text,text) to authenticated;
grant execute on function public.host_search_payouts(uuid,text,text,text,numeric,numeric,text,text) to authenticated;
grant execute on function public.admin_get_listings_reviews_report(date,date) to authenticated;
grant execute on function public.admin_get_weekly_revenue_report(date,date) to authenticated;
grant execute on function public.admin_mark_payout_completed(uuid) to authenticated;
grant execute on function public.admin_search_disputes(text,text,text,numeric,numeric,date,date,text,text) to authenticated;
grant execute on function public.admin_get_dispute_details(uuid) to authenticated;
grant execute on function public.admin_resolve_dispute(uuid,text,numeric,text,boolean) to authenticated;
grant execute on function public.admin_search_guest_debts(text,text,text,numeric,numeric,text,text) to authenticated;
grant execute on function public.admin_get_support_conversations(uuid,text,text) to authenticated;
grant execute on function public.admin_export_reviews_custom_report(date,date,uuid[],integer[]) to authenticated;
grant execute on function public.get_host_earnings_report(uuid,date,date,text,uuid[],numeric,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function public.process_guest_debt_payment(uuid,numeric,text,text) to authenticated;
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
