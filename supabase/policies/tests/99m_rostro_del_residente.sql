-- =============================================================================
-- 99m · EL ROSTRO DEL RESIDENTE · RONDA 15-X · ADR-039 · migración 0057
--
-- Lo que la base sostiene por su cuenta, aunque la API se equivoque:
--   1 · un solo rostro VIVO de residente por persona: el segundo choca con
--       `plantillas_residente_viva_uk`; el reemplazo —la anterior a
--       pendiente_supresion y la nueva en la MISMA transacción— entra; las
--       suprimidas, las de visitante y las de otra persona no cuentan;
--   2 · el consentimiento del representante legal deja autor
--       (`consent_representante_con_autor`); un origen inventado no entra;
--   3 · RLS: rostros y consentimientos los escribe la identidad de SERVICIO de
--       la copropiedad. Ni un residente por la REST, ni el servicio de otra
--       copropiedad; y un residente no lee las plantillas;
--   4 · la bitácora de residentes acepta los cuatro hechos del rostro.
--
-- Todo dentro de una transacción que se DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- 0 · Datos con la identidad que admiten sus políticas: el padrón y la visita
--     con el administrador de la copropiedad, como la semilla. Vivienda 42 B.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';

INSERT INTO public.personas (id, copropiedad_id, tipo_documento, numero_documento, nombre_completo,
                             creado_por, actualizado_por)
VALUES ('9f000000-0000-4000-8000-00000000a001', '10000000-0000-4000-8000-000000000001', 'cedula',
        '99200001', 'Rostro Uno Prueba', '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000002'),
       ('9f000000-0000-4000-8000-00000000a002', '10000000-0000-4000-8000-000000000001', 'cedula',
        '99200002', 'Rostro Dos Prueba', '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000002');

INSERT INTO public.residentes (id, copropiedad_id, vivienda_id, persona_id, creado_por, actualizado_por)
VALUES ('9f000000-0000-4000-8000-00000000a011', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', '9f000000-0000-4000-8000-00000000a001',
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002'),
       ('9f000000-0000-4000-8000-00000000a012', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', '9f000000-0000-4000-8000-00000000a002',
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');

-- Una visita propia y vigente: la plantilla de VISITANTE no la toca el índice.
INSERT INTO public.autorizaciones (id, copropiedad_id, vivienda_id, visitante_id, autorizado_por,
                                   tipo, vigencia, creado_por, actualizado_por)
VALUES ('9f000000-0000-4000-8000-00000000a021', '10000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000042', '60000000-0000-4000-8000-000000000101',
        '50000000-0000-4000-8000-000000000042', 'unica',
        tstzrange(now(), now() + interval '1 day', '[)'),
        '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- 1 · Un solo rostro vivo de residente por persona (identidad de servicio).
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';

DO $$
DECLARE
  v_cop   uuid := '10000000-0000-4000-8000-000000000001';
  v_uno   uuid := '9f000000-0000-4000-8000-00000000a001';
  v_dos   uuid := '9f000000-0000-4000-8000-00000000a002';
  v_actor uuid := '00000000-0000-4000-8000-000000000003';
  v_c1    uuid;
  v_c2    uuid;
  v_t1    uuid;
  c       text;
BEGIN
  INSERT INTO public.consentimientos_biometricos (copropiedad_id, persona_id, version_politica,
         canal, estado, otorgado_en, creado_por, actualizado_por)
  VALUES (v_cop, v_uno, 'v1.0', 'app', 'vigente', now(), v_actor, v_actor) RETURNING id INTO v_c1;
  INSERT INTO public.consentimientos_biometricos (copropiedad_id, persona_id, version_politica,
         canal, estado, otorgado_en, creado_por, actualizado_por)
  VALUES (v_cop, v_dos, 'v1.0', 'app', 'vigente', now(), v_actor, v_actor) RETURNING id INTO v_c2;

  INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id, calidad,
         vector_cifrado, llave_ref, algoritmo, suprimir_en, estado, creado_por, actualizado_por)
  VALUES (v_cop, v_uno, v_c1, 0.9, '\x01'::bytea, 'vault:ncr/plantillas/v1', 'AES-256-GCM',
          now() + interval '365 days', 'activa', v_actor, v_actor)
  RETURNING id INTO v_t1;

  -- 1a · un segundo rostro vivo de la misma persona choca, con el nombre del índice.
  BEGIN
    INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id,
           calidad, vector_cifrado, llave_ref, algoritmo, suprimir_en, estado, creado_por,
           actualizado_por)
    VALUES (v_cop, v_uno, v_c1, 0.9, '\x02'::bytea, 'vault:ncr/plantillas/v1', 'AES-256-GCM',
            now() + interval '365 days', 'pendiente_sincronizacion', v_actor, v_actor);
    RAISE EXCEPTION 'FALLO: entró un segundo rostro vivo del mismo residente';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
    ASSERT c = 'plantillas_residente_viva_uk', format('índice inesperado: %s', c);
  END;

  -- 1b · el REEMPLAZO: la anterior a pendiente_supresion y la nueva, juntas.
  UPDATE public.plantillas_biometricas SET estado = 'pendiente_supresion', actualizado_por = v_actor
   WHERE id = v_t1;
  INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id, calidad,
         vector_cifrado, llave_ref, algoritmo, suprimir_en, estado, creado_por, actualizado_por)
  VALUES (v_cop, v_uno, v_c1, 0.9, '\x03'::bytea, 'vault:ncr/plantillas/v1', 'AES-256-GCM',
          now() + interval '365 days', 'pendiente_sincronizacion', v_actor, v_actor);

  -- 1c · lo que no está vivo no cuenta: una suprimida más entra.
  INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id, calidad,
         suprimir_en, suprimida_en, estado, creado_por, actualizado_por)
  VALUES (v_cop, v_uno, v_c1, 0.9, now() + interval '1 day', now(), 'suprimida', v_actor, v_actor);

  -- 1d · la de VISITANTE, con su autorización, convive con el rostro de residente.
  INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id, calidad,
         vector_cifrado, llave_ref, algoritmo, suprimir_en, estado, autorizacion_id, creado_por,
         actualizado_por)
  VALUES (v_cop, v_uno, v_c1, 0.9, '\x04'::bytea, 'vault:ncr/plantillas/v1', 'AES-256-GCM',
          now() + interval '12 hours', 'activa', '9f000000-0000-4000-8000-00000000a021', v_actor,
          v_actor);

  -- 1e · otra persona tiene el suyo.
  INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id, calidad,
         vector_cifrado, llave_ref, algoritmo, suprimir_en, estado, creado_por, actualizado_por)
  VALUES (v_cop, v_dos, v_c2, 0.9, '\x05'::bytea, 'vault:ncr/plantillas/v1', 'AES-256-GCM',
          now() + interval '365 days', 'activa', v_actor, v_actor);

  ASSERT (SELECT count(*) FROM public.plantillas_biometricas
           WHERE persona_id = v_uno AND autorizacion_id IS NULL
             AND estado IN ('pendiente_consentimiento', 'pendiente_sincronizacion', 'activa')) = 1,
         'FALLO: el residente no quedó con exactamente un rostro vivo';
  RAISE NOTICE '99m · un solo rostro vivo por residente; reemplazo, suprimidas y visitas: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 2 · El representante legal deja autor; un origen inventado no entra.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_cop   uuid := '10000000-0000-4000-8000-000000000001';
  v_dos   uuid := '9f000000-0000-4000-8000-00000000a002';
  v_actor uuid := '00000000-0000-4000-8000-000000000003';
  c       text;
BEGIN
  BEGIN
    INSERT INTO public.consentimientos_biometricos (copropiedad_id, persona_id, version_politica,
           canal, estado, origen, creado_por, actualizado_por)
    VALUES (v_cop, v_dos, 'v1.0', 'app', 'pendiente', 'autorizado_por_representante_legal',
            v_actor, v_actor);
    RAISE EXCEPTION 'FALLO: entró una autorización de representante legal sin autor';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
    ASSERT c = 'consent_representante_con_autor', format('restricción inesperada: %s', c);
  END;
  BEGIN
    INSERT INTO public.consentimientos_biometricos (copropiedad_id, persona_id, version_politica,
           canal, estado, origen, declarado_por, creado_por, actualizado_por)
    VALUES (v_cop, v_dos, 'v1.0', 'app', 'pendiente', 'lo_autorizo_un_vecino',
            '00000000-0000-4000-8000-000000000013', v_actor, v_actor);
    RAISE EXCEPTION 'FALLO: entró un origen inventado';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS c = CONSTRAINT_NAME;
    ASSERT c = 'consent_origen_valores', format('restricción inesperada: %s', c);
  END;
  -- Con el titular como autor, entra (pendiente: el vigente de esta persona ya existe).
  INSERT INTO public.consentimientos_biometricos (copropiedad_id, persona_id, version_politica,
         canal, estado, origen, declarado_por, creado_por, actualizado_por)
  VALUES (v_cop, v_dos, 'v1.0', 'app', 'pendiente', 'autorizado_por_representante_legal',
          '00000000-0000-4000-8000-000000000013', v_actor, v_actor);
  RAISE NOTICE '99m · el representante legal deja autor; nada fuera de los tres orígenes: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 3 · RLS: sólo la identidad de servicio de ESTA copropiedad escribe rostros.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
BEGIN
  -- Una fila NO viva (`suprimida`): así, si la RLS faltara, el índice único no
  -- la frenaría por su cuenta y la prueba diría lo que pasó.
  BEGIN
    INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id,
           calidad, suprimir_en, suprimida_en, estado, creado_por, actualizado_por)
    SELECT '10000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-00000000a002', c.id,
           0.9, now() + interval '1 day', now(), 'suprimida',
           '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013'
      FROM public.consentimientos_biometricos c
     WHERE c.persona_id = '9f000000-0000-4000-8000-00000000a002' LIMIT 1;
    RAISE EXCEPTION 'FALLO: un residente escribió un rostro por la REST';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.consentimientos_biometricos (copropiedad_id, persona_id, version_politica,
           canal, estado, origen, declarado_por, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-00000000a002', 'v1.0',
            'app', 'pendiente', 'autorizado_por_representante_legal',
            '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013',
            '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'FALLO: un residente se dio a sí mismo una autorización de representante';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT NOT EXISTS (SELECT 1 FROM public.plantillas_biometricas
                      WHERE persona_id IN ('9f000000-0000-4000-8000-00000000a001',
                                           '9f000000-0000-4000-8000-00000000a002')),
         'FALLO: un residente lee plantillas por la REST';
END $$;

SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';
DO $$
BEGIN
  -- `pendiente_consentimiento`: así el cerrojo del consentimiento (0013), que
  -- dispara ANTES y tampoco ve el de otra copropiedad, no se adelanta; lo que
  -- se prueba aquí es la RLS.
  BEGIN
    INSERT INTO public.plantillas_biometricas (copropiedad_id, persona_id, consentimiento_id,
           calidad, suprimir_en, estado, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '9f000000-0000-4000-8000-00000000a002',
            '9f000000-0000-4000-8000-00000000a099', 0.9, now() + interval '1 day',
            'pendiente_consentimiento', '00000000-0000-4000-8000-000000000003',
            '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'FALLO: el servicio de OTRA copropiedad escribió un rostro en ésta (RN-15)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '99m · RLS: ni un residente ni el servicio de otra copropiedad escriben rostros: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 4 · La bitácora acepta los hechos del rostro, con el actor de ingesta.
-- ---------------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
BEGIN
  INSERT INTO public.bitacora_de_residentes (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id,
                                             detalle, creado_por)
  SELECT '10000000-0000-4000-8000-000000000001', now(), t, NULL, NULL, 'politica:prueba',
         '00000000-0000-4000-8000-000000000003'
    FROM unnest(ARRAY['rostro_registrado', 'rostro_retirado', 'rostro_de_menor_registrado',
                      'rostro_de_menor_retirado']) AS t;
  RAISE NOTICE '99m · la bitácora acepta los cuatro hechos del rostro: ok';
END $$;

ROLLBACK;
