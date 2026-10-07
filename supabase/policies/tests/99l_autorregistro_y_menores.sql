-- =============================================================================
-- 99l · AUTORREGISTRO, MENORES DEL HOGAR Y PLAZAS DEL TITULAR · RONDA 15-W
--       D-W1 · D-W2 · D-W9 · D-W10 · ADR-037 · ADR-038 · migraciones 0055/0056
--
-- Lo que la base sostiene por su cuenta, aunque la API se equivoque:
--   1 · ninguna cuenta para un menor de 18 años —ni al enlazarla ni cambiando
--       después la fecha de la persona—, con el día de Bogotá;
--   2 · una plaza la ocupa una cuenta O una persona, nunca las dos;
--   3 · un adulto de OTRA vivienda no ocupa una plaza de ésta, y sin cuenta sólo
--       ocupa plaza un menor de la vivienda; la persona reclama su plaza con su
--       cuenta (traspaso);
--   4 · el titular añade plazas hasta el tope (4) y retira las libres; nadie más
--       de la vivienda; una plaza que revive también cuenta;
--   5 · con tope propio de 6 la quinta y la sexta entran; el tope nunca queda
--       por debajo de las plazas activas;
--   6 · al bajar el tope de una copropiedad, nadie pierde plazas;
--   7 · el administrador no toca ningún tope;
--   8 · la bitácora acepta los hechos nuevos, también sin cuenta.
-- La concurrencia sobre la cuarta plaza la prueba `99l_plazas_concurrentes.sh`.
--
-- Todo dentro de una transacción que se DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- 0 · Datos, cada uno con la identidad que admiten sus políticas (la RLS
--     forzada alcanza al dueño): el padrón con el administrador de la
--     copropiedad, como la semilla; cuentas, ocupación y plazas con la
--     plataforma. Vivienda A = la 42 B (María, titular). B = la 01 A (Carlos).
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE hoy_99l ON COMMIT DROP AS
  SELECT (now() AT TIME ZONE 'America/Bogota')::date AS d;

SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';

INSERT INTO public.personas (id, copropiedad_id, tipo_documento, numero_documento, nombre_completo,
                             fecha_nacimiento, creado_por, actualizado_por)
SELECT x.id::uuid, '10000000-0000-4000-8000-000000000001', x.tipo::public.tipo_documento, x.doc,
       x.nombre, x.nacimiento, '00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-000000000002'
  FROM hoy_99l h, LATERAL (VALUES
    ('9e000000-0000-4000-8000-000000000a01', 'cedula', '99100001', 'Pedro Prueba',
     (h.d - interval '40 years')::date),
    ('9e000000-0000-4000-8000-000000000b01', 'tarjeta_identidad', '99100002', 'Sofia Prueba',
     (h.d - interval '10 years')::date),
    ('9e000000-0000-4000-8000-000000000c01', 'tarjeta_identidad', '99100003', 'Andres Prueba',
     (h.d - interval '19 years')::date),
    ('9e000000-0000-4000-8000-000000000e01', 'cedula', '99100004', 'Lucia Prueba',
     (h.d - interval '18 years' + interval '1 day')::date),
    ('9e000000-0000-4000-8000-000000000f01', 'cedula', '99100005', 'Tomas Prueba',
     (h.d - interval '18 years')::date),
    ('9e000000-0000-4000-8000-000000000f11', 'cedula', '99100006', 'Sin Fecha Prueba', NULL::date)
  ) AS x(id, tipo, doc, nombre, nacimiento);

INSERT INTO public.residentes (id, copropiedad_id, vivienda_id, persona_id, parentesco, es_titular,
                               creado_por, actualizado_por)
VALUES ('9e000000-0000-4000-8000-000000000a02', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', '9e000000-0000-4000-8000-000000000a01', 'Esposo', false,
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
       ('9e000000-0000-4000-8000-000000000b02', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', '9e000000-0000-4000-8000-000000000b01', 'Hija', false,
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
       ('9e000000-0000-4000-8000-000000000c02', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', '9e000000-0000-4000-8000-000000000c01', 'Hijo', false,
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');

-- Cuentas: Pedro (adulto de A, no titular) y Carlos (adulto de B, persona 01).
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';
INSERT INTO public.usuarios (id, copropiedad_id, auth_user_id, correo, nombre_usuario, nombre,
                             persona_id, creado_por, actualizado_por)
VALUES ('9e000000-0000-4000-8000-000000000a03', '10000000-0000-4000-8000-000000000001',
        '9e000000-0000-4000-8000-000000000af3', NULL, 'pedro.99l', 'Pedro Prueba',
        '9e000000-0000-4000-8000-000000000a01',
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
       ('9e000000-0000-4000-8000-000000000d03', '10000000-0000-4000-8000-000000000001',
        '9e000000-0000-4000-8000-000000000df3', NULL, 'carlos.99l', 'Carlos Silva',
        '40000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
       ('9e000000-0000-4000-8000-000000000e03', '10000000-0000-4000-8000-000000000001',
        '9e000000-0000-4000-8000-000000000ef3', NULL, 'libre.99l', 'Cuenta sin persona', NULL,
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');

-- A: María es la titular, declarada. Plazas 1 (María), 2 (Pedro), 3 y 4 libres.
INSERT INTO public.ocupacion_de_viviendas (vivienda_id, copropiedad_id, primer_residente_id,
                                           declarada_en, declarada_por, creado_por, actualizado_por)
VALUES ('30000000-0000-4000-8000-000000000042', '10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000013', now(), '00000000-0000-4000-8000-000000000013',
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');
INSERT INTO public.plazas_de_ocupante (id, copropiedad_id, vivienda_id, numero, usuario_id, usada_en,
                                       creado_por, actualizado_por)
VALUES ('9e000000-0000-4000-8000-0000000001a1', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', 1, '00000000-0000-4000-8000-000000000013', now(),
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
       ('9e000000-0000-4000-8000-0000000001a2', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', 2, '9e000000-0000-4000-8000-000000000a03', now(),
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
       ('9e000000-0000-4000-8000-0000000001a3', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', 3, NULL, NULL,
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
       ('9e000000-0000-4000-8000-0000000001a4', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', 4, NULL, NULL,
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- 1 · D-W2 · ninguna cuenta para un menor, con el día de Bogotá.
-- ---------------------------------------------------------------------------
DO $$
DECLARE c text;
BEGIN
  -- Origen: lo de antes es de la administración; nada fuera de las dos fuentes.
  ASSERT (SELECT origen_de_alta FROM public.usuarios WHERE id = '00000000-0000-4000-8000-000000000013')
         = 'administracion', 'usuarios_origen_de_alta: una cuenta anterior no quedó como de administración';
  BEGIN
    UPDATE public.usuarios SET origen_de_alta = 'portal' WHERE id = '9e000000-0000-4000-8000-000000000e03';
    RAISE EXCEPTION 'usuarios_origen_de_alta: entró un origen inventado';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Una cuenta no se cambia a sí misma el origen por la REST (0037 ampliada).
  BEGIN
    SET LOCAL request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
    UPDATE public.usuarios SET origen_de_alta = 'autorregistro'
     WHERE id = '00000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'tg_usuario_campos_propios: una cuenta se cambió su propio origen';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Cumple 18 MAÑANA: todavía no.
  BEGIN
    UPDATE public.usuarios SET persona_id = '9e000000-0000-4000-8000-000000000e01'
     WHERE id = '9e000000-0000-4000-8000-000000000e03';
    RAISE EXCEPTION 'tg_cuenta_solo_mayores: una cuenta quedó atada a quien cumple 18 mañana';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
    ASSERT c = 'usuarios_solo_mayores', format('restricción inesperada: %s', c);
  END;
  -- Un menor de 10, ni al crear la cuenta.
  BEGIN
    INSERT INTO public.usuarios (copropiedad_id, auth_user_id, nombre_usuario, nombre, persona_id,
                                 creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', gen_random_uuid(), 'sofia.99l', 'Sofia',
            '9e000000-0000-4000-8000-000000000b01',
            '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'tg_cuenta_solo_mayores: se creó una cuenta para un menor';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Cumple 18 HOY: ya puede. Y sin fecha conocida no se niega (la exige el alta).
  UPDATE public.usuarios SET persona_id = '9e000000-0000-4000-8000-000000000f01'
   WHERE id = '9e000000-0000-4000-8000-000000000e03';
  UPDATE public.usuarios SET persona_id = '9e000000-0000-4000-8000-000000000f11'
   WHERE id = '9e000000-0000-4000-8000-000000000e03';
  RAISE NOTICE '99l · mayoría de edad al enlazar la cuenta: 18 mañana no, 18 hoy sí: ok';
END $$;

-- Desde el otro lado: la persona CON cuenta no pasa a tener fecha de menor
-- (la ficha de una persona la edita el administrador).
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
BEGIN
  BEGIN
    UPDATE public.personas SET fecha_nacimiento = (SELECT (d - interval '17 years')::date FROM hoy_99l)
     WHERE id = '40000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'tg_persona_con_cuenta_solo_mayor: la titular quedó con fecha de menor';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Sin cuenta, la fecha de un menor es legítima.
  UPDATE public.personas SET fecha_nacimiento = (SELECT (d - interval '11 years')::date FROM hoy_99l)
   WHERE id = '9e000000-0000-4000-8000-000000000b01';
  RAISE NOTICE '99l · mayoría de edad: la fecha de una persona con cuenta no pasa a la de un menor: ok';
END $$;
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';

-- ---------------------------------------------------------------------------
-- 2 · Una plaza la ocupa una cuenta O una persona, nunca las dos (aun la
--     plataforma, que se salta el disparador).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    UPDATE public.plazas_de_ocupante SET persona_id = '9e000000-0000-4000-8000-000000000b01'
     WHERE id = '9e000000-0000-4000-8000-0000000001a1';
    RAISE EXCEPTION 'plazas_cuenta_o_persona: una plaza con cuenta Y persona';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '99l · una plaza: cuenta o persona, nunca las dos: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 3 · Quién ocupa una plaza con una persona sin cuenta.
-- ---------------------------------------------------------------------------
-- Carlos, adulto de la vivienda B, no toca las plazas de la A.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"9e000000-0000-4000-8000-000000000d03","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
BEGIN
  BEGIN
    UPDATE public.plazas_de_ocupante SET persona_id = '9e000000-0000-4000-8000-000000000b01'
     WHERE id = '9e000000-0000-4000-8000-0000000001a3';
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: un adulto de B ocupó una plaza de A';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99l · un adulto de otra vivienda no ocupa plazas de ésta: ok';
END $$;

-- María (titular de A): ni una persona de otra vivienda, ni una con cuenta, ni
-- un mayor de edad sin cuenta; una plaza nace libre.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE c text;
BEGIN
  BEGIN
    UPDATE public.plazas_de_ocupante SET persona_id = '40000000-0000-4000-8000-000000000002'
     WHERE id = '9e000000-0000-4000-8000-0000000001a3';
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: entró una persona de otra vivienda';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.plazas_de_ocupante SET persona_id = '9e000000-0000-4000-8000-000000000a01'
     WHERE id = '9e000000-0000-4000-8000-0000000001a3';
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: entró como persona alguien con cuenta';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.plazas_de_ocupante SET persona_id = '9e000000-0000-4000-8000-000000000c01'
     WHERE id = '9e000000-0000-4000-8000-0000000001a3';
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: un mayor de edad ocupó plaza sin cuenta';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
    ASSERT c = 'plazas_persona_menor', format('restricción inesperada: %s', c);
  END;
  BEGIN
    INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, persona_id,
                                           creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042', 9,
            '9e000000-0000-4000-8000-000000000b01',
            '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: una plaza nació ocupada por una persona';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99l · sin cuenta sólo un menor de ESTA vivienda, en una plaza que ya existía: ok';
END $$;

-- Pedro (adulto de A, no titular) sí ocupa la plaza 3 con Sofía; y no puede
-- pasar después esa plaza a una cuenta.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"9e000000-0000-4000-8000-000000000a03","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  UPDATE public.plazas_de_ocupante SET persona_id = '9e000000-0000-4000-8000-000000000b01'
   WHERE id = '9e000000-0000-4000-8000-0000000001a3';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'un adulto de la vivienda no pudo ocupar una plaza libre con su menor';
  BEGIN
    UPDATE public.plazas_de_ocupante
       SET persona_id = NULL, usuario_id = '9e000000-0000-4000-8000-000000000e03', usada_en = now()
     WHERE id = '9e000000-0000-4000-8000-0000000001a3';
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: la plaza de un menor pasó a otra cuenta';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99l · cualquier adulto de la vivienda ocupa con su menor; no la regala: ok';
END $$;

-- Traspaso (S-15W-05): Andrés cumplió 19 sin cuenta (lo registró la
-- plataforma); con SU cuenta reclama su plaza, y nadie más se la lleva.
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';
UPDATE public.plazas_de_ocupante SET persona_id = '9e000000-0000-4000-8000-000000000c01'
 WHERE id = '9e000000-0000-4000-8000-0000000001a4';
INSERT INTO public.usuarios (id, copropiedad_id, auth_user_id, correo, nombre_usuario, nombre,
                             persona_id, origen_de_alta, creado_por, actualizado_por)
VALUES ('9e000000-0000-4000-8000-000000000c03', '10000000-0000-4000-8000-000000000001',
        '9e000000-0000-4000-8000-000000000cf3', NULL, 'andres.99l', 'Andres Prueba',
        '9e000000-0000-4000-8000-000000000c01', 'autorregistro',
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  BEGIN
    UPDATE public.plazas_de_ocupante
       SET persona_id = NULL, usuario_id = '9e000000-0000-4000-8000-000000000e03', usada_en = now()
     WHERE id = '9e000000-0000-4000-8000-0000000001a4';
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: otra cuenta se llevó la plaza de Andrés';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.plazas_de_ocupante
     SET persona_id = NULL, usuario_id = '9e000000-0000-4000-8000-000000000c03', usada_en = now()
   WHERE id = '9e000000-0000-4000-8000-0000000001a4';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'la persona no pudo reclamar su plaza con su cuenta';
  RAISE NOTICE '99l · traspaso: la persona reclama SU plaza con su cuenta, y nadie más: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 4 · D-W10 · el titular y el tope de 4. Hoy: 1 María, 2 Pedro, 3 Sofía,
--     4 Andrés → 4 de 4.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE c text; n int;
BEGIN
  BEGIN
    INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042', 5,
            '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'tg_tope_de_plazas: entró la quinta plaza con tope 4';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
    ASSERT c = 'plazas_tope', format('restricción inesperada: %s', c);
  END;
  -- Retirar: nunca la 1; nunca una ocupada, por cuenta o por persona.
  BEGIN
    UPDATE public.plazas_de_ocupante SET estado = 'inactivo', desactivado_en = now()
     WHERE id = '9e000000-0000-4000-8000-0000000001a1';
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: el titular retiró la plaza 1';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.plazas_de_ocupante SET estado = 'inactivo', desactivado_en = now()
     WHERE id = '9e000000-0000-4000-8000-0000000001a3';
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: el titular retiró la plaza de un menor';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.plazas_de_ocupante SET estado = 'inactivo', desactivado_en = now()
     WHERE id = '9e000000-0000-4000-8000-0000000001a2';
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: el titular retiró la plaza de otra cuenta';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- La baja del menor libera su plaza (generación nueva); libre, se retira.
  UPDATE public.plazas_de_ocupante SET persona_id = NULL, generacion = generacion + 1
   WHERE id = '9e000000-0000-4000-8000-0000000001a3';
  UPDATE public.plazas_de_ocupante SET estado = 'inactivo', desactivado_en = now(),
         desactivado_por = '00000000-0000-4000-8000-000000000013', motivo_desactivacion = 'prueba 99l'
   WHERE id = '9e000000-0000-4000-8000-0000000001a3';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'el titular no pudo retirar una plaza libre';
  -- 3 de 4: la cuarta entra.
  INSERT INTO public.plazas_de_ocupante (id, copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
  VALUES ('9e000000-0000-4000-8000-0000000001a5', '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000042', 5,
          '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
  RAISE NOTICE '99l · el titular: retira sólo libres y nunca la 1; hasta 4, la quinta no: ok';
END $$;

-- Pedro no es el titular: no añade (la vivienda está declarada) ni retira.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"9e000000-0000-4000-8000-000000000a03","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
BEGIN
  BEGIN
    UPDATE public.plazas_de_ocupante SET estado = 'inactivo', desactivado_en = now()
     WHERE id = '9e000000-0000-4000-8000-0000000001a5';
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: otro adulto retiró una plaza';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042', 6,
            '9e000000-0000-4000-8000-000000000a03', '9e000000-0000-4000-8000-000000000a03');
    RAISE EXCEPTION 'tg_plazas_solo_superadministrador: otro adulto añadió una plaza';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99l · otro adulto de la vivienda no gestiona plazas: ok';
END $$;

-- Una plaza que REVIVE también cuenta, aunque la reviva la plataforma.
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';
DO $$
BEGIN
  BEGIN
    UPDATE public.plazas_de_ocupante SET estado = 'activo', desactivado_en = NULL,
           desactivado_por = NULL, motivo_desactivacion = NULL
     WHERE id = '9e000000-0000-4000-8000-0000000001a3';
    RAISE EXCEPTION 'tg_tope_de_plazas: una plaza revivió por encima del tope';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '99l · revivir una plaza cuenta para el tope: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 5 · Tope propio de 6: la quinta y la sexta entran, la séptima no; el tope
--     nunca queda por debajo de las plazas activas; una persona, una plaza.
-- ---------------------------------------------------------------------------
UPDATE public.viviendas SET tope_de_plazas = 6 WHERE id = '30000000-0000-4000-8000-000000000042';
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
BEGIN
  INSERT INTO public.plazas_de_ocupante (id, copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
  VALUES ('9e000000-0000-4000-8000-0000000001a6', '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000042', 6,
          '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013'),
         ('9e000000-0000-4000-8000-0000000001a7', '10000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000042', 7,
          '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
  BEGIN
    INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000042', 8,
            '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'tg_tope_de_plazas: entró la séptima plaza con tope 6';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Sofía vuelve a una plaza libre; la misma persona no ocupa dos.
  UPDATE public.plazas_de_ocupante SET persona_id = '9e000000-0000-4000-8000-000000000b01'
   WHERE id = '9e000000-0000-4000-8000-0000000001a5';
  BEGIN
    UPDATE public.plazas_de_ocupante SET persona_id = '9e000000-0000-4000-8000-000000000b01'
     WHERE id = '9e000000-0000-4000-8000-0000000001a6';
    RAISE EXCEPTION 'plazas_persona_uk: una persona en dos plazas vivas';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RAISE NOTICE '99l · con tope 6 entran la quinta y la sexta, la séptima no; una persona, una plaza: ok';
END $$;

SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';
DO $$
DECLARE c text;
BEGIN
  BEGIN
    UPDATE public.viviendas SET tope_de_plazas = 4 WHERE id = '30000000-0000-4000-8000-000000000042';
    RAISE EXCEPTION 'tg_tope_de_plazas_de_la_vivienda: el tope quedó por debajo de las plazas';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
    ASSERT c = 'viviendas_tope_bajo_las_plazas', format('restricción inesperada: %s', c);
  END;
  BEGIN
    UPDATE public.viviendas SET tope_de_plazas = NULL WHERE id = '30000000-0000-4000-8000-000000000042';
    RAISE EXCEPTION 'tg_tope_de_plazas_de_la_vivienda: volver al tope de la copropiedad dejó plazas de más';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- De una vivienda, la plataforma sólo toca el tope: el resto es del administrador.
  BEGIN
    UPDATE public.viviendas SET identificador = '42-BIS' WHERE id = '30000000-0000-4000-8000-000000000042';
    RAISE EXCEPTION 'tg_tope_de_plazas_de_la_vivienda: el superadministrador editó otra columna';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99l · el tope nunca queda por debajo de las plazas activas; la plataforma sólo toca el tope: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 6 · Al BAJAR el tope de la copropiedad, nadie pierde plazas (la misma función
--     que la 0056 aplicó al desplegarse).
-- ---------------------------------------------------------------------------
UPDATE public.copropiedades SET tope_de_plazas_por_vivienda = 6
 WHERE id = '10000000-0000-4000-8000-000000000001';
INSERT INTO public.plazas_de_ocupante (copropiedad_id, vivienda_id, numero, creado_por, actualizado_por)
SELECT '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', n,
       '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'
  FROM generate_series(1, 6) AS n;
UPDATE public.copropiedades SET tope_de_plazas_por_vivienda = 4
 WHERE id = '10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
  ASSERT (SELECT tope_de_plazas FROM public.viviendas WHERE id = '30000000-0000-4000-8000-000000000001') = 6,
         'conservar_plazas_sobre_el_tope: la vivienda con 6 plazas no conservó su tope';
  ASSERT app.plazas_activas('30000000-0000-4000-8000-000000000001') = 6,
         'conservar_plazas_sobre_el_tope: la vivienda perdió plazas';
  ASSERT (SELECT tope_de_plazas FROM public.viviendas WHERE id = '30000000-0000-4000-8000-000000000042') = 6,
         'conservar_plazas_sobre_el_tope: tocó el tope propio de otra vivienda';
  ASSERT (SELECT tope_de_plazas FROM public.viviendas WHERE id = '30000000-0000-4000-8000-000000000002') IS NULL,
         'conservar_plazas_sobre_el_tope: dio tope propio a una vivienda sin plazas de más';
  RAISE NOTICE '99l · al bajar el tope de la copropiedad nadie pierde plazas: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 7 · El administrador no toca ningún tope (son de plataforma).
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
BEGIN
  BEGIN
    UPDATE public.viviendas SET tope_de_plazas = 10 WHERE id = '30000000-0000-4000-8000-000000000042';
    RAISE EXCEPTION 'tg_tope_de_plazas_de_la_vivienda: el administrador cambió el tope de una vivienda';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.viviendas (copropiedad_id, identificador, tope_de_plazas, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '99L-1', 10,
            '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'tg_tope_de_plazas_de_la_vivienda: el administrador creó una vivienda con tope';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- La copropiedad: o la RLS se la oculta o el disparador lo niega; nunca cambia.
  BEGIN
    UPDATE public.copropiedades SET tope_de_plazas_por_vivienda = 10
     WHERE id = '10000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99l · el administrador no cambia los topes: ok';
END $$;
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":null}';
DO $$
BEGIN
  ASSERT (SELECT tope_de_plazas_por_vivienda FROM public.copropiedades
           WHERE id = '10000000-0000-4000-8000-000000000001') = 4,
         'tg_tope_de_plazas_de_la_copropiedad: el administrador cambió el tope de la copropiedad';
END $$;

-- ---------------------------------------------------------------------------
-- 8 · La bitácora: los hechos de la 15-W, también ANTES de que exista la
--     cuenta (sin usuario, firmados por el actor de ingesta).
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
BEGIN
  INSERT INTO public.bitacora_de_residentes (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id,
                                             detalle, creado_por)
  SELECT '10000000-0000-4000-8000-000000000001', now(), t, NULL, NULL, 'ip:prueba',
         '00000000-0000-4000-8000-000000000003'
    FROM unnest(ARRAY['autorregistro', 'autorregistro_rechazado', 'registro_codigo_incorrecto',
                      'registro_suspendido_por_intentos', 'registro_reanudado',
                      'titular_asignado_por_administracion', 'vivienda_asignada_por_administracion',
                      'cuenta_bloqueada_por_edad', 'menor_registrado', 'menor_editado',
                      'menor_dado_de_baja', 'tope_de_plazas_cambiado', 'vehiculo_propio_editado',
                      'vehiculo_propio_borrado', 'visita_revocada_por_residente']) AS t;
  BEGIN
    INSERT INTO public.bitacora_de_residentes (copropiedad_id, ocurrido_en, tipo, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', now(), 'hecho_inventado',
            '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'bitacora_residentes_tipo: entró un tipo de hecho inventado';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '99l · la bitácora acepta los 15 hechos de la 15-W, también sin cuenta: ok';
END $$;

ROLLBACK;
