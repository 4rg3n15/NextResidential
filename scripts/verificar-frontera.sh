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

echo "2 · la aplicación no arranca sin configuración completa"
if [ ! -f apps/api/dist/main.js ]; then
  echo "   (compilando)"; pnpm --filter @ncr/api build >/dev/null 2>&1
fi
salida=$(env -i PATH="$PATH" NODE_ENV=test node apps/api/dist/main.js 2>&1 || true)
codigo=$(env -i PATH="$PATH" NODE_ENV=test node apps/api/dist/main.js >/dev/null 2>&1; echo $?)
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

[ "$fallos" -eq 0 ] && echo "DoD ETAPA 02: verificado" || echo "DoD ETAPA 02: INCUMPLIDO"
exit $fallos
