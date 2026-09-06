-- Reversión de 0016 · política de retención
DROP TRIGGER IF EXISTS tg_prohibir_delete     ON public.purgas_retencion;
DROP TABLE    IF EXISTS public.purgas_retencion;
DROP TYPE     IF EXISTS public.tipo_purga;

DROP TRIGGER  IF EXISTS tg_plantilla_retencion ON public.plantillas_biometricas;
DROP FUNCTION IF EXISTS app.tg_plantilla_retencion();

ALTER TABLE public.plantillas_biometricas
  DROP CONSTRAINT IF EXISTS plantillas_autorizacion_fk,
  DROP COLUMN     IF EXISTS autorizacion_id;

ALTER TABLE public.copropiedades
  DROP CONSTRAINT IF EXISTS copropiedades_retencion_eventos_positiva,
  DROP CONSTRAINT IF EXISTS copropiedades_retencion_evidencia_positiva,
  DROP CONSTRAINT IF EXISTS copropiedades_margen_supresion_legal,
  DROP COLUMN     IF EXISTS retencion_eventos,
  DROP COLUMN     IF EXISTS retencion_evidencia,
  DROP COLUMN     IF EXISTS margen_supresion_plantilla;
