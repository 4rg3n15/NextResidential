-- =============================================================================
-- 0001 · Extensiones, roles y esquemas
-- Next Control Residencial · ETAPA 01-B
--
-- Idempotente: puede ejecutarse varias veces sin efecto adicional.
-- Reversión: supabase/reversion/0001_revert.sql
-- =============================================================================

-- Extensiones -----------------------------------------------------------------
-- pgcrypto: gen_random_uuid() para las claves primarias (ver modelo-datos.md §4)
-- citext:   correos comparables sin distinguir mayúsculas
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Esquemas --------------------------------------------------------------------
-- app     : funciones de contexto (claims), disparadores y utilidades del dominio
-- pgboss  : colas y trabajos programados (CLAUDE.md §2.6) — sin RLS, ver §8.5
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS pgboss;

COMMENT ON SCHEMA app IS
  'Funciones de contexto de sesión, disparadores y utilidades. No contiene datos de negocio.';
COMMENT ON SCHEMA pgboss IS
  'Cola pg-boss. Sin RLS por diseño: el copropiedad_id viaja en la carga util del trabajo '
  'y el manejador lo valida en la capa de aplicacion (modelo-datos.md §8.5).';

-- Roles -----------------------------------------------------------------------
-- Se replican los roles que Supabase crea de fábrica, para que estas migraciones
-- corran igual en una base PostgreSQL vacía y en un proyecto Supabase.
--   anon           : peticiones sin autenticar
--   authenticated  : peticiones con JWT de usuario — sujeto a RLS
--   service_role   : identidad de servicio — OMITE RLS (modelo-datos.md §8.4)
--   app_mantenimiento : DDL, particiones y correcciones. Ningún proceso de
--                       aplicación lo usa. Sus operaciones se registran.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','app_mantenimiento'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END
$$;

GRANT USAGE ON SCHEMA app    TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA pgboss TO service_role;

-- Ningún rol de aplicación puede crear objetos en public.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
