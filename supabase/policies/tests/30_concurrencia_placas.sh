#!/usr/bin/env bash
# =============================================================================
# KPI-03 · Integridad bajo concurrencia · ADR-004
#
#   "0 duplicados en 100 inserciones simultaneas"
#
# No es una prueba unitaria con dobles: lanza 100 conexiones reales que compiten
# por insertar LA MISMA placa. Solo el indice unico parcial puede garantizar el
# resultado; un SELECT previo en el caso de uso fallaria aqui.
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
VIVIENDA='30000000-0000-4000-8000-000000000001'
USUARIO='00000000-0000-4000-8000-000000000002'
PLACA='CONC001'

psql -Atq -c "DELETE FROM public.vehiculos WHERE placa='${PLACA}';" 2>/dev/null || true

tmp=$(mktemp -d)
for i in $(seq 1 100); do
  (
    psql -Atq -v ON_ERROR_STOP=1 -c "
      INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, creado_por, actualizado_por)
      VALUES ('${COPROPIEDAD}','${VIVIENDA}','${PLACA}','${USUARIO}','${USUARIO}');
    " >/dev/null 2>&1 && echo ok > "$tmp/$i" || echo rechazado > "$tmp/$i"
  ) &
done
wait

# `wc` ALMOHADILLA EL NUMERO EN BSD Y NO EN GNU. En macOS `wc -l` devuelve
# "       1" y en Linux "1": comparar eso como TEXTO contra "1" falla en macOS
# con el resultado correcto delante. Se normaliza aqui y se compara como
# NUMERO mas abajo; el control del paso 8 lo exige ahora para todo el arbol.
exitosos=$(grep -l '^ok$' "$tmp"/* 2>/dev/null | wc -l | tr -d '[:space:]')
rechazados=$(grep -l '^rechazado$' "$tmp"/* 2>/dev/null | wc -l | tr -d '[:space:]')
filas=$(psql -Atq -c "SELECT count(*) FROM public.vehiculos WHERE placa='${PLACA}' AND estado='activo';" | tr -d '[:space:]')
rm -rf "$tmp"

echo "  intentos concurrentes : 100"
echo "  aceptados             : ${exitosos}"
echo "  rechazados            : ${rechazados}"
echo "  filas activas en base : ${filas}"

# Comparacion NUMERICA: una cadena vacia o con espacios no se lee como "1"
# accidentalmente, y el numero almohadillado de BSD se compara igual que el de
# GNU. Se exige ademas que haya llegado un numero: `-eq` sobre cadena vacia
# evalua 0, asi que sin esto una consulta que no devolviera nada se leeria como
# "0 filas" en lugar de como "la consulta fallo".
if ! [[ "$filas" =~ ^[0-9]+$ ]] || ! [[ "$exitosos" =~ ^[0-9]+$ ]]; then
  echo "  KPI-03 NO VERIFICADO: no se obtuvo un recuento (filas='${filas}', aceptados='${exitosos}')" >&2
  exit 1
fi
if [[ "$filas" -ne 1 ]]; then
  echo "  KPI-03 INCUMPLIDO: se esperaba exactamente 1 fila, hay ${filas}" >&2
  exit 1
fi
if [[ "$exitosos" -ne 1 ]]; then
  echo "  KPI-03 INCUMPLIDO: se esperaba exactamente 1 insercion aceptada, hubo ${exitosos}" >&2
  exit 1
fi
echo "  KPI-03 · 0 duplicados en 100 inserciones simultaneas: ok"
