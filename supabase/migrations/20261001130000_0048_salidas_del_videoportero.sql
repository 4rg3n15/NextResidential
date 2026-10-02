-- =============================================================================
-- 0048 · ETAPA 15-P · P3 · LAS SALIDAS DEL VIDEOPORTERO, EN PUNTOS DE ACCESO
--
-- `puntos_de_acceso` existe desde la 0009 como entidad interna del agregado
-- Dispositivo ("un relé puede comandar dos puntos"), y nadie la llenaba. Desde
-- la 15-P el videoportero DECLARA sus salidas (cerraduras, unidad de puerta
-- segura) y la consola las persiste aquí, una fila por puerta que se puede
-- abrir, con un nombre que el administrador edita. La guardia elige el punto y
-- la orden manual queda atada a él.
--
--  · `zona_id` deja de ser obligatorio: una salida descubierta no trae zona, y
--    exigirla sería inventarla. La clave ajena compuesta sigue igual (con
--    `zona_id` nulo, MATCH SIMPLE no la comprueba).
--  · `numero_de_puerta`, `modulo` y `ruta_en_el_equipo` dicen QUÉ abre el
--    equipo y dónde está en su árbol (equipo → módulo → salida, R3).
--  · `origen` separa lo declarado por el equipo de lo dado de alta a mano.
--  · Una salida activa por puerta y equipo: índice único parcial (ADR-04).
--  · Sin borrado físico desde ahora: las órdenes la referencian (RN-19).
--  · El superadministrador también escribe aquí, como en `dispositivos`: es
--    el mismo agregado.
--
-- Idempotente. Reversión: supabase/reversion/0048_revert.sql.
-- =============================================================================

ALTER TABLE public.puntos_de_acceso ALTER COLUMN zona_id DROP NOT NULL;

ALTER TABLE public.puntos_de_acceso
  ADD COLUMN IF NOT EXISTS numero_de_puerta  integer     NULL,
  ADD COLUMN IF NOT EXISTS modulo            text        NULL,
  ADD COLUMN IF NOT EXISTS ruta_en_el_equipo text        NULL,
  ADD COLUMN IF NOT EXISTS origen            text        NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS descubierto_en    timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'puntos_origen_valido') THEN
    ALTER TABLE public.puntos_de_acceso ADD CONSTRAINT puntos_origen_valido
      CHECK (origen IN ('manual', 'descubierto'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'puntos_numero_de_puerta_valido') THEN
    -- 16 es el tope que el lector del árbol admite (PUERTAS_MAXIMAS).
    ALTER TABLE public.puntos_de_acceso ADD CONSTRAINT puntos_numero_de_puerta_valido
      CHECK (numero_de_puerta IS NULL OR numero_de_puerta BETWEEN 1 AND 16);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'puntos_descubierto_coherente') THEN
    -- Lo descubierto dice qué puerta abre y cuándo se leyó: sin eso no es descubierto.
    ALTER TABLE public.puntos_de_acceso ADD CONSTRAINT puntos_descubierto_coherente
      CHECK (origen <> 'descubierto'
             OR (numero_de_puerta IS NOT NULL AND descubierto_en IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'puntos_textos_acotados') THEN
    ALTER TABLE public.puntos_de_acceso ADD CONSTRAINT puntos_textos_acotados
      CHECK (length(nombre) BETWEEN 1 AND 120
             AND (modulo IS NULL OR length(modulo) <= 120)
             AND (ruta_en_el_equipo IS NULL OR length(ruta_en_el_equipo) <= 200));
  END IF;
END $$;

COMMENT ON COLUMN public.puntos_de_acceso.numero_de_puerta IS
  'Puerta con que el equipo abre este punto (orden open). 15-P, migracion 0048.';
COMMENT ON COLUMN public.puntos_de_acceso.origen IS
  'descubierto: lo declaro el equipo; manual: alta de la consola. 15-P, migracion 0048.';

CREATE UNIQUE INDEX IF NOT EXISTS puntos_salida_activa_uk
  ON public.puntos_de_acceso (copropiedad_id, dispositivo_id, numero_de_puerta)
  WHERE estado = 'activo' AND numero_de_puerta IS NOT NULL;
CREATE INDEX IF NOT EXISTS puntos_por_dispositivo_idx
  ON public.puntos_de_acceso (copropiedad_id, dispositivo_id)
  WHERE estado = 'activo';

-- Sin borrado físico (RN-19): la segunda barrera, además de no conceder DELETE.
REVOKE DELETE, TRUNCATE ON public.puntos_de_acceso FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.puntos_de_acceso;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.puntos_de_acceso
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();

-- El superadministrador administra el mismo agregado que en `dispositivos`.
DROP POLICY IF EXISTS puntos_de_acceso_insercion ON public.puntos_de_acceso;
DROP POLICY IF EXISTS puntos_de_acceso_edicion   ON public.puntos_de_acceso;
CREATE POLICY puntos_de_acceso_insercion ON public.puntos_de_acceso FOR INSERT
  WITH CHECK (app.es_superadmin() OR app.puede_administrar(copropiedad_id));
CREATE POLICY puntos_de_acceso_edicion ON public.puntos_de_acceso FOR UPDATE
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id))
  WITH CHECK (app.es_superadmin() OR app.puede_administrar(copropiedad_id));

-- La orden manual, atada al punto que se abrió y a la puerta que se mandó.
ALTER TABLE public.ordenes_manuales
  ADD COLUMN IF NOT EXISTS punto_de_acceso_id uuid    NULL,
  ADD COLUMN IF NOT EXISTS numero_de_puerta   integer NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_manuales_punto_fk') THEN
    ALTER TABLE public.ordenes_manuales ADD CONSTRAINT ordenes_manuales_punto_fk
      FOREIGN KEY (copropiedad_id, punto_de_acceso_id)
      REFERENCES public.puntos_de_acceso (copropiedad_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_manuales_punto_coherente') THEN
    ALTER TABLE public.ordenes_manuales ADD CONSTRAINT ordenes_manuales_punto_coherente
      CHECK ((punto_de_acceso_id IS NULL) = (numero_de_puerta IS NULL));
  END IF;
END $$;
COMMENT ON COLUMN public.ordenes_manuales.punto_de_acceso_id IS
  'Punto de acceso elegido por la guardia; NULL = la puerta de la ficha del equipo. 0048.';
