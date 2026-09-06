-- =============================================================================
-- 0016 · Política de retención de datos
--
-- Resuelve el `PENDIENTE DE DEFINICIÓN` D-10 abierto en la ETAPA 01-B: el
-- documento de requisitos no fija retención en ninguna parte, y sin ella el
-- «principio de finalidad» de la Ley 1581 de 2012 queda sin plazo, que es tanto
-- como no tenerlo.
--
-- Decisión del cliente, 2026-09-06 · **sujeta a confirmación legal de Grupo
-- Control**:
--   · Eventos ................ 24 meses
--   · Evidencia fotográfica ... 90 días
--   · Plantillas biométricas .. ligadas a la vigencia de su autorización
--
-- Los tres plazos son COLUMNAS CONFIGURABLES por copropiedad, no constantes:
-- la retención puede variar por contrato o por exigencia de una autoridad, y
-- un plazo escondido en el código no se puede auditar ni ajustar sin desplegar.
-- =============================================================================

-- 1 · Plazos configurables ----------------------------------------------------
ALTER TABLE public.copropiedades
  ADD COLUMN IF NOT EXISTS retencion_eventos          interval NOT NULL DEFAULT '24 months',
  ADD COLUMN IF NOT EXISTS retencion_evidencia        interval NOT NULL DEFAULT '90 days',
  ADD COLUMN IF NOT EXISTS margen_supresion_plantilla interval NOT NULL DEFAULT '24 hours';

ALTER TABLE public.copropiedades
  DROP CONSTRAINT IF EXISTS copropiedades_retencion_eventos_positiva,
  ADD  CONSTRAINT copropiedades_retencion_eventos_positiva
       CHECK (retencion_eventos > interval '0');

ALTER TABLE public.copropiedades
  DROP CONSTRAINT IF EXISTS copropiedades_retencion_evidencia_positiva,
  ADD  CONSTRAINT copropiedades_retencion_evidencia_positiva
       CHECK (retencion_evidencia > interval '0');

-- La ley actúa como COTA SUPERIOR, no como valor por defecto: RN-11 exige la
-- supresión «dentro de las 24 horas siguientes» al vencimiento. Una copropiedad
-- puede configurar un margen MÁS CORTO; no uno más largo. El esquema impide
-- que una configuración incumpla la norma.
ALTER TABLE public.copropiedades
  DROP CONSTRAINT IF EXISTS copropiedades_margen_supresion_legal,
  ADD  CONSTRAINT copropiedades_margen_supresion_legal
       CHECK (margen_supresion_plantilla > interval '0'
              AND margen_supresion_plantilla <= interval '24 hours');

COMMENT ON COLUMN public.copropiedades.retencion_eventos IS
  'Retencion de eventos de acceso. Por defecto 24 meses. Justificacion: los '
  'eventos sustentan la responsabilidad ante un incidente (PB-06) y su '
  'finalidad —trazabilidad del acceso— sobrevive al hecho registrado. 24 meses '
  'cubre dos ciclos anuales de administracion sin volverse archivo indefinido. '
  'La purga se ejecuta soltando particiones mensuales completas, nunca con '
  'DELETE: ningun rol de aplicacion lo tiene concedido (ADR-005, D-20).';

COMMENT ON COLUMN public.copropiedades.retencion_evidencia IS
  'Retencion de la evidencia fotografica. Por defecto 90 dias. Justificacion: '
  'la fotografia es dato personal de mayor sensibilidad que el registro del '
  'acceso, y su finalidad —sustentar la decision ante una reclamacion '
  'inmediata— se agota mucho antes que la del evento. Minimizacion (Ley 1581 '
  'art. 4 lit. c). El evento sobrevive a su evidencia: conserva el hash, de '
  'modo que la trazabilidad no depende de conservar la imagen.';

COMMENT ON COLUMN public.copropiedades.margen_supresion_plantilla IS
  'Margen maximo entre el vencimiento de la vigencia y la supresion efectiva '
  'de la plantilla biometrica. RN-11 fija 24 h como limite legal, y el CHECK lo '
  'impone como cota superior: se puede configurar menos, nunca mas.';

-- 2 · La plantilla queda atada a la vigencia que la justifica ------------------
-- Hasta ahora `suprimir_en` era un instante que el caso de uso fijaba a su
-- criterio. La decisión del cliente lo ata a la autorización, y eso se hace
-- estructural: la columna existe y un disparador impide programar la supresión
-- más allá de lo que la vigencia justifica.
--
-- La columna es NULLABLE, y no por comodidad: **un residente también registra
-- su rostro**, y esa plantilla no nace de una autorización de visitante sino de
-- su condición de residente. Son dos ciclos de vida legítimos y distintos.
ALTER TABLE public.plantillas_biometricas
  ADD COLUMN IF NOT EXISTS autorizacion_id uuid NULL;

ALTER TABLE public.plantillas_biometricas
  DROP CONSTRAINT IF EXISTS plantillas_autorizacion_fk,
  ADD  CONSTRAINT plantillas_autorizacion_fk
       FOREIGN KEY (copropiedad_id, autorizacion_id)
       REFERENCES public.autorizaciones(copropiedad_id, id);

CREATE INDEX IF NOT EXISTS plantillas_por_autorizacion_idx
  ON public.plantillas_biometricas (copropiedad_id, autorizacion_id)
  WHERE autorizacion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.tg_plantilla_retencion()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_fin_vigencia timestamptz;
  v_margen       interval;
BEGIN
  IF NEW.autorizacion_id IS NULL THEN
    RETURN NEW;   -- plantilla de residente: su ciclo no lo fija una autorizacion
  END IF;

  SELECT upper(a.vigencia) INTO v_fin_vigencia
    FROM public.autorizaciones a WHERE a.id = NEW.autorizacion_id;

  SELECT c.margen_supresion_plantilla INTO v_margen
    FROM public.copropiedades c WHERE c.id = NEW.copropiedad_id;

  IF NEW.suprimir_en > v_fin_vigencia + v_margen THEN
    RAISE EXCEPTION
      'La supresion de la plantilla (%) excede la vigencia de su autorizacion '
      '(% + margen %). RN-11, CA-10, principio de finalidad (Ley 1581)',
      NEW.suprimir_en, v_fin_vigencia, v_margen
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_plantilla_retencion ON public.plantillas_biometricas;
CREATE TRIGGER tg_plantilla_retencion BEFORE INSERT OR UPDATE ON public.plantillas_biometricas
  FOR EACH ROW EXECUTE FUNCTION app.tg_plantilla_retencion();

-- 3 · Libro de purgas, append-only --------------------------------------------
-- Sin este registro, la retención sería indemostrable: pasado el plazo no
-- quedaría ni el dato ni constancia de haberlo suprimido, y ante una
-- reclamación no habría forma de acreditar cumplimiento.
--
-- Y hay una razón estructural para que sea una tabla aparte y no columnas en
-- `evidencias`: esa tabla es append-only por permisos (ADR-005, D-20), así que
-- no admite marcar una fila como purgada. La fila de `evidencias` sobrevive
-- —con su hash, para que el evento siga siendo trazable— y este libro registra
-- que el objeto se eliminó del almacenamiento.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_purga') THEN
    CREATE TYPE public.tipo_purga AS ENUM ('eventos','evidencia','plantilla_biometrica');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.purgas_retencion (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id      uuid NOT NULL REFERENCES public.copropiedades(id),
  tipo                tipo_purga NOT NULL,
  politica_aplicada   interval NOT NULL,
  rango_desde         timestamptz NULL,
  rango_hasta         timestamptz NOT NULL,
  objetos_afectados   bigint NOT NULL,
  detalle             text NULL,
  ejecutado_en        timestamptz NOT NULL DEFAULT now(),

  creado_en           timestamptz NOT NULL DEFAULT now(),
  creado_por          uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT purgas_objetos_no_negativos CHECK (objetos_afectados >= 0),
  CONSTRAINT purgas_rango_coherente CHECK (rango_desde IS NULL OR rango_desde < rango_hasta)
);

CREATE INDEX IF NOT EXISTS purgas_por_copropiedad_idx
  ON public.purgas_retencion (copropiedad_id, tipo, ejecutado_en DESC);

COMMENT ON TABLE public.purgas_retencion IS
  'Libro append-only de purgas por retencion. Acredita el cumplimiento del '
  'principio de finalidad cuando el dato ya no existe. Sin columnas '
  'actualizado_*: no se edita.';

ALTER TABLE public.purgas_retencion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purgas_retencion FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purgas_lectura   ON public.purgas_retencion;
DROP POLICY IF EXISTS purgas_insercion ON public.purgas_retencion;
CREATE POLICY purgas_lectura ON public.purgas_retencion FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id));
CREATE POLICY purgas_insercion ON public.purgas_retencion FOR INSERT
  WITH CHECK (app.es_servicio(copropiedad_id));

-- Append-only, como `eventos`, `evidencias` y `auditoria_seguridad`.
REVOKE ALL ON public.purgas_retencion FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.purgas_retencion TO authenticated, service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.purgas_retencion
  FROM PUBLIC, authenticated, service_role, app_mantenimiento;

DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.purgas_retencion;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.purgas_retencion
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();

-- 4 · Verificación de la propia migración -------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='purgas_retencion'
     AND privilege_type IN ('UPDATE','DELETE') AND grantee <> 'postgres';
  IF n > 0 THEN
    RAISE EXCEPTION 'purgas_retencion debe ser append-only: % concesiones indebidas', n;
  END IF;

  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
   WHERE ns.nspname='public' AND c.relkind IN ('r','p')
     AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);
  IF n > 0 THEN
    RAISE EXCEPTION 'Hay % tablas sin RLS activa y forzada tras la migracion 0016', n;
  END IF;
END
$$;

-- =============================================================================
-- CÓMO SE EJECUTA CADA PURGA — contrato para las ETAPAS 06 y 14
--
--   Eventos      : DETACH + DROP de las particiones mensuales enteramente
--                  anteriores a now() - retencion_eventos. Ejecuta
--                  app_mantenimiento. NO se usa DELETE: no está concedido a
--                  nadie, y ese es justamente el motivo de particionar por mes.
--   Evidencia    : borrado del objeto en Storage + una fila en este libro. La
--                  fila de `evidencias` NO se toca: conserva ruta y hash para
--                  que el evento siga siendo trazable.
--   Plantillas   : ya cubierto por RN-11 y el barrido de pg-boss sobre
--                  `suprimir_en`; esta migración solo lo ata a la vigencia.
--
-- Ninguno de los tres trabajos se implementa aquí: son de las ETAPAS 06 y 14.
-- Lo que esta migración fija es la política, su cota legal y dónde se acredita.
-- =============================================================================
