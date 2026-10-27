-- Core security, relationships and seed data for a fresh Yarika project.
create schema if not exists private;

alter table public.profiles alter column status set default 'active'::public.user_status;
alter table public.profiles alter column verified set default false;
alter table public.listings alter column status set default 'approved'::public.listing_status;
alter table public.listings alter column currency set default 'IQD';
alter table public.listings alter column min_hours set default 1;
alter table public.listings alter column max_hours set default 5;
alter table public.listings alter column slot_duration_minutes set default 60;
alter table public.bookings alter column status set default 'pending_payment'::public.booking_status;
alter table public.bookings alter column currency set default 'IQD';
alter table public.message_threads alter column last_message_at set default now();
alter table public.message_threads alter column thread_type set default 'user_to_user'::public.thread_type;
alter table public.reviews alter column status set default 'approved'::public.review_status;

alter table public.profiles add constraint profiles_auth_user_fk foreign key (id) references auth.users(id) on delete cascade;
alter table public.user_roles add constraint user_roles_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
alter table public.user_roles add constraint user_roles_unique unique (user_id, role);
alter table public.listings add constraint listings_host_fk foreign key (host_user_id) references auth.users(id) on delete cascade;
alter table public.listings add constraint listings_cancellation_fk foreign key (cancellation_policy_id) references public.cancellation_policies(id);
alter table public.bookings add constraint bookings_listing_fk foreign key (listing_id) references public.listings(id) on delete cascade;
alter table public.bookings add constraint bookings_guest_fk foreign key (guest_user_id) references auth.users(id) on delete cascade;
alter table public.listing_availability add constraint listing_availability_listing_fk foreign key (listing_id) references public.listings(id) on delete cascade;
alter table public.reviews add constraint reviews_listing_fk foreign key (listing_id) references public.listings(id) on delete cascade;
alter table public.reviews add constraint reviews_booking_fk foreign key (booking_id) references public.bookings(id) on delete cascade;
alter table public.reviews add constraint reviews_author_fk foreign key (author_user_id) references auth.users(id) on delete cascade;
alter table public.messages add constraint messages_thread_fk foreign key (thread_id) references public.message_threads(id) on delete cascade;
alter table public.countries add constraint countries_code_unique unique (code);
alter table public.cancellation_policies add constraint cancellation_policy_key_unique unique (policy_key);
alter table public.platform_settings add constraint platform_setting_key_unique unique (setting_key);

create or replace function private.has_role(target_user uuid, target_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.user_roles where user_id = target_user and role = target_role);
$$;
revoke all on function private.has_role(uuid, public.app_role) from public, anon, authenticated;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select _user_id = (select auth.uid()) and exists(
    select 1 from public.user_roles where user_id = _user_id and role = _role
  );
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.sync_verified_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set verified = true, updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_verified_profile() from public, anon, authenticated;

create trigger on_auth_email_verified
after update of email_confirmed_at on auth.users
for each row execute function private.sync_verified_profile();

create policy profiles_select_self on public.profiles for select to authenticated
using ((select auth.uid()) = id or private.has_role((select auth.uid()), 'admin'));
create policy profiles_update_self on public.profiles for update to authenticated
using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy roles_select_self on public.user_roles for select to authenticated
using ((select auth.uid()) = user_id or private.has_role((select auth.uid()), 'admin'));
create policy roles_admin_manage on public.user_roles for all to authenticated
using (private.has_role((select auth.uid()), 'admin'))
with check (private.has_role((select auth.uid()), 'admin'));

create policy listings_public_read on public.listings for select to anon, authenticated
using (status = 'approved' or host_user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'));
create policy listings_host_insert on public.listings for insert to authenticated
with check (host_user_id = (select auth.uid()) and private.has_role((select auth.uid()), 'host'));
create policy listings_host_update on public.listings for update to authenticated
using (host_user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'))
with check (host_user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'));
create policy listings_host_delete on public.listings for delete to authenticated
using (host_user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'));

create policy public_reference_read on public.countries for select to anon, authenticated using (is_active);
create policy public_regions_read on public.states_regions for select to anon, authenticated using (is_active);
create policy public_cities_read on public.cities for select to anon, authenticated using (is_active);
create policy public_cancellation_read on public.cancellation_policies for select to anon, authenticated using (is_active);
create policy public_settings_read on public.platform_settings for select to anon, authenticated using (is_active);
create policy public_faq_read on public.faqs for select to anon, authenticated using (status = 'published');

create policy availability_read on public.listing_availability for select to anon, authenticated using (true);
create policy availability_host_manage on public.listing_availability for all to authenticated
using (exists(select 1 from public.listings l where l.id = listing_id and (l.host_user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'))))
with check (exists(select 1 from public.listings l where l.id = listing_id and (l.host_user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'))));

create policy bookings_participant_read on public.bookings for select to authenticated
using (guest_user_id = (select auth.uid()) or exists(select 1 from public.listings l where l.id = listing_id and l.host_user_id = (select auth.uid())) or private.has_role((select auth.uid()), 'admin'));
create policy bookings_guest_insert on public.bookings for insert to authenticated
with check (guest_user_id = (select auth.uid()));
create policy bookings_participant_update on public.bookings for update to authenticated
using (guest_user_id = (select auth.uid()) or exists(select 1 from public.listings l where l.id = listing_id and l.host_user_id = (select auth.uid())) or private.has_role((select auth.uid()), 'admin'))
with check (guest_user_id = (select auth.uid()) or exists(select 1 from public.listings l where l.id = listing_id and l.host_user_id = (select auth.uid())) or private.has_role((select auth.uid()), 'admin'));

create policy reviews_public_read on public.reviews for select to anon, authenticated using (status = 'approved');
create policy reviews_author_insert on public.reviews for insert to authenticated with check (author_user_id = (select auth.uid()));
create policy reviews_author_update on public.reviews for update to authenticated using (author_user_id = (select auth.uid())) with check (author_user_id = (select auth.uid()));

create policy messages_participant_read on public.messages for select to authenticated
using (from_user_id = (select auth.uid()) or to_user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'));
create policy messages_sender_insert on public.messages for insert to authenticated with check (from_user_id = (select auth.uid()));
create policy messages_participant_update on public.messages for update to authenticated
using (to_user_id = (select auth.uid())) with check (to_user_id = (select auth.uid()));

create policy threads_authenticated_read on public.message_threads for select to authenticated using (true);
create policy threads_authenticated_insert on public.message_threads for insert to authenticated with check (true);
create policy threads_authenticated_update on public.message_threads for update to authenticated using (true) with check (true);

create policy private_rows_admin on public.listing_moderation_feedback for all to authenticated
using (private.has_role((select auth.uid()), 'admin')) with check (private.has_role((select auth.uid()), 'admin'));
create policy payouts_owner_read on public.payouts for select to authenticated using (host_user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'));
create policy transactions_guest_read on public.transactions for select to authenticated
using (exists(select 1 from public.bookings b where b.id = booking_id and b.guest_user_id = (select auth.uid())) or private.has_role((select auth.uid()), 'admin'));
create policy debts_guest_read on public.guest_debts for select to authenticated using (guest_user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'));
create policy disputes_participant on public.disputes for select to authenticated using (initiated_by_user_id = (select auth.uid()) or private.has_role((select auth.uid()), 'admin'));
create policy disputes_create on public.disputes for insert to authenticated with check (initiated_by_user_id = (select auth.uid()));

create or replace view public.public_profiles with (security_invoker = true) as
select id, first_name, last_name, avatar_url, verified from public.profiles;

create or replace view public.public_listings with (security_invoker = true) as
select * from public.listings where status = 'approved';

grant usage on schema public to anon, authenticated;
grant select on public.countries, public.states_regions, public.cities, public.cancellation_policies, public.platform_settings, public.faqs, public.listings, public.listing_availability, public.reviews, public.public_profiles, public.public_listings to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant insert, update, delete on public.listings, public.listing_availability to authenticated;
grant select, insert, update on public.bookings, public.reviews, public.message_threads, public.messages, public.disputes to authenticated;
grant select on public.payouts, public.transactions, public.guest_debts, public.listing_moderation_feedback to authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

insert into public.cancellation_policies(policy_key, name, description, refund_percentage, days_before_checkin, is_active) values
('flexible', 'Flexible', 'Full refund up to 24 hours before the booking.', 100, 1, true),
('moderate', 'Moderate', 'Full refund up to 3 days before the booking.', 100, 3, true),
('strict', 'Strict', 'Full refund up to 7 days before the booking.', 100, 7, true);

insert into public.platform_settings(setting_key, setting_value, setting_type, description, effective_from, is_active) values
('default_guest_service_fee_rate', '0', 'decimal', 'Cash booking service fee rate', now()::text, true),
('default_tax_rate', '0', 'decimal', 'Default tax rate', now()::text, true),
('default_host_commission_rate', '0.10', 'decimal', 'Platform commission from hosts', now()::text, true);

insert into public.countries(code, name, phone_code, is_active) values ('IQ', 'Iraq', '+964', true);
with country as (select id from public.countries where code = 'IQ'),
region as (
  insert into public.states_regions(country_id, code, name, type, is_active)
  select id, 'KRI', 'Kurdistan Region', 'region', true from country returning id, country_id
)
insert into public.cities(country_id, state_region_id, name, timezone, is_active, is_featured)
select country_id, id, city, 'Asia/Baghdad', true, true
from region cross join (values ('Erbil'), ('Sulaymaniyah'), ('Duhok'), ('Halabja'), ('Zakho'), ('Ranya'), ('Soran'), ('Koya'), ('Akre'), ('Shaqlawa'), ('Chamchamal'), ('Kalar')) as cities(city);

insert into storage.buckets(id, name, public) values
('listing-images', 'listing-images', true),
('avatars', 'avatars', true),
('message-attachments', 'message-attachments', false),
('dispute-attachments', 'dispute-attachments', false)
on conflict (id) do nothing;

create policy storage_public_images_read on storage.objects for select to anon, authenticated
using (bucket_id in ('listing-images', 'avatars'));
create policy storage_owner_upload on storage.objects for insert to authenticated
with check ((storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_owner_update on storage.objects for update to authenticated
using ((storage.foldername(name))[1] = (select auth.uid())::text)
with check ((storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_owner_delete on storage.objects for delete to authenticated
using ((storage.foldername(name))[1] = (select auth.uid())::text);
