-- =============================================================================
-- 90 · RESIDENTES, ACCESO POR CÓDIGO Y VEHÍCULOS PROPIOS · ETAPA 15-I
--      D1 · D5 · D6 · D7 · ADR-025 · ADR-026 · ADR-027
--
-- Una prueba NEGATIVA por cada política nueva de la 0038, más lo que la base
-- sostiene por su cuenta: el TOPE de vehículos propios por vivienda (también
-- frente al residente que inserta por la REST), los ajustes de plataforma que
-- sólo toca el superadministrador, el número de ocupantes que el servicio no
-- puede cambiar una vez declarado, el ocupante de OTRA vivienda que no se
-- vincula a un vehículo y la bitácora append-only frente a TODOS, dueño incluido.
--
-- Todo dentro de una transacción que se DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- 0 · Datos, con la identidad que usaría la API.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
INSERT INTO public.plazas_de_ocupante (id, copropiedad_id, vivienda_id, numero, usuario_id, usada_en,
                                       creado_por, actualizado_por)
VALUES ('90000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', 1, '00000000-0000-4000-8000-000000000013', now(),
        '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013'),
       ('90000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', 2, NULL, NULL,
        '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
INSERT INTO public.ocupacion_de_viviendas (vivienda_id, copropiedad_id, primer_residente_id,
                                           declarada_en, declarada_por, creado_por, actualizado_por)
VALUES ('30000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000013', now(), '00000000-0000-4000-8000-000000000013',
        '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
INSERT INTO public.bitacora_de_residentes (id, copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id,
                                           vivienda_id, creado_por)
VALUES ('90000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-000000000001', now(),
        'ocupantes_declarados', '00000000-0000-4000-8000-000000000013',
        '00000000-0000-4000-8000-000000000013', '30000000-0000-4000-8000-000000000042',
        '00000000-0000-4000-8000-000000000013');

-- ---------------------------------------------------------------------------
-- 1 · D6 · el servicio NO cambia el número de ocupantes una vez declarado.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042', 3,
            '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: el servicio añadió una plaza tras declarar';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.plazas_de_ocupante SET estado = 'inactivo', desactivado_en = now()
     WHERE id = '90000000-0000-4000-8000-0000000000a2';
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: el servicio quitó una plaza';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.ocupacion_de_viviendas SET declarada_en = NULL, declarada_por = NULL
     WHERE vivienda_id = '30000000-0000-4000-8000-000000000042';
    RAISE EXCEPTION 'tg_ocupacion_declarada: el servicio reabrió la declaración';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Ocupar la plaza libre SÍ lo hace el servicio (vinculación por código).
  UPDATE public.plazas_de_ocupante SET usuario_id = '00000000-0000-4000-8000-000000000010', usada_en = now()
   WHERE id = '90000000-0000-4000-8000-0000000000a2';
  UPDATE public.plazas_de_ocupante SET usuario_id = NULL, usada_en = NULL, generacion = generacion + 1
   WHERE id = '90000000-0000-4000-8000-0000000000a2';
  -- Dos declaraciones de la misma plaza chocan en el índice único.
  BEGIN
    SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';
    INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042', 2,
            '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'plazas_numero_uk: dos plazas vivas con el mismo número';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RAISE NOTICE '90 · ocupantes: el servicio ni añade ni quita plazas tras declarar; las ocupa: ok';
END $$;

-- El superadministrador SÍ añade y quita (D6).
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';
DO $$
DECLARE n int;
BEGIN
  INSERT INTO public.plazas_de_ocupante (id, copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
  VALUES ('90000000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000042', 3,
          '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');
  UPDATE public.plazas_de_ocupante SET estado = 'inactivo', desactivado_en = now(),
         desactivado_por = '00000000-0000-4000-8000-000000000002', motivo_desactivacion = 'prueba'
   WHERE id = '90000000-0000-4000-8000-0000000000a4';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'el superadministrador no pudo quitar una plaza';
  RAISE NOTICE '90 · ocupantes: el superadministrador añade y quita plazas: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 2 · D1 · D5 · D7 · los ajustes de plataforma de la copropiedad.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    UPDATE public.copropiedades SET codigo_corto = 'mira2' WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'copropiedades_codigo_corto_formato: entró un código sin normalizar';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.copropiedades SET codigo_corto = 'ROBLE' WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'copropiedades_codigo_corto_uk: dos copropiedades con el mismo código';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.copropiedades SET aprobacion_de_terceros = 'portero' WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'copropiedades_aprobacion_de_terceros: se activó un modo sin construir (ADR-027)';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.copropiedades SET tope_vehiculos_propios = 2, telefono_porteria = '+576015550100'
   WHERE id = '10000000-0000-4000-8000-000000000001';
  RAISE NOTICE '90 · copropiedad: código normalizado y único; aprobación sólo automática: ok';
END $$;

SET ROLE authenticated;

-- 2.1 administrador de MIRA: edita su copropiedad, pero NO los ajustes de plataforma.
SET request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  BEGIN
    UPDATE public.copropiedades SET codigo_corto = 'MIA' WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'tg_copropiedad_ajustes_de_plataforma: el administrador se asignó un código';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.copropiedades SET tope_vehiculos_propios = 9 WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'tg_copropiedad_ajustes_de_plataforma: el administrador subió el tope';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.copropiedades SET telefono_porteria = '3000000000' WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'tg_copropiedad_ajustes_de_plataforma: el administrador cambió el teléfono de portería';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.ocupacion_de_viviendas SET declarada_en = NULL, declarada_por = NULL
   WHERE vivienda_id = '30000000-0000-4000-8000-000000000042';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'ocupacion_edicion: el administrador reabrió la declaración';
  BEGIN
    INSERT INTO public.ocupacion_de_viviendas (vivienda_id, copropiedad_id, creado_por, actualizado_por)
    VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'ocupacion_insercion: el administrador declaró una vivienda';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Plazas: ni lee las de ROBLE, ni escribe ninguna.
  SELECT count(*) INTO n FROM public.plazas_de_ocupante WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
  ASSERT n = 0, 'plazas_lectura: fuga a otra copropiedad';
  SELECT count(*) INTO n FROM public.plazas_de_ocupante;
  ASSERT n >= 2, format('plazas_lectura: el administrador ve %s plazas de su copropiedad', n);
  BEGIN
    INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 1,
            '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'plazas_insercion: el administrador creó una plaza';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.plazas_de_ocupante SET usuario_id = NULL, usada_en = NULL
   WHERE id = '90000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'plazas_edicion: el administrador liberó una plaza';
  BEGIN
    INSERT INTO public.bitacora_de_residentes (copropiedad_id, ocurrido_en, tipo, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', now(), 'vinculacion', '00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'bitacora_residentes_insercion: el administrador escribió en la bitácora';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO n FROM public.bitacora_de_residentes WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
  ASSERT n = 0, 'bitacora_residentes_lectura: fuga a otra copropiedad';
  SELECT count(*) INTO n FROM public.bitacora_de_residentes;
  ASSERT n = 1, format('bitacora_residentes_lectura: el administrador ve %s filas propias', n);
  RAISE NOTICE '90 · administrador: ni ajustes de plataforma, ni plazas, ni bitácora: ok';
END $$;

-- 2.2 administrador de ROBLE: nada de MIRA.
SET request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000020","copropiedad_id":"10000000-0000-4000-8000-000000000002"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.plazas_de_ocupante;
  ASSERT n = 0, 'plazas_lectura: el administrador de ROBLE ve plazas de MIRA';
  SELECT count(*) INTO n FROM public.bitacora_de_residentes;
  ASSERT n = 0, 'bitacora_residentes_lectura: el administrador de ROBLE ve la bitácora de MIRA';
  SELECT count(*) INTO n FROM public.vehiculos_ocupantes;
  ASSERT n = 0, 'vehiculos_ocupantes_lectura: el administrador de ROBLE ve vínculos de MIRA';
  SELECT count(*) INTO n FROM public.ocupacion_de_viviendas;
  ASSERT n = 0, 'ocupacion_lectura: el administrador de ROBLE ve la ocupación de MIRA';
  RAISE NOTICE '90 · aislamiento: ROBLE no ve plazas, bitácora ni vínculos de MIRA: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 3 · D5 a · ADR-026 · el TOPE, frente al residente que inserta por la REST.
--     La vivienda 42 ya tiene un vehículo de ADMINISTRACIÓN (ABC1234), que no
--     cuenta. Tope 2.
-- ---------------------------------------------------------------------------
SET request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001","persona_id":"40000000-0000-4000-8000-000000000013"}';
DO $$
DECLARE n int; v_origen text;
BEGIN
  -- Se declara «administración» para esquivar el tope: la base lo corrige.
  INSERT INTO public.vehiculos (id, copropiedad_id, vivienda_id, placa, origen_registro, creado_por, actualizado_por)
  VALUES ('90000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000042', 'RES9001', 'administracion',
          '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
  SELECT origen_registro INTO v_origen FROM public.vehiculos WHERE id = '90000000-0000-4000-8000-0000000000b1';
  ASSERT v_origen = 'residente', format('tg_tope_vehiculos_propios: el residente registró como %s', v_origen);
  INSERT INTO public.vehiculos (id, copropiedad_id, vivienda_id, placa, creado_por, actualizado_por)
  VALUES ('90000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000042', 'RES9002',
          '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
  BEGIN
    INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042', 'RES9003',
            '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'tg_tope_vehiculos_propios: el residente registró un TERCER vehículo propio';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  BEGIN
    UPDATE public.vehiculos SET origen_registro = 'administracion' WHERE id = '90000000-0000-4000-8000-0000000000b1';
    RAISE EXCEPTION 'tg_tope_vehiculos_propios: el residente convirtió su vehículo en «de administración»';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Desactivar uno libera el cupo, y reactivarlo con el cupo lleno no pasa.
  UPDATE public.vehiculos SET estado = 'inactivo', desactivado_en = now()
   WHERE id = '90000000-0000-4000-8000-0000000000b2';
  INSERT INTO public.vehiculos (id, copropiedad_id, vivienda_id, placa, creado_por, actualizado_por)
  VALUES ('90000000-0000-4000-8000-0000000000b3', '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000042', 'RES9003',
          '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
  BEGIN
    UPDATE public.vehiculos SET estado = 'activo', desactivado_en = NULL
     WHERE id = '90000000-0000-4000-8000-0000000000b2';
    RAISE EXCEPTION 'tg_tope_vehiculos_propios: la reactivación rebasó el tope';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  SELECT count(*) INTO n FROM public.vehiculos
   WHERE vivienda_id = '30000000-0000-4000-8000-000000000042' AND estado = 'activo' AND origen_registro = 'residente';
  ASSERT n = 2, format('el tope no se sostuvo: %s vehículos propios activos', n);
  -- Plazas y bitácora: el residente no las lee ni las escribe por la REST.
  SELECT count(*) INTO n FROM public.plazas_de_ocupante;
  ASSERT n = 0, 'plazas_lectura: el residente lee plazas (y sus códigos derivables)';
  SELECT count(*) INTO n FROM public.bitacora_de_residentes;
  ASSERT n = 0, 'bitacora_residentes_lectura: el residente lee la bitácora';
  SELECT count(*) INTO n FROM public.ocupacion_de_viviendas;
  ASSERT n = 0, 'ocupacion_lectura: el residente lee la ocupación por la REST';
  BEGIN
    INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042', 9,
            '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'plazas_insercion: el residente se añadió un ocupante';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.vehiculos_ocupantes (copropiedad_id, vehiculo_id, residente_id, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000b1',
            '50000000-0000-4000-8000-000000000042',
            '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'vehiculos_ocupantes_insercion: el residente escribió un vínculo por la REST';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '90 · tope: 2 propios, el tercero rechazado, el origen no se falsea, desactivar libera: ok';
END $$;

-- 3.1 administrador: registra por ENCIMA del tope (no cuenta) y el tope cambiado se respeta.
SET request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
BEGIN
  INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, creado_por, actualizado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042', 'ADM9004',
          '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010');
  -- Un ocupante de OTRA vivienda no se vincula al vehículo.
  BEGIN
    INSERT INTO public.vehiculos_ocupantes (copropiedad_id, vehiculo_id, residente_id, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000b1',
            '50000000-0000-4000-8000-000000000089',
            '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'tg_ocupante_de_la_vivienda: se vinculó un ocupante de otra vivienda';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  INSERT INTO public.vehiculos_ocupantes (copropiedad_id, vehiculo_id, residente_id, creado_por, actualizado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-0000000000b1',
          '50000000-0000-4000-8000-000000000042',
          '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010');
  RAISE NOTICE '90 · administración: registra por encima del tope; el ocupante es de la vivienda: ok';
END $$;

RESET ROLE;
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';
UPDATE public.copropiedades SET tope_vehiculos_propios = 3 WHERE id = '10000000-0000-4000-8000-000000000001';
SET ROLE authenticated;
SET request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001","persona_id":"40000000-0000-4000-8000-000000000013"}';
DO $$
BEGIN
  INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, creado_por, actualizado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042', 'RES9005',
          '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
  BEGIN
    INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042', 'RES9006',
            '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'tg_tope_vehiculos_propios: el tope de 3 no se respetó';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '90 · tope configurado a 3 por el superadministrador y respetado: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 4 · La bitácora de residentes, frente al DUEÑO (ADR-005).
-- ---------------------------------------------------------------------------
RESET ROLE;
DO $$
DECLARE dueno text; n int;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO dueno FROM pg_class WHERE relname = 'bitacora_de_residentes';
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'bitacora_de_residentes'
     AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');
  ASSERT n = 0, format('la bitácora conserva %s privilegios de escritura (dueño %s)', n, dueno);
  BEGIN
    UPDATE public.bitacora_de_residentes SET detalle = 'reescrito' WHERE id = '90000000-0000-4000-8000-0000000000a3';
    RAISE EXCEPTION 'bitácora de residentes: UPDATE aceptado';
  EXCEPTION WHEN insufficient_privilege OR restrict_violation OR raise_exception THEN
    IF SQLERRM LIKE 'bitácora de residentes: UPDATE aceptado' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.bitacora_de_residentes WHERE id = '90000000-0000-4000-8000-0000000000a3';
    RAISE EXCEPTION 'bitácora de residentes: DELETE aceptado';
  EXCEPTION WHEN insufficient_privilege OR restrict_violation OR raise_exception THEN
    IF SQLERRM LIKE 'bitácora de residentes: DELETE aceptado' THEN RAISE; END IF;
  END;
  RAISE NOTICE '90 · bitácora de residentes: sin UPDATE ni DELETE, tampoco para el dueño: ok';
END $$;

ROLLBACK;
