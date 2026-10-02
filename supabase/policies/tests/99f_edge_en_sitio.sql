-- =============================================================================
-- 99f · LA INSTANTÁNEA DEL EDGE · RONDA 15-Q · Q1 (migración 0049)
--
-- Positiva y NEGATIVA por cada cambio:
--  · el servicio de MIRA publica la versión siguiente de MIRA, y la versión
--    vigente de la copropiedad avanza con ella;
--  · no publica una versión que no sea la siguiente (RN-16);
--  · no publica en EL ROBLE (RN-15, KPI-37);
--  · no toca otra columna de la copropiedad que la versión, ni la hace
--    retroceder, ni toca la copropiedad de otro;
--  · el portero sigue sin poder publicar.
--
-- Todo dentro de una transacción que se DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';

DO $$
DECLARE
  v_antes  bigint;
  v_despues bigint;
  v_filas  integer;
BEGIN
  SELECT coalesce(max(numero), 0) INTO v_antes FROM public.versiones_de_reglas
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';

  -- 1 · positiva: la siguiente de MIRA, publicada por su servicio.
  INSERT INTO public.versiones_de_reglas
    (copropiedad_id, numero, hash, publicada_por, creado_por, actualizado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', v_antes + 1, repeat('c', 64),
          '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003',
          '00000000-0000-4000-8000-000000000003');
  SELECT version_reglas_actual INTO v_despues FROM public.copropiedades
   WHERE id = '10000000-0000-4000-8000-000000000001';
  IF v_despues <> v_antes + 1 THEN
    RAISE EXCEPTION '0049: la version vigente de la copropiedad no avanzo (% -> %)', v_antes, v_despues;
  END IF;

  -- 2 · negativa: saltarse un número (RN-16).
  BEGIN
    INSERT INTO public.versiones_de_reglas
      (copropiedad_id, numero, hash, publicada_por, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', v_antes + 5, repeat('d', 64),
            '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003',
            '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION '0049: acepto una version no consecutiva';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 3 · negativa: publicar en EL ROBLE con la identidad de MIRA (RN-15).
  BEGIN
    INSERT INTO public.versiones_de_reglas
      (copropiedad_id, numero, hash, publicada_por, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000002', 1, repeat('e', 64),
            '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003',
            '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION '0049: el servicio de MIRA publico en EL ROBLE';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 4 · negativa: cambiar el nombre de su copropiedad.
  BEGIN
    UPDATE public.copropiedades SET nombre = 'Otra'
     WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION '0049: el servicio cambio el nombre de la copropiedad';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- 5 · negativa: hacer retroceder la versión.
  BEGIN
    UPDATE public.copropiedades SET version_reglas_actual = 0
     WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION '0049: la version retrocedio';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 6 · negativa: tocar la copropiedad de otro. RLS la oculta: 0 filas.
  UPDATE public.copropiedades SET version_reglas_actual = version_reglas_actual + 1
   WHERE id = '10000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas <> 0 THEN
    RAISE EXCEPTION '0049: el servicio de MIRA movio la version de EL ROBLE';
  END IF;
END
$$;

-- 7 · negativa: el portero no publica (la política sigue siendo del administrador).
SET LOCAL request.jwt.claims = '{"rol":"portero","usuario_id":"00000000-0000-4000-8000-000000000011","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.versiones_de_reglas
      (copropiedad_id, numero, hash, publicada_por, creado_por, actualizado_por)
    SELECT '10000000-0000-4000-8000-000000000001', max(numero) + 1, repeat('f', 64),
           '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003',
           '00000000-0000-4000-8000-000000000003'
      FROM public.versiones_de_reglas
     WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION '0049: el portero publico una version';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$$;

\echo '99f_edge_en_sitio: ok'
ROLLBACK;
