#!/usr/bin/env bash
# DoD de la ETAPA 02, comprobado por EJECUCIÓN y no por afirmación.
#
#   1. Un intento deliberado de importar Supabase desde `domain/` rompe el build.
#   2. La aplicación no arranca sin `.env` completo.
#
# La prueba 1 es de mutación: introduce la violación, exige que el linter la
# detecte, y restaura. Una regla de frontera que nadie ha visto fallar no está
# demostrada — es la misma lección de la ETAPA 01.
set -uo pipefail
cd "$(dirname "$0")/.."
fallos=0
SONDA=packages/domain-core/src/__sonda-frontera.ts
limpiar() { rm -f "$SONDA"; }
trap limpiar EXIT

echo "1 · el dominio no puede importar infraestructura"
for modulo in '@supabase/supabase-js' '@nestjs/common' 'axios' 'pg'; do
  printf "import x from '%s';\nexport const y = x;\n" "$modulo" > "$SONDA"
  if pnpm exec eslint "$SONDA" >/dev/null 2>&1; then
    echo "   ✗ el linter ACEPTÓ '$modulo' en el dominio"; fallos=1
  else
    echo "   ✓ '$modulo' rechazado"
  fi
done

printf "export const cuando = () => new Date();\n" > "$SONDA"
if pnpm exec eslint "$SONDA" >/dev/null 2>&1; then
  echo "   ✗ el linter ACEPTÓ new Date() en el dominio"; fallos=1
else
  echo "   ✓ new Date() rechazado (§2.4, reloj inyectado)"
fi

printf "export const f = (x: any) => x;\n" > "$SONDA"
if pnpm exec eslint "$SONDA" >/dev/null 2>&1; then
  echo "   ✗ el linter ACEPTÓ \`any\`"; fallos=1
else
  echo "   ✓ \`any\` rechazado (§2.4)"
fi
limpiar

echo "2 · KPI-11 · el protocolo del fabricante no sale de packages/providers"
if node scripts/lib/frontera-hardware.mjs; then
  :
else
  echo "   ✗ el protocolo del fabricante se escapó del paquete"; fallos=1
fi

echo "3 · la aplicación no arranca sin configuración completa"
if [ ! -f apps/api/dist/main.js ]; then
  echo "   (compilando)"; pnpm --filter @ncr/api build >/dev/null 2>&1
fi
# `NCR_IGNORAR_ENV_FILE=1` hace la sonda determinista: sin él, en un equipo con
# `apps/api/.env` completo la API ARRANCA y se queda escuchando, y el guion no
# devuelve el control nunca. Era el cuelgue reportado en macOS.
# El límite de tiempo es la red por si algún día vuelve a no terminar.
sonda_arranque() {
  env -i PATH="$PATH" NODE_ENV=test NCR_IGNORAR_ENV_FILE=1 \
    node scripts/lib/con-limite.mjs 30 node apps/api/dist/main.js 2>&1
}
salida=$(sonda_arranque || true)
sonda_arranque >/dev/null 2>&1; codigo=$?
if [ "$codigo" -eq 78 ] && echo "$salida" | grep -q "no arranca"; then
  echo "   ✓ arranque abortado con EX_CONFIG (78) y motivo explícito"
else
  echo "   ✗ arrancó o falló por otra razón (código $codigo)"; echo "$salida" | head -3; fallos=1
fi
if echo "$salida" | grep -qiE "sb_secret|eyJ|postgres(ql)?://[^:]+:[^@]"; then
  echo "   ✗ el mensaje de arranque fallido filtró un valor sensible"; fallos=1
else
  echo "   ✓ el fallo de arranque no filtra valores"
fi

# ADR-005 · ninguna clave ajena VIGENTE hacia una tabla append-only. La
# comprobación de la clave ajena exige un bloqueo de fila que la revocación de
# UPDATE/DELETE impide, así que la fila no se podría insertar jamás. Se añade en
# la ETAPA 06, que fue la primera en insertar eventos y destaparlo.
if salida=$(node scripts/lib/frontera-append-only.mjs 2>&1); then
  echo "   ✓ $salida"
else
  echo "   ✗ clave ajena vigente hacia una tabla append-only"; echo "$salida" | sed 's/^/     /'; fallos=1
fi

[ "$fallos" -eq 0 ] && echo "DoD ETAPA 02: verificado" || echo "DoD ETAPA 02: INCUMPLIDO"
exit $fallos
