-- =============================================================================
-- ETAPA 15-B · lo que la migración 0032 tiene que sostener por ejecución
--
--   A.1 · el secreto de un equipo se guarda CIFRADO y NO lo lee ningún token
--         de usuario, ni siquiera el del superadministrador.
--   B.2 · una vivienda con historial NO se borra; una sin historial SÍ, y el
--         borrado deja rastro.
--
-- Se ejecuta con `service_role`, que OMITE RLS, y se cambia de rol a propósito
-- donde lo que se prueba es la política de fila. Es la misma disciplina del
-- fichero 50: una garantía que solo existe en la RLS no protege el camino de
-- servicio, que es el que usan el Edge, los workers y la ingesta.
-- =============================================================================

\set ON_ERROR_STOP on
SET ROLE service_role;
-- Los claims llevan `copropiedad_id` a proposito: `service_role` OMITE la RLS,
-- pero la funcion de borrado es SECURITY DEFINER y dentro de ella manda el
-- dueno de la tabla, que SI esta sujeto a la RLS forzada. Sin la copropiedad en
-- los claims, `app.es_mi_copropiedad` es falso y la vivienda «no existe».
-- Es exactamente lo que le pasara a la API si algun dia deja de ponerlos.
SET request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';

\set COP    '''10000000-0000-4000-8000-000000000001'''
\set COP2   '''10000000-0000-4000-8000-000000000002'''
\set ACTOR  '''00000000-0000-4000-8000-000000000002'''

-- ── A.1 · un equipo nuevo, con su sobre cifrado ──────────────────────────────
INSERT INTO public.dispositivos
  (id, copropiedad_id, nombre, tipo, host, puerto, protocolo, usuario,
   credencial_ref, creado_por, actualizado_por)
VALUES ('d0000000-0000-4000-8000-000000000001', :COP, 'Camara de la entrada',
        'camara_lpr', '198.51.100.10', 80, 'http', 'servicio_ncr',
        'vault:equipos/d0000000', :ACTOR, :ACTOR);

DO $$
BEGIN
  -- El CHECK de RN-21 sigue en pie: una contrasena literal no entra.
  BEGIN
    UPDATE public.dispositivos SET credencial_ref = 'Admin12345'
     WHERE id = 'd0000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'RN-21 INCUMPLIDA: se escribio una credencial literal';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-21 credencial_ref sigue sin admitir texto en claro: ok';
  END;
END
$$;

INSERT INTO public.credenciales_de_equipo
  (copropiedad_id, dispositivo_id, iv, cuerpo, etiqueta, llave_ref,
   creado_por, actualizado_por)
VALUES (:COP, 'd0000000-0000-4000-8000-000000000001',
        decode('000102030405060708090a0b', 'hex'),
        decode('deadbeef', 'hex'),
        decode('000102030405060708090a0b0c0d0e0f', 'hex'),
        'env:NCR_EQUIPOS_LLAVE', :ACTOR, :ACTOR);

DO $$
BEGIN
  -- Una segunda credencial ACTIVA para el mismo equipo es imposible: rotar es
  -- desactivar la anterior, no acumular dos vigentes.
  BEGIN
    INSERT INTO public.credenciales_de_equipo
      (copropiedad_id, dispositivo_id, iv, cuerpo, etiqueta, llave_ref,
       creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001',
            'd0000000-0000-4000-8000-000000000001',
            decode('0102030405060708090a0b0c', 'hex'), decode('cafe', 'hex'),
            decode('0102030405060708090a0b0c0d0e0f10', 'hex'),
            'env:NCR_EQUIPOS_LLAVE',
            '00000000-0000-4000-8000-000000000002',
            '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'A.1 INCUMPLIDA: dos credenciales activas para el mismo equipo';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'A.1 una sola credencial activa por equipo: ok';
  END;

  -- Un IV que no mide 12 bytes no es un sobre AES-GCM: entra como bytes y
  -- saldria como un descifrado imposible mucho despues.
  BEGIN
    INSERT INTO public.credenciales_de_equipo
      (copropiedad_id, dispositivo_id, iv, cuerpo, etiqueta, llave_ref,
       creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001',
            'd0000000-0000-4000-8000-000000000001',
            decode('0102', 'hex'), decode('cafe', 'hex'),
            decode('0102030405060708090a0b0c0d0e0f10', 'hex'),
            'env:NCR_EQUIPOS_LLAVE',
            '00000000-0000-4000-8000-000000000002',
            '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'A.1 INCUMPLIDA: se acepto un IV de longitud invalida';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'A.1 el sobre exige IV de 12 bytes y etiqueta de 16: ok';
  END;

  -- Y la llave sigue siendo una REFERENCIA, nunca la llave.
  BEGIN
    INSERT INTO public.credenciales_de_equipo
      (copropiedad_id, dispositivo_id, iv, cuerpo, etiqueta, llave_ref,
       creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000001',
            'd0000000-0000-4000-8000-000000000001',
            decode('000102030405060708090a0b', 'hex'), decode('cafe', 'hex'),
            decode('000102030405060708090a0b0c0d0e0f', 'hex'),
            'una-llave-de-verdad-y-no-una-referencia',
            '00000000-0000-4000-8000-000000000002',
            '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'RN-21 INCUMPLIDA: llave_ref admitio algo que no es referencia';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'RN-21 llave_ref solo admite env: o vault:: ok';
  END;
END
$$;

-- ── A.1 · NADIE lee el sobre con un token de usuario ─────────────────────────
-- Ni el superadministrador. La consola no necesita el secreto para nada; el
-- unico que lo descifra es el proceso que va a hablar con el equipo.
SET ROLE authenticated;
SET request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.credenciales_de_equipo;
  ASSERT n = 0,
    'A.1 INCUMPLIDA: un token de usuario lee el sobre cifrado del equipo';
  RAISE NOTICE 'A.1 ni el superadministrador lee credenciales_de_equipo: ok';
END
$$;
RESET ROLE;
SET ROLE service_role;
-- Los claims llevan `copropiedad_id` a proposito: `service_role` OMITE la RLS,
-- pero la funcion de borrado es SECURITY DEFINER y dentro de ella manda el
-- dueno de la tabla, que SI esta sujeto a la RLS forzada. Sin la copropiedad en
-- los claims, `app.es_mi_copropiedad` es falso y la vivienda «no existe».
-- Es exactamente lo que le pasara a la API si algun dia deja de ponerlos.
SET request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.credenciales_de_equipo;
  ASSERT n = 1, 'A.1 el camino de servicio SI tiene que poder leerlo';
  RAISE NOTICE 'A.1 el camino de servicio lo lee, y solo el: ok';
END
$$;

-- ── B.2 · borrado definitivo SOLO sin historial ──────────────────────────────
-- La vivienda 42 de la semilla tiene residentes, vehiculos y eventos.
DO $$
BEGIN
  BEGIN
    PERFORM app.borrar_vivienda_definitivamente(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000042',
      '00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'RN-19 INCUMPLIDA: se borro una vivienda CON historial';
  EXCEPTION WHEN restrict_violation THEN
    RAISE NOTICE 'RN-19 una vivienda con historial no se borra: ok';
  END;
END
$$;

-- Y la creada por error hace un minuto, que no tiene nada, si.
INSERT INTO public.viviendas
  (id, copropiedad_id, identificador, agrupacion, creado_por, actualizado_por)
VALUES ('30000000-0000-4000-8000-0000000009ff', :COP, '999', 'Z', :ACTOR, :ACTOR);

DO $$
DECLARE n int; auditadas int;
BEGIN
  SELECT count(*) INTO auditadas FROM public.auditoria_seguridad
   WHERE recurso = 'viviendas/borrado-definitivo';

  PERFORM app.borrar_vivienda_definitivamente(
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-0000000009ff',
    '00000000-0000-4000-8000-000000000002');

  SELECT count(*) INTO n FROM public.viviendas
   WHERE id = '30000000-0000-4000-8000-0000000009ff';
  ASSERT n = 0, 'B.2 la vivienda sin historial deberia haberse borrado';

  SELECT count(*) INTO n FROM public.auditoria_seguridad
   WHERE recurso = 'viviendas/borrado-definitivo';
  ASSERT n = auditadas + 1, 'B.2 el borrado definitivo no dejo rastro';
  RAISE NOTICE 'B.2 sin historial se borra, y queda auditado: ok';
END
$$;

-- El DELETE directo sigue prohibido: la funcion es la unica puerta, y el
-- disparador alcanza tambien al dueno de la tabla.
DO $$
BEGIN
  BEGIN
    DELETE FROM public.viviendas WHERE id = '30000000-0000-4000-8000-000000000042';
    RAISE EXCEPTION 'RN-19 INCUMPLIDA: DELETE directo sobre una vivienda con historial';
  EXCEPTION
    WHEN restrict_violation THEN
      RAISE NOTICE 'RN-19 el DELETE directo con historial sigue prohibido: ok';
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'RN-19 el DELETE directo ni siquiera esta concedido: ok';
  END;
END
$$;

-- ── B.5 · el umbral de confianza ya no es configurable ───────────────────────
DO $$
BEGIN
  BEGIN
    UPDATE public.copropiedades SET umbral_confianza_placa = 0.600
     WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'B.5 INCUMPLIDA: el umbral de confianza se pudo cambiar';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'B.5 el umbral es constante documentada, no ajuste: ok';
  END;
END
$$;

\echo '  70_equipos_y_borrado_de_vivienda: ok'
