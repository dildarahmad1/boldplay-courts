create table if not exists public.host_commission_rates (
  host_user_id uuid primary key references public.profiles(id) on delete cascade,
  commission_rate numeric(5,4) not null check (commission_rate between 0 and 1),
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.host_commission_rates enable row level security;
revoke all on table public.host_commission_rates from public, anon, authenticated;

create or replace function public.admin_get_host_commissions()
returns table (
  host_user_id uuid,
  host_name text,
  host_email text,
  listings_count bigint,
  bookings_count bigint,
  gross_booking_value numeric,
  commission_rate numeric,
  uses_custom_rate boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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

create or replace function public.admin_set_host_commission(
  p_host_user_id uuid,
  p_commission_rate numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

-- Financial values are snapshotted on every new booking. Existing bookings
-- keep the rate that was valid when they were created.
create or replace function public.apply_host_commission_to_booking()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

drop trigger if exists apply_host_commission_before_booking on public.bookings;
create trigger apply_host_commission_before_booking
before insert on public.bookings
for each row execute function public.apply_host_commission_to_booking();

revoke all on function public.admin_get_host_commissions() from public, anon;
revoke all on function public.admin_set_host_commission(uuid, numeric) from public, anon;
revoke all on function public.apply_host_commission_to_booking() from public, anon, authenticated;
grant execute on function public.admin_get_host_commissions() to authenticated;
grant execute on function public.admin_set_host_commission(uuid, numeric) to authenticated;
