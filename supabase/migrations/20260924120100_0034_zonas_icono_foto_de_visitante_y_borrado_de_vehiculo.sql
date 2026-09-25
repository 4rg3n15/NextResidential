-- =============================================================================
-- 0034 · Lo que la consola necesita para completar su CRUD (ETAPA 15-D · O3)
--
--   1 · `zonas.icono` · presentación (ADR-013): el nombre del icono de la
--       tarjeta. Es un dato de pantalla, no del agregado: el dominio no lo lee.
--   2 · `tipo_evidencia` gana `foto_visitante` y `autorizaciones` referencia la
--       evidencia: la fotografía de IDENTIFICACIÓN del visitante. NO es
--       biométrica: no se genera plantilla ni se envía a ninguna terminal; la
--       mira el portero para confrontar (decisión Ley 1581 en el ADR-021 y en
--       el informe de la etapa). Vive en el bucket privado y sale sólo por URL
--       firmada de vida corta (RN-21).
--   3 · Borrado DEFINITIVO de un vehículo, sólo sin historial, con la misma
--       disciplina que el de vivienda (0032): el disparador mira, no supone.
--
-- Idempotente y reversible en el sentido que admite PostgreSQL.
-- =============================================================================

-- ── 1 · icono de la zona ────────────────────────────────────────────────────
ALTER TABLE public.zonas ADD COLUMN IF NOT EXISTS icono text NULL;
ALTER TABLE public.zonas DROP CONSTRAINT IF EXISTS zonas_icono_es_nombre;
ALTER TABLE public.zonas
  ADD CONSTRAINT zonas_icono_es_nombre CHECK (icono IS NULL OR icono ~ '^[a-z0-9-]{1,40}$');
COMMENT ON COLUMN public.zonas.icono IS
  'Nombre del icono de la tarjeta (ADR-013). Presentacion; el dominio no lo lee.';

-- Las zonas también se dan de baja desde la consola: la política de escritura
-- ya lo admitía (administrador). Y se CREAN: la de inserción existe desde 0014.

-- ── 2 · fotografía de identificación del visitante ──────────────────────────
ALTER TYPE public.tipo_evidencia ADD VALUE IF NOT EXISTS 'foto_visitante';

ALTER TABLE public.autorizaciones ADD COLUMN IF NOT EXISTS evidencia_foto_id uuid NULL;

-- SIN clave ajena hacia `evidencias`: es append-only con UPDATE revocado incluso
-- al dueño (ADR-005, 0017), y la comprobación de una FK toma un bloqueo
-- `FOR KEY SHARE` que exige ese privilegio — la fila nunca se podría enlazar.
-- Es el MISMO defecto que 0021 corrigió en `alertas` y en
-- `consentimientos_biometricos`, y el mismo remedio: un disparador que exige
-- que la evidencia exista en ESTA copropiedad. La comprobación general de 0021
-- («ninguna clave ajena apunta a una append-only») sigue siendo cierta.
ALTER TABLE public.autorizaciones DROP CONSTRAINT IF EXISTS autorizaciones_foto_fk;

CREATE OR REPLACE FUNCTION app.tg_autorizacion_foto_existe()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF NEW.evidencia_foto_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.evidencias
     WHERE id = NEW.evidencia_foto_id
       AND copropiedad_id = NEW.copropiedad_id
       AND tipo = 'foto_visitante'
  ) THEN
    RAISE EXCEPTION
      'La autorizacion referencia una fotografia inexistente en esta copropiedad (%)',
      NEW.evidencia_foto_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION app.tg_autorizacion_foto_existe() IS
  'Sustituye a una clave ajena hacia evidencias (append-only, ADR-005): misma '
  'razon y mismo remedio que tg_consentimiento_evidencia_existe (0021).';

DROP TRIGGER IF EXISTS tg_autorizacion_foto_existe ON public.autorizaciones;
CREATE TRIGGER tg_autorizacion_foto_existe
  BEFORE INSERT OR UPDATE OF evidencia_foto_id ON public.autorizaciones
  FOR EACH ROW EXECUTE FUNCTION app.tg_autorizacion_foto_existe();
COMMENT ON COLUMN public.autorizaciones.evidencia_foto_id IS
  'Fotografia de IDENTIFICACION del visitante (tipo foto_visitante). No es dato '
  'biometrico: no genera plantilla ni viaja a ninguna terminal. Bucket privado, '
  'URL firmada de vida corta (RN-21, ADR-021).';

-- ── 3 · borrado definitivo de vehículo, sólo sin historial ──────────────────
-- Con su propio tipo en la auditoría: «¿quién borró este vehículo?» se
-- contesta filtrando por él, no leyendo el recurso de cada fila.
ALTER TYPE public.tipo_evento_seguridad ADD VALUE IF NOT EXISTS 'borrado_definitivo_de_vehiculo';
-- Qué cuenta como historial de un vehículo: un evento con su placa en esta
-- copropiedad, o una autorización con su placa. Un evento basta (RN-03).
CREATE OR REPLACE FUNCTION app.vehiculo_tiene_historial(p_copropiedad_id uuid, p_placa text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.eventos e
                  WHERE e.copropiedad_id = p_copropiedad_id AND e.placa_detectada = p_placa)
      OR EXISTS (SELECT 1 FROM public.autorizaciones a
                  WHERE a.copropiedad_id = p_copropiedad_id AND a.placa = p_placa);
$$;

CREATE OR REPLACE FUNCTION app.tg_vehiculos_prohibir_delete()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, app, pg_temp
AS $$
BEGIN
  IF app.vehiculo_tiene_historial(OLD.copropiedad_id, OLD.placa) THEN
    RAISE EXCEPTION
      'El vehiculo % tiene historial: el borrado fisico esta prohibido. Use la '
      'baja logica (estado = inactivo). RN-19', OLD.placa
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.vehiculos;
DROP TRIGGER IF EXISTS tg_vehiculos_prohibir_delete ON public.vehiculos;
CREATE TRIGGER tg_vehiculos_prohibir_delete BEFORE DELETE ON public.vehiculos
  FOR EACH ROW EXECUTE FUNCTION app.tg_vehiculos_prohibir_delete();

DROP POLICY IF EXISTS vehiculos_borrado ON public.vehiculos;
CREATE POLICY vehiculos_borrado ON public.vehiculos FOR DELETE
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));

-- `authenticated` y `service_role` siguen SIN DELETE sobre `vehiculos` (0015):
-- el borrado pasa por esta función, que corre como el dueño, vuelve a comprobar
-- el alcance y deja el rastro en la MISMA transacción.
CREATE OR REPLACE FUNCTION app.borrar_vehiculo_definitivamente(
  p_copropiedad_id uuid,
  p_vehiculo_id    uuid,
  p_actor          uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_placa text;
BEGIN
  SELECT placa INTO v_placa
    FROM public.vehiculos
   WHERE id = p_vehiculo_id AND copropiedad_id = p_copropiedad_id;

  IF v_placa IS NULL THEN
    RAISE EXCEPTION 'El vehiculo no existe en esta copropiedad'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF app.vehiculo_tiene_historial(p_copropiedad_id, v_placa) THEN
    RAISE EXCEPTION
      'El vehiculo % tiene historial y no puede borrarse definitivamente', v_placa
      USING ERRCODE = 'restrict_violation';
  END IF;

  INSERT INTO public.auditoria_seguridad
    (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo, recurso,
     identificador_solicitado, resultado, creado_por)
  VALUES
    (p_copropiedad_id, p_copropiedad_id, p_actor, 'borrado_definitivo_de_vehiculo',
     'vehiculos/borrado-definitivo', v_placa, 'permitido', p_actor);

  DELETE FROM public.vehiculos
   WHERE id = p_vehiculo_id AND copropiedad_id = p_copropiedad_id;
END
$$;

REVOKE EXECUTE ON FUNCTION app.borrar_vehiculo_definitivamente(uuid, uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION app.borrar_vehiculo_definitivamente(uuid, uuid, uuid)
  TO authenticated, service_role;

-- ── Aserciones de despliegue ────────────────────────────────────────────────
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.vehiculos'::regclass
     AND tgname = 'tg_vehiculos_prohibir_delete' AND tgenabled <> 'D';
  ASSERT n = 1, '0034: vehiculos sin disparador de borrado, o deshabilitado';

  SELECT count(*) INTO n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'tipo_evidencia' AND e.enumlabel = 'foto_visitante';
  ASSERT n = 1, '0034: tipo_evidencia sin foto_visitante';

  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'zonas' AND column_name = 'icono';
  ASSERT n = 1, '0034: zonas sin icono';
END
$$;
