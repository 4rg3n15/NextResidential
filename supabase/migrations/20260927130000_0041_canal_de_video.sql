-- ─────────────────────────────────────────────────────────────────────────────
-- 0041 · ETAPA 15-L (C2, D2) · EL CANAL DE VIDEO DE CADA EQUIPO
--
-- El flujo que se pide al equipo estaba fijo en el código (`/Streaming/Channels/
-- 102`, el subflujo del canal 1). En sitio puede ser otro —otra cámara del
-- mismo grabador, el flujo principal para una prueba— y la regla del cliente
-- es que nada obligue a tocar código en sitio: se declara en la ficha.
--
-- Es el identificador de la guía del fabricante: canal × 100 + flujo (101 el
-- principal del canal 1, 102 el subflujo). NULL = el subflujo del canal 1, que
-- es lo que el navegador reproduce mejor (D2). Se valida la FORMA en la base;
-- que el equipo lo tenga se comprueba al sondearlo.
--
-- Idempotente; reversible con supabase/reversion/0041_revert.sql.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.dispositivos
  ADD COLUMN IF NOT EXISTS canal_de_video text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'dispositivos_canal_de_video_formato'
       AND conrelid = 'public.dispositivos'::regclass
  ) THEN
    ALTER TABLE public.dispositivos
      ADD CONSTRAINT dispositivos_canal_de_video_formato
      CHECK (canal_de_video IS NULL OR canal_de_video ~ '^[1-9][0-9]{2,3}$');
  END IF;
END
$$;

COMMENT ON COLUMN public.dispositivos.canal_de_video IS
  'Flujo de video del equipo (canal×100+flujo, p. ej. 102). NULL = 102, el subflujo del canal 1.';
