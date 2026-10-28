-- =============================================================================
-- 99q · EL RESPALDO DIARIO DE LOS EVENTOS · D-147 (0061)
--
-- En transacciones que se DESHACEN:
--  · el servicio de Mira escribe su respaldo y sus envíos; no los de El Roble;
--  · nadie —servicio, administración ni el DUEÑO— hace UPDATE ni DELETE en
--    las dos tablas (ADR-005);
--  · un envío no puede apuntar a un respaldo de otra copropiedad;
--  · lee la superadministración y la administración de SU copropiedad; el
--    portero no, y la administración de El Roble no ve lo de Mira;
--  · el bucket es privado y su política sólo deja LEER a esos mismos, por la
--    copropiedad del primer tramo de la ruta; nadie escribe con su sesión.
-- =============================================================================

\set ON_ERROR_STOP on

-- Escritura del servicio y append-only ----------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';

DO $$
DECLARE
  v_respaldo uuid;
  n int;
BEGIN
  INSERT INTO public.respaldos_de_eventos (copropiedad_id, fecha, ruta, numero_de_eventos,
         permitidos, negados, sha256, tamano_bytes, creado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', '2026-10-20',
          '10000000-0000-4000-8000-000000000001/2026/10/eventos-2026-10-20.xls', 3, 2, 1,
          repeat('a', 64), 120, '00000000-0000-4000-8000-000000000001')
  RETURNING id INTO v_respaldo;

  INSERT INTO public.envios_de_respaldo (copropiedad_id, respaldo_id, destinatario_id,
         resultado, error, creado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', v_respaldo,
          '00000000-0000-4000-8000-000000000001', 'error', 'servidor SMTP no responde',
          '00000000-0000-4000-8000-000000000001');
  -- El reintento es una fila NUEVA, no un UPDATE.
  INSERT INTO public.envios_de_respaldo (copropiedad_id, respaldo_id, destinatario_id,
         resultado, enviado_en, creado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', v_respaldo,
          '00000000-0000-4000-8000-000000000001', 'enviado', now(),
          '00000000-0000-4000-8000-000000000001');

  -- El mismo día, dos veces: no.
  BEGIN
    INSERT INTO public.respaldos_de_eventos (copropiedad_id, fecha, ruta, numero_de_eventos,
           permitidos, negados, sha256, tamano_bytes, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '2026-10-20',
            '10000000-0000-4000-8000-000000000001/2026/10/eventos-2026-10-20.xls', 3, 2, 1,
            repeat('b', 64), 120, '00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION '99q: aceptó dos respaldos del mismo día';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Una ruta que no es la del día: no.
  BEGIN
    INSERT INTO public.respaldos_de_eventos (copropiedad_id, fecha, ruta, numero_de_eventos,
           permitidos, negados, sha256, tamano_bytes, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', '2026-10-21', 'otra/ruta.xls', 0, 0, 0,
            repeat('c', 64), 120, '00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION '99q: aceptó una ruta que no es la del día';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Un respaldo de El Roble con el servicio de Mira: la RLS lo impide.
  BEGIN
    INSERT INTO public.respaldos_de_eventos (copropiedad_id, fecha, ruta, numero_de_eventos,
           permitidos, negados, sha256, tamano_bytes, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000002', '2026-10-20',
            '10000000-0000-4000-8000-000000000002/2026/10/eventos-2026-10-20.xls', 0, 0, 0,
            repeat('d', 64), 120, '00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION '99q: el servicio de Mira escribió un respaldo de El Roble';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- UPDATE y DELETE: denegados en las dos tablas.
  BEGIN
    UPDATE public.respaldos_de_eventos SET creado_en = now() WHERE id = v_respaldo;
    RAISE EXCEPTION '99q: el servicio pudo hacer UPDATE en respaldos_de_eventos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.respaldos_de_eventos WHERE id = v_respaldo;
    RAISE EXCEPTION '99q: el servicio pudo hacer DELETE en respaldos_de_eventos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.envios_de_respaldo SET intentado_en = now() WHERE respaldo_id = v_respaldo;
    RAISE EXCEPTION '99q: el servicio pudo hacer UPDATE en envios_de_respaldo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.envios_de_respaldo WHERE respaldo_id = v_respaldo;
    RAISE EXCEPTION '99q: el servicio pudo hacer DELETE en envios_de_respaldo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) INTO n FROM public.envios_de_respaldo WHERE respaldo_id = v_respaldo;
  IF n <> 2 THEN RAISE EXCEPTION '99q: % intentos de envío, se esperaban 2', n; END IF;
END $$;
ROLLBACK;

-- El dueño tampoco: ni UPDATE ni DELETE (REVOKE y disparador) ------------------
BEGIN;
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
BEGIN
  INSERT INTO public.respaldos_de_eventos (copropiedad_id, fecha, ruta, numero_de_eventos,
         permitidos, negados, sha256, tamano_bytes, creado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', '2026-10-19',
          '10000000-0000-4000-8000-000000000001/2026/10/eventos-2026-10-19.xls', 0, 0, 0,
          repeat('e', 64), 120, '00000000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.respaldos_de_eventos SET negados = 0
     WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION '99q: el DUEÑO pudo hacer UPDATE en respaldos_de_eventos';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE '99q:%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.respaldos_de_eventos
     WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION '99q: el DUEÑO pudo hacer DELETE en respaldos_de_eventos';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    IF SQLERRM LIKE '99q:%' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;

-- Un envío que apunta a un respaldo de otra copropiedad ------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
BEGIN
  INSERT INTO public.envios_de_respaldo (copropiedad_id, respaldo_id, destinatario_id,
         resultado, error, creado_por)
  VALUES ('10000000-0000-4000-8000-000000000001', gen_random_uuid(),
          '00000000-0000-4000-8000-000000000001', 'error', 'x',
          '00000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION '99q: aceptó un envío de un respaldo inexistente';
EXCEPTION WHEN foreign_key_violation THEN NULL;
END $$;
ROLLBACK;

-- Lectura por rol, y el bucket --------------------------------------------------
BEGIN;
-- Como dueño (miembro de supabase_storage_admin en el doble): dos objetos, uno
-- por copropiedad, y un respaldo de cada una.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
INSERT INTO public.respaldos_de_eventos (copropiedad_id, fecha, ruta, numero_de_eventos,
       permitidos, negados, sha256, tamano_bytes, creado_por)
VALUES ('10000000-0000-4000-8000-000000000001', '2026-10-18',
        '10000000-0000-4000-8000-000000000001/2026/10/eventos-2026-10-18.xls', 1, 1, 0,
        repeat('f', 64), 120, '00000000-0000-4000-8000-000000000001');
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';
INSERT INTO public.respaldos_de_eventos (copropiedad_id, fecha, ruta, numero_de_eventos,
       permitidos, negados, sha256, tamano_bytes, creado_por)
VALUES ('10000000-0000-4000-8000-000000000002', '2026-10-18',
        '10000000-0000-4000-8000-000000000002/2026/10/eventos-2026-10-18.xls', 1, 0, 1,
        repeat('0', 64), 120, '00000000-0000-4000-8000-000000000001');
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('respaldo-de-eventos', '10000000-0000-4000-8000-000000000001/2026/10/eventos-2026-10-18.xls'),
  ('respaldo-de-eventos', '10000000-0000-4000-8000-000000000002/2026/10/eventos-2026-10-18.xls');

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM storage.buckets WHERE id = 'respaldo-de-eventos' AND NOT public;
  IF n <> 1 THEN RAISE EXCEPTION '99q: el bucket respaldo-de-eventos falta o es público'; END IF;
END $$;

-- Administración de Mira: lo suyo, nada de El Roble.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.respaldos_de_eventos WHERE fecha = '2026-10-18';
  IF n <> 1 THEN RAISE EXCEPTION '99q: la administración de Mira ve % respaldos (esperaba 1)', n; END IF;
  SELECT count(*) INTO n FROM public.respaldos_de_eventos
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
  IF n <> 0 THEN RAISE EXCEPTION '99q: la administración de Mira ve respaldos de El Roble'; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'respaldo-de-eventos';
  IF n <> 1 THEN RAISE EXCEPTION '99q: la administración de Mira ve % ficheros (esperaba 1)', n; END IF;
  -- Ni con su sesión puede subir un fichero al bucket: escribe sólo la API.
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('respaldo-de-eventos', '10000000-0000-4000-8000-000000000001/2026/10/x.xls');
    RAISE EXCEPTION '99q: la administración subió un fichero al bucket';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- Portero de Mira: nada.
SET LOCAL request.jwt.claims = '{"rol":"portero","usuario_id":"00000000-0000-4000-8000-000000000011","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.respaldos_de_eventos;
  IF n <> 0 THEN RAISE EXCEPTION '99q: el portero ve % respaldos', n; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'respaldo-de-eventos';
  IF n <> 0 THEN RAISE EXCEPTION '99q: el portero ve % ficheros del respaldo', n; END IF;
END $$;

-- Superadministración: las dos.
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000001","copropiedad_id":null}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.respaldos_de_eventos WHERE fecha = '2026-10-18';
  IF n <> 2 THEN RAISE EXCEPTION '99q: la superadministración ve % respaldos (esperaba 2)', n; END IF;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'respaldo-de-eventos';
  IF n <> 2 THEN RAISE EXCEPTION '99q: la superadministración ve % ficheros (esperaba 2)', n; END IF;
END $$;
ROLLBACK;

\echo '99q_respaldo_diario: OK'
