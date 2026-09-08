-- Reversión de la migración 0019 · libro de recepción de eventos.
--
-- Destructiva sobre un libro append-only: borra el registro de qué claves de
-- idempotencia se recibieron. Tras revertirla, un reintento del Edge o del
-- Alarm Server que ya se había descartado volvería a insertarse como evento
-- nuevo (RN-17, CA-22). Exige respaldo verificado.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('ncr.confirmo_borrado_recepciones', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION
      'Reversión abortada. Ejecuta antes: SET ncr.confirmo_borrado_recepciones = ''si'';';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS tg_prohibir_update ON public.recepciones_evento;
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.recepciones_evento;
DROP POLICY  IF EXISTS recepciones_lectura   ON public.recepciones_evento;
DROP POLICY  IF EXISTS recepciones_insercion ON public.recepciones_evento;
DROP INDEX   IF EXISTS public.recepciones_recientes_idx;
DROP TABLE   IF EXISTS public.recepciones_evento;
