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

# Cada paso queda anotado: al final se compara lo ejecutado con lo declarado.
# Sin esta cuenta, un paso encerrado en un `if` que no se cumple no da rojo: da
# una salida más corta, y una salida más corta se lee como «todo bien».
PASOS_EJECUTADOS="$(mktemp "${TMPDIR:-/tmp}/ncr-pasos.XXXXXX")"
trap 'rm -f "$PASOS_EJECUTADOS"' EXIT
paso() { printf '\n▸ %s\n' "$1"; printf '%s\n' "$1" >>"$PASOS_EJECUTADOS"; }
ok()   { echo "   ✓ $1"; }
mal()  { echo "   ✗ $1"; fallos=1; }

paso "0 · borrando artefactos de compilación (así corre un checkout nuevo)"
rm -rf packages/*/dist apps/*/dist .turbo packages/*/.turbo apps/*/.turbo
rm -rf packages/*/coverage apps/*/coverage
# Los `.tsbuildinfo` viven DENTRO de `dist/` y ya se van con la línea de arriba.
# Este barrido es por si alguno quedó fuera de sitio: un registro de compilación
# que sobreviva al borrado de sus artefactos hace que `tsc -b` no emita nada y
# la compilación siguiente falle con «Cannot find module». Pasó al introducir
# las referencias de proyecto, y este paso es justo el que lo provoca.
rm -f packages/*/*.tsbuildinfo apps/*/*.tsbuildinfo
ok "dist, .turbo, coverage y registros de compilación eliminados"

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
# D-65 · ORDEN DELIBERADO: primero CADA APLICACIÓN POR SEPARADO, después la raíz.
#
# Al revés no sirve de nada, y así estuvo hasta el 2026-09-11. `pnpm build` pasa
# por turbo, que construye las dependencias en orden y deja todos los `dist/`
# frescos; después de eso, un build por paquete pasa aunque el paquete no sepa
# construir sus dependencias — porque ya están construidas. La verificación
# daba verde y `pnpm --filter @ncr/api build` fallaba en el equipo del usuario
# con un `TS2339` sobre un método que SÍ existía en el dominio: el `dist/` de
# `@ncr/domain-core` era anterior a la etapa que lo añadió.
#
# Es la misma familia que el falso verde de la ETAPA 04 —`dist` está en
# `.gitignore`, así que cada checkout tiene el suyo y envejece por su cuenta— y
# la regla de §2.8.0 («las pruebas resuelven los paquetes internos a su código
# fuente, nunca a su `dist/`») se había aplicado a las PRUEBAS y no al BUILD.
#
# Partiendo del paso 0, aquí no hay ningún `dist/`: si una aplicación no arrastra
# sus dependencias, falla, y falla aquí en vez de en el equipo de quien la use.
for app in api edge; do
  if [[ -f "apps/$app/package.json" ]] && grep -q '"build"' "apps/$app/package.json"; then
    con_limite "$LIMITE_MEDIO" pnpm --filter "@ncr/$app" build >/dev/null 2>&1 \
      && ok "@ncr/$app construye SOLO, sin que nadie le prepare las dependencias" \
      || mal "@ncr/$app no construye por sí solo: depende de un dist/ que alguien haya dejado ahí"
  fi
done
con_limite "$LIMITE_MEDIO" pnpm build >/dev/null 2>&1 && ok "pnpm build" || mal "pnpm build"
# Y la invariante que hace posible lo anterior, comprobada aparte: el bucle de
# arriba solo detecta la regresión si alguien la introduce Y el paso llega a
# correr con los `dist/` ya borrados. Esto la detecta siempre.
if salida_constr=$(con_limite "$LIMITE_CORTO" node scripts/lib/frontera-construccion.mjs 2>&1); then
  ok "${salida_constr#OK }"
else
  mal "una aplicación puede compilar contra un dist/ desfasado (D-65)"
  echo "$salida_constr" | head -8 | sed 's/^/     /'
fi

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
# ETAPA 08 · frontera DE MÓDULO, que es otra cosa: la anterior vigila que el
# dominio no importe infraestructura; esta, que a un módulo se entre por su
# barril (§2.2). Nadie lo comprobaba, y había 35 importaciones entrando por
# dentro (D-34).
if salida_mod=$(con_limite "$LIMITE_CORTO" node scripts/lib/frontera-modulos.mjs 2>&1); then
  ok "${salida_mod#OK }"
else
  mal "un módulo se importa por dentro y no por su barril (§2.2)"
  echo "$salida_mod" | head -8 | sed 's/^/     /'
fi
con_limite "$LIMITE_CORTO" ./scripts/escanear-secretos.sh >/dev/null 2>&1 && ok "sin secretos" || mal "secretos detectados"
# KPI-11 · la sustitución de MockProvider por HikvisionProvider en la ETAPA 15
# solo es posible si nadie fuera de `packages/providers` conoce el protocolo.
if salida_kpi11=$(con_limite "$LIMITE_CORTO" node scripts/lib/frontera-hardware.mjs 2>&1); then
  ok "$salida_kpi11"
else
  mal "protocolo del fabricante o IP de dispositivo fuera de packages/providers (KPI-11)"
  echo "$salida_kpi11" | head -8 | sed 's/^/     /'
fi
# D-63 · la CSP de la consola rechaza los atributos `style`, y las barras del
# tablero los emitían: salían a cero y nadie lo veía. jsdom no aplica CSP y el
# recorrido del navegador visitaba el tablero sin datos — dos suites que se
# solapan y dejan el intervalo justo donde vivía el defecto (DT-12).
if salida_csp=$(con_limite "$LIMITE_CORTO" node scripts/lib/frontera-csp.mjs 2>&1); then
  ok "${salida_csp#OK }"
else
  mal "atributo \`style\` en la consola: la CSP lo rechaza (§2.7.7)"
  echo "$salida_csp" | head -8 | sed 's/^/     /'
fi
# ADR-005 · una clave ajena hacia una tabla append-only NO se puede insertar
# jamás: la comprobación exige un bloqueo de fila que la revocación impide. El
# defecto vivió cinco etapas porque las tablas estaban vacías (ETAPA 06).
if salida_append=$(con_limite "$LIMITE_CORTO" node scripts/lib/frontera-append-only.mjs 2>&1); then
  ok "$salida_append"
else
  mal "clave ajena vigente hacia una tabla append-only (ADR-005)"
  echo "$salida_append" | head -10 | sed 's/^/     /'
fi

paso "10b · el contrato OpenAPI tiene tipos y el cliente generado está al día"
# ETAPA 09-A · el cliente de la consola se GENERA (§2.6), y un generado que
# nadie regenera describe la API de la semana pasada sin dar ningún error.
# Los dos controles son la contraparte mecánica de esa regla.
if salida_tipado=$(con_limite "$LIMITE_CORTO" node scripts/lib/contrato-tipado.mjs 2>&1); then
  ok "${salida_tipado#OK }"
else
  mal "hay operaciones sin respuesta tipada en el contrato (el cliente recibiría unknown)"
  echo "$salida_tipado" | head -10 | sed 's/^/     /'
fi
if salida_desf=$(con_limite "$LIMITE_MEDIO" node scripts/lib/contrato-desfasado.mjs 2>&1); then
  ok "${salida_desf#OK }"
else
  mal "el contrato o el cliente generado están desfasados respecto del código"
  echo "$salida_desf" | head -8 | sed 's/^/     /'
fi

paso "11 · latencia del canal de tiempo real bajo carga (KPI-25)"
# La cifra la produce `test/latencia-tiempo-real.test.ts`, que ya corrió en el
# paso 5 con el resto de la suite: aquí solo se LEE lo que dejó escrito. Medir
# aparte daría dos números para el mismo indicador, y el informe tendría que
# elegir uno.
if [[ -f .latencia-tiempo-real.json ]]; then
  node -e '
    const m = require("./.latencia-tiempo-real.json");
    const linea = (t, v) => console.log(`   ${t.padEnd(18)}: ${v}`);
    linea("alertas entregadas", `${m.recibidas} de ${m.esperadas}`);
    linea("p50 / p95 / p99", `${m.p50} / ${m.p95} / ${m.p99} ms`);
    linea("maximo", `${m.max} ms`);
    linea("umbral KPI-25", `${m.umbralKpi25Ms} ms`);
    process.exit(m.recibidas === m.esperadas && m.p99 < m.umbralKpi25Ms ? 0 : 1);
  ' && ok "KPI-25 con margen sobre el umbral" || mal "KPI-25 sin margen o con entregas perdidas"
else
  mal "no hay medición de latencia: ¿corrió test/latencia-tiempo-real.test.ts?"
fi

if [[ "$CON_BASE" == "1" ]]; then
  paso "12 · esquema y aislamiento en --modo-supabase (requiere --con-base)"
  if con_limite "$LIMITE_LARGO" ./supabase/verificar.sh --con-pruebas --modo-supabase >/tmp/ncr-sql.log 2>&1; then
    ok "migraciones, semillas y suite SQL"
  else
    mal "suite SQL (ver /tmp/ncr-sql.log)"
  fi
  paso "12b · arranque en frío: base vacía → migraciones → superadministrador (requiere --con-base)"
  # ETAPA 09-A · el camino que un despliegue recorre de verdad y que ninguna
  # suite tocaba: la SQL corre después de las semillas y la de la API firma sus
  # propios tokens contra adaptadores en memoria. Entre las dos cubrían todo
  # menos esto, y el usuario se lo encontró desplegando.
  if con_limite "$LIMITE_LARGO" ./supabase/arranque-en-frio.sh >/tmp/ncr-arranque.log 2>&1; then
    ok "una base recién migrada llega a un superadministrador con claims válidos"
    # El último tramo: «puede entrar», que lo decide el guard de la API con los
    # claims que la base acaba de producir. Se ejecuta AQUÍ, con el fichero de
    # claims recién escrito; si se dejara para el paso 5 el fichero podría ser
    # de una corrida anterior — un artefacto que envejece, otra vez.
    if NCR_CLAIMS_ARRANQUE="$PWD/.arranque-en-frio.json" \
       con_limite "$LIMITE_MEDIO" pnpm --filter @ncr/api exec vitest run \
         test/arranque-en-frio.e2e.test.ts >/tmp/ncr-entra.log 2>&1 &&
       ! grep -q "skipped" /tmp/ncr-entra.log; then
      ok "y esa sesión ENTRA: la API la acepta con aal2 y la rechaza con aal1"
    else
      mal "el superadministrador aprovisionado no puede entrar (ver /tmp/ncr-entra.log)"
      grep -E "×|→|skipped" /tmp/ncr-entra.log | head -5 | sed 's/^/     /'
    fi
  else
    mal "el arranque en frío está roto (ver /tmp/ncr-arranque.log)"
    grep -E "ERROR|ASSERT" /tmp/ncr-arranque.log | head -5 | sed 's/^/     /'
  fi

fi

paso "12c · el camino del NAVEGADOR: contraseña → factor → QR → aal2 → tablero"
# ETAPA 09-A · el intervalo de DT-12, cerrado. `arranque-en-frio` llega hasta
# «la API acepta estos claims»; las pruebas de la consola usan dobles por
# módulo. Entre las dos quedaba el camino que recorre una persona, y ahí
# vivieron cuatro rondas de defectos: el gancho de claims, el arranque en frío,
# la carrera del 503 y el QR que no se pintaba. Esto levanta la API y la consola
# COMPILADA contra un doble de GoTrue con su semántica real y conduce Chromium.
#
# **FUERA DE `--con-base`, y no por gusto.** Nació dentro del bloque que exige
# base de datos y ahí no se ejecutaba nunca sin ella: en la corrida del usuario
# el paso ni salía en la salida. Un control que no aparece no es una omisión
# declarada, es un hueco silencioso — la misma familia de fallo que este guion
# existe para impedir. Este camino no toca PostgreSQL: usa un doble de GoTrue y
# los adaptadores en memoria de la API, así que corre siempre.
#
# Y el guardián de Chromium vive AHORA dentro del propio comando: el que había
# aquí miraba una ruta de Linux (`/opt/pw-browsers`) estando el entorno de
# desarrollo objetivo en macOS, donde Playwright instala en otro sitio.
if con_limite "$LIMITE_LARGO" node e2e/camino-de-acceso.mjs >/tmp/ncr-camino.log 2>&1; then
  ok "el camino completo se recorre en el navegador"
else
  mal "el camino del navegador está roto o no hay con qué recorrerlo (ver /tmp/ncr-camino.log)"
  grep -E "✗|     " /tmp/ncr-camino.log | head -6 | sed 's/^/     /'
fi

if [[ "$CON_BASE" == "1" ]]; then
  paso "13 · KPI-03 y la inmutabilidad de un evento REAL, contra base (requiere --con-base)"
  # Estas dos pruebas se OMITEN solas si no alcanzan la base, y una omisión no
  # es un verde. Se comprueba la marca «OMITIDA» de su salida: sin esto, el
  # paso daba «✓ UPDATE y DELETE rechazados» con el servidor caído — que es
  # exactamente la familia de falso verde que este guion existe para impedir.
  con_base_o_omitida() {
    local fichero="$1" etiqueta="$2" salida
    salida=$(con_limite "$LIMITE_LARGO" pnpm --filter @ncr/api exec vitest run "$fichero" 2>&1)
    if [[ $? -ne 0 ]]; then
      mal "$etiqueta"
      echo "$salida" | grep -E "×|→" | head -5 | sed 's/^/     /'
    elif echo "$salida" | grep -q "OMITIDA"; then
      mal "$etiqueta — OMITIDA: no se alcanzó la base. Una omisión no es un verde."
    else
      ok "$etiqueta"
    fi
  }

  if [[ -n "${DATABASE_URL_PRUEBAS:-}" ]]; then
    con_base_o_omitida test/concurrencia-padron.test.ts \
      "100 inserciones concurrentes, 0 duplicados (KPI-03)"
    # Cierra el pendiente que la ETAPA 01 dejó abierto: el UPDATE se intenta
    # sobre una fila que EXISTE, insertada por el adaptador de la aplicación.
    # Sobre una tabla vacía, un UPDATE que no falla tampoco prueba nada.
    con_base_o_omitida test/eventos-pg.test.ts \
      "UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)"
    # ETAPA 07 · el aforo lo garantiza la base. En memoria esta prueba pasaría
    # con cualquier implementación —JavaScript tiene un hilo y dos peticiones
    # nunca coinciden—, así que solo cuenta ejecutada contra PostgreSQL real.
    con_base_o_omitida test/aforo-concurrencia.test.ts \
      "50 ingresos simultáneos sobre 10 plazas, ni una de más (RN-14, CA-14)"
  else
    echo "   – omitido: exporta DATABASE_URL_PRUEBAS para ejecutarlo"
  fi
fi

paso "14 · estabilidad: la suite da lo mismo tres veces seguidas"
# AÑADIDO EN LA ETAPA 07, a petición del usuario. La primera ejecución de la
# etapa falló con `socket hang up` en una prueba HTTP y la segunda pasó sin
# tocar nada. Una prueba intermitente es peor que una rota: enseña a reejecutar
# hasta el verde, y ese hábito acaba tapando defectos reales.
#
# Va al final porque es el paso más caro —ejecuta la suite entera varias veces,
# sin caché de turbo— y así los fallos baratos salen antes. El número de
# repeticiones se puede bajar con NCR_REPETICIONES para una vuelta rápida, pero
# el cierre de etapa se hace con el valor por defecto.
REPETICIONES="${NCR_REPETICIONES:-3}"
if salida_est=$(con_limite "$LIMITE_LARGO" node scripts/lib/estabilidad.mjs --repeticiones "$REPETICIONES" 2>&1); then
  echo "$salida_est" | grep -E "^   corrida" | sed 's/^/   /'
  ok "${salida_est##*$'\n'}"
else
  echo "$salida_est" | grep -E "^   (corrida|✗)|^     " | head -20 | sed 's/^/   /'
  mal "la suite no es reproducible entre corridas"
fi

paso "15 · ningún paso declarado se quedó sin ejecutar"
# El defecto que cierra este control: «12c» vivía dentro del bloque que exige
# base de datos, así que en una corrida sin ella no se ejecutaba NI se omitía;
# simplemente no salía. Lo detectó el usuario leyendo la salida y echándolo en
# falta. Un control que solo se comprueba a ojo no es un control.
if salida_pasos=$(node scripts/lib/pasos-ejecutados.mjs "$PASOS_EJECUTADOS" \
     $([[ "$CON_BASE" == "1" ]] && echo --con-base) 2>&1); then
  ok "$salida_pasos"
else
  mal "hay pasos declarados que no llegaron a ejecutarse"
  echo "$salida_pasos" | sed 's/^/     /'
fi

echo
if [[ "$fallos" -eq 0 ]]; then
  echo "VERIFICACIÓN DE ETAPA: correcta — se puede escribir el informe"
else
  echo "VERIFICACIÓN DE ETAPA: FALLIDA — NO se cierra la etapa"
fi
exit $fallos
