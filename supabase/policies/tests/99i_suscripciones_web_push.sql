-- =============================================================================
-- 99i · SUSCRIPCIONES WEB PUSH · RONDA 15-R, bloque B3 (migración 0052)
--
-- Positiva y NEGATIVA de la política `dispositivos_notificacion_propios`, como
-- `authenticated` (la RLS forzada actúa), en una transacción que se DESHACE:
--  · el residente suscribe SU navegador a SU vivienda; no a la del vecino, ni
--    a nombre de otro usuario;
--  · cada quien ve los suyos: ni el administrador de su conjunto, ni un
--    residente de otro, ni el servicio de otra copropiedad;
--  · el servicio de SU copropiedad lee y da de baja; nadie borra;
--  · un endpoint vivo es una fila en todo el sistema; una suscripción web sin
--    vivienda o con llaves malformadas no entra.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;

-- Residente de MIRA (semilla): usuario …0013, persona 40…13, vivienda 42.
SET LOCAL request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001","persona_id":"40000000-0000-4000-8000-000000000013"}';
INSERT INTO public.dispositivos_de_notificacion
  (copropiedad_id, usuario_id, instalacion_id, token, plataforma, vivienda_id,
   clave_p256dh, clave_auth, creado_por, actualizado_por)
VALUES ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000013',
        'web:99i-propia', 'https://fcm.googleapis.com/fcm/send/99i-propia', 'web',
        '30000000-0000-4000-8000-000000000042',
        'B' || repeat('A', 86), repeat('Q', 22),
        '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.dispositivos_de_notificacion WHERE instalacion_id = 'web:99i-propia';
  ASSERT n = 1, 'el residente no ve su propia suscripción';

  -- NEGATIVA · la vivienda del vecino (01, misma copropiedad).
  BEGIN
    INSERT INTO public.dispositivos_de_notificacion
      (copropiedad_id, usuario_id, instalacion_id, token, plataforma, vivienda_id,
       clave_p256dh, clave_auth, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000013',
            'web:99i-vecino', 'https://fcm.googleapis.com/fcm/send/99i-vecino', 'web',
            '30000000-0000-4000-8000-000000000001',
            'B' || repeat('A', 86), repeat('Q', 22),
            '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'dispositivos_notificacion_propios: el residente se suscribió a la vivienda del vecino';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- NEGATIVA · a nombre de otro usuario.
  BEGIN
    INSERT INTO public.dispositivos_de_notificacion
      (copropiedad_id, usuario_id, instalacion_id, token, plataforma,
       creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010',
            'web:99i-ajeno', 'https://fcm.googleapis.com/fcm/send/99i-ajeno', 'web',
            '00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000013');
    RAISE EXCEPTION 'dispositivos_notificacion_propios: el residente registró un aparato ajeno';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- NEGATIVA · nadie borra (sin GRANT de DELETE).
  BEGIN
    DELETE FROM public.dispositivos_de_notificacion WHERE instalacion_id = 'web:99i-propia';
    RAISE EXCEPTION 'dispositivos_de_notificacion: el residente borró una suscripción';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- NEGATIVA · el administrador de MIRA no ve el aparato del residente.
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001","aal":"aal2"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.dispositivos_de_notificacion WHERE instalacion_id = 'web:99i-propia';
  ASSERT n = 0, 'el administrador ve la suscripción de un residente';
END $$;

-- NEGATIVA · el servicio de ROBLE ni ve ni da de baja la suscripción de MIRA.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.dispositivos_de_notificacion WHERE instalacion_id = 'web:99i-propia';
  ASSERT n = 0, 'el servicio de ROBLE ve una suscripción de MIRA';
  UPDATE public.dispositivos_de_notificacion SET estado = 'inactivo', desactivado_en = now()
   WHERE instalacion_id = 'web:99i-propia';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'el servicio de ROBLE dio de baja una suscripción de MIRA';
END $$;

-- POSITIVA · el servicio de MIRA la ve; las restricciones de la base actúan.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.dispositivos_de_notificacion WHERE instalacion_id = 'web:99i-propia';
  ASSERT n = 1, 'el servicio de MIRA no ve la suscripción';

  -- El MISMO endpoint, vivo, para otra cuenta: lo impide el índice único.
  BEGIN
    INSERT INTO public.dispositivos_de_notificacion
      (copropiedad_id, usuario_id, instalacion_id, token, plataforma, vivienda_id,
       clave_p256dh, clave_auth, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010',
            'web:99i-duplicada', 'https://fcm.googleapis.com/fcm/send/99i-propia', 'web',
            '30000000-0000-4000-8000-000000000001',
            'B' || repeat('A', 86), repeat('Q', 22),
            '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'dispositivos_notificacion_endpoint_vivo_uk: un endpoint vivo quedó en dos filas';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Una suscripción web sin vivienda no entra.
  BEGIN
    INSERT INTO public.dispositivos_de_notificacion
      (copropiedad_id, usuario_id, instalacion_id, token, plataforma,
       clave_p256dh, clave_auth, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000013',
            'web:99i-sin-vivienda', 'https://fcm.googleapis.com/fcm/send/99i-sin', 'web',
            'B' || repeat('A', 86), repeat('Q', 22),
            '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'dispositivos_notificacion_web_push_completa: entró una suscripción sin vivienda';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Baja lógica con motivo; el borrado físico, ni el servicio.
  UPDATE public.dispositivos_de_notificacion
     SET estado = 'inactivo', desactivado_en = now(), motivo_de_baja = 'el servicio respondió 410'
   WHERE instalacion_id = 'web:99i-propia';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'el servicio de MIRA no dio de baja la suscripción';
  BEGIN
    DELETE FROM public.dispositivos_de_notificacion WHERE instalacion_id = 'web:99i-propia';
    RAISE EXCEPTION 'dispositivos_de_notificacion: el servicio borró una suscripción';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- NEGATIVA · un residente de ROBLE no ve nada de MIRA.
SET LOCAL request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000002"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.dispositivos_de_notificacion
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 0, 'un residente de ROBLE ve aparatos de MIRA';
END $$;

ROLLBACK;

-- NEGATIVA · anon no toca la tabla.
BEGIN;
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM 1 FROM public.dispositivos_de_notificacion LIMIT 1;
  RAISE EXCEPTION 'dispositivos_de_notificacion: anon la lee';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
ROLLBACK;

\echo '99i_suscripciones_web_push.sql ok'
