-- Reversión de 0015 · permisos e inmutabilidad
-- Devuelve los permisos al estado anterior a ADR-005. Solo para desmontar el
-- esquema completo: en un entorno vivo, esto abre la puerta a modificar eventos.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated, service_role, app_mantenimiento', t);
  END LOOP;
END $$;
