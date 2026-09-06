-- Reversión de 0012 · particiones de eventos
-- DESTRUCTIVA sobre un registro que RN-03 declara inmutable.
-- Exige confirmación explícita:  psql -v confirmo_borrado_eventos=si -f 0012_revert.sql
\if :{?confirmo_borrado_eventos}
DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT c.relname FROM pg_class c
             JOIN pg_inherits i ON i.inhrelid=c.oid
             JOIN pg_class pa ON pa.oid=i.inhparent
            WHERE pa.relname='eventos'
  LOOP
    -- CASCADE: la clave foranea de `alertas` depende del indice particionado.
    EXECUTE format('DROP TABLE public.%I CASCADE', p);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS app.mantener_particiones_eventos(int, int);
DROP FUNCTION IF EXISTS app.crear_particion_eventos(date);
\else
\echo 'ABORTADO: se requiere -v confirmo_borrado_eventos=si (RN-03, ADR-005)'
\endif
