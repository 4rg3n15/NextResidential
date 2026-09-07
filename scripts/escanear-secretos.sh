#!/usr/bin/env bash
# Punto de entrada estable (lo invocan husky y la documentación).
# La lógica vive en Node: ver el encabezado de scripts/lib/escanear-secretos.mjs.
set -euo pipefail
exec node "$(cd "$(dirname "$0")" && pwd)/lib/escanear-secretos.mjs" "$@"
