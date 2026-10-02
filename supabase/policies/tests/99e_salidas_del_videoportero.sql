-- =============================================================================
-- 99e · SALIDAS DEL VIDEOPORTERO EN PUNTOS DE ACCESO · ETAPA 15-P · P3
--
-- Una prueba por cambio de la 0048, positiva y NEGATIVA: el administrador y el
-- superadministrador escriben salidas descubiertas sin zona; una puerta activa
-- por equipo; el portero las ve y no las escribe; otra copropiedad ni las ve ni
-- las escribe (KPI-35); no se borran (RN-19), ni siquiera el dueño; y la orden
-- manual queda atada a un punto DE SU copropiedad, con la puerta que mandó.
--
-- Todo dentro de una transacción que se DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE authenticated;

-- 1 · el ADMINISTRADOR de MIRA persiste dos salidas descubiertas del intercom.
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
INSERT INTO public.puntos_de_acceso (id, copropiedad_id, zona_id, dispositivo_id, nombre, tipo,
  numero_de_puerta, modulo, ruta_en_el_equipo, origen, descubierto_en)
VALUES
  ('99e00000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', NULL,
   '90000000-0000-4000-8000-000000000004', 'Cerradura 1', 'puerta', 1, 'Salidas del equipo',
   'equipo/propio/puerta-1', 'descubierto', now()),
  ('99e00000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', NULL,
   '90000000-0000-4000-8000-000000000004', 'Cerradura 2', 'puerta', 2, 'Salidas del equipo',
   'equipo/propio/puerta-2', 'descubierto', now());

DO $$
BEGIN
  -- Una puerta activa por equipo (ADR-04): la segunda «Cerradura 1» no entra.
  BEGIN
    INSERT INTO public.puntos_de_acceso (copropiedad_id, dispositivo_id, nombre, tipo,
      numero_de_puerta, origen, descubierto_en)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000004',
            'Otra vez la 1', 'puerta', 1, 'descubierto', now());
    RAISE EXCEPTION 'puntos_salida_activa_uk: aceptó dos salidas activas con la misma puerta';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- Descubierto sin puerta no es descubierto.
  BEGIN
    INSERT INTO public.puntos_de_acceso (copropiedad_id, dispositivo_id, nombre, tipo, origen)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000004',
            'Sin puerta', 'puerta', 'descubierto');
    RAISE EXCEPTION 'puntos_descubierto_coherente: aceptó una salida descubierta sin puerta';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Una puerta fuera del rango que el árbol admite.
  BEGIN
    INSERT INTO public.puntos_de_acceso (copropiedad_id, dispositivo_id, nombre, tipo,
      numero_de_puerta, origen, descubierto_en)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000004',
            'Puerta 99', 'puerta', 99, 'descubierto', now());
    RAISE EXCEPTION 'puntos_numero_de_puerta_valido: aceptó la puerta 99';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- El nombre se edita, y la auditoría dice quién.
  UPDATE public.puntos_de_acceso SET nombre = 'Portón peatonal'
   WHERE id = '99e00000-0000-4000-8000-000000000001';
  ASSERT (SELECT actualizado_por FROM public.puntos_de_acceso
           WHERE id = '99e00000-0000-4000-8000-000000000001')
         = '00000000-0000-4000-8000-000000000010',
         'puntos_de_acceso: el cambio de nombre no quedó atribuido al administrador';
  -- Y no se borra (RN-19): sin DELETE concedido.
  BEGIN
    DELETE FROM public.puntos_de_acceso WHERE id = '99e00000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'puntos_de_acceso: el administrador borró una salida';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99e · administrador de MIRA: escribe, renombra; ni duplica ni borra: ok';
END $$;

-- 2 · el SUPERADMINISTRADOR también administra el agregado, como en `dispositivos`.
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002"}';
INSERT INTO public.puntos_de_acceso (id, copropiedad_id, dispositivo_id, nombre, tipo,
  numero_de_puerta, origen, descubierto_en)
VALUES ('99e00000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001',
        '90000000-0000-4000-8000-000000000004', 'Cerradura 3', 'puerta', 3, 'descubierto', now());

-- 3 · el PORTERO de MIRA las ve, pero NO las escribe.
SET LOCAL request.jwt.claims = '{"rol":"portero","usuario_id":"00000000-0000-4000-8000-000000000011","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.puntos_de_acceso
   WHERE dispositivo_id = '90000000-0000-4000-8000-000000000004';
  ASSERT n = 3, format('puntos_de_acceso_lectura: el portero de MIRA ve %s salidas del intercom', n);
  BEGIN
    INSERT INTO public.puntos_de_acceso (copropiedad_id, dispositivo_id, nombre, tipo,
      numero_de_puerta, origen, descubierto_en)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000004',
            'Puerta del portero', 'puerta', 4, 'descubierto', now());
    RAISE EXCEPTION 'puntos_de_acceso_insercion: el portero escribió una salida';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.puntos_de_acceso SET nombre = 'Renombrada por el portero'
   WHERE id = '99e00000-0000-4000-8000-000000000002';
  ASSERT (SELECT nombre FROM public.puntos_de_acceso
           WHERE id = '99e00000-0000-4000-8000-000000000002') = 'Cerradura 2',
         'puntos_de_acceso_edicion: el portero renombró una salida';
  RAISE NOTICE '99e · portero de MIRA: las ve y no las escribe: ok';
END $$;

-- 4 · el ADMINISTRADOR de ROBLE ni ve ni escribe las de MIRA (KPI-35).
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000020","copropiedad_id":"10000000-0000-4000-8000-000000000002"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.puntos_de_acceso
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 0, format('puntos_de_acceso_lectura: ROBLE ve %s salidas de MIRA', n);
  BEGIN
    INSERT INTO public.puntos_de_acceso (copropiedad_id, dispositivo_id, nombre, tipo,
      numero_de_puerta, origen, descubierto_en)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000004',
            'Intrusa', 'puerta', 5, 'descubierto', now());
    RAISE EXCEPTION 'puntos_de_acceso_insercion: ROBLE escribió en MIRA';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99e · ROBLE frente a las salidas de MIRA: ni las ve ni las escribe: ok';
END $$;

-- 5 · la orden manual se ata a un punto DE SU copropiedad, con su puerta.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
INSERT INTO public.ordenes_manuales (id, copropiedad_id, accion, motivo, operador_id, rol,
  dispositivo_id, momento, punto_de_acceso_id, numero_de_puerta, creado_por, actualizado_por)
VALUES ('99e00000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-000000000001', 'abrir',
        'Visitante anunciado por el residente', '00000000-0000-4000-8000-000000000012',
        'operador_central', '90000000-0000-4000-8000-000000000004', now(),
        '99e00000-0000-4000-8000-000000000002', 2,
        '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000012');
DO $$
BEGIN
  -- Punto sin puerta (o puerta sin punto) es una orden a medias.
  BEGIN
    INSERT INTO public.ordenes_manuales (id, copropiedad_id, accion, motivo, operador_id, rol,
      dispositivo_id, momento, punto_de_acceso_id, creado_por, actualizado_por)
    VALUES (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', 'abrir',
            'Orden sin puerta declarada', '00000000-0000-4000-8000-000000000012',
            'operador_central', '90000000-0000-4000-8000-000000000004', now(),
            '99e00000-0000-4000-8000-000000000002',
            '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000012');
    RAISE EXCEPTION 'ordenes_manuales_punto_coherente: aceptó un punto sin puerta';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '99e · orden manual atada a su punto y a su puerta: ok';
END $$;

-- La copropiedad de la orden y la del punto tienen que coincidir: la clave
-- ajena es COMPUESTA. ROBLE no puede atar su orden a una salida de MIRA.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ordenes_manuales (id, copropiedad_id, accion, motivo, operador_id, rol,
      dispositivo_id, momento, punto_de_acceso_id, numero_de_puerta, creado_por, actualizado_por)
    VALUES (gen_random_uuid(), '10000000-0000-4000-8000-000000000002', 'abrir',
            'Abrir la salida del vecino', '00000000-0000-4000-8000-000000000012',
            'operador_central', '90000000-0000-4000-8000-000000000004', now(),
            '99e00000-0000-4000-8000-000000000002', 2,
            '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000012');
    RAISE EXCEPTION 'ordenes_manuales_punto_fk: ROBLE ató su orden a una salida de MIRA';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  RAISE NOTICE '99e · ROBLE no ata órdenes a salidas de MIRA: ok';
END $$;

-- 6 · ni el DUEÑO borra una salida (RN-19): la RLS forzada no le deja ver
-- ninguna fila que borrar y, si la viera, el disparador lo impediría.
RESET ROLE;
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.puntos_de_acceso'::regclass
     AND tgname = 'tg_prohibir_delete' AND tgenabled <> 'D';
  ASSERT n = 1, 'puntos_de_acceso: falta el disparador que impide el borrado, o está apagado';
  BEGIN
    DELETE FROM public.puntos_de_acceso WHERE id = '99e00000-0000-4000-8000-000000000003';
    GET DIAGNOSTICS n = ROW_COUNT;
    ASSERT n = 0, format('puntos_de_acceso: el dueño borró %s salida(s)', n);
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE 'puntos_de_acceso: el dueño borró%' THEN RAISE; END IF;
  END;
  RAISE NOTICE '99e · el dueño tampoco borra salidas: ok';
END $$;

ROLLBACK;
