DROP TRIGGER IF EXISTS notify_court_availability_bookings ON public.bookings;
DROP TRIGGER IF EXISTS notify_court_availability_blocks ON public.listing_availability;
DROP FUNCTION IF EXISTS public.notify_court_availability();