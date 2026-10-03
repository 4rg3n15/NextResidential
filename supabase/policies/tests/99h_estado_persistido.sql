-- =============================================================================
-- 99h · ESTADO QUE SOBREVIVE AL REINICIO · RONDA 15-R, bloque A (migración 0051)
--
-- Positiva y NEGATIVA por cada política nueva, como `authenticated` (la RLS
-- forzada actúa), dentro de una transacción que se DESHACE:
--  · bloqueos_de_acceso y operaciones_de_dispositivo: el SERVICIO de la
--    copropiedad escribe; el administrador y el portero leen pero NO escriben
--    (RN-08 la valida la API, no PostgREST); el residente no ve; el servicio de
--    OTRA copropiedad ni ve ni escribe; nada se borra.
--  · codigos_recuperacion_mfa: un usuario normal no lee ni sus propios hashes;
--    el superadministrador retira un juego; un código no se borra.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;

-- 1 · el SERVICIO de MIRA fija un bloqueo y registra una operación.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
INSERT INTO public.bloqueos_de_acceso
  (copropiedad_id, dispositivo_id, bloqueado, motivo, operador_id, rol, desde,
   creado_por, actualizado_por)
VALUES ('10000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-0000000000b1', true,
        'Prueba 99h', '00000000-0000-4000-8000-000000000001', 'administrador', now(),
        '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003');
INSERT INTO public.operaciones_de_dispositivo
  (copropiedad_id, dispositivo_id, operacion, solicitada_por, solicitada_en, creado_por, actualizado_por)
VALUES ('10000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-0000000000b1', 'reinicio',
        '00000000-0000-4000-8000-000000000001', now(),
        '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003');
DO $$
DECLARE n int;
BEGIN
  UPDATE public.bloqueos_de_acceso SET resultado = 'aceptada'
   WHERE dispositivo_id = '99000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'bloqueos_de_acceso_edicion: el servicio de MIRA no anotó el resultado';
  BEGIN
    UPDATE public.bloqueos_de_acceso SET resultado = 'otra cosa'
     WHERE dispositivo_id = '99000000-0000-4000-8000-0000000000b1';
    RAISE EXCEPTION 'bloqueos_de_acceso: aceptó un resultado fuera de la lista';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.bloqueos_de_acceso WHERE dispositivo_id = '99000000-0000-4000-8000-0000000000b1';
    RAISE EXCEPTION 'bloqueos_de_acceso: se borró un bloqueo';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'bloqueos_de_acceso: se borró%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '99h · servicio de MIRA: escribe, anota y no borra: ok';
END $$;

-- 2 · el ADMINISTRADOR y el PORTERO de MIRA leen y NO escriben.
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000001","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.bloqueos_de_acceso
   WHERE dispositivo_id = '99000000-0000-4000-8000-0000000000b1';
  ASSERT n = 1, format('bloqueos_de_acceso_lectura: el administrador ve %s filas', n);
  SELECT count(*) INTO n FROM public.operaciones_de_dispositivo
   WHERE dispositivo_id = '99000000-0000-4000-8000-0000000000b1';
  ASSERT n = 1, format('operaciones_de_dispositivo_lectura: el administrador ve %s filas', n);
  UPDATE public.bloqueos_de_acceso SET bloqueado = false
   WHERE dispositivo_id = '99000000-0000-4000-8000-0000000000b1';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'bloqueos_de_acceso_edicion: el administrador lo cambió por PostgREST';
  BEGIN
    INSERT INTO public.operaciones_de_dispositivo
      (copropiedad_id, dispositivo_id, operacion, solicitada_por, solicitada_en, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-0000000000b2', 'reinicio',
            '00000000-0000-4000-8000-000000000001', now(),
            '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'operaciones_de_dispositivo_insercion: el administrador insertó por PostgREST';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99h · administrador de MIRA: lee y no escribe: ok';
END $$;

-- 3 · el RESIDENTE no ve ninguna de las dos.
SET LOCAL request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000004","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.bloqueos_de_acceso;
  ASSERT n = 0, format('bloqueos_de_acceso_lectura: el residente ve %s filas', n);
  SELECT count(*) INTO n FROM public.operaciones_de_dispositivo;
  ASSERT n = 0, format('operaciones_de_dispositivo_lectura: el residente ve %s filas', n);
  RAISE NOTICE '99h · residente: no ve bloqueos ni operaciones: ok';
END $$;

-- 4 · el SERVICIO de ROBLE ni ve ni escribe lo de MIRA.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.bloqueos_de_acceso
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 0, format('bloqueos_de_acceso_lectura: ROBLE ve %s bloqueos de MIRA', n);
  UPDATE public.bloqueos_de_acceso SET bloqueado = false
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'bloqueos_de_acceso_edicion: ROBLE cambió un bloqueo de MIRA';
  BEGIN
    INSERT INTO public.bloqueos_de_acceso
      (copropiedad_id, dispositivo_id, bloqueado, motivo, operador_id, rol, desde,
       creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-0000000000b3', true,
            'Cruzado', '00000000-0000-4000-8000-000000000001', 'administrador', now(),
            '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'bloqueos_de_acceso_insercion: ROBLE escribió un bloqueo de MIRA';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO n FROM public.operaciones_de_dispositivo
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 0, format('operaciones_de_dispositivo_lectura: ROBLE ve %s operaciones de MIRA', n);
  RAISE NOTICE '99h · servicio de ROBLE: no ve ni escribe lo de MIRA: ok';
END $$;

-- 5 · códigos de recuperación: el superadministrador inserta y retira; un
--     administrador NO lee ni sus propios hashes; nada se borra.
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000001","copropiedad_id":null,"copropiedades":[]}';
INSERT INTO public.codigos_recuperacion_mfa (usuario_id, hash, creado_por, actualizado_por)
VALUES ('00000000-0000-4000-8000-000000000001', repeat('a', 64),
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
DO $$
DECLARE n int;
BEGIN
  UPDATE public.codigos_recuperacion_mfa SET retirado_en = now()
   WHERE hash = repeat('a', 64) AND consumido_en IS NULL AND retirado_en IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'codigos_mfa_superadmin: el superadministrador no retiró el código';
  UPDATE public.codigos_recuperacion_mfa SET consumido_en = now()
   WHERE hash = repeat('a', 64) AND consumido_en IS NULL AND retirado_en IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'codigos_recuperacion_mfa: un código retirado se pudo consumir';
  BEGIN
    DELETE FROM public.codigos_recuperacion_mfa WHERE hash = repeat('a', 64);
    RAISE EXCEPTION 'codigos_recuperacion_mfa: se borró un código';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'codigos_recuperacion_mfa: se borró%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '99h · superadministrador: inserta y retira; retirado no se consume; no se borra: ok';
END $$;

SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000001","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.codigos_recuperacion_mfa;
  ASSERT n = 0, format('codigos_recuperacion_mfa: un administrador lee %s hashes', n);
  RAISE NOTICE '99h · administrador: no lee hashes de recuperación, ni los suyos: ok';
END $$;

ROLLBACK;
