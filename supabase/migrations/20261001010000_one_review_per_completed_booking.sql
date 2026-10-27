-- A guest may leave one verified review for each completed booking.
begin;

create unique index if not exists reviews_one_per_player_booking_uidx
  on public.reviews (booking_id, author_user_id);

create index if not exists reviews_author_user_id_idx
  on public.reviews (author_user_id);

drop policy if exists reviews_author_insert on public.reviews;
create policy reviews_author_insert
  on public.reviews
  for insert
  to authenticated
  with check (
    author_user_id = (select auth.uid())
    and exists (
      select 1
      from public.bookings b
      where b.id = public.reviews.booking_id
        and b.listing_id = public.reviews.listing_id
        and b.guest_user_id = (select auth.uid())
        and b.status::text = 'completed'
    )
  );

drop policy if exists reviews_author_read on public.reviews;
create policy reviews_author_read
  on public.reviews
  for select
  to authenticated
  using (author_user_id = (select auth.uid()));

drop policy if exists reviews_author_update on public.reviews;
create policy reviews_author_update
  on public.reviews
  for update
  to authenticated
  using (
    author_user_id = (select auth.uid())
    and created_at >= now() - interval '48 hours'
  )
  with check (
    author_user_id = (select auth.uid())
    and created_at >= now() - interval '48 hours'
  );

create or replace function public.guard_review_changes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin')
    or coalesce(private.has_role(auth.uid(), 'admin'), false) then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.booking_id is distinct from old.booking_id
    or new.listing_id is distinct from old.listing_id
    or new.author_user_id is distinct from old.author_user_id
    or new.created_at is distinct from old.created_at
    or new.status is distinct from old.status then
    raise exception 'Review ownership, booking, and moderation status cannot be changed';
  end if;

  if old.created_at < now() - interval '48 hours' then
    raise exception 'Reviews can only be edited within 48 hours';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_review_changes on public.reviews;
create trigger guard_review_changes
  before update on public.reviews
  for each row execute function public.guard_review_changes();

commit;
