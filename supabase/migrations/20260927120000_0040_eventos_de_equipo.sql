-- =============================================================================
-- 0040 · ETAPA 15-L · BLOQUE B · TODO LO QUE UN EQUIPO EMITE, GUARDADO
--
-- Requisito literal del cliente: toda pulsación o interacción con cualquier
-- equipo tiene que aparecer en la consola de eventos. Hasta la 15-L sólo se
-- guardaba lo que era un ACCESO del dominio (`eventos`); lo demás —puerta
-- abierta o forzada, botón de salida, timbre, llamada, sabotaje, equipo en o
-- fuera de línea, rostro no reconocido, el resultado de una verificación
-- remota, un código que nadie catalogó— se descartaba en el receptor.
--
-- Esta tabla guarda todo eso, y también lo que la PLATAFORMA hizo con un
-- equipo (una apertura ordenada y cómo contestó, A1) y lo que la plataforma
-- sabe de él (la cámara que decidió por su cuenta, A4). Un código que el
-- catálogo no conoce se guarda igual, con sus números: «Evento del equipo
-- (código 5/0x4d)». No se pierde nada.
--
-- Solo inserción, con las capas de `eventos` (ADR-005): REVOKE a todos
-- —dueño incluido—, disparadores que bloquean UPDATE y DELETE incluso a quien
-- se reconceda el privilegio, y RLS forzada sin política de UPDATE ni DELETE.
-- La aserción de la 0031 la alcanza por nombre (`eventos%`).
--
-- La clave ajena al equipo lleva la COPROPIEDAD: un evento no puede quedar en
-- un inquilino que no es el del equipo, aunque la aplicación se equivoque (R1).
--
-- Idempotente. Reversión: supabase/reversion/0040_revert.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.eventos_de_equipo (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id     uuid NOT NULL REFERENCES public.copropiedades(id),
  dispositivo_id     uuid NOT NULL,
  -- Tipo normalizado por el catálogo del paquete de proveedores; `desconocido`
  -- cuando el código no está catalogado (y entonces mandan los números).
  tipo               text NOT NULL,
  -- Lo que la consola enseña, en español y sin jerga.
  titulo             text NOT NULL,
  codigo_mayor       integer NULL,
  codigo_menor       integer NULL,
  -- `equipo`: lo emitió el aparato. `plataforma`: lo hizo o lo supo Next Control.
  origen             text NOT NULL,
  -- `false` para lo que el equipo declara HISTÓRICO (el volcado al conectar).
  en_vivo            boolean NOT NULL,
  -- La hora del equipo cuando es utilizable; si no, la de recepción.
  ocurrido_en        timestamptz NOT NULL,
  -- El texto tal como lo escribió el equipo, para la auditoría del reloj.
  hora_del_equipo    text NULL,
  recibido_en        timestamptz NOT NULL DEFAULT now(),
  -- El acceso de `eventos` al que acompaña, si lo hay. Sin clave ajena: una
  -- append-only no puede ser destino de una (0019, ADR-005).
  evento_id          uuid NULL,
  clave_idempotencia text NOT NULL,
  -- Lo que el equipo mandó, SANEADO: sin credenciales, sin imágenes, acotado.
  carga              jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  creado_por         uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT eventos_de_equipo_dispositivo_fk FOREIGN KEY (copropiedad_id, dispositivo_id)
    REFERENCES public.dispositivos(copropiedad_id, id),
  CONSTRAINT eventos_de_equipo_idempotencia UNIQUE (copropiedad_id, clave_idempotencia),
  CONSTRAINT eventos_de_equipo_tipo_formato CHECK (tipo ~ '^[a-z_]{1,60}$'),
  CONSTRAINT eventos_de_equipo_titulo_len CHECK (length(titulo) BETWEEN 1 AND 200),
  CONSTRAINT eventos_de_equipo_titulo_sin_control
    CHECK (titulo !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  CONSTRAINT eventos_de_equipo_origen CHECK (origen IN ('equipo', 'plataforma')),
  CONSTRAINT eventos_de_equipo_hora_len CHECK (hora_del_equipo IS NULL OR length(hora_del_equipo) <= 64),
  CONSTRAINT eventos_de_equipo_clave_len CHECK (length(clave_idempotencia) BETWEEN 8 AND 240),
  CONSTRAINT eventos_de_equipo_carga_objeto CHECK (jsonb_typeof(carga) = 'object'),
  CONSTRAINT eventos_de_equipo_carga_acotada CHECK (pg_column_size(carga) <= 8192)
);

-- Los filtros reales de la consola: por fecha, por equipo, por tipo.
CREATE INDEX IF NOT EXISTS eventos_de_equipo_por_fecha_idx
  ON public.eventos_de_equipo (copropiedad_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS eventos_de_equipo_por_equipo_idx
  ON public.eventos_de_equipo (copropiedad_id, dispositivo_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS eventos_de_equipo_por_tipo_idx
  ON public.eventos_de_equipo (copropiedad_id, tipo, ocurrido_en DESC);

COMMENT ON TABLE public.eventos_de_equipo IS
  'ETAPA 15-L · todo lo que un equipo emite y lo que la plataforma hace con él, también lo que '
  'no es un acceso y lo que nadie catalogó. Solo inserción (ADR-005).';

-- Solo inserción: disparadores ---------------------------------------------------
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.eventos_de_equipo;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.eventos_de_equipo
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();
DROP TRIGGER IF EXISTS tg_prohibir_update ON public.eventos_de_equipo;
CREATE TRIGGER tg_prohibir_update BEFORE UPDATE ON public.eventos_de_equipo
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_update();
ALTER TABLE public.eventos_de_equipo ENABLE ALWAYS TRIGGER tg_prohibir_update;
ALTER TABLE public.eventos_de_equipo ENABLE ALWAYS TRIGGER tg_prohibir_delete;

-- Privilegios: SELECT e INSERT, y nada más, para nadie ---------------------------
GRANT SELECT, INSERT ON public.eventos_de_equipo TO authenticated, service_role;
REVOKE ALL ON public.eventos_de_equipo FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.eventos_de_equipo
  FROM PUBLIC, authenticated, service_role;
DO $$
DECLARE v_dueno text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_mantenimiento') THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON public.eventos_de_equipo FROM app_mantenimiento';
  END IF;
  SELECT pg_get_userbyid(c.relowner) INTO v_dueno
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'eventos_de_equipo';
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.eventos_de_equipo FROM %I', v_dueno);
END
$$;

-- RLS forzada ----------------------------------------------------------------------
ALTER TABLE public.eventos_de_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos_de_equipo FORCE ROW LEVEL SECURITY;

-- Lo mismo que `eventos`: la operación de la copropiedad (administración,
-- portería, operador que la atiende, servicio) la lee y la escribe. El
-- residente NO: un evento de equipo no es de una vivienda.
DROP POLICY IF EXISTS eventos_de_equipo_lectura   ON public.eventos_de_equipo;
DROP POLICY IF EXISTS eventos_de_equipo_insercion ON public.eventos_de_equipo;
CREATE POLICY eventos_de_equipo_lectura ON public.eventos_de_equipo FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id));
CREATE POLICY eventos_de_equipo_insercion ON public.eventos_de_equipo FOR INSERT
  WITH CHECK (app.puede_leer_operacion(copropiedad_id));
