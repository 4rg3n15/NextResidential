-- =============================================================================
-- 0037 · ETAPA 15-H · IDENTIDAD POR USUARIO Y PORTERÍA
--
-- Extensión al contrato E-02 (Bloque B, sesión 1) · ADR-023 · ADR-024.
--
--   1 · usuarios: nombre de usuario (único por copropiedad, insensible a
--       mayúsculas) y cambio de contraseña obligatorio en el primer ingreso.
--       `correo` admite nulo SOLO si la cuenta tiene nombre de usuario: el
--       correo con el que entra en Supabase es sintético (`.invalid`) y NO se
--       guarda en ninguna tabla nuestra.
--   2 · el gancho de claims emite `debe_cambiar_contrasena` cuando es cierto.
--   3 · un disparador impide que un usuario se modifique a sí mismo los
--       campos que sostienen su identidad —y al portero, cualquier campo: su
--       perfil lo ve y no lo edita—, también por la REST de Supabase.
--   4 · perfiles_de_portero, turnos_de_porteria (franja calculada en la zona
--       horaria de la copropiedad, admite cruzar la medianoche),
--       sesiones_de_porteria (una por sesión de Supabase, con el hash del
--       código de patrullaje) y bitacora_de_porteria, de SOLO INSERCIÓN con
--       las tres capas de ADR-005 (REVOKE también al dueño, disparadores
--       ENABLE ALWAYS y RLS forzada sin política de edición).
--
-- Reversión: supabase/reversion/0037_revert.sql.
-- =============================================================================

-- 1 · usuarios ---------------------------------------------------------------
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS nombre_usuario citext NULL;
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS debe_cambiar_contrasena boolean NOT NULL DEFAULT false;
ALTER TABLE public.usuarios ALTER COLUMN correo DROP NOT NULL;

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_nombre_usuario_formato;
-- `::text` a propósito: sobre `citext` el operador `~` NO distingue mayúsculas,
-- y lo que se exige es que se guarde ya en minúsculas.
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_nombre_usuario_formato
  CHECK (nombre_usuario IS NULL OR nombre_usuario::text ~ '^[a-z0-9][a-z0-9._-]{2,31}$');

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_identificador_de_acceso;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_identificador_de_acceso
  CHECK (correo IS NOT NULL OR nombre_usuario IS NOT NULL);

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_usuario_con_copropiedad;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_usuario_con_copropiedad
  CHECK (nombre_usuario IS NULL OR copropiedad_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_nombre_usuario_uk
  ON public.usuarios (copropiedad_id, nombre_usuario) WHERE nombre_usuario IS NOT NULL;

COMMENT ON COLUMN public.usuarios.nombre_usuario IS
  'ADR-023 · identificador de acceso sin correo, único por copropiedad. El correo '
  'con el que Supabase lo autentica es sintético y no se guarda aquí.';
COMMENT ON COLUMN public.usuarios.debe_cambiar_contrasena IS
  'ADR-023 · primer ingreso o restablecimiento: el gancho lo emite como claim y '
  'la API responde 403 en toda ruta salvo el cambio y el cierre.';

-- 2 · el gancho de claims ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, pg_temp
AS $$
DECLARE
  v_auth_user_id uuid;
  v_usuario      public.usuarios%ROWTYPE;
  v_rol          rol_usuario;
  v_copropiedad  uuid;
  v_atendidas    uuid[];
  v_claims       jsonb;
BEGIN
  v_claims := coalesce(event->'claims', '{}'::jsonb);
  BEGIN
    v_auth_user_id := (event->>'user_id')::uuid;
  EXCEPTION WHEN others THEN
    -- Sin identificador utilizable se devuelve el evento intacto: el token sale
    -- SIN claims y el sistema falla cerrado. Inventar un rol aqui seria
    -- conceder acceso a quien no se ha podido identificar.
    RETURN event;
  END;

  SELECT * INTO v_usuario
    FROM public.usuarios
   WHERE auth_user_id = v_auth_user_id
     AND estado = 'activo';

  IF NOT FOUND THEN
    RETURN event;
  END IF;

  -- Rol activo: el mas privilegiado de los vigentes.
  SELECT r.rol, r.copropiedad_id
    INTO v_rol, v_copropiedad
    FROM public.roles_usuario r
   WHERE r.usuario_id = v_usuario.id
     AND r.estado = 'activo'
   ORDER BY app.precedencia_de_rol(r.rol) ASC, r.creado_en ASC
   LIMIT 1;

  IF v_rol IS NULL THEN
    -- Usuario dado de alta sin rol: no entra. Es un estado legitimo durante el
    -- aprovisionamiento y debe seguir fallando cerrado.
    RETURN event;
  END IF;

  v_claims := v_claims
    || jsonb_build_object('usuario_id', v_usuario.id)
    || jsonb_build_object('rol', v_rol);

  IF v_usuario.persona_id IS NOT NULL THEN
    v_claims := v_claims || jsonb_build_object('persona_id', v_usuario.persona_id);
  END IF;

  IF v_rol = 'superadministrador' THEN
    -- El superadministrador no pertenece a una copropiedad: su alcance es
    -- global y lo resuelve `app.es_superadmin()`. Fijarle una copropiedad
    -- concreta lo ataria a ella sin motivo.
    v_claims := v_claims || jsonb_build_object('copropiedad_id', NULL);

  ELSIF v_rol = 'operador_central' THEN
    -- HU-25, KPI-35: atiende varias, acotadas a su turno activo. Se emiten
    -- TODAS las vigentes y `copropiedad_id` queda nulo: el operador elige en la
    -- consola, y el guard comprueba la elegida contra este arreglo.
    SELECT array_agg(DISTINCT r.copropiedad_id ORDER BY r.copropiedad_id)
      INTO v_atendidas
      FROM public.roles_usuario r
     WHERE r.usuario_id = v_usuario.id
       AND r.rol = 'operador_central'
       AND r.estado = 'activo';

    v_claims := v_claims
      || jsonb_build_object('copropiedad_id', NULL)
      -- Tope de 64, el mismo que valida el esquema Zod de los claims: un
      -- arreglo sin techo agrandaria el token en cada peticion.
      || jsonb_build_object('copropiedades', to_jsonb(v_atendidas[1:64]));

  ELSE
    v_claims := v_claims || jsonb_build_object('copropiedad_id', v_copropiedad);
  END IF;

  -- 0037 · ETAPA 15-H (ADR-023) · cambio de contraseña obligatorio. Sólo se
  -- emite cuando es cierto: el guard de la API responde 403 en toda ruta salvo
  -- el cambio y el cierre mientras el claim viaje en el token.
  IF v_usuario.debe_cambiar_contrasena THEN
    v_claims := v_claims || jsonb_build_object('debe_cambiar_contrasena', true);
  ELSE
    v_claims := v_claims - 'debe_cambiar_contrasena';
  END IF;

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- 3 · lo que un usuario NO puede cambiarse a sí mismo --------------------------
-- La política `usuarios_edicion` (0014) admite `id = app.usuario_id()`, y la
-- REST de Supabase publica la tabla con la llave publicable. Sin esto, una
-- cuenta podría bajarse el indicador de cambio obligatorio, cambiarse el
-- nombre de usuario o apuntarse a otra persona. Sin claims (migraciones,
-- semillas, el dueño) no aplica.
CREATE OR REPLACE FUNCTION app.tg_usuario_campos_propios()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.usuario_id() IS NULL OR OLD.id IS DISTINCT FROM app.usuario_id()
     OR app.rol() IN ('superadministrador', 'administrador', 'servicio') THEN
    RETURN NEW;
  END IF;
  IF app.rol() = 'portero' THEN
    RAISE EXCEPTION 'El portero ve su perfil y no lo edita (E-02, B3)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.nombre_usuario IS DISTINCT FROM OLD.nombre_usuario
     OR NEW.debe_cambiar_contrasena IS DISTINCT FROM OLD.debe_cambiar_contrasena
     OR NEW.copropiedad_id IS DISTINCT FROM OLD.copropiedad_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.persona_id IS DISTINCT FROM OLD.persona_id
     OR NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.mfa_habilitado IS DISTINCT FROM OLD.mfa_habilitado THEN
    RAISE EXCEPTION 'Una cuenta no puede cambiarse a sí misma su identidad ni su estado (ADR-023)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_usuario_campos_propios ON public.usuarios;
CREATE TRIGGER tg_usuario_campos_propios BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION app.tg_usuario_campos_propios();

-- 4 · perfiles_de_portero ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.perfiles_de_portero (
  usuario_id       uuid PRIMARY KEY REFERENCES public.usuarios(id),
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  porteria         text NULL,
  sectores         text[] NOT NULL DEFAULT '{}',
  correo_contacto  citext NULL,

  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT perfiles_portero_tenant_uk UNIQUE (copropiedad_id, usuario_id),
  CONSTRAINT perfiles_portero_porteria_len
    CHECK (porteria IS NULL OR length(porteria) BETWEEN 1 AND 80),
  CONSTRAINT perfiles_portero_sectores_cuantos CHECK (cardinality(sectores) <= 50),
  CONSTRAINT perfiles_portero_correo_len
    CHECK (correo_contacto IS NULL OR length(correo_contacto) BETWEEN 5 AND 254)
);
COMMENT ON TABLE public.perfiles_de_portero IS
  'E-02 · datos del portero que registra el superadministrador. Los sectores son '
  'INFORMATIVOS (P-17). El nombre y el teléfono viven en usuarios.';

-- 5 · turnos_de_porteria -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.turnos_de_porteria (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),
  portero_id           uuid NOT NULL,
  porteria             text NULL,
  dia                  date NOT NULL,
  hora_inicio          time NOT NULL,
  hora_fin             time NOT NULL,
  franja               tstzrange NOT NULL,
  tipo                 text NOT NULL DEFAULT 'programado',
  motivo               text NULL,

  estado               estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en       timestamptz NULL,
  desactivado_por      uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT turnos_tenant_uk UNIQUE (copropiedad_id, id),
  CONSTRAINT turnos_portero_fk FOREIGN KEY (copropiedad_id, portero_id)
    REFERENCES public.perfiles_de_portero(copropiedad_id, usuario_id),
  CONSTRAINT turnos_tipo CHECK (tipo IN ('programado', 'extra')),
  CONSTRAINT turnos_extra_con_motivo
    CHECK (tipo <> 'extra' OR (motivo IS NOT NULL AND length(motivo) BETWEEN 5 AND 300)),
  CONSTRAINT turnos_motivo_len CHECK (motivo IS NULL OR length(motivo) <= 300),
  CONSTRAINT turnos_con_duracion CHECK (hora_inicio <> hora_fin),
  CONSTRAINT turnos_porteria_len CHECK (porteria IS NULL OR length(porteria) BETWEEN 1 AND 80),
  CONSTRAINT turnos_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT turnos_franja_acotada CHECK (NOT isempty(franja) AND NOT lower_inf(franja) AND NOT upper_inf(franja))
);
CREATE INDEX IF NOT EXISTS turnos_portero_idx
  ON public.turnos_de_porteria (copropiedad_id, portero_id, estado);
CREATE INDEX IF NOT EXISTS turnos_dia_idx ON public.turnos_de_porteria (copropiedad_id, dia);
CREATE INDEX IF NOT EXISTS turnos_franja_idx ON public.turnos_de_porteria USING gist (franja);
COMMENT ON TABLE public.turnos_de_porteria IS
  'ADR-024 · turno = portero + día + franja en la zona horaria de la copropiedad. '
  'Si hora_fin <= hora_inicio, cruza la medianoche. La franja la calcula la base.';

-- La franja la calcula la BASE, con la zona de la copropiedad. La misma cuenta
-- vive en `porteria/dominio/turno.ts`, y una prueba contra base exige que las
-- dos coincidan (también en un turno que cruza la medianoche).
CREATE OR REPLACE FUNCTION app.tg_franja_de_turno()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_zona text;
BEGIN
  SELECT zona_horaria INTO v_zona FROM public.copropiedades WHERE id = NEW.copropiedad_id;
  IF v_zona IS NULL THEN
    RAISE EXCEPTION 'La copropiedad del turno no existe o no tiene zona horaria'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.franja := tstzrange(
    (NEW.dia + NEW.hora_inicio) AT TIME ZONE v_zona,
    ((CASE WHEN NEW.hora_fin > NEW.hora_inicio THEN NEW.dia ELSE NEW.dia + 1 END)
      + NEW.hora_fin) AT TIME ZONE v_zona,
    '[)');
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_franja_de_turno ON public.turnos_de_porteria;
CREATE TRIGGER tg_franja_de_turno BEFORE INSERT OR UPDATE ON public.turnos_de_porteria
  FOR EACH ROW EXECUTE FUNCTION app.tg_franja_de_turno();

-- 6 · sesiones_de_porteria -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sesiones_de_porteria (
  sesion_id           uuid PRIMARY KEY,
  copropiedad_id      uuid NOT NULL REFERENCES public.copropiedades(id),
  portero_id          uuid NOT NULL,
  turno_id            uuid NOT NULL,
  estado              text NOT NULL DEFAULT 'activa',
  codigo_hash         text NOT NULL,
  intentos_fallidos   smallint NOT NULL DEFAULT 0,
  iniciada_en         timestamptz NOT NULL,
  patrullaje_desde    timestamptz NULL,
  cerrada_en          timestamptz NULL,
  motivo_cierre       text NULL,
  origen_ip           inet NULL,
  origen_declarado    text NULL,
  agente              text NULL,

  creado_en           timestamptz NOT NULL DEFAULT now(),
  creado_por          uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_por     uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT sesiones_portero_fk FOREIGN KEY (copropiedad_id, portero_id)
    REFERENCES public.perfiles_de_portero(copropiedad_id, usuario_id),
  CONSTRAINT sesiones_turno_fk FOREIGN KEY (copropiedad_id, turno_id)
    REFERENCES public.turnos_de_porteria(copropiedad_id, id),
  CONSTRAINT sesiones_estado CHECK (estado IN ('activa', 'patrullaje', 'cerrada')),
  CONSTRAINT sesiones_intentos CHECK (intentos_fallidos BETWEEN 0 AND 5),
  CONSTRAINT sesiones_codigo_hash_len CHECK (length(codigo_hash) BETWEEN 20 AND 300),
  CONSTRAINT sesiones_cierre_coherente CHECK ((estado = 'cerrada') = (cerrada_en IS NOT NULL)),
  CONSTRAINT sesiones_patrullaje_coherente
    CHECK ((estado = 'patrullaje') = (patrullaje_desde IS NOT NULL)),
  CONSTRAINT sesiones_motivo_cierre CHECK (motivo_cierre IS NULL OR motivo_cierre IN
    ('manual', 'fin_de_turno', 'intentos_agotados', 'restablecimiento', 'baja')),
  CONSTRAINT sesiones_origen_len CHECK (origen_declarado IS NULL OR length(origen_declarado) <= 100),
  CONSTRAINT sesiones_agente_len CHECK (agente IS NULL OR length(agente) <= 300)
);
CREATE INDEX IF NOT EXISTS sesiones_portero_idx
  ON public.sesiones_de_porteria (copropiedad_id, portero_id, estado);
COMMENT ON TABLE public.sesiones_de_porteria IS
  'ADR-024 · una fila por sesión de Supabase de un portero (session_id del token). '
  'La API la consulta en CADA petición: turno vigente y estado (activa, '
  'patrullaje, cerrada). El código de patrullaje sólo se guarda en hash.';

-- Una sesión cerrada no se reabre: ni por la API ni por la REST.
CREATE OR REPLACE FUNCTION app.tg_sesion_cerrada_no_se_reabre()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado = 'cerrada' THEN
    RAISE EXCEPTION 'Una sesión de portería cerrada no se reabre (ADR-024)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_sesion_cerrada_no_se_reabre ON public.sesiones_de_porteria;
CREATE TRIGGER tg_sesion_cerrada_no_se_reabre BEFORE UPDATE ON public.sesiones_de_porteria
  FOR EACH ROW EXECUTE FUNCTION app.tg_sesion_cerrada_no_se_reabre();

-- 7 · bitacora_de_porteria (SOLO INSERCIÓN) ------------------------------------
CREATE TABLE IF NOT EXISTS public.bitacora_de_porteria (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id     uuid NOT NULL REFERENCES public.copropiedades(id),
  ocurrido_en        timestamptz NOT NULL,
  tipo               text NOT NULL,
  usuario_id         uuid NULL REFERENCES public.usuarios(id),
  actor_id           uuid NULL REFERENCES public.usuarios(id),
  sesion_id          uuid NULL,
  turno_id           uuid NULL,
  duracion_segundos  integer NULL,
  origen_ip          inet NULL,
  origen_declarado   text NULL,
  agente             text NULL,
  detalle            text NULL,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  -- NOT NULL como toda columna de auditoría (el arranque en frío lo exige):
  -- sin actor humano, firma el actor de ingesta (0035).
  creado_por         uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT bitacora_porteria_tipo CHECK (tipo IN (
    'inicio_de_sesion', 'acceso_rechazado', 'cierre_de_sesion',
    'inicio_de_patrullaje', 'fin_de_patrullaje', 'codigo_incorrecto',
    'turno_asignado', 'turno_extra', 'turno_editado', 'turno_retirado', 'solape_de_turno',
    'alta_de_portero', 'edicion_de_portero',
    'restablecimiento_de_contrasena', 'cambio_de_contrasena')),
  CONSTRAINT bitacora_porteria_duracion CHECK (duracion_segundos IS NULL OR duracion_segundos >= 0),
  CONSTRAINT bitacora_porteria_origen_len
    CHECK (origen_declarado IS NULL OR length(origen_declarado) <= 100),
  CONSTRAINT bitacora_porteria_agente_len CHECK (agente IS NULL OR length(agente) <= 300),
  CONSTRAINT bitacora_porteria_detalle_len CHECK (detalle IS NULL OR length(detalle) <= 500)
);
-- Idempotente también sobre una base donde la tabla ya existía sin la
-- restricción: no hay filas sin autor, así que el cambio no puede fallar.
ALTER TABLE public.bitacora_de_porteria ALTER COLUMN creado_por SET NOT NULL;
CREATE INDEX IF NOT EXISTS bitacora_porteria_copropiedad_idx
  ON public.bitacora_de_porteria (copropiedad_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS bitacora_porteria_usuario_idx
  ON public.bitacora_de_porteria (copropiedad_id, usuario_id, ocurrido_en DESC);
COMMENT ON TABLE public.bitacora_de_porteria IS
  'ADR-024 · rastro de SOLO INSERCIÓN del panel de supervisión: sesiones con su '
  'origen, patrullajes con su duración, turnos, restablecimientos y rechazos. '
  'Mismas tres capas que eventos (ADR-005).';

-- 8 · auditoría, borrado lógico e inmutabilidad --------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['perfiles_de_portero', 'turnos_de_porteria', 'sesiones_de_porteria'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_auditoria ON public.%I', t);
    EXECUTE format('CREATE TRIGGER tg_auditoria BEFORE INSERT OR UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION app.tg_auditoria()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['perfiles_de_portero', 'turnos_de_porteria', 'sesiones_de_porteria',
                           'bitacora_de_porteria'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.%I', t);
    EXECUTE format('CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete()', t);
  END LOOP;
END
$$;

DROP TRIGGER IF EXISTS tg_prohibir_update ON public.bitacora_de_porteria;
CREATE TRIGGER tg_prohibir_update BEFORE UPDATE ON public.bitacora_de_porteria
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_update();
-- ENABLE ALWAYS: tampoco los salta un `session_replication_role = replica`.
ALTER TABLE public.bitacora_de_porteria ENABLE ALWAYS TRIGGER tg_prohibir_update;
ALTER TABLE public.bitacora_de_porteria ENABLE ALWAYS TRIGGER tg_prohibir_delete;

-- 9 · privilegios ----------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.perfiles_de_portero, public.turnos_de_porteria,
  public.sesiones_de_porteria TO authenticated, service_role;
GRANT SELECT, INSERT ON public.bitacora_de_porteria TO authenticated, service_role;
REVOKE DELETE, TRUNCATE ON public.perfiles_de_portero, public.turnos_de_porteria,
  public.sesiones_de_porteria FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.perfiles_de_portero, public.turnos_de_porteria,
  public.sesiones_de_porteria, public.bitacora_de_porteria FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.bitacora_de_porteria
  FROM PUBLIC, authenticated, service_role;
DO $$
DECLARE v_dueno text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_mantenimiento') THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON public.bitacora_de_porteria FROM app_mantenimiento';
  END IF;
  SELECT pg_get_userbyid(c.relowner) INTO v_dueno
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'bitacora_de_porteria';
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.bitacora_de_porteria FROM %I', v_dueno);
END
$$;

-- 10 · RLS forzada, con política por rol ----------------------------------------
ALTER TABLE public.perfiles_de_portero  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfiles_de_portero  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_de_porteria   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turnos_de_porteria   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_de_porteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_de_porteria FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_de_porteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_de_porteria FORCE ROW LEVEL SECURITY;

-- perfiles: los escribe el superadministrador (o la API con su identidad de
-- servicio); los lee la administración de la copropiedad y el propio portero.
DROP POLICY IF EXISTS perfiles_portero_lectura   ON public.perfiles_de_portero;
DROP POLICY IF EXISTS perfiles_portero_insercion ON public.perfiles_de_portero;
DROP POLICY IF EXISTS perfiles_portero_edicion   ON public.perfiles_de_portero;
CREATE POLICY perfiles_portero_lectura ON public.perfiles_de_portero FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id) OR usuario_id = app.usuario_id());
CREATE POLICY perfiles_portero_insercion ON public.perfiles_de_portero FOR INSERT
  WITH CHECK (app.es_superadmin() OR app.es_servicio(copropiedad_id));
CREATE POLICY perfiles_portero_edicion ON public.perfiles_de_portero FOR UPDATE
  USING (app.es_superadmin() OR app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_superadmin() OR app.es_servicio(copropiedad_id));

-- turnos: los asigna el superadministrador; los lee la administración y el
-- portero los suyos.
DROP POLICY IF EXISTS turnos_lectura   ON public.turnos_de_porteria;
DROP POLICY IF EXISTS turnos_insercion ON public.turnos_de_porteria;
DROP POLICY IF EXISTS turnos_edicion   ON public.turnos_de_porteria;
CREATE POLICY turnos_lectura ON public.turnos_de_porteria FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id) OR portero_id = app.usuario_id());
CREATE POLICY turnos_insercion ON public.turnos_de_porteria FOR INSERT
  WITH CHECK (app.es_superadmin() OR app.es_servicio(copropiedad_id));
CREATE POLICY turnos_edicion ON public.turnos_de_porteria FOR UPDATE
  USING (app.es_superadmin() OR app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_superadmin() OR app.es_servicio(copropiedad_id));

-- sesiones: las escribe SOLO la API (servicio). Ni el portero puede sacarse a
-- sí mismo del patrullaje por la REST.
DROP POLICY IF EXISTS sesiones_porteria_lectura   ON public.sesiones_de_porteria;
DROP POLICY IF EXISTS sesiones_porteria_insercion ON public.sesiones_de_porteria;
DROP POLICY IF EXISTS sesiones_porteria_edicion   ON public.sesiones_de_porteria;
CREATE POLICY sesiones_porteria_lectura ON public.sesiones_de_porteria FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));
CREATE POLICY sesiones_porteria_insercion ON public.sesiones_de_porteria FOR INSERT
  WITH CHECK (app.es_servicio(copropiedad_id));
CREATE POLICY sesiones_porteria_edicion ON public.sesiones_de_porteria FOR UPDATE
  USING (app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_servicio(copropiedad_id));

-- bitácora: se lee y se inserta; NO hay política de edición (ADR-005).
DROP POLICY IF EXISTS bitacora_porteria_lectura   ON public.bitacora_de_porteria;
DROP POLICY IF EXISTS bitacora_porteria_insercion ON public.bitacora_de_porteria;
CREATE POLICY bitacora_porteria_lectura ON public.bitacora_de_porteria FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));
CREATE POLICY bitacora_porteria_insercion ON public.bitacora_de_porteria FOR INSERT
  WITH CHECK (app.es_superadmin() OR app.es_servicio(copropiedad_id));

-- 11 · aserciones de despliegue -------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public'
     AND c.relname IN ('perfiles_de_portero', 'turnos_de_porteria', 'sesiones_de_porteria',
                       'bitacora_de_porteria')
     AND c.relrowsecurity AND c.relforcerowsecurity;
  ASSERT n = 4, format('0037: %s de 4 tablas con RLS forzada', n);

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'bitacora_de_porteria'
     AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');
  ASSERT n = 0, format('0037: la bitácora conserva %s privilegios de escritura (ni el dueño)', n);

  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'bitacora_de_porteria'
     AND t.tgname IN ('tg_prohibir_update', 'tg_prohibir_delete') AND t.tgenabled = 'A';
  ASSERT n = 2, '0037: la bitácora sin sus dos disparadores ENABLE ALWAYS';

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'bitacora_de_porteria' AND cmd IN ('UPDATE', 'DELETE', 'ALL');
  ASSERT n = 0, '0037: la bitácora tiene una política de edición';

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
   WHERE s.nspname = 'public' AND p.proname = 'custom_access_token_hook'
     AND pg_get_functiondef(p.oid) LIKE '%debe_cambiar_contrasena%';
  ASSERT n = 1, '0037: el gancho no emite debe_cambiar_contrasena';

  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'usuarios' AND t.tgname = 'tg_usuario_campos_propios' AND t.tgenabled <> 'D';
  ASSERT n = 1, '0037: falta el disparador de campos propios de usuarios';
END
$$;
