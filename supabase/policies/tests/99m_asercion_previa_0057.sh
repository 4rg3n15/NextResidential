#!/usr/bin/env bash
# =============================================================================
# 99m · LA ASERCIÓN PREVIA DE LA 0057 · RONDA 15-X · ADR-039
#
# La 0057 se niega a crear `plantillas_residente_viva_uk` si alguna persona
# tiene ya dos o más plantillas vivas sin autorización, y las nombra: cuál
# sobra lo decide quien opera, no la migración.
#
# Se prueba con el FICHERO de la migración, no con una copia de su consulta.
# En una transacción que se deshace al salir, y sin el índice:
#   1 · con DOS rostros vivos de la misma persona, la 0057 se detiene con su
#       mensaje y el identificador de la persona;
#   2 · con UNO solo, la 0057 se aplica entera (es idempotente) y el índice
#       vuelve a estar.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/../../.."

PGHOST="${PGHOST:-/var/tmp/ncr/sock}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
PGDATABASE="${PGDATABASE:-ncr}"
export PGHOST PGPORT PGUSER PGDATABASE
export PGOPTIONS="-c client_min_messages=warning"

MIGRACION='supabase/migrations/20261008120000_0057_rostro_del_residente.sql'
COP='10000000-0000-4000-8000-000000000001'
PERSONA='9f000000-0000-4000-8000-00000000a0f1'
CONSENTIMIENTO='9f000000-0000-4000-8000-00000000a0c1'
ACTOR='00000000-0000-4000-8000-000000000003'

# Lo común: sin el índice, una persona con su consentimiento y un rostro vivo.
preparar() {
  cat <<SQL
BEGIN;
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"${ACTOR}","copropiedad_id":"${COP}","copropiedades":["${COP}"]}';
DROP INDEX public.plantillas_residente_viva_uk;
INSERT INTO public.personas (id, copropiedad_id, tipo_documento, numero_documento, nombre_completo,
                             creado_por, actualizado_por)
VALUES ('${PERSONA}', '${COP}', 'cedula', '99200091', 'Asercion Previa Prueba', '${ACTOR}', '${ACTOR}');
INSERT INTO public.consentimientos_biometricos (id, copropiedad_id, persona_id, version_politica,
       canal, estado, otorgado_en, creado_por, actualizado_por)
VALUES ('${CONSENTIMIENTO}', '${COP}', '${PERSONA}', 'v1.0', 'app', 'vigente', now(), '${ACTOR}', '${ACTOR}');
INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id, calidad,
       vector_cifrado, llave_ref, algoritmo, suprimir_en, estado, creado_por, actualizado_por)
VALUES ('${COP}', '${PERSONA}', '${CONSENTIMIENTO}', 0.9, '\x01'::bytea, 'vault:ncr/plantillas/v1',
        'AES-256-GCM', now() + interval '365 days', 'activa', '${ACTOR}', '${ACTOR}');
SQL
}

segundo_rostro() {
  cat <<SQL
INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id, calidad,
       vector_cifrado, llave_ref, algoritmo, suprimir_en, estado, creado_por, actualizado_por)
VALUES ('${COP}', '${PERSONA}', '${CONSENTIMIENTO}', 0.9, '\x02'::bytea, 'vault:ncr/plantillas/v1',
        'AES-256-GCM', now() + interval '365 days', 'pendiente_sincronizacion', '${ACTOR}', '${ACTOR}');
SQL
}

fallos=0

# 1 · dos rostros vivos: la 0057 se detiene y nombra a la persona.
salida=$({ preparar; segundo_rostro; echo "\\i ${MIGRACION}"; } | psql -v ON_ERROR_STOP=1 -q 2>&1)
codigo=$?
if [[ $codigo -eq 0 ]]; then
  echo "  FALLO: la 0057 se aplicó con dos rostros vivos de la misma persona" >&2
  fallos=1
elif ! printf '%s' "$salida" | grep -q "más de una plantilla viva de residente"; then
  echo "  FALLO: la 0057 falló, pero no por su aserción previa:" >&2
  printf '%s\n' "$salida" >&2
  fallos=1
elif ! printf '%s' "$salida" | grep -q "${PERSONA}"; then
  echo "  FALLO: la aserción no nombra a la persona" >&2
  fallos=1
else
  echo "  dos rostros vivos: la 0057 se detiene y nombra a la persona"
fi

# 2 · uno solo: la 0057 entra entera y el índice vuelve.
salida=$({ preparar; echo "\\i ${MIGRACION}"; echo "SELECT 'indice:' || count(*) FROM pg_indexes WHERE indexname = 'plantillas_residente_viva_uk';"; } \
  | psql -v ON_ERROR_STOP=1 -Atq 2>&1)
codigo=$?
if [[ $codigo -ne 0 ]] || ! printf '%s' "$salida" | grep -q '^indice:1$'; then
  echo "  FALLO: con un solo rostro vivo la 0057 no se aplicó, o sin el índice:" >&2
  printf '%s\n' "$salida" >&2
  fallos=1
else
  echo "  un solo rostro vivo: la 0057 entra y crea el índice"
fi

exit "$fallos"
