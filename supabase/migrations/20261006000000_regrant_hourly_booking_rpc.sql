-- Ensure the booking RPC is available to signed-in players after deployments
-- that missed or reverted the original function grant. Anonymous callers must
-- not be able to create bookings.
REVOKE ALL ON FUNCTION public.create_hourly_booking(
  uuid,
  date,
  time without time zone,
  time without time zone,
  integer,
  numeric,
  jsonb,
  text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_hourly_booking(
  uuid,
  date,
  time without time zone,
  time without time zone,
  integer,
  numeric,
  jsonb,
  text
) TO authenticated;
