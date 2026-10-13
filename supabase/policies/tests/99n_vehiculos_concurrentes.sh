#!/usr/bin/env bash
# =============================================================================
# 99n · EL TOPE DE VEHÍCULOS PROPIOS BAJO CONCURRENCIA · RONDA 15-Z1 · D-Z1 · ADR-04
#
#   «dos altas simultáneas sobre el quinto cupo → solo pasa una»
#
# Una vivienda con 4 vehículos propios vivos y tope 5 (el valor por omisión de
# la 0058). Veinte conexiones reales intentan a la vez registrar el quinto,
# cada una con su PLACA (así ninguna cae por el índice único de placa: si cae,
# es por el tope). Cada transacción espera un instante antes de confirmar, para
# que todas estén dentro a la vez. Sólo el bloqueo por vivienda de
# `tg_tope_vehiculos_propios` puede garantizar el resultado: un SELECT previo en
# la API contaría 4 en todas y dejaría pasar las veinte.
#
# Los vehículos no se borran (tg_vehiculos_prohibir_delete): la prueba usa una
# vivienda propia y, al terminar, desactiva los suyos. Repetible sobre la misma
# base. Hermana de `99l_plazas_concurrentes.sh`.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/../../.."

PGHOST="${PGHOST:-/var/tmp/ncr/sock}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-ncr}"
export PGHOST PGPORT PGUSER PGDATABASE
export PGOPTIONS="-c client_min_messages=warning"

COPROPIEDAD='10000000-0000-4000-8000-000000000001'
VIVIENDA='9e000000-0000-4000-8000-0000000c0002'
SUPER='00000000-0000-4000-8000-000000000002'
CLAIMS="{\"rol\":\"superadministrador\",\"usuario_id\":\"${SUPER}\",\"copropiedad_id\":null}"
INTENTOS=20

# Escenario: la vivienda propia (si no existe) con exactamente 4 propios vivos.
psql -Atq -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "  99n · NO VERIFICADO: no se pudo montar el escenario" >&2; exit 1; }
BEGIN;
SET LOCAL request.jwt.claims = '${CLAIMS}';
INSERT INTO public.viviendas (id, copropiedad_id, identificador, creado_por, actualizado_por)
VALUES ('${VIVIENDA}', '${COPROPIEDAD}', 'CONC-VEH', '${SUPER}', '${SUPER}')
ON CONFLICT (id) DO NOTHING;
UPDATE public.vehiculos
   SET estado = 'inactivo', desactivado_en = now(), desactivado_por = '${SUPER}',
       motivo_desactivacion = '99n: limpieza de la corrida anterior'
 WHERE vivienda_id = '${VIVIENDA}' AND estado = 'activo';
INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, origen_registro, creado_por, actualizado_por)
SELECT '${COPROPIEDAD}', '${VIVIENDA}', 'CONCV00' || n, 'residente', '${SUPER}', '${SUPER}'
  FROM generate_series(1, 4) AS n;
COMMIT;
SQL

tmp=$(mktemp -d)
for i in $(seq 1 "$INTENTOS"); do
  (
    psql -Atq -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL && echo ok > "$tmp/$i" || echo rechazado > "$tmp/$i"
BEGIN;
SET LOCAL request.jwt.claims = '${CLAIMS}';
INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, origen_registro, creado_por, actualizado_por)
VALUES ('${COPROPIEDAD}', '${VIVIENDA}', 'CONCV1$(printf '%02d' "$i")', 'residente', '${SUPER}', '${SUPER}');
SELECT pg_sleep(0.2);
COMMIT;
SQL
  ) &
done
wait

# `wc` almohadilla el número en BSD y no en GNU: se normaliza y se compara como
# NÚMERO (el mismo cuidado que 30_concurrencia_placas.sh).
aceptados=$(grep -l '^ok$' "$tmp"/* 2>/dev/null | wc -l | tr -d '[:space:]')
rechazados=$(grep -l '^rechazado$' "$tmp"/* 2>/dev/null | wc -l | tr -d '[:space:]')
rm -rf "$tmp"
vivos=$(psql -Atq -c "SET request.jwt.claims = '${CLAIMS}';
  SELECT count(*) FROM public.vehiculos
   WHERE vivienda_id = '${VIVIENDA}' AND estado = 'activo' AND origen_registro = 'residente';" \
  | tail -n 1 | tr -d '[:space:]')

# Deja la vivienda sin vehículos vivos para la siguiente corrida.
psql -Atq >/dev/null 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claims = '${CLAIMS}';
UPDATE public.vehiculos
   SET estado = 'inactivo', desactivado_en = now(), desactivado_por = '${SUPER}',
       motivo_desactivacion = '99n: fin de la prueba de concurrencia'
 WHERE vivienda_id = '${VIVIENDA}' AND estado = 'activo';
COMMIT;
SQL

echo "  intentos simultáneos sobre el quinto cupo   : ${INTENTOS}"
echo "  aceptados                                   : ${aceptados}"
echo "  rechazados                                  : ${rechazados}"
echo "  vehículos propios vivos al final            : ${vivos}"

if ! [[ "$vivos" =~ ^[0-9]+$ ]] || ! [[ "$aceptados" =~ ^[0-9]+$ ]]; then
  echo "  99n · NO VERIFICADO: no se obtuvo un recuento (vivos='${vivos}', aceptados='${aceptados}')" >&2
  exit 1
fi
if [[ "$aceptados" -ne 1 ]] || [[ "$vivos" -ne 5 ]]; then
  echo "  99n · TOPE INCUMPLIDO: se esperaba 1 aceptado y 5 vehículos vivos; hubo ${aceptados} y ${vivos}" >&2
  exit 1
fi
echo "  99n · ${INTENTOS} altas simultáneas sobre el quinto cupo: entra una, el tope se sostiene: ok"
