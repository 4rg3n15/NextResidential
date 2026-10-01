-- =============================================================================
-- 0047 · ETAPA 15-P · P2 · LAS CONVERSACIONES DE LA GUARDIA, AUDITADAS
--
-- El audio de la guardia virtual viaja por un canal ordenado entre la consola
-- y la API (ADR-01, enmienda 15-P). Cada conversación deja UNA fila al
-- terminar: quién habló (el operador, atribuido), con qué equipo, en qué
-- copropiedad, cuándo empezó y acabó, por qué se cerró y los TRAMOS en que el
-- operador tuvo pulsado «hablar». Nunca el audio: no hay columna para él.
--
-- Solo inserción, con las tres capas de `eventos` (ADR-005): REVOKE a todos
-- —dueño incluido—, disparadores que bloquean UPDATE y DELETE y RLS forzada
-- sin política de UPDATE ni DELETE.
--
-- Sin clave ajena en `dispositivo_id`, como `ordenes_manuales`: con el
-- proveedor simulado la conversación puede ser con un equipo que no está en el
-- registro, y el rastro no puede depender de eso.
--
-- Idempotente. Reversión: supabase/reversion/0047_revert.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.conversaciones_de_guardia (
  id                uuid PRIMARY KEY,
  copropiedad_id    uuid NOT NULL REFERENCES public.copropiedades(id),
  dispositivo_id    uuid NOT NULL,
  operador_id       uuid NOT NULL REFERENCES public.usuarios(id),
  iniciada_en       timestamptz NOT NULL,
  terminada_en      timestamptz NOT NULL,
  -- [{ "desde": "…", "hasta": "…" }]: los instantes en que hubo micrófono.
  tramos            jsonb NOT NULL DEFAULT '[]'::jsonb,
  segundos_hablados numeric(10,1) NOT NULL DEFAULT 0,
  motivo_de_cierre  text NOT NULL,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  creado_por        uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT conversacion_orden CHECK (terminada_en >= iniciada_en),
  CONSTRAINT conversacion_tramos_arreglo CHECK (
    jsonb_typeof(tramos) = 'array' AND jsonb_array_length(tramos) <= 1000),
  CONSTRAINT conversacion_segundos CHECK (segundos_hablados >= 0),
  CONSTRAINT conversacion_motivo_len CHECK (length(motivo_de_cierre) BETWEEN 1 AND 200),
  CONSTRAINT conversacion_motivo_sin_control CHECK (
    motivo_de_cierre !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]')
);

CREATE INDEX IF NOT EXISTS conversaciones_recientes_idx
  ON public.conversaciones_de_guardia (copropiedad_id, iniciada_en DESC);
CREATE INDEX IF NOT EXISTS conversaciones_por_equipo_idx
  ON public.conversaciones_de_guardia (copropiedad_id, dispositivo_id, iniciada_en DESC);

COMMENT ON TABLE public.conversaciones_de_guardia IS
  'ETAPA 15-P · una fila por conversación de audio de la guardia: operador, equipo, '
  'copropiedad, inicio, fin, motivo de cierre y tramos hablados. Nunca el audio. '
  'Solo inserción (ADR-005). Migración 0047.';

-- Solo inserción: disparadores ---------------------------------------------------
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.conversaciones_de_guardia;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.conversaciones_de_guardia
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();
DROP TRIGGER IF EXISTS tg_prohibir_update ON public.conversaciones_de_guardia;
CREATE TRIGGER tg_prohibir_update BEFORE UPDATE ON public.conversaciones_de_guardia
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_update();
ALTER TABLE public.conversaciones_de_guardia ENABLE ALWAYS TRIGGER tg_prohibir_update;
ALTER TABLE public.conversaciones_de_guardia ENABLE ALWAYS TRIGGER tg_prohibir_delete;

-- Privilegios: SELECT e INSERT, y nada más, para nadie ---------------------------
GRANT SELECT, INSERT ON public.conversaciones_de_guardia TO authenticated, service_role;
REVOKE ALL ON public.conversaciones_de_guardia FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.conversaciones_de_guardia
  FROM PUBLIC, authenticated, service_role;
DO $$
DECLARE v_dueno text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_mantenimiento') THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON public.conversaciones_de_guardia FROM app_mantenimiento';
  END IF;
  SELECT pg_get_userbyid(c.relowner) INTO v_dueno
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'conversaciones_de_guardia';
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.conversaciones_de_guardia FROM %I', v_dueno);
END
$$;

-- RLS forzada ----------------------------------------------------------------------
ALTER TABLE public.conversaciones_de_guardia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversaciones_de_guardia FORCE ROW LEVEL SECURITY;

-- Lectura: quien opera o administra la copropiedad, y el servicio. Escritura:
-- SÓLO el servicio de la API, que es quien vio la conversación entera; nadie
-- escribe a mano el rastro de lo que dijo.
DROP POLICY IF EXISTS conversaciones_lectura   ON public.conversaciones_de_guardia;
DROP POLICY IF EXISTS conversaciones_insercion ON public.conversaciones_de_guardia;
CREATE POLICY conversaciones_lectura ON public.conversaciones_de_guardia FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id) OR app.es_servicio(copropiedad_id));
CREATE POLICY conversaciones_insercion ON public.conversaciones_de_guardia FOR INSERT
  WITH CHECK (app.es_servicio(copropiedad_id));
