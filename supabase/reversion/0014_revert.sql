-- Reversión de 0014 · políticas RLS
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;

  FOR p IN SELECT c.relname AS tablename FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', p.tablename);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', p.tablename);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS app.puede_leer_operacion(uuid);
DROP FUNCTION IF EXISTS app.puede_administrar(uuid);
DROP FUNCTION IF EXISTS app.puede_leer_residente(uuid, uuid);
DROP FUNCTION IF EXISTS app.es_servicio(uuid);
DROP FUNCTION IF EXISTS app.puede_gestionar_lista_negra(uuid);
