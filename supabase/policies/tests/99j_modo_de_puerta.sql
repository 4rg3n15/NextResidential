-- =============================================================================
-- 99j · PUERTA LIBRE Y BLOQUEADA · RONDA 15-R, bloque C (migración 0053)
--
-- Positiva y NEGATIVA por cada política, como `authenticated`, en una
-- transacción que se DESHACE:
--  · ordenes_de_modo_de_puerta: escribe sólo el servicio de SU copropiedad; el
--    administrador lee y no escribe; el residente no ve; el servicio de otra
--    copropiedad ni ve ni anota; el resultado se anota UNA vez y nada más
--    cambia; nadie borra; libre sin plazo no entra.
--  · ajustes_de_puertas: el administrador de la copropiedad fija la duración
--    dentro del tope; el portero no; el de otra copropiedad tampoco.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
INSERT INTO public.ordenes_de_modo_de_puerta
  (id, copropiedad_id, dispositivo_id, numero_de_puerta, modo, origen, motivo, operador_id, rol,
   ordenada_en, revierte_en, creado_por, actualizado_por)
VALUES ('99000000-0000-4000-8000-0000000000d1', '10000000-0000-4000-8000-000000000001',
        '99000000-0000-4000-8000-0000000000c1', 1, 'libre', 'consola', 'Mudanza en curso 99j',
        '00000000-0000-4000-8000-000000000010', 'administrador', now(), now() + interval '2 hours',
        '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003');
DO $$
DECLARE n int;
BEGIN
  -- El resultado se anota una vez.
  UPDATE public.ordenes_de_modo_de_puerta SET resultado = 'aceptada'
   WHERE id = '99000000-0000-4000-8000-0000000000d1';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'ordenes_modo_puerta_resultado: el servicio de MIRA no anotó el resultado';
  -- NEGATIVA · ni una segunda vez, ni otra columna.
  BEGIN
    UPDATE public.ordenes_de_modo_de_puerta SET resultado = 'rechazada'
     WHERE id = '99000000-0000-4000-8000-0000000000d1';
    RAISE EXCEPTION 'tg_orden_de_modo_solo_resultado: se reescribió un resultado';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- NEGATIVA · libre sin plazo de reversión no entra.
  BEGIN
    INSERT INTO public.ordenes_de_modo_de_puerta
      (copropiedad_id, dispositivo_id, numero_de_puerta, modo, origen, motivo, operador_id, rol,
       ordenada_en, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-0000000000c1', 1,
            'libre', 'consola', 'Sin plazo', '00000000-0000-4000-8000-000000000010',
            'administrador', now(), '00000000-0000-4000-8000-000000000003',
            '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'ordenes_modo_puerta_caduca: entró una puerta libre sin plazo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- NEGATIVA · nadie borra.
  BEGIN
    DELETE FROM public.ordenes_de_modo_de_puerta WHERE id = '99000000-0000-4000-8000-0000000000d1';
    RAISE EXCEPTION 'ordenes_de_modo_de_puerta: el servicio borró una orden';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- El administrador de MIRA lee, pero no escribe órdenes por su cuenta.
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001","aal":"aal2"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.ordenes_de_modo_de_puerta
   WHERE id = '99000000-0000-4000-8000-0000000000d1';
  ASSERT n = 1, 'ordenes_modo_puerta_lectura: el administrador de MIRA no ve la orden';
  BEGIN
    INSERT INTO public.ordenes_de_modo_de_puerta
      (copropiedad_id, dispositivo_id, numero_de_puerta, modo, origen, motivo, operador_id, rol,
       ordenada_en, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-0000000000c1', 1,
            'normal', 'consola', 'Directo', '00000000-0000-4000-8000-000000000010',
            'administrador', now(), '00000000-0000-4000-8000-000000000010',
            '00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'ordenes_modo_puerta_insercion: el administrador escribió saltándose la API';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Ajustes: el administrador fija la duración dentro del tope, no fuera.
  INSERT INTO public.ajustes_de_puertas (copropiedad_id, duracion_maxima_minutos, creado_por, actualizado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', 60,
          '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010')
  ON CONFLICT (copropiedad_id) DO UPDATE SET duracion_maxima_minutos = 60;
  BEGIN
    UPDATE public.ajustes_de_puertas SET duracion_maxima_minutos = 10000
     WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'ajustes_puertas_duracion: se pasó del tope de plataforma';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- NEGATIVA · el portero no cambia la duración; el residente no ve órdenes.
SET LOCAL request.jwt.claims = '{"rol":"portero","usuario_id":"00000000-0000-4000-8000-000000000011","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  UPDATE public.ajustes_de_puertas SET duracion_maxima_minutos = 700
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'ajustes_puertas_edicion: el portero cambió la duración máxima';
END $$;
SET LOCAL request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.ordenes_de_modo_de_puerta;
  ASSERT n = 0, 'ordenes_modo_puerta_lectura: el residente ve órdenes de puerta';
END $$;

-- NEGATIVA · el servicio y el administrador de ROBLE no alcanzan MIRA.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.ordenes_de_modo_de_puerta
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 0, 'ordenes_modo_puerta_lectura: el servicio de ROBLE ve órdenes de MIRA';
  BEGIN
    INSERT INTO public.ordenes_de_modo_de_puerta
      (copropiedad_id, dispositivo_id, numero_de_puerta, modo, origen, motivo, operador_id, rol,
       ordenada_en, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-0000000000c1', 1,
            'normal', 'reversion_automatica', 'Cruce', '00000000-0000-4000-8000-000000000003',
            'servicio', now(), '00000000-0000-4000-8000-000000000003',
            '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'ordenes_modo_puerta_insercion: el servicio de ROBLE escribió en MIRA';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000020","copropiedad_id":"10000000-0000-4000-8000-000000000002","aal":"aal2"}';
DO $$
DECLARE n int;
BEGIN
  UPDATE public.ajustes_de_puertas SET duracion_maxima_minutos = 700
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'ajustes_puertas_edicion: el administrador de ROBLE cambió la duración de MIRA';
END $$;

ROLLBACK;
\echo '99j_modo_de_puerta.sql ok'
