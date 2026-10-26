-- =============================================================================
-- 99p · EL SERVICIO NOMBRA A QUIEN ACTUÓ EN SU COPROPIEDAD · D-145 (0060)
--
-- Como `authenticated`, en transacciones que se DESHACEN:
--  · positivas: el servicio de El Roble ve al operador de central que lo
--    atiende (su fila de `usuarios` es de Mira) y a los superadministradores;
--  · negativas: no ve al administrador de Mira (sin rol en El Roble), ni al
--    actor de sistema sin copropiedad ni rol; no escribe; y la central y el
--    portero no ganan nada.
-- =============================================================================

\set ON_ERROR_STOP on

-- El servicio de El Roble -----------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.usuarios WHERE id = '00000000-0000-4000-8000-000000000012';
  IF n <> 1 THEN RAISE EXCEPTION '99p: el servicio de El Roble no ve al operador de central que lo atiende'; END IF;

  SELECT count(*) INTO n FROM public.usuarios
   WHERE id IN ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
  IF n <> 2 THEN RAISE EXCEPTION '99p: el servicio de El Roble no ve a los superadministradores (%)', n; END IF;

  SELECT count(*) INTO n FROM public.usuarios WHERE id = '00000000-0000-4000-8000-000000000010';
  IF n <> 0 THEN RAISE EXCEPTION '99p: el servicio de El Roble ve al administrador de Mira'; END IF;

  SELECT count(*) INTO n FROM public.usuarios WHERE id = '00000000-0000-4000-8000-000000000013';
  IF n <> 0 THEN RAISE EXCEPTION '99p: el servicio de El Roble ve a un residente de Mira'; END IF;

  -- Roles: los de El Roble y los de superadministrador; ninguno más de Mira.
  SELECT count(*) INTO n FROM public.roles_usuario
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001' AND rol <> 'superadministrador';
  IF n <> 0 THEN RAISE EXCEPTION '99p: el servicio de El Roble lee % roles de Mira', n; END IF;

  UPDATE public.usuarios SET actualizado_en = now()
   WHERE id = '00000000-0000-4000-8000-000000000012';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION '99p: el servicio pudo editar al operador de central'; END IF;
END $$;
ROLLBACK;

-- El actor de sistema sin copropiedad ni rol sigue oculto (también para Mira) --
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000014","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.usuarios WHERE id = '00000000-0000-4000-8000-000000000003';
  IF n <> 0 THEN RAISE EXCEPTION '99p: el servicio ve al actor de sistema sin rol'; END IF;
  SELECT count(*) INTO n FROM public.usuarios WHERE id = '00000000-0000-4000-8000-000000000020';
  IF n <> 0 THEN RAISE EXCEPTION '99p: el servicio de Mira ve al administrador de El Roble'; END IF;
END $$;
ROLLBACK;

-- Ningún otro rol gana nada: el portero de Mira no ve al administrador de El Roble
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"rol":"portero","usuario_id":"00000000-0000-4000-8000-000000000011","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.usuarios
   WHERE id IN ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000020');
  IF n <> 0 THEN RAISE EXCEPTION '99p: el portero ve usuarios que no son suyos (%)', n; END IF;
END $$;
ROLLBACK;

\echo '99p_servicio_lee_operadores: OK'
