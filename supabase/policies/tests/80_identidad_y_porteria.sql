-- =============================================================================
-- 80 · IDENTIDAD POR USUARIO Y PORTERÍA · ETAPA 15-H · ADR-023 · ADR-024
--
-- Una prueba NEGATIVA por cada política nueva de la 0037, más lo que la base
-- sostiene por su cuenta: el gancho que emite el cambio obligatorio, el
-- disparador que impide a una cuenta editarse a sí misma, la franja del turno
-- que cruza la medianoche, la sesión cerrada que no se reabre y la bitácora
-- append-only frente a TODOS, dueño incluido (ADR-005).
--
-- Todo dentro de una transacción que se DESHACE al final: los datos de
-- prueba —también las filas de la bitácora— no quedan en la base.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- 0 · Datos: un portero por copropiedad, con perfil, turno, sesión y rastro.
-- ---------------------------------------------------------------------------
INSERT INTO public.usuarios (id, copropiedad_id, auth_user_id, correo, nombre_usuario, nombre,
                             debe_cambiar_contrasena, creado_por, actualizado_por)
VALUES ('80000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001',
        '80000000-0000-4000-8000-0000000000f1', NULL, 'porteria.mira', 'Portero Mira', true,
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
       ('80000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000002',
        '80000000-0000-4000-8000-0000000000f2', NULL, 'porteria.mira', 'Portero Roble', false,
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
INSERT INTO public.roles_usuario (copropiedad_id, usuario_id, rol, creado_por, actualizado_por)
VALUES ('10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-0000000000a1', 'portero',
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
       ('10000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-0000000000b1', 'portero',
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
INSERT INTO public.perfiles_de_portero (usuario_id, copropiedad_id, porteria, sectores, creado_por, actualizado_por)
VALUES ('80000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-000000000001', 'Norte', '{Torre 1}',
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
       ('80000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-000000000002', 'Sur', '{}',
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
INSERT INTO public.turnos_de_porteria (id, copropiedad_id, portero_id, porteria, dia, hora_inicio, hora_fin,
                                       franja, creado_por, actualizado_por)
VALUES ('80000000-0000-4000-8000-0000000000a2', '10000000-0000-4000-8000-000000000001',
        '80000000-0000-4000-8000-0000000000a1', 'Norte', '2026-09-25', '22:00', '06:00', 'empty',
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001'),
       ('80000000-0000-4000-8000-0000000000b2', '10000000-0000-4000-8000-000000000002',
        '80000000-0000-4000-8000-0000000000b1', 'Sur', '2026-09-25', '06:00', '14:00', 'empty',
        '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
INSERT INTO public.sesiones_de_porteria (sesion_id, copropiedad_id, portero_id, turno_id, codigo_hash,
                                         iniciada_en, creado_por, actualizado_por)
VALUES ('80000000-0000-4000-8000-0000000000a3', '10000000-0000-4000-8000-000000000001',
        '80000000-0000-4000-8000-0000000000a1', '80000000-0000-4000-8000-0000000000a2',
        'scrypt$c2FsLWRlLXBydWViYQ==$aGFzaC1kZS1wcnVlYmE=', now(),
        '80000000-0000-4000-8000-0000000000a1', '80000000-0000-4000-8000-0000000000a1'),
       ('80000000-0000-4000-8000-0000000000b3', '10000000-0000-4000-8000-000000000002',
        '80000000-0000-4000-8000-0000000000b1', '80000000-0000-4000-8000-0000000000b2',
        'scrypt$c2FsLWRlLXBydWViYQ==$aGFzaC1kZS1wcnVlYmE=', now(),
        '80000000-0000-4000-8000-0000000000b1', '80000000-0000-4000-8000-0000000000b1');
INSERT INTO public.bitacora_de_porteria (id, copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id)
VALUES ('80000000-0000-4000-8000-0000000000a4', '10000000-0000-4000-8000-000000000001', now(),
        'inicio_de_sesion', '80000000-0000-4000-8000-0000000000a1', '80000000-0000-4000-8000-0000000000a1'),
       ('80000000-0000-4000-8000-0000000000b4', '10000000-0000-4000-8000-000000000002', now(),
        'inicio_de_sesion', '80000000-0000-4000-8000-0000000000b1', '80000000-0000-4000-8000-0000000000b1');

-- ---------------------------------------------------------------------------
-- 1 · La base calcula la franja, y el turno de 22:00 a 06:00 cruza la medianoche.
-- ---------------------------------------------------------------------------
DO $$
DECLARE f tstzrange;
BEGIN
  SELECT franja INTO f FROM public.turnos_de_porteria WHERE id = '80000000-0000-4000-8000-0000000000a2';
  ASSERT lower(f) = '2026-09-26 03:00:00+00'::timestamptz, format('inicio de la franja: %s', lower(f));
  ASSERT upper(f) = '2026-09-26 11:00:00+00'::timestamptz, format('fin de la franja: %s', upper(f));
  ASSERT f @> '2026-09-26 10:59:59.999+00'::timestamptz AND NOT f @> '2026-09-26 11:00:00+00'::timestamptz,
    'la franja no es semiabierta';
  RAISE NOTICE '80 · franja en la zona de la copropiedad, cruzando la medianoche: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 2 · El gancho emite el cambio obligatorio, y lo retira cuando se apaga.
-- ---------------------------------------------------------------------------
DO $$
DECLARE c jsonb;
BEGIN
  c := public.custom_access_token_hook(jsonb_build_object(
         'user_id', '80000000-0000-4000-8000-0000000000f1', 'claims', '{}'::jsonb)) -> 'claims';
  ASSERT (c ->> 'debe_cambiar_contrasena')::boolean IS TRUE, format('sin el indicador: %s', c);
  ASSERT c ->> 'rol' = 'portero', 'el gancho no emitió el rol';
  ASSERT NOT c::text LIKE '%.invalid%', 'el gancho emitió un correo sintético';
  UPDATE public.usuarios SET debe_cambiar_contrasena = false WHERE id = '80000000-0000-4000-8000-0000000000a1';
  c := public.custom_access_token_hook(jsonb_build_object(
         'user_id', '80000000-0000-4000-8000-0000000000f1',
         'claims', '{"debe_cambiar_contrasena": true}'::jsonb)) -> 'claims';
  ASSERT NOT c ? 'debe_cambiar_contrasena', 'el indicador sobrevivió a un token anterior';
  UPDATE public.usuarios SET debe_cambiar_contrasena = true WHERE id = '80000000-0000-4000-8000-0000000000a1';
  RAISE NOTICE '80 · gancho: emite y retira debe_cambiar_contrasena: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 3 · Nombre de usuario: formato y unicidad por copropiedad, sin mayúsculas.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    UPDATE public.usuarios SET nombre_usuario = 'PORTERIA.MIRA' WHERE id = '00000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'se admitió un usuario repetido con otras mayúsculas';
  EXCEPTION WHEN unique_violation OR check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.usuarios SET nombre_usuario = 'con espacio' WHERE id = '00000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'se admitió un usuario con espacio';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '80 · nombre de usuario: formato y unicidad por copropiedad (citext): ok';
END $$;

-- ---------------------------------------------------------------------------
-- 4 · Negativas por política, como `authenticated` con los claims de cada rol.
-- ---------------------------------------------------------------------------
SET ROLE authenticated;

-- 4.1 portero de MIRA: ve SU perfil y SUS turnos; ni sesiones ni bitácora.
SET request.jwt.claims = '{"rol":"portero","usuario_id":"80000000-0000-4000-8000-0000000000a1","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.perfiles_de_portero;
  ASSERT n = 1, format('perfiles_portero_lectura: el portero ve %s perfiles', n);
  SELECT count(*) INTO n FROM public.turnos_de_porteria;
  ASSERT n = 1, format('turnos_lectura: el portero ve %s turnos', n);
  SELECT count(*) INTO n FROM public.sesiones_de_porteria;
  ASSERT n = 0, 'sesiones_porteria_lectura: el portero lee sesiones';
  SELECT count(*) INTO n FROM public.bitacora_de_porteria;
  ASSERT n = 0, 'bitacora_porteria_lectura: el portero lee la bitácora';

  BEGIN
    INSERT INTO public.turnos_de_porteria (copropiedad_id, portero_id, dia, hora_inicio, hora_fin, franja, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-0000000000a1', '2026-09-27', '06:00', '14:00', 'empty',
            '80000000-0000-4000-8000-0000000000a1', '80000000-0000-4000-8000-0000000000a1');
    RAISE EXCEPTION 'turnos_insercion: el portero se asignó un turno';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.turnos_de_porteria SET hora_fin = '23:00' WHERE id = '80000000-0000-4000-8000-0000000000a2';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'turnos_edicion: el portero editó su turno';
  UPDATE public.perfiles_de_portero SET porteria = 'Otra' WHERE usuario_id = '80000000-0000-4000-8000-0000000000a1';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'perfiles_portero_edicion: el portero editó su perfil';
  BEGIN
    UPDATE public.usuarios SET nombre = 'Me renombro' WHERE id = '80000000-0000-4000-8000-0000000000a1';
    RAISE EXCEPTION 'tg_usuario_campos_propios: el portero editó su cuenta';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.bitacora_de_porteria (copropiedad_id, ocurrido_en, tipo) VALUES
      ('10000000-0000-4000-8000-000000000001', now(), 'fin_de_patrullaje');
    RAISE EXCEPTION 'bitacora_porteria_insercion: el portero escribió en la bitácora';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '80 · portero: su perfil y sus turnos, nada más; no edita ni escribe: ok';
END $$;

-- 4.2 residente: no se baja el cambio obligatorio ni se cambia de copropiedad.
SET request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
BEGIN
  BEGIN
    UPDATE public.usuarios SET debe_cambiar_contrasena = true WHERE id = '00000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'tg_usuario_campos_propios: el residente tocó su indicador';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.usuarios SET copropiedad_id = '10000000-0000-4000-8000-000000000002' WHERE id = '00000000-0000-4000-8000-000000000013';
    RAISE EXCEPTION 'tg_usuario_campos_propios: el residente se cambió de copropiedad';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  RAISE NOTICE '80 · residente: ni su indicador ni su copropiedad: ok';
END $$;

-- 4.3 administrador de MIRA: lee lo suyo, nada de ROBLE; no escribe turnos, sesiones ni perfiles.
SET request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.sesiones_de_porteria WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
  ASSERT n = 0, 'sesiones_porteria_lectura: fuga a otra copropiedad';
  SELECT count(*) INTO n FROM public.bitacora_de_porteria WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
  ASSERT n = 0, 'bitacora_porteria_lectura: fuga a otra copropiedad';
  SELECT count(*) INTO n FROM public.turnos_de_porteria WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
  ASSERT n = 0, 'turnos_lectura: fuga a otra copropiedad';
  SELECT count(*) INTO n FROM public.perfiles_de_portero WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
  ASSERT n = 0, 'perfiles_portero_lectura: fuga a otra copropiedad';
  SELECT count(*) INTO n FROM public.bitacora_de_porteria;
  ASSERT n = 1, format('bitacora_porteria_lectura: el administrador ve %s filas propias', n);

  BEGIN
    INSERT INTO public.perfiles_de_portero (usuario_id, copropiedad_id, creado_por, actualizado_por)
    VALUES ('00000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'perfiles_portero_insercion: el administrador dio de alta un portero';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.sesiones_de_porteria (sesion_id, copropiedad_id, portero_id, turno_id, codigo_hash, iniciada_en, creado_por, actualizado_por)
    VALUES (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-0000000000a1',
            '80000000-0000-4000-8000-0000000000a2', 'scrypt$c2FsLWRlLXBydWViYQ==$aGFzaA==', now(),
            '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'sesiones_porteria_insercion: el administrador abrió una sesión';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.sesiones_de_porteria SET estado = 'patrullaje', patrullaje_desde = now()
   WHERE sesion_id = '80000000-0000-4000-8000-0000000000a3';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'sesiones_porteria_edicion: el administrador puso en patrullaje una sesión';
  BEGIN
    INSERT INTO public.turnos_de_porteria (copropiedad_id, portero_id, dia, hora_inicio, hora_fin, franja, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-0000000000a1', '2026-09-27', '06:00', '14:00', 'empty',
            '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'turnos_insercion: el administrador asignó un turno (es del superadministrador)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.bitacora_de_porteria (copropiedad_id, ocurrido_en, tipo)
    VALUES ('10000000-0000-4000-8000-000000000001', now(), 'turno_extra');
    RAISE EXCEPTION 'bitacora_porteria_insercion: el administrador escribió en la bitácora';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '80 · administrador: lee su copropiedad y no escribe portería: ok';
END $$;

-- 4.4 superadministrador: NO abre sesiones de portería (sólo el servicio las registra).
SET request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000001","copropiedad_id":null}';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.sesiones_de_porteria (sesion_id, copropiedad_id, portero_id, turno_id, codigo_hash, iniciada_en, creado_por, actualizado_por)
    VALUES (gen_random_uuid(), '10000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-0000000000a1',
            '80000000-0000-4000-8000-0000000000a2', 'scrypt$c2FsLWRlLXBydWViYQ==$aGFzaA==', now(),
            '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'sesiones_porteria_insercion: el superadministrador abrió una sesión';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '80 · superadministrador: no fabrica sesiones de portero: ok';
END $$;

-- 4.5 servicio de ROBLE: nada de MIRA, ni para leer ni para escribir.
SET request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.sesiones_de_porteria WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 0, 'servicio: lee sesiones de otra copropiedad';
  SELECT count(*) INTO n FROM public.turnos_de_porteria WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  ASSERT n = 0, 'servicio: lee turnos de otra copropiedad';
  BEGIN
    INSERT INTO public.bitacora_de_porteria (copropiedad_id, ocurrido_en, tipo)
    VALUES ('10000000-0000-4000-8000-000000000001', now(), 'inicio_de_sesion');
    RAISE EXCEPTION 'bitacora_porteria_insercion: el servicio de ROBLE escribió en MIRA';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.sesiones_de_porteria SET estado = 'patrullaje', patrullaje_desde = now()
   WHERE sesion_id = '80000000-0000-4000-8000-0000000000a3';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'sesiones_porteria_edicion: el servicio de ROBLE tocó una sesión de MIRA';
  -- Y la bitácora, ni el servicio de su propia copropiedad la edita.
  BEGIN
    UPDATE public.bitacora_de_porteria SET detalle = 'reescrito' WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'bitácora: el servicio la editó';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE '80 · servicio: su copropiedad y nada más; la bitácora no se edita: ok';
END $$;

RESET ROLE;
RESET request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 5 · Bitácora append-only frente al DUEÑO (ADR-005): ACL y disparador.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n int; dueno text;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO dueno FROM pg_class WHERE relname = 'bitacora_de_porteria';
  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'bitacora_de_porteria'
     AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');
  ASSERT n = 0, format('la bitácora conserva %s privilegios de edición (dueño %s)', n, dueno);
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', dueno);
    UPDATE public.bitacora_de_porteria SET detalle = 'reescrito' WHERE id = '80000000-0000-4000-8000-0000000000a4';
    RAISE EXCEPTION 'el DUEÑO editó la bitácora';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  BEGIN
    EXECUTE format('SET LOCAL ROLE %I', dueno);
    DELETE FROM public.bitacora_de_porteria WHERE id = '80000000-0000-4000-8000-0000000000a4';
    RAISE EXCEPTION 'el DUEÑO borró de la bitácora';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;
  RAISE NOTICE '80 · bitácora frente al dueño (%): sin UPDATE, DELETE ni TRUNCATE: ok', dueno;
END $$;

-- Y el disparador alcanza incluso a la sesión tal como llega (superusuario local).
DO $$
DECLARE m text;
BEGIN
  BEGIN
    UPDATE public.bitacora_de_porteria SET detalle = 'reescrito' WHERE id = '80000000-0000-4000-8000-0000000000a4';
    m := 'editó';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%append-only%', format('UPDATE rechazado por otra causa: %s', SQLERRM);
  END;
  ASSERT m IS NULL, 'la conexión sin cambio de rol editó la bitácora';
  BEGIN
    DELETE FROM public.bitacora_de_porteria WHERE id = '80000000-0000-4000-8000-0000000000a4';
    m := 'borró';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM ILIKE '%prohibid%', format('DELETE rechazado por otra causa: %s', SQLERRM);
  END;
  ASSERT m IS NULL, 'la conexión sin cambio de rol borró de la bitácora';
  RAISE NOTICE '80 · bitácora: el disparador bloquea UPDATE y DELETE a la conexión: ok';
END $$;

-- ---------------------------------------------------------------------------
-- 6 · Una sesión cerrada no se reabre.
-- ---------------------------------------------------------------------------
DO $$
DECLARE reabierta boolean := false;
BEGIN
  UPDATE public.sesiones_de_porteria SET estado = 'cerrada', cerrada_en = now(), motivo_cierre = 'manual'
   WHERE sesion_id = '80000000-0000-4000-8000-0000000000a3';
  BEGIN
    UPDATE public.sesiones_de_porteria SET estado = 'activa', cerrada_en = NULL, motivo_cierre = NULL
     WHERE sesion_id = '80000000-0000-4000-8000-0000000000a3';
    reabierta := true;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  ASSERT NOT reabierta, 'una sesión cerrada se reabrió';
  RAISE NOTICE '80 · sesión cerrada: no se reabre: ok';
END $$;

ROLLBACK;
