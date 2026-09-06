-- =============================================================================
-- 0004 · Frontera del tenant e identidad
-- Agregado raíz: Copropiedad (modelo-datos.md §2.1)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.copropiedades (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre                    text NOT NULL,
  nit                       text NOT NULL,
  zona_horaria              text NOT NULL DEFAULT 'America/Bogota',
  estado                    estado_tenant NOT NULL DEFAULT 'activa',

  -- Version de reglas monotona (hueco H-07 de la ETAPA 00).
  version_reglas_actual     bigint NOT NULL DEFAULT 0,

  -- Configuracion operativa por copropiedad (decision D-15).
  -- Los supuestos S-03..S-06 y los pendientes P-02..P-07 de la ETAPA 00 viven
  -- aqui como columnas con valor conservador, no como constantes en el codigo.
  politica_contingencia_edge politica_contingencia NOT NULL DEFAULT 'denegar',
  umbral_confianza_placa    numeric(4,3) NOT NULL DEFAULT 0.850,
  margen_cache_reglas       interval NOT NULL DEFAULT '24 hours',
  umbral_latido_dispositivo interval NOT NULL DEFAULT '5 minutes',
  plazo_consentimiento      interval NOT NULL DEFAULT '24 hours',

  creado_en                 timestamptz NOT NULL DEFAULT now(),
  creado_por                uuid NOT NULL,
  actualizado_en            timestamptz NOT NULL DEFAULT now(),
  actualizado_por           uuid NOT NULL,

  CONSTRAINT copropiedades_nombre_len   CHECK (length(nombre) BETWEEN 1 AND 200),
  CONSTRAINT copropiedades_nit_formato  CHECK (nit ~ '^[0-9]{5,15}$'),
  CONSTRAINT copropiedades_zona_horaria CHECK (
    app.es_zona_horaria(zona_horaria)),
  CONSTRAINT copropiedades_version_no_negativa CHECK (version_reglas_actual >= 0),
  CONSTRAINT copropiedades_umbral_confianza    CHECK (umbral_confianza_placa BETWEEN 0 AND 1),
  CONSTRAINT copropiedades_margen_cache        CHECK (margen_cache_reglas       > interval '0'),
  CONSTRAINT copropiedades_umbral_latido       CHECK (umbral_latido_dispositivo > interval '0'),
  CONSTRAINT copropiedades_plazo_consent       CHECK (plazo_consentimiento      > interval '0')
);

CREATE UNIQUE INDEX IF NOT EXISTS copropiedades_nit_uk ON public.copropiedades (nit);

-- Restriccion auxiliar para las claves foraneas compuestas de las tablas hijas
-- (decision D-06): permite REFERENCES (copropiedad_id, id) desde cualquier
-- tabla operativa y hace estructuralmente imposible que un hijo apunte a un
-- padre de otro tenant.
CREATE UNIQUE INDEX IF NOT EXISTS copropiedades_id_uk ON public.copropiedades (id);

COMMENT ON TABLE  public.copropiedades IS 'Agregado raiz Copropiedad. Frontera de aislamiento del tenant (RN-15).';
COMMENT ON COLUMN public.copropiedades.umbral_confianza_placa IS
  'Umbral de confianza de lectura de placa (CU-01 exc. 3a). Por debajo no se decide '
  'automaticamente: se envia a validacion humana. Supuesto S-05, pendiente P-02.';

-- -----------------------------------------------------------------------------
-- usuarios
--
-- Unica tabla de identidad con copropiedad_id NULL, y solo para el
-- superadministrador (modelo-datos.md §4.2, decision D-02). Es el punto exacto
-- donde el aislamiento multiempresa puede fallar por diseno: la suite de la
-- ETAPA 03 debe cubrirlo de forma explicita.
--
-- No hay columna de contrasena, hash, secreto ni token: las credenciales viven
-- exclusivamente en Supabase Auth.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuarios (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NULL REFERENCES public.copropiedades(id),
  auth_user_id         uuid NOT NULL,
  correo               citext NOT NULL,
  nombre               text NOT NULL,
  telefono             text NULL,
  persona_id           uuid NULL,          -- FK diferida a personas (migracion 0005)
  mfa_habilitado       boolean NOT NULL DEFAULT false,

  estado               estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en       timestamptz NULL,
  desactivado_por      uuid NULL,
  motivo_desactivacion text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL,
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL,

  CONSTRAINT usuarios_nombre_len   CHECK (length(nombre) BETWEEN 1 AND 200),
  CONSTRAINT usuarios_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_auth_user_uk ON public.usuarios (auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_correo_uk    ON public.usuarios (correo);

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_creado_por_fk,
  ADD  CONSTRAINT usuarios_creado_por_fk      FOREIGN KEY (creado_por)      REFERENCES public.usuarios(id);
ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_actualizado_por_fk,
  ADD  CONSTRAINT usuarios_actualizado_por_fk FOREIGN KEY (actualizado_por) REFERENCES public.usuarios(id);
ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_desactivado_por_fk,
  ADD  CONSTRAINT usuarios_desactivado_por_fk FOREIGN KEY (desactivado_por) REFERENCES public.usuarios(id);

ALTER TABLE public.copropiedades
  DROP CONSTRAINT IF EXISTS copropiedades_creado_por_fk,
  ADD  CONSTRAINT copropiedades_creado_por_fk      FOREIGN KEY (creado_por)      REFERENCES public.usuarios(id);
ALTER TABLE public.copropiedades
  DROP CONSTRAINT IF EXISTS copropiedades_actualizado_por_fk,
  ADD  CONSTRAINT copropiedades_actualizado_por_fk FOREIGN KEY (actualizado_por) REFERENCES public.usuarios(id);

COMMENT ON COLUMN public.usuarios.copropiedad_id IS
  'NULL unicamente para el superadministrador, que es rol de plataforma. '
  'Verificado por el disparador app.tg_usuario_tenant (migracion 0013).';

-- -----------------------------------------------------------------------------
-- roles_usuario
--
-- El rol es tabla y no columna de `usuarios` porque HU-25 exige que un operador
-- de central atienda varias copropiedades y KPI-35 lo mide. Con el rol como
-- columna, un usuario tendria un solo tenant y la guardia virtual multiproyecto
-- seria imposible.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.roles_usuario (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),
  usuario_id           uuid NOT NULL REFERENCES public.usuarios(id),
  rol                  rol_usuario NOT NULL,

  estado               estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en       timestamptz NULL,
  desactivado_por      uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT roles_usuario_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS roles_usuario_uk
  ON public.roles_usuario (usuario_id, copropiedad_id, rol) WHERE estado = 'activo';
CREATE INDEX IF NOT EXISTS roles_usuario_por_copropiedad_idx
  ON public.roles_usuario (copropiedad_id, rol) WHERE estado = 'activo';
