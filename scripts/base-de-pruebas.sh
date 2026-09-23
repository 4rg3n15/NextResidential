#!/usr/bin/env bash
# =============================================================================
# UNA PostgreSQL EFÍMERA PARA `verificar-etapa.sh --con-base`.
#
# POR QUÉ EXISTE. Hasta la corrección de macOS, los pasos 12, 12b y 13 del
# verificador NO se habían ejecutado nunca en ninguna máquina salvo la del
# usuario: el flujo de CI corría nueve controles sueltos, no el verificador. El
# resultado fue previsible —un fallo de portabilidad BSD/GNU en el paso 12 que
# llevaba meses ahí y que nadie podía ver, porque en el único sitio donde corría
# el paso era en macOS y en el único sitio donde había CI no corría el paso—.
#
# Para cerrar eso hace falta una base en el runner, y que se levante IGUAL en
# las dos plataformas. Este guion lo hace sin depender de `systemctl`, de
# `brew services` ni de que el runner traiga un clúster ya iniciado: crea uno
# nuevo en un directorio propio, lo arranca y lo deja escuchando por los DOS
# caminos que el repositorio usa.
#
#   · SOCKET de dominio Unix en $PGHOST  — lo que usan los guiones de
#     `supabase/policies/tests/`, que invocan `psql` con las variables PG*.
#   · TCP en 127.0.0.1:$PGPORT           — lo que usa `DATABASE_URL_PRUEBAS`,
#     porque `pg` y `new URL()` necesitan un host, no una ruta.
#
# Uso:
#   eval "$(./scripts/base-de-pruebas.sh arrancar)"   # exporta las variables
#   ./scripts/base-de-pruebas.sh parar
#
# NO es para producción ni para datos reales: `trust` local, sin contraseña, en
# un directorio temporal que se borra. Nada que salga de aquí viaja a ningún
# sitio.
# =============================================================================
set -euo pipefail

BASE_DIR="${NCR_PGDATA:-/var/tmp/ncr/data}"
SOCK_DIR="${NCR_PGSOCK:-/var/tmp/ncr/sock}"
PUERTO="${NCR_PGPORT:-55432}"
BASE="${NCR_PGDATABASE:-ncr}"
SUPERUSUARIO="${NCR_PGUSER:-postgres}"
BITACORA="${BASE_DIR%/data}/postgres.log"

# ---------------------------------------------------------------------------
# Localizar los binarios. `pg_ctl` no está en el PATH ni en Debian —vive en
# /usr/lib/postgresql/NN/bin— ni en macOS con Homebrew. Buscarlo aquí evita el
# «command not found» a mitad de una corrida de cuarenta minutos.
# ---------------------------------------------------------------------------
localizar_bin() {
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return 0
  fi
  # Se recorren de mayor a menor versión sin `sort -V`, que no existe en BSD:
  # el orden lo da el glob y se queda la última coincidencia, que para
  # `postgresql@NN` y `/NN/bin` es la más alta mientras sean de un solo dígito
  # o de dos consistentes. Es suficiente: cualquiera de las presentes sirve.
  local elegido=""
  local d
  for d in /usr/lib/postgresql/*/bin \
           /opt/homebrew/opt/postgresql@*/bin \
           /usr/local/opt/postgresql@*/bin \
           /opt/homebrew/opt/libpq/bin \
           /usr/local/opt/libpq/bin; do
    [[ -x "$d/pg_ctl" ]] && elegido="$d"
  done
  [[ -n "$elegido" ]] && printf '%s\n' "$elegido" && return 0
  return 1
}

# ---------------------------------------------------------------------------
# PostgreSQL se niega a arrancar como root, y con razón. Los runners de GitHub
# corren como `runner`, así que allí esto no se usa nunca; en un contenedor de
# desarrollo que sí es root, sin esto el guion es inservible y la única forma de
# probarlo sería en CI — que es exactamente el modo de fallo que esta ronda
# corrige. Se baja de privilegio y se vuelve a entrar.
# ---------------------------------------------------------------------------
bajar_privilegio_si_root() {
  [[ "$(id -u)" -eq 0 ]] || return 0
  local duenno="${NCR_PG_USUARIO_SO:-postgres}"
  if ! id "$duenno" >/dev/null 2>&1; then
    echo "FALLO PostgreSQL no arranca como root y no existe el usuario '$duenno'." >&2
    echo "  Cree uno, o exporte NCR_PG_USUARIO_SO con uno que sí exista." >&2
    exit 1
  fi
  mkdir -p "$SOCK_DIR" "$(dirname "$BASE_DIR")"
  chown -R "$duenno" "$SOCK_DIR" "$(dirname "$BASE_DIR")"
  local orden
  orden="$(printf '%q ' "$0" "$@")"
  exec su -s /bin/bash "$duenno" -c "$orden"
}

arrancar() {
  local bin
  if ! bin="$(localizar_bin)"; then
    echo "FALLO no encuentro pg_ctl. Instale PostgreSQL antes de pedir --con-base." >&2
    echo "  Debian/Ubuntu: viene en la imagen, en /usr/lib/postgresql/NN/bin" >&2
    echo "  macOS:         brew install postgresql@16" >&2
    exit 1
  fi

  mkdir -p "$SOCK_DIR" "$(dirname "$BASE_DIR")"

  # Si ya hay un clúster vivo en este directorio, se reutiliza: repetir el paso
  # no puede costar un `initdb` entero ni, peor, fallar por estar ya arrancado.
  if "$bin/pg_ctl" -D "$BASE_DIR" status >/dev/null 2>&1; then
    emitir_variables
    return 0
  fi

  if [[ ! -s "$BASE_DIR/PG_VERSION" ]]; then
    rm -rf "$BASE_DIR"
    "$bin/initdb" -D "$BASE_DIR" -U "$SUPERUSUARIO" --auth=trust --encoding=UTF8 \
      --locale=C >/dev/null
  fi

  # `-k` da el socket, `-h 127.0.0.1` el TCP: los dos caminos, un solo servidor.
  #
  # ═══════════════════════════════════════════════════════════════════════════
  # `max_connections` NO PUEDE QUEDARSE EN EL VALOR POR OMISIÓN
  #
  # PostgreSQL trae 100, y de ésas reserva unas cuantas para el superusuario.
  # La prueba de KPI-03 abre **cien conexiones de verdad** —es el requisito, no
  # un detalle: cien promesas sobre una sola conexión no prueban la restricción
  # de la base (ADR-04)—, y vitest ejecuta los ficheros en paralelo, así que a
  # la vez hay otros cinco con su propio `Pool` contra esta misma base.
  #
  # El resultado era una roja INTERMITENTE, que es la peor clase: la corrida 1
  # de 3 del paso de estabilidad moría con `sorry, too many clients already` y
  # las otras dos pasaban, de modo que el veredicto dependía de cómo el
  # planificador hubiera repartido los ficheros ese día. Se vio en el CI de
  # macOS el 22/09/2026.
  #
  # 300 es holgado y no cuesta nada: un proceso de PostgreSQL sólo se crea
  # cuando alguien se conecta. Subirlo aquí es lo correcto y no tocar la
  # prueba: reducir sus conexiones sería dejar de comprobar KPI-03.
  # ═══════════════════════════════════════════════════════════════════════════
  "$bin/pg_ctl" -D "$BASE_DIR" -l "$BITACORA" -w -o \
    "-k $SOCK_DIR -p $PUERTO -h 127.0.0.1 -c fsync=off -c synchronous_commit=off -c max_connections=300" \
    start >/dev/null

  # `createdb` falla si ya existe; se pregunta primero, y la respuesta se
  # compara como NÚMERO (D-103: `psql` alinea la columna sin `-A`).
  local existe
  existe="$("$bin/psql" -Atq -h "$SOCK_DIR" -p "$PUERTO" -U "$SUPERUSUARIO" -d postgres \
    -c "SELECT count(*) FROM pg_database WHERE datname='${BASE}';" | tr -d '[:space:]')"
  if ! [[ "$existe" =~ ^[0-9]+$ ]]; then
    echo "FALLO el servidor arrancó y no contesta (ver $BITACORA)" >&2
    exit 1
  fi
  if [[ "$existe" -eq 0 ]]; then
    "$bin/createdb" -h "$SOCK_DIR" -p "$PUERTO" -U "$SUPERUSUARIO" "$BASE"
  fi

  emitir_variables
}

# Se emiten como `export` para consumirlas con `eval` o volcarlas a $GITHUB_ENV.
emitir_variables() {
  printf 'export PGHOST=%s\n' "$SOCK_DIR"
  printf 'export PGPORT=%s\n' "$PUERTO"
  printf 'export PGUSER=%s\n' "$SUPERUSUARIO"
  printf 'export PGDATABASE=%s\n' "$BASE"
  printf 'export DATABASE_URL_PRUEBAS=postgresql://%s@127.0.0.1:%s/%s\n' \
    "$SUPERUSUARIO" "$PUERTO" "$BASE"
}

parar() {
  local bin
  bin="$(localizar_bin)" || return 0
  "$bin/pg_ctl" -D "$BASE_DIR" -m immediate stop >/dev/null 2>&1 || true
}

case "${1:-arrancar}" in
  arrancar)
    bajar_privilegio_si_root "$@"
    arrancar
    ;;
  parar)
    bajar_privilegio_si_root "$@"
    parar
    ;;
  variables) emitir_variables ;;
  *)
    echo "uso: $0 [arrancar|parar|variables]" >&2
    exit 2
    ;;
esac
