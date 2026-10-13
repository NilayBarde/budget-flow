#!/usr/bin/env bash
# Applies supabase-schema.sql and every migration to a throwaway local Postgres with a
# Supabase stand-in, then runs the SQL checks in scripts/sql. Needs initdb/pg_ctl/psql on PATH.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
sql="$here/sql"
tmp="$(mktemp -d)"
port=54329

cleanup() {
  pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

initdb -D "$tmp/data" -U postgres --auth=trust >/dev/null
pg_ctl -D "$tmp/data" -o "-p $port -k $tmp -c listen_addresses=''" -l "$tmp/log" -w start >/dev/null

run() { PGOPTIONS='-c client_min_messages=warning' psql -h "$tmp" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q -X "$@"; }
step() { echo "• $*"; }
check() { run -o /dev/null "$@"; }
expect_error() {
  grep -q "$1" "$tmp/err" || { echo "expected an error containing: $1" >&2; cat "$tmp/err" >&2; exit 1; }
}

# Migration files numbered >= first and < last (numbers compared as integers).
migrations_between() {
  local first=$1 last=$2 f n
  for f in "$root"/migrations/*.sql; do
    n=$((10#$(basename "$f" | cut -c1-3)))
    if [ "$n" -ge "$first" ] && [ "$n" -lt "$last" ]; then echo "$f"; fi
  done | sort
}

new_database() {
  run -d postgres -c "CREATE DATABASE $1"
  run -d "$1" -f "$sql/supabase-stub.sql"
  run -d "$1" -f "$root/supabase-schema.sql"
  local f
  for f in $(migrations_between 24 30); do run -d "$1" -f "$f"; done
}

run -d postgres -f "$sql/supabase-roles.sql"

step "baseline + migrations 024-029, then legacy data"
new_database app
run -d app -f "$sql/legacy-seed.sql"

step "030 aborts when the owner has no Supabase Auth user"
new_database noowner
run -d noowner -c "DELETE FROM auth.users"
if run -d noowner -f "$root/migrations/030_multi_user.sql" 2>"$tmp/err"; then
  echo "030 should have failed without an owner" >&2; exit 1
fi
expect_error "Create the owner user in Supabase Auth"
[ "$(run -d noowner -tA -c "SELECT to_regclass('public.user_allowlist') IS NULL")" = "t" ]

step "030 aborts when two Supabase Auth users share the owner's email"
run -d noowner -c "INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'nilaybarde@gmail.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'NilayBarde@gmail.com')"
if run -d noowner -f "$root/migrations/030_multi_user.sql" 2>"$tmp/err"; then
  echo "030 should have failed with two owner users" >&2; exit 1
fi
expect_error "More than one Supabase Auth user"

step "030 expand migration"
run -d app -f "$root/migrations/030_multi_user.sql"

step "code on main keeps working after 030"
check -d app -f "$sql/legacy-writes-check.sql"

step "isolation after 030"
check -d app -f "$sql/isolation-check.sql"

step "030 refuses to run twice"
if run -d app -f "$root/migrations/030_multi_user.sql" 2>"$tmp/err"; then
  echo "030 should refuse a second run" >&2; exit 1
fi
expect_error "already been applied"

step "031 contract migration"
check -d app -f "$root/migrations/031_multi_user_cleanup.sql"

step "isolation and per-user uniqueness after 031"
check -d app -f "$sql/isolation-check.sql"
check -d app -f "$sql/post-cleanup-check.sql"

step "later migrations"
for f in $(migrations_between 32 1000); do run -d app -f "$f"; done

step "ACCOUNT_COLUMN_LIST matches what signed-in users may read"
granted="$(run -d app -tA -c "
  SELECT string_agg(column_name, ',' ORDER BY column_name)
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND table_name = 'accounts'
    AND grantee = 'authenticated' AND privilege_type = 'SELECT'")"
listed="$(cd "$root/server" && npx tsx -e "
  import('./src/db/columns.ts').then(m => console.log([...m.ACCOUNT_COLUMN_LIST].sort().join(',')))")"
if [ "$granted" != "$listed" ]; then
  echo "accounts grant:      $granted" >&2
  echo "ACCOUNT_COLUMN_LIST: $listed" >&2
  exit 1
fi

echo "All migration checks passed."
