-- Reversión de la migración 0039 (ETAPA 15-K · atestación del instalador, D-11).
--
-- ADVERTENCIA: elimina las atestaciones, que son de solo inserción y firman una
-- prueba física. Exige respaldo verificado y autorización escrita, y el guion
-- la exige con una variable de confirmación, igual que la 0011 y la 0038. Sin
-- atestaciones, toda cámara cuyo veredicto no sea conforme vuelve a no operarse.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('ncr.confirmo_revertir_0039', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'Reversión de 0039 NO confirmada. Para continuar: SET ncr.confirmo_revertir_0039 = ''si'';';
  END IF;
END
$$;

DROP TABLE IF EXISTS public.atestaciones_de_equipo;
