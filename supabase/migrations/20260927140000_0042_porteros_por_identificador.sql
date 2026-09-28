-- ─────────────────────────────────────────────────────────────────────────────
-- 0042 · ETAPA 15-L (H) · PORTEROS POR IDENTIFICADOR, LISTA BLANCA DE IP Y
-- MODO PRUEBAS · ADR-031 (deroga ADR-023)
--
-- 1 · POOLS DE IDENTIFICADORES POR COPROPIEDAD (H1). La copropiedad n recibe
--     [n·1000+1, n·1000+999]: la 1 del 1001 al 1999, la 10 del 10001 al 10999.
--     El 0001–0999 queda reservado. Una restricción de EXCLUSIÓN impide el
--     solape en la base, y el pool se asigna al crear la copropiedad, por
--     disparador. La copropiedad de un identificador se resuelve SIEMPRE
--     consultando esta tabla, nunca con aritmética en el código.
-- 2 · EL IDENTIFICADOR DEL PORTERO (H2). `usuarios.numero_de_portero`, único
--     en toda la plataforma, inmutable una vez puesto y nunca reutilizado: el
--     contador del pool sólo avanza. Se asigna con el pool BLOQUEADO en la misma
--     transacción que crea la cuenta (ADR-04): dos altas simultáneas no pueden
--     llevarse el mismo número, y el cupo de porteros activos se comprueba bajo
--     ese mismo bloqueo.
-- 3 · DÓNDE PUEDE ENTRAR UN PORTERO (H4): las IP del computador de portería y
--     las permitidas para guardia remota, por copropiedad, sólo el
--     superadministrador las cambia (el disparador de ajustes de plataforma).
-- 4 · MODO PRUEBAS (H5): un interruptor global, ACTIVO por omisión en esta
--     entrega. La API lo relee sin reiniciar.
-- 5 · SESIONES ACTIVAS DEL SUPERADMINISTRADOR (H4 b): de dónde está conectado,
--     para la regla de transición con la lista remota vacía.
-- 6 · Bloqueo temporal por (IP, identificador) (H5): los intentos fallidos se
--     registran en `auditoria_seguridad` (`login_fallido`) y se cuentan ahí.
-- 7 · La BAJA de un portero queda en la bitácora de portería (H2): su número
--     sigue ocupado para siempre.
--
-- Idempotente. Reversión: supabase/reversion/0042_revert.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 · pools_de_porteros --------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.pools_de_porteros_numero_seq AS integer START 1;

CREATE TABLE IF NOT EXISTS public.pools_de_porteros (
  copropiedad_id  uuid PRIMARY KEY REFERENCES public.copropiedades(id),
  numero          integer  NOT NULL,
  inicio          integer  NOT NULL,
  fin             integer  NOT NULL,
  -- El próximo identificador que se asignará. Sólo avanza.
  siguiente       integer  NOT NULL,
  -- Porteros ACTIVOS que admite la copropiedad (H2). 999 = el pool entero.
  cupo            smallint NOT NULL DEFAULT 999,

  creado_en       timestamptz NOT NULL DEFAULT now(),
  creado_por      uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT pools_de_porteros_numero_uk UNIQUE (numero),
  CONSTRAINT pools_de_porteros_numero_positivo CHECK (numero >= 1),
  -- 0001–0999 reservado: ningún pool empieza por debajo de 1001.
  CONSTRAINT pools_de_porteros_reservado CHECK (inicio >= 1001),
  CONSTRAINT pools_de_porteros_tamano CHECK (fin - inicio = 998),
  CONSTRAINT pools_de_porteros_siguiente CHECK (siguiente BETWEEN inicio AND fin + 1),
  CONSTRAINT pools_de_porteros_cupo CHECK (cupo BETWEEN 0 AND 999),
  CONSTRAINT pools_de_porteros_sin_solape
    EXCLUDE USING gist (int4range(inicio, fin, '[]') WITH &&)
);
COMMENT ON TABLE public.pools_de_porteros IS
  'H1 (15-L) · ADR-031 · rango de identificadores de portero de cada copropiedad. Sin solapes '
  '(exclusión). La copropiedad de un identificador se resuelve por esta tabla.';

CREATE OR REPLACE FUNCTION app.tg_pool_de_porteros()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  n     integer := nextval('public.pools_de_porteros_numero_seq');
  actor uuid    := coalesce(app.usuario_id(), app.actor_de_sistema());
BEGIN
  INSERT INTO public.pools_de_porteros
    (copropiedad_id, numero, inicio, fin, siguiente, creado_por, actualizado_por)
  VALUES (NEW.id, n, n * 1000 + 1, n * 1000 + 999, n * 1000 + 1, actor, actor);
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_pool_de_porteros ON public.copropiedades;
CREATE TRIGGER tg_pool_de_porteros AFTER INSERT ON public.copropiedades
  FOR EACH ROW EXECUTE FUNCTION app.tg_pool_de_porteros();

GRANT SELECT, INSERT, UPDATE ON public.pools_de_porteros TO authenticated, service_role;
REVOKE ALL ON public.pools_de_porteros FROM anon;
REVOKE DELETE, TRUNCATE ON public.pools_de_porteros FROM PUBLIC, authenticated, service_role;
GRANT USAGE ON SEQUENCE public.pools_de_porteros_numero_seq TO authenticated, service_role;

ALTER TABLE public.pools_de_porteros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pools_de_porteros FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pools_de_porteros_lectura   ON public.pools_de_porteros;
DROP POLICY IF EXISTS pools_de_porteros_insercion ON public.pools_de_porteros;
DROP POLICY IF EXISTS pools_de_porteros_edicion   ON public.pools_de_porteros;
-- Lo lee el superadministrador (alta, cupo, inicio de sesión por identificador)
-- y la administración de la copropiedad (ver su propio rango).
CREATE POLICY pools_de_porteros_lectura ON public.pools_de_porteros FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id));
CREATE POLICY pools_de_porteros_insercion ON public.pools_de_porteros FOR INSERT
  WITH CHECK (app.es_superadmin());
CREATE POLICY pools_de_porteros_edicion ON public.pools_de_porteros FOR UPDATE
  USING (app.es_superadmin()) WITH CHECK (app.es_superadmin());

-- Las copropiedades que ya existían reciben su pool, en el orden en que se
-- crearon: la primera, el 1001–1999.
DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador', 'usuario_id', app.actor_de_sistema())::text,
    true);
  FOR r IN
    SELECT c.id FROM public.copropiedades c
     WHERE NOT EXISTS (SELECT 1 FROM public.pools_de_porteros p WHERE p.copropiedad_id = c.id)
     ORDER BY c.creado_en, c.id
  LOOP
    INSERT INTO public.pools_de_porteros
      (copropiedad_id, numero, inicio, fin, siguiente, creado_por, actualizado_por)
    SELECT r.id, n, n * 1000 + 1, n * 1000 + 999, n * 1000 + 1,
           app.actor_de_sistema(), app.actor_de_sistema()
      FROM (SELECT nextval('public.pools_de_porteros_numero_seq')::integer AS n) s;
  END LOOP;
END
$$;

-- 2 · el identificador del portero ----------------------------------------------
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS numero_de_portero integer NULL;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_numero_de_portero_rango;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_numero_de_portero_rango
  CHECK (numero_de_portero IS NULL OR numero_de_portero >= 1001);
-- Único en TODA la plataforma y para siempre: la fila del usuario no se borra
-- (RN-19), así que un número dado de baja sigue ocupado.
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_numero_de_portero_uk
  ON public.usuarios (numero_de_portero) WHERE numero_de_portero IS NOT NULL;
COMMENT ON COLUMN public.usuarios.numero_de_portero IS
  'H2 (15-L) · ADR-031 · identificador de acceso del portero. Del pool de su copropiedad; '
  'inmutable y nunca reutilizado: los eventos que se le atribuyen señalan siempre a la misma persona.';

-- Inmutable, y del pool de SU copropiedad.
CREATE OR REPLACE FUNCTION app.tg_numero_de_portero()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.numero_de_portero IS NOT NULL
     AND NEW.numero_de_portero IS DISTINCT FROM OLD.numero_de_portero THEN
    RAISE EXCEPTION 'El identificador de un portero no cambia nunca (ADR-031)'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.numero_de_portero IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pools_de_porteros p
     WHERE p.copropiedad_id = NEW.copropiedad_id
       AND NEW.numero_de_portero BETWEEN p.inicio AND p.fin
  ) THEN
    RAISE EXCEPTION 'El identificador % no pertenece al pool de su copropiedad', NEW.numero_de_portero
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_numero_de_portero ON public.usuarios;
CREATE TRIGGER tg_numero_de_portero BEFORE INSERT OR UPDATE OF numero_de_portero
  ON public.usuarios FOR EACH ROW EXECUTE FUNCTION app.tg_numero_de_portero();

/**
 * El siguiente identificador del pool, con el pool BLOQUEADO hasta el final
 * de la transacción que lo pide —la misma que crea la fila del usuario—.
 * Rechaza con SQLSTATE propio: `NCP01` cupo alcanzado, `NCP02` pool agotado,
 * `NCP03` copropiedad sin pool.
 */
CREATE OR REPLACE FUNCTION app.asignar_numero_de_portero(p_copropiedad_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  v_pool    public.pools_de_porteros%ROWTYPE;
  v_activos integer;
BEGIN
  SELECT * INTO v_pool FROM public.pools_de_porteros
   WHERE copropiedad_id = p_copropiedad_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La copropiedad no tiene pool de identificadores de portero'
      USING ERRCODE = 'NCP03';
  END IF;
  SELECT count(*) INTO v_activos
    FROM public.roles_usuario r
   WHERE r.copropiedad_id = p_copropiedad_id AND r.rol = 'portero' AND r.estado = 'activo';
  IF v_activos >= v_pool.cupo THEN
    RAISE EXCEPTION 'Cupo de porteros alcanzado (% de %)', v_activos, v_pool.cupo
      USING ERRCODE = 'NCP01';
  END IF;
  IF v_pool.siguiente > v_pool.fin THEN
    RAISE EXCEPTION 'El pool de identificadores de la copropiedad está agotado'
      USING ERRCODE = 'NCP02';
  END IF;
  UPDATE public.pools_de_porteros
     SET siguiente = siguiente + 1,
         actualizado_en = now(),
         actualizado_por = coalesce(app.usuario_id(), app.actor_de_sistema())
   WHERE copropiedad_id = p_copropiedad_id;
  RETURN v_pool.siguiente;
END
$$;
REVOKE EXECUTE ON FUNCTION app.asignar_numero_de_portero(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.asignar_numero_de_portero(uuid) TO authenticated, service_role;

-- Los porteros que ya existían reciben su identificador, en orden de alta.
DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador', 'usuario_id', app.actor_de_sistema())::text,
    true);
  FOR r IN
    SELECT u.id, u.copropiedad_id FROM public.usuarios u
     WHERE u.numero_de_portero IS NULL AND u.copropiedad_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.roles_usuario x
                    WHERE x.usuario_id = u.id AND x.rol = 'portero')
     ORDER BY u.creado_en, u.id
  LOOP
    UPDATE public.pools_de_porteros
       SET siguiente = siguiente + 1
     WHERE copropiedad_id = r.copropiedad_id AND siguiente <= fin;
    UPDATE public.usuarios u
       SET numero_de_portero = p.siguiente - 1
      FROM public.pools_de_porteros p
     WHERE u.id = r.id AND p.copropiedad_id = r.copropiedad_id;
  END LOOP;
END
$$;

-- El documento del portero (H2): lo registra el superadministrador.
ALTER TABLE public.perfiles_de_portero ADD COLUMN IF NOT EXISTS documento text NULL;
ALTER TABLE public.perfiles_de_portero DROP CONSTRAINT IF EXISTS perfiles_portero_documento_formato;
ALTER TABLE public.perfiles_de_portero ADD CONSTRAINT perfiles_portero_documento_formato
  CHECK (documento IS NULL OR documento ~ '^[0-9A-Z-]{3,20}$');

-- 3 · dónde puede entrar un portero --------------------------------------------
ALTER TABLE public.copropiedades
  ADD COLUMN IF NOT EXISTS ips_porteria       inet[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ips_guardia_remota inet[] NOT NULL DEFAULT '{}';
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_ips_porteria_cuantas;
ALTER TABLE public.copropiedades ADD CONSTRAINT copropiedades_ips_porteria_cuantas
  CHECK (cardinality(ips_porteria) <= 20);
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_ips_guardia_remota_cuantas;
ALTER TABLE public.copropiedades ADD CONSTRAINT copropiedades_ips_guardia_remota_cuantas
  CHECK (cardinality(ips_guardia_remota) <= 50);
COMMENT ON COLUMN public.copropiedades.ips_porteria IS
  'H4 (15-L) · IP (o red CIDR) del computador de portería: la consola presencial del portero.';
COMMENT ON COLUMN public.copropiedades.ips_guardia_remota IS
  'H4 (15-L) · IP o redes CIDR desde las que un portero puede hacer guardia remota. Vacía: '
  'sólo desde la IP de una sesión activa de superadministrador (regla de transición).';

-- Los dos ajustes son de PLATAFORMA, como el código y el teléfono (0038).
CREATE OR REPLACE FUNCTION app.tg_copropiedad_ajustes_de_plataforma()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.usuario_id() IS NULL OR app.rol() = 'superadministrador' THEN
    RETURN NEW;
  END IF;
  IF NEW.codigo_corto IS DISTINCT FROM OLD.codigo_corto
     OR NEW.telefono_porteria IS DISTINCT FROM OLD.telefono_porteria
     OR NEW.tope_vehiculos_propios IS DISTINCT FROM OLD.tope_vehiculos_propios
     OR NEW.aprobacion_de_terceros IS DISTINCT FROM OLD.aprobacion_de_terceros
     OR NEW.ips_porteria IS DISTINCT FROM OLD.ips_porteria
     OR NEW.ips_guardia_remota IS DISTINCT FROM OLD.ips_guardia_remota THEN
    RAISE EXCEPTION 'Código de acceso, teléfono de portería, tope de vehículos, aprobación y '
                    'las IP de los porteros los cambia sólo el superadministrador (D1, D5, D7, H4)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

-- 4 · modo pruebas -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ajustes_globales (
  -- Una sola fila.
  id              boolean PRIMARY KEY DEFAULT true,
  modo_pruebas    boolean NOT NULL DEFAULT true,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  creado_por      uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid NOT NULL REFERENCES public.usuarios(id),
  CONSTRAINT ajustes_globales_una_fila CHECK (id)
);
COMMENT ON TABLE public.ajustes_globales IS
  'H5 (15-L) · ajustes de toda la plataforma. modo_pruebas: las restricciones de porteros se '
  'evalúan y se registran como «habría sido rechazado» sin bloquear.';

GRANT SELECT, UPDATE ON public.ajustes_globales TO authenticated, service_role;
REVOKE ALL ON public.ajustes_globales FROM anon;
REVOKE INSERT, DELETE, TRUNCATE ON public.ajustes_globales FROM PUBLIC, authenticated, service_role;
ALTER TABLE public.ajustes_globales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ajustes_globales FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ajustes_globales_lectura ON public.ajustes_globales;
DROP POLICY IF EXISTS ajustes_globales_edicion ON public.ajustes_globales;
DROP POLICY IF EXISTS ajustes_globales_alta    ON public.ajustes_globales;
-- Todo el que tiene sesión lo lee: la franja «Modo pruebas activo» la ve todo
-- el mundo. Sólo el superadministrador lo cambia.
CREATE POLICY ajustes_globales_lectura ON public.ajustes_globales FOR SELECT
  USING (app.usuario_id() IS NOT NULL);
CREATE POLICY ajustes_globales_edicion ON public.ajustes_globales FOR UPDATE
  USING (app.es_superadmin()) WITH CHECK (app.es_superadmin());
CREATE POLICY ajustes_globales_alta ON public.ajustes_globales FOR INSERT
  WITH CHECK (app.es_superadmin());

DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol', 'superadministrador', 'usuario_id', app.actor_de_sistema())::text,
    true);
  INSERT INTO public.ajustes_globales (id, modo_pruebas, creado_por, actualizado_por)
  VALUES (true, true, app.actor_de_sistema(), app.actor_de_sistema())
  ON CONFLICT (id) DO NOTHING;
END
$$;

-- 5 · sesiones activas del superadministrador -------------------------------------
CREATE TABLE IF NOT EXISTS public.sesiones_de_superadministrador (
  -- El `session_id` de Supabase.
  sesion_id         uuid PRIMARY KEY,
  usuario_id        uuid NOT NULL REFERENCES public.usuarios(id),
  ip                inet NOT NULL,
  iniciada_en       timestamptz NOT NULL DEFAULT now(),
  ultima_actividad  timestamptz NOT NULL DEFAULT now(),
  cerrada_en        timestamptz NULL,
  creado_en         timestamptz NOT NULL DEFAULT now(),
  creado_por        uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  actualizado_por   uuid NOT NULL REFERENCES public.usuarios(id)
);
CREATE INDEX IF NOT EXISTS sesiones_de_superadministrador_activas_idx
  ON public.sesiones_de_superadministrador (ip, ultima_actividad DESC) WHERE cerrada_en IS NULL;
COMMENT ON TABLE public.sesiones_de_superadministrador IS
  'H4 b (15-L) · desde qué IP tiene sesión abierta un superadministrador. Con la lista remota '
  'vacía, un portero puede entrar desde la IP de una de estas sesiones.';

GRANT SELECT, INSERT, UPDATE ON public.sesiones_de_superadministrador TO authenticated, service_role;
REVOKE ALL ON public.sesiones_de_superadministrador FROM anon;
REVOKE DELETE, TRUNCATE ON public.sesiones_de_superadministrador
  FROM PUBLIC, authenticated, service_role;
ALTER TABLE public.sesiones_de_superadministrador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_de_superadministrador FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sesiones_de_superadministrador_todo ON public.sesiones_de_superadministrador;
CREATE POLICY sesiones_de_superadministrador_todo ON public.sesiones_de_superadministrador
  FOR ALL USING (app.es_superadmin()) WITH CHECK (app.es_superadmin());

-- 6 · intentos fallidos, contados por (IP, identificador) ------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'tipo_evento_seguridad' AND e.enumlabel = 'restriccion_de_ip'
  ) THEN
    ALTER TYPE public.tipo_evento_seguridad ADD VALUE 'restriccion_de_ip';
  END IF;
END
$$;
-- Un inicio de sesión fallido es un 401: el catálogo de resultados no lo tenía
-- porque hasta la 15-L nadie escribía `login_fallido`.
ALTER TABLE public.auditoria_seguridad DROP CONSTRAINT IF EXISTS auditoria_resultado_valores;
ALTER TABLE public.auditoria_seguridad ADD CONSTRAINT auditoria_resultado_valores
  CHECK (resultado IN ('401','403','404','409','429','permitido'));
CREATE INDEX IF NOT EXISTS auditoria_intentos_fallidos_idx
  ON public.auditoria_seguridad (ip, identificador_solicitado, ocurrido_en DESC)
  WHERE tipo = 'login_fallido';

-- 7 · la baja de un portero en la bitácora ------------------------------------------
ALTER TABLE public.bitacora_de_porteria DROP CONSTRAINT IF EXISTS bitacora_porteria_tipo;
ALTER TABLE public.bitacora_de_porteria ADD CONSTRAINT bitacora_porteria_tipo CHECK (tipo IN (
  'inicio_de_sesion', 'acceso_rechazado', 'cierre_de_sesion',
  'inicio_de_patrullaje', 'fin_de_patrullaje', 'codigo_incorrecto',
  'turno_asignado', 'turno_extra', 'turno_editado', 'turno_retirado', 'solape_de_turno',
  'alta_de_portero', 'edicion_de_portero', 'baja_de_portero',
  'restablecimiento_de_contrasena', 'cambio_de_contrasena'));
