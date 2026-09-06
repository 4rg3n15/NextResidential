-- =============================================================================
-- 0008 · Biometría y consentimiento
-- Agregados raíz: ConsentimientoBiometrico y PlantillaBiometrica (C-02)
-- Ley 1581 de 2012 · RN-09, RN-10, RN-11 · CA-08 a CA-11
-- =============================================================================

-- evidencias se define aquí porque el consentimiento la referencia.
CREATE TABLE IF NOT EXISTS public.evidencias (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  bucket           text NOT NULL,
  ruta             text NOT NULL,
  tipo             tipo_evidencia NOT NULL,
  hash_sha256      text NOT NULL,
  tipo_mime        text NOT NULL,
  tamano_bytes     bigint NOT NULL,

  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT evidencias_hash_formato CHECK (hash_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT evidencias_tamano_positivo CHECK (tamano_bytes > 0),
  CONSTRAINT evidencias_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS evidencias_objeto_uk ON public.evidencias (bucket, ruta);

COMMENT ON TABLE public.evidencias IS
  'Metadato del objeto en Storage. Decision D-19: guarda bucket, ruta y hash, '
  'NUNCA una URL. Las URL firmadas de vida corta (RN-21) se generan al servir; '
  'persistirlas convertiria un permiso temporal en un dato permanente.';

-- -----------------------------------------------------------------------------
-- consentimientos_biometricos · RN-10 · decisión D-08
--
-- NO existe columna que vincule el consentimiento a un residente. Es deliberado:
-- el esquema hace IMPOSIBLE registrar "el residente consintio por el visitante",
-- porque no hay donde escribirlo. Es la forma mas fuerte de cumplir una regla:
-- no prohibirla, sino hacerla inexpresable.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consentimientos_biometricos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  persona_id       uuid NOT NULL,                 -- EL TITULAR
  finalidad        text NOT NULL DEFAULT 'control_acceso',
  version_politica text NOT NULL,
  canal            canal_consentimiento NOT NULL,
  solicitado_en    timestamptz NOT NULL DEFAULT now(),
  otorgado_en      timestamptz NULL,
  revocado_en      timestamptz NULL,
  evidencia_id     uuid NULL,
  estado           estado_consentimiento NOT NULL DEFAULT 'pendiente',

  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT consent_vigente_coherente CHECK (
    (estado = 'vigente') = (otorgado_en IS NOT NULL AND revocado_en IS NULL)),
  CONSTRAINT consent_revocado_coherente CHECK ((estado = 'revocado') = (revocado_en IS NOT NULL)),
  CONSTRAINT consent_version_politica_len CHECK (length(version_politica) BETWEEN 1 AND 50),
  CONSTRAINT consent_persona_fk FOREIGN KEY (copropiedad_id, persona_id)
    REFERENCES public.personas(copropiedad_id, id),
  CONSTRAINT consent_evidencia_fk FOREIGN KEY (copropiedad_id, evidencia_id)
    REFERENCES public.evidencias(copropiedad_id, id),
  CONSTRAINT consent_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS consent_vigente_uk
  ON public.consentimientos_biometricos (copropiedad_id, persona_id) WHERE estado = 'vigente';

COMMENT ON COLUMN public.consentimientos_biometricos.persona_id IS
  'El TITULAR del dato, que es el visitante (RN-10). No hay columna para el '
  'residente que lo invita: decision D-08.';

-- -----------------------------------------------------------------------------
-- plantillas_biometricas · RN-09 · decisiones D-09 y D-10
--
-- consentimiento_id es NOT NULL desde el primer instante. No contradice CA-09:
-- la fila de consentimiento se crea en el paso 3 de CU-02 —cuando el sistema
-- SOLICITA el consentimiento—, con estado 'pendiente'. Lo que esta pendiente no
-- es la fila: es su estado.
--   Nivel 1: no existe plantilla sin fila de consentimiento (esta FK).
--   Nivel 2: no se sincroniza si ese consentimiento no esta vigente (trigger 0013).
--
-- El vector se cifra en la APLICACION, no con pgcrypto (D-10): si la llave esta
-- en la base, quien lee la base lee la llave.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plantillas_biometricas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id    uuid NOT NULL REFERENCES public.copropiedades(id),
  persona_id        uuid NOT NULL,
  consentimiento_id uuid NOT NULL,
  calidad           numeric(4,3) NOT NULL,
  vector_cifrado    bytea NULL,
  llave_ref         text NULL,
  algoritmo         text NULL,
  suprimir_en       timestamptz NOT NULL,
  sincronizada_en   timestamptz NULL,
  suprimida_en      timestamptz NULL,
  estado            estado_plantilla NOT NULL DEFAULT 'pendiente_consentimiento',

  creado_en         timestamptz NOT NULL DEFAULT now(),
  creado_por        uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  actualizado_por   uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT plantillas_calidad_rango CHECK (calidad BETWEEN 0 AND 1),
  -- La llave nunca se guarda: solo una referencia a boveda o variable de entorno.
  CONSTRAINT plantillas_llave_es_referencia CHECK (
    llave_ref IS NULL OR llave_ref ~ '^(env|vault):[A-Za-z0-9_./-]+$'),
  -- Suprimir es borrar el vector, no etiquetar la fila (CA-10).
  CONSTRAINT plantillas_supresion_efectiva CHECK (
    estado <> 'suprimida' OR (vector_cifrado IS NULL AND suprimida_en IS NOT NULL)),
  CONSTRAINT plantillas_persona_fk FOREIGN KEY (copropiedad_id, persona_id)
    REFERENCES public.personas(copropiedad_id, id),
  CONSTRAINT plantillas_consentimiento_fk FOREIGN KEY (copropiedad_id, consentimiento_id)
    REFERENCES public.consentimientos_biometricos(copropiedad_id, id),
  CONSTRAINT plantillas_tenant_uk UNIQUE (copropiedad_id, id)
);

-- Barrido de supresion programada de pg-boss (RN-11, KPI-21).
CREATE INDEX IF NOT EXISTS plantillas_supresion_idx
  ON public.plantillas_biometricas (copropiedad_id, suprimir_en) WHERE estado <> 'suprimida';

-- -----------------------------------------------------------------------------
-- plantilla_sincronizaciones
-- Hace verificable CA-10: "su plantilla ya no existe en NINGUNA terminal" se
-- comprueba consultando que no queda fila con estado <> 'suprimida'.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plantilla_sincronizaciones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  plantilla_id     uuid NOT NULL,
  dispositivo_id   uuid NOT NULL,     -- FK anadida en 0009
  estado           estado_sincronizacion NOT NULL DEFAULT 'pendiente',
  intentos         smallint NOT NULL DEFAULT 0,
  ultimo_error     text NULL,
  sincronizada_en  timestamptz NULL,
  suprimida_en     timestamptz NULL,

  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT sincronizaciones_intentos_no_negativos CHECK (intentos >= 0),
  CONSTRAINT sincronizaciones_plantilla_fk FOREIGN KEY (copropiedad_id, plantilla_id)
    REFERENCES public.plantillas_biometricas(copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS sincronizaciones_uk
  ON public.plantilla_sincronizaciones (plantilla_id, dispositivo_id);
CREATE INDEX IF NOT EXISTS sincronizaciones_pendientes_idx
  ON public.plantilla_sincronizaciones (copropiedad_id, estado) WHERE estado = 'pendiente';
