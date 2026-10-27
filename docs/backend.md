# Backend handoff

## Architecture and live project

Yarika uses Supabase rather than a separate Express/Node server. The frontend calls Postgres RPCs, the Data API, Auth, Storage and TypeScript Edge Functions.

- Project ref: `xgqucualmmewzivximpx`
- API URL: `https://xgqucualmmewzivximpx.supabase.co`
- Dashboard: https://supabase.com/dashboard/project/xgqucualmmewzivximpx
- Schema snapshot date: 2026-10-27

The live project contains the application tables, database functions, grants and row-level access policies. `supabase/schema.sql` is a schema-only snapshot; it contains no account or booking rows.

## Source versus deployed Edge Functions

Verified deployed on 2026-10-27:

| Function | Purpose | Gateway JWT verification |
| --- | --- | --- |
| `search-listings` | Public court search; uses the caller's context and database access policies | Off |
| `admin-create-host` | Creates host accounts after checking an authenticated administrator | Off; authorization is checked inside the function |
| `send-booking-confirmation` | Booking email delivery | On |

Additional functions are included as source: `mark-completed-bookings`, `cancel-expired-bookings`, `process-pending-payouts`, and `seed-demo-users`. Their presence in this repository does not mean they are deployed or scheduled. Inspect their code and configure the required secrets before enabling them.

The demo-user utility is disabled unless `ALLOW_DEMO_SEED=true`, a valid cron authorization secret is provided, and all three `DEMO_*_PASSWORD` secrets are configured. Use it only in a development project.

## Working on the existing project

The owner must grant the developer access to the Supabase project. App admin credentials are not Supabase credentials.

Install a current Supabase CLI, authenticate, and link the checkout:

```sh
supabase login
supabase link --project-ref xgqucualmmewzivximpx
```

Do not replay the schema snapshot or historical migrations into the existing live project. They describe objects that already exist. Inspect migration history first and apply only new, reviewed changes. In particular, the two migrations dated `20261027` have already been applied to the live project.

Deploy a reviewed function explicitly, for example:

```sh
supabase functions deploy search-listings --project-ref xgqucualmmewzivximpx --no-verify-jwt
```

The public search function relies on Postgres row-level policies. The admin-create-host function performs its own user and administrator checks before using server privileges.

## Reconstructing a separate empty Supabase project

Use a new development project, not the live production database.

1. Restore `supabase/schema.sql` through a privileged connection to that empty Supabase database.
2. Apply `supabase/storage.sql` for bucket configuration and object policies.
3. Apply `supabase/reference-data.sql` for public reference records.
4. Configure Auth site URL, allowed redirect URLs, email sender and any required function secrets for the new environment.
5. Deploy only the functions that are needed, preserving their authentication checks.
6. Set the frontend's public Supabase URL and publishable key for the new project.

The old `baseline.generated.sql`, `backend-core.sql` and migration files are preserved for historical context. The current snapshot already incorporates those changes; do not run all three setup paths on the same database.

## Secret configuration

Supabase supplies its URL, anon key and service-role key inside hosted functions. Additional environment names used by the source include `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `LOVABLE_CRON_SECRET` / `LOVABLE_CRON_SECRET_PREVIOUS` for scheduled utilities. Inspect each function's `Deno.env.get` calls for its exact requirements.

Do not commit `.env.local`, service-role keys, database passwords, cron secrets or app account passwords. Credentials already shared privately with the owner remain outside this repository.

## Public reference data and private records

`reference-data.sql` contains geography and cancellation policies only. `src/data/` contains the public mapped venue dataset. User accounts, profile records, bookings, disputes, messages, payments, uploaded objects and authentication data stay in the live project. Transfer those only through an authorized private database backup or project access.
