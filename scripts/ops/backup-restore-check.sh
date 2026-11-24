#!/usr/bin/env bash
# Logical backup + restore drill.
#   scripts/ops/backup-restore-check.sh [DB_URL]
# 1. Dumps the app schemas (public, private, auth) with pg_dump (custom format).
# 2. Restores the dump into a fresh database on the same server.
# 3. Compares row counts of every table, and checks a sample bill's totals.
# Production backups are Supabase PITR / daily backups; this drill proves a
# logical dump can rebuild the data (e.g. to move projects or keep an
# off-site copy). See docs/OPERATIONS.md.
set -euo pipefail
DB_URL="${1:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
CHECK_DB="restore_check_$(date +%s)"
CHECK_URL="${DB_URL%/*}/$CHECK_DB"
DUMP="${TMPDIR:-/tmp}/edgex-backup-$(date +%Y%m%d-%H%M%S).dump"
# pg_dump / pg_restore must match the server's major version. Locally the
# tools inside the Supabase DB container are used:
#   PG_TOOLS="docker exec -i supabase_db_edgex-erp" DUMP_URL=postgresql://postgres:postgres@localhost:5432/postgres
PG_TOOLS="${PG_TOOLS:-}"
DUMP_URL="${DUMP_URL:-$DB_URL}"
RESTORE_URL="${DUMP_URL%/*}/$CHECK_DB"

echo "→ Dumping to $DUMP"
time $PG_TOOLS pg_dump "$DUMP_URL" -Fc --no-owner --no-privileges -n public -n private -n auth > "$DUMP"
ls -lh "$DUMP" | awk '{print "  size:", $5}'

echo "→ Restoring into $CHECK_DB"
psql "$DB_URL" -qc "create database $CHECK_DB"
trap 'psql "$DB_URL" -qc "drop database if exists $CHECK_DB with (force)" >/dev/null' EXIT
# Extensions the schemas depend on live in their own schemas on Supabase.
psql "$CHECK_URL" -qc "create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions; create extension if not exists \"uuid-ossp\" with schema extensions;" >/dev/null
time $PG_TOOLS pg_restore --no-owner --no-privileges -d "$RESTORE_URL" < "$DUMP" 2> "${DUMP}.log" || true
echo "  restore warnings: $(grep -c 'error' "${DUMP}.log" || true) (see ${DUMP}.log)"

echo "→ Comparing row counts"
COUNTS="select string_agg(format('%s=%s', table_schema || '.' || table_name,
           (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', table_schema, table_name), false, true, '')))[1]::text), ',' order by table_schema, table_name)
         from information_schema.tables where table_schema in ('public', 'private') and table_type = 'BASE TABLE'"
A=$(psql "$DB_URL" -qtAc "$COUNTS")
B=$(psql "$CHECK_URL" -qtAc "$COUNTS")
if [ "$A" = "$B" ]; then
  echo "  ✓ all $(echo "$A" | tr ',' '\n' | wc -l) tables match"
else
  echo "  ✗ row counts differ"; diff <(echo "$A" | tr ',' '\n') <(echo "$B" | tr ',' '\n') || true; exit 1
fi
SUM="select coalesce(sum(paid_total_minor), 0) || '/' || count(*) from public.bills"
echo "  bills (total paisa/count): $(psql "$DB_URL" -qtAc "$SUM") → $(psql "$CHECK_URL" -qtAc "$SUM")"
[ "$(psql "$DB_URL" -qtAc "$SUM")" = "$(psql "$CHECK_URL" -qtAc "$SUM")" ] && echo "  ✓ money totals match"
