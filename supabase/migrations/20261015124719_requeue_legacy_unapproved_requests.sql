-- The old checkout automatically confirmed these upcoming court reservations.
-- They predate the host-approval release (2026-10-15 12:00 UTC), and no host
-- approval could be recorded by that checkout. Keep their slots reserved while
-- the owning host reviews them. Past bookings and subsequent host decisions
-- retain their current statuses.
UPDATE public.bookings
SET status = 'pending_host_confirmation'::public.booking_status,
    updated_at = now()
WHERE status = 'confirmed'::public.booking_status
  AND booking_date >= (now() AT TIME ZONE 'Asia/Baghdad')::date
  AND updated_at < '2026-10-15 12:00:00+00'::timestamptz;
