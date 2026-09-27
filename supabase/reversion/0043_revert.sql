-- Reversión de la migración 0043 (ETAPA 15-L · consentimiento declarado por
-- quien registra · ADR-032).
--
-- Pierde el ORIGEN de cada consentimiento y la constancia de la casilla en
-- cada autorización: quién la marcó, cuándo y sobre qué versión del texto.
-- Antes de revertir, exporte esas columnas si hay consentimientos declarados:
-- son la única prueba de la declaración. Los consentimientos siguen existiendo
-- y quedan todos como si los hubiera otorgado el titular, que es justo lo que
-- ADR-032 prohíbe afirmar: no revierta en producción sin esa exportación.
\set ON_ERROR_STOP on

DROP INDEX IF EXISTS public.plantillas_por_autorizacion_idx;
DROP INDEX IF EXISTS public.autorizaciones_por_vivienda_inicio_idx;
DROP INDEX IF EXISTS public.autorizaciones_por_inicio_idx;

ALTER TABLE public.autorizaciones DROP CONSTRAINT IF EXISTS autorizaciones_declaracion_completa;
ALTER TABLE public.autorizaciones
  DROP COLUMN IF EXISTS consentimiento_texto_version,
  DROP COLUMN IF EXISTS consentimiento_declarado_en,
  DROP COLUMN IF EXISTS consentimiento_declarado_por;

ALTER TABLE public.consentimientos_biometricos DROP CONSTRAINT IF EXISTS consent_declaracion_con_autor;
ALTER TABLE public.consentimientos_biometricos DROP CONSTRAINT IF EXISTS consent_origen_valores;
ALTER TABLE public.consentimientos_biometricos
  DROP COLUMN IF EXISTS declarado_por,
  DROP COLUMN IF EXISTS origen;
