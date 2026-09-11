-- =============================================================================
-- 0024 · Auth Hook de custom claims · RN-15 · KPI-35 · CA-24
--
-- POR QUE ESTA MIGRACION EXISTE AHORA. La guia de conexion (§6.1) describia
-- este gancho y lo dejaba anotado como trabajo de la ETAPA 03; el informe de
-- esa etapa dice que «los claims se fijan manualmente para las pruebas». Al
-- construir el acceso de la consola en la ETAPA 09-A se comprobo que la funcion
-- nunca llego a escribirse: ningun token emitido por Supabase llevaba `rol` ni
-- `copropiedad_id`.
--
-- La consecuencia no era un error visible, sino el sistema fallando cerrado:
-- `app.copropiedad_id()` devuelve NULL, ninguna politica RLS concede acceso y
-- el guard de la API rechaza por rol ausente. Correcto, y completamente
-- inutilizable: nadie puede entrar a la consola.
--
-- QUE HACE. Supabase invoca esta funcion ANTES de firmar el token y le pasa el
-- evento con `user_id` y `claims`. Aqui se leen los roles vigentes del usuario
-- y se añaden los claims que `docs/arquitectura/verificacion-jwt-asimetrica.md`
-- fija como contrato. El algoritmo de firma se aplica despues: son dos etapas
-- independientes, asi que esto funciona igual con firma asimetrica.
--
-- QUE NO HACE. No toca `aal`: ese lo emite Supabase al verificar el segundo
-- factor y es el que el guard exige para los roles administrativos (ADR-008).
-- Un gancho que lo escribiera permitiria falsificar el segundo factor desde la
-- base de datos.
-- =============================================================================

-- Precedencia de roles, declarada y no deducida del orden del enumerado.
-- Un usuario con varias filas en `roles_usuario` obtiene el MAS privilegiado:
-- lo contrario —tomar cualquiera— haria que su sesion dependiera del orden
-- fisico de las filas, que cambia con un VACUUM.
CREATE OR REPLACE FUNCTION app.precedencia_de_rol(p_rol rol_usuario)
RETURNS smallint
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_rol
           WHEN 'superadministrador' THEN 1
           WHEN 'administrador'      THEN 2
           WHEN 'operador_central'   THEN 3
           WHEN 'portero'            THEN 4
           WHEN 'residente'          THEN 5
           WHEN 'servicio'           THEN 6
         END::smallint;
$$;

COMMENT ON FUNCTION app.precedencia_de_rol IS
  'Orden de privilegio declarado. Se usa para elegir el rol activo cuando un '
  'usuario tiene varias filas en roles_usuario (0024).';

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_auth_user_id uuid;
  v_usuario      public.usuarios%ROWTYPE;
  v_rol          rol_usuario;
  v_copropiedad  uuid;
  v_atendidas    uuid[];
  v_claims       jsonb;
BEGIN
  v_claims := coalesce(event->'claims', '{}'::jsonb);
  BEGIN
    v_auth_user_id := (event->>'user_id')::uuid;
  EXCEPTION WHEN others THEN
    -- Sin identificador utilizable se devuelve el evento intacto: el token sale
    -- SIN claims y el sistema falla cerrado. Inventar un rol aqui seria
    -- conceder acceso a quien no se ha podido identificar.
    RETURN event;
  END;

  SELECT * INTO v_usuario
    FROM public.usuarios
   WHERE auth_user_id = v_auth_user_id
     AND estado = 'activo';

  IF NOT FOUND THEN
    RETURN event;
  END IF;

  -- Rol activo: el mas privilegiado de los vigentes.
  SELECT r.rol, r.copropiedad_id
    INTO v_rol, v_copropiedad
    FROM public.roles_usuario r
   WHERE r.usuario_id = v_usuario.id
     AND r.estado = 'activo'
   ORDER BY app.precedencia_de_rol(r.rol) ASC, r.creado_en ASC
   LIMIT 1;

  IF v_rol IS NULL THEN
    -- Usuario dado de alta sin rol: no entra. Es un estado legitimo durante el
    -- aprovisionamiento y debe seguir fallando cerrado.
    RETURN event;
  END IF;

  v_claims := v_claims
    || jsonb_build_object('usuario_id', v_usuario.id)
    || jsonb_build_object('rol', v_rol);

  IF v_usuario.persona_id IS NOT NULL THEN
    v_claims := v_claims || jsonb_build_object('persona_id', v_usuario.persona_id);
  END IF;

  IF v_rol = 'superadministrador' THEN
    -- El superadministrador no pertenece a una copropiedad: su alcance es
    -- global y lo resuelve `app.es_superadmin()`. Fijarle una copropiedad
    -- concreta lo ataria a ella sin motivo.
    v_claims := v_claims || jsonb_build_object('copropiedad_id', NULL);

  ELSIF v_rol = 'operador_central' THEN
    -- HU-25, KPI-35: atiende varias, acotadas a su turno activo. Se emiten
    -- TODAS las vigentes y `copropiedad_id` queda nulo: el operador elige en la
    -- consola, y el guard comprueba la elegida contra este arreglo.
    SELECT array_agg(DISTINCT r.copropiedad_id ORDER BY r.copropiedad_id)
      INTO v_atendidas
      FROM public.roles_usuario r
     WHERE r.usuario_id = v_usuario.id
       AND r.rol = 'operador_central'
       AND r.estado = 'activo';

    v_claims := v_claims
      || jsonb_build_object('copropiedad_id', NULL)
      -- Tope de 64, el mismo que valida el esquema Zod de los claims: un
      -- arreglo sin techo agrandaria el token en cada peticion.
      || jsonb_build_object('copropiedades', to_jsonb(v_atendidas[1:64]));

  ELSE
    v_claims := v_claims || jsonb_build_object('copropiedad_id', v_copropiedad);
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Auth Hook de Supabase (Custom Access Token). Añade usuario_id, persona_id, '
  'rol, copropiedad_id y copropiedades al JWT. NO toca `aal` (ADR-008).';

-- ===== Permisos ==============================================================
-- `supabase_auth_admin` es el rol con el que GoTrue se conecta y el unico que
-- debe poder ejecutar el gancho. Lo trae la PLATAFORMA: una migracion que lo
-- creara estaria inventandose un rol del proveedor. Si falta, se para aqui con
-- un motivo legible en vez de morir en el primer GRANT — que es lo que pasaba
-- al reproducir el arranque en frio sobre un cluster desnudo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    RAISE EXCEPTION
      '0024: no existe el rol supabase_auth_admin. Lo aporta la plataforma '
      '(Supabase lo trae de fabrica); en un cluster propio hay que crearlo antes '
      'de aplicar esta migracion: CREATE ROLE supabase_auth_admin NOLOGIN;'
      USING ERRCODE = 'undefined_object';
  END IF;
END
$$;

-- Solo `supabase_auth_admin` la ejecuta. Si `authenticated` pudiera invocarla,
-- cualquier usuario podria pedirle los claims de otro pasandole su `user_id`.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT USAGE ON SCHEMA app TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION app.precedencia_de_rol(rol_usuario) TO supabase_auth_admin;
GRANT SELECT ON public.usuarios, public.roles_usuario TO supabase_auth_admin;

-- Las dos tablas estan en FORCE ROW LEVEL SECURITY, asi que `SECURITY DEFINER`
-- no basta: hace falta una politica que admita a este rol. Es de SOLO LECTURA y
-- acotada a las dos tablas que el gancho necesita.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'usuarios'
       AND policyname = 'auth_admin_lee_usuarios'
  ) THEN
    CREATE POLICY auth_admin_lee_usuarios ON public.usuarios
      AS PERMISSIVE FOR SELECT TO supabase_auth_admin USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'roles_usuario'
       AND policyname = 'auth_admin_lee_roles'
  ) THEN
    CREATE POLICY auth_admin_lee_roles ON public.roles_usuario
      AS PERMISSIVE FOR SELECT TO supabase_auth_admin USING (true);
  END IF;
END
$$;

-- ===== Asercion de despliegue ================================================
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'custom_access_token_hook';
  ASSERT n = 1, '0024: no existe public.custom_access_token_hook';

  SELECT count(*) INTO n FROM pg_policies
   WHERE policyname IN ('auth_admin_lee_usuarios', 'auth_admin_lee_roles');
  ASSERT n = 2, format('0024: faltan politicas de lectura para el gancho (%s de 2)', n);

  -- El gancho NO puede ser invocable por un usuario autenticado.
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'custom_access_token_hook'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  ASSERT n = 0, '0024: `authenticated` puede ejecutar el gancho de claims';
END
$$;
