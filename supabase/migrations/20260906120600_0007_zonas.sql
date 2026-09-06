-- =============================================================================
-- 0007 · Zonas comunes, horarios y aforo
-- Agregado raíz: Zona · RN-14, CA-14, CA-15
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.zonas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id           uuid NOT NULL REFERENCES public.copropiedades(id),
  nombre                   text NOT NULL,
  tipo                     tipo_zona NOT NULL,

  -- Interruptor del mockup W-06. Resuelve PB-04: el operador puede bloquear
  -- el acceso a una zona sin presencia fisica.
  abierta                  boolean NOT NULL DEFAULT true,

  -- CU-05 excepcion 6a. Pendiente P-04; valor conservador por defecto.
  politica_reinicio_aforo  politica_reinicio NOT NULL DEFAULT 'cierre_horario',
  normas                   text[] NOT NULL DEFAULT '{}',

  estado                   estado_registro NOT NULL DEFAULT 'activo',
  desactivado_en           timestamptz NULL,
  desactivado_por          uuid NULL REFERENCES public.usuarios(id),
  motivo_desactivacion     text NULL,

  creado_en                timestamptz NOT NULL DEFAULT now(),
  creado_por               uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_por          uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT zonas_nombre_len CHECK (length(nombre) BETWEEN 1 AND 100),
  CONSTRAINT zonas_baja_coherente CHECK ((estado = 'inactivo') = (desactivado_en IS NOT NULL)),
  CONSTRAINT zonas_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS zonas_nombre_uk
  ON public.zonas (copropiedad_id, nombre) WHERE estado = 'activo';

COMMENT ON COLUMN public.zonas.politica_reinicio_aforo IS
  'Politica de reinicio del contador ante salidas no registradas (CU-05 6a). '
  'cierre_horario reinicia al CIERRE DE LA JORNADA de la zona, nunca en el corte '
  'de medianoche que parte en dos filas un horario nocturno (supuesto S-09). '
  'Caso de prueba de limite obligatorio de la ETAPA 07.';

-- -----------------------------------------------------------------------------
-- zona_horarios · CA-15
--
-- Supuesto S-09: un horario que cruza la medianoche (p. ej. Vie-Dom 10:00-01:00
-- del mockup W-06) se modela como dos filas —viernes 10:00-23:59:59 y sabado
-- 00:00-01:00—, en vez de permitir hora_fin < hora_inicio como marca de cruce.
-- La alternativa mete un caso especial en la comparacion del motor de reglas.
--
-- El corte de medianoche es un artificio de representacion del horario: NO
-- implica cierre de jornada y por tanto NO reinicia el contador de aforo.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zona_horarios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  zona_id          uuid NOT NULL,
  dia_semana       smallint NOT NULL,
  hora_inicio      time NOT NULL,
  hora_fin         time NOT NULL,
  -- true cuando esta fila es la continuacion, tras la medianoche, de la franja
  -- del dia anterior. El motor la usa para no tratar el corte como cierre.
  continua_del_dia_anterior boolean NOT NULL DEFAULT false,

  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT zona_horarios_dia_iso CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT zona_horarios_franja  CHECK (hora_inicio < hora_fin),
  CONSTRAINT zona_horarios_continuacion_empieza_a_medianoche
    CHECK (continua_del_dia_anterior = false OR hora_inicio = time '00:00'),
  CONSTRAINT zona_horarios_zona_fk FOREIGN KEY (copropiedad_id, zona_id)
    REFERENCES public.zonas(copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS zona_horarios_uk
  ON public.zona_horarios (zona_id, dia_semana, hora_inicio);

-- -----------------------------------------------------------------------------
-- zona_aforo · decisión D-04
--
-- Tabla propia con el maximo AL LADO del conteo, por dos razones:
--   1. La invariante RN-14 se vuelve un CHECK de nivel estructural en vez de un
--      trigger que cruza dos tablas.
--   2. Contencion de bloqueos: el contador es la fila mas escrita del sistema en
--      hora punta; la configuracion de la zona, de las menos escritas.
--
-- Y permite el incremento atomico sin SELECT previo (ADR-004):
--   UPDATE zona_aforo SET conteo_actual = conteo_actual + 1
--    WHERE zona_id = $1 AND conteo_actual < aforo_maximo RETURNING conteo_actual;
--   0 filas devueltas = AFORO_SUPERADO, sin ventana de carrera. CA-14.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zona_aforo (
  zona_id          uuid PRIMARY KEY,
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  aforo_maximo     integer NOT NULL,
  conteo_actual    integer NOT NULL DEFAULT 0,
  reiniciado_en    timestamptz NULL,
  actualizado_en   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT zona_aforo_maximo_no_negativo CHECK (aforo_maximo  >= 0),
  CONSTRAINT zona_aforo_conteo_no_negativo CHECK (conteo_actual >= 0),
  -- ===== RN-14 · CA-14 al nivel estructural =================================
  CONSTRAINT zona_aforo_no_supera_maximo   CHECK (conteo_actual <= aforo_maximo),
  CONSTRAINT zona_aforo_zona_fk FOREIGN KEY (copropiedad_id, zona_id)
    REFERENCES public.zonas(copropiedad_id, id)
);

-- FK diferida de autorizaciones_zona, ahora que `zonas` existe.
ALTER TABLE public.autorizaciones_zona
  DROP CONSTRAINT IF EXISTS autorizaciones_zona_zona_fk,
  ADD  CONSTRAINT autorizaciones_zona_zona_fk FOREIGN KEY (copropiedad_id, zona_id)
       REFERENCES public.zonas(copropiedad_id, id);
