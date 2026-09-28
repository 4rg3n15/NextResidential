-- Reversión de la migración 0040 (ETAPA 15-L · eventos de equipo).
--
-- ADVERTENCIA: elimina los eventos de equipo, que son de solo inserción y son
-- la única constancia de lo que los equipos emitieron y de las aperturas que
-- ordenó la plataforma. Exige respaldo verificado y autorización escrita, y el
-- guion la exige con una variable de confirmación, igual que la 0039.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('ncr.confirmo_revertir_0040', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'Reversión de 0040 NO confirmada. Para continuar: SET ncr.confirmo_revertir_0040 = ''si'';';
  END IF;
END
$$;

DROP TABLE IF EXISTS public.eventos_de_equipo;
