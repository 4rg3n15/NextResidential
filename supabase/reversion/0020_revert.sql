-- Reversión de la migración 0020 · umbral de latido por copropiedad (P-06).
--
-- No destruye historial: solo retira la configuración del latido. Tras
-- revertirla, la vigilancia de dispositivos usa el valor por defecto del
-- dominio (60 s de periodo, 1 latido tolerado, 300 s para caído).
\set ON_ERROR_STOP on

ALTER TABLE public.copropiedades
  DROP CONSTRAINT IF EXISTS copropiedades_umbral_latido_coherente,
  DROP CONSTRAINT IF EXISTS copropiedades_periodo_latido_positivo,
  DROP CONSTRAINT IF EXISTS copropiedades_latidos_no_negativos;

ALTER TABLE public.copropiedades
  DROP COLUMN IF EXISTS periodo_latido,
  DROP COLUMN IF EXISTS latidos_tolerados;
