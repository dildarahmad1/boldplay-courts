create policy profiles_public_card_read on public.profiles for select to anon, authenticated
using (verified = true or id = (select auth.uid()));

grant select (id, first_name, last_name, avatar_url, verified) on public.profiles to anon, authenticated;
