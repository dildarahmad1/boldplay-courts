create or replace function public.host_search_listings(
  host_id uuid,
  search_query text default null,
  status_filter public.listing_status default null,
  min_price numeric default null,
  max_price numeric default null,
  sort_by text default 'created_at',
  sort_order text default 'desc'
)
returns table (
  id uuid, title text, type public.property_type, city text, state text,
  country text, base_price numeric, status public.listing_status,
  cover_image text, rating_avg numeric, rating_count numeric,
  created_at timestamptz, updated_at timestamptz
)
language sql stable security invoker set search_path = public
as $$
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

create or replace function public.get_host_dashboard_kpis(p_host_user_id uuid)
returns table (
  total_gross_revenue numeric, host_fees_paid numeric, actual_net_revenue numeric,
  pending_payouts numeric, average_rate numeric, occupancy_rate numeric
)
language sql stable security invoker set search_path = public
as $$
  select
    coalesce(sum(b.host_payout_gross), 0),
    coalesce(sum(b.host_commission_amount), 0),
    coalesce(sum(b.host_payout_net), 0),
    coalesce((select sum(p.amount) from public.payouts p where p.host_user_id = p_host_user_id and p.status = 'pending'), 0),
    coalesce(avg(b.price_per_hour), 0),
    case when count(distinct l.id) = 0 then 0 else least(100, count(b.id)::numeric / (count(distinct l.id) * 30)::numeric * 100) end
  from public.listings l
  left join public.bookings b on b.listing_id = l.id and b.status in ('confirmed', 'completed')
  where l.host_user_id = p_host_user_id and p_host_user_id = (select auth.uid());
$$;

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
    (select count(*)::numeric from public.bookings where status in ('pending_payment','confirmed')),
    (select count(*)::numeric from public.bookings where status in ('cancelled_guest','cancelled_host','expired')),
    case when (select count(*) from public.listings where status='approved') = 0 then 0 else
      least(100, (select count(*)::numeric from public.bookings where status in ('confirmed','completed')) /
      ((select count(*) from public.listings where status='approved') * 30)::numeric * 100) end,
    (select count(*)::numeric from public.disputes where status in ('open','in_progress','escalated','pending')),
    (select count(*)::numeric from public.listings where status='pending'),
    (select coalesce(sum(platform_revenue_total),0) from public.bookings where status in ('confirmed','completed'));
end;
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
  if v_booking.guest_user_id <> (select auth.uid()) then raise exception 'Access denied'; end if;
  if v_booking.status <> 'pending_payment' then raise exception 'Booking is not awaiting payment'; end if;
  if p_provider <> 'cash' then raise exception 'Only cash payment is available'; end if;
  if p_amount <> v_booking.total_price then raise exception 'Payment amount does not match booking total'; end if;
  insert into public.transactions(booking_id, amount, currency, provider, status, type)
  values (p_booking_id, p_amount, p_currency, 'cash', 'confirmed', 'booking_payment') returning id into v_transaction;
  update public.bookings set status='confirmed', updated_at=now() where id=p_booking_id;
  return jsonb_build_object('success', true, 'booking_id', p_booking_id, 'transaction_id', v_transaction, 'payment_method', 'cash');
end;
$$;

create or replace function public.get_eligible_refund_amount(p_booking_id uuid)
returns numeric
language sql stable security invoker set search_path = public
as $$
  select case when b.guest_user_id = (select auth.uid()) and b.status = 'confirmed'
    then coalesce(b.total_price,0) else 0 end
  from public.bookings b where b.id = p_booking_id;
$$;

create or replace function public.cancel_booking_with_refund(p_booking_id uuid, p_cancellation_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_booking public.bookings; v_refund numeric := 0;
begin
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.guest_user_id <> (select auth.uid()) then raise exception 'Access denied'; end if;
  if v_booking.status not in ('pending_payment','confirmed') then raise exception 'Booking cannot be cancelled'; end if;
  if v_booking.status = 'confirmed' then v_refund := v_booking.total_price; end if;
  update public.bookings set status='cancelled_guest', notes=concat_ws(E'\n', notes, p_cancellation_reason), updated_at=now() where id=p_booking_id;
  return jsonb_build_object('success', true, 'booking_id', p_booking_id, 'refund_amount', v_refund, 'refund_method', 'cash');
end;
$$;

create or replace function public.get_or_create_thread(
  p_participant_1_id uuid, p_participant_2_id uuid,
  p_listing_id uuid default null, p_booking_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
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

revoke all on function public.get_admin_dashboard_kpis() from public, anon;
revoke all on function public.confirm_booking_payment(uuid,numeric,text,text) from public, anon;
revoke all on function public.cancel_booking_with_refund(uuid,text) from public, anon;
revoke all on function public.get_or_create_thread(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.host_search_listings(uuid,text,public.listing_status,numeric,numeric,text,text) to authenticated;
grant execute on function public.get_host_dashboard_kpis(uuid) to authenticated;
grant execute on function public.get_admin_dashboard_kpis() to authenticated;
grant execute on function public.confirm_booking_payment(uuid,numeric,text,text) to authenticated;
grant execute on function public.get_eligible_refund_amount(uuid) to authenticated;
grant execute on function public.cancel_booking_with_refund(uuid,text) to authenticated;
grant execute on function public.get_or_create_thread(uuid,uuid,uuid,uuid) to authenticated;
