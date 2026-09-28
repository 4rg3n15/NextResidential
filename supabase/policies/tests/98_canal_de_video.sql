-- =============================================================================
-- 98 · CANAL DE VIDEO · ETAPA 15-L (C2, D2)
--
-- La base sostiene la FORMA del canal (canal×100+flujo): 102 y 1601 sí; texto,
-- ceros a la izquierda o un número suelto, no. Dentro de una transacción que se
-- DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

-- Con identidad: con la RLS forzada y sin claims, un UPDATE no alcanza ninguna
-- fila y NINGÚN valor fallaría —ni el bueno ni el malo—. Así pasaba hasta la
-- 15-L (H): la prueba daba verde sin haber escrito nada.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000002"}';

DO $$
DECLARE
  bueno text;
  n     integer;
BEGIN
  FOREACH bueno IN ARRAY ARRAY['102', '1601', NULL] LOOP
    UPDATE public.dispositivos SET canal_de_video = bueno
     WHERE id = '90000000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN
      RAISE EXCEPTION 'FALLO: el canal de video % no se escribió (% filas)', coalesce(bueno, 'NULL'), n;
    END IF;
  END LOOP;
END
$$;

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
