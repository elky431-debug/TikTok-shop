#!/usr/bin/env bash
# Applique les migrations sur un Postgres jetable puis lance les vérifications RLS.
# Nécessite les binaires PostgreSQL (initdb, pg_ctl, psql). Aucune donnée réelle n'est touchée.
set -euo pipefail

PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb 2>/dev/null | tail -1)")}"
if [ ! -x "$PG_BIN/initdb" ]; then
  echo "PostgreSQL introuvable : installe-le ou définis PG_BIN. Vérification ignorée."
  exit 0
fi

DIR="$(mktemp -d)"
PORT="${PG_PORT:-54329}"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DIR" 2>/dev/null || { useradd -r postgres 2>/dev/null || true; chown -R postgres "$DIR"; }
  RUN_AS="runuser -u postgres --"
fi

cleanup() { $RUN_AS "$PG_BIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

$RUN_AS "$PG_BIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
$RUN_AS "$PG_BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k /tmp -c listen_addresses=''" -w start >/dev/null

export PGOPTIONS="-c client_min_messages=warning"
PSQL=("$PG_BIN/psql" -h /tmp -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f supabase/tests/auth_stub.sql
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f supabase/tests/rls_test.sql
echo "Migrations OK."
