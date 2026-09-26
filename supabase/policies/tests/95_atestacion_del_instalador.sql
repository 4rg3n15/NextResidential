-- =============================================================================
-- 95 · ATESTACIÓN DEL INSTALADOR · ETAPA 15-K · D-11
--
-- Una prueba por política de la 0039, positiva y NEGATIVA, más lo que la base
-- sostiene por su cuenta: una prueba en la que alguna placa abrió no es una
-- atestación, las dos placas deben ser distintas, y la tabla es de SOLO
-- INSERCIÓN también frente al dueño (ADR-005).
--
-- Todo dentro de una transacción que se DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE authenticated;

-- 1 · el SUPERADMINISTRADOR atesta la cámara sembrada de MIRA.
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002"}';
INSERT INTO public.atestaciones_de_equipo (id, copropiedad_id, dispositivo_id, firmware,
  placa_en_lista_blanca, placa_desconocida, ninguna_abrio, evidencia, creado_por)
VALUES ('95000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        '90000000-0000-4000-8000-000000000001', 'v2.4.1', 'ABC123', 'XYZ987', true,
        'Carril 1, 10:40. Dos pasadas; el brazo no subió en ninguna.',
        '00000000-0000-4000-8000-000000000002');

DO $$
BEGIN
  -- Una prueba en la que alguna abrió NO se registra como atestación.
  BEGIN
    INSERT INTO public.atestaciones_de_equipo (copropiedad_id, dispositivo_id, firmware,
      placa_en_lista_blanca, placa_desconocida, ninguna_abrio, evidencia, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
            'v2.4.1', 'ABC123', 'XYZ987', false, 'El brazo subió con la placa desconocida.',
            '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'atestación con una placa que abrió: aceptada';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- La misma placa dos veces no prueba nada.
  BEGIN
    INSERT INTO public.atestaciones_de_equipo (copropiedad_id, dispositivo_id, firmware,
      placa_en_lista_blanca, placa_desconocida, ninguna_abrio, evidencia, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
            'v2.4.1', 'ABC123', 'ABC123', true, 'Una sola placa, pasada dos veces por el carril.',
            '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'atestación con la misma placa dos veces: aceptada';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '95 · superadministrador: atesta; una prueba fallida o con una sola placa, no: ok';
END $$;

-- 2 · el ADMINISTRADOR de MIRA la ve, pero NO atesta.
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.atestaciones_de_equipo;
  ASSERT n = 1, format('atestaciones_lectura: el administrador ve %s atestaciones propias', n);
  BEGIN
    INSERT INTO public.atestaciones_de_equipo (copropiedad_id, dispositivo_id, firmware,
      placa_en_lista_blanca, placa_desconocida, ninguna_abrio, evidencia, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
            'v2.4.1', 'ABC123', 'XYZ987', true, 'El administrador intenta firmar la prueba.',
            '00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'atestaciones_insercion: el administrador atestó';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '95 · administrador: lee y no atesta: ok';
END $$;

-- 3 · el SERVICIO de MIRA (el registro del proveedor) la lee, pero NO atesta.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.atestaciones_de_equipo;
  ASSERT n = 1, format('atestaciones_lectura: el servicio ve %s', n);
  BEGIN
    INSERT INTO public.atestaciones_de_equipo (copropiedad_id, dispositivo_id, firmware,
      placa_en_lista_blanca, placa_desconocida, ninguna_abrio, evidencia, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
            'v2.4.1', 'ABC123', 'XYZ987', true, 'El proceso intenta atestar por su cuenta.',
            '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'atestaciones_insercion: el servicio atestó';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '95 · servicio: lee y no atesta: ok';
END $$;

-- 4 · ROBLE no ve nada de MIRA.
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000020","copropiedad_id":"10000000-0000-4000-8000-000000000002"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.atestaciones_de_equipo;
  ASSERT n = 0, 'atestaciones_lectura: el administrador de ROBLE ve atestaciones de MIRA';
  RAISE NOTICE '95 · aislamiento: ROBLE no ve las atestaciones de MIRA: ok';
END $$;

-- 5 · solo inserción, también frente al DUEÑO (ADR-005).
RESET ROLE;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'atestaciones_de_equipo'
     AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');
  ASSERT n = 0, format('las atestaciones conservan %s privilegios de escritura', n);
  BEGIN
    UPDATE public.atestaciones_de_equipo SET firmware = 'otro'
     WHERE id = '95000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'atestaciones: UPDATE aceptado';
  EXCEPTION WHEN insufficient_privilege OR restrict_violation OR raise_exception THEN
    IF SQLERRM LIKE 'atestaciones: UPDATE aceptado' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.atestaciones_de_equipo WHERE id = '95000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'atestaciones: DELETE aceptado';
  EXCEPTION WHEN insufficient_privilege OR restrict_violation OR raise_exception THEN
    IF SQLERRM LIKE 'atestaciones: DELETE aceptado' THEN RAISE; END IF;
  END;
  RAISE NOTICE '95 · atestaciones: sin UPDATE ni DELETE, tampoco para el dueño: ok';
END $$;

ROLLBACK;
