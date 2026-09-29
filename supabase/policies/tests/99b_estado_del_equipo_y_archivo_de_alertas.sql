-- =============================================================================
-- 99b · ESTADO DEL EQUIPO Y ARCHIVO DE ALERTAS · ETAPA 15-M (E5 / C7)
--
-- Prueba positiva y NEGATIVA de la 0044 sobre las politicas ya vigentes de la
-- 0014: el servicio de la copropiedad archiva su alerta; el servicio de OTRA
-- copropiedad no la ve ni la toca; el archivo sin motivo o sin autor lo
-- rechaza la base; y el estado del equipo lo escribe el servicio, no el
-- residente. Todo en una transaccion que se DESHACE.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL ROLE authenticated;

-- 1 · el SERVICIO de MIRA abre una alerta de camara que decide sola y otra de reloj.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"]}';
INSERT INTO public.alertas (id, copropiedad_id, dispositivo_id, tipo, severidad, estado,
  generada_en, notas, creado_por, actualizado_por)
VALUES ('99b00000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
        '90000000-0000-4000-8000-000000000001', 'acceso_dudoso', 'alta', 'abierta',
        now(), 'la camara no opera bajo la plataforma',
        '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003'),
       ('99b00000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
        '90000000-0000-4000-8000-000000000001', 'acceso_dudoso', 'informativa', 'abierta',
        now(), 'reloj del equipo 53 s adelantado',
        '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003');

DO $$
BEGIN
  -- Archivo sin motivo: la base lo rechaza (alertas_archivo_coherente).
  BEGIN
    UPDATE public.alertas SET archivada_en = now(),
      archivada_por = '00000000-0000-4000-8000-000000000003'
     WHERE id = '99b00000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'alertas: acepto un archivo sin motivo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Archivo sin autor: tampoco.
  BEGIN
    UPDATE public.alertas SET archivada_en = now(), motivo_archivo = 'ruido de sitio'
     WHERE id = '99b00000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'alertas: acepto un archivo sin autor';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Archivo completo: pasa, y la fila SIGUE existiendo (RN-19).
  UPDATE public.alertas SET archivada_en = now(), motivo_archivo = 'ruido de sitio',
    archivada_por = '00000000-0000-4000-8000-000000000003'
   WHERE id = '99b00000-0000-4000-8000-000000000001';
  RAISE NOTICE '99b · servicio de MIRA: archiva con motivo y autor; sin ellos, no: ok';
END $$;

-- 2 · el estado del equipo lo escribe el servicio de MIRA (dispositivos_edicion).
UPDATE public.dispositivos
   SET estado_salud = 'caido', salud_actualizada_en = now(),
       ultimo_sondeo = 'inalcanzable', sondeado_en = now()
 WHERE id = '90000000-0000-4000-8000-000000000001';
DO $$
DECLARE s text;
BEGIN
  SELECT estado_salud::text INTO s FROM public.dispositivos
   WHERE id = '90000000-0000-4000-8000-000000000001';
  ASSERT s = 'caido', format('dispositivos: el servicio no pudo escribir estado_salud (%s)', s);
  BEGIN
    UPDATE public.dispositivos SET ultimo_sondeo = 'cualquiera'
     WHERE id = '90000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'dispositivos: acepto una clase de sondeo fuera del enumerado';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE '99b · servicio de MIRA: escribe estado_salud y el sondeo tipado: ok';
END $$;

-- 3 · el SERVICIO de OTRA copropiedad no ve la alerta ni puede archivarla.
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000003","copropiedad_id":"10000000-0000-4000-8000-000000000002","copropiedades":["10000000-0000-4000-8000-000000000002"]}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.alertas WHERE id::text LIKE '99b00000-%';
  ASSERT n = 0, format('alertas_lectura: otra copropiedad ve %s alertas de MIRA', n);
  UPDATE public.alertas SET archivada_en = now(), motivo_archivo = 'ajeno',
    archivada_por = '00000000-0000-4000-8000-000000000003'
   WHERE id = '99b00000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'alertas_edicion: otra copropiedad archivo una alerta de MIRA';
  UPDATE public.dispositivos SET estado_salud = 'saludable'
   WHERE id = '90000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'dispositivos_edicion: otra copropiedad escribio el estado de un equipo de MIRA';
  RAISE NOTICE '99b · servicio de otra copropiedad: ni ve ni archiva ni escribe: ok';
END $$;

-- 4 · el RESIDENTE de MIRA no ve las alertas ni escribe el estado del equipo.
SET LOCAL request.jwt.claims = '{"rol":"residente","usuario_id":"00000000-0000-4000-8000-000000000013","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.alertas WHERE id::text LIKE '99b00000-%';
  ASSERT n = 0, format('alertas_lectura: el residente ve %s alertas', n);
  UPDATE public.dispositivos SET estado_salud = 'saludable'
   WHERE id = '90000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'dispositivos_edicion: el residente escribio el estado de un equipo';
  RAISE NOTICE '99b · residente: no ve alertas ni escribe estado: ok';
END $$;

-- 5 · el PORTERO de MIRA ve la alerta vigente y la archivada sigue en la tabla (RN-19).
SET LOCAL request.jwt.claims = '{"rol":"portero","usuario_id":"00000000-0000-4000-8000-000000000011","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.alertas WHERE id::text LIKE '99b00000-%' AND archivada_en IS NULL;
  ASSERT n = 1, format('alertas_lectura: el portero ve %s alertas vigentes, no 1', n);
  SELECT count(*) INTO n FROM public.alertas WHERE id::text LIKE '99b00000-%';
  ASSERT n = 2, format('RN-19: la alerta archivada desaparecio (%s filas)', n);
  RAISE NOTICE '99b · portero: ve la vigente; la archivada sigue existiendo: ok';
END $$;

ROLLBACK;
