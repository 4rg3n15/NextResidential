-- =============================================================================
-- 0015 · Permisos de tabla e inmutabilidad · ADR-005 · decisión D-20
--
-- Los permisos de tabla son la capa que `service_role` NO elude. Por eso la
-- inmutabilidad de `eventos` se implementa con REVOKE y no con una política RLS.
-- =============================================================================

-- Ningún rol de aplicación puede borrar en NINGUNA tabla de negocio (D-20).
-- Se generaliza a propósito: determinar "dónde hay historial" exige un juicio
-- por tabla que envejece mal —una tabla sin eventos hoy puede tenerlos tras la
-- ETAPA 06—. Un privilegio uniforme se razona una vez y no se erosiona.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated, service_role', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM authenticated, service_role', t);
  END LOOP;
END
$$;

-- El rol de mantenimiento es el único con DDL. No lo usa ningún proceso de
-- aplicación: solo migraciones y trabajos administrativos, y sus operaciones
-- quedan registradas.
GRANT ALL ON SCHEMA public TO app_mantenimiento;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO app_mantenimiento;

-- ===== ADR-005 · RN-03 · CA-23 · KPI-24 =====================================
-- Tablas append-only: solo INSERT. Ni siquiera `service_role` puede modificar
-- o borrar, porque esto no es una politica de fila sino un permiso de tabla.
-- Se aplica al padre y a cada particion existente; las futuras lo reciben en
-- app.crear_particion_eventos (migracion 0012).
-- =============================================================================
DO $$
DECLARE
  t text;
  append_only text[] := ARRAY['eventos','evidencias','auditoria_seguridad'];
  particion text;
BEGIN
  FOREACH t IN ARRAY append_only LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated, service_role, app_mantenimiento', t);
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated, service_role', t);
  END LOOP;

  FOR particion IN
    SELECT c.relname FROM pg_class c
      JOIN pg_inherits i ON i.inhrelid = c.oid
      JOIN pg_class p ON p.oid = i.inhparent
     WHERE p.relname = 'eventos'
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC', particion);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated, service_role, app_mantenimiento', particion);
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated, service_role', particion);
  END LOOP;
END
$$;

-- Vistas: heredan RLS de sus tablas base (security_invoker).
ALTER VIEW public.autorizaciones_vigentes  SET (security_invoker = true);
ALTER VIEW public.dispositivos_operativos  SET (security_invoker = true);
GRANT SELECT ON public.autorizaciones_vigentes TO authenticated, service_role;
GRANT SELECT ON public.dispositivos_operativos TO authenticated, service_role;

-- Secuencias y funciones -------------------------------------------------------
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app  TO authenticated, service_role;

-- Verificación de que RLS quedó activa en el 100 % de las tablas (DoD ETAPA 01).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind IN ('r','p')
     AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);
  IF n > 0 THEN
    RAISE EXCEPTION 'Hay % tablas sin RLS activa y forzada. DoD de la ETAPA 01 incumplido.', n;
  END IF;
END
$$;

-- Verificación de ADR-005: ningún rol, ni siquiera el de mantenimiento, conserva
-- UPDATE o DELETE sobre las tablas append-only. El único actor capaz de
-- modificarlas es un superusuario de PostgreSQL, que en Supabase no está
-- disponible para la aplicación; ese es el riesgo residual documentado.
DO $$
DECLARE n int; detalle text;
BEGIN
  SELECT count(*), coalesce(string_agg(distinct grantee || ':' || table_name, ', '), '')
    INTO n, detalle
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND privilege_type IN ('UPDATE','DELETE')
     AND grantee <> 'postgres'
     AND (table_name LIKE 'eventos%' OR table_name IN ('evidencias','auditoria_seguridad'));
  IF n > 0 THEN
    RAISE EXCEPTION 'ADR-005 incumplido: % concesiones de UPDATE/DELETE sobre tablas append-only (%)', n, detalle;
  END IF;
END
$$;
