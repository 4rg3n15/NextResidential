-- =============================================================================
-- 0005 · Padrón
-- Agregado raíz: Vivienda (viviendas + residentes + vehiculos)
-- Entidad de identidad compartida: personas (decisión D-01)
-- Agregado raíz: ListaNegra (decisión C-02)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- personas — decisión D-01
--
-- No está en el mínimo de CLAUDE.md §6. Se añade porque sin ella RN-06 es
-- inaplicable: si los datos del visitante vivieran embebidos como texto en
-- `autorizaciones` y los del acompañante en otra tabla, la misma persona sería
-- tres cadenas sin relación, y la lista negra la detendría como visitante
-- principal mientras la deja pasar como acompañante.
--
-- Es por copropiedad, no global: un registro global cruzaría la frontera del
-- tenant (RN-15) y convertiría el padrón en dato compartido entre clientes.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),
  tipo_documento       tipo_documento NOT NULL,
  numero_documento     text NOT NULL,
  nombre_completo      text NOT NULL,
  telefono             text NULL,
  correo               citext NULL,

  estado               estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en       timestamptz NULL,
  desactivado_por      uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT personas_documento_normalizado CHECK (numero_documento ~ '^[A-Z0-9]{4,20}$'),
  CONSTRAINT personas_nombre_len   CHECK (length(nombre_completo) BETWEEN 1 AND 200),
  CONSTRAINT personas_sin_control  CHECK (nombre_completo !~ '[\x00-\x1F\x7F]'),
  CONSTRAINT personas_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT personas_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS personas_documento_uk
  ON public.personas (copropiedad_id, tipo_documento, numero_documento) WHERE estado = 'activo';

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_persona_fk,
  ADD  CONSTRAINT usuarios_persona_fk FOREIGN KEY (persona_id) REFERENCES public.personas(id);

COMMENT ON TABLE public.personas IS
  'Identidad compartida por residentes, visitantes y acompanantes. Decision D-01: '
  'sin ella, RN-06 tiene una fuga por acompanantes.';

-- -----------------------------------------------------------------------------
-- viviendas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.viviendas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id         uuid NOT NULL REFERENCES public.copropiedades(id),
  identificador          text NOT NULL,
  manzana                text NULL,
  direccion              text NULL,

  -- Supuesto S-01: leido por el motor de reglas, nunca calculado por Next Control.
  -- El PDF del reto incluye "estado administrativo" entre las dimensiones del
  -- motor; el alcance excluye facturacion y cartera.
  estado_administrativo  estado_administrativo NOT NULL DEFAULT 'al_dia',

  estado                 estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en         timestamptz NULL,
  desactivado_por        uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion   text NULL,

  creado_en              timestamptz NOT NULL DEFAULT now(),
  creado_por             uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_por        uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT viviendas_identificador_len CHECK (length(identificador) BETWEEN 1 AND 60),
  CONSTRAINT viviendas_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT viviendas_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS viviendas_identificador_uk
  ON public.viviendas (copropiedad_id, identificador) WHERE estado = 'activo';

-- -----------------------------------------------------------------------------
-- niveles_acceso — resolución de P-11
--
-- Catálogo, no booleano y no enumerado: el usuario decidió que arranque con dos
-- valores pero pueda crecer sin migración. `orden` ascendente = de más
-- restrictivo a más permisivo; el disparador de la migración 0013 asigna el de
-- menor `orden` cuando el residente no trae nivel, que es el más restrictivo.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.niveles_acceso (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),
  clave                text NOT NULL,
  nombre               text NOT NULL,
  descripcion          text NULL,
  orden                smallint NOT NULL,
  permite_autorizar    boolean NOT NULL DEFAULT false,

  estado               estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en       timestamptz NULL,
  desactivado_por      uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT niveles_acceso_clave_formato CHECK (clave ~ '^[a-z][a-z0-9_]{2,30}$'),
  CONSTRAINT niveles_acceso_orden_positivo CHECK (orden > 0),
  CONSTRAINT niveles_acceso_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT niveles_acceso_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS niveles_acceso_clave_uk
  ON public.niveles_acceso (copropiedad_id, clave) WHERE estado = 'activo';
CREATE UNIQUE INDEX IF NOT EXISTS niveles_acceso_orden_uk
  ON public.niveles_acceso (copropiedad_id, orden) WHERE estado = 'activo';

COMMENT ON TABLE public.niveles_acceso IS
  'Catalogo de niveles de acceso del residente (P-11). Arranca con dos valores '
  'sembrados; admite mas sin migracion. orden ascendente = mas restrictivo primero.';

-- -----------------------------------------------------------------------------
-- residentes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.residentes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),

  -- KPI-01 estructural: no existe residente sin vivienda.
  vivienda_id          uuid NOT NULL,
  persona_id           uuid NOT NULL,
  nivel_acceso_id      uuid NULL,   -- lo completa el disparador con el mas restrictivo

  parentesco           text NULL,
  es_titular           boolean NOT NULL DEFAULT false,

  estado               estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en       timestamptz NULL,
  desactivado_por      uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT residentes_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  -- Claves foraneas compuestas (decision D-06): hacen imposible que un hijo
  -- apunte a un padre de otro tenant.
  CONSTRAINT residentes_vivienda_fk FOREIGN KEY (copropiedad_id, vivienda_id)
    REFERENCES public.viviendas(copropiedad_id, id),
  CONSTRAINT residentes_persona_fk  FOREIGN KEY (copropiedad_id, persona_id)
    REFERENCES public.personas(copropiedad_id, id),
  CONSTRAINT residentes_nivel_fk    FOREIGN KEY (copropiedad_id, nivel_acceso_id)
    REFERENCES public.niveles_acceso(copropiedad_id, id),
  CONSTRAINT residentes_tenant_uk UNIQUE (copropiedad_id, id)
);

-- Supuesto S-08: una persona es residente de una sola vivienda activa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS residentes_persona_uk
  ON public.residentes (copropiedad_id, persona_id) WHERE estado = 'activo';
CREATE INDEX IF NOT EXISTS residentes_por_vivienda_idx
  ON public.residentes (copropiedad_id, vivienda_id) WHERE estado = 'activo';

-- -----------------------------------------------------------------------------
-- Predicado V de RLS. Se define aquí porque consulta `residentes`.
-- Justificación de SECURITY DEFINER en el encabezado de la migración 0003.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.es_mi_vivienda(p_vivienda_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.residentes r
     WHERE r.vivienda_id    = p_vivienda_id
       AND r.persona_id     = app.persona_id()
       AND r.copropiedad_id = app.copropiedad_id()
       AND r.estado         = 'activo'
  );
$$;

REVOKE ALL ON FUNCTION app.es_mi_vivienda(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.es_mi_vivienda(uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- vehiculos — ADR-004
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vehiculos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),
  vivienda_id          uuid NOT NULL,
  persona_id           uuid NULL,
  placa                text NOT NULL,
  marca                text NULL,
  modelo               text NULL,
  color                text NULL,
  es_principal         boolean NOT NULL DEFAULT false,

  estado               estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en       timestamptz NULL,
  desactivado_por      uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  -- La normalizacion vive en el VO Placa; la base la verifica (modelo-datos §4.1).
  CONSTRAINT vehiculos_placa_normalizada CHECK (placa ~ '^[A-Z0-9]{5,8}$'),
  CONSTRAINT vehiculos_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT vehiculos_vivienda_fk FOREIGN KEY (copropiedad_id, vivienda_id)
    REFERENCES public.viviendas(copropiedad_id, id),
  CONSTRAINT vehiculos_persona_fk  FOREIGN KEY (copropiedad_id, persona_id)
    REFERENCES public.personas(copropiedad_id, id),
  CONSTRAINT vehiculos_tenant_uk UNIQUE (copropiedad_id, id)
);

-- ===== ADR-004 · RN-04 · CA-03 · KPI-02 · KPI-03 =============================
-- Una placa activa por copropiedad. Es esta linea, y no un SELECT previo en el
-- caso de uso, lo que garantiza 0 duplicados en 100 inserciones simultaneas.
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS vehiculos_placa_activa_uk
  ON public.vehiculos (copropiedad_id, placa) WHERE estado = 'activo';

CREATE INDEX IF NOT EXISTS vehiculos_por_vivienda_idx
  ON public.vehiculos (copropiedad_id, vivienda_id) WHERE estado = 'activo';

-- -----------------------------------------------------------------------------
-- visitantes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.visitantes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),
  persona_id           uuid NOT NULL,
  empresa              text NULL,
  -- Decision D-03: la categoria del visitante es un eje distinto del tipo de
  -- autorizacion. Un contratista puede tener autorizacion unica o recurrente.
  categoria            categoria_visitante NOT NULL DEFAULT 'visitante',

  estado               estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en       timestamptz NULL,
  desactivado_por      uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT visitantes_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT visitantes_persona_fk FOREIGN KEY (copropiedad_id, persona_id)
    REFERENCES public.personas(copropiedad_id, id),
  CONSTRAINT visitantes_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS visitantes_persona_uk
  ON public.visitantes (copropiedad_id, persona_id) WHERE estado = 'activo';

-- -----------------------------------------------------------------------------
-- listas_negras — agregado raíz (C-02) · RN-06, RN-07
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listas_negras (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),
  persona_id           uuid NULL,
  placa                text NULL,
  motivo               text NOT NULL,
  estado               estado_lista_negra NOT NULL DEFAULT 'activa',
  levantada_en         timestamptz NULL,
  levantada_por        uuid NULL REFERENCES public.usuarios(id),
  motivo_levantamiento text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT listas_negras_objetivo CHECK (persona_id IS NOT NULL OR placa IS NOT NULL),
  CONSTRAINT listas_negras_placa_normalizada CHECK (placa IS NULL OR placa ~ '^[A-Z0-9]{5,8}$'),
  CONSTRAINT listas_negras_motivo_len CHECK (length(motivo) BETWEEN 1 AND 500),
  CONSTRAINT listas_negras_levantamiento_coherente
    CHECK ((estado = 'levantada') = (levantada_en IS NOT NULL)),
  CONSTRAINT listas_negras_levantamiento_completo
    CHECK (estado <> 'levantada'
           OR (levantada_por IS NOT NULL
               AND motivo_levantamiento IS NOT NULL
               AND length(btrim(motivo_levantamiento)) > 0)),
  CONSTRAINT listas_negras_persona_fk FOREIGN KEY (copropiedad_id, persona_id)
    REFERENCES public.personas(copropiedad_id, id),
  CONSTRAINT listas_negras_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS listas_negras_persona_uk
  ON public.listas_negras (copropiedad_id, persona_id) WHERE estado = 'activa' AND persona_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS listas_negras_placa_uk
  ON public.listas_negras (copropiedad_id, placa) WHERE estado = 'activa' AND placa IS NOT NULL;
