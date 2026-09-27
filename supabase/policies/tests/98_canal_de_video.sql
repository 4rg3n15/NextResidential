-- =============================================================================
-- 98 · CANAL DE VIDEO · ETAPA 15-L (C2, D2)
--
-- La base sostiene la FORMA del canal (canal×100+flujo): 102 y 1601 sí; texto,
-- ceros a la izquierda o un número suelto, no. Dentro de una transacción que se
-- DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

UPDATE public.dispositivos SET canal_de_video = '102'
 WHERE id = '90000000-0000-4000-8000-000000000001';
UPDATE public.dispositivos SET canal_de_video = '1601'
 WHERE id = '90000000-0000-4000-8000-000000000001';
UPDATE public.dispositivos SET canal_de_video = NULL
 WHERE id = '90000000-0000-4000-8000-000000000001';

DO $$
DECLARE
  malo text;
BEGIN
  FOREACH malo IN ARRAY ARRAY['abc', '0102', '7', '102; DROP', '12345'] LOOP
    BEGIN
      UPDATE public.dispositivos SET canal_de_video = malo
       WHERE id = '90000000-0000-4000-8000-000000000001';
      RAISE EXCEPTION 'FALLO: el canal de video % entró', malo;
    EXCEPTION WHEN check_violation THEN
      NULL; -- lo esperado
    END;
  END LOOP;
  RAISE NOTICE 'OK 98 · el canal de video sólo admite canal×100+flujo';
END
$$;

ROLLBACK;
