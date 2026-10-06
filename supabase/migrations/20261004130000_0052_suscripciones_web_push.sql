-- ============================================================================
-- 0052 · Ronda 15-R, bloque B3 · SUSCRIPCIONES WEB PUSH (P-23, ADR-036)
--
-- El aviso al residente llega por Web Push estándar a su consola instalada
-- como PWA, sin Firebase. La suscripción del navegador es un aparato más de
-- `dispositivos_de_notificacion` (0030, la tabla de `/mi/notificaciones/
-- aparatos`): NO se crea una tabla paralela. Para plataforma `web`:
--
--   · `token`         = el endpoint del servicio de push del navegador;
--   · `clave_p256dh`  = su llave pública ECDH P-256 (base64url, 65 bytes);
--   · `clave_auth`    = su secreto de autenticación (base64url, 16 bytes);
--   · `vivienda_id`   = la vivienda que la API RESOLVIÓ al suscribir.
--
-- Las llaves no son secretos del servidor: son del navegador y sólo sirven
-- para cifrarle a él. Aun así quedan fuera del alcance de cualquier otro
-- usuario por la misma política de siempre (cada quien ve los suyos).
--
-- Aislamiento, en la base:
--   · por copropiedad: FK compuesta a la vivienda (D-06) + RLS forzada;
--   · por vivienda: el residente sólo puede escribir una vivienda SUYA
--     (`app.es_mi_vivienda`), y el emisor exige además que siga siéndolo;
--   · por navegador: un endpoint vivo es UNA fila en todo el sistema (índice
--     único): dos cuentas en el mismo navegador no reciben los avisos de la
--     otra.
-- Sin borrado físico: la baja es lógica, con motivo (404/410 del servicio).
-- ============================================================================
ALTER TABLE public.dispositivos_de_notificacion
  ADD COLUMN IF NOT EXISTS vivienda_id    uuid NULL,
  ADD COLUMN IF NOT EXISTS clave_p256dh   text NULL,
  ADD COLUMN IF NOT EXISTS clave_auth     text NULL,
  ADD COLUMN IF NOT EXISTS motivo_de_baja text NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'dispositivos_notificacion_vivienda_fk') THEN
    ALTER TABLE public.dispositivos_de_notificacion
      ADD CONSTRAINT dispositivos_notificacion_vivienda_fk
      FOREIGN KEY (copropiedad_id, vivienda_id)
      REFERENCES public.viviendas (copropiedad_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'dispositivos_notificacion_web_push_completa') THEN
    ALTER TABLE public.dispositivos_de_notificacion
      ADD CONSTRAINT dispositivos_notificacion_web_push_completa CHECK (
        (clave_p256dh IS NULL AND clave_auth IS NULL)
        OR (plataforma = 'web'
            AND vivienda_id IS NOT NULL
            AND clave_p256dh ~ '^[A-Za-z0-9_-]{86,88}$'
            AND clave_auth ~ '^[A-Za-z0-9_-]{21,24}$'
            AND token ~ '^https?://')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'dispositivos_notificacion_motivo_de_baja_len') THEN
    ALTER TABLE public.dispositivos_de_notificacion
      ADD CONSTRAINT dispositivos_notificacion_motivo_de_baja_len
      CHECK (motivo_de_baja IS NULL OR length(motivo_de_baja) <= 200);
  END IF;
END $$;

-- Un endpoint vivo, una fila. Por `md5`: un endpoint puede pasar de los
-- ~2700 bytes que admite una entrada de índice B-tree.
CREATE UNIQUE INDEX IF NOT EXISTS dispositivos_notificacion_endpoint_vivo_uk
  ON public.dispositivos_de_notificacion (md5(token))
  WHERE plataforma = 'web' AND estado = 'activo' AND clave_p256dh IS NOT NULL;

-- Lo que consulta el emisor por cada aviso.
CREATE INDEX IF NOT EXISTS dispositivos_notificacion_web_por_vivienda_idx
  ON public.dispositivos_de_notificacion (copropiedad_id, vivienda_id)
  WHERE plataforma = 'web' AND estado = 'activo';

-- La política de la 0030, con la vivienda atada: un residente no puede
-- suscribir su navegador a los avisos de la casa del vecino.
DROP POLICY IF EXISTS dispositivos_notificacion_propios ON public.dispositivos_de_notificacion;
CREATE POLICY dispositivos_notificacion_propios
  ON public.dispositivos_de_notificacion
  FOR ALL
  USING (
    app.es_servicio(copropiedad_id)
    OR (copropiedad_id = app.copropiedad_id() AND usuario_id = app.usuario_id())
  )
  WITH CHECK (
    app.es_servicio(copropiedad_id)
    OR (copropiedad_id = app.copropiedad_id()
        AND usuario_id = app.usuario_id()
        AND (vivienda_id IS NULL OR app.es_mi_vivienda(vivienda_id)))
  );

DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.dispositivos_de_notificacion;
CREATE TRIGGER tg_prohibir_delete
  BEFORE DELETE ON public.dispositivos_de_notificacion
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();

REVOKE DELETE, TRUNCATE ON public.dispositivos_de_notificacion
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.dispositivos_de_notificacion IS
  'HU-34 · aparatos que reciben avisos. Desde la 0052 (ADR-036), las filas web '
  'son suscripciones Web Push: token = endpoint, con sus dos llaves y la '
  'vivienda resuelta por la API. La fila se identifica por instalacion_id.';

-- ----------------------------------------------------------------------------
-- Aserciones de despliegue
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  faltan text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'dispositivos_de_notificacion'
                    AND column_name = 'clave_p256dh') THEN
    faltan := faltan || 'columna clave_p256dh';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                  WHERE indexname = 'dispositivos_notificacion_endpoint_vivo_uk') THEN
    faltan := faltan || 'índice único del endpoint vivo';
  END IF;
  IF NOT (SELECT relforcerowsecurity FROM pg_class
           WHERE oid = 'public.dispositivos_de_notificacion'::regclass) THEN
    faltan := faltan || 'RLS forzada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.dispositivos_de_notificacion'::regclass
                    AND tgname = 'tg_prohibir_delete' AND tgenabled <> 'D') THEN
    faltan := faltan || 'disparador tg_prohibir_delete';
  END IF;
  IF array_length(faltan, 1) IS NOT NULL THEN
    RAISE EXCEPTION '0052 incompleta: %', array_to_string(faltan, ', ');
  END IF;
END $$;
