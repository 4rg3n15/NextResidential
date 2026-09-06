-- =============================================================================
-- 0010 · Reglas y sus versiones · decisión D-17
-- RN-16, CA-21, KPI-31
--
-- Editar una regla no actualiza su fila: publica una VERSION nueva. Sin esto,
-- la version sellada en un evento de hace un mes apuntaria a reglas que ya
-- cambiaron, y la auditoria no podria reconstruir con que se decidio.
-- Es la logica de ADR-005 aplicada a la configuracion.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.versiones_de_reglas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id  uuid NOT NULL REFERENCES public.copropiedades(id),
  numero          bigint NOT NULL,
  hash            text NOT NULL,
  publicada_en    timestamptz NOT NULL DEFAULT now(),
  publicada_por   uuid NOT NULL REFERENCES public.usuarios(id),

  creado_en       timestamptz NOT NULL DEFAULT now(),
  creado_por      uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT versiones_numero_positivo CHECK (numero > 0),
  -- El hash permite que el Edge VERIFIQUE que su cache corresponde exactamente
  -- a una version publicada, en vez de confiar en el numero.
  CONSTRAINT versiones_hash_formato CHECK (hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT versiones_tenant_uk UNIQUE (copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS versiones_numero_uk
  ON public.versiones_de_reglas (copropiedad_id, numero);

CREATE TABLE IF NOT EXISTS public.reglas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id  uuid NOT NULL REFERENCES public.copropiedades(id),
  version_id      uuid NOT NULL,
  clave           text NOT NULL,
  -- Cadena de precedencia del motor, vinculante segun la pagina 3 del diagrama:
  --   listaNegra > vigencia > patron > zona
  prioridad       smallint NOT NULL,
  definicion      jsonb NOT NULL,

  creado_en       timestamptz NOT NULL DEFAULT now(),
  creado_por      uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT reglas_clave_formato CHECK (clave ~ '^[a-z][a-z0-9_]{2,60}$'),
  CONSTRAINT reglas_prioridad_positiva CHECK (prioridad > 0),
  CONSTRAINT reglas_definicion_objeto CHECK (jsonb_typeof(definicion) = 'object'),
  CONSTRAINT reglas_version_fk FOREIGN KEY (copropiedad_id, version_id)
    REFERENCES public.versiones_de_reglas(copropiedad_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS reglas_clave_uk ON public.reglas (version_id, clave);
CREATE INDEX IF NOT EXISTS reglas_por_version_idx ON public.reglas (copropiedad_id, version_id, prioridad);
