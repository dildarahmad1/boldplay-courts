-- Revenue belongs to the booking date/time, not the time a player or host
-- confirms the reservation. Baghdad is the marketplace's operating timezone.
create or replace function public.booking_income_is_earned(
  p_booking_date date,
  p_checkin_date date,
  p_start_time time,
  p_status text
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(p_status = 'completed', false)
    or (
      p_status = 'confirmed'
      and coalesce(p_booking_date, p_checkin_date) is not null
      and coalesce(p_booking_date, p_checkin_date)::timestamp
          + coalesce(p_start_time, time '00:00')
          <= (now() at time zone 'Asia/Baghdad')
    );
$$;

revoke all on function public.booking_income_is_earned(date,date,time,text) from public, anon;
grant execute on function public.booking_income_is_earned(date,date,time,text) to authenticated;

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

create or replace function public.get_host_dashboard_kpis(p_host_user_id uuid)
returns table (
  total_gross_revenue numeric, host_fees_paid numeric, actual_net_revenue numeric,
  pending_payouts numeric, average_rate numeric, occupancy_rate numeric
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
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

create or replace function public.get_admin_dashboard_kpis()
returns table (
  active_bookings numeric, cancelled_bookings numeric, occupancy_rate numeric,
  open_disputes numeric, pending_listings numeric, total_revenue numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.has_role(auth.uid(), 'admin') then
    raise exception 'Administrator access required';
  end if;
  return query select
    (select count(*)::numeric from public.bookings where status in ('pending_payment','confirmed')),
    (select count(*)::numeric from public.bookings where status in ('cancelled_guest','cancelled_host','expired')),
    case when (select count(*) from public.listings where status='approved')=0 then 0
      else least(100,
        (select count(*)::numeric from public.bookings b
         where public.booking_income_is_earned(b.booking_date,b.checkin_date,b.start_time,b.status::text)) /
        ((select count(*) from public.listings where status='approved')*30)::numeric*100) end,
    (select count(*)::numeric from public.disputes where status in ('open','in_progress','escalated','pending')),
    (select count(*)::numeric from public.listings where status='pending'),
    (select coalesce(sum(b.platform_revenue_total),0) from public.bookings b
     where public.booking_income_is_earned(b.booking_date,b.checkin_date,b.start_time,b.status::text));
end;
$$;

create or replace function public.admin_get_weekly_revenue(weeks_back integer default 4)
returns table(week_start date, week_label text, revenue numeric)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
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

create or replace function public.admin_get_weekly_revenue_report(p_start_date date,p_end_date date)
returns table(week_start date,week_end date,week_label text,bookings_count bigint,gross_revenue numeric,
  refunds_amount numeric,host_payouts_amount numeric,net_revenue numeric)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
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

create or replace function public.admin_get_detailed_revenue_report(p_start_date date,p_end_date date)
returns table(booking_id uuid,booking_display_id text,guest_user_id uuid,guest_first_name text,guest_last_name text,
  created_at timestamptz,listing_title text,checkin_date date,checkout_date date,total_price numeric,status text,
  refunds_amount numeric,host_payouts_amount numeric,net_revenue numeric)
language plpgsql stable security invoker set search_path=public,pg_temp as $$
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

revoke all on function public.get_host_dashboard_kpis(uuid) from public,anon;
revoke all on function public.get_host_earnings_report(uuid,date,date,text,uuid[],numeric,numeric,numeric,numeric,text,text) from public,anon;
revoke all on function public.get_admin_dashboard_kpis() from public,anon;
revoke all on function public.admin_get_weekly_revenue(integer) from public,anon;
revoke all on function public.admin_get_weekly_revenue_report(date,date) from public,anon;
revoke all on function public.admin_get_detailed_revenue_report(date,date) from public,anon;
grant execute on function public.get_host_dashboard_kpis(uuid) to authenticated;
grant execute on function public.get_host_earnings_report(uuid,date,date,text,uuid[],numeric,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function public.get_admin_dashboard_kpis() to authenticated;
grant execute on function public.admin_get_weekly_revenue(integer) to authenticated;
grant execute on function public.admin_get_weekly_revenue_report(date,date) to authenticated;
grant execute on function public.admin_get_detailed_revenue_report(date,date) to authenticated;
