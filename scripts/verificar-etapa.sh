#!/usr/bin/env bash
# =============================================================================
# Verificación de cierre de etapa · OBLIGATORIA antes de escribir el informe
#
# Ejecuta la suite completa desde un estado LIMPIO de artefactos, que es lo que
# distingue este guion de `pnpm verificar`.
#
# POR QUÉ EXISTE. El 2026-09-07 se reportaron 51 pruebas verdes y en el entorno
# del usuario fallaron 3. Ninguna de las dos ejecuciones mentía: en este
# entorno se había reconstruido `packages/domain-core/dist` durante el trabajo;
# en el suyo, ese `dist` —que está en .gitignore, así que cada checkout tiene el
# suyo— era de una etapa anterior. `pnpm --filter <app> test` no dispara turbo
# y por tanto no reconstruye las dependencias.
#
# Es la segunda vez que un artefacto del entorno produce un verde que no se
# reproduce (la primera fue la metadata de decoradores en la ETAPA 03). La
# lección es la misma que dejó la ETAPA 01: una suite verde no significa nada
# si no se declara contra qué corrió.
#
#   ./scripts/verificar-etapa.sh            # artefactos limpios + suite completa
#   ./scripts/verificar-etapa.sh --con-base # además, la suite SQL y KPI-03
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."
CON_BASE=0
for a in "$@"; do [[ "$a" == "--con-base" ]] && CON_BASE=1; done
fallos=0
paso() { printf '\n▸ %s\n' "$1"; }
ok()   { echo "   ✓ $1"; }
mal()  { echo "   ✗ $1"; fallos=1; }

paso "0 · borrando artefactos de compilación (así corre un checkout nuevo)"
rm -rf packages/*/dist apps/*/dist .turbo packages/*/.turbo apps/*/.turbo
rm -rf packages/*/coverage apps/*/coverage
ok "dist, .turbo y coverage eliminados"

paso "1 · instalación coherente con el lockfile"
if pnpm install --frozen-lockfile >/dev/null 2>&1; then
  ok "pnpm install --frozen-lockfile"
else
  mal "el lockfile no está sincronizado con los package.json"
fi

paso "2 · compilación desde cero"
pnpm build >/dev/null 2>&1 && ok "pnpm build" || mal "pnpm build"

paso "3 · lint y typecheck"
pnpm lint      >/dev/null 2>&1 && ok "pnpm lint"      || mal "pnpm lint"
pnpm typecheck >/dev/null 2>&1 && ok "pnpm typecheck" || mal "pnpm typecheck"

paso "4 · suite completa"
salida_pruebas="$(mktemp)"
pnpm test >"$salida_pruebas" 2>&1
salida=$(cat "$salida_pruebas")
echo "$salida" | grep -E "Tests +[0-9]" | sed 's/^/   /'
if echo "$salida" | grep -qE "Tests +[0-9]+ failed|FAIL "; then
  mal "hay pruebas en rojo"
  echo "$salida" | grep -E "×|→" | head -10 | sed 's/^/     /'
else
  ok "suite completa en verde"
fi

paso "5 · ningún fichero de prueba se quedó sin recoger"
# Detecta el fichero que existe y NADIE ejecuta —patrón `include` que dejó de
# alcanzarlo, paquete fuera de la corrida—: ahí no hay ningún rojo, la suite
# informa «4 passed» y parece correcta. El fichero que sí se recoge y falla al
# importar lo atrapa el paso 4, no este.
#
# El recuento y el recorrido de directorios se hacen en Node, no en shell: la
# primera versión usaba `paste -sd+ | bc`, sintaxis de GNU, y en macOS —el
# entorno de desarrollo objetivo— informaba «0 de 14». El control contra falsos
# verdes producía él mismo un falso negativo.
if veredicto=$(node scripts/lib/contar-pruebas.mjs "$salida_pruebas"); then
  ok "${veredicto#OK }"
else
  mal "${veredicto#FALLO }"
fi
rm -f "$salida_pruebas"

paso "6 · umbrales de cobertura"
pnpm test:cobertura >/dev/null 2>&1 && ok "cobertura por encima del umbral" \
  || mal "cobertura por debajo del umbral"

paso "7 · portabilidad de los guiones (macOS/BSD y CI/GNU)"
# El entorno de desarrollo objetivo es macOS; el CI de la ETAPA 14 correrá en
# Linux. Los guiones deben funcionar en los dos, y eso se comprueba, no se
# recuerda: tres veces una diferencia entre ambos cambió el resultado.
if salida_port=$(node scripts/lib/portabilidad.mjs 2>&1); then
  ok "${salida_port}"
else
  mal "hay construcciones que divergen entre BSD y GNU"
  echo "$salida_port" | head -12 | sed 's/^/     /'
fi

paso "8 · fronteras de arquitectura y secretos"
./scripts/verificar-frontera.sh >/dev/null 2>&1 && ok "fronteras (DoD ETAPA 02)" || mal "fronteras"
./scripts/escanear-secretos.sh  >/dev/null 2>&1 && ok "sin secretos"            || mal "secretos detectados"

if [[ "$CON_BASE" == "1" ]]; then
  paso "9 · esquema y aislamiento en --modo-supabase"
  if ./supabase/verificar.sh --con-pruebas --modo-supabase >/tmp/ncr-sql.log 2>&1; then
    ok "migraciones, semillas y suite SQL"
  else
    mal "suite SQL (ver /tmp/ncr-sql.log)"
  fi
  paso "10 · KPI-03 con base real"
  if [[ -n "${DATABASE_URL_PRUEBAS:-}" ]]; then
    pnpm --filter @ncr/api exec vitest run test/concurrencia-padron.test.ts >/dev/null 2>&1 \
      && ok "100 inserciones concurrentes, 0 duplicados" || mal "KPI-03"
  else
    echo "   – omitido: exporta DATABASE_URL_PRUEBAS para ejecutarlo"
  fi
fi

echo
if [[ "$fallos" -eq 0 ]]; then
  echo "VERIFICACIÓN DE ETAPA: correcta — se puede escribir el informe"
else
  echo "VERIFICACIÓN DE ETAPA: FALLIDA — NO se cierra la etapa"
fi
exit $fallos
