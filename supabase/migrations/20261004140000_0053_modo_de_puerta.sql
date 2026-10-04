-- ============================================================================
-- 0053 · Ronda 15-R, bloque C · PUERTA LIBRE Y BLOQUEADA, CON REVERSIÓN (P-25)
--
-- Dejar una puerta del videoportero o de la terminal LIBRE (`alwaysOpen`) o
-- BLOQUEADA (`alwaysClose`) es estado que queda, y deja al conjunto sin
-- control de acceso o sin acceso. Por eso:
--
--   · sólo administrador y superadministrador lo ordenan, con motivo (la API);
--   · toda orden caduca: `revierte_en` es obligatorio para libre y bloqueada,
--     y un barrido persistido (pg-boss) la devuelve a su modo normal;
--   · cada orden y cada reversión es una FILA de `ordenes_de_modo_de_puerta`:
--     el registro es el rastro de auditoría. No se borra ni se reescribe; sólo
--     se anota UNA vez el resultado que dio el equipo (la fila se escribe
--     ANTES de accionar, para que la orden exista aunque la API caiga).
--
-- `ajustes_de_puertas` guarda, por copropiedad, la duración máxima de una
-- orden: 120 min por omisión, entre 15 y 720 (12 h, el tope de plataforma
-- [SUPUESTO] S-15R-04). Lo cambia quien administra la copropiedad.
-- ============================================================================
\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS public.ordenes_de_modo_de_puerta (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- El ORDEN de las órdenes es el de inserción, no el del reloj: dos órdenes
  -- en el mismo milisegundo («libre» y «revertir ahora») no empatan.
  secuencia        bigint GENERATED ALWAYS AS IDENTITY,
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  -- Sin FK a `dispositivos`, como `bloqueos_de_acceso` (0051): el registro
  -- puede ir por el Edge, y la orden se conserva aunque el equipo se retire.
  dispositivo_id   uuid NOT NULL,
  numero_de_puerta integer NOT NULL,
  modo             text NOT NULL,
  origen           text NOT NULL,
  motivo           text NOT NULL,
  operador_id      uuid NOT NULL REFERENCES public.usuarios(id),
  rol              text NOT NULL,
  ordenada_en      timestamptz NOT NULL,
  revierte_en      timestamptz NULL,
  resultado        text NULL,
  detalle          text NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),
  CONSTRAINT ordenes_modo_puerta_numero CHECK (numero_de_puerta BETWEEN 1 AND 64),
  CONSTRAINT ordenes_modo_puerta_modo CHECK (modo IN ('libre', 'bloqueada', 'normal')),
  CONSTRAINT ordenes_modo_puerta_origen
    CHECK (origen IN ('consola', 'revertir_ahora', 'reversion_automatica')),
  CONSTRAINT ordenes_modo_puerta_motivo CHECK (length(motivo) BETWEEN 1 AND 300),
  CONSTRAINT ordenes_modo_puerta_rol CHECK (rol IN ('administrador', 'superadministrador', 'servicio')),
  CONSTRAINT ordenes_modo_puerta_resultado
    CHECK (resultado IS NULL OR resultado IN ('aceptada', 'rechazada', 'inalcanzable')),
  CONSTRAINT ordenes_modo_puerta_detalle CHECK (detalle IS NULL OR length(detalle) <= 500),
  -- Libre o bloqueada SIEMPRE caduca; normal nunca.
  CONSTRAINT ordenes_modo_puerta_caduca CHECK ((modo = 'normal') = (revierte_en IS NULL)),
  CONSTRAINT ordenes_modo_puerta_plazo CHECK (revierte_en IS NULL OR revierte_en > ordenada_en),
  CONSTRAINT ordenes_modo_puerta_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE INDEX IF NOT EXISTS ordenes_modo_puerta_por_puerta_idx
  ON public.ordenes_de_modo_de_puerta (copropiedad_id, dispositivo_id, numero_de_puerta, secuencia DESC);

CREATE TABLE IF NOT EXISTS public.ajustes_de_puertas (
  copropiedad_id          uuid PRIMARY KEY REFERENCES public.copropiedades(id),
  duracion_maxima_minutos integer NOT NULL DEFAULT 120,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  creado_por              uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  actualizado_por         uuid NOT NULL REFERENCES public.usuarios(id),
  CONSTRAINT ajustes_puertas_duracion CHECK (duracion_maxima_minutos BETWEEN 15 AND 720)
);

-- La orden se anota UNA vez (su resultado) y no se reescribe nunca.
CREATE OR REPLACE FUNCTION app.tg_orden_de_modo_solo_resultado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.resultado IS NOT NULL THEN
    RAISE EXCEPTION 'la orden % ya tiene resultado: no se reescribe', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.secuencia, NEW.copropiedad_id, NEW.dispositivo_id, NEW.numero_de_puerta, NEW.modo,
      NEW.origen, NEW.motivo, NEW.operador_id, NEW.rol, NEW.ordenada_en, NEW.revierte_en,
      NEW.creado_en, NEW.creado_por)
     IS DISTINCT FROM
     (OLD.id, OLD.secuencia, OLD.copropiedad_id, OLD.dispositivo_id, OLD.numero_de_puerta, OLD.modo,
      OLD.origen, OLD.motivo, OLD.operador_id, OLD.rol, OLD.ordenada_en, OLD.revierte_en,
      OLD.creado_en, OLD.creado_por) THEN
    RAISE EXCEPTION 'de una orden de modo de puerta sólo se anota el resultado'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_orden_de_modo_solo_resultado ON public.ordenes_de_modo_de_puerta;
CREATE TRIGGER tg_orden_de_modo_solo_resultado
  BEFORE UPDATE ON public.ordenes_de_modo_de_puerta
  FOR EACH ROW EXECUTE FUNCTION app.tg_orden_de_modo_solo_resultado();

DROP TRIGGER IF EXISTS tg_auditoria ON public.ordenes_de_modo_de_puerta;
CREATE TRIGGER tg_auditoria
  BEFORE INSERT OR UPDATE ON public.ordenes_de_modo_de_puerta
  FOR EACH ROW EXECUTE FUNCTION app.tg_auditoria();
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.ordenes_de_modo_de_puerta;
CREATE TRIGGER tg_prohibir_delete
  BEFORE DELETE ON public.ordenes_de_modo_de_puerta
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();

DROP TRIGGER IF EXISTS tg_auditoria ON public.ajustes_de_puertas;
CREATE TRIGGER tg_auditoria
  BEFORE INSERT OR UPDATE ON public.ajustes_de_puertas
  FOR EACH ROW EXECUTE FUNCTION app.tg_auditoria();
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.ajustes_de_puertas;
CREATE TRIGGER tg_prohibir_delete
  BEFORE DELETE ON public.ajustes_de_puertas
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();

ALTER TABLE public.ordenes_de_modo_de_puerta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_de_modo_de_puerta FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ajustes_de_puertas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajustes_de_puertas FORCE ROW LEVEL SECURITY;

-- Leen la operación y el servicio; escribe SÓLO el servicio de la copropiedad
-- (la API, que ya validó rol, motivo y duración).
DROP POLICY IF EXISTS ordenes_modo_puerta_lectura ON public.ordenes_de_modo_de_puerta;
CREATE POLICY ordenes_modo_puerta_lectura ON public.ordenes_de_modo_de_puerta
  FOR SELECT USING (app.puede_leer_operacion(copropiedad_id) OR app.es_servicio(copropiedad_id));
DROP POLICY IF EXISTS ordenes_modo_puerta_insercion ON public.ordenes_de_modo_de_puerta;
CREATE POLICY ordenes_modo_puerta_insercion ON public.ordenes_de_modo_de_puerta
  FOR INSERT WITH CHECK (app.es_servicio(copropiedad_id));
DROP POLICY IF EXISTS ordenes_modo_puerta_resultado ON public.ordenes_de_modo_de_puerta;
CREATE POLICY ordenes_modo_puerta_resultado ON public.ordenes_de_modo_de_puerta
  FOR UPDATE USING (app.es_servicio(copropiedad_id)) WITH CHECK (app.es_servicio(copropiedad_id));

DROP POLICY IF EXISTS ajustes_puertas_lectura ON public.ajustes_de_puertas;
CREATE POLICY ajustes_puertas_lectura ON public.ajustes_de_puertas
  FOR SELECT USING (app.puede_leer_operacion(copropiedad_id) OR app.es_servicio(copropiedad_id));
DROP POLICY IF EXISTS ajustes_puertas_escritura ON public.ajustes_de_puertas;
CREATE POLICY ajustes_puertas_escritura ON public.ajustes_de_puertas
  FOR INSERT WITH CHECK (app.puede_administrar(copropiedad_id) OR app.es_servicio(copropiedad_id));
DROP POLICY IF EXISTS ajustes_puertas_edicion ON public.ajustes_de_puertas;
CREATE POLICY ajustes_puertas_edicion ON public.ajustes_de_puertas
  FOR UPDATE USING (app.puede_administrar(copropiedad_id) OR app.es_servicio(copropiedad_id))
  WITH CHECK (app.puede_administrar(copropiedad_id) OR app.es_servicio(copropiedad_id));

REVOKE ALL ON public.ordenes_de_modo_de_puerta FROM PUBLIC, anon;
REVOKE ALL ON public.ajustes_de_puertas FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.ordenes_de_modo_de_puerta TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.ajustes_de_puertas TO authenticated, service_role;
REVOKE DELETE, TRUNCATE ON public.ordenes_de_modo_de_puerta FROM authenticated, service_role;
REVOKE DELETE, TRUNCATE ON public.ajustes_de_puertas FROM authenticated, service_role;

COMMENT ON TABLE public.ordenes_de_modo_de_puerta IS
  'P-25 (15-R) · cada orden de dejar una puerta libre, bloqueada o normal, y cada '
  'reversión. Es el rastro de auditoría: no se borra ni se reescribe; sólo se anota '
  'UNA vez el resultado del equipo.';
COMMENT ON TABLE public.ajustes_de_puertas IS
  'P-25 (15-R) · la duración máxima de una puerta libre o bloqueada, por copropiedad.';

-- ----------------------------------------------------------------------------
-- Aserciones de despliegue
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  faltan text[] := ARRAY[]::text[];
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ordenes_de_modo_de_puerta', 'ajustes_de_puertas'] LOOP
    IF NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      faltan := faltan || ('RLS forzada en ' || t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass
                    AND tgname = 'tg_prohibir_delete' AND tgenabled <> 'D') THEN
      faltan := faltan || ('tg_prohibir_delete en ' || t);
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.ordenes_de_modo_de_puerta'::regclass
                    AND tgname = 'tg_orden_de_modo_solo_resultado' AND tgenabled <> 'D') THEN
    faltan := faltan || 'tg_orden_de_modo_solo_resultado'::text;
  END IF;
  IF array_length(faltan, 1) IS NOT NULL THEN
    RAISE EXCEPTION '0053 incompleta: %', array_to_string(faltan, ', ');
  END IF;
END $$;
