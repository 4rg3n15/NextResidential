-- =============================================================================
-- 0003 · Funciones de contexto de sesión y disparadores comunes
--
-- El contexto del tenant se deriva SIEMPRE de los claims del JWT, nunca de un
-- parámetro que el cliente pueda elegir (modelo-datos.md §8.1, C-05).
--
-- En Supabase, auth.jwt() es exactamente
--   current_setting('request.jwt.claims', true)::jsonb
-- PostgREST fija esa variable de sesión en cada petición. Se usa la forma larga
-- para que estas migraciones y su suite de pruebas corran igual sobre una base
-- PostgreSQL vacía, sin depender del esquema `auth` de Supabase.
-- =============================================================================

CREATE OR REPLACE FUNCTION app.claims()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION app.rol()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT app.claims() ->> 'rol';
$$;

CREATE OR REPLACE FUNCTION app.usuario_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(app.claims() ->> 'usuario_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.persona_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(app.claims() ->> 'persona_id', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.copropiedad_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(app.claims() ->> 'copropiedad_id', '')::uuid;
$$;

-- Multi-tenant del operador de central (HU-25, KPI-35).
-- El claim `copropiedades` es un arreglo JSON de identificadores.
CREATE OR REPLACE FUNCTION app.copropiedades()
RETURNS uuid[] LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    ARRAY(SELECT (jsonb_array_elements_text(app.claims() -> 'copropiedades'))::uuid),
    ARRAY[]::uuid[]
  );
$$;

CREATE OR REPLACE FUNCTION app.es_superadmin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app.rol() = 'superadministrador';
$$;

-- Predicado T: la fila pertenece a la copropiedad del token.
CREATE OR REPLACE FUNCTION app.es_mi_copropiedad(p_copropiedad_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_copropiedad_id IS NOT NULL AND p_copropiedad_id = app.copropiedad_id();
$$;

-- Predicado M: alcance multiempresa del operador de central.
CREATE OR REPLACE FUNCTION app.es_copropiedad_atendida(p_copropiedad_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_copropiedad_id IS NOT NULL
     AND ( p_copropiedad_id = app.copropiedad_id()
        OR p_copropiedad_id = ANY (app.copropiedades()) );
$$;

-- Predicado V (app.es_mi_vivienda) se define en la migración 0005, junto a la
-- tabla `residentes` a la que consulta.


-- Validación de zona horaria IANA, usada por un CHECK.
-- Se declara IMMUTABLE a sabiendas: el catálogo de zonas horarias solo cambia
-- al actualizar PostgreSQL o tzdata, nunca durante la vida de una transacción.
-- Un CHECK no admite subconsultas, así que la comprobación contra
-- pg_timezone_names debe encapsularse aquí.
CREATE OR REPLACE FUNCTION app.es_zona_horaria(p text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  PERFORM now() AT TIME ZONE p;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END
$$;

-- Disparador de auditoría (KPI-05) ---------------------------------------------
-- Mantiene actualizado_en / actualizado_por sin que el caso de uso pueda
-- olvidarlo, y protege creado_en / creado_por de ser reescritos.
CREATE OR REPLACE FUNCTION app.tg_auditoria()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.creado_en       := COALESCE(NEW.creado_en, now());
    NEW.creado_por      := COALESCE(NEW.creado_por, app.usuario_id());
    NEW.actualizado_en  := NEW.creado_en;
    NEW.actualizado_por := NEW.creado_por;
  ELSE
    NEW.creado_en       := OLD.creado_en;
    NEW.creado_por      := OLD.creado_por;
    NEW.actualizado_en  := now();
    NEW.actualizado_por := COALESCE(app.usuario_id(), OLD.actualizado_por);
  END IF;
  RETURN NEW;
END
$$;

-- Disparador anti-DELETE (RN-19, CA-02, KPI-04) --------------------------------
-- Segunda barrera. La primera es no conceder DELETE a ningún rol (D-20).
CREATE OR REPLACE FUNCTION app.tg_prohibir_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'Borrado fisico prohibido en %.%: use la baja logica (estado = inactivo). RN-19',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;

-- Utilidad de normalización, usada solo por semillas y verificaciones.
-- La normalización real vive en el objeto de valor del dominio; la base
-- verifica con CHECK y no normaliza (modelo-datos.md §4.1).
CREATE OR REPLACE FUNCTION app.normalizar_placa(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(regexp_replace(COALESCE(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION app.normalizar_documento(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT upper(regexp_replace(COALESCE(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
