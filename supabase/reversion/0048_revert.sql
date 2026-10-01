-- Reversión de la migración 0048 (ETAPA 15-P · salidas del videoportero).
--
-- Pierde la atadura de cada orden manual al punto que abrió (la orden sigue)
-- y los nombres que el administrador dio a las salidas. Exige respaldo previo.
-- Falla si quedó algún punto sin zona: una salida descubierta no la tiene, y
-- la 0009 la exigía. Desactívelos o asígneles zona antes de revertir.
\set ON_ERROR_STOP on

ALTER TABLE public.ordenes_manuales DROP CONSTRAINT IF EXISTS ordenes_manuales_punto_coherente;
ALTER TABLE public.ordenes_manuales DROP CONSTRAINT IF EXISTS ordenes_manuales_punto_fk;
ALTER TABLE public.ordenes_manuales DROP COLUMN IF EXISTS numero_de_puerta;
ALTER TABLE public.ordenes_manuales DROP COLUMN IF EXISTS punto_de_acceso_id;

DROP POLICY IF EXISTS puntos_de_acceso_insercion ON public.puntos_de_acceso;
DROP POLICY IF EXISTS puntos_de_acceso_edicion   ON public.puntos_de_acceso;
CREATE POLICY puntos_de_acceso_insercion ON public.puntos_de_acceso FOR INSERT
  WITH CHECK (app.puede_administrar(copropiedad_id));
CREATE POLICY puntos_de_acceso_edicion ON public.puntos_de_acceso FOR UPDATE
  USING (app.puede_administrar(copropiedad_id))
  WITH CHECK (app.puede_administrar(copropiedad_id));

DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.puntos_de_acceso;
DROP INDEX IF EXISTS public.puntos_por_dispositivo_idx;
DROP INDEX IF EXISTS public.puntos_salida_activa_uk;
ALTER TABLE public.puntos_de_acceso DROP CONSTRAINT IF EXISTS puntos_textos_acotados;
ALTER TABLE public.puntos_de_acceso DROP CONSTRAINT IF EXISTS puntos_descubierto_coherente;
ALTER TABLE public.puntos_de_acceso DROP CONSTRAINT IF EXISTS puntos_numero_de_puerta_valido;
ALTER TABLE public.puntos_de_acceso DROP CONSTRAINT IF EXISTS puntos_origen_valido;
ALTER TABLE public.puntos_de_acceso
  DROP COLUMN IF EXISTS descubierto_en,
  DROP COLUMN IF EXISTS origen,
  DROP COLUMN IF EXISTS ruta_en_el_equipo,
  DROP COLUMN IF EXISTS modulo,
  DROP COLUMN IF EXISTS numero_de_puerta;
ALTER TABLE public.puntos_de_acceso ALTER COLUMN zona_id SET NOT NULL;
