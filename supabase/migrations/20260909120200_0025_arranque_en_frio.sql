-- =============================================================================
-- 0025 · Arranque en frio: actor de sistema y funciones de aprovisionamiento
--
-- EL PROBLEMA, tal como se reprodujo el 2026-09-09 sobre una base recien
-- migrada. El esquema exige `creado_por` y `actualizado_por` NOT NULL en toda
-- tabla operativa (KPI-05), y esas columnas son claves ajenas a `usuarios`:
--
--     copropiedades.creado_por  -> usuarios
--     usuarios.creado_por       -> usuarios      (a si misma)
--     roles_usuario.creado_por  -> usuarios
--
-- Es un ciclo. Sobre una base vacia no hay copropiedad, no hay usuario, y el
-- primer usuario no puede existir porque su creador tendria que existir antes.
-- El unico modo de romperlo es una fila de `usuarios` cuyo `creado_por` se
-- apunte A SI MISMA, y esa fila es INFRAESTRUCTURA, no dato de ejemplo.
--
-- POR QUE NO ESTABA. El mecanismo si existia — `supabase/seed/seed.sql` lo hace
-- exactamente asi, y bien—, pero estaba soldado al conjunto de datos de
-- demostracion: la misma transaccion que crea el actor crea «Urbanizacion
-- Mira», sus viviendas y sus residentes. En produccion nadie ejecuta ese
-- fichero, y sin el no queda ningun actor. La identidad que el sistema necesita
-- para existir estaba atrapada dentro de un fichero cuyo proposito son datos
-- falsos, y ninguna prueba lo delataba porque la suite SQL corre DESPUES del
-- seed y la de la API firma sus propios tokens contra adaptadores en memoria.
--
-- LO QUE NO SE HACE, y es deliberado: **no se debilita ninguna restriccion.**
-- `creado_por` sigue siendo NOT NULL en todas partes. Lo que se añade es un
-- actor explicito y trazable, con identificador fijo y conocido, que queda
-- registrado como autor de las filas de arranque.
--
-- LA SEGUNDA TRAMPA, tambien encontrada ejecutando: `tg_usuario_tenant` es un
-- disparador de restriccion DEFERRABLE INITIALLY DEFERRED, es decir, se
-- comprueba AL COMMIT. Por eso el arranque no puede hacerse con llamadas REST
-- sueltas —cada peticion de PostgREST es su propia transaccion— y por eso el
-- aprovisionamiento vive aqui, en funciones que se ejecutan enteras en una sola
-- transaccion, y no en el guion.
-- =============================================================================

-- ===== 1 · El actor de sistema ===============================================

-- Identificador fijo y conocido. Se declara como funcion y no como literal
-- repetido: un UUID copiado en cinco sitios acaba divergiendo en el sexto.
CREATE OR REPLACE FUNCTION app.actor_de_sistema()
RETURNS uuid LANGUAGE sql IMMUTABLE
AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;

COMMENT ON FUNCTION app.actor_de_sistema IS
  'Identidad de plataforma que figura como autor de las filas de arranque. '
  'No tiene login: su auth_user_id no corresponde a ninguna identidad real.';

-- `tg_usuario_tenant` (migracion 0013) exige que solo un superadministrador
-- tenga `copropiedad_id` nulo. El actor de sistema tambien lo tiene, y no puede
-- tener un rol antes de que exista una copropiedad — el mismo ciclo. Se admite
-- COMO EXCEPCION NOMBRADA y acotada a un identificador fijo, no relajando la
-- regla: cualquier otro usuario sigue necesitando su rol de superadministrador.
CREATE OR REPLACE FUNCTION app.tg_usuario_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.copropiedad_id IS NULL THEN
    IF NEW.id = app.actor_de_sistema() THEN
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

-- La fila. `ON CONFLICT DO NOTHING` la hace idempotente y compatible con el
-- seed, que usa este mismo identificador desde la ETAPA 01.
DO $$
BEGIN
  -- Contexto de escritura: la MISMA via que usa la aplicacion —claims del
  -- JWT—, con la identidad de plataforma. No es un privilegio especial, y es
  -- LOCAL: muere con la transaccion. Sin el, `FORCE ROW LEVEL SECURITY` bloquea
  -- la insercion incluso al dueño de la tabla.
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador',
                      'usuario_id', app.actor_de_sistema())::text, true);

  INSERT INTO public.usuarios (id, copropiedad_id, auth_user_id, correo, nombre,
                               creado_por, actualizado_por)
  VALUES (app.actor_de_sistema(), NULL,
          '00000000-0000-4000-8000-0000000000a1',
          'sistema@nextcontrol.invalid', 'Actor de sistema',
          app.actor_de_sistema(), app.actor_de_sistema())
  ON CONFLICT (id) DO NOTHING;
END
$$;

-- ===== 2 · Aprovisionamiento, en una sola transaccion ========================

CREATE OR REPLACE FUNCTION app.arranque_registrar_copropiedad(
  p_nombre       text,
  p_nit          text,
  p_zona_horaria text DEFAULT 'America/Bogota'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  -- EL CONTEXTO VA PRIMERO, antes de leer o escribir nada. Con `FORCE ROW
  -- LEVEL SECURITY` una consulta sin claims no ve NADA, asi que una validacion
  -- colocada antes de esta linea no comprueba si la fila existe: comprueba si
  -- es visible, y responde «no existe» sobre algo que si esta. Ocurrio el
  -- 2026-09-09 con la validacion de `arranque_vincular_usuario`, que producia
  -- exactamente el mensaje enganoso que motivo este trabajo.
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador',
                      'usuario_id', app.actor_de_sistema())::text, true);

  IF coalesce(trim(p_nombre), '') = '' THEN
    RAISE EXCEPTION 'El nombre de la copropiedad no puede estar vacio'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF coalesce(trim(p_nit), '') = '' THEN
    RAISE EXCEPTION 'El NIT no puede estar vacio' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT app.es_zona_horaria(p_zona_horaria) THEN
    RAISE EXCEPTION 'Zona horaria IANA no valida: %', p_zona_horaria
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Idempotente por NIT: repetir el arranque no crea una segunda copropiedad.
  SELECT id INTO v_id FROM public.copropiedades WHERE nit = trim(p_nit);
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.copropiedades (nombre, nit, zona_horaria, creado_por, actualizado_por)
  VALUES (trim(p_nombre), trim(p_nit), p_zona_horaria,
          app.actor_de_sistema(), app.actor_de_sistema())
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

COMMENT ON FUNCTION app.arranque_registrar_copropiedad IS
  'Alta de copropiedad para el arranque en frio. Idempotente por NIT. El autor '
  'de la fila es el actor de sistema (0025).';

CREATE OR REPLACE FUNCTION app.arranque_vincular_usuario(
  p_auth_user_id  uuid,
  p_correo        text,
  p_nombre        text,
  p_rol           rol_usuario,
  p_copropiedad_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_usuario_id uuid;
  v_tenant     uuid;
BEGIN
  -- Igual que arriba: el contexto primero. Es lo que hace que la validacion de
  -- la copropiedad diga la verdad en vez de reflejar la RLS.
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador',
                      'usuario_id', app.actor_de_sistema())::text, true);

  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Falta el identificador de la identidad de Supabase Auth'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF coalesce(trim(p_correo), '') = '' THEN
    RAISE EXCEPTION 'El correo no puede estar vacio' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Se valida ANTES de escribir nada, y con mensaje util: un identificador de
  -- copropiedad inexistente tiene que fallar aqui, no en la clave ajena.
  IF NOT EXISTS (SELECT 1 FROM public.copropiedades
                  WHERE id = p_copropiedad_id AND estado = 'activa') THEN
    RAISE EXCEPTION 'No existe ninguna copropiedad activa con id %', p_copropiedad_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- El superadministrador es identidad de PLATAFORMA: su `copropiedad_id` va
  -- nulo y su alcance lo resuelve `app.es_superadmin()`. Atarlo a la
  -- copropiedad del arranque lo dejaria pareciendo un administrador mas.
  v_tenant := CASE WHEN p_rol = 'superadministrador' THEN NULL ELSE p_copropiedad_id END;

  SELECT id INTO v_usuario_id FROM public.usuarios WHERE auth_user_id = p_auth_user_id;

  IF v_usuario_id IS NULL THEN
    INSERT INTO public.usuarios (copropiedad_id, auth_user_id, correo, nombre,
                                 creado_por, actualizado_por)
    VALUES (v_tenant, p_auth_user_id, trim(p_correo), trim(p_nombre),
            app.actor_de_sistema(), app.actor_de_sistema())
    RETURNING id INTO v_usuario_id;
  END IF;

  -- Idempotente: repetir el aprovisionamiento no duplica el rol.
  IF NOT EXISTS (SELECT 1 FROM public.roles_usuario
                  WHERE usuario_id = v_usuario_id AND rol = p_rol
                    AND copropiedad_id = p_copropiedad_id AND estado = 'activo') THEN
    INSERT INTO public.roles_usuario (copropiedad_id, usuario_id, rol,
                                      creado_por, actualizado_por)
    VALUES (p_copropiedad_id, v_usuario_id, p_rol,
            app.actor_de_sistema(), app.actor_de_sistema());
  END IF;

  RETURN v_usuario_id;
END
$$;

COMMENT ON FUNCTION app.arranque_vincular_usuario IS
  'Enlaza una identidad de Supabase Auth con public.usuarios y le da un rol, '
  'todo en UNA transaccion: `tg_usuario_tenant` es DEFERRABLE INITIALLY '
  'DEFERRED y se comprueba al commit (0025).';

-- ===== 3 · Permisos ==========================================================
-- Solo la identidad de servicio. `anon` y `authenticated` no pueden invocarlas:
-- son funciones que crean superadministradores.
REVOKE EXECUTE ON FUNCTION app.arranque_registrar_copropiedad(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.arranque_vincular_usuario(uuid, text, text, rol_usuario, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.arranque_registrar_copropiedad(text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION app.arranque_vincular_usuario(uuid, text, text, rol_usuario, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION app.arranque_registrar_copropiedad(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION app.arranque_vincular_usuario(uuid, text, text, rol_usuario, uuid) TO service_role;

-- ===== 3-bis · Envoltorios expuestos por PostgREST ===========================
-- PostgREST solo publica el esquema `public`, asi que las funciones de `app` no
-- son invocables por REST. Estos envoltorios son la puerta minima para que el
-- guion de aprovisionamiento las llame con la llave secreta, sin mover la
-- logica de sitio y sin exponer el esquema `app` entero.
--
-- Cada llamada REST es su propia transaccion, y eso AQUI ES SUFICIENTE porque
-- toda la escritura que necesita atomicidad ocurre dentro de una sola funcion:
-- `tg_usuario_tenant` es DEFERRABLE INITIALLY DEFERRED y se comprueba al commit
-- de esa transaccion, con el usuario y su rol ya escritos.

CREATE OR REPLACE FUNCTION public.arranque_registrar_copropiedad(
  p_nombre text, p_nit text, p_zona_horaria text DEFAULT 'America/Bogota')
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public, app, pg_temp
AS $$ SELECT app.arranque_registrar_copropiedad(p_nombre, p_nit, p_zona_horaria) $$;

CREATE OR REPLACE FUNCTION public.arranque_vincular_usuario(
  p_auth_user_id uuid, p_correo text, p_nombre text,
  p_rol text, p_copropiedad_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app, pg_temp
AS $$
BEGIN
  -- El rol entra como TEXTO y se convierte aqui: PostgREST no sabe construir un
  -- valor de un enumerado propio, y un rol invalido debe fallar con un mensaje
  -- que nombre los validos en vez de con un error de conversion.
  IF NOT EXISTS (SELECT 1 FROM unnest(enum_range(NULL::rol_usuario)) e
                  WHERE e::text = p_rol) THEN
    RAISE EXCEPTION 'Rol no valido: %. Validos: %', p_rol,
      (SELECT string_agg(e::text, ', ') FROM unnest(enum_range(NULL::rol_usuario)) e)
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN app.arranque_vincular_usuario(p_auth_user_id, p_correo, p_nombre,
                                       p_rol::rol_usuario, p_copropiedad_id);
END
$$;

REVOKE EXECUTE ON FUNCTION public.arranque_registrar_copropiedad(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arranque_vincular_usuario(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arranque_registrar_copropiedad(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arranque_vincular_usuario(uuid, text, text, text, uuid) TO service_role;

-- ===== 4 · Aserciones de despliegue ==========================================
DO $$
DECLARE n integer;
BEGIN
  -- EL CONTEXTO DE CLAIMS TAMBIEN HACE FALTA AQUI, y no es un detalle: sin el,
  -- estas dos primeras aserciones no comprueban si la fila EXISTE sino si es
  -- VISIBLE. Con `FORCE ROW LEVEL SECURITY` y sin claims, la politica de SELECT
  -- no devuelve nada y `count(*)` da 0 aunque la fila este ahi — comprobado el
  -- 2026-09-09: la migracion fallaba con «no existe el actor de sistema»
  -- mientras un INSERT posterior chocaba con su clave primaria. Una asercion
  -- que mide otra cosa que la que dice medir es el mismo defecto que este
  -- proyecto lleva persiguiendo desde la ETAPA 03.
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador',
                      'usuario_id', app.actor_de_sistema())::text, true);

  SELECT count(*) INTO n FROM public.usuarios WHERE id = app.actor_de_sistema();
  ASSERT n = 1, '0025: no existe el actor de sistema';

  SELECT count(*) INTO n FROM public.usuarios
   WHERE id = app.actor_de_sistema() AND creado_por = app.actor_de_sistema();
  ASSERT n = 1, '0025: el actor de sistema no se referencia a si mismo';

  -- Ninguna de las dos funciones puede quedar al alcance de un usuario normal.
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'app'
     AND p.proname IN ('arranque_registrar_copropiedad', 'arranque_vincular_usuario')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  ASSERT n = 0, '0025: `authenticated` puede ejecutar las funciones de arranque';

  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('arranque_registrar_copropiedad', 'arranque_vincular_usuario')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  ASSERT n = 0, '0025: `authenticated` alcanza los envoltorios expuestos por PostgREST';
END
$$;
