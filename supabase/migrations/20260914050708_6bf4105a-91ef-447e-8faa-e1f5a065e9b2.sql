CREATE OR REPLACE FUNCTION public.notify_court_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing uuid;
  v_date date;
BEGIN
  v_listing := COALESCE(NEW.listing_id, OLD.listing_id);

  IF TG_TABLE_NAME = 'bookings' THEN
    v_date := COALESCE(NEW.booking_date, OLD.booking_date);
  ELSE
    v_date := COALESCE(NEW.start_date, OLD.start_date);
  END IF;

  PERFORM realtime.send(
    jsonb_build_object('listing_id', v_listing, 'date', v_date, 'table', TG_TABLE_NAME),
    'availability_changed',
    'court:' || v_listing::text,
    false
  );

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_court_availability_bookings ON public.bookings;
CREATE TRIGGER notify_court_availability_bookings
AFTER INSERT OR UPDATE OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_court_availability();

DROP TRIGGER IF EXISTS notify_court_availability_blocks ON public.listing_availability;
CREATE TRIGGER notify_court_availability_blocks
AFTER INSERT OR UPDATE OR DELETE ON public.listing_availability
FOR EACH ROW EXECUTE FUNCTION public.notify_court_availability();

REVOKE EXECUTE ON FUNCTION public.notify_court_availability() FROM anon, authenticated;