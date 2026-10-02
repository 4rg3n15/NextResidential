-- =============================================================================
-- 99d · CONVERSACIONES DE LA GUARDIA · ETAPA 15-P · P2
--
-- Una prueba por política de la 0047, positiva y NEGATIVA, más lo que la base
-- sostiene por su cuenta: la constancia no tiene columna para el audio, los
-- tramos son un arreglo, y la tabla es de SOLO INSERCIÓN también frente al
-- dueño (ADR-005).
--
-- Todo dentro de una transacción que se DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE authenticated;

-- 1 · el SERVICIO de MIRA (la API, que vio la conversación entera) la registra.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
INSERT INTO public.conversaciones_de_guardia (id, copropiedad_id, dispositivo_id, operador_id,
  iniciada_en, terminada_en, tramos, segundos_hablados, motivo_de_cierre, creado_por)
VALUES ('99d00000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        '90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011',
        now() - interval '2 minutes', now(),
        '[{"desde":"2026-10-01T12:00:00Z","hasta":"2026-10-01T12:00:04Z"}]', 4.0,
        'El operador colgó', '00000000-0000-4000-8000-000000000003');

DO $$
DECLARE n int;
BEGIN
  -- Sin columna para el audio: la constancia es metadato y nada más.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'conversaciones_de_guardia'
     AND (data_type = 'bytea' OR column_name ILIKE '%audio%');
  ASSERT n = 0, format('conversaciones_de_guardia: %s columna(s) que podrían guardar audio', n);
  -- Una conversación que acaba antes de empezar no es una conversación.
  BEGIN
    INSERT INTO public.conversaciones_de_guardia (id, copropiedad_id, dispositivo_id,
      operador_id, iniciada_en, terminada_en, motivo_de_cierre, creado_por)
    VALUES (gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
            '90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011',
            now(), now() - interval '1 minute', 'x', '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'conversaciones_de_guardia: aceptó un fin anterior al inicio';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Los tramos son un arreglo, no un texto libre.
  BEGIN
    INSERT INTO public.conversaciones_de_guardia (id, copropiedad_id, dispositivo_id,
      operador_id, iniciada_en, terminada_en, tramos, motivo_de_cierre, creado_por)
    VALUES (gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
            '90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011',
            now(), now(), '{"audio":"..."}', 'x', '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'conversaciones_de_guardia: aceptó tramos que no son un arreglo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '99d · servicio: registra; fin antes de inicio y tramos sin forma, no: ok';
END $$;

-- 2 · el PORTERO de MIRA la ve, pero NO la escribe: el rastro lo pone la API.
SET LOCAL request.jwt.claims = '{"rol":"portero","usuario_id":"00000000-0000-4000-8000-000000000011","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversaciones_de_guardia;
  ASSERT n = 1, format('conversaciones_lectura: el portero de MIRA ve %s', n);
  BEGIN
    INSERT INTO public.conversaciones_de_guardia (id, copropiedad_id, dispositivo_id,
      operador_id, iniciada_en, terminada_en, motivo_de_cierre, creado_por)
    VALUES (gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
            '90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011',
            now(), now(), 'escrita a mano', '00000000-0000-4000-8000-000000000011');
    RAISE EXCEPTION 'conversaciones_insercion: el portero escribió el rastro a mano';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99d · portero de MIRA: la ve y no la escribe: ok';
END $$;

-- 3 · ROBLE ni ve ni escribe las de MIRA (KPI-35).
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversaciones_de_guardia;
  ASSERT n = 0, 'conversaciones_lectura: el servicio de ROBLE ve conversaciones de MIRA';
  BEGIN
    INSERT INTO public.conversaciones_de_guardia (id, copropiedad_id, dispositivo_id,
      operador_id, iniciada_en, terminada_en, motivo_de_cierre, creado_por)
    VALUES (gen_random_uuid(), '10000000-0000-4000-8000-000000000001',
            '90000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011',
            now(), now(), 'de ROBLE en MIRA', '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'conversaciones_insercion: ROBLE escribió en MIRA';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99d · aislamiento: ROBLE ni lee ni escribe en MIRA: ok';
END $$;

-- 4 · el RESIDENTE de MIRA no la ve.
SET LOCAL request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.conversaciones_de_guardia;
  ASSERT n = 0, format('conversaciones_lectura: el residente ve %s', n);
  RAISE NOTICE '99d · residente: no la ve: ok';
END $$;

-- 5 · solo inserción, también frente al DUEÑO (ADR-005).
RESET ROLE;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'conversaciones_de_guardia'
     AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');
  ASSERT n = 0, format('las conversaciones conservan %s privilegios de escritura', n);
  BEGIN
    UPDATE public.conversaciones_de_guardia SET motivo_de_cierre = 'otro'
     WHERE id = '99d00000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'conversaciones_de_guardia: UPDATE aceptado';
  EXCEPTION WHEN insufficient_privilege OR restrict_violation OR raise_exception THEN
    IF SQLERRM LIKE 'conversaciones_de_guardia: UPDATE aceptado' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.conversaciones_de_guardia WHERE id = '99d00000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'conversaciones_de_guardia: DELETE aceptado';
  EXCEPTION WHEN insufficient_privilege OR restrict_violation OR raise_exception THEN
    IF SQLERRM LIKE 'conversaciones_de_guardia: DELETE aceptado' THEN RAISE; END IF;
  END;
  RAISE NOTICE '99d · solo inserción frente al dueño: ok';
END $$;

ROLLBACK;
