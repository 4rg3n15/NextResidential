-- =============================================================================
-- 0036 · ETAPA 15-E · PERSISTENCIA OPERATIVA Y RESPUESTA DEL TITULAR
--
-- Tres cosas que la prueba en sitio necesita y que vivian en memoria o no
-- tenian sitio donde vivir (D-139):
--
--  1. Las ALERTAS que nacen en la consola (aviso al residente HU-28, emergencia
--     HU-29) no tienen evento ni equipo detras: su origen es un operador. La
--     tabla exigia uno u otro, y ademas una clave ajena a `dispositivos` que
--     `eventos.dispositivo_id` nunca tuvo. Se relaja la CHECK para ese caso y
--     se guarda el origen textual; la clave ajena se retira por coherencia con
--     eventos (un equipo de entorno, BARRERA_*, no esta en el registro).
--  2. Las ORDENES MANUALES de porteria y guardia (RN-08, CA-16, CA-17) no
--     tenian tabla: el historial se perdia al reiniciar la API. Se crea, con
--     RLS forzada, auditoria y sin borrado.
--  3. La RESPUESTA DEL TITULAR por su enlace (RN-10) deja constancia en
--     `auditoria_seguridad`: version de la politica, momento y origen.
-- =============================================================================

-- 1 · tipo de evento de seguridad para la respuesta del titular -----------------
ALTER TYPE public.tipo_evento_seguridad ADD VALUE IF NOT EXISTS 'respuesta_de_titular';

-- 2 · alertas nacidas en la consola ---------------------------------------------
ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_dispositivo_fk;
ALTER TABLE public.alertas ADD COLUMN IF NOT EXISTS origen_texto text NULL;
ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_origen;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_origen CHECK (
  evento_id IS NOT NULL OR dispositivo_id IS NOT NULL OR origen_texto IS NOT NULL);
ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_origen_texto_len;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_origen_texto_len
  CHECK (origen_texto IS NULL OR length(origen_texto) BETWEEN 1 AND 120);
COMMENT ON COLUMN public.alertas.origen_texto IS
  'Origen que no es un equipo registrado ni un evento: la consola de guardia o '
  'una vivienda avisada (HU-28, HU-29). Migracion 0036.';

-- 3 · ordenes manuales ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ordenes_manuales (
  id               uuid PRIMARY KEY,
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  accion           text NOT NULL CHECK (accion IN ('abrir','negar')),
  motivo           text NOT NULL CHECK (length(motivo) BETWEEN 1 AND 500),
  operador_id      uuid NOT NULL REFERENCES public.usuarios(id),
  rol              text NOT NULL
    CHECK (rol IN ('portero','operador_central','administrador','superadministrador')),
  -- Sin clave ajena, como eventos.dispositivo_id: el equipo de entorno
  -- (BARRERA_*) no esta en el registro y sigue siendo accionable.
  dispositivo_id   uuid NOT NULL,
  momento          timestamptz NOT NULL,
  evento_id        uuid NULL,
  resultado        text NULL CHECK (resultado IS NULL OR resultado IN ('aceptada','rechazada','inalcanzable')),
  detalle          text NULL CHECK (detalle IS NULL OR length(detalle) <= 500),

  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id)
);
COMMENT ON TABLE public.ordenes_manuales IS
  'Ordenes de apertura o negacion dadas a mano por porteria o guardia virtual, '
  'con su motivo obligatorio (RN-08) y el desenlace que contesto el equipo. '
  'Sin borrado: es rastro de auditoria. Migracion 0036.';
CREATE INDEX IF NOT EXISTS ordenes_manuales_recientes_idx
  ON public.ordenes_manuales (copropiedad_id, momento DESC);

ALTER TABLE public.ordenes_manuales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_manuales FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.ordenes_manuales TO authenticated, service_role;
REVOKE DELETE ON public.ordenes_manuales FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS ordenes_manuales_lectura   ON public.ordenes_manuales;
DROP POLICY IF EXISTS ordenes_manuales_insercion ON public.ordenes_manuales;
DROP POLICY IF EXISTS ordenes_manuales_edicion   ON public.ordenes_manuales;
CREATE POLICY ordenes_manuales_lectura ON public.ordenes_manuales FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id) OR app.es_servicio(copropiedad_id));
CREATE POLICY ordenes_manuales_insercion ON public.ordenes_manuales FOR INSERT
  WITH CHECK (app.puede_leer_operacion(copropiedad_id) OR app.es_servicio(copropiedad_id));
CREATE POLICY ordenes_manuales_edicion ON public.ordenes_manuales FOR UPDATE
  USING (app.puede_leer_operacion(copropiedad_id) OR app.es_servicio(copropiedad_id))
  WITH CHECK (app.puede_leer_operacion(copropiedad_id) OR app.es_servicio(copropiedad_id));

DROP TRIGGER IF EXISTS tg_auditoria ON public.ordenes_manuales;
CREATE TRIGGER tg_auditoria BEFORE INSERT OR UPDATE ON public.ordenes_manuales
  FOR EACH ROW EXECUTE FUNCTION app.tg_auditoria();
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.ordenes_manuales;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.ordenes_manuales
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();

-- 4 · aserciones ----------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname = 'alertas_dispositivo_fk' AND conrelid = 'public.alertas'::regclass;
  ASSERT n = 0, '0036: alertas_dispositivo_fk sigue presente';
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname = 'alertas_origen' AND conrelid = 'public.alertas'::regclass
     AND pg_get_constraintdef(oid) LIKE '%origen_texto%';
  ASSERT n = 1, '0036: alertas_origen no admite el origen textual';
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public' AND c.relname = 'ordenes_manuales'
     AND c.relrowsecurity AND c.relforcerowsecurity;
  ASSERT n = 1, '0036: ordenes_manuales sin RLS forzada';
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'ordenes_manuales';
  ASSERT n = 3, format('0036: ordenes_manuales tiene %s politicas, no 3', n);
  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'ordenes_manuales' AND t.tgname IN ('tg_auditoria','tg_prohibir_delete')
     AND t.tgenabled <> 'D';
  ASSERT n = 2, '0036: ordenes_manuales sin sus dos disparadores';
  SELECT count(*) INTO n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'tipo_evento_seguridad' AND e.enumlabel = 'respuesta_de_titular';
  ASSERT n = 1, '0036: falta el tipo respuesta_de_titular';
END
$$;
