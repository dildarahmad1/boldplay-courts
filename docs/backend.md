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

The development-only `seed-demo-users` utility is also included in `supabase/functions/`. Three old, undeployed jobs (`mark-completed-bookings`, `cancel-expired-bookings`, and `process-pending-payouts`) are archived under `supabase/archive/` and excluded from deployment. The first two call missing legacy RPCs; the payout job simulates success without transferring money. They must not be deployed. See the archive README.

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
2. Apply `supabase/auth.sql` for application-owned account and email-verification triggers.
3. Apply `supabase/permissions.sql` for server access and application-role grant restrictions.
4. Apply `supabase/storage.sql` for bucket configuration and object policies.
5. Apply `supabase/reference-data.sql` for public reference records.
6. Configure Auth site URL, allowed redirect URLs, email sender and any required function secrets for the new environment.
7. Deploy only the three live functions listed above, preserving their authentication checks.
8. Set the frontend's public Supabase URL and publishable key for the new project.

For a new hosted project, use its privileged database connection in `NEW_DATABASE_URL`:

```sh
psql "$NEW_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/schema.sql \
  -f supabase/auth.sql \
  -f supabase/permissions.sql \
  -f supabase/storage.sql \
  -f supabase/reference-data.sql
```

Use the new project's ref for subsequent CLI linking and function deployment; the ref in this repository identifies the existing live project.

The old `baseline.generated.sql`, `backend-core.sql` and migration files are preserved for historical context. The current snapshot already incorporates those changes; do not run all three setup paths on the same database.

## Secret configuration

Supabase supplies its URL, anon key and service-role key inside hosted functions. Additional environment names used by the source include `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `LOVABLE_CRON_SECRET` / `LOVABLE_CRON_SECRET_PREVIOUS` for scheduled utilities. Inspect each function's `Deno.env.get` calls for its exact requirements.

Do not commit `.env.local`, service-role keys, database passwords, cron secrets or app account passwords. Credentials already shared privately with the owner remain outside this repository.

## Public reference data and private records

`reference-data.sql` contains geography and cancellation policies only. `src/data/` contains the public mapped venue dataset. User accounts, profile records, bookings, disputes, messages, payments, uploaded objects and authentication data stay in the live project. Transfer those only through an authorized private database backup or project access.

## Verification before deployment

The source uses one Vite `index.html` entry file. Pages and components are `.tsx`; backend functions are `.ts`; database definitions are SQL. Do not rename the Vite entry or backend SQL to `.tsx`.

Run the pinned backend checks:

```sh
npx --yes deno@2.9.6 task --config supabase/deno.json check
npx --yes deno@2.9.6 task --config supabase/deno.json test
```

GitHub Actions also restores all setup SQL into an empty PostgreSQL 17 database with minimal Supabase-managed Auth/Storage fixtures, and tests account creation, email verification, reference data, storage policies, server permissions and support authorization. This checks the application SQL handoff; the fixtures are not a full Supabase server.

Run `scripts/check-backend-restore.sh` only against an empty disposable test database, with `YARIKA_TEST_DATABASE=1` and the standard `PG*` connection environment variables. Never use this test fixture against the live project.

Email delivery still requires the new environment's verified sender and Resend secrets. Domain ownership, project invitations, private records and secrets are configured outside Git. The frontend on localhost uses the configured hosted Supabase project unless its `.env.local` is changed.

## First administrator in a new project

After the Auth triggers are installed, create and confirm the owner's account through the Supabase Auth dashboard. Copy that user's UUID and, as the database owner, insert its administrator role:

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('REPLACE_WITH_CONFIRMED_USER_UUID'::uuid, 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

The app reads the administrator role from `user_roles`. Keep the account's password private. Application users cannot promote themselves through signup metadata.
