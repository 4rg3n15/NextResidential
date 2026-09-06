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

# --- Fidelidad del entorno local frente a Supabase ---------------------------
# Se imprime SIEMPRE. Una suite verde que no dice contra qué corrió da falsa
# confianza: el hallazgo del rol `postgres` (migración 0017) sobrevivió a una
# suite verde precisamente porque nadie declaraba esta diferencia.
echo "--- fidelidad del entorno frente a Supabase ---"
su_local=$(psql -d "$PGDATABASE" -Atqc "select rolsuper from pg_roles where rolname = current_user;")
dueno=$(psql -d "$PGDATABASE" -Atqc "select pg_get_userbyid(relowner) from pg_class where relname='eventos';")
echo "  rol de conexión      : ${PGUSER} (superusuario: ${su_local})"
echo "  dueño de 'eventos'   : ${dueno}"
if [[ "$su_local" == "t" ]]; then
  cat <<'AVISO'
  ATENCIÓN · el rol de conexión local es SUPERUSUARIO; en Supabase `postgres`
  NO lo es. Un superusuario ignora los permisos de tabla, así que aquí NO se
  puede demostrar por ejecución que un REVOKE surta efecto: eso se verifica
  leyendo el ACL (prueba 40, sección 1). Lo que sí es demostración real es el
  TRIGGER, que dispara también contra un superusuario (prueba 40, sección 2).
  Garantías que este entorno NO puede demostrar ejecutando:
    · que un REVOKE detenga al dueño de la tabla
    · que `session_replication_role` esté vedado al rol de la aplicación
  Ambas se comprueban contra el proyecto real antes de cerrar cada etapa.
AVISO
fi

echo "verificación completa"
