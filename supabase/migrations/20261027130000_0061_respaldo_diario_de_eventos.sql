-- =============================================================================
-- 0061 · D-147 · EL RESPALDO DIARIO DE LOS EVENTOS
--
-- Decisión del cliente (27/10): cada día, el Excel de los eventos del día
-- ANTERIOR se envía por correo al superadministrador y queda guardado en
-- Supabase. Esta migración pone la parte de la base:
--
--   1. `respaldos_de_eventos`: una fila por copropiedad y día, con la ruta del
--      fichero en Storage, cuántos eventos lleva y su huella SHA-256. Es la
--      constancia de que el respaldo existe y de qué contiene.
--   2. `envios_de_respaldo`: una fila por INTENTO de envío y por destinatario
--      —enviado, error o sin configurar—. El estado de un envío es su último
--      intento.
--   3. El bucket PRIVADO `respaldo-de-eventos` y su política de lectura.
--
-- [CONTRADICCIÓN] C-68 · el encargo pide en la MISMA tabla, protegida como
-- append-only, «el estado del envío por destinatario (enviado_en o error)».
-- Un envío fallido se reintenta, y registrar el reintento en esa fila exigiría
-- un UPDATE que la protección prohíbe. Resolución: dos tablas, las dos
-- append-only. El respaldo no cambia nunca; cada intento de envío es una fila
-- nueva. Nada se reescribe y la historia de los intentos queda entera.
--
-- Las dos, con las tres capas de `eventos` (ADR-005): REVOKE a todos —dueño
-- incluido—, disparadores que bloquean UPDATE y DELETE, y RLS forzada sin
-- política de UPDATE ni DELETE. Y sin clave ajena entre ellas: una clave ajena
-- HACIA una tabla append-only no se puede comprobar (0021, frontera-append-
-- only); la existencia la garantiza un disparador.
--
-- Este PR sólo LEE `eventos`. El respaldo es una copia: el histórico sigue
-- entero en la aplicación.
--
-- Idempotente. Reversión: supabase/reversion/0061_revert.sql.
-- Prueba: supabase/policies/tests/99q_respaldo_diario.sql.
-- =============================================================================

-- 1 · Los respaldos ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.respaldos_de_eventos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id    uuid NOT NULL REFERENCES public.copropiedades(id),
  -- El día de la copropiedad que cubre (America/Bogota), no el de UTC.
  fecha             date NOT NULL,
  ruta              text NOT NULL,
  numero_de_eventos integer NOT NULL,
  permitidos        integer NOT NULL,
  negados           integer NOT NULL,
  sha256            text NOT NULL,
  tamano_bytes      bigint NOT NULL,
  generado_en       timestamptz NOT NULL DEFAULT now(),
  creado_en         timestamptz NOT NULL DEFAULT now(),
  creado_por        uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT respaldo_un_dia UNIQUE (copropiedad_id, fecha),
  CONSTRAINT respaldo_ruta_unica UNIQUE (ruta),
  CONSTRAINT respaldo_cuentas CHECK (
    numero_de_eventos >= 0 AND permitidos >= 0 AND negados >= 0
    AND permitidos + negados <= numero_de_eventos),
  CONSTRAINT respaldo_sha256 CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT respaldo_tamano CHECK (tamano_bytes > 0),
  -- La ruta la fija el código: <copropiedadId>/<AAAA>/<MM>/eventos-<AAAA-MM-DD>.xls
  CONSTRAINT respaldo_ruta_forma CHECK (
    ruta = copropiedad_id::text || '/' || to_char(fecha, 'YYYY') || '/' || to_char(fecha, 'MM')
           || '/eventos-' || to_char(fecha, 'YYYY-MM-DD') || '.xls')
);

CREATE INDEX IF NOT EXISTS respaldos_recientes_idx
  ON public.respaldos_de_eventos (copropiedad_id, fecha DESC);

COMMENT ON TABLE public.respaldos_de_eventos IS
  'D-147 · una fila por copropiedad y día: el Excel de los eventos de ese día guardado en el '
  'bucket privado respaldo-de-eventos, su número de eventos y su SHA-256. Solo inserción '
  '(ADR-005). Migración 0061.';

-- 2 · Los intentos de envío ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.envios_de_respaldo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id  uuid NOT NULL REFERENCES public.copropiedades(id),
  -- Sin clave ajena: `respaldos_de_eventos` es append-only (ver la cabecera).
  respaldo_id     uuid NOT NULL,
  destinatario_id uuid NOT NULL REFERENCES public.usuarios(id),
  resultado       text NOT NULL,
  -- Por qué falló, sin secretos ni contenido del correo. Nulo si se envió.
  error           text NULL,
  -- Cuándo salió; nulo si no salió.
  enviado_en      timestamptz NULL,
  -- Con enlace firmado en vez de adjunto (fichero de más de 10 MB, RN-21).
  con_enlace      boolean NOT NULL DEFAULT false,
  intentado_en    timestamptz NOT NULL DEFAULT now(),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  creado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT envio_resultado CHECK (resultado IN ('enviado', 'error', 'sin_configurar')),
  CONSTRAINT envio_coherente CHECK (
    (resultado = 'enviado' AND enviado_en IS NOT NULL AND error IS NULL)
    OR (resultado = 'error' AND enviado_en IS NULL AND error IS NOT NULL)
    OR (resultado = 'sin_configurar' AND enviado_en IS NULL)),
  CONSTRAINT envio_error_len CHECK (error IS NULL OR length(error) BETWEEN 1 AND 500),
  CONSTRAINT envio_error_sin_control CHECK (
    error IS NULL OR error !~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]')
);

CREATE INDEX IF NOT EXISTS envios_por_respaldo_idx
  ON public.envios_de_respaldo (respaldo_id, destinatario_id, intentado_en DESC);
CREATE INDEX IF NOT EXISTS envios_por_copropiedad_idx
  ON public.envios_de_respaldo (copropiedad_id, intentado_en DESC);

COMMENT ON TABLE public.envios_de_respaldo IS
  'D-147 · una fila por intento de envío de un respaldo y por destinatario: enviado, error o '
  'sin configurar. El estado es el último intento; un fallo se reintenta con una fila nueva. '
  'Solo inserción (ADR-005, C-68). Migración 0061.';

-- El respaldo existe y es de la MISMA copropiedad (sustituye a la clave ajena).
CREATE OR REPLACE FUNCTION app.tg_envio_respaldo_existe()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.respaldos_de_eventos
     WHERE id = NEW.respaldo_id AND copropiedad_id = NEW.copropiedad_id
  ) THEN
    RAISE EXCEPTION 'El envío referencia un respaldo inexistente en esta copropiedad (%)',
      NEW.respaldo_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_envio_respaldo_existe ON public.envios_de_respaldo;
CREATE TRIGGER tg_envio_respaldo_existe
  BEFORE INSERT ON public.envios_de_respaldo
  FOR EACH ROW EXECUTE FUNCTION app.tg_envio_respaldo_existe();

-- 3 · Solo inserción: disparadores, privilegios y RLS, en las dos tablas -------
DO $$
DECLARE
  v_tabla text;
  v_dueno text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY['respaldos_de_eventos', 'envios_de_respaldo'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.%I', v_tabla);
    EXECUTE format('CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete()', v_tabla);
    EXECUTE format('DROP TRIGGER IF EXISTS tg_prohibir_update ON public.%I', v_tabla);
    EXECUTE format('CREATE TRIGGER tg_prohibir_update BEFORE UPDATE ON public.%I '
                   'FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_update()', v_tabla);
    EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER tg_prohibir_update', v_tabla);
    EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER tg_prohibir_delete', v_tabla);

    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated, service_role', v_tabla);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_tabla);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I '
                   'FROM PUBLIC, authenticated, service_role', v_tabla);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_mantenimiento') THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM app_mantenimiento', v_tabla);
    END IF;
    SELECT pg_get_userbyid(c.relowner) INTO v_dueno
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = v_tabla;
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM %I', v_tabla, v_dueno);

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_tabla);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_tabla);
  END LOOP;
END
$$;

-- Lectura: la superadministración, la administración DE ESA copropiedad y su
-- servicio. Escritura: SÓLO el servicio (el trabajo programado). Ni UPDATE ni
-- DELETE: no hay política para ellos.
DROP POLICY IF EXISTS respaldos_lectura   ON public.respaldos_de_eventos;
DROP POLICY IF EXISTS respaldos_insercion ON public.respaldos_de_eventos;
CREATE POLICY respaldos_lectura ON public.respaldos_de_eventos FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));
CREATE POLICY respaldos_insercion ON public.respaldos_de_eventos FOR INSERT
  WITH CHECK (app.es_servicio(copropiedad_id));

DROP POLICY IF EXISTS envios_lectura   ON public.envios_de_respaldo;
DROP POLICY IF EXISTS envios_insercion ON public.envios_de_respaldo;
CREATE POLICY envios_lectura ON public.envios_de_respaldo FOR SELECT
  USING (app.es_superadmin() OR app.puede_administrar(copropiedad_id)
         OR app.es_servicio(copropiedad_id));
CREATE POLICY envios_insercion ON public.envios_de_respaldo FOR INSERT
  WITH CHECK (app.es_servicio(copropiedad_id));

-- 4 · El bucket privado y su política de lectura -------------------------------
-- Sólo donde existe Storage (Supabase, y el doble de `verificar.sh`). El bucket
-- es PRIVADO: el fichero se descarga por URL firmada de vida corta (RN-21).
-- La política es de SÓLO LECTURA: escribe únicamente la API con la llave
-- secreta. El primer tramo de la ruta es el `copropiedad_id`; se comprueba su
-- forma antes de convertirlo, para que un nombre extraño no rompa la consulta.
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE '0061: sin esquema storage; el bucket respaldo-de-eventos se crea donde exista';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public)
  VALUES ('respaldo-de-eventos', 'respaldo-de-eventos', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

  EXECUTE 'DROP POLICY IF EXISTS respaldo_de_eventos_lectura ON storage.objects';
  EXECUTE $p$
    CREATE POLICY respaldo_de_eventos_lectura ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'respaldo-de-eventos'
        AND CASE
              WHEN split_part(name, '/', 1)
                   ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN app.es_superadmin()
                   OR app.puede_administrar(split_part(name, '/', 1)::uuid)
              ELSE false
            END
      )
  $p$;
END
$$;

-- 5 · Aserción de despliegue ----------------------------------------------------
DO $$
DECLARE
  n int;
  detalle text;
BEGIN
  -- (a) Nadie —dueño incluido— conserva UPDATE, DELETE ni TRUNCATE.
  SELECT count(*), coalesce(string_agg(DISTINCT grantee || ':' || table_name || ':' || privilege_type, ', '), '')
    INTO n, detalle
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name IN ('respaldos_de_eventos', 'envios_de_respaldo')
     AND privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE');
  IF n > 0 THEN
    RAISE EXCEPTION '0061: ADR-005 incumplido en los respaldos (%)', detalle;
  END IF;

  -- (b) Los dos disparadores, HABILITADOS (no basta con que existan).
  SELECT count(*) INTO n
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname IN ('respaldos_de_eventos', 'envios_de_respaldo')
     AND t.tgname IN ('tg_prohibir_update', 'tg_prohibir_delete')
     AND t.tgenabled <> 'D';
  IF n <> 4 THEN
    RAISE EXCEPTION '0061: % de 4 disparadores append-only activos en los respaldos', n;
  END IF;

  -- (c) RLS forzada en las dos.
  SELECT count(*) INTO n FROM pg_class
   WHERE oid IN ('public.respaldos_de_eventos'::regclass, 'public.envios_de_respaldo'::regclass)
     AND relrowsecurity AND relforcerowsecurity;
  IF n <> 2 THEN
    RAISE EXCEPTION '0061: la RLS de los respaldos no está forzada';
  END IF;

  -- (d) El bucket, si hay Storage, es privado.
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM storage.buckets WHERE id = $1 AND public IS NOT TRUE'
      INTO n USING 'respaldo-de-eventos';
    IF n <> 1 THEN
      RAISE EXCEPTION '0061: el bucket respaldo-de-eventos falta o es público (RN-21)';
    END IF;
  END IF;
END
$$;
