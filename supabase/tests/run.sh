#!/usr/bin/env bash
# Runs the database test suite (RLS, RPCs, workflow, leave math, storage policies) with psql.
#
#   DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres supabase/tests/run.sh [file…]
#
# Every test file runs in ONE transaction that is rolled back at the end, so no data is left behind.
# Output: one PASS/FAIL line per check and a summary. Exit code 0 only when every check passed.
set -uo pipefail

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

if [ "$#" -gt 0 ]; then
  files=("$@")
else
  mapfile -t files < <(find . -maxdepth 1 -name '[0-9]*.sql' -printf '%f\n' | LC_ALL=C sort)
fi

total_pass=0
total_fail=0
failed_files=()

for f in "${files[@]}"; do
  f="$(basename "$f")"
  echo "── $f"
  out="$(PGOPTIONS='-c client_min_messages=notice' psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$f" 2>&1)"
  rc=$?
  # NOTICE lines look like: psql:01_x.sql:12: NOTICE:  PASS something
  checks="$(printf '%s\n' "$out" | sed -n -E 's/^.*NOTICE:  (PASS|FAIL) (.*)$/\1 \2/p')"
  if [ -n "$checks" ]; then
    printf '%s\n' "$checks" | sed -E 's/^/   /'
  fi
  p="$(printf '%s\n' "$checks" | grep -c '^PASS ' || true)"
  n="$(printf '%s\n' "$checks" | grep -c '^FAIL ' || true)"
  total_pass=$((total_pass + p))
  total_fail=$((total_fail + n))
  if [ "$rc" -ne 0 ] || [ "$n" -ne 0 ]; then
    failed_files+=("$f")
    if [ "$n" -eq 0 ]; then
      echo "   ERROR (file aborted):"
      printf '%s\n' "$out" | grep -E 'ERROR|DETAIL|CONTEXT|LINE' | head -20 | sed -E 's/^/     /'
    fi
  fi
done

echo
echo "Database tests: ${total_pass} passed, ${total_fail} failed, ${#files[@]} file(s)"
if [ "${#failed_files[@]}" -gt 0 ]; then
  echo "Failing files: ${failed_files[*]}"
  exit 1
fi
