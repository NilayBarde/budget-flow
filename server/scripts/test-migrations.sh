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

step "030 expand migration"
run -d app -f "$root/migrations/030_multi_user.sql"

step "code on main keeps working after 030"
check -d app -f "$sql/legacy-writes-check.sql"

step "isolation after 030"
check -d app -f "$sql/isolation-check.sql"

echo "All migration checks passed."
