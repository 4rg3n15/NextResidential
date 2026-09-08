-- Reversión de la migración 0021.
--
-- ADVERTENCIA: restaurar `alertas_evento_fk` deja la tabla `alertas`
-- INUTILIZABLE para cualquier alerta con `evento_id`, porque la comprobación
-- de la clave ajena exige bloquear la fila de `eventos` y ADR-005 revoca a
-- todos los privilegios que ese bloqueo necesita. La restauración se deja aquí
-- por simetría con el resto de guiones, no porque sea una operación deseable.
\set ON_ERROR_STOP on

DROP TRIGGER  IF EXISTS tg_alerta_evento_existe ON public.alertas;
DROP TRIGGER  IF EXISTS tg_consentimiento_evidencia_existe ON public.consentimientos_biometricos;
DROP FUNCTION IF EXISTS app.tg_consentimiento_evidencia_existe();
DROP FUNCTION IF EXISTS app.tg_alerta_evento_existe();

DO $$
BEGIN
  IF current_setting('ncr.confirmo_restaurar_fk_alertas', true) IS DISTINCT FROM 'si' THEN
    RAISE NOTICE 'alertas_evento_fk NO se restaura (ver advertencia del guion). '
                 'Para restaurarla: SET ncr.confirmo_restaurar_fk_alertas = ''si'';';
  ELSE
    ALTER TABLE public.alertas
      ADD CONSTRAINT alertas_evento_fk FOREIGN KEY (evento_id, evento_ocurrido_en)
      REFERENCES public.eventos(id, ocurrido_en);
  END IF;
END
$$;
