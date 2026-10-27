-- All app booking mutations use authorized RPCs. A player must not be able to
-- bypass host approval by inserting or updating a confirmed booking directly.
REVOKE INSERT, UPDATE ON TABLE public.bookings FROM PUBLIC, anon, authenticated;

-- Recipients may update their read flag, while sender/content fields stay intact.
REVOKE UPDATE ON TABLE public.messages FROM PUBLIC, anon, authenticated;
GRANT UPDATE (read) ON TABLE public.messages TO authenticated;
