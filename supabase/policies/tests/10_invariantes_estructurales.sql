-- =============================================================================
-- Invariantes de nivel estructural
--
-- Se ejecuta como superusuario A PROPÓSITO: demuestra que estas reglas se
-- cumplen aunque el actor omita RLS por completo, que es exactamente la
-- situación de `service_role` (modelo-datos.md §8.4).
-- =============================================================================

\set ON_ERROR_STOP on
SET request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002"}';

-- RN-04 · CA-03 · KPI-02 — placa duplicada activa rechazada -------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
            'ABC1234','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'RN-04 INCUMPLIDA: se acepto una placa ya activa en la copropiedad';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'RN-04/CA-03 placa duplicada rechazada: ok';
  END;
END
$$;

-- D-05 — la misma placa SI puede existir en otra copropiedad ------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.vehiculos WHERE placa = 'ABC1234';
  ASSERT n = 2, format('D-05: ABC1234 deberia existir en 2 copropiedades, hay %s', n);
  RAISE NOTICE 'D-05 unicidad por copropiedad, no global: ok';
END
$$;

-- Normalización verificada por la base (§4.1) ---------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.vehiculos (copropiedad_id, vivienda_id, placa, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
            'abc-1234','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'La base acepto una placa sin normalizar';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'placa sin normalizar rechazada: ok';
  END;
END
$$;

-- RN-14 · CA-14 — el aforo no puede superar el máximo ------------------------
DO $$
BEGIN
  BEGIN
    UPDATE public.zona_aforo SET conteo_actual = aforo_maximo + 1
     WHERE zona_id = '80000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'RN-14 INCUMPLIDA: el aforo supero el maximo';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-14/CA-14 aforo por encima del maximo rechazado: ok';
  END;
END
$$;

-- CA-14 — el incremento atómico devuelve 0 filas cuando el aforo está lleno ---
DO $$
DECLARE n int;
BEGIN
  -- Gimnasio: 22/25. Tres incrementos caben; el cuarto no.
  FOR i IN 1..3 LOOP
    UPDATE public.zona_aforo SET conteo_actual = conteo_actual + 1
     WHERE zona_id = '80000000-0000-4000-8000-000000000002' AND conteo_actual < aforo_maximo;
  END LOOP;

  WITH intento AS (
    UPDATE public.zona_aforo SET conteo_actual = conteo_actual + 1
     WHERE zona_id = '80000000-0000-4000-8000-000000000002' AND conteo_actual < aforo_maximo
    RETURNING 1)
  SELECT count(*) INTO n FROM intento;

  ASSERT n = 0, 'CA-14: el incremento deberia devolver 0 filas con el aforo lleno';
  RAISE NOTICE 'CA-14 incremento atomico con aforo lleno devuelve 0 filas: ok';

  UPDATE public.zona_aforo SET conteo_actual = 22 WHERE zona_id = '80000000-0000-4000-8000-000000000002';
END
$$;

-- CA-16 · RN-08 — apertura manual sin motivo NO puede registrarse ------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.eventos (copropiedad_id, ocurrido_en, tipo, resultado, metodo,
                                dispositivo_id, regla_aplicada, version_reglas,
                                clave_idempotencia, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', now(),'manual','permitido','manual',
            '90000000-0000-4000-8000-000000000003','apertura_manual',1,
            'test-ca16-sin-motivo','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'CA-16 INCUMPLIDA: se registro una apertura manual sin motivo ni operador';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CA-16 apertura manual sin motivo rechazada: ok';
  END;

  -- Y tampoco con un motivo de solo espacios (el btrim del CHECK).
  BEGIN
    INSERT INTO public.eventos (copropiedad_id, ocurrido_en, tipo, resultado, metodo,
                                dispositivo_id, regla_aplicada, version_reglas,
                                clave_idempotencia, operador_id, motivo_manual, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', now(),'manual','permitido','manual',
            '90000000-0000-4000-8000-000000000003','apertura_manual',1,
            'test-ca16-motivo-vacio','00000000-0000-4000-8000-000000000011','   ',
            '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'CA-16 INCUMPLIDA: se acepto un motivo en blanco';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'CA-16 motivo en blanco rechazado: ok';
  END;

  -- Con motivo y operador, si se registra (CA-17).
  INSERT INTO public.eventos (copropiedad_id, ocurrido_en, tipo, resultado, metodo,
                              dispositivo_id, regla_aplicada, version_reglas,
                              clave_idempotencia, operador_id, motivo_manual, creado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', now(),'manual','permitido','manual',
          '90000000-0000-4000-8000-000000000003','apertura_manual',1,
          'test-ca17-con-motivo','00000000-0000-4000-8000-000000000011',
          'Residente confirmo por telefono','00000000-0000-4000-8000-000000000002');
  RAISE NOTICE 'CA-17 apertura manual con motivo e identidad registrada: ok';
END
$$;

-- Errores tipados — negar sin motivo es imposible ----------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.eventos (copropiedad_id, ocurrido_en, tipo, resultado, metodo,
                                dispositivo_id, regla_aplicada, version_reglas,
                                clave_idempotencia, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', now(),'denegado','negado','placa',
            '90000000-0000-4000-8000-000000000001','vigencia',1,
            'test-negado-sin-motivo','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Se registro un acceso negado sin motivo tipado';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'negacion sin motivo tipado rechazada: ok';
  END;
END
$$;

-- D-18 — FUERA_DE_HORARIO existe y es distinguible de AFORO_SUPERADO ---------
DO $$
DECLARE n int;
BEGIN
  INSERT INTO public.eventos (copropiedad_id, ocurrido_en, tipo, resultado, motivo, metodo,
                              dispositivo_id, zona_id, regla_aplicada, version_reglas,
                              clave_idempotencia, creado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', now(),'denegado','negado','FUERA_DE_HORARIO','rostro',
          '90000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000003',
          'zona.horario',1,'test-ca15-fuera-de-horario','00000000-0000-4000-8000-000000000002'),
         ('10000000-0000-4000-8000-000000000001', now(),'denegado','negado','AFORO_SUPERADO','rostro',
          '90000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002',
          'zona.aforo',1,'test-ca14-aforo','00000000-0000-4000-8000-000000000002');

  SELECT count(DISTINCT motivo) INTO n FROM public.eventos
   WHERE motivo IN ('FUERA_DE_HORARIO','AFORO_SUPERADO');
  ASSERT n = 2, 'D-18: CA-14 y CA-15 deben quedar con motivos distinguibles';
  RAISE NOTICE 'D-18 CA-14 y CA-15 distinguibles en el evento: ok';
END
$$;

-- RN-09 · CA-09 — sin consentimiento vigente no hay sincronización -----------
DO $$
DECLARE v_consent uuid;
BEGIN
  INSERT INTO public.consentimientos_biometricos
    (copropiedad_id, persona_id, version_politica, canal, creado_por, actualizado_por)
  VALUES ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000101',
          'v1.0','app','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
  RETURNING id INTO v_consent;

  -- Nivel 1: no se puede crear plantilla sin fila de consentimiento (D-09).
  BEGIN
    INSERT INTO public.plantillas_biometricas
      (copropiedad_id, persona_id, consentimiento_id, calidad, suprimir_en, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000101',
            NULL, 0.9, now() + interval '1 day',
            '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'RN-09 nivel 1 INCUMPLIDA: plantilla sin consentimiento';
  EXCEPTION WHEN not_null_violation THEN
    RAISE NOTICE 'RN-09 nivel 1 (FK NOT NULL): ok';
  END;

  -- Nivel 2: con consentimiento PENDIENTE, la plantilla no puede sincronizarse.
  BEGIN
    INSERT INTO public.plantillas_biometricas
      (copropiedad_id, persona_id, consentimiento_id, calidad, suprimir_en, estado,
       creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000101',
            v_consent, 0.9, now() + interval '1 day','pendiente_sincronizacion',
            '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'RN-09 nivel 2 INCUMPLIDA: se encolo sincronizacion sin consentimiento vigente';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-09/CA-09 nivel 2 (consentimiento no vigente): ok';
  END;

  -- Con el consentimiento otorgado, si procede.
  UPDATE public.consentimientos_biometricos
     SET estado = 'vigente', otorgado_en = now() WHERE id = v_consent;
  INSERT INTO public.plantillas_biometricas
    (copropiedad_id, persona_id, consentimiento_id, calidad, suprimir_en, estado,
     creado_por, actualizado_por)
  VALUES ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000101',
          v_consent, 0.9, now() + interval '1 day','pendiente_sincronizacion',
          '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
  RAISE NOTICE 'RN-09 con consentimiento vigente la sincronizacion procede: ok';
END
$$;

-- RN-05 — un residente no autoriza hacia otra vivienda -----------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.autorizaciones
      (copropiedad_id, vivienda_id, visitante_id, autorizado_por, tipo, vigencia,
       creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
            '60000000-0000-4000-8000-000000000101','50000000-0000-4000-8000-000000000042',
            'unica', tstzrange(now(), now() + interval '1 day','[)'),
            '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'RN-05 INCUMPLIDA: se autorizo hacia una vivienda ajena';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-05 autorizacion hacia vivienda ajena rechazada: ok';
  END;
END
$$;

-- RN-13 — una vivienda inactiva no genera autorizaciones nuevas --------------
DO $$
BEGIN
  UPDATE public.viviendas
     SET estado = 'inactivo', desactivado_en = now(),
         desactivado_por = '00000000-0000-4000-8000-000000000002'
   WHERE id = '30000000-0000-4000-8000-000000000089';

  BEGIN
    INSERT INTO public.autorizaciones
      (copropiedad_id, vivienda_id, visitante_id, autorizado_por, tipo, vigencia,
       creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000089',
            '60000000-0000-4000-8000-000000000101','50000000-0000-4000-8000-000000000089',
            'unica', tstzrange(now(), now() + interval '1 day','[)'),
            '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'RN-13 INCUMPLIDA: vivienda inactiva genero autorizacion nueva';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-13 vivienda inactiva no genera autorizaciones nuevas: ok';
  END;

  -- Pero las vigentes se conservan: la creada antes sigue ahi.
  PERFORM 1 FROM public.autorizaciones
   WHERE vivienda_id = '30000000-0000-4000-8000-000000000089';
  ASSERT FOUND, 'RN-13: las autorizaciones vigentes de una vivienda inactiva deben conservarse';
  RAISE NOTICE 'RN-13 las vigentes se conservan: ok';

  UPDATE public.viviendas SET estado='activo', desactivado_en=NULL, desactivado_por=NULL
   WHERE id='30000000-0000-4000-8000-000000000089';
END
$$;

-- RN-19 · CA-02 — borrado físico prohibido -----------------------------------
DO $$
BEGIN
  BEGIN
    DELETE FROM public.residentes WHERE id = '50000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'RN-19 INCUMPLIDA: se borro fisicamente un residente';
  EXCEPTION WHEN restrict_violation THEN
    RAISE NOTICE 'RN-19/CA-02 borrado fisico prohibido: ok';
  END;
END
$$;

-- RN-17 · CA-22 — idempotencia de la reconciliación (decisión D-11) ----------
DO $$
DECLARE n int;
BEGIN
  INSERT INTO public.bandeja_salida_edge
    (copropiedad_id, edge_id, clave_idempotencia, ocurrido_en, creado_por, actualizado_por)
  VALUES ('10000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
          'evt-reconciliacion-0001', now(),
          '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');

  -- Reenvio con OTRO ocurrido_en: el indice de `eventos` no lo detendria, pero
  -- la bandeja si. Es el nucleo de la decision D-11.
  WITH reintento AS (
    INSERT INTO public.bandeja_salida_edge
      (copropiedad_id, edge_id, clave_idempotencia, ocurrido_en, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
            'evt-reconciliacion-0001', now() + interval '3 hours',
            '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002')
    ON CONFLICT (copropiedad_id, clave_idempotencia) DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO n FROM reintento;

  ASSERT n = 0, 'RN-17/D-11: el reenvio con marca temporal distinta deberia descartarse';
  RAISE NOTICE 'RN-17/CA-22 idempotencia con ocurrido_en recalculado: ok';
END
$$;

-- RN-21 · D-09b — una credencial literal no entra ----------------------------
DO $$
BEGIN
  BEGIN
    UPDATE public.dispositivos SET credencial_ref = 'admin:Contrasena123'
     WHERE id = '90000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'RN-21 INCUMPLIDA: se guardo una credencial literal';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-21/D-09b credencial literal rechazada: ok';
  END;
END
$$;

-- RN-16 — la versión de reglas es monótona y consecutiva ---------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.versiones_de_reglas
      (copropiedad_id, numero, hash, publicada_por, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', 7, repeat('b',64),
            '00000000-0000-4000-8000-000000000002',
            '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'RN-16 INCUMPLIDA: se publico una version no consecutiva';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-16 version de reglas consecutiva: ok';
  END;
END
$$;

-- P-11 — el nivel por defecto es el más restrictivo --------------------------
DO $$
DECLARE v_clave text;
BEGIN
  INSERT INTO public.personas (id, copropiedad_id, tipo_documento, numero_documento,
                               nombre_completo, creado_por, actualizado_por)
  VALUES ('40000000-0000-4000-8000-000000000777','10000000-0000-4000-8000-000000000001',
          'cedula','1000000777','Residente Nuevo',
          '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');

  INSERT INTO public.residentes (copropiedad_id, vivienda_id, persona_id, creado_por, actualizado_por)
  VALUES ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000042',
          '40000000-0000-4000-8000-000000000777',
          '00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');

  SELECT n.clave INTO v_clave
    FROM public.residentes r JOIN public.niveles_acceso n ON n.id = r.nivel_acceso_id
   WHERE r.persona_id = '40000000-0000-4000-8000-000000000777';

  ASSERT v_clave = 'solo_ingreso',
    format('P-11: el nivel por defecto deberia ser el mas restrictivo, fue %s', v_clave);
  RAISE NOTICE 'P-11 nivel de acceso por defecto = el mas restrictivo: ok';
END
$$;
