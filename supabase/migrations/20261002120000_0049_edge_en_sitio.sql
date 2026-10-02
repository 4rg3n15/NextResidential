-- =============================================================================
-- 0049 · RONDA 15-Q · Q1 · LA INSTANTÁNEA DE REGLAS QUE EL EDGE DESCARGA
--
-- `versiones_de_reglas` existe desde la 0010 con un número consecutivo y un
-- hash «para que el Edge VERIFIQUE que su caché corresponde exactamente a una
-- versión publicada». Nadie la escribía: la ruta que sirve la instantánea no
-- existía (S-24). Desde la 15-Q la API publica una versión cada vez que el
-- contenido de las reglas de una copropiedad cambia y un Edge la pide, y lo
-- hace con la identidad de SERVICIO de esa copropiedad (la del Edge
-- acreditado), no con la de un administrador. Tres cosas lo hacían imposible
-- bajo RLS forzada, y esta migración las resuelve sin abrir nada más:
--
--  1. La inserción en `versiones_de_reglas` sólo la admitía el administrador.
--     Se añade una política para el servicio de ESA copropiedad (RN-15).
--  2. El disparador de versión consecutiva leía `copropiedades` con
--     `FOR UPDATE`, que bajo RLS exige pasar la política de UPDATE; para el
--     servicio la fila no aparecía, el número esperado era NULL y la
--     comprobación se saltaba en silencio. Ahora el número se toma de la
--     propia tabla, con un candado por copropiedad, y la consecutividad se
--     comprueba siempre.
--  3. El mismo disparador mueve `copropiedades.version_reglas_actual`. Para el
--     servicio se admite ESE cambio y ningún otro: una política de UPDATE de
--     su copropiedad y un disparador que rechaza cualquier otra columna. Así la
--     consola sigue enseñando la versión vigente sin que el servicio pueda
--     tocar la configuración de la copropiedad.
--
-- Idempotente. Reversión: supabase/reversion/0049_revert.sql.
-- =============================================================================

-- 1 · El servicio publica versiones de SU copropiedad --------------------------
DROP POLICY IF EXISTS versiones_de_reglas_insercion_servicio ON public.versiones_de_reglas;
CREATE POLICY versiones_de_reglas_insercion_servicio ON public.versiones_de_reglas FOR INSERT
  WITH CHECK (app.es_servicio(copropiedad_id));

-- 2 · Consecutiva por la propia tabla, con candado por copropiedad ------------
CREATE OR REPLACE FUNCTION app.tg_version_reglas_monotona()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_actual bigint;
BEGIN
  -- Dos publicaciones simultáneas de la misma copropiedad se serializan aquí;
  -- el índice único (copropiedad_id, numero) es la segunda barrera (ADR-04).
  PERFORM pg_advisory_xact_lock(
    hashtextextended('versiones_de_reglas:' || NEW.copropiedad_id::text, 0));

  SELECT coalesce(max(v.numero), 0) INTO v_actual
    FROM public.versiones_de_reglas v
   WHERE v.copropiedad_id = NEW.copropiedad_id;

  IF NEW.numero <> v_actual + 1 THEN
    RAISE EXCEPTION
      'La version de reglas debe ser consecutiva: se esperaba %, llego %. RN-16',
      v_actual + 1, NEW.numero
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.copropiedades
     SET version_reglas_actual = NEW.numero
   WHERE id = NEW.copropiedad_id
     AND version_reglas_actual < NEW.numero;

  RETURN NEW;
END
$$;

-- 3 · El servicio mueve la versión de su copropiedad, y nada más -------------
DROP POLICY IF EXISTS copropiedades_version_por_servicio ON public.copropiedades;
CREATE POLICY copropiedades_version_por_servicio ON public.copropiedades FOR UPDATE
  USING (app.es_servicio(id))
  WITH CHECK (app.es_servicio(id));

CREATE OR REPLACE FUNCTION app.tg_copropiedad_servicio_solo_version()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  -- Lo que el disparador de auditoría reescribe en cada UPDATE no cuenta.
  v_ignoradas text[] := ARRAY['version_reglas_actual', 'actualizado_en', 'actualizado_por'];
BEGIN
  -- Acompaña a la política de arriba y aplica donde ella aplica: a quien está
  -- SUJETO a la RLS. La llave secreta (`service_role`, BYPASSRLS) la omite por
  -- diseño (§2.7.6) y su contención es la de la capa de aplicación.
  IF app.rol() = 'servicio'
     AND NOT (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user)
  THEN
    IF (to_jsonb(NEW) - v_ignoradas) IS DISTINCT FROM (to_jsonb(OLD) - v_ignoradas) THEN
      RAISE EXCEPTION
        'La identidad de servicio solo puede mover version_reglas_actual (15-Q, 0049)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.version_reglas_actual < OLD.version_reglas_actual THEN
      RAISE EXCEPTION 'La version de reglas no retrocede. RN-16'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_copropiedad_servicio_solo_version ON public.copropiedades;
CREATE TRIGGER tg_copropiedad_servicio_solo_version
  BEFORE UPDATE ON public.copropiedades
  FOR EACH ROW EXECUTE FUNCTION app.tg_copropiedad_servicio_solo_version();

COMMENT ON POLICY versiones_de_reglas_insercion_servicio ON public.versiones_de_reglas IS
  '15-Q (0049) · la API publica la instantanea del Edge con la identidad de servicio de la copropiedad.';
COMMENT ON POLICY copropiedades_version_por_servicio ON public.copropiedades IS
  '15-Q (0049) · solo version_reglas_actual; lo demas lo rechaza tg_copropiedad_servicio_solo_version.';
