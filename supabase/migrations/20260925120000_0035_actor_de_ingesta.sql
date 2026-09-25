-- =============================================================================
-- 0035 · El actor de INGESTA existe por migración, no por semilla (ETAPA 15-E · A3)
--
-- LO QUE HABÍA. La API atribuye a una identidad fija —`ACTOR_INGESTA`— todo lo
-- que escriben los equipos: el evento que publica una cámara, la plantilla que
-- entra por el enlace de consentimiento, la sincronización a una terminal. Esa
-- constante valía `…0002`, que es el identificador que el SEED da al
-- «Superadministrador de plataforma» de demostración. Dos consecuencias:
--
--   1. En una base con SOLO migraciones —la de Grupo Control— la fila `…0002`
--      no existe, y el primer `INSERT` con `creado_por = …0002` falla por la
--      clave ajena a `usuarios`. El histórico en PostgreSQL de la 15-E habría
--      muerto en el primer evento real, en sitio.
--   2. En la base de demostración sí existe, y entonces cada acceso decidido
--      por una cámara quedaba firmado por un superadministrador HUMANO. Es una
--      auditoría que miente sobre quién hizo qué.
--
-- LO QUE HAY. Una identidad propia, declarada como función igual que
-- `app.actor_de_sistema()` (0025), exenta por NOMBRE del disparador de tenant
-- —no relajando la regla— y creada aquí, idempotente, para que exista en toda
-- base que haya corrido las migraciones. Sin login: su `auth_user_id` no
-- corresponde a ninguna identidad real.
--
-- Idempotente y reversible en el sentido que admite PostgreSQL.
-- =============================================================================

-- ── 1 · La identidad ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.actor_de_ingesta()
RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT '00000000-0000-4000-8000-000000000003'::uuid $$;

COMMENT ON FUNCTION app.actor_de_ingesta IS
  'Identidad de plataforma que firma lo que escriben los EQUIPOS (camaras, '
  'terminales, videoporteros, Edge) y el enlace de consentimiento del titular. '
  'No tiene login. Es la que `ACTOR_INGESTA` de la API nombra.';

-- ── 2 · Excepción NOMBRADA en el disparador de tenant ───────────────────────
-- Misma forma que 0025: sólo dos identificadores fijos pueden tener
-- `copropiedad_id` nulo sin rol de superadministrador. Cualquier otro usuario
-- sigue necesitando ese rol (D-02).
CREATE OR REPLACE FUNCTION app.tg_usuario_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.copropiedad_id IS NULL THEN
    IF NEW.id IN (app.actor_de_sistema(), app.actor_de_ingesta()) THEN
      RETURN NEW;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.roles_usuario r
       WHERE r.usuario_id = NEW.id
         AND r.rol        = 'superadministrador'
         AND r.estado     = 'activo')
    THEN
      RAISE EXCEPTION
        'Solo el superadministrador puede tener copropiedad_id nulo (usuario %). D-02', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- ── 3 · La fila ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- La MISMA vía que usa la aplicación —claims del JWT— con la identidad de
  -- plataforma, y LOCAL a la transacción. Sin esto `FORCE ROW LEVEL SECURITY`
  -- bloquea la inserción incluso al dueño de la tabla.
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador',
                      'usuario_id', app.actor_de_sistema())::text, true);

  INSERT INTO public.usuarios (id, copropiedad_id, auth_user_id, correo, nombre,
                               creado_por, actualizado_por)
  VALUES (app.actor_de_ingesta(), NULL,
          '00000000-0000-4000-8000-0000000000a3',
          'ingesta@nextcontrol.invalid', 'Actor de ingesta de equipos',
          app.actor_de_sistema(), app.actor_de_sistema())
  ON CONFLICT (id) DO NOTHING;
END
$$;

-- ── Aserciones de despliegue ────────────────────────────────────────────────
DO $$
DECLARE n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador',
                      'usuario_id', app.actor_de_sistema())::text, true);

  SELECT count(*) INTO n FROM public.usuarios
   WHERE id = app.actor_de_ingesta() AND copropiedad_id IS NULL;
  ASSERT n = 1, '0035: el actor de ingesta no quedó creado';

  -- Y NO es el superadministrador de demostración: son identidades distintas.
  ASSERT app.actor_de_ingesta() <> app.actor_de_sistema(),
    '0035: el actor de ingesta coincide con el de sistema';
  ASSERT app.actor_de_ingesta() <> '00000000-0000-4000-8000-000000000002'::uuid,
    '0035: el actor de ingesta coincide con el superadministrador del seed';
END
$$;
