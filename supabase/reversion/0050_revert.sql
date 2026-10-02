-- Reversión de la migración 0050 (RONDA 15-Q2 · el Edge como puente).
--
-- Volver al modo DIRECTO no exige revertir el esquema: se quita la marca de
-- puente y se vuelve a escribir la clave de cada equipo desde la consola
-- (DESPLIEGUE_EDGE.md §10.6). Con eso la credencial vuelve a la nube y su
-- referencia, a la bóveda; la 0050 aplicada y sin puentes se comporta como
-- antes (R1).
--
-- Este guion revierte el ESQUEMA, y se NIEGA a seguir en dos casos, con su
-- motivo:
--  1. queda algún `credencial_ref` `edge:`: ese equipo NO tiene credencial en
--     la nube, y revertir lo dejaría sin credencial en ningún lado;
--  2. hubo algún traslado, aunque ya se haya deshecho: la fila trasladada se
--     conserva SIN bytes como historial (RN-19 prohíbe borrarla), y restaurar
--     los NOT NULL exigiría borrarla o inventar bytes. En ese caso el esquema se
--     queda en la 0050: es el precio de no tener la credencial en la nube.
--
-- El valor `tunel_edge_rechazado` del enumerado NO se retira: PostgreSQL no
-- quita valores de un tipo, y las filas de auditoría que lo usan se conservan.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.dispositivos WHERE credencial_ref LIKE 'edge:%') THEN
    RAISE EXCEPTION
      '0050_revert: hay credenciales en un Edge. Vuelva a escribirlas desde la consola primero.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.credenciales_de_equipo WHERE trasladada_en IS NOT NULL) THEN
    RAISE EXCEPTION
      '0050_revert: hubo traslados al Edge; su historial sin bytes no se borra (RN-19). '
      'El esquema se queda en la 0050: sin puentes, el comportamiento ya es el directo.';
  END IF;
END
$$;

ALTER TABLE public.credenciales_de_equipo DROP CONSTRAINT IF EXISTS credenciales_equipo_traslado;
ALTER TABLE public.credenciales_de_equipo DROP COLUMN IF EXISTS trasladada_en;
ALTER TABLE public.credenciales_de_equipo DROP COLUMN IF EXISTS trasladada_al_edge;
ALTER TABLE public.credenciales_de_equipo ALTER COLUMN iv SET NOT NULL;
ALTER TABLE public.credenciales_de_equipo ALTER COLUMN cuerpo SET NOT NULL;
ALTER TABLE public.credenciales_de_equipo ALTER COLUMN etiqueta SET NOT NULL;

ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_huella_es_hmac;
ALTER TABLE public.dispositivos DROP COLUMN IF EXISTS huella_de_credencial;
ALTER TABLE public.dispositivos DROP CONSTRAINT IF EXISTS dispositivos_credencial_es_referencia;
ALTER TABLE public.dispositivos ADD CONSTRAINT dispositivos_credencial_es_referencia
  CHECK (credencial_ref ~ '^(env|vault):[A-Za-z0-9_./-]+$');

DROP INDEX IF EXISTS public.edge_un_puente_por_copropiedad;
ALTER TABLE public.edge_gateways DROP CONSTRAINT IF EXISTS edge_puente_coherente;
ALTER TABLE public.edge_gateways DROP COLUMN IF EXISTS puente_desde;
ALTER TABLE public.edge_gateways DROP COLUMN IF EXISTS puente;
