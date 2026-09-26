-- =============================================================================
-- 0039 · ETAPA 15-K · D-11 · ATESTACIÓN DEL INSTALADOR SOBRE UNA CÁMARA
--
-- En sitio, el 26/09/2026, la cámara leía `barrierGateOper = 0` («sin
-- operación» según la guía) en sus cuatro políticas y, sin embargo, con «Paso
-- automático» encendido abría sola. La API no puede afirmar que una cámara no
-- decide: el veredicto la rechaza y el sistema no la opera (H-SITIO-01).
--
-- La salida es la verificación FÍSICA del instalador (decisión del cliente
-- D-11): pasa un vehículo con una placa de la lista blanca del equipo y otro
-- con una placa desconocida, y ninguno de los dos abre. El superadministrador
-- lo registra aquí. Con una atestación VIGENTE el proveedor opera la cámara, y
-- la consola la pinta en ÁMBAR, nunca en verde: la API sigue sin confirmarlo.
--
-- Vigente = la atestación MÁS RECIENTE del equipo es del MISMO firmware que el
-- equipo tiene. No se actualiza ni se borra nada: un firmware nuevo la deja sin
-- efecto por comparación, y el proveedor lo comprueba en vivo contra el
-- aparato antes de operar.
--
-- Solo inserción, con las tres capas de `eventos` (ADR-005): REVOKE a todos
-- —dueño incluido—, disparadores que bloquean UPDATE y DELETE incluso a quien
-- se reconceda el privilegio, y RLS forzada sin política de UPDATE ni DELETE.
--
-- Idempotente. Reversión: supabase/reversion/0039_revert.sql.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.atestaciones_de_equipo (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id        uuid NOT NULL REFERENCES public.copropiedades(id),
  dispositivo_id        uuid NOT NULL,
  -- El firmware que el equipo DECLARABA al atestar. Otro firmware, otra prueba.
  firmware              text NOT NULL,
  -- Placas normalizadas por el objeto de valor `Placa` antes de llegar aquí.
  placa_en_lista_blanca text NOT NULL,
  placa_desconocida     text NOT NULL,
  -- Lo que se atesta. Una prueba en la que alguna abrió no es una atestación:
  -- es un hallazgo, y no se registra aquí.
  ninguna_abrio         boolean NOT NULL,
  -- Lo que el instalador vio, en sus palabras: hora, carril, quién condujo.
  evidencia             text NOT NULL,
  registrada_en         timestamptz NOT NULL DEFAULT now(),
  creado_en             timestamptz NOT NULL DEFAULT now(),
  creado_por            uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT atestacion_dispositivo_fk FOREIGN KEY (copropiedad_id, dispositivo_id)
    REFERENCES public.dispositivos(copropiedad_id, id),
  CONSTRAINT atestacion_ninguna_abrio CHECK (ninguna_abrio),
  CONSTRAINT atestacion_placas_distintas CHECK (placa_en_lista_blanca <> placa_desconocida),
  CONSTRAINT atestacion_placas_formato CHECK (
    placa_en_lista_blanca ~ '^[A-Z0-9]{4,10}$' AND placa_desconocida ~ '^[A-Z0-9]{4,10}$'),
  CONSTRAINT atestacion_firmware_len CHECK (length(firmware) BETWEEN 1 AND 100),
  CONSTRAINT atestacion_evidencia_len CHECK (length(evidencia) BETWEEN 20 AND 2000),
  CONSTRAINT atestacion_evidencia_sin_control CHECK (evidencia !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]')
);

CREATE INDEX IF NOT EXISTS atestaciones_por_equipo_idx
  ON public.atestaciones_de_equipo (copropiedad_id, dispositivo_id, registrada_en DESC);

COMMENT ON TABLE public.atestaciones_de_equipo IS
  'ETAPA 15-K · D-11 · verificación física del instalador: una placa de lista blanca y una '
  'desconocida, ninguna abrió. Vigente sólo la más reciente y sólo con el MISMO firmware. '
  'Solo inserción (ADR-005).';

-- Solo inserción: disparadores ---------------------------------------------------
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.atestaciones_de_equipo;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.atestaciones_de_equipo
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();
DROP TRIGGER IF EXISTS tg_prohibir_update ON public.atestaciones_de_equipo;
CREATE TRIGGER tg_prohibir_update BEFORE UPDATE ON public.atestaciones_de_equipo
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_update();
ALTER TABLE public.atestaciones_de_equipo ENABLE ALWAYS TRIGGER tg_prohibir_update;
ALTER TABLE public.atestaciones_de_equipo ENABLE ALWAYS TRIGGER tg_prohibir_delete;

-- Privilegios: SELECT e INSERT, y nada más, para nadie ---------------------------
GRANT SELECT, INSERT ON public.atestaciones_de_equipo TO authenticated, service_role;
REVOKE ALL ON public.atestaciones_de_equipo FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.atestaciones_de_equipo
  FROM PUBLIC, authenticated, service_role;
DO $$
DECLARE v_dueno text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_mantenimiento') THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON public.atestaciones_de_equipo FROM app_mantenimiento';
  END IF;
  SELECT pg_get_userbyid(c.relowner) INTO v_dueno
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'atestaciones_de_equipo';
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.atestaciones_de_equipo FROM %I', v_dueno);
END
$$;

-- RLS forzada ----------------------------------------------------------------------
ALTER TABLE public.atestaciones_de_equipo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atestaciones_de_equipo FORCE ROW LEVEL SECURITY;

-- Lectura: la administración de la copropiedad (la consola la enseña en la
-- fila del equipo) y el servicio (el registro del proveedor la consulta).
DROP POLICY IF EXISTS atestaciones_lectura   ON public.atestaciones_de_equipo;
DROP POLICY IF EXISTS atestaciones_insercion ON public.atestaciones_de_equipo;
CREATE POLICY atestaciones_lectura ON public.atestaciones_de_equipo FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));
-- Escritura: SÓLO el superadministrador (D-11). Ni el administrador del
-- conjunto ni el servicio: atestar es firmar una prueba física.
CREATE POLICY atestaciones_insercion ON public.atestaciones_de_equipo FOR INSERT
  WITH CHECK (app.es_superadmin());
