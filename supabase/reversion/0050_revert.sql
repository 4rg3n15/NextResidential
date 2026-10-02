-- Reversión de la migración 0050 (RONDA 15-Q2 · el Edge como puente).
--
-- ANTES de revertir el esquema hay que revertir el DATO: cada credencial que
-- se trasladó a un Edge ya no está en la nube (es el objeto de la 15-Q2) y la
-- base no puede inventarla. El procedimiento está en DESPLIEGUE_EDGE.md
-- («Volver al modo directo»): quitar la marca de puente y volver a escribir la
-- credencial de cada equipo desde la consola. Este guion se NIEGA a seguir
-- mientras quede una sola fila trasladada o un `credencial_ref` `edge:`, porque
-- restaurar los NOT NULL fallaría a medias o, peor, dejaría equipos sin
-- credencial en ningún lado.
--
-- El valor `tunel_edge_rechazado` del enumerado NO se retira: PostgreSQL no
-- quita valores de un tipo, y las filas de auditoría que lo usan se conservan.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.credenciales_de_equipo WHERE trasladada_en IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.dispositivos WHERE credencial_ref LIKE 'edge:%') THEN
    RAISE EXCEPTION
      '0050_revert: hay credenciales en un Edge. Vuelva a escribirlas desde la consola primero.';
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
