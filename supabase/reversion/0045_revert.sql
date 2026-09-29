-- Reversión de la migración 0045 (ETAPA 15-M · secreto de Alarm Server por cámara).
--
-- Pierde los secretos emitidos en el alta: cada cámara vuelve a necesitar su
-- entrada en ALARM_SERVER_EQUIPOS del .env. No borra historial.
\set ON_ERROR_STOP on

ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_secreto_alarm_server_completo;
DROP INDEX IF EXISTS public.dispositivos_secreto_alarm_server_huella_uk;
ALTER TABLE public.dispositivos
  DROP COLUMN IF EXISTS secreto_alarm_server_sobre,
  DROP COLUMN IF EXISTS secreto_alarm_server_huella,
  DROP COLUMN IF EXISTS secreto_alarm_server_emitido_en;
