-- =============================================================================
-- 0044 · ESTADO REAL DEL EQUIPO Y ARCHIVO DE ALERTAS · ETAPA 15-M (E5 / C7)
--
-- Evidencia del sitio (28/09): `dispositivos.estado_salud` valia 'saludable'
-- en los cuatro equipos, incluido uno inalcanzable, porque nadie lo escribia;
-- la ficha ensenaba modelo y firmware viejos como si fueran de hoy; y cada
-- lectura de una camara sin atestacion abria una alerta nueva.
--
-- 1 · dispositivos: el ultimo sondeo (clase y momento), cuando se leyeron
--     modelo y firmware por ultima vez, y cuando el equipo rechazo la clave.
--     `estado_salud` pasa a escribirse con la realidad (latido, sondeo y
--     escucha) desde la API; aqui solo se documenta y se indexa.
-- 2 · alertas: archivo logico con motivo y autor (RN-19: nunca borrado). Una
--     condicion persistente es UNA alerta y no una por lectura: la API la
--     distingue por su clave (`[camara_decide_sola]`, `[reloj_desviado]` al
--     principio de las notas) sin tipos nuevos, porque el dominio no cambia.
--
-- Idempotente: se puede aplicar dos veces sin error.
-- =============================================================================

-- 1 · dispositivos ------------------------------------------------------------
ALTER TABLE public.dispositivos ADD COLUMN IF NOT EXISTS sondeado_en timestamptz NULL;
ALTER TABLE public.dispositivos ADD COLUMN IF NOT EXISTS ultimo_sondeo text NULL;
ALTER TABLE public.dispositivos ADD COLUMN IF NOT EXISTS identidad_leida_en timestamptz NULL;
ALTER TABLE public.dispositivos ADD COLUMN IF NOT EXISTS credencial_rechazada_en timestamptz NULL;
ALTER TABLE public.dispositivos ADD COLUMN IF NOT EXISTS salud_actualizada_en timestamptz NULL;

ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_ultimo_sondeo_valido;
ALTER TABLE public.dispositivos ADD CONSTRAINT dispositivos_ultimo_sondeo_valido
  CHECK (ultimo_sondeo IS NULL
         OR ultimo_sondeo IN ('alcanzado', 'decide_solo', 'credencial', 'inalcanzable'));

COMMENT ON COLUMN public.dispositivos.sondeado_en IS
  'Ultimo sondeo desde la consola o el latido, con cualquier desenlace. 0044.';
COMMENT ON COLUMN public.dispositivos.ultimo_sondeo IS
  'Clase del ultimo sondeo: alcanzado, decide_solo, credencial o inalcanzable. 0044.';
COMMENT ON COLUMN public.dispositivos.identidad_leida_en IS
  'Cuando se leyeron modelo y firmware por ultima vez del propio equipo: la ficha '
  'los ensena como «dato del DD-MM-YYYY» si el sondeo actual falla. 0044.';
COMMENT ON COLUMN public.dispositivos.credencial_rechazada_en IS
  'Ultima vez que el equipo rechazo el usuario o la clave. NULL = no consta. 0044.';
COMMENT ON COLUMN public.dispositivos.estado_salud IS
  'Desde la 0044 la escribe la API con la realidad: latido, sondeo y escucha. '
  'La consola deriva el estado con estadoDelEquipo() y esta columna es su copia '
  'persistida para consultas e indices, actualizada en salud_actualizada_en.';

-- 2 · alertas -----------------------------------------------------------------
ALTER TABLE public.alertas ADD COLUMN IF NOT EXISTS archivada_en  timestamptz NULL;
ALTER TABLE public.alertas ADD COLUMN IF NOT EXISTS archivada_por uuid NULL
  REFERENCES public.usuarios(id);
ALTER TABLE public.alertas ADD COLUMN IF NOT EXISTS motivo_archivo text NULL;

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_archivo_coherente;
ALTER TABLE public.alertas ADD CONSTRAINT alertas_archivo_coherente CHECK (
  (archivada_en IS NULL) = (archivada_por IS NULL)
  AND (archivada_en IS NULL) = (motivo_archivo IS NULL)
  AND (motivo_archivo IS NULL OR length(motivo_archivo) BETWEEN 3 AND 500));

-- Las abiertas y no archivadas por equipo y tipo: es lo que consulta la
-- deduplicacion antes de abrir otra, y lo que lista la consola.
CREATE INDEX IF NOT EXISTS alertas_vigentes_por_equipo_idx
  ON public.alertas (copropiedad_id, dispositivo_id, tipo, generada_en DESC)
  WHERE archivada_en IS NULL;

COMMENT ON COLUMN public.alertas.archivada_en IS
  'Archivo logico (RN-19). La alerta no se borra: deja de listarse y queda quien, '
  'cuando y por que. Migracion 0044.';

-- 3 · aserciones --------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'dispositivos'
     AND column_name IN ('sondeado_en', 'ultimo_sondeo', 'identidad_leida_en',
                         'credencial_rechazada_en', 'salud_actualizada_en');
  ASSERT n = 5, format('0044: dispositivos tiene %s de las 5 columnas nuevas', n);
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'alertas'
     AND column_name IN ('archivada_en', 'archivada_por', 'motivo_archivo');
  ASSERT n = 3, format('0044: alertas tiene %s de las 3 columnas de archivo', n);
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname = 'alertas_archivo_coherente' AND conrelid = 'public.alertas'::regclass;
  ASSERT n = 1, '0044: falta alertas_archivo_coherente';
  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'alertas_vigentes_por_equipo_idx';
  ASSERT n = 1, '0044: falta alertas_vigentes_por_equipo_idx';
  -- La RLS de alertas y dispositivos (0014) cubre las columnas nuevas: sigue forzada.
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public' AND c.relname IN ('alertas', 'dispositivos')
     AND c.relrowsecurity AND c.relforcerowsecurity;
  ASSERT n = 2, '0044: alertas o dispositivos sin RLS forzada';
END $$;
