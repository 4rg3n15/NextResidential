#!/usr/bin/env bash
# Escaneo de secretos. Se ejecuta en pre-commit y en `pnpm verificar`.
# Busca VALORES, no nombres: `SUPABASE_SECRET_KEY=` en un .env.example es
# correcto; `SUPABASE_SECRET_KEY=sb_secret_abc` no lo es.
set -euo pipefail
cd "$(dirname "$0")/.."

PATRONES=(
  'sb_secret_[A-Za-z0-9_-]{8,}'
  'sb_publishable_[A-Za-z0-9_-]{8,}'
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'          # JWT
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  '(password|passwd|contrasena)\s*[:=]\s*['"'"'"][^'"'"'"<]{6,}'
  'postgres(ql)?://[^:]+:[^@<]{6,}@'                    # cadena con contraseña
  '[Aa][Pp][Ii]_?[Kk][Ee][Yy]\s*[:=]\s*['"'"'"][A-Za-z0-9_-]{16,}'
)

objetivo=$(git ls-files | grep -vE '^(pnpm-lock.yaml|scripts/escanear-secretos.sh)$' || true)
[ -z "$objetivo" ] && { echo "sin archivos versionados que escanear"; exit 0; }

hallazgos=0
for p in "${PATRONES[@]}"; do
  if salida=$(printf '%s\n' "$objetivo" | xargs -r grep -nEI "$p" 2>/dev/null); then
    echo "POSIBLE SECRETO ($p):"; echo "$salida" | head -5; hallazgos=1
  fi
done

if [ "$hallazgos" -ne 0 ]; then
  echo
  echo "Commit detenido: §2.5 prohibe cualquier secreto en el repositorio."
  exit 1
fi
echo "escaneo de secretos: limpio"
