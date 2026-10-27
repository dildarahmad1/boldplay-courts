# Yarika

Yarika is a sports-court booking application built with **Vite, React and TypeScript**, backed by **Supabase Postgres, Auth, Storage and Edge Functions**.

Live site: https://dildarahmad1.github.io/boldplay-courts/

## Repository layout

| Path | Contents |
| --- | --- |
| `src/` | Editable React/TypeScript pages, components, translations and Supabase client |
| `src/data/` | Public mapped venue directory and reference assets |
| `supabase/schema.sql` | Current application database schema, functions, grants and row-level policies, exported without user records |
| `supabase/storage.sql` | Storage bucket configuration and object access policies |
| `supabase/reference-data.sql` | Public geography and cancellation-policy reference rows |
| `supabase/migrations/` | Historical database changes and recent fixes |
| `supabase/functions/` | Backend TypeScript functions and shared utilities |
| `supabase/config.toml` | Supabase project configuration |
| `.github/workflows/deploy-pages.yml` | TypeScript checks, Vite build and GitHub Pages deployment |
| `docs/backend.md` | Backend setup, deployed functions and access handoff |

The default `main` branch contains the source. `gh-pages` retains the previous compiled deployment for recovery. GitHub Actions builds the source into `dist/` and publishes that output; generated HTML and JavaScript are expected in the deployed website.

## Run locally

Use Node.js 22 or later.

```sh
git clone https://github.com/dildarahmad1/boldplay-courts.git
cd boldplay-courts
npm ci
cp .env.example .env.local
```

Set the Supabase URL and **publishable** key in `.env.local`, then run:

```sh
npm run dev
```

The Vite development server uses port 8080. Obtain the public configuration from the Supabase project settings or the repository's Actions variables. Service-role keys and database passwords belong only in server-side secret storage.

## Check and build

```sh
npx tsc --noEmit -p tsconfig.app.json
npm run check:localization
npm run check:search
npm run build:pages
```

## Deploy

Push to `main` or run **Actions → Build and deploy Yarika → Run workflow**. The workflow reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from repository variables, checks the source, and deploys the compiled website to GitHub Pages.

Backend schema migrations and Edge Function deployments are separate operations; see [the backend guide](docs/backend.md). A frontend deployment does not automatically modify the production database.

## Data and access

This public repository contains source code, database structure and public reference data. Live accounts, bookings, support messages, financial records, uploaded user images, passwords and privileged keys remain in Supabase. A Yarika application admin login does not grant GitHub or Supabase infrastructure access; the project owner must separately invite backend developers to those services.
