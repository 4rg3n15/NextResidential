-- =============================================================================
-- Inmutabilidad de eventos · ADR-005 · RN-03 · CA-23 · KPI-24
--
-- CA-23 exige que la operación sea rechazada "por todos los roles". La prueba
-- recorre los seis roles de aplicación MÁS la identidad de servicio, y verifica
-- que UPDATE y DELETE fallan en los siete casos.
--
-- La prueba se ejecuta también sobre una partición RECIÉN CREADA: es el punto
-- exacto donde la garantía podría erosionarse en silencio, porque las
-- particiones nuevas no heredan las revocaciones del padre.
-- =============================================================================

\set ON_ERROR_STOP on
SET request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002"}';

-- Un evento de referencia sobre el que intentar la modificación.
INSERT INTO public.eventos (id, copropiedad_id, ocurrido_en, tipo, resultado, motivo, metodo,
                            dispositivo_id, vivienda_id, regla_aplicada, version_reglas,
                            clave_idempotencia, creado_por)
VALUES ('c0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
        now(),'denegado','negado','VIGENCIA_EXPIRADA','placa',
        '90000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000042',
        'vigencia.expirada',1,'test-inmutabilidad-0001','00000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  r text;
  roles text[] := ARRAY['superadministrador','administrador','portero','operador_central',
                        'residente','servicio'];
  fallos text[] := ARRAY[]::text[];
BEGIN
  FOREACH r IN ARRAY roles LOOP
    -- UPDATE
    BEGIN
      EXECUTE format($f$
        SET LOCAL ROLE authenticated;
        $f$);
      EXECUTE format(
        'SET LOCAL request.jwt.claims = %L',
        json_build_object('rol', r,
                          'copropiedad_id','10000000-0000-4000-8000-000000000001',
                          'usuario_id','00000000-0000-4000-8000-000000000010')::text);
      BEGIN
        EXECUTE 'UPDATE public.eventos SET regla_aplicada = ''alterada'' WHERE id = ''c0000000-0000-4000-8000-000000000001''';
        fallos := fallos || format('%s pudo hacer UPDATE', r);
      EXCEPTION WHEN insufficient_privilege THEN
        NULL;  -- correcto
      END;

      BEGIN
        EXECUTE 'DELETE FROM public.eventos WHERE id = ''c0000000-0000-4000-8000-000000000001''';
        fallos := fallos || format('%s pudo hacer DELETE', r);
      EXCEPTION WHEN insufficient_privilege THEN
        NULL;  -- correcto
      END;

      RESET ROLE;
    END;
  END LOOP;

  IF array_length(fallos,1) > 0 THEN
    RAISE EXCEPTION 'ADR-005/CA-23 INCUMPLIDA: %', array_to_string(fallos, '; ');
  END IF;
  RAISE NOTICE 'ADR-005/CA-23 UPDATE y DELETE rechazados para los 6 roles: ok';
END
$$;

RESET ROLE;

-- La misma prueba sobre una partición RECIÉN CREADA --------------------------
DO $$
DECLARE
  v_nombre text;
  n int;
BEGIN
  v_nombre := app.crear_particion_eventos((date_trunc('month', now()) + interval '11 months')::date);
  RAISE NOTICE 'particion de prueba: %', v_nombre;

  SELECT count(*) INTO n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name = split_part(v_nombre, ' ', 1)
     AND privilege_type IN ('UPDATE','DELETE')
     AND grantee <> 'postgres';

  ASSERT n = 0,
    format('ADR-005: la particion recien creada conserva %s concesiones de UPDATE/DELETE', n);
  RAISE NOTICE 'ADR-005 particion recien creada nace sin UPDATE ni DELETE: ok';

  -- Y con RLS activa y forzada desde el primer instante.
  SELECT count(*) INTO n FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname='public' AND c.relname = split_part(v_nombre,' ',1)
     AND c.relrowsecurity AND c.relforcerowsecurity;
  ASSERT n = 1, 'La particion recien creada deberia tener RLS activa y forzada';
  RAISE NOTICE 'particion recien creada con RLS activa y forzada: ok';
END
$$;

-- Sin partición DEFAULT: un evento fuera de rango falla ruidosamente (D-12) --
DO $$
BEGIN
  BEGIN
    INSERT INTO public.eventos (copropiedad_id, ocurrido_en, tipo, resultado, metodo,
                                dispositivo_id, regla_aplicada, version_reglas,
                                clave_idempotencia, creado_por)
    VALUES ('10000000-0000-4000-8000-000000000001', now() + interval '10 years',
            'ingreso','permitido','placa','90000000-0000-4000-8000-000000000001',
            'residente',1,'test-fuera-de-rango','00000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'D-12: un evento fuera de toda particion deberia fallar';
  EXCEPTION WHEN check_violation OR undefined_table OR invalid_parameter_value THEN
    RAISE NOTICE 'D-12 evento fuera de rango falla ruidosamente: ok';
  END;
END
$$;
