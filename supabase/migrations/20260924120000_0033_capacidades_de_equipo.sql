-- =============================================================================
-- 0033 · Capacidades de equipo, fabricante y dos declaraciones del alta
--        (ETAPA 15-D · O2)
--
-- El proveedor de hardware ya no decide por TIPO declarado sino por lo que el
-- equipo DECLARA poder hacer. Lo que la consola descubre al dar de alta un
-- aparato se guarda aquí, para que el proceso que va a hablar con él no tenga
-- que volver a preguntarlo en cada arranque —y para que la ficha lo enseñe—.
--
--   1 · `capacidades` · jsonb neutral: `{"origen":"descubiertas","aperturaRemota":"si",…}`.
--       La forma la fija `packages/providers/src/nucleo/capacidades.ts`, y el
--       lector vuelve a DESCONOCIDA cualquier campo que no entienda: un JSON
--       corrupto nunca produce un «sí».
--   2 · `fabricante` · INFORMATIVO. Se muestra y se audita; ninguna decisión lo
--       mira. Es la regla de O2 y se deja escrita en el comentario de columna.
--   3 · `modo_de_terminal` · lo que la terminal facial DECLARA ser: reporta y
--       espera al motor, o decide sola (modo débil, documentado). No se deduce.
--   4 · `canal_de_audio_habilitado` · si una persona habilitó el canal de audio
--       en el aparato. Mientras sea falso, el adaptador no emite una sola
--       petición hacia él (ADR-01, decisión de seguridad que no toma el código).
--
-- Idempotente y reversible en el sentido que admite PostgreSQL.
-- =============================================================================

ALTER TABLE public.dispositivos
  ADD COLUMN IF NOT EXISTS fabricante                 text NULL,
  ADD COLUMN IF NOT EXISTS capacidades                jsonb NULL,
  ADD COLUMN IF NOT EXISTS capacidades_descubiertas_en timestamptz NULL,
  ADD COLUMN IF NOT EXISTS modo_de_terminal           text NULL,
  ADD COLUMN IF NOT EXISTS canal_de_audio_habilitado  boolean NOT NULL DEFAULT false;

ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_fabricante_len;
ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_capacidades_es_objeto;
ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_modo_de_terminal_valido;
ALTER TABLE public.dispositivos
  ADD CONSTRAINT dispositivos_fabricante_len
    CHECK (fabricante IS NULL OR length(fabricante) BETWEEN 1 AND 80),
  -- Un objeto, no una lista ni un escalar: el lector espera claves con nombre.
  ADD CONSTRAINT dispositivos_capacidades_es_objeto
    CHECK (capacidades IS NULL OR jsonb_typeof(capacidades) = 'object'),
  ADD CONSTRAINT dispositivos_modo_de_terminal_valido
    CHECK (modo_de_terminal IS NULL OR modo_de_terminal IN ('reporta_y_espera', 'decide_el_equipo'));

COMMENT ON COLUMN public.dispositivos.fabricante IS
  'INFORMATIVO. Se muestra y se audita; ninguna decision del sistema lo mira. '
  'Lo que decide es `capacidades` (O2, ETAPA 15-D).';
COMMENT ON COLUMN public.dispositivos.capacidades IS
  'Lo que el equipo declara poder hacer, en lenguaje neutro (sin claves del '
  'fabricante). Estados si/no/desconocida; desconocida NUNCA cuenta como si.';
COMMENT ON COLUMN public.dispositivos.modo_de_terminal IS
  'Terminal facial: reporta_y_espera (el motor decide) o decide_el_equipo (modo '
  'debil, documentado). Se declara, no se deduce.';
COMMENT ON COLUMN public.dispositivos.canal_de_audio_habilitado IS
  'Si una persona habilito el canal de audio EN EL APARATO. Falso: el adaptador '
  'no emite ninguna peticion hacia el (ADR-01).';

-- La vista operativa no cambia: portero y central no necesitan capacidades ni
-- fabricante, y seguir sin exponer host ni credencial es la razon de la vista.

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'dispositivos'
     AND column_name IN ('fabricante', 'capacidades', 'modo_de_terminal', 'canal_de_audio_habilitado');
  ASSERT n = 4, '0033: faltan columnas de capacidades en dispositivos';

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname = 'dispositivos_capacidades_es_objeto';
  ASSERT n = 1, '0033: capacidades admite algo que no es un objeto';
END
$$;
