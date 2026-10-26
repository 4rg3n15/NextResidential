-- =============================================================================
-- 0060 · EL SERVICIO DE UNA COPROPIEDAD NOMBRA A QUIEN ACTUÓ EN ELLA · D-145
--
-- HALLAZGO de la revisión del PR del buscador de eventos (D-145): el historial
-- mostraba «Operador sin nombre» para dos clases de operador, porque la 0054
-- sólo deja al servicio de X leer los usuarios CUYA copropiedad es X:
--   · el OPERADOR DE CENTRAL que atiende X por una asignación en
--     `roles_usuario` pero cuya fila de `usuarios` es de otra copropiedad;
--   · el SUPERADMINISTRADOR, que no tiene copropiedad (`copropiedad_id` NULL).
-- Los dos dejan su `operador_id` en los eventos de X al abrir o negar a mano.
--
-- DECISIÓN (cliente, 26/10): ampliar la lectura del SERVICIO, y sólo la suya.
--   1. `roles_usuario_lectura_servicio`: el servicio de X lee los roles de X
--      y los roles de superadministrador. Hace falta para la 2: con FORCE, la
--      RLS de `roles_usuario` también se aplica dentro de la política de
--      `usuarios` (ni SECURITY DEFINER la evita, 0018).
--   2. `usuarios_lectura_servicio_por_rol`: el servicio de X lee a quien tiene
--      o TUVO un rol en X (la atribución de un evento antiguo no se pierde
--      porque el turno terminara) y a los superadministradores.
--
-- Lo que NO cambia: los demás roles (administrador, portero, central,
-- residente) no ganan nada —las dos políticas exigen `app.rol() = 'servicio'`—,
-- el servicio de X sigue sin ver a un usuario de otra copropiedad que no haya
-- tenido rol en X, y sigue sin ver otros usuarios sin copropiedad (actores de
-- sistema). Sólo lectura: ni INSERT ni UPDATE ni DELETE.
--
-- Sin recursión: la política de `roles_usuario` no lee `usuarios`.
-- Prueba: `supabase/policies/tests/99p_servicio_lee_operadores.sql`.
-- Reversión: `supabase/reversion/0060_revert.sql`.
-- =============================================================================

DROP POLICY IF EXISTS roles_usuario_lectura_servicio ON public.roles_usuario;
CREATE POLICY roles_usuario_lectura_servicio ON public.roles_usuario FOR SELECT
  USING (
    app.rol() = 'servicio'
    AND app.copropiedad_id() IS NOT NULL
    AND (app.es_servicio(copropiedad_id) OR rol = 'superadministrador')
  );
COMMENT ON POLICY roles_usuario_lectura_servicio ON public.roles_usuario IS
  'D-145 (0060) · el servicio de una copropiedad lee los roles de ESA copropiedad y los de '
  'superadministrador: es lo que deja nombrar a quien actuó en ella.';

DROP POLICY IF EXISTS usuarios_lectura_servicio_por_rol ON public.usuarios;
CREATE POLICY usuarios_lectura_servicio_por_rol ON public.usuarios FOR SELECT
  USING (
    app.rol() = 'servicio'
    AND app.copropiedad_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.roles_usuario r
       WHERE r.usuario_id = usuarios.id
         AND (app.es_servicio(r.copropiedad_id) OR r.rol = 'superadministrador')
    )
  );
COMMENT ON POLICY usuarios_lectura_servicio_por_rol ON public.usuarios IS
  'D-145 (0060) · el servicio de una copropiedad lee a quien tiene o tuvo un rol en ella '
  '(el operador de central asignado) y a los superadministradores, para nombrar al operador '
  'de un evento. Sólo lectura y sólo el rol servicio.';

-- Aserción de despliegue: las dos políticas existen, son de lectura y la RLS
-- de las dos tablas sigue forzada.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public'
     AND ((tablename = 'roles_usuario' AND policyname = 'roles_usuario_lectura_servicio')
       OR (tablename = 'usuarios' AND policyname = 'usuarios_lectura_servicio_por_rol'))
     AND cmd = 'SELECT';
  IF n <> 2 THEN
    RAISE EXCEPTION '0060 incompleta: % de 2 políticas de lectura del servicio', n;
  END IF;
  IF NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.usuarios'::regclass)
     OR NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.roles_usuario'::regclass) THEN
    RAISE EXCEPTION '0060: la RLS de usuarios o de roles_usuario dejó de estar forzada';
  END IF;
END $$;
