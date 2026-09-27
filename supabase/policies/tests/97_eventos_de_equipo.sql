-- =============================================================================
-- 97 · EVENTOS DE EQUIPO · ETAPA 15-L · BLOQUE B
--
-- Una prueba por política de la 0040, positiva y NEGATIVA, más lo que la base
-- sostiene por su cuenta: el equipo es de la copropiedad del evento (clave
-- ajena compuesta), un reenvío con la misma clave no duplica, y la tabla es de
-- SOLO INSERCIÓN también frente al dueño (ADR-005).
--
-- Todo dentro de una transacción que se DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE authenticated;

-- 1 · el SERVICIO de MIRA (el receptor de equipos) registra lo que emitió su terminal.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
INSERT INTO public.eventos_de_equipo (id, copropiedad_id, dispositivo_id, tipo, titulo,
  codigo_mayor, codigo_menor, origen, en_vivo, ocurrido_en, hora_del_equipo,
  clave_idempotencia, carga, creado_por)
VALUES ('97000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        '90000000-0000-4000-8000-000000000001', 'puerta_forzada', 'Puerta forzada',
        5, 27, 'equipo', true, now(), '2026-09-27T10:00:00-05:00',
        'c1.s1866.t20260927T1000000500', '{"eventType":"AccessControllerEvent"}',
        '00000000-0000-4000-8000-000000000003');

DO $$
BEGIN
  -- B3 · el equipo reenvía: la misma clave no crea una segunda fila.
  BEGIN
    INSERT INTO public.eventos_de_equipo (copropiedad_id, dispositivo_id, tipo, titulo,
      origen, en_vivo, ocurrido_en, clave_idempotencia, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
            'puerta_forzada', 'Puerta forzada', 'equipo', true, now(),
            'c1.s1866.t20260927T1000000500', '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'eventos_de_equipo: el reenvío duplicó la fila';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- Un código sin catalogar se guarda con sus números; un tipo con forma libre, no.
  BEGIN
    INSERT INTO public.eventos_de_equipo (copropiedad_id, dispositivo_id, tipo, titulo,
      origen, en_vivo, ocurrido_en, clave_idempotencia, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
            'Tipo <script>', 'x', 'equipo', true, now(), 'clave-tipo-libre-1',
            '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'eventos_de_equipo: aceptó un tipo con forma libre';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- R1 en la base: un evento de MIRA no puede nombrar un equipo que no es de MIRA.
  BEGIN
    INSERT INTO public.eventos_de_equipo (copropiedad_id, dispositivo_id, tipo, titulo,
      origen, en_vivo, ocurrido_en, clave_idempotencia, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000ee',
            'desconocido', 'Evento del equipo', 'equipo', true, now(), 'clave-equipo-ajeno-1',
            '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'eventos_de_equipo: aceptó un equipo que no es de la copropiedad';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  RAISE NOTICE '97 · servicio: registra; el reenvío, el tipo libre y el equipo ajeno, no: ok';
END $$;

-- 2 · el PORTERO de MIRA lo ve: es su consola de eventos.
SET LOCAL request.jwt.claims = '{"rol":"portero","usuario_id":"00000000-0000-4000-8000-000000000011","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.eventos_de_equipo;
  ASSERT n = 1, format('eventos_de_equipo_lectura: el portero de MIRA ve %s', n);
  RAISE NOTICE '97 · portero de MIRA: lo ve: ok';
END $$;

-- 3 · ROBLE no ve nada de MIRA, ni puede escribir en MIRA.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.eventos_de_equipo;
  ASSERT n = 0, 'eventos_de_equipo_lectura: el servicio de ROBLE ve eventos de MIRA';
  BEGIN
    INSERT INTO public.eventos_de_equipo (copropiedad_id, dispositivo_id, tipo, titulo,
      origen, en_vivo, ocurrido_en, clave_idempotencia, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001',
            'timbre', 'Timbre', 'equipo', true, now(), 'clave-roble-en-mira',
            '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'eventos_de_equipo_insercion: ROBLE escribió en MIRA';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '97 · aislamiento: ROBLE ni lee ni escribe en MIRA: ok';
END $$;

-- 4 · el RESIDENTE de MIRA no lo ve: un evento de equipo no es de una vivienda.
SET LOCAL request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.eventos_de_equipo;
  ASSERT n = 0, format('eventos_de_equipo_lectura: el residente ve %s', n);
  RAISE NOTICE '97 · residente: no lo ve: ok';
END $$;

-- 5 · solo inserción, también frente al DUEÑO (ADR-005).
RESET ROLE;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'eventos_de_equipo'
     AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');
  ASSERT n = 0, format('los eventos de equipo conservan %s privilegios de escritura', n);
  BEGIN
    UPDATE public.eventos_de_equipo SET titulo = 'otro'
     WHERE id = '97000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'eventos_de_equipo: UPDATE aceptado';
  EXCEPTION WHEN insufficient_privilege OR restrict_violation OR raise_exception THEN
    IF SQLERRM LIKE 'eventos_de_equipo: UPDATE aceptado' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.eventos_de_equipo WHERE id = '97000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'eventos_de_equipo: DELETE aceptado';
  EXCEPTION WHEN insufficient_privilege OR restrict_violation OR raise_exception THEN
    IF SQLERRM LIKE 'eventos_de_equipo: DELETE aceptado' THEN RAISE; END IF;
  END;
  RAISE NOTICE '97 · eventos de equipo: sin UPDATE ni DELETE, tampoco para el dueño: ok';
END $$;

ROLLBACK;
