-- =============================================================================
-- 99n · TOPES POR OMISIÓN 5 Y 10 · RONDA 15-Z1 · D-Z1 · D-Z2 · migración 0058
--
-- Lo que la base sostiene por su cuenta:
--   1 · los DEFAULT son 5 (vehículos propios) y 10 (plazas), y la copropiedad
--       de la semilla los tiene (por omisión en una base nueva; por la 0058 en
--       una que ya existía);
--   2 · la 0058 lleva al nuevo valor SÓLO a quien estaba en el anterior (2 y
--       4), con una fila de auditoría por cambio, y no se repite (idempotente);
--       quien tenía otro valor (3 y 6) lo conserva;
--   3 · vehículos propios: el quinto entra, el sexto no;
--   4 · plazas con el tope de la copropiedad: la décima entra, la undécima no;
--   5 · una vivienda con tope propio 3 sigue en 3: la cuarta no entra.
-- La concurrencia sobre el último cupo la prueban `99n_vehiculos_concurrentes.sh`
-- y `99l_plazas_concurrentes.sh`.
--
-- Todo dentro de una transacción que se DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';

-- ---------------------------------------------------------------------------
-- 1 · Los valores por omisión, y la copropiedad de la semilla.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v text; n int;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v
    FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = 'public.copropiedades'::regclass AND a.attname = 'tope_vehiculos_propios';
  ASSERT v = '5', format('tope_vehiculos_propios: DEFAULT %s, no 5', v);
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v
    FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
   WHERE d.adrelid = 'public.copropiedades'::regclass AND a.attname = 'tope_de_plazas_por_vivienda';
  ASSERT v = '10', format('tope_de_plazas_por_vivienda: DEFAULT %s, no 10', v);
  SELECT tope_vehiculos_propios INTO n FROM public.copropiedades WHERE id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 5, format('la copropiedad de la semilla tiene tope de vehículos %s, no 5', n);
  SELECT tope_de_plazas_por_vivienda INTO n FROM public.copropiedades WHERE id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 10, format('la copropiedad de la semilla tiene tope de plazas %s, no 10', n);
  RAISE NOTICE '99n · DEFAULT 5 y 10, y la copropiedad de la semilla los tiene: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 2 · La 0058 sobre una copropiedad en el valor anterior (2 y 4), y sobre una
--     con valores decididos (3 y 6). ROBLE hace de las dos.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int; a int;
BEGIN
  UPDATE public.copropiedades SET tope_vehiculos_propios = 2, tope_de_plazas_por_vivienda = 4
   WHERE id = '10000000-0000-4000-8000-000000000002';
  n := app.aplicar_topes_por_omision_0058('10000000-0000-4000-8000-000000000002');
  ASSERT n = 2, format('la 0058 cambió %s ajustes de ROBLE, no 2', n);
  SELECT tope_vehiculos_propios INTO n FROM public.copropiedades WHERE id = '10000000-0000-4000-8000-000000000002';
  ASSERT n = 5, format('ROBLE quedó con tope de vehículos %s, no 5', n);
  SELECT tope_de_plazas_por_vivienda INTO n FROM public.copropiedades WHERE id = '10000000-0000-4000-8000-000000000002';
  ASSERT n = 10, format('ROBLE quedó con tope de plazas %s, no 10', n);
  SELECT count(*) INTO a FROM public.auditoria_seguridad
   WHERE copropiedad_id_objetivo = '10000000-0000-4000-8000-000000000002'
     AND tipo = 'cambio_configuracion' AND identificador_solicitado LIKE 'migración 0058 · %';
  ASSERT a = 2, format('la 0058 dejó %s filas de auditoría en ROBLE, no 2', a);
  -- Idempotente: la segunda pasada no cambia nada ni audita de nuevo.
  n := app.aplicar_topes_por_omision_0058('10000000-0000-4000-8000-000000000002');
  ASSERT n = 0, format('la 0058 repetida cambió %s ajustes', n);
  -- Y quien decidió otro valor lo conserva.
  UPDATE public.copropiedades SET tope_vehiculos_propios = 3, tope_de_plazas_por_vivienda = 6
   WHERE id = '10000000-0000-4000-8000-000000000002';
  n := app.aplicar_topes_por_omision_0058('10000000-0000-4000-8000-000000000002');
  ASSERT n = 0, format('la 0058 tocó una copropiedad con valores decididos (%s cambios)', n);
  SELECT tope_vehiculos_propios + tope_de_plazas_por_vivienda INTO n
    FROM public.copropiedades WHERE id = '10000000-0000-4000-8000-000000000002';
  ASSERT n = 9, 'la 0058 cambió los valores decididos 3 y 6';
  RAISE NOTICE '99n · la 0058: 2→5 y 4→10 con auditoría, idempotente, y 3 y 6 se conservan: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 3 · Vehículos propios en MIRA (tope 5): el quinto entra, el sexto no.
--     Las viviendas las crea el administrador (la RLS forzada de `viviendas`
--     es suya, como la semilla); el tope propio lo fija la plataforma (D-W10).
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
INSERT INTO public.viviendas (id, copropiedad_id, identificador, creado_por, actualizado_por)
VALUES ('9e000000-0000-4000-8000-00000000d001', '10000000-0000-4000-8000-000000000001', 'Z1-VEH',
        '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010'),
       ('9e000000-0000-4000-8000-00000000d002', '10000000-0000-4000-8000-000000000001', 'Z1-PLZ',
        '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010'),
       ('9e000000-0000-4000-8000-00000000d003', '10000000-0000-4000-8000-000000000001', 'Z1-TRES',
        '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010');
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';
UPDATE public.viviendas SET tope_de_plazas = 3 WHERE id = '9e000000-0000-4000-8000-00000000d003';

-- Los vehículos, como los registra la administración en nombre del hogar
-- (`vehiculos_insercion`), declarados de origen residente: son los que cuentan.
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE c text; n int;
BEGIN
  INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, origen_registro, creado_por, actualizado_por)
  SELECT '10000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-00000000d001',
         'Z1V000' || i, 'residente',
         '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010'
    FROM generate_series(1, 5) AS i;
  SELECT count(*) INTO n FROM public.vehiculos
   WHERE vivienda_id = '9e000000-0000-4000-8000-00000000d001' AND estado = 'activo' AND origen_registro = 'residente';
  ASSERT n = 5, format('entraron %s vehículos propios, no 5', n);
  BEGIN
    INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, origen_registro, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-00000000d001', 'Z1V0006', 'residente',
            '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'tg_tope_vehiculos_propios: entró el SEXTO vehículo propio con tope 5';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
    ASSERT c = 'vehiculos_tope_propios', format('restricción inesperada: %s', c);
  END;
  RAISE NOTICE '99n · vehículos propios: el quinto entra, el sexto no: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 4 · Plazas con el tope de la copropiedad (10): la décima entra, la undécima no.
--     Las plazas las añade la plataforma, como en la 99l.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';
DO $$
DECLARE c text;
BEGIN
  INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
  SELECT '10000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-00000000d002', i,
         '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'
    FROM generate_series(1, 10) AS i;
  ASSERT app.plazas_activas('9e000000-0000-4000-8000-00000000d002') = 10, 'no entraron las 10 plazas';
  BEGIN
    INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-00000000d002', 11,
            '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'tg_tope_de_plazas: entró la UNDÉCIMA plaza con tope 10';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
    ASSERT c = 'plazas_tope', format('restricción inesperada: %s', c);
  END;
  RAISE NOTICE '99n · plazas: la décima entra, la undécima no: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 5 · Una vivienda con tope propio 3 sigue en 3: la cuarta no entra.
-- ---------------------------------------------------------------------------
DO $$
DECLARE c text;
BEGIN
  INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
  SELECT '10000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-00000000d003', i,
         '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'
    FROM generate_series(1, 3) AS i;
  BEGIN
    INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-00000000d003', 4,
            '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'tg_tope_de_plazas: entró la cuarta plaza con tope propio 3';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
    ASSERT c = 'plazas_tope', format('restricción inesperada: %s', c);
  END;
  RAISE NOTICE '99n · tope propio 3: sigue en 3, la cuarta no entra: ok';
END $$;

ROLLBACK;
