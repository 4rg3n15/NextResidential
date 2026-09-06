-- =============================================================================
-- 0006 · Autorizaciones
-- Agregado raíz: Autorizacion (+ patrones, acompañantes, zonas habilitadas)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.autorizaciones (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id           uuid NOT NULL REFERENCES public.copropiedades(id),
  vivienda_id              uuid NOT NULL,
  visitante_id             uuid NOT NULL,

  -- PB-06 estructural: siempre consta quien autorizo. RN-05.
  autorizado_por           uuid NOT NULL,

  tipo                     tipo_autorizacion NOT NULL,
  placa                    text NULL,
  vigencia                 tstzrange NOT NULL,
  permite_acceso_vehicular boolean NOT NULL DEFAULT false,
  observaciones            text NULL,

  estado                   estado_autorizacion NOT NULL DEFAULT 'activa',
  revocada_en              timestamptz NULL,
  revocada_por             uuid NULL REFERENCES public.usuarios(id),
  motivo_revocacion        text NULL,

  creado_en                timestamptz NOT NULL DEFAULT now(),
  creado_por               uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_por          uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT autorizaciones_placa_normalizada CHECK (placa IS NULL OR placa ~ '^[A-Z0-9]{5,8}$'),
  CONSTRAINT autorizaciones_vigencia_acotada CHECK (
    NOT isempty(vigencia) AND lower(vigencia) IS NOT NULL AND upper(vigencia) IS NOT NULL),
  CONSTRAINT autorizaciones_observaciones_len CHECK (observaciones IS NULL OR length(observaciones) <= 1000),
  CONSTRAINT autorizaciones_revocacion_coherente CHECK ((estado = 'revocada') = (revocada_en IS NOT NULL)),
  CONSTRAINT autorizaciones_revocacion_completa CHECK (
    estado <> 'revocada'
    OR (revocada_por IS NOT NULL AND motivo_revocacion IS NOT NULL
        AND length(btrim(motivo_revocacion)) > 0)),
  CONSTRAINT autorizaciones_vehicular_exige_placa CHECK (
    permite_acceso_vehicular = false OR placa IS NOT NULL),

  CONSTRAINT autorizaciones_vivienda_fk FOREIGN KEY (copropiedad_id, vivienda_id)
    REFERENCES public.viviendas(copropiedad_id, id),
  CONSTRAINT autorizaciones_visitante_fk FOREIGN KEY (copropiedad_id, visitante_id)
    REFERENCES public.visitantes(copropiedad_id, id),
  CONSTRAINT autorizaciones_residente_fk FOREIGN KEY (copropiedad_id, autorizado_por)
    REFERENCES public.residentes(copropiedad_id, id),
  CONSTRAINT autorizaciones_tenant_uk UNIQUE (copropiedad_id, id)
);

COMMENT ON COLUMN public.autorizaciones.estado IS
  'Solo lo que una persona decidio: activa o revocada. Programada, vigente y '
  'expirada se derivan de la vigencia y el reloj, y NO se almacenan (D-07): un '
  'estado derivado y persistido crea dos verdades, y en un sistema que abre '
  'puertas la diferencia entre ambas es un acceso indebido.';

-- Camino crítico de CU-01: resolución de placa detectada.
CREATE INDEX IF NOT EXISTS autorizaciones_placa_idx
  ON public.autorizaciones (copropiedad_id, placa)
  WHERE placa IS NOT NULL AND estado = 'activa';
CREATE INDEX IF NOT EXISTS autorizaciones_vigencia_gist
  ON public.autorizaciones USING gist (vigencia);
CREATE INDEX IF NOT EXISTS autorizaciones_por_vivienda_idx
  ON public.autorizaciones (copropiedad_id, vivienda_id) WHERE estado = 'activa';

-- Vista de conveniencia: el estado derivado se calcula, no se guarda (D-07).
CREATE OR REPLACE VIEW public.autorizaciones_vigentes AS
  SELECT a.*
    FROM public.autorizaciones a
   WHERE a.estado = 'activa'
     AND a.vigencia @> now();

COMMENT ON VIEW public.autorizaciones_vigentes IS
  'Autorizaciones activas cuya vigencia contiene el instante actual. El motor de '
  'reglas del dominio recibe el reloj inyectado y no depende de esta vista; '
  'existe para consultas de consola.';

-- -----------------------------------------------------------------------------
-- patrones_recurrencia · RN-22, CA-06
-- Una fila por dia y franja. CA-06 (lunes a viernes de 7:00 a 12:00) son cinco
-- filas. Admite varias franjas por dia sin cambiar el esquema.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patrones_recurrencia (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  autorizacion_id  uuid NOT NULL,
  dia_semana       smallint NOT NULL,
  hora_inicio      time NOT NULL,
  hora_fin         time NOT NULL,

  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT patrones_dia_iso   CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT patrones_franja    CHECK (hora_inicio < hora_fin),
  CONSTRAINT patrones_autorizacion_fk FOREIGN KEY (copropiedad_id, autorizacion_id)
    REFERENCES public.autorizaciones(copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS patrones_recurrencia_uk
  ON public.patrones_recurrencia (autorizacion_id, dia_semana, hora_inicio);

COMMENT ON COLUMN public.patrones_recurrencia.hora_inicio IS
  'Hora local de la copropiedad. Se usa `time` y no `timetz` a proposito: el '
  'desplazamiento correcto depende de la fecha, no de la hora.';

-- -----------------------------------------------------------------------------
-- autorizacion_acompanantes · HU-09, resolución de C-06
-- Lista nominal, no contador: sin identidad por acompanante, RN-02 seria
-- incumplible para todos menos el primero, y una persona en lista negra podria
-- entrar como acompanante sin ser detectada.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.autorizacion_acompanantes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  autorizacion_id  uuid NOT NULL,
  persona_id       uuid NOT NULL,

  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT acompanantes_autorizacion_fk FOREIGN KEY (copropiedad_id, autorizacion_id)
    REFERENCES public.autorizaciones(copropiedad_id, id),
  CONSTRAINT acompanantes_persona_fk FOREIGN KEY (copropiedad_id, persona_id)
    REFERENCES public.personas(copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS acompanantes_uk
  ON public.autorizacion_acompanantes (autorizacion_id, persona_id);

-- -----------------------------------------------------------------------------
-- autorizaciones_zona · HU-19
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.autorizaciones_zona (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  autorizacion_id  uuid NOT NULL,
  zona_id          uuid NOT NULL,

  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT autorizaciones_zona_autorizacion_fk FOREIGN KEY (copropiedad_id, autorizacion_id)
    REFERENCES public.autorizaciones(copropiedad_id, id)
  -- La FK a zonas se anade en la migracion 0007, cuando la tabla ya existe.
);

CREATE UNIQUE INDEX IF NOT EXISTS autorizaciones_zona_uk
  ON public.autorizaciones_zona (autorizacion_id, zona_id);
