-- Reversión de la migración 0046 (ETAPA 15-N · cola de atención en vivo).
--
-- Pierde las preferencias de atención guardadas: la guardia y la portería
-- vuelven a abrir y sonar con todo (el valor por omisión). La cola sigue
-- funcionando sin los índices, más lenta. No borra historial.
\set ON_ERROR_STOP on

DROP TABLE IF EXISTS public.preferencias_de_atencion;
DROP INDEX IF EXISTS public.ordenes_manuales_por_evento_idx;
DROP INDEX IF EXISTS public.eventos_de_equipo_vivos_por_recepcion_idx;
