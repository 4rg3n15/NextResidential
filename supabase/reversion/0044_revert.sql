-- Reversión de la migración 0044 (ETAPA 15-M · estado real del equipo y
-- archivo de alertas · E5 / C7).
--
-- Pierde el último sondeo de cada equipo, cuándo se leyó su identidad y cuándo
-- rechazó la clave, y el ARCHIVO de las alertas: quién las archivó, cuándo y
-- por qué. Las alertas archivadas vuelven a listarse como abiertas. Antes de
-- revertir, exporte `alertas` con sus columnas de archivo si alguna lo está:
-- es la única constancia de por qué salieron de la cola (RN-19).
\set ON_ERROR_STOP on

DROP INDEX IF EXISTS public.alertas_vigentes_por_equipo_idx;
ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_archivo_coherente;
ALTER TABLE public.alertas
  DROP COLUMN IF EXISTS motivo_archivo,
  DROP COLUMN IF EXISTS archivada_por,
  DROP COLUMN IF EXISTS archivada_en;

ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_ultimo_sondeo_valido;
ALTER TABLE public.dispositivos
  DROP COLUMN IF EXISTS salud_actualizada_en,
  DROP COLUMN IF EXISTS credencial_rechazada_en,
  DROP COLUMN IF EXISTS identidad_leida_en,
  DROP COLUMN IF EXISTS ultimo_sondeo,
  DROP COLUMN IF EXISTS sondeado_en;
