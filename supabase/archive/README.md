# Archived, non-deployable utilities

These files were inherited from the earlier project and were never deployed in the current Supabase project. They are preserved for reference and are intentionally outside `supabase/functions/` so `supabase functions deploy` does not deploy them.

- `mark-completed-bookings` calls a database RPC that is absent from the current schema.
- `cancel-expired-bookings` calls a database RPC that is absent from the current schema.
- `process-pending-payouts` simulates payment success without moving money. Do not use it to settle real balances.

If these capabilities are needed, implement them against the current booking lifecycle and a real, verified settlement process. They are not part of the supported deployment.
