# syntax=docker/dockerfile:1.7
# =============================================================================
# Imagen de la API (@ncr/api) para Cloud Run · D-154 (ADR-040)
#
#   docker build -f apps/api/Dockerfile --build-arg NODE_VERSION="$(cat .nvmrc)" .
#
# El contexto es la RAÍZ del monorepo: el lockfile y los paquetes internos
# (`domain-core`, `providers`) viven ahí. `.dockerignore`, también en la raíz,
# deja pasar SOLO lo que esta imagen necesita, y vuelve a excluir al final
# `.env*`, llaves y credenciales aunque alguien las deje dentro de `src/`.
#
# POR QUÉ `NODE_VERSION` NO TIENE VALOR POR OMISIÓN. La versión exacta vive en
# un único sitio, `.nvmrc`, que es la que la CI y el verificador comprueban
# (D-149). Un valor por omisión aquí sería una segunda copia, y la que envejece
# es siempre la que nadie mira. Sin el argumento, `FROM node:-alpine` no existe
# y la construcción falla en la primera línea. Además, la etapa de construcción
# compara `node -v` con `.nvmrc` y se niega si difieren.
# =============================================================================
ARG NODE_VERSION

# ─── 1 · construcción: dependencias completas y compilación ────────────────
FROM node:${NODE_VERSION}-alpine AS construccion
WORKDIR /repo
# pnpm en la versión EXACTA de `packageManager` (corepack la lee del manifiesto).
RUN corepack enable

# Primero los manifiestos y el lockfile: la capa de `pnpm fetch` sólo se
# rehace cuando cambian las dependencias, no con cada cambio de código.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .nvmrc tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/edge/package.json apps/edge/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain-core/package.json packages/domain-core/
COPY packages/providers/package.json packages/providers/

# El Node de la imagen ES el de `.nvmrc`, o no se construye.
RUN test "$(node -v)" = "v$(cat .nvmrc)" \
  || { echo "Node $(node -v) no es el de .nvmrc (v$(cat .nvmrc))" >&2; exit 1; }

# --frozen-lockfile: una dependencia que no esté en el lockfile rompe la
# construcción (§2.8.0). --ignore-scripts: el único `prepare` del árbol es el
# de husky, que en una imagen no tiene nada que instalar.
RUN pnpm fetch --frozen-lockfile --store-dir=/pnpm-store
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --store-dir=/pnpm-store \
  --filter "@ncr/api..." --filter "next-control-residencial"

COPY packages/domain-core/tsconfig.json packages/domain-core/
COPY packages/domain-core/src packages/domain-core/src
COPY packages/providers/tsconfig.json packages/providers/
COPY packages/providers/src packages/providers/src
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src

# `tsc -b` compila las referencias (domain-core, providers) antes que la API.
RUN pnpm --filter @ncr/api run build

# ─── 2 · producción: SOLO las dependencias de ejecución, del MISMO lockfile ──
#
# POR QUÉ NO `pnpm deploy`. En pnpm 9 (`packageManager`), `deploy` RESUELVE de
# nuevo las dependencias en vez de leer el lockfile: medido el 2026-11-06, pidió
# metadatos de versiones que el lockfile no fija. Una imagen que no instala lo
# que dice el lockfile no es reproducible (§2.8.0). Aquí se instala con
# `--frozen-lockfile --prod` sobre la misma estructura del monorepo, y los
# paquetes internos quedan enlazados como en desarrollo.
FROM node:${NODE_VERSION}-alpine AS produccion
WORKDIR /repo
RUN corepack enable
COPY --from=construccion /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
COPY --from=construccion /repo/apps/api/package.json apps/api/
COPY --from=construccion /repo/apps/web/package.json apps/web/
COPY --from=construccion /repo/apps/edge/package.json apps/edge/
COPY --from=construccion /repo/packages/config/package.json packages/config/
COPY --from=construccion /repo/packages/contracts/package.json packages/contracts/
COPY --from=construccion /repo/packages/domain-core/package.json packages/domain-core/
COPY --from=construccion /repo/packages/providers/package.json packages/providers/
# El almacén ya descargado en la etapa 1: aquí no se descarga nada (--offline).
COPY --from=construccion /pnpm-store /pnpm-store
RUN pnpm install --offline --frozen-lockfile --prod --ignore-scripts --store-dir=/pnpm-store \
    --filter "@ncr/api..."
COPY --from=construccion /repo/packages/domain-core/dist packages/domain-core/dist
COPY --from=construccion /repo/packages/providers/dist packages/providers/dist
COPY --from=construccion /repo/apps/api/dist apps/api/dist
# Los mapas de fuente y las declaraciones no se ejecutan: fuera de la imagen.
RUN find apps/api/dist packages/*/dist \( -name '*.map' -o -name '*.d.ts' -o -name '*.tsbuildinfo' \) -delete

# ─── 3 · ejecución: sin compilador, sin pnpm y sin root ──────────────────────
FROM node:${NODE_VERSION}-alpine AS ejecucion
ENV NODE_ENV=production \
    # La imagen nunca lee ficheros `.env`: la configuración llega del entorno
    # (Cloud Run: variables y Secret Manager). `main.ts` honra esta variable.
    NCR_IGNORAR_ENV_FILE=1 \
    PORT=8080
# La imagen base trae npm, corepack y yarn, que la API no usa en ejecución:
# fuera, por tamaño y por superficie.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
WORKDIR /app
# Los ficheros quedan de root y sólo legibles para `node`: el proceso no puede
# reescribir su propio código aunque alguien consiga ejecutar algo dentro.
COPY --from=produccion /repo/node_modules node_modules
COPY --from=produccion /repo/packages/domain-core packages/domain-core
COPY --from=produccion /repo/packages/providers packages/providers
COPY --from=produccion /repo/apps/api apps/api
WORKDIR /app/apps/api
USER node
EXPOSE 8080
# `node` es el proceso 1 y recibe SIGTERM directamente: `cierre-ordenado.ts`
# instala el manejador (Cloud Run da 10 s antes de SIGKILL).
CMD ["node", "dist/main.js"]
