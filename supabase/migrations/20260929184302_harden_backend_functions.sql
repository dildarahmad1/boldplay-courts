alter function public.get_listing_slots(uuid, date) security invoker;
alter function public.get_listing_slot_grid(uuid, date, integer) security invoker;

revoke all on function public.admin_search_bookings(text, public.booking_status, numeric, numeric, date, date, date, date, text, text) from public, anon;
revoke all on function public.host_search_bookings(uuid, text, public.booking_status, numeric, numeric, date, date, date, date, text, text) from public, anon;
revoke all on function public.create_hourly_booking(uuid, date, time without time zone, time without time zone, integer, numeric, jsonb, text) from public, anon;
grant execute on function public.admin_search_bookings(text, public.booking_status, numeric, numeric, date, date, date, date, text, text) to authenticated;
grant execute on function public.host_search_bookings(uuid, text, public.booking_status, numeric, numeric, date, date, date, date, text, text) to authenticated;
grant execute on function public.create_hourly_booking(uuid, date, time without time zone, time without time zone, integer, numeric, jsonb, text) to authenticated;

grant execute on function public.get_listing_slots(uuid, date) to anon, authenticated;
grant execute on function public.get_listing_slot_grid(uuid, date, integer) to anon, authenticated;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
