-- ============================================================================
-- 0030 · La autorización creada DESDE LA APP, y lo que eso exige de la base
--
-- ETAPA 11-B. Dos cosas que 11-A no necesitaba porque solo leía:
--
--   1. La CLAVE DE IDEMPOTENCIA de la creación. La app del residente puede
--      estar sin cobertura al pulsar «crear», así que guarda la petición y la
--      reintenta. Sin una clave, el reintento crea una segunda visita idéntica
--      y el portero ve dos autorizaciones para la misma persona. Con ella, el
--      segundo intento devuelve la primera.
--
--      Va como índice único PARCIAL y no como columna NOT NULL: las
--      autorizaciones que crea la consola de administración no la llevan, y
--      exigírsela habría sido cambiar una superficie que funciona para servir
--      a otra. Es la misma decisión de ADR-04: **la unicidad la garantiza la
--      base, no un SELECT previo**, porque dos reintentos simultáneos desde
--      dos radios distintas es exactamente el caso que un `SELECT` pierde.
--
--   2. El TOKEN DE NOTIFICACIÓN del dispositivo (HU-34, M-7). Se guarda por
--      dispositivo y no por usuario: una persona tiene teléfono y tableta, y
--      escribir el token sobre el del otro aparato apaga las notificaciones
--      del primero sin que nadie se entere hasta que hace falta avisar.
--
-- Reversible: al final está el bloque que lo deshace.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Clave de idempotencia de la creación (RN-17)
-- ----------------------------------------------------------------------------
ALTER TABLE public.autorizaciones
  ADD COLUMN IF NOT EXISTS clave_idempotencia text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'autorizaciones_clave_idempotencia_len'
  ) THEN
    ALTER TABLE public.autorizaciones
      ADD CONSTRAINT autorizaciones_clave_idempotencia_len
      CHECK (clave_idempotencia IS NULL
             OR length(clave_idempotencia) BETWEEN 8 AND 128);
  END IF;
END $$;

-- El índice es por COPROPIEDAD, no global: dos conjuntos distintos pueden
-- generar la misma clave sin que uno bloquee al otro, y el aislamiento del
-- tenant no se debilita por un detalle de implementación de la app.
CREATE UNIQUE INDEX IF NOT EXISTS autorizaciones_idempotencia_uk
  ON public.autorizaciones (copropiedad_id, clave_idempotencia)
  WHERE clave_idempotencia IS NOT NULL;

COMMENT ON COLUMN public.autorizaciones.clave_idempotencia IS
  'Clave que genera la app del residente ANTES de intentar el envio y reusa en '
  'cada reintento del modo sin conexion (RN-17). Nula en las autorizaciones '
  'creadas desde la consola, que no reintentan.';

-- ----------------------------------------------------------------------------
-- 2 · Token de notificación por dispositivo (HU-34)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dispositivos_de_notificacion (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  usuario_id       uuid NOT NULL REFERENCES public.usuarios(id),

  -- Identificador ESTABLE del aparato, que produce la app. No es el token:
  -- el token de FCM rota solo, y si la fila se identificara por el token,
  -- cada rotacion dejaria una fila huerfana a la que se seguiria notificando.
  instalacion_id   text NOT NULL,
  token            text NOT NULL,
  plataforma       text NOT NULL,

  estado           estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en   timestamptz NULL,

  visto_en         timestamptz NOT NULL DEFAULT now(),
  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT dispositivos_notificacion_plataforma
    CHECK (plataforma IN ('ios', 'android', 'web')),
  CONSTRAINT dispositivos_notificacion_instalacion_len
    CHECK (length(instalacion_id) BETWEEN 8 AND 128),
  CONSTRAINT dispositivos_notificacion_token_len
    CHECK (length(token) BETWEEN 8 AND 4096),
  CONSTRAINT dispositivos_notificacion_baja_coherente
    CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT dispositivos_notificacion_tenant_uk UNIQUE (copropiedad_id, id)
);

-- Un aparato, una fila viva. El alta vuelve a escribir el token y la fecha.
CREATE UNIQUE INDEX IF NOT EXISTS dispositivos_notificacion_instalacion_uk
  ON public.dispositivos_de_notificacion (copropiedad_id, usuario_id, instalacion_id);

CREATE INDEX IF NOT EXISTS dispositivos_notificacion_por_usuario_idx
  ON public.dispositivos_de_notificacion (copropiedad_id, usuario_id)
  WHERE estado = 'activo';

ALTER TABLE public.dispositivos_de_notificacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispositivos_de_notificacion FORCE ROW LEVEL SECURITY;

-- Cada quien ve y escribe LOS SUYOS. Es la unica tabla de esta etapa donde el
-- ambito no es la vivienda sino la identidad: un token es del aparato de una
-- persona, y ni siquiera su titular de vivienda tiene por que verlo.
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
    OR (copropiedad_id = app.copropiedad_id() AND usuario_id = app.usuario_id())
  );

REVOKE ALL ON public.dispositivos_de_notificacion FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.dispositivos_de_notificacion
  TO authenticated, service_role;

COMMENT ON TABLE public.dispositivos_de_notificacion IS
  'HU-34 · token de FCM por aparato. La fila se identifica por instalacion_id '
  'y no por el token porque el token rota solo: identificarla por el dejaria '
  'una fila huerfana por rotacion a la que se seguiria notificando.';

-- ============================================================================
-- REVERSIÓN
--
--   DROP TABLE IF EXISTS public.dispositivos_de_notificacion;
--   DROP INDEX IF EXISTS public.autorizaciones_idempotencia_uk;
--   ALTER TABLE public.autorizaciones
--     DROP CONSTRAINT IF EXISTS autorizaciones_clave_idempotencia_len;
--   ALTER TABLE public.autorizaciones DROP COLUMN IF EXISTS clave_idempotencia;
-- ============================================================================
