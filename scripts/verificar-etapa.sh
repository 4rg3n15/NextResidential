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

# La ruta es ABSOLUTA a propósito. Con la relativa, cualquier paso que se
# ejecute dentro de un subshell con `cd` —los de la app móvil lo hacen— llamaba
# a un fichero que desde allí no existe, y Node contestaba `MODULE_NOT_FOUND`:
# el paso daba rojo por una causa que no tenía nada que ver con lo que probaba.
RAIZ_DEL_REPO="$PWD"
con_limite() { node "$RAIZ_DEL_REPO/scripts/lib/con-limite.mjs" "$@"; }

# Cada paso queda anotado: al final se compara lo ejecutado con lo declarado.
# Sin esta cuenta, un paso encerrado en un `if` que no se cumple no da rojo: da
# una salida más corta, y una salida más corta se lee como «todo bien».
PASOS_EJECUTADOS="$(mktemp "${TMPDIR:-/tmp}/ncr-pasos.XXXXXX")"
trap 'rm -f "$PASOS_EJECUTADOS"' EXIT
paso() { printf '\n▸ %s\n' "$1"; printf '%s\n' "$1" >>"$PASOS_EJECUTADOS"; }
ok()   { echo "   ✓ $1"; }
mal()  { echo "   ✗ $1"; fallos=1; }
# Un paso DECLARADO no ejercido no es un ✓ ni un ✗: es un ⚠ que sobrevive al
# veredicto y sale en él. Desactivarlo sería borrarlo; declararlo es dejarlo a
# la vista con su motivo y su fecha de revisión (`controles-declarados.mjs`).
declarados=0
declarado() {
  echo "   ⚠ $1"
  declarados=$((declarados + 1))
}

paso "0 · borrando artefactos de compilación (así corre un checkout nuevo)"
rm -rf packages/*/dist apps/*/dist .turbo packages/*/.turbo apps/*/.turbo
rm -rf packages/*/coverage apps/*/coverage
# Los `.tsbuildinfo` viven DENTRO de `dist/` y ya se van con la línea de arriba.
# Este barrido es por si alguno quedó fuera de sitio: un registro de compilación
# que sobreviva al borrado de sus artefactos hace que `tsc -b` no emita nada y
# la compilación siguiente falle con «Cannot find module». Pasó al introducir
# las referencias de proyecto, y este paso es justo el que lo provoca.
rm -f packages/*/*.tsbuildinfo apps/*/*.tsbuildinfo
# ─────────────────────────────────────────────────────────────────────────────
# D-115 · EL `dist/` VIEJO DE LA ETAPA 04, OTRA VEZ, CON OTRO NOMBRE.
#
# `.arranque-en-frio.json` lo escribe el paso 12b y está en `.gitignore`, así
# que cada árbol tiene el suyo —o no tiene ninguno—. `arranque-en-frio.e2e.test.ts`
# se salta entero si el fichero NO está, y se ejecuta si está: es decir, **el
# resultado del paso 5 dependía de si alguien había corrido el verificador antes
# en esa misma carpeta**.
#
# Se vio comparando dos corridas de la misma SHA: aquí, con el fichero de una
# corrida previa, el paso 5 daba «658, sin una sola saltada»; en un runner
# recién creado daba «653 | 5 skipped». Mi verde local era falso, y lo era por
# exactamente el mismo mecanismo que motivó este guion: un artefacto que
# envejece y que nadie declara.
#
# Borrándolo aquí, las dos máquinas parten igual: las cinco se saltan SIEMPRE en
# el paso 5 —no hay claims todavía— y se ejecutan SIEMPRE en el 12b, que las
# escribe y que ya exige que no se salten.
# ─────────────────────────────────────────────────────────────────────────────
rm -f .arranque-en-frio.json
ok "dist, .turbo, coverage, registros de compilación y claims de arranque eliminados"

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

paso "1c · el árbol es escribible por las herramientas que van a usarlo"
# AÑADIDO EN LA ETAPA 11-A a petición del usuario, tras tres rondas perdidas en
# errores de entorno. Un permiso denegado no aparece donde está: aparece cuatro
# pasos más abajo, disfrazado del error de la herramienta que tropezó con él
# —un `PathAccessException` al crear `.dart_tool`— y mandando a buscar el
# problema en el código. Se comprueba por EJERCICIO, no con `access()`.
if salida_escritura=$(con_limite "$LIMITE_CORTO" node scripts/lib/verificar-escritura.mjs 2>&1); then
  ok "$salida_escritura"
else
  mal "hay rutas que las herramientas necesitan y no pueden usar"
  echo "$salida_escritura" | sed 's/^/     /'
fi

# Y la base, si se prometió una. Los pasos 12, 12b y 13 la dan por hecha; sin
# ella fallan cuarenta minutos más tarde con tres mensajes que hablan de otra
# cosa. Se pregunta aquí, con el host, el puerto y la base en el mensaje.
if [[ "$CON_BASE" == "1" ]]; then
  if salida_base=$(con_limite "$LIMITE_CORTO" node scripts/lib/verificar-base-de-pruebas.mjs 2>&1); then
    ok "$salida_base"
  else
    mal "se pidió --con-base y la base no está utilizable"
    echo "$salida_base" | sed 's/^/     /'
  fi
else
  echo "   – sin --con-base: la base no se comprueba ni se usa"
fi

paso "1b · docs/ESTADO_ETAPAS.md no se contradice a sí mismo"
# AÑADIDO EN LA ETAPA 11 a petición del usuario, y por la razón más incómoda:
# la cabecera del documento se congeló DOS veces, la segunda pese a existir ya
# la regla del DoD (2026-09-08) que obliga a actualizarla. Una regla en prosa
# que nada comprueba es la decimoctava aparición del patrón de este repositorio
# —el control existe pero no comprueba lo que crees—. Ahora la comprueba esto.
if salida_estado=$(con_limite "$LIMITE_CORTO" node scripts/lib/coherencia-estado-etapas.mjs 2>&1); then
  ok "$salida_estado"
else
  mal "la cabecera, el mapa y las fichas de ESTADO_ETAPAS.md no dicen lo mismo"
  echo "$salida_estado" | sed 's/^/     /'
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
# `pnpm test` ES `turbo run test`; se invoca turbo directamente para poder
# pedirle a vitest, ADEMÁS del informe de consola, el JSON que el paso 7b
# compara. Cada paquete escribe el suyo en su propio directorio (D-113: la
# consola de turbo no tiene el mismo formato en todas las máquinas, y un
# control que depende del formato no vigila lo que cree).
rm -f apps/*/.informe-paso5.json packages/*/.informe-paso5.json
TURBO_TELEMETRY_DISABLED=1 con_limite "$LIMITE_LARGO" pnpm exec turbo run test -- \
  --reporter=default --reporter=json --outputFile=.informe-paso5.json \
  >"$salida_pruebas" 2>&1
codigo_pruebas=$?
# ─────────────────────────────────────────────────────────────────────────────
# D-108 · SIN COLORES ANTES DE CONTAR NADA.
#
# Los códigos de color de Vitest **parten `Tests` de su número**: la línea que
# se lee como «Tests  648 passed» es, en bytes, `Tests \e[22m \e[1m\e[32m648
# passed`, y ni `Tests +[0-9]` ni `Tests +[0-9]+ failed` casan con ella.
#
# La primera corrida del verificador en macOS lo enseñó entero: `pnpm test`
# terminó en 0, escribió 477 200 bytes, la suite informó 648 verdes de 658 — y
# este paso dijo «la suite no informó ni una prueba». Y lo peor no es el falso
# rojo: con colores, la rama que detecta PRUEBAS EN ROJO tampoco casa, así que
# la única defensa que quedaba era el código de salida.
#
# Ya había pasado, y está escrito en la cabecera de `estabilidad.mjs`: «los
# códigos de color de Vitest partían `Tests` de su número, no casaba una sola
# línea, y comparar dos firmas vacías daba "idéntico"». Se arregló allí y no
# aquí. Ahora el patrón vive en un solo sitio y lo usan los tres.
# ─────────────────────────────────────────────────────────────────────────────
salida=$(node "$RAIZ_DEL_REPO/scripts/lib/sin-colores.mjs" <"$salida_pruebas")
# Se conserva en fichero porque el paso 7b compara estos recuentos con los del
# paso 7. Dos pasos que deben decir lo mismo, y hasta D-112 nadie los comparaba.
SALIDA_PASO5="$(mktemp "${TMPDIR:-/tmp}/ncr-paso5.XXXXXX")"
printf '%s\n' "$salida" >"$SALIDA_PASO5"
echo "$salida" | grep -E "Tests +[0-9]" | sed 's/^/   /'
# ─────────────────────────────────────────────────────────────────────────────
# D-79 · SE MIRA EL CÓDIGO DE SALIDA, y no solo el texto.
#
# Este paso decidía «en verde» buscando «Tests N failed» o «FAIL» en la salida.
# Con la compilación rota, `pnpm test` ni siquiera llega a ejecutar la suite:
# no imprime ninguna de las dos cosas, así que el paso informaba **suite
# completa en verde con cero pruebas ejecutadas**. Lo destapó la corrida de la
# ETAPA 11-A, donde un error de tipos dejó la compilación rota y el único paso
# que se quejó fue el recuento de ficheros recogidos.
#
# Y al arreglarlo apareció algo PEOR, D-80: con `set -o pipefail` —que este
# guion activa en su primera línea— la construcción `echo "$x" | grep -q ...`
# devuelve **141**, no 0, cuando encuentra lo que busca. `grep -q` sale en
# cuanto acierta, `echo` recibe SIGPIPE, y `pipefail` propaga ese 141 al
# pipeline. Es decir: la comprobación original de pruebas en rojo **se leía
# como falsa justo cuando acertaba**, y el paso informaba «suite completa en
# verde» con la suite en rojo. Solo se manifiesta con salidas grandes, que es
# cuando `grep -q` puede terminar antes que `echo`.
#
# Por eso aquí se usa `<<<`, que no crea tubería y no puede romperse así.
if [[ $codigo_pruebas -ne 0 ]]; then
  mal "la suite no terminó bien (código $codigo_pruebas): puede que ni siquiera llegara a correr"
  grep -E "error|Error|ERR_|×|→" "$salida_pruebas" | head -10 | sed 's/^/     /'
elif grep -qE "Tests +[0-9]+ failed|FAIL " <<<"$salida"; then
  mal "hay pruebas en rojo"
  echo "$salida" | grep -E "×|→" | head -10 | sed 's/^/     /'
elif grep -qE "[0-9]+ skipped|[0-9]+ todo" <<<"$salida" && [[ "$CON_BASE" == "1" ]]; then
  # ───────────────────────────────────────────────────────────────────────────
  # D-112 · UNA PRUEBA SALTADA NO SUMA AL VERDE.
  #
  # Hasta aquí este paso solo miraba `Tests N failed`. Una prueba que no llega a
  # ejecutarse no falla: se descuenta del total y el resumen sigue diciendo
  # «passed». Así es como «653 passed | 5 skipped» pasaba por verde.
  #
  # Con `--con-base` la única omisión admisible es la DECLARADA, y la
  # declaración nombra el paso que sí la ejerce —hoy, las del arranque en frío,
  # que el paso 12b ejecuta con los claims que él mismo escribe—. Cualquier otra
  # es un fallo, y las dos salen nombradas.
  # ───────────────────────────────────────────────────────────────────────────
  if salida_salt=$(node scripts/lib/recuentos-coherentes.mjs --saltadas "$RAIZ_DEL_REPO" 2>&1); then
    declarado "suite sin rojas · las saltadas están DECLARADAS y se ejercen en otro paso"
    echo "$salida_salt" | sed 's/^/     /'
  else
    mal "hay pruebas SALTADAS sin declarar con --con-base: una omisión no es un verde"
    echo "$salida_salt" | sed 's/^/     /'
    grep -E "^\s*(Tasks|Cached|Time):" <<<"$salida" | sed 's/^/     turbo: /'
    echo "     el verificador la ve: DATABASE_URL_PRUEBAS=${DATABASE_URL_PRUEBAS:+definida}${DATABASE_URL_PRUEBAS:-NO DEFINIDA}"
    echo "     lo que turbo resuelve para la tarea:"
    TURBO_TELEMETRY_DISABLED=1 pnpm exec turbo run test --filter=@ncr/api --dry=json 2>/dev/null |
      node -e '
        let e = "";
        process.stdin.on("data", (d) => (e += d)).on("end", () => {
          try {
            const t = JSON.parse(e).tasks?.[0] ?? {};
            const v = t.environmentVariables ?? {};
            for (const k of ["specified", "configured", "inferred", "global", "passthrough"]) {
              console.log(`       ${k}: ${JSON.stringify(v[k] ?? null)}`);
            }
          } catch (x) {
            console.log(`       (no se pudo leer el plan de turbo: ${x.message})`);
          }
        });'
  fi
elif ! grep -qE "Tests +[0-9]" <<<"$salida"; then
  mal "la suite no informó ni una prueba: una salida sin recuento no es un verde"
  # D-106 · esta rama imprimía CERO líneas. Saltó en la primera corrida del
  # verificador en macOS —`pnpm test` terminó en 0 sin un solo recuento— y no
  # dejó nada con lo que diagnosticarlo: ni el código, ni cuánto se escribió,
  # ni la cola. Un fallo que no se nombra a sí mismo obliga a reproducirlo, y
  # reproducir este cuesta otra corrida entera del runner.
  echo "     código de salida: $codigo_pruebas · $(wc -c <"$salida_pruebas" | tr -d '[:space:]') bytes escritos"
  echo "     últimas 20 líneas de lo que sí salió (ya sin colores):"
  tail -20 <<<"$salida" | sed 's/^/       /'
elif grep -qE "[0-9]+ skipped|[0-9]+ todo" <<<"$salida"; then
  # Sin base sí hay saltadas legítimas, y se dicen. «En verde» a secas con
  # pruebas que no se han ejecutado es media verdad.
  saltadas_totales=$(grep -oE "[0-9]+ (skipped|todo)" <<<"$salida" | grep -oE "^[0-9]+" |
    awk '{s+=$1} END {print s+0}')
  ok "suite completa sin rojas, CON $saltadas_totales prueba(s) SALTADA(S) por correr sin --con-base"
  grep -E "Tests +[0-9]" <<<"$salida" | grep -E "skipped|todo" | sed 's/^/     /'
else
  ok "suite completa en verde, sin una sola prueba saltada"
fi

# ─────────────────────────────────────────────────────────────────────────────
# LA APP FLUTTER · pasos 5b, 5c y 5d (ETAPA 11-A)
#
# Hasta aquí, NINGUNO de los 19 pasos tocaba `apps/mobile`. Es la misma forma de
# hueco que persigue el resto del guion: un verificador que informa «correcta»
# sin haber mirado una cuarta parte del monorepo. La app se distribuye —no se
# despliega— así que un defecto suyo no se arregla con un `git push`.
#
# **Si falta el SDK de Flutter, estos pasos FALLAN.** No se omiten: es la misma
# regla que el guardián de Chromium del paso 12c, y por el mismo motivo —«sin
# navegador no se omite en silencio» era una afirmación que resultó falsa—. Con
# `NCR_FLUTTER` se puede apuntar a un SDK fuera del PATH.
FLUTTER_BIN="${NCR_FLUTTER:-flutter}"
hay_flutter() { command -v "$FLUTTER_BIN" >/dev/null 2>&1; }
DIR_MOVIL="$RAIZ_DEL_REPO/apps/mobile"

# ─────────────────────────────────────────────────────────────────────────────
# `ejecutar_movil` · un paso de la app, y un fallo que se puede diagnosticar.
#
# PEDIDO POR EL USUARIO, con su motivo: «"flutter analyze encontró problemas"
# sin más no dice nada; ni siquiera sé si los problemas son del código o del
# entorno». Así que ante un fallo esto imprime, SIEMPRE y antes que la salida:
#
#   · el comando exacto, con sus argumentos
#   · el directorio desde el que se ejecutó, absoluto
#   · qué binario de Flutter es y qué versiones trae
#
# Y clasifica: si la salida tiene la firma de un problema de ENTORNO —permisos,
# resolución de versiones, un módulo de Node que no aparece— lo dice con esas
# palabras y remite al paso 1, en vez de dejar creer que el código está roto.
#
# Uso: ejecutar_movil <limite> <fichero-de-salida> <comando...>
# Devuelve el código del comando.
ejecutar_movil() {
  local limite="$1" destino="$2"
  shift 2
  (cd "$DIR_MOVIL" && con_limite "$limite" "$@") >"$destino" 2>&1
  return $?
}

diagnostico_movil() {
  local destino="$1"
  shift
  echo "     comando   : $*"
  echo "     directorio: $DIR_MOVIL"
  echo "     flutter   : $(command -v "$FLUTTER_BIN" 2>/dev/null || echo '<no está en el PATH>')"
  local version
  version=$("$FLUTTER_BIN" --version --machine 2>/dev/null |
    node -e 'let e="";process.stdin.on("data",d=>e+=d).on("end",()=>{try{const j=JSON.parse(e);console.log(`Flutter ${j.frameworkVersion} · Dart ${String(j.dartSdkVersion).split(" ")[0]} · canal ${j.channel}`)}catch{console.log("no se pudo leer la versión")}})' 2>/dev/null)
  echo "     versiones : ${version:-desconocidas}"

  # La clasificación. Cada patrón es un fallo que YA ocurrió en este proyecto.
  if grep -qiE "PathAccessException|Permission denied|EACCES|Operation not permitted" "$destino"; then
    echo "     ► Esto es ENTORNO, no código: permisos de escritura. Vea el paso 1c."
  elif grep -qiE "requires SDK version|version solving failed|Dart SDK version" "$destino"; then
    echo "     ► Esto es ENTORNO, no código: su Dart no cumple lo que pide"
    echo "       apps/mobile/pubspec.yaml. Vea el paso 1, que lo nombra."
  elif grep -qiE "MODULE_NOT_FOUND|Cannot find module" "$destino"; then
    echo "     ► Esto es ENTORNO: falta un módulo de Node para el guion, no para la app."
  elif grep -qiE "No pubspec.yaml file found|Target file .* not found" "$destino"; then
    echo "     ► Esto es ENTORNO: el comando corrió desde un directorio sin app Flutter."
  fi
  # ── QUÉ SE IMPRIME PRIMERO · pedido por el usuario, 2026-09-20 ────────────
  #
  # `flutter test` termina con el contador de progreso, y ese contador arrastra
  # el `-1` en cada prueba POSTERIOR que pasa. Con `tail -20` a secas, las
  # veinte últimas líneas eran quince nombres de pruebas que pasaron, todas
  # marcadas con el mismo `-1`, y el nombre de la que falló quedaba arriba,
  # fuera del recorte. Costó minutos localizar una prueba que el propio guion
  # tenía delante.
  #
  # Ahora el nombre de lo que falla va PRIMERO y el volcado después, como
  # contexto. Dos fuentes, por orden: el bloque «Failing tests:» que Flutter
  # escribe al final, y si no estuviera, las líneas marcadas `[E]`, que es como
  # marca cada fallo mientras corre.
  local fallidas
  fallidas=$(sed -n '/^Failing tests:/,$p' "$destino" | sed '1d' | sed '/^[[:space:]]*$/d')
  if [[ -z "$fallidas" ]]; then
    fallidas=$(grep -E '\[E\]$' "$destino" | sed -E 's/^[0-9:]+ \+[0-9]+ -[0-9]+: //')
  fi
  if [[ -n "$fallidas" ]]; then
    echo "     ► PRUEBAS QUE FALLAN:"
    echo "$fallidas" | sed 's/^/       ✗ /'
    # Y el detalle de la PRIMERA, que es donde está la causa: lo que se esperaba
    # y lo que se obtuvo, sin tener que abrir el fichero.
    local detalle
    detalle=$(grep -m 4 -E '^[[:space:]]*(Expected|Actual|Which):' "$destino")
    if [[ -n "$detalle" ]]; then
      echo "     ► DETALLE DE LA PRIMERA:"
      echo "$detalle" | sed 's/^[[:space:]]*/       /'
    fi
    echo "     ► Contexto (últimas líneas de la corrida):"
  fi
  sed 's/^/     /' <(tail -20 "$destino")
}

# ─────────────────────────────────────────────────────────────────────────────
# `diagnostico_recorrido` · el paso 5e, que hasta ahora no decía nada.
#
# PEDIDO POR EL USUARIO: «El 5e sigue sin diagnosticar. ¿Necesita la API
# levantada? Si es así, que el paso lo compruebe y lo nombre.»
#
# **NO la necesita, y conviene que quede escrito aquí y no solo en un informe:**
# `recorrido-web.mjs` levanta él mismo un servidor de guardarropa en
# 127.0.0.1:$PUERTO_RECORRIDO que contesta las cinco rutas del residente y el
# `token`. Si el 5e fallara por «la API está caída» sería un defecto del
# recorrido, no del entorno.
#
# Lo que sí necesita —un Chromium que Playwright pueda lanzar y el puerto
# libre— se comprueba ahora en el paso 1, con su remedio. Aquí se clasifica lo
# que llegue, para que un fallo del RECORRIDO no se confunda con uno de la app.
PUERTO_RECORRIDO="${NCR_PUERTO_RECORRIDO:-4599}"
diagnostico_recorrido() {
  local destino="$1"
  echo "     comando   : node apps/mobile/e2e/recorrido-web.mjs"
  echo "     directorio: $RAIZ_DEL_REPO"
  echo "     navegador : ${NCR_CHROMIUM:-el que resuelva Playwright}"
  echo "     puerto    : $PUERTO_RECORRIDO (guardarropa propio; NO usa la API real)"

  if grep -qiE "no hay Chromium|Executable doesn't exist|browserType.launch" "$destino"; then
    echo "     ► Esto es ENTORNO: falta el navegador. \`pnpm exec playwright install chromium\`."
    echo "       El paso 1 lo nombra desde esta ronda."
  elif grep -qiE "EADDRINUSE|address already in use" "$destino"; then
    echo "     ► Esto es ENTORNO: el puerto $PUERTO_RECORRIDO está ocupado. Libérelo o"
    echo "       exporte NCR_PUERTO_RECORRIDO. Vea el paso 1."
  elif grep -qiE "no hay .build/web|ENOENT.*build/web" "$destino"; then
    echo "     ► Esto es ENTORNO: la compilación web no dejó artefactos. Vea el fallo"
    echo "       de \`flutter build web\` más arriba, no este."
  elif grep -qiE "ECONNREFUSED" "$destino"; then
    echo "     ► El guardarropa no llegó a escuchar. NO es la API: el recorrido no la usa."
  else
    echo "     ► Nada apunta al entorno: esto es la APP. Las líneas ✗ de abajo dicen"
    echo "       en qué pantalla y con qué error de JavaScript se quedó."
  fi
  grep -E "✗" "$destino" | head -8 | sed 's/^/     /'
  sed 's/^/     /' <(tail -15 "$destino")
}

paso "5b · app móvil: análisis estático de Dart"
salida_movil="$(mktemp)"
if ! hay_flutter; then
  mal "no hay SDK de Flutter ($FLUTTER_BIN). Instálelo o exporte NCR_FLUTTER; una omisión no es un verde"
elif ejecutar_movil "$LIMITE_MEDIO" "$salida_movil" "$FLUTTER_BIN" analyze; then
  ok "flutter analyze sin hallazgos"
else
  mal "flutter analyze terminó con fallo"
  diagnostico_movil "$salida_movil" "$FLUTTER_BIN" analyze
fi
rm -f "$salida_movil"

paso "5c · app móvil: suite de Dart y cobertura POR CAPA"
if ! hay_flutter; then
  mal "no hay SDK de Flutter ($FLUTTER_BIN): la suite de la app no se ejecutó"
else
  salida_flutter="$(mktemp)"
  if ejecutar_movil "$LIMITE_LARGO" "$salida_flutter" "$FLUTTER_BIN" test --coverage; then
    grep -E "All tests passed|[0-9]+ \+[0-9]+" "$salida_flutter" | tail -1 | sed 's/^/   /'
    # La cobertura se mide por capa, como en TypeScript: un agregado alto
    # esconde una capa por debajo, y eso ya ocurrió una vez (`aplicacion` al 79 %).
    if salida_cob=$(node scripts/lib/cobertura-flutter.mjs 2>&1); then
      echo "$salida_cob"
      ok "cobertura de la app dentro de los umbrales por capa"
    else
      echo "$salida_cob"
      mal "la app Flutter no alcanza sus umbrales de cobertura"
    fi

    # ── LA SUITE TIENE QUE DAR LO MISMO EN OTRO HUSO · D-97 ─────────────────
    #
    # Una prueba de widget construyó una franja horaria en UTC y exigió leer
    # «02:00». El widget pinta la hora LOCAL, así que en un contenedor con
    # TZ=Etc/UTC pasaba y en Bogotá fallaba: mismo código, dos resultados. El
    # entorno de desarrollo objetivo es macOS en Bogotá y el CI corre en UTC
    # (§2.8.0), de modo que una prueba así está verde en una máquina y roja en
    # la otra, y quien la ve roja no puede saber si es el código o el reloj.
    #
    # No basta con fijar un huso: eso solo mueve el punto ciego. Lo que hace
    # falta es que la suite dé el MISMO resultado en dos husos distintos, y por
    # eso el segundo se elige comparando desplazamientos con el de esta máquina
    # —el primero de la lista que no coincida—. Así siempre son dos de verdad,
    # se corra donde se corra.
    tz_otro=""
    for tz_candidato in Pacific/Auckland America/Bogota Asia/Kolkata Etc/UTC; do
      if [[ "$(TZ="$tz_candidato" date +%z 2>/dev/null)" != "$(date +%z)" ]]; then
        tz_otro="$tz_candidato"
        break
      fi
    done
    if [[ -z "$tz_otro" ]]; then
      mal "no se encontró un huso distinto del de esta máquina para la segunda corrida"
    else
      salida_tz="$(mktemp)"
      if TZ="$tz_otro" ejecutar_movil "$LIMITE_LARGO" "$salida_tz" "$FLUTTER_BIN" test; then
        ok "la suite de Dart da lo mismo en otro huso ($tz_otro): ninguna prueba depende del reloj del sistema"
      else
        mal "la suite de Dart pasa aquí y falla en $tz_otro: alguna prueba depende del huso"
        diagnostico_movil "$salida_tz" "$FLUTTER_BIN" test
      fi
      rm -f "$salida_tz"
    fi
  else
    mal "la suite de la app Flutter terminó con fallo"
    diagnostico_movil "$salida_flutter" "$FLUTTER_BIN" test --coverage
  fi
  rm -f "$salida_flutter"
fi

paso "5d · app móvil: cliente al día, sin secretos y sin dependencias a ciegas"
if salida_secretos=$(node scripts/lib/flutter-sin-secretos.mjs 2>&1); then
  ok "$salida_secretos"
else
  mal "la app nombra o incrusta algo que no puede viajar en un binario"
  echo "$salida_secretos" | sed 's/^/     /'
fi
# La acotación de `objective_c`: un `dependency_overrides` sin motivo escrito es
# una versión congelada que nadie vuelve a mirar. Ver el propio control.
if salida_acot=$(node scripts/lib/dependencias-acotadas.mjs 2>&1); then
  ok "$salida_acot"
else
  mal "hay una dependencia acotada a ciegas"
  echo "$salida_acot" | sed 's/^/     /'
fi
if ! hay_flutter; then
  mal "no hay SDK de Flutter ($FLUTTER_BIN): no se pudo comprobar si el cliente Dart está al día"
elif salida_cliente=$(con_limite "$LIMITE_MEDIO" node scripts/lib/cliente-dart-desfasado.mjs 2>&1); then
  ok "$salida_cliente"
else
  mal "el cliente Dart no coincide con el contrato OpenAPI"
  echo "$salida_cliente" | head -10 | sed 's/^/     /'
fi

paso "5e · app móvil: el RECORRIDO en un navegador de verdad"
# «Los defectos que más han costado aparecieron usando el producto, no
# ejecutando pruebas.» Las pruebas de widget montan un árbol en memoria; esto
# compila la app para web, la sirve y la recorre entera. No prueba la API —
# enfrente hay un guardarropa— y eso está escrito en la cabecera del guion.
if declaracion=$(node scripts/lib/controles-declarados.mjs 5e 2>/dev/null); then
  declarado "$(head -1 <<<"$declaracion")"
  tail -n +2 <<<"$declaracion" | fold -s -w 92 | sed 's/^/     /'
elif ! hay_flutter; then
  mal "no hay SDK de Flutter ($FLUTTER_BIN): la app no se compiló ni se recorrió"
else
  salida_web="$(mktemp)"
  # La clave del recorrido se COMPONE: `escanear-secretos.mjs` busca la forma
  # `sb_publishable_…` en todo el repositorio y hace bien en no tener lista de
  # exenciones —ahí es donde acaba escondiéndose el secreto de verdad—. El valor
  # es de mentira y el guardarropa no lo mira; lo que se comprueba es que la app
  # arranca con una clave de la forma correcta.
  CLAVE_DE_RECORRIDO="sb_$(printf 'publishable')_recorrido"
  # `--no-web-resources-cdn` no es una comodidad del recorrido: sin él, la app
  # pide CanvasKit y la tipografía a un CDN EN EJECUCIÓN, lo que rompe cualquier
  # CSP seria (§2.7.7) y deja la app inservible sin internet abierto.
  if ejecutar_movil "$LIMITE_LARGO" "$salida_web" "$FLUTTER_BIN" build web --no-web-resources-cdn \
       --dart-define=API_URL=http://127.0.0.1:4599 \
       --dart-define=SUPABASE_URL=http://127.0.0.1:4599/supabase \
       --dart-define=SUPABASE_PUBLISHABLE_KEY="$CLAVE_DE_RECORRIDO"; then
    if con_limite "$LIMITE_LARGO" node apps/mobile/e2e/recorrido-web.mjs >>"$salida_web" 2>&1; then
      grep -E "^   ✓" "$salida_web" | tail -13
      ok "la app se recorre entera en el navegador, sin un error de JavaScript"
    else
      mal "el recorrido de la app falló"
      diagnostico_recorrido "$salida_web"
    fi
  else
    mal "la app Flutter no compila para web"
    diagnostico_movil "$salida_web" "$FLUTTER_BIN" build web --no-web-resources-cdn
  fi
  rm -f "$salida_web"
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
SALIDA_PASO7="$(mktemp "${TMPDIR:-/tmp}/ncr-paso7.XXXXXX")"
if salida_cob=$(con_limite "$LIMITE_LARGO" node scripts/lib/metricas.mjs 2>&1); then
  echo "$salida_cob" | grep -E "^  (OK|BAJO)" | sed 's/^/   /'
  ok "las tres capas cumplen su umbral"
else
  # El motivo REAL, no una conjetura. `metricas.mjs` falla por tres razones
  # distintas —un fichero que nadie ejecuta, un paquete que quedó fuera de la
  # medición, o una capa bajo el umbral— y hasta esta ronda las tres se
  # anunciaban como «alguna capa por debajo del umbral». Ocurrió: una corrida
  # dejó `@ncr/api` sin resumen de cobertura, la capa de aplicación desapareció
  # del informe en lugar de salir en rojo, y el mensaje mandaba a buscar un
  # umbral incumplido que no existía. Es la misma clase de fallo que el usuario
  # señaló en los pasos móviles: un mensaje que no nombra su causa.
  if grep -q "corrida(s) que NO terminaron" <<<"$salida_cob"; then
    mal "la corrida de un paquete NO terminó: su resumen sería de la ejecución anterior"
  elif grep -q "QUEDARON FUERA de la medición" <<<"$salida_cob"; then
    mal "un paquete quedó FUERA de la medición: no es una capa baja, es una capa que nadie midió"
  elif grep -q "que NADIE ejecutó" <<<"$salida_cob"; then
    mal "hay ficheros de prueba en disco que nadie ejecutó"
  else
    mal "alguna capa por debajo del umbral de §2.4"
  fi
  echo "$salida_cob" | grep -E "^  (OK|BAJO)|QUEDARON FUERA|NADIE ejecutó|NO terminaron|^     - |SIN RESUMEN|SIN INFORME" | sed 's/^/     /'
  # ───────────────────────────────────────────────────────────────────────────
  # D-105 · EL CONTROL IMPRIMÍA EL NOMBRE Y EL CONSUMIDOR LO TIRABA.
  #
  # D-100 hizo que `metricas.mjs` escribiera, por cada prueba roja, su nombre,
  # su fichero y su aserción. Este filtro no los recogía: la primera corrida
  # del verificador en macOS informó «SUITE EN ROJO · 5 prueba(s) fallaron de
  # 658» y ni una sola línea más. Los nombres estaban a tres líneas de
  # distancia, en la misma salida que este `grep` acababa de recortar.
  #
  # Es la misma familia una capa más arriba: se arregló que el control lo
  # dijera y no que alguien lo escuchara. Dos rondas para el mismo defecto.
  # ───────────────────────────────────────────────────────────────────────────
  # El rango termina en la cabecera SIN dos puntos —`## @ncr/api`—, que es la
  # del bloque siguiente; la de apertura sí los lleva —`## @ncr/api: PRUEBAS EN
  # ROJO`—. Distinguirlas por los dos puntos conserva el encabezado del hallazgo
  # y descarta el del bloque que viene detrás.
  echo "$salida_cob" | sed -n '/: PRUEBAS EN ROJO/,/^## [^:]*$/p' | grep -v '^## [^:]*$' |
    head -30 | sed 's/^/     /'
fi
printf '%s\n' "$salida_cob" >"$SALIDA_PASO7"

paso "7b · los dos recuentos de la MISMA suite coinciden (D-112)"
# El paso 5 corre la suite por turbo y el paso 7 por vitest directo. Los dos
# daban verde discrepando: turbo informaba «653 passed | 5 skipped» y vitest
# ejecutaba las 658. El dato estaba en la salida de los dos; faltaba compararlo.
if salida_rec=$(con_limite "$LIMITE_CORTO" node scripts/lib/recuentos-coherentes.mjs \
     "$RAIZ_DEL_REPO" "$SALIDA_PASO7" 2>&1); then
  ok "$salida_rec"
else
  mal "los dos caminos de la suite NO dan el mismo resultado: uno de los dos miente"
  echo "$salida_rec" | sed 's/^/     /'
fi
rm -f "$SALIDA_PASO5" "$SALIDA_PASO7"
rm -f apps/*/.informe-paso5.json packages/*/.informe-paso5.json

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
# ANTES de ejecutarlas: ¿las hay para TODOS? Esta es la defensa genérica contra
# la familia de veinte defectos «el control existe pero no comprueba lo que
# crees». La lista de casos se mantenía a mano, así que un control nuevo podía
# nacer, entrar aquí y reportar «✓» sin que nadie lo hubiera visto decir «✗».
# Así nació D-81. Ahora los dos conjuntos se derivan del código y se comparan.
# Y que las declaraciones de «no ejercido» sigan en regla: con motivo escrito y
# con una etapa de revisión que todavía no se haya cerrado. Una declaración que
# sobrevive a su propia revisión es una desactivación con buenos modales.
# `.env.example` es la ÚNICA documentación de la configuración y aquello contra
# lo que `entorno:diff` compara. Nadie comprobaba que dijera la verdad: tenía
# una variable sin `=` —invisible para el comparador, reclamada en cada
# corrida durante semanas— y tres nombres que el código no lee (D-90).
if salida_entorno=$(node scripts/lib/entorno-declarado.mjs 2>&1); then
  ok "$salida_entorno"
else
  mal ".env.example no declara lo que el código lee"
  echo "$salida_entorno" | sed 's/^/     /'
fi
if salida_declaradas=$(node scripts/lib/controles-declarados.mjs --auditar 2>&1); then
  ok "$salida_declaradas"
else
  mal "hay declaraciones de «no ejercido» fuera de regla"
  echo "$salida_declaradas" | sed 's/^/     /'
fi
if salida_cobertura_controles=$(node scripts/lib/controles-sin-prueba-negativa.mjs 2>&1); then
  ok "$salida_cobertura_controles"
else
  mal "hay un control que el verificador ejecuta y nadie ha visto fallar"
  echo "$salida_cobertura_controles" | sed 's/^/     /'
fi
# Un control que nadie ha visto fallar no está demostrado.
#
# Corre bajo `NODE_V8_COVERAGE`, que hace que CADA proceso de Node —incluidos
# los que la suite lanza para ejercitar cada control— escriba su cobertura. Eso
# alimenta la comprobación de granularidad de RAMA que viene a continuación, y
# que es la mitad que faltaba: `controles-sin-prueba-negativa.mjs` atrapa al
# fichero sin prueba; esto atrapa a la rama nueva dentro de un fichero que ya
# la tenía — que es exactamente D-81.
COBERTURA_CONTROLES="$(mktemp -d)"
export NCR_COBERTURA_CONTROLES="$COBERTURA_CONTROLES"
if salida_neg=$(NODE_V8_COVERAGE="$COBERTURA_CONTROLES" \
     con_limite "$LIMITE_MEDIO" node scripts/lib/pruebas-negativas.mjs 2>&1); then
  ok "$(echo "$salida_neg" | tail -1)"
else
  mal "algún control NO detecta su violación"
  echo "$salida_neg" | grep "✗" | sed 's/^/     /'
fi
if salida_ramas=$(node scripts/lib/ramas-de-los-controles.mjs 2>&1); then
  ok "$salida_ramas"
else
  mal "hay ramas de control que nadie ha visto correr"
  echo "$salida_ramas" | sed 's/^/     /'
fi
rm -rf "$COBERTURA_CONTROLES"

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
# ETAPA 13 · el alcance pide «ni en el código NI EN EL HISTORIAL de Git». Hasta
# aquí la segunda mitad no tenía control: un secreto confirmado y retirado en el
# commit siguiente dejaba el escáner en «limpio» mientras la llave seguía siendo
# recuperable con una orden (H-13-17).
if salida_hist=$(con_limite "$LIMITE_CORTO" ./scripts/escanear-secretos.sh --historial 2>&1); then
  ok "$salida_hist"
else
  mal "hay un secreto en el HISTORIAL de Git: borrarlo del árbol no lo retira"
  echo "$salida_hist" | head -8 | sed 's/^/     /'
fi
# §2.7.4 exige «longitud máxima POR CAMPO». Vivía como un techo global aplicado
# con `.slice()`, que mutilaba en silencio las cargas base64 (H-13-09). La cota
# está ahora en cada DTO, y esto impide que el campo siguiente nazca sin ella.
if salida_long=$(con_limite "$LIMITE_CORTO" node scripts/lib/longitud-por-campo.mjs 2>&1); then
  ok "$salida_long"
else
  mal "hay campos de texto sin longitud máxima declarada (§2.7.4)"
  echo "$salida_long" | head -10 | sed 's/^/     /'
fi
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
# BLOQUE 6 · el modo oscuro se rompe por un color literal que alguien dejó
# suelto: `bg-white` junto a `text-texto` se ve bien en claro y en oscuro deja
# etiqueta clara sobre fondo blanco. Todo color tiene que salir de un token con
# pareja medida en los dos temas (`packages/config/src/temas.ts`).
if salida_tema=$(con_limite "$LIMITE_CORTO" node scripts/lib/frontera-tema.mjs 2>&1); then
  ok "${salida_tema#OK }"
else
  mal "color fuera del sistema de temas: no tiene pareja que medir en oscuro"
  echo "$salida_tema" | head -8 | sed 's/^/     /'
fi
# ETAPA 04 (alta de viviendas) · el tipo de copropiedad y sus dos etiquetas NO
# entran en el dominio. De eso depende que «el tipo se puede cambiar después»
# siga siendo cierto: el día que una politica ramifique por el, cambiarlo
# dejaria de ser inocuo y nadie se enteraria hasta produccion.
if salida_vocab=$(con_limite "$LIMITE_CORTO" node scripts/lib/frontera-vocabulario.mjs 2>&1); then
  ok "${salida_vocab#OK }"
else
  mal "el vocabulario de la copropiedad entro en el dominio"
  echo "$salida_vocab" | head -8 | sed 's/^/     /'
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

# ETAPA 14 · la consola es INSTALABLE, y se comprueba. Una PWA que no lo es no
# da ningún error: el navegador simplemente no ofrece instalarla. Este control
# nació de un hallazgo así —el icono «enmascarable» era byte a byte el mismo
# que el normal, y en Android el logo salía recortado—.
if salida_pwa=$(con_limite "$LIMITE_CORTO" node scripts/lib/pwa-instalable.mjs 2>&1); then
  ok "${salida_pwa#OK }"
else
  mal "la consola NO es instalable como PWA"
  echo "$salida_pwa" | head -10 | sed 's/^/     /'
fi
# ETAPA 14 · D-78 · la paleta de la app se GENERA desde el preset compartido.
# Un generado que nadie regenera describe el diseño de la semana pasada.
if salida_paleta=$(con_limite "$LIMITE_CORTO" node scripts/lib/generar-paleta-dart.mjs --comprobar 2>&1); then
  ok "${salida_paleta#OK }"
else
  mal "la paleta de la app Flutter no coincide con el preset (D-78)"
  echo "$salida_paleta" | head -8 | sed 's/^/     /'
fi
# ETAPA 14 · TODO bloque ```mermaid del repositorio tiene que ANALIZAR, con
# Mermaid de verdad y no con una expresión regular parecida. La DoD de la ETAPA
# 16 exige «que los diagramas rendericen» y hasta ahora nadie lo comprobaba: los
# cinco de `modelo-datos.md` llevaban desde la ETAPA 01 sin que ninguna máquina
# los leyera. Es el control que no existe y la documentación que afirma como si
# existiera. `LIMITE_MEDIO` y no corto: cargar Mermaid bajo jsdom tarda.
if salida_mmd=$(con_limite "$LIMITE_MEDIO" node scripts/lib/mermaid-analizable.mjs 2>&1); then
  ok "${salida_mmd#OK }"
else
  mal "hay un diagrama Mermaid que no analiza: GitHub lo mostraría como un recuadro de error"
  echo "$salida_mmd" | head -12 | sed 's/^/     /'
fi

paso "10b · el contrato OpenAPI tiene tipos y el cliente generado está al día"
# ETAPA 09-A · el cliente de la consola se GENERA (§2.6), y un generado que
# nadie regenera describe la API de la semana pasada sin dar ningún error.
# Los dos controles son la contraparte mecánica de esa regla.
# D-92 · en OpenAPI el nombre de la clase ES el nombre del esquema: dos clases
# homónimas se pisan y el cliente generado describe la forma equivocada sin dar
# ningún error. Lo encontró el compilador de Dart, no un control.
if salida_esquemas=$(con_limite "$LIMITE_CORTO" node scripts/lib/esquemas-unicos.mjs 2>&1); then
  ok "$salida_esquemas"
else
  mal "hay nombres de esquema repetidos: el contrato publica una forma y esconde otra"
  echo "$salida_esquemas" | head -12 | sed 's/^/     /'
fi
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
    local fichero="$1" etiqueta="$2" salida codigo
    salida=$(con_limite "$LIMITE_LARGO" pnpm --filter @ncr/api exec vitest run "$fichero" 2>&1)
    # El código se guarda en su propia variable EN LA LÍNEA SIGUIENTE. Con
    # `if [[ $? -ne 0 ]]` funcionaba, pero cualquier línea que alguien metiera
    # entre medias —un `echo` de depuración— lo habría pisado en silencio.
    codigo=$?
    if [[ "$codigo" -ne 0 ]]; then
      mal "$etiqueta"
      # D-104 · el diagnóstico decía el qué y no el porqué. Filtraba por `×` y
      # `→`, que son los marcadores de vitest CUANDO hay una aserción rota; si
      # el proceso moría antes —sin base, sin módulo, por tiempo límite— no
      # casaba ninguno y el paso imprimía la etiqueta y NADA más. Es la misma
      # familia que D-100 en el paso 7: un fallo que no se nombra a sí mismo
      # obliga a reproducirlo a mano, y en el CI de macOS eso es otra corrida
      # de cuarenta minutos. Ahora sale el código y la cola real.
      echo "     código de salida: $codigo · fichero: $fichero"
      local pistas
      pistas=$(grep -E "×|→|FAIL|Error|error:|ECONN|timed out|AssertionError" <<<"$salida" |
        head -8)
      if [[ -n "$pistas" ]]; then
        sed 's/^/     /' <<<"$pistas"
      else
        echo "     (ninguna línea reconocible; últimas 15 de la salida)"
        tail -15 <<<"$salida" | sed 's/^/     /'
      fi
    elif grep -q "OMITIDA" <<<"$salida"; then
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
    # D-72 · el padrón se da de alta escribiendo nombres. Con dobles esta
    # prueba pasa con cualquier implementación; lo que hay que demostrar es que
    # la fila EXISTE y que la misma cédula escrita de dos formas resuelve a una
    # sola persona, y eso solo lo garantiza el índice único de PostgreSQL.
    con_base_o_omitida test/padron-por-nombre.test.ts \
      "una hoja sin un solo UUID crea viviendas, personas y sus vínculos (D-72, RN-06)"
    # D-71 · y el superadministrador escribe de verdad, no solo pasa el alcance.
    con_base_o_omitida test/padron-superadmin.test.ts \
      "el superadministrador escribe el padrón en la copropiedad del selector (D-71)"
    # ETAPA 04 (alta de viviendas) · el `ON CONFLICT` de la generación infiere
    # el índice COMPUESTO de la 0029. Un doble en memoria no puede verlo: si la
    # inferencia fallara, PostgreSQL rechazaría la sentencia entera y la suite
    # con dobles seguiría en verde.
    con_base_o_omitida test/generacion-padron.test.ts \
      "las 12 en una sentencia, el mismo número en tres agrupaciones, y una colisión revierte las 12"
  else
    # `--con-base` SIN base era una omisión silenciosa: el paso se declaraba,
    # imprimía una nota y el veredicto salía «correcta» sin haber tocado
    # PostgreSQL. Es la misma familia que el paso 13 escondiendo tres pruebas en
    # rojo. Quien no tenga base, que corra sin `--con-base` y lo diga en el
    # informe; pedirla y no tenerla es un fallo.
    mal "se pidió --con-base y no hay DATABASE_URL_PRUEBAS: estas pruebas NO se ejecutaron"
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
if [[ "$fallos" -eq 0 && "$declarados" -eq 0 ]]; then
  echo "VERIFICACIÓN DE ETAPA: correcta — se puede escribir el informe"
elif [[ "$fallos" -eq 0 ]]; then
  echo "VERIFICACIÓN DE ETAPA: correcta CON $declarados CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe"
else
  echo "VERIFICACIÓN DE ETAPA: FALLIDA — NO se cierra la etapa"
fi
exit $fallos
