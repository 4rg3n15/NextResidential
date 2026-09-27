-- Reversión de la migración 0041 (ETAPA 15-L · canal de video por equipo).
--
-- Pierde el canal declarado de cada equipo: el video vuelve al subflujo del
-- canal 1 (102) en todos. No borra historial.
\set ON_ERROR_STOP on

ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_canal_de_video_formato;
ALTER TABLE public.dispositivos DROP COLUMN IF EXISTS canal_de_video;
