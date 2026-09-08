#!/usr/bin/env bash
# Verificación local del esquema: crea una base vacía y aplica todas las
# migraciones en orden. No requiere credenciales de Supabase.
#
#   ./supabase/verificar.sh                 # migraciones
#   ./supabase/verificar.sh --con-semillas  # migraciones + semillas
#   ./supabase/verificar.sh --con-pruebas   # migraciones + semillas + suite RLS
#   ./supabase/verificar.sh --con-pruebas --modo-supabase
#                                           # ... aplicado por un rol dueño NO
#                                           #     superusuario, como en Supabase
#
# Variables: PGHOST, PGPORT, PGUSER, PGDATABASE (por defecto: socket local, ncr)
set -euo pipefail
cd "$(dirname "$0")/.."

# --- modo Supabase -----------------------------------------------------------
# Por defecto el verificador aplica las migraciones como el superusuario local.
# Eso NO reproduce Supabase gestionado, donde el rol de la cadena de conexión
# (`postgres`) es DUEÑO de las tablas pero NO superusuario. La diferencia no es
# cosmética: un superusuario ignora los permisos de tabla Y la RLS, así que
# oculta clases enteras de fallo. Con `--modo-supabase` el esquema se aplica con
# un rol que replica esas capacidades: NOSUPERUSER + CREATEROLE + dueño.
#
# Los tres fallos del 2026-09-06 —la migración 0017 irreproducible, el seed
# bloqueado por FORCE RLS y la recursión infinita de `es_mi_vivienda`— eran
# invisibles sin este modo y saltan a la primera con él.
MODO_SUPABASE=0
for arg in "$@"; do [[ "$arg" == "--modo-supabase" ]] && MODO_SUPABASE=1; done

PGHOST="${PGHOST:-/var/tmp/ncr/sock}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-ncr}"
export PGHOST PGPORT PGUSER
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"

psql -d postgres -Atqc "DROP DATABASE IF EXISTS ${PGDATABASE};" >/dev/null

# Estado de PLATAFORMA, no de esquema: en Supabase `service_role` viene con
# BYPASSRLS de fábrica. Las migraciones no pueden concederlo (exige superusuario)
# y por eso no lo hacen; el verificador lo replica para que la suite pruebe el
# camino real de la llave secreta y no una versión desdentada de él.
psql -d postgres -Atqc "DO \$\$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      CREATE ROLE service_role NOLOGIN;
    END IF;
    ALTER ROLE service_role BYPASSRLS;
  END \$\$;" >/dev/null 2>&1 || true

APLICADOR="$PGUSER"
if [[ "$MODO_SUPABASE" == "1" ]]; then
  APLICADOR=sb_postgres_sim
  psql -d postgres -Atqc "DO \$\$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${APLICADOR}') THEN
        CREATE ROLE ${APLICADOR} LOGIN NOSUPERUSER CREATEROLE NOCREATEDB NOBYPASSRLS INHERIT;
      END IF; END \$\$;" >/dev/null
  psql -d postgres -Atqc "CREATE DATABASE ${PGDATABASE} OWNER ${APLICADOR};" >/dev/null
  # En Supabase el rol `postgres` SÍ puede instalar extensiones (supautils). Se
  # preinstalan para no confundir esa capacidad con una restricción real.
  psql -d "$PGDATABASE" -Atqc "CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext;" >/dev/null
  echo "base ${PGDATABASE} recreada · MODO SUPABASE · aplica ${APLICADOR} (no superusuario, dueño)"
else
  psql -d postgres -Atqc "CREATE DATABASE ${PGDATABASE};" >/dev/null
  echo "base ${PGDATABASE} recreada vacía"
fi

for f in supabase/migrations/*.sql; do
  printf '  %-62s' "$(basename "$f")"
  psql -d "$PGDATABASE" -U "$APLICADOR" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
  echo "ok"
done

# --- SET ROLE para la suite de RLS ------------------------------------------
# La suite necesita `SET ROLE authenticated`. En Supabase eso depende de que el
# rol de conexión sea MIEMBRO de esos roles — [SUPUESTO] S-12, comprobable en el
# proyecto real con `SELECT pg_has_role('postgres','authenticated','MEMBER')`,
# que dio `true` el 2026-09-06.
#
# LA CONCESIÓN VA AQUÍ, DESPUÉS DE LAS MIGRACIONES, Y CON `WITH SET TRUE`.
# Antes se hacía antes de aplicarlas y la suite fallaba en un clúster limpio con
# «permission denied to set role "authenticated"». La causa es un cambio de
# PostgreSQL 16: cuando un rol con CREATEROLE crea otro rol —y `anon` y
# `authenticated` los crea la migración 0001— recibe sobre él una pertenencia
# implícita con ADMIN pero con `set_option = false`, que SUSTITUYE a la
# concesión previa. El resultado es una membresía que no permite `SET ROLE`.
#
# Solo se veía en un clúster nuevo: los roles son de ámbito de clúster y
# `DROP DATABASE` no los borra, así que en una máquina donde ya existían la
# migración no los creaba y la concesión sobrevivía. Es el mismo patrón de las
# tres veces anteriores —un detalle del entorno que hace inerte un control—,
# aquí en la dirección contraria: no daba un verde falso, dejaba la suite sin
# poder correr.
psql -d postgres -Atqc "GRANT anon, authenticated, service_role TO ${APLICADOR} WITH SET TRUE;" >/dev/null 2>&1 || true

if [[ "${1:-}" == "--con-semillas" || "${1:-}" == "--con-pruebas" ]]; then
  printf '  %-62s' "seed.sql"
  psql -d "$PGDATABASE" -U "$APLICADOR" -v ON_ERROR_STOP=1 -q -f supabase/seed/seed.sql >/dev/null
  echo "ok"
fi

if [[ "${1:-}" == "--con-pruebas" ]]; then
  echo "--- suite de aislamiento y políticas ---"
  for f in supabase/policies/tests/*.sql; do
    printf '  %-62s' "$(basename "$f")"
    psql -d "$PGDATABASE" -U "$APLICADOR" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
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
su_local=$(psql -d "$PGDATABASE" -U "$APLICADOR" -Atqc "select rolsuper from pg_roles where rolname = current_user;")
dueno=$(psql -d "$PGDATABASE" -Atqc "select pg_get_userbyid(relowner) from pg_class where relname='eventos';")
echo "  rol de conexión      : ${APLICADOR} (superusuario: ${su_local})"
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
  Ejecuta `./supabase/verificar.sh --con-pruebas --modo-supabase` para
  verificarlas de verdad: aplica el esquema con un rol dueño NO superusuario.
AVISO
else
  echo "  este modo SÍ demuestra por ejecución el REVOKE al dueño y la RLS forzada"
fi

echo "verificación completa"
