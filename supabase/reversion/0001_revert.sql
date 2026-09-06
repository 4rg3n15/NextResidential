-- Reversión de 0001 · esquemas y roles
-- Las extensiones NO se eliminan: pueden estar en uso por otros esquemas.
DROP SCHEMA IF EXISTS pgboss CASCADE;
DROP SCHEMA IF EXISTS app    CASCADE;
-- Los roles no se eliminan automaticamente: en Supabase son de la plataforma.
