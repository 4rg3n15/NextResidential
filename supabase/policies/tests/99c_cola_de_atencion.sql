-- =============================================================================
-- 99c · PREFERENCIAS DE ATENCIÓN · ETAPA 15-N (G2)
--
-- Prueba positiva y NEGATIVA de la 0046: el administrador de la copropiedad
-- guarda sus preferencias y el portero las lee; el portero NO las cambia; el
-- residente no las ve; otra copropiedad ni las ve ni las toca; y un valor que
-- no es un objeto lo rechaza la base. Todo en una transaccion que se DESHACE.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE authenticated;

-- 1 · el ADMINISTRADOR de MIRA guarda las preferencias.
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000001","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
INSERT INTO public.preferencias_de_atencion (copropiedad_id, preferencias, creado_por, actualizado_por)
VALUES ('10000000-0000-4000-8000-000000000001', '{"llamada":{"abrir":true,"sonar":false}}',
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
DO $$
BEGIN
  BEGIN
    UPDATE public.preferencias_de_atencion SET preferencias = '[]'::jsonb
     WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'preferencias_de_atencion: acepto un arreglo en vez de un objeto';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '99c · administrador de MIRA: guarda un objeto; un arreglo, no: ok';
END $$;

-- 2 · el PORTERO de MIRA las lee y NO las cambia.
SET LOCAL request.jwt.claims = '{"rol":"portero","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.preferencias_de_atencion
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 1, format('preferencias_de_atencion_lectura: el portero ve %s filas', n);
  UPDATE public.preferencias_de_atencion SET preferencias = '{}'::jsonb
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'preferencias_de_atencion_edicion: el portero las cambio';
  RAISE NOTICE '99c · portero de MIRA: lee y no cambia: ok';
END $$;

-- 3 · el RESIDENTE no las ve.
SET LOCAL request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000004","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.preferencias_de_atencion;
  ASSERT n = 0, format('preferencias_de_atencion_lectura: el residente ve %s filas', n);
  RAISE NOTICE '99c · residente: no las ve: ok';
END $$;

-- 4 · el administrador de OTRA copropiedad ni las ve ni las cambia.
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000001","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.preferencias_de_atencion
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 0, format('preferencias_de_atencion_lectura: otra copropiedad ve %s filas', n);
  UPDATE public.preferencias_de_atencion SET preferencias = '{}'::jsonb
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'preferencias_de_atencion_edicion: otra copropiedad las cambio';
  BEGIN
    INSERT INTO public.preferencias_de_atencion (copropiedad_id, preferencias, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '{}',
            '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'preferencias_de_atencion_insercion: otra copropiedad inserto en MIRA';
  EXCEPTION WHEN insufficient_privilege OR unique_violation THEN NULL;
  END;
  RAISE NOTICE '99c · otra copropiedad: ni ve ni cambia: ok';
END $$;

ROLLBACK;
