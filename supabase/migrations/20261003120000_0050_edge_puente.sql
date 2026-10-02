-- =============================================================================
-- 0050 · RONDA 15-Q2 · EL EDGE ES EL PUENTE LOCAL PERMANENTE (ADR-035, P-27 = A)
--
-- Tres cosas, y ninguna abre nada que antes estuviera cerrado:
--
--  1. QUÉ COPROPIEDAD VA POR SU EDGE. `edge_gateways.puente`: la API enruta
--     las órdenes de los equipos de una copropiedad por el túnel de su Edge
--     SÓLO si ese Edge está marcado como puente. No basta con que exista un
--     gateway: la semilla da a MIRA uno desde la ETAPA 01, y tomarlo como
--     «puente» habría cambiado el camino de todas las regresiones (R1).
--     Uno por copropiedad, por índice único parcial (ADR-04): dos puentes no
--     es una situación que el código tenga que resolver, es una que no existe.
--
--  2. EL SEGUNDO EDGE SE AUDITA. Un tipo nuevo en `auditoria_seguridad`: un
--     túnel rechazado porque ya hay otro abierto para esa copropiedad, o
--     porque quien llama no es su puente (A1, resultado 409).
--
--  3. LA CREDENCIAL QUE SE MUDA AL EDGE NO DEJA RASTRO CIFRADO EN LA NUBE
--     (D1-D3, H-15B-1). `dispositivos.credencial_ref` admite `edge:<gateway>`
--     y guarda una HUELLA no reversible; la fila de `credenciales_de_equipo`
--     no se borra (no hay borrado físico, RN-19) pero sus BYTES sí: una fila
--     trasladada no tiene iv, cuerpo ni etiqueta, y una no trasladada los tiene
--     todos. Lo dice un CHECK, no el código.
--
-- Idempotente. Reversión: supabase/reversion/0050_revert.sql.
-- =============================================================================

-- 1 · El puente ---------------------------------------------------------------
ALTER TABLE public.edge_gateways ADD COLUMN IF NOT EXISTS puente boolean NOT NULL DEFAULT false;
ALTER TABLE public.edge_gateways ADD COLUMN IF NOT EXISTS puente_desde timestamptz NULL;

ALTER TABLE public.edge_gateways DROP CONSTRAINT IF EXISTS edge_puente_coherente;
ALTER TABLE public.edge_gateways ADD CONSTRAINT edge_puente_coherente
  CHECK (puente = (puente_desde IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS edge_un_puente_por_copropiedad
  ON public.edge_gateways (copropiedad_id) WHERE puente AND estado = 'activo';

COMMENT ON COLUMN public.edge_gateways.puente IS
  '15-Q2 (ADR-035) · los equipos de la copropiedad se operan por el tunel de este Edge.';

-- 2 · La auditoría del túnel ---------------------------------------------------
ALTER TYPE public.tipo_evento_seguridad ADD VALUE IF NOT EXISTS 'tunel_edge_rechazado';

-- 3 · La credencial que vive en el Edge ---------------------------------------
ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_credencial_es_referencia;
ALTER TABLE public.dispositivos ADD CONSTRAINT dispositivos_credencial_es_referencia
  CHECK (credencial_ref ~ '^((env|vault):[A-Za-z0-9_./-]+|edge:[0-9a-f-]{36})$');

ALTER TABLE public.dispositivos ADD COLUMN IF NOT EXISTS huella_de_credencial text NULL;
ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_huella_es_hmac;
ALTER TABLE public.dispositivos ADD CONSTRAINT dispositivos_huella_es_hmac
  CHECK (huella_de_credencial IS NULL OR huella_de_credencial ~ '^[0-9a-f]{64}$');

COMMENT ON COLUMN public.dispositivos.huella_de_credencial IS
  '15-Q2 · HMAC de la credencial que guarda el Edge: dice si cambio, nunca cual es.';

ALTER TABLE public.credenciales_de_equipo ADD COLUMN IF NOT EXISTS trasladada_al_edge uuid NULL
  REFERENCES public.edge_gateways(id);
ALTER TABLE public.credenciales_de_equipo ADD COLUMN IF NOT EXISTS trasladada_en timestamptz NULL;
ALTER TABLE public.credenciales_de_equipo ALTER COLUMN iv DROP NOT NULL;
ALTER TABLE public.credenciales_de_equipo ALTER COLUMN cuerpo DROP NOT NULL;
ALTER TABLE public.credenciales_de_equipo ALTER COLUMN etiqueta DROP NOT NULL;

ALTER TABLE public.credenciales_de_equipo DROP CONSTRAINT IF EXISTS credenciales_equipo_traslado;
ALTER TABLE public.credenciales_de_equipo ADD CONSTRAINT credenciales_equipo_traslado CHECK (
  (trasladada_en IS NULL AND trasladada_al_edge IS NULL
     AND iv IS NOT NULL AND cuerpo IS NOT NULL AND etiqueta IS NOT NULL)
  OR (trasladada_en IS NOT NULL AND trasladada_al_edge IS NOT NULL
     AND iv IS NULL AND cuerpo IS NULL AND etiqueta IS NULL AND estado = 'inactivo'));

COMMENT ON COLUMN public.credenciales_de_equipo.trasladada_al_edge IS
  '15-Q2 (D3) · el Edge que confirmo que se autentica con ella; desde entonces la nube no la tiene.';

-- 4 · Aserciones de despliegue -------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname = 'public' AND indexname = 'edge_un_puente_por_copropiedad') THEN
    RAISE EXCEPTION '0050: falta el indice de un puente por copropiedad (ADR-04)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credenciales_equipo_traslado') THEN
    RAISE EXCEPTION '0050: falta el CHECK que impide bytes en una credencial trasladada';
  END IF;
END
$$;
