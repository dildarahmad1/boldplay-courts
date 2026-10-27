-- Admin-created users are written by an Edge Function using the service role.
-- Explicit grants are required because this project revoked the default table grants.
grant select, insert, update on table public.profiles to service_role;
grant select, insert, update, delete on table public.user_roles to service_role;

-- Keep host publishing limited to the account owner with an actual host role.
drop policy if exists listings_host_insert on public.listings;
create policy listings_host_insert
on public.listings
for insert
to authenticated
with check (
  host_user_id = (select auth.uid())
  and (
    private.has_role((select auth.uid()), 'host')
    or private.has_role((select auth.uid()), 'admin')
  )
);

grant insert, select, update, delete on table public.listings to authenticated;
grant insert, select, update, delete on table public.listing_availability to authenticated;
