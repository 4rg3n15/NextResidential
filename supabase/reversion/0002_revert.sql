-- Reversión de 0002 · tipos enumerados
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT ty.typname FROM pg_type ty JOIN pg_namespace n ON n.oid=ty.typnamespace
            WHERE n.nspname='public' AND ty.typtype='e'
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', t.typname);
  END LOOP;
END $$;
