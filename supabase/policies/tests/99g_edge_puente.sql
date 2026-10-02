-- =============================================================================
-- 99g · EL EDGE COMO PUENTE · RONDA 15-Q2 (migración 0050, ADR-035)
--
-- Positiva y NEGATIVA por cada garantía estructural:
--  · un Edge se marca puente con fecha, y no sin ella (edge_puente_coherente);
--  · DOS puentes activos en la misma copropiedad son imposibles: lo dice un
--    índice único parcial, no el código (ADR-04); uno dado de baja no cuenta;
--  · la credencial de un equipo puede referirse al Edge (`edge:<uuid>`) y
--    guardar una huella HMAC, pero no una huella que no lo sea;
--  · una credencial TRASLADADA al Edge no conserva bytes en la nube (D3), ni
--    puede seguir activa; una NO trasladada los tiene todos.
--
-- Con `service_role`, que OMITE la RLS: lo que se prueba son los CHECK y el
-- índice, que valen para todo rol. Todo dentro de una transacción que se DESHACE.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"rol":"servicio","usuario_id":"00000000-0000-4000-8000-000000000002","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';

DO $$
DECLARE
  c_cop    constant uuid := '10000000-0000-4000-8000-000000000001';
  c_actor  constant uuid := '00000000-0000-4000-8000-000000000002';
  c_edge   constant uuid := 'a0000000-0000-4000-8000-000000000001';
  c_otro   constant uuid := 'a0000000-0000-4000-8000-0000000000f2';
  c_equipo constant uuid := 'd0000000-0000-4000-8000-0000000000f2';
  v_cred   uuid;
BEGIN
  -- 1 · positiva: el Edge de la semilla se marca puente, con su fecha.
  UPDATE public.edge_gateways SET puente = true, puente_desde = now() WHERE id = c_edge;
  IF NOT FOUND THEN RAISE EXCEPTION '0050: no esta el Edge de la semilla'; END IF;

  -- 2 · negativa: puente sin fecha (o fecha sin puente).
  BEGIN
    UPDATE public.edge_gateways SET puente_desde = NULL WHERE id = c_edge;
    RAISE EXCEPTION '0050 INCUMPLIDA: puente sin puente_desde';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '0050 puente con fecha: ok';
  END;

  -- 3 · negativa: un SEGUNDO puente activo en la misma copropiedad (ADR-04).
  INSERT INTO public.edge_gateways (id, copropiedad_id, nombre, usuario_servicio_id,
                                    credencial_ref, creado_por, actualizado_por)
  VALUES (c_otro, c_cop, 'Edge de reemplazo', '00000000-0000-4000-8000-000000000014',
          'vault:mira/edge-02', c_actor, c_actor);
  BEGIN
    UPDATE public.edge_gateways SET puente = true, puente_desde = now() WHERE id = c_otro;
    RAISE EXCEPTION '0050 INCUMPLIDA: dos puentes activos en la misma copropiedad';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE '0050 un puente por copropiedad: ok';
  END;

  -- 4 · positiva: dado de baja el primero, el reemplazo SÍ puede ser puente.
  UPDATE public.edge_gateways
     SET estado = 'inactivo', desactivado_en = now(), puente = false, puente_desde = NULL
   WHERE id = c_edge;
  UPDATE public.edge_gateways SET puente = true, puente_desde = now() WHERE id = c_otro;

  -- 5 · la credencial del equipo vive en el Edge: referencia y huella.
  INSERT INTO public.dispositivos
    (id, copropiedad_id, nombre, tipo, host, puerto, protocolo, usuario,
     credencial_ref, huella_de_credencial, creado_por, actualizado_por)
  VALUES (c_equipo, c_cop, 'Camara por el puente', 'camara_lpr', '198.51.100.20', 80, 'http',
          'servicio_ncr', 'edge:' || c_otro::text, repeat('ab', 32), c_actor, c_actor);
  BEGIN
    UPDATE public.dispositivos SET huella_de_credencial = 'no-es-un-hmac' WHERE id = c_equipo;
    RAISE EXCEPTION '0050 INCUMPLIDA: huella que no es HMAC-SHA256 en hex';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '0050 la huella es un HMAC: ok';
  END;
  BEGIN
    UPDATE public.dispositivos SET credencial_ref = 'edge:no-es-un-uuid' WHERE id = c_equipo;
    RAISE EXCEPTION '0050 INCUMPLIDA: edge: sin identificador de gateway';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '0050 edge:<uuid> y nada mas: ok';
  END;

  -- 6 · una credencial en la nube (sin trasladar) tiene sus tres piezas…
  INSERT INTO public.credenciales_de_equipo
    (copropiedad_id, dispositivo_id, iv, cuerpo, etiqueta, llave_ref, creado_por, actualizado_por)
  VALUES (c_cop, c_equipo, decode('000102030405060708090a0b', 'hex'), decode('deadbeef', 'hex'),
          decode('000102030405060708090a0b0c0d0e0f', 'hex'), 'env:NCR_EQUIPOS_LLAVE',
          c_actor, c_actor)
  RETURNING id INTO v_cred;

  -- 7 · negativa: marcarla trasladada CONSERVANDO los bytes (D3).
  BEGIN
    UPDATE public.credenciales_de_equipo
       SET trasladada_al_edge = c_otro, trasladada_en = now(),
           estado = 'inactivo', desactivado_en = now()
     WHERE id = v_cred;
    RAISE EXCEPTION '0050 INCUMPLIDA: credencial trasladada con bytes en la nube';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '0050 trasladada sin bytes: ok';
  END;

  -- 8 · negativa: trasladada y sin bytes, pero ACTIVA.
  BEGIN
    UPDATE public.credenciales_de_equipo
       SET trasladada_al_edge = c_otro, trasladada_en = now(), iv = NULL, cuerpo = NULL,
           etiqueta = NULL
     WHERE id = v_cred;
    RAISE EXCEPTION '0050 INCUMPLIDA: credencial trasladada que sigue activa';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '0050 trasladada e inactiva: ok';
  END;

  -- 9 · negativa: sin bytes y SIN trasladar (un sobre vacío no es una credencial).
  BEGIN
    UPDATE public.credenciales_de_equipo SET iv = NULL, cuerpo = NULL, etiqueta = NULL
     WHERE id = v_cred;
    RAISE EXCEPTION '0050 INCUMPLIDA: credencial vacia sin traslado';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '0050 un sobre vacio no entra: ok';
  END;

  -- 10 · positiva: el traslado completo — sin bytes, inactiva, con el Edge y la fecha.
  UPDATE public.credenciales_de_equipo
     SET trasladada_al_edge = c_otro, trasladada_en = now(), iv = NULL, cuerpo = NULL,
         etiqueta = NULL, estado = 'inactivo', desactivado_en = now()
   WHERE id = v_cred;
  IF EXISTS (SELECT 1 FROM public.credenciales_de_equipo
              WHERE id = v_cred AND (iv IS NOT NULL OR cuerpo IS NOT NULL OR etiqueta IS NOT NULL)) THEN
    RAISE EXCEPTION '0050 INCUMPLIDA: quedaron bytes tras el traslado';
  END IF;
  RAISE NOTICE '0050 el traslado deja la fila y se lleva los bytes: ok';
END
$$;

ROLLBACK;
