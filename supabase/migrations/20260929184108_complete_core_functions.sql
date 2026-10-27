create or replace function public.check_guest_outstanding_debts(target_guest uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists(
    select 1 from public.guest_debts
    where guest_user_id = target_guest and status in ('outstanding', 'pending')
  );
$$;

grant execute on function public.check_guest_outstanding_debts(uuid) to authenticated;
