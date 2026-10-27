-- NULL historically meant unread in the inbox RPCs. Keep those messages unread
-- while making future inserts and recipient updates use the same boolean value.
ALTER TABLE public.messages ALTER COLUMN read SET DEFAULT false;
UPDATE public.messages SET read = false WHERE read IS NULL;

-- Refresh the API schema after the booking-status migrations in this release.
NOTIFY pgrst, 'reload schema';

-- Guests and hosts receive booking decisions immediately, with polling as a fallback.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='bookings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
  END IF;
END $$;
