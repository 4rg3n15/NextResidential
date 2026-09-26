-- =============================================================================
-- 0038 · ETAPA 15-I · RESIDENTES, ACCESO POR CÓDIGO Y VEHÍCULOS PROPIOS
--
-- Decisiones del cliente D1, D5, D6 y D7 (docs/auditoria/contradicciones-y-
-- supuestos.md §3 ter) · ADR-025 · ADR-026 · ADR-027.
--
--   1 · copropiedades: CÓDIGO CORTO de acceso (D1, único en la plataforma,
--       guardado en mayúsculas), TELÉFONO DE PORTERÍA (D7), TOPE de vehículos
--       propios por vivienda (D5 a, 2 por omisión) y MODO DE APROBACIÓN de las
--       autorizaciones de terceros (D5 c; el único valor admitido hoy es
--       'automatica'). Los cuatro los cambia SÓLO el superadministrador, también
--       frente a la REST de Supabase.
--   2 · personas: nombres, apellidos y fecha de nacimiento (perfil, 3.5).
--   3 · vehiculos: quién lo registró (residente o administración) y el TOPE
--       impuesto en la BASE con un bloqueo por vivienda (ADR-04, ADR-026): dos
--       altas simultáneas no dejan tres vehículos.
--   4 · vehiculos_ocupantes: uno o más ocupantes por vehículo, siempre de la
--       misma vivienda.
--   5 · ocupacion_de_viviendas: primer residente y declaración de ocupantes (D6).
--   6 · plazas_de_ocupante: una plaza por ocupante declarado; su código NO se
--       guarda —se deriva bajo demanda (ADR-025)—. El número sólo lo cambia el
--       superadministrador una vez declarado.
--   7 · bitacora_de_residentes: rastro de SOLO INSERCIÓN (vinculaciones, códigos
--       equivocados, ocupantes, vehículos propios, perfil), con las tres capas de
--       ADR-005.
--   8 · P-11 · todo conjunto nace con sus dos niveles de acceso. Hallazgo
--       H-15I-02: ninguna migración los creaba —sólo la semilla—, así que en una
--       copropiedad real el disparador de la 0013 rechazaba TODO residente
--       («no tiene niveles de acceso configurados»).
--
-- Reversión: supabase/reversion/0038_revert.sql.
-- =============================================================================

-- 1 · copropiedades ------------------------------------------------------------
ALTER TABLE public.copropiedades
  ADD COLUMN IF NOT EXISTS codigo_corto           text     NULL,
  ADD COLUMN IF NOT EXISTS telefono_porteria      text     NULL,
  ADD COLUMN IF NOT EXISTS tope_vehiculos_propios smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS aprobacion_de_terceros text     NOT NULL DEFAULT 'automatica';

ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_codigo_corto_formato;
-- Mayúsculas en la base: la insensibilidad a mayúsculas la da la normalización
-- del objeto de valor (`codigoCorto`) al escribir Y al buscar, y esta
-- restricción impide que una fila entre sin normalizar.
ALTER TABLE public.copropiedades ADD CONSTRAINT copropiedades_codigo_corto_formato
  CHECK (codigo_corto IS NULL OR codigo_corto ~ '^[A-Z0-9]{3,8}$');
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_telefono_porteria_formato;
ALTER TABLE public.copropiedades ADD CONSTRAINT copropiedades_telefono_porteria_formato
  CHECK (telefono_porteria IS NULL OR telefono_porteria ~ '^\+?[0-9]{7,15}$');
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_tope_vehiculos_propios;
ALTER TABLE public.copropiedades ADD CONSTRAINT copropiedades_tope_vehiculos_propios
  CHECK (tope_vehiculos_propios BETWEEN 0 AND 20);
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_aprobacion_de_terceros;
-- D5 c · el punto de extensión existe; el valor 'portero' NO se admite hasta
-- que se construya su cola (ADR-027). Añadirlo es ampliar esta lista.
ALTER TABLE public.copropiedades ADD CONSTRAINT copropiedades_aprobacion_de_terceros
  CHECK (aprobacion_de_terceros IN ('automatica'));

-- Único en TODA la plataforma, activas o no: un código dado de baja no se
-- reasigna a otro conjunto (un residente antiguo entraría en el nuevo).
CREATE UNIQUE INDEX IF NOT EXISTS copropiedades_codigo_corto_uk
  ON public.copropiedades (codigo_corto) WHERE codigo_corto IS NOT NULL;

COMMENT ON COLUMN public.copropiedades.codigo_corto IS
  'D1 · ADR-023 · código corto de acceso (3 a 8 alfanuméricos, mayúsculas, único en la '
  'plataforma). Con el usuario, la API deriva el correo sintético; lo asigna el superadministrador.';
COMMENT ON COLUMN public.copropiedades.telefono_porteria IS
  'D7 · teléfono al que llama el botón «Portería» de la app del residente.';
COMMENT ON COLUMN public.copropiedades.tope_vehiculos_propios IS
  'D5 a · ADR-026 · vehículos propios ACTIVOS que los ocupantes pueden registrar por vivienda. '
  'Los que registra el superadministrador no cuentan.';
COMMENT ON COLUMN public.copropiedades.aprobacion_de_terceros IS
  'D5 c · ADR-027 · modo de aprobación de las autorizaciones de terceros. Hoy sólo automatica.';

-- Los cuatro ajustes son de PLATAFORMA: la política `copropiedades_edicion`
-- (0014) deja al administrador editar su copropiedad por la REST, y sin esto
-- podría asignarse un código, subir el tope o cambiar el teléfono de portería.
-- Sin claims (migraciones, semillas, el dueño) no aplica.
CREATE OR REPLACE FUNCTION app.tg_copropiedad_ajustes_de_plataforma()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.usuario_id() IS NULL OR app.rol() = 'superadministrador' THEN
    RETURN NEW;
  END IF;
  IF NEW.codigo_corto IS DISTINCT FROM OLD.codigo_corto
     OR NEW.telefono_porteria IS DISTINCT FROM OLD.telefono_porteria
     OR NEW.tope_vehiculos_propios IS DISTINCT FROM OLD.tope_vehiculos_propios
     OR NEW.aprobacion_de_terceros IS DISTINCT FROM OLD.aprobacion_de_terceros THEN
    RAISE EXCEPTION 'Código de acceso, teléfono de portería, tope de vehículos y aprobación '
                    'los cambia sólo el superadministrador (D1, D5, D7)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_copropiedad_ajustes_de_plataforma ON public.copropiedades;
CREATE TRIGGER tg_copropiedad_ajustes_de_plataforma BEFORE UPDATE ON public.copropiedades
  FOR EACH ROW EXECUTE FUNCTION app.tg_copropiedad_ajustes_de_plataforma();

-- 2 · personas: el perfil del residente ---------------------------------------
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS nombres          text NULL,
  ADD COLUMN IF NOT EXISTS apellidos        text NULL,
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date NULL;
ALTER TABLE public.personas DROP CONSTRAINT IF EXISTS personas_nombres_len;
ALTER TABLE public.personas ADD CONSTRAINT personas_nombres_len
  CHECK (nombres IS NULL OR (length(nombres) BETWEEN 1 AND 100 AND nombres !~ '[\x00-\x1F\x7F]'));
ALTER TABLE public.personas DROP CONSTRAINT IF EXISTS personas_apellidos_len;
ALTER TABLE public.personas ADD CONSTRAINT personas_apellidos_len
  CHECK (apellidos IS NULL OR (length(apellidos) BETWEEN 1 AND 100 AND apellidos !~ '[\x00-\x1F\x7F]'));
ALTER TABLE public.personas DROP CONSTRAINT IF EXISTS personas_fecha_nacimiento_rango;
-- El techo (no en el futuro) lo impone el dominio con el reloj inyectado: una
-- restricción no puede leer la fecha de hoy sin dejar de ser inmutable.
ALTER TABLE public.personas ADD CONSTRAINT personas_fecha_nacimiento_rango
  CHECK (fecha_nacimiento IS NULL OR fecha_nacimiento >= DATE '1900-01-01');

-- 3 · vehiculos: origen y tope por vivienda -----------------------------------
ALTER TABLE public.vehiculos
  ADD COLUMN IF NOT EXISTS origen_registro text NOT NULL DEFAULT 'administracion';
ALTER TABLE public.vehiculos DROP CONSTRAINT IF EXISTS vehiculos_origen_registro;
ALTER TABLE public.vehiculos ADD CONSTRAINT vehiculos_origen_registro
  CHECK (origen_registro IN ('residente', 'administracion'));
CREATE INDEX IF NOT EXISTS vehiculos_propios_por_vivienda_idx
  ON public.vehiculos (copropiedad_id, vivienda_id)
  WHERE estado = 'activo' AND origen_registro = 'residente';
COMMENT ON COLUMN public.vehiculos.origen_registro IS
  'D5 a · ADR-026 · residente (cuenta para el tope de la vivienda) o administracion (el '
  'superadministrador lo registra por encima del tope; no cuenta).';

-- ═════════════════════════════════════════════════════════════════════════════
-- EL TOPE, EN LA BASE (ADR-04, ADR-026)
--
-- Un SELECT previo en la API es correcto de uno en uno y falso bajo
-- concurrencia: dos altas simultáneas contarían 1 las dos y dejarían 3. El
-- disparador toma un bloqueo consultivo POR VIVIENDA, de transacción, antes de
-- contar: la segunda alta espera a que la primera confirme y, como en READ
-- COMMITTED cada sentencia del disparador toma su propia instantánea, la cuenta
-- ya la incluye. No hace falta privilegio sobre `viviendas` ni pasa por su RLS.
--
-- Y cierra la otra puerta: la RLS (0014) deja al residente insertar vehículos
-- de SU vivienda por la REST. Un residente no puede declarar su alta como «de
-- administración» para esquivar el tope, ni convertir después una suya.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION app.tg_tope_vehiculos_propios()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tope     smallint;
  v_ocupados integer;
BEGIN
  IF app.rol() = 'residente' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.origen_registro := 'residente';
    ELSIF NEW.origen_registro IS DISTINCT FROM OLD.origen_registro THEN
      RAISE EXCEPTION 'Un residente no cambia el origen de un vehículo (D5 a)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF NEW.origen_registro <> 'residente' OR NEW.estado <> 'activo' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'activo' AND OLD.origen_registro = 'residente'
     AND OLD.vivienda_id = NEW.vivienda_id THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ncr:tope-vehiculos:' || NEW.vivienda_id::text, 0));

  SELECT c.tope_vehiculos_propios INTO v_tope
    FROM public.copropiedades c WHERE c.id = NEW.copropiedad_id;
  SELECT count(*) INTO v_ocupados
    FROM public.vehiculos v
   WHERE v.copropiedad_id = NEW.copropiedad_id
     AND v.vivienda_id = NEW.vivienda_id
     AND v.estado = 'activo'
     AND v.origen_registro = 'residente'
     AND v.id <> NEW.id;

  -- Sin tope legible (NULL) se niega: falla cerrado.
  IF v_ocupados >= COALESCE(v_tope, 0) THEN
    RAISE EXCEPTION 'La vivienda ya tiene % vehículo(s) propio(s) y el tope es % (D5 a)',
                    v_ocupados, COALESCE(v_tope, 0)
      USING ERRCODE = 'check_violation', CONSTRAINT = 'vehiculos_tope_propios';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_tope_vehiculos_propios ON public.vehiculos;
CREATE TRIGGER tg_tope_vehiculos_propios BEFORE INSERT OR UPDATE ON public.vehiculos
  FOR EACH ROW EXECUTE FUNCTION app.tg_tope_vehiculos_propios();

-- 4 · vehiculos_ocupantes -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehiculos_ocupantes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),
  vehiculo_id          uuid NOT NULL,
  residente_id         uuid NOT NULL,

  estado               estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en       timestamptz NULL,
  desactivado_por      uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  -- Un vehículo SIN historial se puede borrar de verdad (0034); sus vínculos se
  -- van con él. No son historial: el historial es el evento con la placa.
  CONSTRAINT vehiculos_ocupantes_vehiculo_fk FOREIGN KEY (copropiedad_id, vehiculo_id)
    REFERENCES public.vehiculos(copropiedad_id, id) ON DELETE CASCADE,
  CONSTRAINT vehiculos_ocupantes_residente_fk FOREIGN KEY (copropiedad_id, residente_id)
    REFERENCES public.residentes(copropiedad_id, id),
  CONSTRAINT vehiculos_ocupantes_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS vehiculos_ocupantes_uk
  ON public.vehiculos_ocupantes (vehiculo_id, residente_id) WHERE estado = 'activo';
CREATE INDEX IF NOT EXISTS vehiculos_ocupantes_residente_idx
  ON public.vehiculos_ocupantes (copropiedad_id, residente_id) WHERE estado = 'activo';
COMMENT ON TABLE public.vehiculos_ocupantes IS
  'D5 a · ocupantes vinculados a un vehículo propio: uno o más, siempre de la misma vivienda.';

CREATE OR REPLACE FUNCTION app.tg_ocupante_de_la_vivienda()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vehiculos v
      JOIN public.residentes r ON r.copropiedad_id = v.copropiedad_id
                              AND r.vivienda_id = v.vivienda_id
     WHERE v.id = NEW.vehiculo_id AND r.id = NEW.residente_id
       AND v.copropiedad_id = NEW.copropiedad_id) THEN
    RAISE EXCEPTION 'El ocupante vinculado no vive en la vivienda del vehículo (D5 a)'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'vehiculos_ocupantes_misma_vivienda';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_ocupante_de_la_vivienda ON public.vehiculos_ocupantes;
CREATE TRIGGER tg_ocupante_de_la_vivienda BEFORE INSERT OR UPDATE ON public.vehiculos_ocupantes
  FOR EACH ROW EXECUTE FUNCTION app.tg_ocupante_de_la_vivienda();

-- 5 · ocupacion_de_viviendas: primer residente y declaración (D6) -------------
-- Tabla propia y no tres columnas en `viviendas`: la política de edición de
-- `viviendas` (0014) es del administrador, y esta declaración NO es suya —la
-- hace el primer residente por la API y la corrige sólo el superadministrador—.
-- Con columnas allí habría que ensanchar una política ajena o dejar al
-- administrador reabrir la declaración por la REST.
CREATE TABLE IF NOT EXISTS public.ocupacion_de_viviendas (
  vivienda_id          uuid PRIMARY KEY,
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),
  -- La cuenta que se vinculó SIN código cuando la vivienda no tenía ninguna:
  -- es la única que puede declarar, y sólo mientras no haya declaración.
  primer_residente_id  uuid NULL REFERENCES public.usuarios(id),
  declarada_en         timestamptz NULL,
  declarada_por        uuid NULL REFERENCES public.usuarios(id),

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT ocupacion_vivienda_fk FOREIGN KEY (copropiedad_id, vivienda_id)
    REFERENCES public.viviendas(copropiedad_id, id) ON DELETE CASCADE,
  CONSTRAINT ocupacion_declaracion_coherente CHECK ((declarada_en IS NULL) = (declarada_por IS NULL))
);
COMMENT ON TABLE public.ocupacion_de_viviendas IS
  'D6 · el primer residente declara UNA vez cuántos ocupantes hay; después sólo el '
  'superadministrador añade o quita plazas. Una vivienda sin fila aquí no está declarada.';

-- Declarada, la declaración sólo la toca el superadministrador.
CREATE OR REPLACE FUNCTION app.tg_ocupacion_declarada()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.usuario_id() IS NULL OR app.rol() = 'superadministrador' THEN
    RETURN NEW;
  END IF;
  IF OLD.declarada_en IS NOT NULL
     AND (NEW.declarada_en IS DISTINCT FROM OLD.declarada_en
          OR NEW.declarada_por IS DISTINCT FROM OLD.declarada_por
          OR NEW.primer_residente_id IS DISTINCT FROM OLD.primer_residente_id) THEN
    RAISE EXCEPTION 'El número de ocupantes ya se declaró: sólo el superadministrador lo cambia (D6)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_ocupacion_declarada ON public.ocupacion_de_viviendas;
CREATE TRIGGER tg_ocupacion_declarada BEFORE UPDATE ON public.ocupacion_de_viviendas
  FOR EACH ROW EXECUTE FUNCTION app.tg_ocupacion_declarada();

-- 6 · plazas_de_ocupante ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plazas_de_ocupante (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),
  vivienda_id          uuid NOT NULL,
  numero               smallint NOT NULL,
  -- Sube cuando la plaza se libera: el código anterior deja de valer (ADR-025).
  generacion           integer NOT NULL DEFAULT 1,
  usuario_id           uuid NULL REFERENCES public.usuarios(id),
  usada_en             timestamptz NULL,

  estado               estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en       timestamptz NULL,
  desactivado_por      uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT plazas_vivienda_fk FOREIGN KEY (copropiedad_id, vivienda_id)
    REFERENCES public.viviendas(copropiedad_id, id),
  CONSTRAINT plazas_numero_rango CHECK (numero BETWEEN 1 AND 50),
  CONSTRAINT plazas_generacion_positiva CHECK (generacion >= 1),
  CONSTRAINT plazas_uso_coherente CHECK ((usuario_id IS NULL) = (usada_en IS NULL)),
  CONSTRAINT plazas_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT plazas_motivo_len CHECK (motivo_desactivacion IS NULL OR length(motivo_desactivacion) <= 300)
);
-- Dos declaraciones simultáneas chocan aquí en la plaza 1: la base decide (ADR-04).
CREATE UNIQUE INDEX IF NOT EXISTS plazas_numero_uk
  ON public.plazas_de_ocupante (vivienda_id, numero) WHERE estado = 'activo';
-- Una cuenta ocupa como mucho una plaza viva.
CREATE UNIQUE INDEX IF NOT EXISTS plazas_usuario_uk
  ON public.plazas_de_ocupante (usuario_id) WHERE estado = 'activo' AND usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS plazas_por_vivienda_idx
  ON public.plazas_de_ocupante (copropiedad_id, vivienda_id) WHERE estado = 'activo';
COMMENT ON TABLE public.plazas_de_ocupante IS
  'D6 · ADR-025 · una plaza por ocupante declarado. El código de vinculación NO se guarda: '
  'se deriva por HMAC de la plaza y su generación con una llave de la copropiedad.';

-- D6 · una vez declarados, el NÚMERO de ocupantes (plazas vivas) sólo lo cambia
-- el superadministrador. El servicio (la API en nombre del residente) sólo puede
-- crear plazas mientras la vivienda no esté declarada, y ocupar o liberar una.
CREATE OR REPLACE FUNCTION app.tg_plazas_solo_superadministrador()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.usuario_id() IS NULL OR app.rol() = 'superadministrador' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.ocupacion_de_viviendas o
                WHERE o.vivienda_id = NEW.vivienda_id AND o.declarada_en IS NOT NULL) THEN
      RAISE EXCEPTION 'El número de ocupantes ya se declaró: sólo el superadministrador lo cambia (D6)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado OR NEW.numero IS DISTINCT FROM OLD.numero
        OR NEW.vivienda_id IS DISTINCT FROM OLD.vivienda_id THEN
    RAISE EXCEPTION 'Sólo el superadministrador añade o quita ocupantes (D6)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_plazas_solo_superadministrador ON public.plazas_de_ocupante;
CREATE TRIGGER tg_plazas_solo_superadministrador BEFORE INSERT OR UPDATE ON public.plazas_de_ocupante
  FOR EACH ROW EXECUTE FUNCTION app.tg_plazas_solo_superadministrador();

-- 7 · bitacora_de_residentes (SOLO INSERCIÓN) ---------------------------------
CREATE TABLE IF NOT EXISTS public.bitacora_de_residentes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id  uuid NOT NULL REFERENCES public.copropiedades(id),
  ocurrido_en     timestamptz NOT NULL,
  tipo            text NOT NULL,
  usuario_id      uuid NULL REFERENCES public.usuarios(id),
  actor_id        uuid NULL REFERENCES public.usuarios(id),
  -- Sin clave ajena a propósito: una vivienda o un vehículo sin historial se
  -- pueden borrar de verdad (0032, 0034), y su rastro tiene que sobrevivirles.
  vivienda_id     uuid NULL,
  vehiculo_id     uuid NULL,
  detalle         text NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  creado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT bitacora_residentes_tipo CHECK (tipo IN (
    'alta_de_cuenta', 'vinculacion', 'vinculacion_rechazada', 'codigo_incorrecto',
    'vinculacion_bloqueada', 'cambio_de_vivienda', 'ocupantes_declarados',
    'plaza_anadida', 'plaza_retirada', 'vehiculo_propio_registrado',
    'vehiculo_propio_rechazado_por_tope', 'vehiculo_propio_desactivado', 'perfil_editado')),
  CONSTRAINT bitacora_residentes_detalle_len CHECK (detalle IS NULL OR length(detalle) <= 500)
);
CREATE INDEX IF NOT EXISTS bitacora_residentes_copropiedad_idx
  ON public.bitacora_de_residentes (copropiedad_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS bitacora_residentes_usuario_idx
  ON public.bitacora_de_residentes (copropiedad_id, usuario_id, tipo, ocurrido_en DESC);
COMMENT ON TABLE public.bitacora_de_residentes IS
  'ETAPA 15-I · rastro de SOLO INSERCIÓN de altas, vinculaciones (y códigos equivocados, que '
  'cuentan para el límite de intentos), ocupantes y vehículos propios. Mismas tres capas que '
  'eventos (ADR-005). El documento de identidad NUNCA se escribe aquí.';

-- 8 · auditoría, borrado lógico e inmutabilidad --------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vehiculos_ocupantes', 'plazas_de_ocupante', 'ocupacion_de_viviendas'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_auditoria ON public.%I', t);
    EXECUTE format('CREATE TRIGGER tg_auditoria BEFORE INSERT OR UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION app.tg_auditoria()', t);
  END LOOP;
END
$$;
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.plazas_de_ocupante;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.plazas_de_ocupante
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();
DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.bitacora_de_residentes;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.bitacora_de_residentes
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();
DROP TRIGGER IF EXISTS tg_prohibir_update ON public.bitacora_de_residentes;
CREATE TRIGGER tg_prohibir_update BEFORE UPDATE ON public.bitacora_de_residentes
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_update();
ALTER TABLE public.bitacora_de_residentes ENABLE ALWAYS TRIGGER tg_prohibir_update;
ALTER TABLE public.bitacora_de_residentes ENABLE ALWAYS TRIGGER tg_prohibir_delete;

-- 9 · privilegios --------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.vehiculos_ocupantes, public.plazas_de_ocupante,
  public.ocupacion_de_viviendas TO authenticated, service_role;
GRANT SELECT, INSERT ON public.bitacora_de_residentes TO authenticated, service_role;
REVOKE DELETE, TRUNCATE ON public.vehiculos_ocupantes, public.plazas_de_ocupante,
  public.ocupacion_de_viviendas FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.vehiculos_ocupantes, public.plazas_de_ocupante, public.ocupacion_de_viviendas,
  public.bitacora_de_residentes FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.bitacora_de_residentes
  FROM PUBLIC, authenticated, service_role;
DO $$
DECLARE v_dueno text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_mantenimiento') THEN
    EXECUTE 'REVOKE UPDATE, DELETE, TRUNCATE ON public.bitacora_de_residentes FROM app_mantenimiento';
  END IF;
  SELECT pg_get_userbyid(c.relowner) INTO v_dueno
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'bitacora_de_residentes';
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.bitacora_de_residentes FROM %I', v_dueno);
END
$$;

-- 10 · RLS forzada, con política por rol ----------------------------------------
ALTER TABLE public.vehiculos_ocupantes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos_ocupantes    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.plazas_de_ocupante     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plazas_de_ocupante     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_de_residentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_de_residentes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ocupacion_de_viviendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocupacion_de_viviendas FORCE ROW LEVEL SECURITY;

-- ocupación: como las plazas —la API (servicio) y el superadministrador—.
DROP POLICY IF EXISTS ocupacion_lectura   ON public.ocupacion_de_viviendas;
DROP POLICY IF EXISTS ocupacion_insercion ON public.ocupacion_de_viviendas;
DROP POLICY IF EXISTS ocupacion_edicion   ON public.ocupacion_de_viviendas;
CREATE POLICY ocupacion_lectura ON public.ocupacion_de_viviendas FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));
CREATE POLICY ocupacion_insercion ON public.ocupacion_de_viviendas FOR INSERT
  WITH CHECK (app.es_superadmin() OR app.es_servicio(copropiedad_id));
CREATE POLICY ocupacion_edicion ON public.ocupacion_de_viviendas FOR UPDATE
  USING (app.es_superadmin() OR app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_superadmin() OR app.es_servicio(copropiedad_id));

-- vehiculos_ocupantes: como `vehiculos` (0014) — la administración y el
-- residente de ESA vivienda (por el vehículo), más el servicio.
DROP POLICY IF EXISTS vehiculos_ocupantes_lectura   ON public.vehiculos_ocupantes;
DROP POLICY IF EXISTS vehiculos_ocupantes_insercion ON public.vehiculos_ocupantes;
DROP POLICY IF EXISTS vehiculos_ocupantes_edicion   ON public.vehiculos_ocupantes;
CREATE POLICY vehiculos_ocupantes_lectura ON public.vehiculos_ocupantes FOR SELECT
  USING (app.es_superadmin() OR app.puede_leer_operacion(copropiedad_id)
         OR app.es_servicio(copropiedad_id)
         OR EXISTS (SELECT 1 FROM public.vehiculos v
                     WHERE v.id = vehiculos_ocupantes.vehiculo_id
                       AND app.puede_leer_residente(v.copropiedad_id, v.vivienda_id)));
CREATE POLICY vehiculos_ocupantes_insercion ON public.vehiculos_ocupantes FOR INSERT
  WITH CHECK (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
              OR app.es_servicio(copropiedad_id));
CREATE POLICY vehiculos_ocupantes_edicion ON public.vehiculos_ocupantes FOR UPDATE
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
              OR app.es_servicio(copropiedad_id));

-- plazas: las escribe SÓLO la API (servicio) o el superadministrador; ni el
-- administrador ni el residente las tocan por la REST.
DROP POLICY IF EXISTS plazas_lectura   ON public.plazas_de_ocupante;
DROP POLICY IF EXISTS plazas_insercion ON public.plazas_de_ocupante;
DROP POLICY IF EXISTS plazas_edicion   ON public.plazas_de_ocupante;
CREATE POLICY plazas_lectura ON public.plazas_de_ocupante FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));
CREATE POLICY plazas_insercion ON public.plazas_de_ocupante FOR INSERT
  WITH CHECK (app.es_superadmin() OR app.es_servicio(copropiedad_id));
CREATE POLICY plazas_edicion ON public.plazas_de_ocupante FOR UPDATE
  USING (app.es_superadmin() OR app.es_servicio(copropiedad_id))
  WITH CHECK (app.es_superadmin() OR app.es_servicio(copropiedad_id));

-- bitácora: se lee y se inserta; NO hay política de edición (ADR-005).
DROP POLICY IF EXISTS bitacora_residentes_lectura   ON public.bitacora_de_residentes;
DROP POLICY IF EXISTS bitacora_residentes_insercion ON public.bitacora_de_residentes;
CREATE POLICY bitacora_residentes_lectura ON public.bitacora_de_residentes FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));
CREATE POLICY bitacora_residentes_insercion ON public.bitacora_de_residentes FOR INSERT
  WITH CHECK (app.es_superadmin() OR app.es_servicio(copropiedad_id));

-- 11 · P-11 · los dos niveles de acceso de todo conjunto (H-15I-02) ------------
-- La 0013 asigna al residente el nivel más restrictivo y, si la copropiedad no
-- tiene catálogo, RECHAZA el alta. Sólo la semilla sembraba el catálogo: una
-- copropiedad creada con `registrar-copropiedad.mjs` no podía tener residentes.
-- Los dos valores son los que P-11 resolvió (2026-09-06); más niveles se añaden
-- sin migración, como entonces.
DROP POLICY IF EXISTS niveles_acceso_insercion_plataforma ON public.niveles_acceso;
CREATE POLICY niveles_acceso_insercion_plataforma ON public.niveles_acceso FOR INSERT
  WITH CHECK (app.es_superadmin());

CREATE OR REPLACE FUNCTION app.sembrar_niveles_de_acceso(p_copropiedad_id uuid)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.niveles_acceso (copropiedad_id, clave, nombre, descripcion, orden,
                                     permite_autorizar, creado_por, actualizado_por)
  SELECT p_copropiedad_id, v.clave, v.nombre, v.descripcion, v.orden, v.permite_autorizar,
         app.actor_de_sistema(), app.actor_de_sistema()
    FROM (VALUES
      ('solo_ingreso', 'Solo ingreso', 'Entra y sale; no crea autorizaciones de visitante.',
       1::smallint, false),
      ('completo', 'Acceso completo', 'Gestiona vehiculos y autoriza visitantes de su vivienda.',
       2::smallint, true)
    ) AS v(clave, nombre, descripcion, orden, permite_autorizar)
   WHERE NOT EXISTS (SELECT 1 FROM public.niveles_acceso n
                      WHERE n.copropiedad_id = p_copropiedad_id AND n.estado = 'activo')
  ON CONFLICT DO NOTHING;
$$;

CREATE OR REPLACE FUNCTION app.tg_copropiedad_niveles_de_acceso()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app.sembrar_niveles_de_acceso(NEW.id);
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_copropiedad_niveles_de_acceso ON public.copropiedades;
CREATE TRIGGER tg_copropiedad_niveles_de_acceso AFTER INSERT ON public.copropiedades
  FOR EACH ROW EXECUTE FUNCTION app.tg_copropiedad_niveles_de_acceso();

-- Las copropiedades que ya existen sin catálogo lo reciben ahora. Con la
-- identidad de plataforma: la RLS forzada alcanza también al dueño.
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador', 'usuario_id', app.actor_de_sistema(),
                      'copropiedad_id', NULL)::text, true);
  PERFORM app.sembrar_niveles_de_acceso(c.id) FROM public.copropiedades c;
END
$$;

-- 12 · aserciones de despliegue -------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
   WHERE s.nspname = 'public'
     AND c.relname IN ('vehiculos_ocupantes', 'plazas_de_ocupante', 'ocupacion_de_viviendas',
                       'bitacora_de_residentes')
     AND c.relrowsecurity AND c.relforcerowsecurity;
  ASSERT n = 4, format('0038: %s de 4 tablas con RLS forzada', n);

  SELECT count(*) INTO n FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'bitacora_de_residentes'
     AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');
  ASSERT n = 0, format('0038: la bitácora de residentes conserva %s privilegios de escritura', n);

  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'bitacora_de_residentes'
     AND t.tgname IN ('tg_prohibir_update', 'tg_prohibir_delete') AND t.tgenabled = 'A';
  ASSERT n = 2, '0038: la bitácora de residentes sin sus dos disparadores ENABLE ALWAYS';

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'bitacora_de_residentes'
     AND cmd IN ('UPDATE', 'DELETE', 'ALL');
  ASSERT n = 0, '0038: la bitácora de residentes tiene una política de edición';

  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'vehiculos' AND t.tgname = 'tg_tope_vehiculos_propios' AND t.tgenabled <> 'D';
  ASSERT n = 1, '0038: vehiculos sin el disparador del tope (ADR-026)';

  SELECT count(*) INTO n FROM pg_indexes
   WHERE schemaname = 'public' AND indexname IN ('copropiedades_codigo_corto_uk', 'plazas_numero_uk');
  ASSERT n = 2, '0038: faltan los índices únicos del código corto o de las plazas';

  SELECT count(*) INTO n FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'copropiedades' AND t.tgname = 'tg_copropiedad_niveles_de_acceso';
  ASSERT n = 1, '0038: una copropiedad nueva nacería sin niveles de acceso (H-15I-02)';
END
$$;
