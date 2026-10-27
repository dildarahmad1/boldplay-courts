#!/usr/bin/env bash
# Use only against an empty, disposable PostgreSQL 17+ TEST database.
set -euo pipefail
if [[ "${YARIKA_TEST_DATABASE:-}" != "1" ]]; then
  echo 'Set YARIKA_TEST_DATABASE=1 and PGHOST/PGPORT/PGUSER/PGDATABASE for an empty disposable test database.' >&2
  exit 1
fi
cd "$(dirname "$0")/.."
for file in supabase/tests/platform.sql supabase/schema.sql supabase/auth.sql supabase/permissions.sql supabase/storage.sql supabase/reference-data.sql supabase/tests/restore.spec.sql; do
  psql -X -v ON_ERROR_STOP=1 -f "$file"
done
