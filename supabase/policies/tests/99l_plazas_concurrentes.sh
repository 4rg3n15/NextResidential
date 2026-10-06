#!/usr/bin/env bash
# =============================================================================
# 99l · EL TOPE DE PLAZAS BAJO CONCURRENCIA · RONDA 15-W · D-W10 · ADR-04
#
#   «dos inserciones simultáneas sobre la cuarta plaza → solo pasa una»
#
# Una vivienda con 3 plazas vivas y tope 4. Veinte conexiones reales intentan a
# la vez añadir una plaza, cada una con su NÚMERO (así ninguna cae por el índice
# único del número: si cae, es por el tope). Cada transacción espera un instante
# antes de confirmar, para que todas estén dentro a la vez. Sólo el bloqueo por
# vivienda del disparador puede garantizar el resultado: un SELECT previo en la
# API contaría 3 en todas y dejaría pasar las veinte.
#
# Las plazas no se borran (tg_prohibir_delete): la prueba usa una vivienda
# propia y, al terminar, retira las suyas. Repetible sobre la misma base.
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
VIVIENDA='9e000000-0000-4000-8000-0000000c0001'
SUPER='00000000-0000-4000-8000-000000000002'
CLAIMS="{\"rol\":\"superadministrador\",\"usuario_id\":\"${SUPER}\",\"copropiedad_id\":null}"
INTENTOS=20

# Escenario: la vivienda propia (si no existe) con exactamente 3 plazas vivas.
psql -Atq -v ON_ERROR_STOP=1 >/dev/null <<SQL || { echo "  99l · NO VERIFICADO: no se pudo montar el escenario" >&2; exit 1; }
BEGIN;
SET LOCAL request.jwt.claims = '${CLAIMS}';
INSERT INTO public.viviendas (id, copropiedad_id, identificador, creado_por, actualizado_por)
VALUES ('${VIVIENDA}', '${COPROPIEDAD}', 'CONC-PLAZAS', '${SUPER}', '${SUPER}')
ON CONFLICT (id) DO NOTHING;
UPDATE public.viviendas SET tope_de_plazas = NULL WHERE id = '${VIVIENDA}' AND tope_de_plazas IS NOT NULL;
UPDATE public.plazas_de_ocupante
   SET estado = 'inactivo', desactivado_en = now(), desactivado_por = '${SUPER}',
       motivo_desactivacion = '99l: limpieza de la corrida anterior'
 WHERE vivienda_id = '${VIVIENDA}' AND estado = 'activo';
INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
SELECT '${COPROPIEDAD}', '${VIVIENDA}', n, '${SUPER}', '${SUPER}' FROM generate_series(1, 3) AS n;
COMMIT;
SQL

tmp=$(mktemp -d)
for i in $(seq 1 "$INTENTOS"); do
  (
    psql -Atq -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL && echo ok > "$tmp/$i" || echo rechazado > "$tmp/$i"
BEGIN;
SET LOCAL request.jwt.claims = '${CLAIMS}';
INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
VALUES ('${COPROPIEDAD}', '${VIVIENDA}', $((3 + i)), '${SUPER}', '${SUPER}');
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
vivas=$(psql -Atq -c "SET request.jwt.claims = '${CLAIMS}';
  SELECT count(*) FROM public.plazas_de_ocupante WHERE vivienda_id = '${VIVIENDA}' AND estado = 'activo';" \
  | tail -n 1 | tr -d '[:space:]')

# Deja la vivienda sin plazas vivas para la siguiente corrida.
psql -Atq >/dev/null 2>&1 <<SQL
BEGIN;
SET LOCAL request.jwt.claims = '${CLAIMS}';
UPDATE public.plazas_de_ocupante
   SET estado = 'inactivo', desactivado_en = now(), desactivado_por = '${SUPER}',
       motivo_desactivacion = '99l: fin de la prueba de concurrencia'
 WHERE vivienda_id = '${VIVIENDA}' AND estado = 'activo';
COMMIT;
SQL

echo "  intentos simultáneos sobre la cuarta plaza : ${INTENTOS}"
echo "  aceptados                                  : ${aceptados}"
echo "  rechazados                                 : ${rechazados}"
echo "  plazas vivas al final                      : ${vivas}"

if ! [[ "$vivas" =~ ^[0-9]+$ ]] || ! [[ "$aceptados" =~ ^[0-9]+$ ]]; then
  echo "  99l · NO VERIFICADO: no se obtuvo un recuento (vivas='${vivas}', aceptados='${aceptados}')" >&2
  exit 1
fi
if [[ "$aceptados" -ne 1 ]] || [[ "$vivas" -ne 4 ]]; then
  echo "  99l · TOPE INCUMPLIDO: se esperaba 1 aceptada y 4 plazas vivas; hubo ${aceptados} y ${vivas}" >&2
  exit 1
fi
echo "  99l · ${INTENTOS} altas simultáneas sobre la cuarta plaza: entra una, el tope se sostiene: ok"
