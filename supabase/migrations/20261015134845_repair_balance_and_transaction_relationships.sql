-- These relationships are required by the app's nested PostgREST reads.
-- Existing rows were checked for orphaned references before applying.
ALTER TABLE public.guest_debts
  ADD CONSTRAINT guest_debts_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.disputes(id),
  ADD CONSTRAINT guest_debts_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_dispute_id_fkey FOREIGN KEY (dispute_id) REFERENCES public.disputes(id),
  ADD CONSTRAINT transactions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);

-- Client roles use RLS and approved RPCs; none should alter table structure
-- or truncate data. Service-role and database-owner access are unchanged.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
-- This legacy RPC records a payment without verifying a payment provider.
-- Disable client invocation until a real provider-backed flow exists.
REVOKE EXECUTE ON FUNCTION public.process_guest_debt_payment(uuid,numeric,text,text) FROM PUBLIC, anon, authenticated;
NOTIFY pgrst, 'reload schema';
