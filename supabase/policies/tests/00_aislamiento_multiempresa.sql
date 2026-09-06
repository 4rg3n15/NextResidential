-- =============================================================================
-- Suite de aislamiento multiempresa · RN-15 · CA-24 · KPI-36 · CP-11
--
-- Prueba POSITIVA y NEGATIVA por política, según exige CLAUDE.md §6.
-- Se ejecuta como el rol `authenticated`, no como superusuario: un superusuario
-- omite RLS y la suite no probaria nada.
--
-- Esta suite cubre el PRIMER camino (JWT de usuario). El segundo camino
-- —service_role, que OMITE RLS— se cubre en la ETAPA 03, en la capa de
-- aplicación. Aquí se deja constancia de que la base, por sí sola, no basta.
-- =============================================================================

\set ON_ERROR_STOP on
\set MIRA    '10000000-0000-4000-8000-000000000001'
\set ROBLE   '10000000-0000-4000-8000-000000000002'
\set ADMIN_MIRA  '00000000-0000-4000-8000-000000000010'
\set ADMIN_ROBLE '00000000-0000-4000-8000-000000000020'

SET ROLE authenticated;

-- ---------------------------------------------------------------------------
-- Prueba positiva: el administrador de Mira ve lo suyo.
-- ---------------------------------------------------------------------------
SET request.jwt.claims = '{"rol":"administrador","copropiedad_id":"10000000-0000-4000-8000-000000000001","usuario_id":"00000000-0000-4000-8000-000000000010"}';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.viviendas;
  ASSERT n >= 4, format('POSITIVA viviendas: el administrador de Mira deberia ver sus viviendas, vio %s', n);

  SELECT count(*) INTO n FROM public.vehiculos;
  ASSERT n >= 3, format('POSITIVA vehiculos: se esperaban >= 3, se vieron %s', n);

  SELECT count(*) INTO n FROM public.autorizaciones;
  ASSERT n >= 3, format('POSITIVA autorizaciones: se esperaban >= 3, se vieron %s', n);

  SELECT count(*) INTO n FROM public.listas_negras;
  ASSERT n >= 2, format('POSITIVA listas_negras: se esperaban >= 2, se vieron %s', n);

  RAISE NOTICE 'positivas del administrador de Mira: ok';
END
$$;

-- ---------------------------------------------------------------------------
-- Prueba NEGATIVA, tabla por tabla: el administrador de Mira NO ve nada de El
-- Roble. Cero filas ajenas visibles en TODA tabla operativa con copropiedad_id.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  n int;
  fugas text[] := ARRAY[]::text[];
  tablas text[] := ARRAY[
    'personas','viviendas','niveles_acceso','residentes','vehiculos','visitantes',
    'listas_negras','autorizaciones','patrones_recurrencia','autorizacion_acompanantes',
    'autorizaciones_zona','zonas','zona_horarios','zona_aforo',
    'consentimientos_biometricos','plantillas_biometricas','plantilla_sincronizaciones',
    'dispositivos','puntos_de_acceso','edge_gateways','versiones_de_reglas','reglas',
    'eventos','evidencias','alertas','bandeja_salida_edge'];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE copropiedad_id = %L',
                   t, '10000000-0000-4000-8000-000000000002') INTO n;
    IF n > 0 THEN
      fugas := fugas || format('%s(%s filas)', t, n);
    END IF;
  END LOOP;

  IF array_length(fugas, 1) > 0 THEN
    RAISE EXCEPTION 'FUGA MULTIEMPRESA (RN-15, KPI-36): %', array_to_string(fugas, ', ');
  END IF;
  RAISE NOTICE 'negativas de aislamiento en % tablas: ok', array_length(tablas,1);
END
$$;

-- usuarios y auditoria_seguridad tienen columnas distintas: se prueban aparte.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.usuarios
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
  ASSERT n = 0, format('FUGA en usuarios: el administrador de Mira vio %s usuarios de El Roble', n);

  -- D-02: las filas de plataforma (copropiedad_id NULL) solo las ve un superadmin.
  SELECT count(*) INTO n FROM public.usuarios WHERE copropiedad_id IS NULL;
  ASSERT n = 0, format('FUGA en usuarios de plataforma (D-02): se vieron %s filas', n);

  RAISE NOTICE 'negativas de usuarios: ok';
END
$$;

-- ---------------------------------------------------------------------------
-- Prueba negativa de ESCRITURA: no se puede escribir en otra copropiedad.
-- CA-24 exige rechazo, no filtrado silencioso.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.viviendas (copropiedad_id, identificador, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000002','Lote intruso',
            '00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'FUGA DE ESCRITURA: se inserto una vivienda en otra copropiedad (RN-15)';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'negativa de escritura cruzada: ok (rechazada por RLS)';
  END;
END
$$;

-- ---------------------------------------------------------------------------
-- Operador de central: KPI-35. Atiende DOS copropiedades sin fuga entre ellas.
-- ---------------------------------------------------------------------------
SET request.jwt.claims = '{"rol":"operador_central","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002"],"usuario_id":"00000000-0000-4000-8000-000000000012"}';

DO $$
DECLARE n_mira int; n_roble int;
BEGIN
  SELECT count(*) INTO n_mira  FROM public.viviendas WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO n_roble FROM public.viviendas WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
  ASSERT n_mira  > 0, 'KPI-35: el operador deberia ver Mira';
  ASSERT n_roble > 0, 'KPI-35: el operador deberia ver El Roble';
  RAISE NOTICE 'operador multiproyecto (KPI-35): ve ambas, ok';
END
$$;

-- Y una tercera copropiedad inexistente en sus claims seguiria oculta:
-- se verifica que el alcance viene del claim, no del rol.
SET request.jwt.claims = '{"rol":"operador_central","copropiedad_id":"10000000-0000-4000-8000-000000000001","copropiedades":["10000000-0000-4000-8000-000000000001"],"usuario_id":"00000000-0000-4000-8000-000000000012"}';
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.viviendas WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
  ASSERT n = 0, format('FUGA: el operador sin El Roble en sus claims vio %s viviendas', n);
  RAISE NOTICE 'alcance del operador derivado del claim: ok';
END
$$;

-- ---------------------------------------------------------------------------
-- Residente: solo SU vivienda (RN-05, predicado V).
-- ---------------------------------------------------------------------------
SET request.jwt.claims = '{"rol":"residente","copropiedad_id":"10000000-0000-4000-8000-000000000001","usuario_id":"00000000-0000-4000-8000-000000000013","persona_id":"40000000-0000-4000-8000-000000000013"}';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.viviendas;
  ASSERT n = 1, format('El residente deberia ver exactamente 1 vivienda (la suya), vio %s', n);

  SELECT count(*) INTO n FROM public.vehiculos;
  ASSERT n = 1, format('El residente deberia ver solo los vehiculos de su vivienda, vio %s', n);

  SELECT count(*) INTO n FROM public.autorizaciones
   WHERE vivienda_id <> '30000000-0000-4000-8000-000000000042';
  ASSERT n = 0, format('FUGA: el residente vio %s autorizaciones de otra vivienda (RN-05)', n);

  -- El residente NO ve dispositivos: ni host ni credencial (C-11, RN-21).
  SELECT count(*) INTO n FROM public.dispositivos;
  ASSERT n = 0, format('FUGA: el residente vio %s dispositivos (RN-21)', n);

  RAISE NOTICE 'alcance del residente (RN-05, RN-21): ok';
END
$$;

RESET ROLE;
