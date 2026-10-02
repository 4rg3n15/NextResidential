-- Reversión de la migración 0047 (ETAPA 15-P · conversaciones de la guardia).
--
-- Pierde el rastro de las conversaciones de audio: es auditoría. Exige respaldo
-- previo; la consola sigue hablando, pero sin constancia en la base.
\set ON_ERROR_STOP on

DROP TABLE IF EXISTS public.conversaciones_de_guardia;
