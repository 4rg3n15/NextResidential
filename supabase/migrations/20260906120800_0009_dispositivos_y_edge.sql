-- =============================================================================
-- 0009 · Dispositivos, puntos de acceso y Edge Gateway
-- Agregado raíz: Dispositivo (C-02) · RN-12, RN-21, CA-26
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dispositivos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id        uuid NOT NULL REFERENCES public.copropiedades(id),
  zona_id               uuid NULL,
  nombre                text NOT NULL,
  tipo                  tipo_dispositivo NOT NULL,

  -- host es la IP o el FQDN del equipo. NO es un secreto (contradiccion C-11):
  -- se muestra solo a roles administrativos, por vista, no por esta tabla.
  host                  text NOT NULL,
  puerto                integer NOT NULL DEFAULT 80,

  -- ===== RN-21 al nivel estructural (decision D-09b) =========================
  -- El CHECK hace que escribir una contrasena literal FALLE. Solo entran
  -- referencias con la forma vault:... o env:...
  credencial_ref        text NOT NULL,

  modelo                text NULL,
  firmware              text NULL,
  estado_salud          estado_dispositivo NOT NULL DEFAULT 'saludable',
  ultimo_latido         timestamptz NULL,
  ultima_sincronizacion timestamptz NULL,

  estado                estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en        timestamptz NULL,
  desactivado_por       uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion  text NULL,

  creado_en             timestamptz NOT NULL DEFAULT now(),
  creado_por            uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_por       uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT dispositivos_credencial_es_referencia
    CHECK (credencial_ref ~ '^(env|vault):[A-Za-z0-9_./-]+$'),
  CONSTRAINT dispositivos_puerto_valido CHECK (puerto BETWEEN 1 AND 65535),
  CONSTRAINT dispositivos_nombre_len CHECK (length(nombre) BETWEEN 1 AND 120),
  CONSTRAINT dispositivos_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT dispositivos_zona_fk FOREIGN KEY (copropiedad_id, zona_id)
    REFERENCES public.zonas(copropiedad_id, id),
  CONSTRAINT dispositivos_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS dispositivos_endpoint_uk
  ON public.dispositivos (copropiedad_id, host, puerto) WHERE estado = 'activo';
CREATE INDEX IF NOT EXISTS dispositivos_salud_idx
  ON public.dispositivos (copropiedad_id, estado_salud) WHERE estado = 'activo';
CREATE INDEX IF NOT EXISTS dispositivos_latido_idx
  ON public.dispositivos (copropiedad_id, ultimo_latido);

COMMENT ON COLUMN public.dispositivos.credencial_ref IS
  'Referencia a boveda o variable de entorno, NUNCA la credencial. El CHECK de '
  'formato hace que una contrasena literal falle al escribir (RN-21, D-09b).';

-- Vista para roles operativos: expone estado sin host ni credencial (C-11).
CREATE OR REPLACE VIEW public.dispositivos_operativos AS
  SELECT d.id, d.copropiedad_id, d.zona_id, d.nombre, d.tipo, d.modelo,
         d.estado_salud, d.ultimo_latido, d.ultima_sincronizacion, d.estado
    FROM public.dispositivos d;

COMMENT ON VIEW public.dispositivos_operativos IS
  'Proyeccion para portero y operador de central: sin host ni credencial_ref.';

ALTER TABLE public.plantilla_sincronizaciones
  DROP CONSTRAINT IF EXISTS sincronizaciones_dispositivo_fk,
  ADD  CONSTRAINT sincronizaciones_dispositivo_fk FOREIGN KEY (copropiedad_id, dispositivo_id)
       REFERENCES public.dispositivos(copropiedad_id, id);

-- -----------------------------------------------------------------------------
-- puntos_de_acceso
-- Entidad interna del agregado Dispositivo, no raiz: un rele puede comandar dos
-- puntos y una camara LPR alimenta un punto sin accionarlo. Separarlos permite
-- que el evento registre QUE se abrio y QUE equipo lo hizo, que son cosas
-- distintas.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.puntos_de_acceso (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id       uuid NOT NULL REFERENCES public.copropiedades(id),
  zona_id              uuid NOT NULL,
  dispositivo_id       uuid NOT NULL,
  nombre               text NOT NULL,
  tipo                 tipo_punto NOT NULL,
  sentido              sentido_paso NOT NULL DEFAULT 'bidireccional',

  estado               estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en       timestamptz NULL,
  desactivado_por      uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion text NULL,

  creado_en            timestamptz NOT NULL DEFAULT now(),
  creado_por           uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_por      uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT puntos_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT puntos_zona_fk FOREIGN KEY (copropiedad_id, zona_id)
    REFERENCES public.zonas(copropiedad_id, id),
  CONSTRAINT puntos_dispositivo_fk FOREIGN KEY (copropiedad_id, dispositivo_id)
    REFERENCES public.dispositivos(copropiedad_id, id),
  CONSTRAINT puntos_tenant_uk UNIQUE (copropiedad_id, id)
);

-- -----------------------------------------------------------------------------
-- edge_gateways · decisión D-16
-- El Edge DECIDE, y `Dispositivo` tiene como invariante explicita del diagrama
-- "no decide accesos, solo ejecuta". Por eso no es una fila mas de dispositivos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.edge_gateways (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id        uuid NOT NULL REFERENCES public.copropiedades(id),
  nombre                text NOT NULL,
  usuario_servicio_id   uuid NOT NULL REFERENCES public.usuarios(id),
  credencial_ref        text NOT NULL,
  version_reglas_cache  bigint NOT NULL DEFAULT 0,
  cache_actualizado_en  timestamptz NULL,
  ultimo_latido         timestamptz NULL,

  estado                estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en        timestamptz NULL,
  desactivado_por       uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion  text NULL,

  creado_en             timestamptz NOT NULL DEFAULT now(),
  creado_por            uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en        timestamptz NOT NULL DEFAULT now(),
  actualizado_por       uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT edge_credencial_es_referencia
    CHECK (credencial_ref ~ '^(env|vault):[A-Za-z0-9_./-]+$'),
  CONSTRAINT edge_version_no_negativa CHECK (version_reglas_cache >= 0),
  CONSTRAINT edge_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT edge_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS edge_nombre_uk
  ON public.edge_gateways (copropiedad_id, nombre) WHERE estado = 'activo';
