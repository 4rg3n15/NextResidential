-- =============================================================================
-- 0012 · Particiones de `eventos` y su mantenimiento
--
-- SIN partición DEFAULT (decisión D-12). Es deliberado y tiene coste: un evento
-- cuya fecha caiga fuera de toda partición FALLA al insertarse en vez de acabar
-- en un cajón de sastre. Se prefiere el fallo ruidoso porque una partición
-- DEFAULT no se puede podar en las consultas, crece sin control y bloquea la
-- creación de particiones que solapen su rango.
--
-- La contrapartida es este mantenimiento: crear particiones POR ADELANTADO.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.crear_particion_eventos(p_mes date)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fin    date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_nombre text := format('eventos_%s', to_char(v_inicio, 'YYYY_MM'));
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = v_nombre) THEN
    RETURN v_nombre || ' (ya existia)';
  END IF;

  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.eventos FOR VALUES FROM (%L) TO (%L)',
    v_nombre, v_inicio, v_fin);

  -- ===== ADR-005 en cada particion ==========================================
  -- Las particiones nuevas NO heredan automaticamente las revocaciones del
  -- padre. Este es el punto exacto donde la garantia de inmutabilidad podria
  -- erosionarse en silencio: por eso el REVOKE se aplica aqui, en la misma
  -- funcion que las crea, y la prueba de la ETAPA 06 debe ejecutarse sobre una
  -- particion RECIEN CREADA y no solo sobre la del mes en curso.
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC', v_nombre);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_nombre);
  EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated, service_role', v_nombre);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated, service_role', v_nombre);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_nombre);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_nombre);

  RETURN v_nombre || ' (creada)';
END
$$;

COMMENT ON FUNCTION app.crear_particion_eventos(date) IS
  'Crea la particion mensual de eventos y le aplica el REVOKE de ADR-005. '
  'Requiere privilegio de DDL: la ejecuta el rol app_mantenimiento desde un '
  'trabajo programado, nunca un rol de aplicacion.';

-- Mantiene una ventana de particiones alrededor del mes actual.
-- Hacia atras, para que la reconciliacion del Edge tras un corte largo tenga
-- donde aterrizar (CU-04); hacia adelante, para que nunca falte la del mes que
-- entra.
CREATE OR REPLACE FUNCTION app.mantener_particiones_eventos(
  p_meses_atras int DEFAULT 6,
  p_meses_adelante int DEFAULT 3)
RETURNS SETOF text
LANGUAGE plpgsql
AS $$
DECLARE
  i int;
BEGIN
  FOR i IN -p_meses_atras .. p_meses_adelante LOOP
    RETURN NEXT app.crear_particion_eventos((date_trunc('month', now()) + (i || ' month')::interval)::date);
  END LOOP;
END
$$;

-- Ventana inicial.
SELECT app.mantener_particiones_eventos(6, 3);
