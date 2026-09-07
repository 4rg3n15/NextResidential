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

# Límite de tiempo por paso. `timeout` es de GNU coreutils y macOS no lo trae,
# así que el plazo lo impone `con-limite.mjs`, que se comporta igual en las dos
# plataformas. Ningún paso puede dejar el guion sin devolver el control: el
# 2026-09-07 el paso de fronteras se colgó indefinidamente en macOS porque una
# sonda arrancaba la API de verdad y el servidor no termina nunca.
LIMITE_CORTO=120     # comprobaciones de segundos
LIMITE_MEDIO=600     # instalación, compilación, lint, tipos
LIMITE_LARGO=1200    # suite completa, cobertura, base de datos

con_limite() { node scripts/lib/con-limite.mjs "$@"; }

paso() { printf '\n▸ %s\n' "$1"; }
ok()   { echo "   ✓ $1"; }
mal()  { echo "   ✗ $1"; fallos=1; }

paso "0 · borrando artefactos de compilación (así corre un checkout nuevo)"
rm -rf packages/*/dist apps/*/dist .turbo packages/*/.turbo apps/*/.turbo
rm -rf packages/*/coverage apps/*/coverage
ok "dist, .turbo y coverage eliminados"

paso "1 · entorno dentro de lo declarado"
# La verificación depende ahora de Node y no del shell. Eso cierra la
# divergencia BSD/GNU y abre otra: la versión del runtime. La diferencia es que
# esta SÍ está declarada —`.nvmrc` y `engines`— y el CI usa la misma.
if salida_entorno=$(con_limite "$LIMITE_CORTO" node scripts/lib/verificar-entorno.mjs 2>&1); then
  ok "$(echo "$salida_entorno" | tail -1)"
else
  mal "Node o pnpm fuera del rango declarado"
  echo "$salida_entorno" | sed 's/^/     /'
fi

paso "2 · instalación coherente con el lockfile"
if con_limite "$LIMITE_MEDIO" pnpm install --frozen-lockfile >/dev/null 2>&1; then
  ok "pnpm install --frozen-lockfile"
else
  mal "el lockfile no está sincronizado con los package.json"
fi

paso "3 · compilación desde cero"
con_limite "$LIMITE_MEDIO" pnpm build >/dev/null 2>&1 && ok "pnpm build" || mal "pnpm build"

paso "4 · lint y typecheck"
con_limite "$LIMITE_MEDIO" pnpm lint      >/dev/null 2>&1 && ok "pnpm lint"      || mal "pnpm lint"
con_limite "$LIMITE_MEDIO" pnpm typecheck >/dev/null 2>&1 && ok "pnpm typecheck" || mal "pnpm typecheck"

paso "5 · suite completa"
salida_pruebas="$(mktemp)"
con_limite "$LIMITE_LARGO" pnpm test >"$salida_pruebas" 2>&1
salida=$(cat "$salida_pruebas")
echo "$salida" | grep -E "Tests +[0-9]" | sed 's/^/   /'
if echo "$salida" | grep -qE "Tests +[0-9]+ failed|FAIL "; then
  mal "hay pruebas en rojo"
  echo "$salida" | grep -E "×|→" | head -10 | sed 's/^/     /'
else
  ok "suite completa en verde"
fi

paso "6 · ningún fichero de prueba se quedó sin recoger"
# Detecta el fichero que existe y NADIE ejecuta —patrón `include` que dejó de
# alcanzarlo, paquete fuera de la corrida—: ahí no hay ningún rojo, la suite
# informa «4 passed» y parece correcta. El fichero que sí se recoge y falla al
# importar lo atrapa el paso 4, no este.
#
# El recuento y el recorrido de directorios se hacen en Node, no en shell: la
# primera versión usaba `paste -sd+ | bc`, sintaxis de GNU, y en macOS —el
# entorno de desarrollo objetivo— informaba «0 de 14». El control contra falsos
# verdes producía él mismo un falso negativo.
if veredicto=$(con_limite "$LIMITE_CORTO" node scripts/lib/contar-pruebas.mjs "$salida_pruebas"); then
  ok "${veredicto#OK }"
else
  mal "${veredicto#FALLO }"
fi
rm -f "$salida_pruebas"

paso "7 · umbrales de cobertura por capa (§2.4)"
# Se mide por CAPA, no en agregado: §2.4 exige 90 % en dominio y aplicación y
# 70 % global, y un agregado alto puede esconder una capa por debajo — como
# ocurrió con `aplicacion`, que estaba al 79 % sin que nadie lo midiera.
if salida_cob=$(con_limite "$LIMITE_LARGO" node scripts/lib/metricas.mjs 2>&1); then
  echo "$salida_cob" | grep -E "^  (OK|BAJO)" | sed 's/^/   /'
  ok "las tres capas cumplen su umbral"
else
  mal "alguna capa por debajo del umbral de §2.4"
  echo "$salida_cob" | grep -E "^  (OK|BAJO)" | sed 's/^/     /'
fi

paso "8 · portabilidad de las superficies con shell (macOS/BSD y CI/GNU)"
# El entorno de desarrollo objetivo es macOS; el CI de la ETAPA 14 correrá en
# Linux. Los guiones deben funcionar en los dos, y eso se comprueba, no se
# recuerda: tres veces una diferencia entre ambos cambió el resultado.
if salida_port=$(con_limite "$LIMITE_CORTO" node scripts/lib/portabilidad.mjs 2>&1); then
  ok "${salida_port}"
else
  mal "hay construcciones que divergen entre BSD y GNU"
  echo "$salida_port" | head -12 | sed 's/^/     /'
fi

paso "9 · pruebas negativas de los propios controles"
# Un control que nadie ha visto fallar no está demostrado.
if salida_neg=$(con_limite "$LIMITE_MEDIO" node scripts/lib/pruebas-negativas.mjs 2>&1); then
  ok "$(echo "$salida_neg" | tail -1)"
else
  mal "algún control NO detecta su violación"
  echo "$salida_neg" | grep "✗" | sed 's/^/     /'
fi

paso "10 · fronteras de arquitectura y secretos"
con_limite "$LIMITE_MEDIO" ./scripts/verificar-frontera.sh >/dev/null 2>&1 && ok "fronteras (DoD ETAPA 02)" || mal "fronteras"
con_limite "$LIMITE_CORTO" ./scripts/escanear-secretos.sh >/dev/null 2>&1 && ok "sin secretos" || mal "secretos detectados"
# KPI-11 · la sustitución de MockProvider por HikvisionProvider en la ETAPA 15
# solo es posible si nadie fuera de `packages/providers` conoce el protocolo.
if salida_kpi11=$(con_limite "$LIMITE_CORTO" node scripts/lib/frontera-hardware.mjs 2>&1); then
  ok "$salida_kpi11"
else
  mal "protocolo del fabricante o IP de dispositivo fuera de packages/providers (KPI-11)"
  echo "$salida_kpi11" | head -8 | sed 's/^/     /'
fi

if [[ "$CON_BASE" == "1" ]]; then
  paso "11 · esquema y aislamiento en --modo-supabase"
  if con_limite "$LIMITE_LARGO" ./supabase/verificar.sh --con-pruebas --modo-supabase >/tmp/ncr-sql.log 2>&1; then
    ok "migraciones, semillas y suite SQL"
  else
    mal "suite SQL (ver /tmp/ncr-sql.log)"
  fi
  paso "12 · KPI-03 con base real"
  if [[ -n "${DATABASE_URL_PRUEBAS:-}" ]]; then
    con_limite "$LIMITE_LARGO" pnpm --filter @ncr/api exec vitest run test/concurrencia-padron.test.ts >/dev/null 2>&1 \
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
