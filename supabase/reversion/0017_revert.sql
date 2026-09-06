-- Reversión de 0017 · inmutabilidad frente al dueño
--
-- ADVERTENCIA: en un entorno vivo esto REABRE el hueco que 0017 cerró. El rol
-- `postgres` —el de la cadena de conexión de Supabase— vuelve a poder modificar
-- eventos. Solo para desmontar el esquema completo.
--
-- No revierte el REVOKE al dueño: devolverle UPDATE y DELETE sobre las tablas
-- append-only sería una regresión de seguridad, no una reversión de esquema.
-- El dueño puede reconcedérselos a mano si de verdad los necesita.

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
       AND (c.relname LIKE 'eventos%'
            OR c.relname IN ('evidencias','auditoria_seguridad','purgas_retencion'))
  LOOP
    -- Solo en las tablas raíz: en una partición, soltar un trigger clonado falla
    -- con «trigger ... requires it» porque depende del trigger del padre.
    IF NOT EXISTS (SELECT 1 FROM pg_inherits i JOIN pg_class c2 ON c2.oid = i.inhrelid
                    WHERE c2.relname = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tg_prohibir_update ON public.%I', t);
    END IF;
  END LOOP;
END
$$;

DROP FUNCTION IF EXISTS app.tg_prohibir_update();

-- El rol de aplicación se retira solo si no dejó objetos ni privilegios colgando.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES    IN SCHEMA public, pgboss FROM app_api';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA pgboss FROM app_api';
    EXECUTE 'REVOKE ALL ON SCHEMA public, app, pgboss FROM app_api';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE app_mantenimiento IN SCHEMA pgboss REVOKE ALL ON TABLES FROM app_api';
    EXECUTE 'REVOKE authenticated FROM app_api';
    EXECUTE 'DROP ROLE app_api';
  END IF;
END
$$;
