-- Reversión de la migración 0061 (D-147 · respaldo diario de los eventos).
--
-- Pierde la constancia de los respaldos y de sus envíos: es auditoría. Exige
-- respaldo previo de las dos tablas. NO toca `eventos`, que es la fuente: el
-- histórico sigue entero y los respaldos se pueden volver a generar.
--
-- El bucket `respaldo-de-eventos` y sus ficheros NO se borran: retirar copias
-- de seguridad no es una reversión de esquema. Se quita sólo su política de
-- lectura; si se quiere retirar el bucket, a mano y vacío, desde el panel.
\set ON_ERROR_STOP on

BEGIN;
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS respaldo_de_eventos_lectura ON storage.objects';
  END IF;
END
$$;
DROP TABLE IF EXISTS public.envios_de_respaldo;
DROP TABLE IF EXISTS public.respaldos_de_eventos;
DROP FUNCTION IF EXISTS app.tg_envio_respaldo_existe();
COMMIT;
