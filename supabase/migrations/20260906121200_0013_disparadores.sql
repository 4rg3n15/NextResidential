-- =============================================================================
-- 0013 · Disparadores
-- Invariantes de NIVEL 2: las que cruzan tablas y no pueden expresarse como
-- restricción declarativa (modelo-datos.md §1 y §10).
-- =============================================================================

-- 1 · Auditoría (KPI-05) y prohibición de borrado (RN-19) ----------------------
DO $$
DECLARE
  t text;
  tablas_auditadas text[] := ARRAY[
    'copropiedades','usuarios','roles_usuario','personas','viviendas','niveles_acceso',
    'residentes','vehiculos','visitantes','listas_negras','autorizaciones',
    'patrones_recurrencia','autorizacion_acompanantes','autorizaciones_zona',
    'zonas','zona_horarios','consentimientos_biometricos','plantillas_biometricas',
    'plantilla_sincronizaciones','dispositivos','puntos_de_acceso','edge_gateways',
    'versiones_de_reglas','reglas','alertas','bandeja_salida_edge'];
  -- Tablas con historial: el borrado fisico se prohibe ademas por disparador.
  -- La primera barrera es no conceder DELETE a ningun rol (decision D-20).
  tablas_sin_borrado text[] := ARRAY[
    'copropiedades','usuarios','personas','viviendas','residentes','vehiculos',
    'visitantes','autorizaciones','zonas','dispositivos','edge_gateways',
    'consentimientos_biometricos','plantillas_biometricas','listas_negras',
    'versiones_de_reglas','reglas','eventos','evidencias','auditoria_seguridad',
    'alertas','bandeja_salida_edge'];
BEGIN
  FOREACH t IN ARRAY tablas_auditadas LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_auditoria ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER tg_auditoria BEFORE INSERT OR UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION app.tg_auditoria()', t);
  END LOOP;

  FOREACH t IN ARRAY tablas_sin_borrado LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete()', t);
  END LOOP;
END
$$;

-- 2 · usuarios: copropiedad_id NULL solo para el superadministrador -----------
-- Única excepción a "copropiedad_id NOT NULL" (decisión D-02).
CREATE OR REPLACE FUNCTION app.tg_usuario_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.copropiedad_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.roles_usuario r
       WHERE r.usuario_id = NEW.id
         AND r.rol        = 'superadministrador'
         AND r.estado     = 'activo')
    THEN
      RAISE EXCEPTION
        'Solo el superadministrador puede tener copropiedad_id nulo (usuario %). D-02', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

-- Se evalúa al final de la sentencia para permitir el orden natural
-- (crear usuario, luego asignarle el rol) dentro de una misma transacción.
DROP TRIGGER IF EXISTS tg_usuario_tenant ON public.usuarios;
CREATE CONSTRAINT TRIGGER tg_usuario_tenant
  AFTER INSERT OR UPDATE ON public.usuarios
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.tg_usuario_tenant();

-- 3 · residentes: nivel de acceso por defecto = el más restrictivo (P-11) -----
CREATE OR REPLACE FUNCTION app.tg_residente_nivel_por_defecto()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nivel_acceso_id IS NULL THEN
    SELECT n.id INTO NEW.nivel_acceso_id
      FROM public.niveles_acceso n
     WHERE n.copropiedad_id = NEW.copropiedad_id
       AND n.estado = 'activo'
     ORDER BY n.orden ASC
     LIMIT 1;
    IF NEW.nivel_acceso_id IS NULL THEN
      RAISE EXCEPTION
        'La copropiedad % no tiene niveles de acceso configurados. P-11', NEW.copropiedad_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_residente_nivel ON public.residentes;
CREATE TRIGGER tg_residente_nivel BEFORE INSERT ON public.residentes
  FOR EACH ROW EXECUTE FUNCTION app.tg_residente_nivel_por_defecto();

-- 4 · autorizaciones: RN-05 y RN-13 -------------------------------------------
CREATE OR REPLACE FUNCTION app.tg_autorizacion_coherente()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_vivienda_del_residente uuid;
  v_es_titular boolean;
  v_estado_vivienda estado_registro;
BEGIN
  -- RN-05: el residente solo autoriza hacia SU propia vivienda, y debe ser titular.
  SELECT r.vivienda_id, r.es_titular
    INTO v_vivienda_del_residente, v_es_titular
    FROM public.residentes r
   WHERE r.id = NEW.autorizado_por AND r.estado = 'activo';

  IF v_vivienda_del_residente IS NULL THEN
    RAISE EXCEPTION 'El residente que autoriza no existe o esta inactivo. RN-05'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_vivienda_del_residente <> NEW.vivienda_id THEN
    RAISE EXCEPTION
      'Un residente solo puede autorizar visitantes hacia su propia vivienda. RN-05'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_es_titular THEN
    RAISE EXCEPTION
      'Solo un residente titular puede crear autorizaciones. RN-05, P-11'
      USING ERRCODE = 'check_violation';
  END IF;

  -- RN-13: una vivienda inactiva no genera autorizaciones NUEVAS; las vigentes
  -- se conservan hasta su vencimiento, por eso solo se comprueba en INSERT.
  IF TG_OP = 'INSERT' THEN
    SELECT v.estado INTO v_estado_vivienda
      FROM public.viviendas v WHERE v.id = NEW.vivienda_id;
    IF v_estado_vivienda = 'inactivo' THEN
      RAISE EXCEPTION
        'Una vivienda inactiva no genera autorizaciones nuevas. RN-13'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_autorizacion_coherente ON public.autorizaciones;
CREATE TRIGGER tg_autorizacion_coherente BEFORE INSERT OR UPDATE ON public.autorizaciones
  FOR EACH ROW EXECUTE FUNCTION app.tg_autorizacion_coherente();

-- 5 · autorizaciones recurrentes exigen patrón (HU-08) ------------------------
CREATE OR REPLACE FUNCTION app.tg_recurrente_con_patron()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tipo = 'recurrente'
     AND NOT EXISTS (SELECT 1 FROM public.patrones_recurrencia p
                      WHERE p.autorizacion_id = NEW.id)
  THEN
    RAISE EXCEPTION
      'Una autorizacion recurrente exige al menos una franja en patrones_recurrencia. HU-08, RN-22'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_recurrente_con_patron ON public.autorizaciones;
CREATE CONSTRAINT TRIGGER tg_recurrente_con_patron
  AFTER INSERT OR UPDATE ON public.autorizaciones
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app.tg_recurrente_con_patron();

-- 6 · RN-09 nivel 2: sin consentimiento vigente no hay sincronización ---------
-- Nivel 1 es la clave foránea NOT NULL a consentimientos_biometricos (D-09).
-- Este es el segundo cerrojo: bloquea la TRANSICIÓN a estado sincronizable.
CREATE OR REPLACE FUNCTION app.tg_plantilla_exige_consentimiento()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_estado estado_consentimiento;
BEGIN
  IF NEW.estado IN ('pendiente_sincronizacion','activa') THEN
    SELECT c.estado INTO v_estado
      FROM public.consentimientos_biometricos c
     WHERE c.id = NEW.consentimiento_id;

    IF v_estado IS DISTINCT FROM 'vigente' THEN
      RAISE EXCEPTION
        'Sin consentimiento vigente del titular no hay sincronizacion de plantilla '
        '(consentimiento en estado %). RN-09, RN-10, CA-09', COALESCE(v_estado::text,'inexistente')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_plantilla_consentimiento ON public.plantillas_biometricas;
CREATE TRIGGER tg_plantilla_consentimiento BEFORE INSERT OR UPDATE ON public.plantillas_biometricas
  FOR EACH ROW EXECUTE FUNCTION app.tg_plantilla_exige_consentimiento();

-- 7 · versiones de reglas monótonas (hueco H-07) ------------------------------
CREATE OR REPLACE FUNCTION app.tg_version_reglas_monotona()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_actual bigint;
BEGIN
  SELECT c.version_reglas_actual INTO v_actual
    FROM public.copropiedades c WHERE c.id = NEW.copropiedad_id FOR UPDATE;

  IF NEW.numero <> v_actual + 1 THEN
    RAISE EXCEPTION
      'La version de reglas debe ser consecutiva: se esperaba %, llego %. RN-16',
      v_actual + 1, NEW.numero
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.copropiedades
     SET version_reglas_actual = NEW.numero
   WHERE id = NEW.copropiedad_id;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_version_reglas ON public.versiones_de_reglas;
CREATE TRIGGER tg_version_reglas BEFORE INSERT ON public.versiones_de_reglas
  FOR EACH ROW EXECUTE FUNCTION app.tg_version_reglas_monotona();
