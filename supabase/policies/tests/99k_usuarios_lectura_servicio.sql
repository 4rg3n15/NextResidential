-- =============================================================================
-- 99k · EL SERVICIO LEE LOS USUARIOS DE SU COPROPIEDAD · ronda 15-R, E2 (0054)
--
-- Como `authenticated`, en una transacción que se DESHACE:
--  · positiva: el servicio de Mira ve a su residente;
--  · negativas: no ve al administrador de El Roble, ni al superadministrador
--    (copropiedad NULL), ni puede escribir en `usuarios`.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.usuarios WHERE id = '00000000-0000-4000-8000-000000000013';
  IF n <> 1 THEN RAISE EXCEPTION '99k: el servicio de Mira no ve a su residente (%)', n; END IF;

  SELECT count(*) INTO n FROM public.usuarios WHERE id = '00000000-0000-4000-8000-000000000020';
  IF n <> 0 THEN RAISE EXCEPTION '99k: el servicio de Mira ve al administrador de El Roble'; END IF;

  -- El propio actor de servicio (copropiedad NULL) se ve por `usuarios_lectura`
  -- (`id = app.usuario_id()`), no por la 0054; ningún OTRO sin copropiedad.
  SELECT count(*) INTO n FROM public.usuarios
   WHERE copropiedad_id IS NULL AND id <> app.usuario_id();
  IF n <> 0 THEN RAISE EXCEPTION '99k: el servicio ve usuarios sin copropiedad (%)', n; END IF;

  UPDATE public.usuarios SET actualizado_en = now()
   WHERE id = '00000000-0000-4000-8000-000000000013';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION '99k: el servicio pudo editar un usuario'; END IF;
END $$;

ROLLBACK;
\echo '99k_usuarios_lectura_servicio: OK'
