#!/usr/bin/env bash
# Verificación local del esquema: crea una base vacía y aplica todas las
# migraciones en orden. No requiere credenciales de Supabase.
#
#   ./supabase/verificar.sh                 # migraciones
#   ./supabase/verificar.sh --con-semillas  # migraciones + semillas
#   ./supabase/verificar.sh --con-pruebas   # migraciones + semillas + suite RLS
#
# Variables: PGHOST, PGPORT, PGUSER, PGDATABASE (por defecto: socket local, ncr)
set -euo pipefail
cd "$(dirname "$0")/.."

PGHOST="${PGHOST:-/var/tmp/ncr/sock}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-ncr}"
export PGHOST PGPORT PGUSER
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"

psql -d postgres -Atqc "DROP DATABASE IF EXISTS ${PGDATABASE};" >/dev/null
psql -d postgres -Atqc "CREATE DATABASE ${PGDATABASE};" >/dev/null
echo "base ${PGDATABASE} recreada vacía"

for f in supabase/migrations/*.sql; do
  printf '  %-62s' "$(basename "$f")"
  psql -d "$PGDATABASE" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
  echo "ok"
done

if [[ "${1:-}" == "--con-semillas" || "${1:-}" == "--con-pruebas" ]]; then
  printf '  %-62s' "seed.sql"
  psql -d "$PGDATABASE" -v ON_ERROR_STOP=1 -q -f supabase/seed/seed.sql >/dev/null
  echo "ok"
fi

if [[ "${1:-}" == "--con-pruebas" ]]; then
  echo "--- suite de aislamiento y políticas ---"
  for f in supabase/policies/tests/*.sql; do
    printf '  %-62s' "$(basename "$f")"
    psql -d "$PGDATABASE" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
    echo "ok"
  done
  for f in supabase/policies/tests/*.sh; do
    echo "  $(basename "$f")"
    PGDATABASE="$PGDATABASE" "$f"
  done
fi

echo "verificación completa"
