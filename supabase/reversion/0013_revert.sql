-- Reversión de 0013 · disparadores
DO $$
DECLARE t record;
BEGIN
  -- Solo tablas raíz: un disparador sobre una partición no puede eliminarse por
  -- separado, depende del de su tabla padre.
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relkind IN ('r','p')
              AND NOT EXISTS (SELECT 1 FROM pg_inherits i WHERE i.inhrelid = c.oid)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_auditoria ON public.%I', t.relname);
    EXECUTE format('DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.%I', t.relname);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS tg_usuario_tenant          ON public.usuarios;
DROP TRIGGER IF EXISTS tg_residente_nivel         ON public.residentes;
DROP TRIGGER IF EXISTS tg_autorizacion_coherente  ON public.autorizaciones;
DROP TRIGGER IF EXISTS tg_recurrente_con_patron   ON public.autorizaciones;
DROP TRIGGER IF EXISTS tg_plantilla_consentimiento ON public.plantillas_biometricas;
DROP TRIGGER IF EXISTS tg_version_reglas          ON public.versiones_de_reglas;

DROP FUNCTION IF EXISTS app.tg_usuario_tenant();
DROP FUNCTION IF EXISTS app.tg_residente_nivel_por_defecto();
DROP FUNCTION IF EXISTS app.tg_autorizacion_coherente();
DROP FUNCTION IF EXISTS app.tg_recurrente_con_patron();
DROP FUNCTION IF EXISTS app.tg_plantilla_exige_consentimiento();
DROP FUNCTION IF EXISTS app.tg_version_reglas_monotona();
