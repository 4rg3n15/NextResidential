-- =============================================================================
-- 0011 · Eventos, alertas, auditoría de seguridad y bandeja del Edge
-- Agregado raíz: Acceso · ADR-005 · RN-02, RN-03, RN-08, RN-17
-- =============================================================================

-- -----------------------------------------------------------------------------
-- eventos — particionada por mes (modelo-datos.md §7.3)
--
-- Mensual y no por copropiedad: las consultas reales de las pantallas siempre
-- acotan por rango de fechas e incluyen copropiedad_id, que resuelve el indice.
-- Particionar por tenant multiplicaria particiones sin acelerar la consulta
-- dominante y complicaria la retencion, que es temporal.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eventos (
  id                            uuid NOT NULL DEFAULT gen_random_uuid(),
  copropiedad_id                uuid NOT NULL REFERENCES public.copropiedades(id),

  ocurrido_en                   timestamptz NOT NULL,   -- CLAVE DE PARTICION
  registrado_en                 timestamptz NOT NULL DEFAULT now(),

  tipo                          tipo_evento NOT NULL,
  resultado                     resultado_acceso NULL,
  motivo                        motivo_acceso NULL,
  metodo                        metodo_identificacion NOT NULL,

  persona_id                    uuid NULL,
  vivienda_id                   uuid NULL,
  autorizacion_id               uuid NULL,
  zona_id                       uuid NULL,
  dispositivo_id                uuid NOT NULL,
  punto_acceso_id               uuid NULL,

  placa_detectada               text NULL,
  confianza                     numeric(4,3) NULL,

  regla_aplicada                text NOT NULL,
  version_reglas                bigint NOT NULL,
  decidido_por_edge             boolean NOT NULL DEFAULT false,
  cache_potencialmente_obsoleto boolean NOT NULL DEFAULT false,

  operador_id                   uuid NULL REFERENCES public.usuarios(id),
  motivo_manual                 text NULL,
  evidencia_id                  uuid NULL,
  clave_idempotencia            text NOT NULL,

  creado_en                     timestamptz NOT NULL DEFAULT now(),
  creado_por                    uuid NOT NULL REFERENCES public.usuarios(id),

  -- La clave primaria debe incluir la clave de particion (limitacion de
  -- PostgreSQL documentada en la decision D-11).
  PRIMARY KEY (id, ocurrido_en),

  CONSTRAINT eventos_resultado_salvo_alerta CHECK (tipo = 'alerta' OR resultado IS NOT NULL),
  -- Errores tipados: prohibido negar sin motivo (CLAUDE.md §2.4).
  CONSTRAINT eventos_negado_con_motivo CHECK (resultado <> 'negado' OR motivo IS NOT NULL),

  -- ===== CA-16 al nivel estructural (decision D-13) ==========================
  -- "Sin motivo escrito el sistema no ejecuta la apertura". Combinado con RN-02
  -- —todo intento genera evento—, una apertura manual sin motivo NO PUEDE
  -- registrarse. El btrim no es cosmetico: sin el, un espacio en blanco
  -- satisfaria el NOT NULL y la auditoria guardaria un motivo vacio.
  CONSTRAINT eventos_manual_con_motivo_y_operador CHECK (
    tipo <> 'manual'
    OR (operador_id IS NOT NULL
        AND motivo_manual IS NOT NULL
        AND length(btrim(motivo_manual)) > 0)),

  CONSTRAINT eventos_placa_normalizada CHECK (
    placa_detectada IS NULL OR placa_detectada ~ '^[A-Z0-9]{5,8}$'),
  CONSTRAINT eventos_confianza_rango CHECK (confianza IS NULL OR confianza BETWEEN 0 AND 1),
  CONSTRAINT eventos_regla_aplicada_len CHECK (length(regla_aplicada) BETWEEN 1 AND 200),
  CONSTRAINT eventos_version_no_negativa CHECK (version_reglas >= 0),
  CONSTRAINT eventos_clave_idem_len CHECK (length(clave_idempotencia) BETWEEN 8 AND 200)
) PARTITION BY RANGE (ocurrido_en);

COMMENT ON TABLE public.eventos IS
  'Agregado raiz Acceso. INMUTABLE: sin columnas actualizado_*, sin baja logica, '
  'y con REVOKE UPDATE, DELETE aplicado al padre y a cada particion (ADR-005). '
  'La inmutabilidad no puede depender de que el codigo "no lo haga".';

COMMENT ON COLUMN public.eventos.cache_potencialmente_obsoleto IS
  'KPI-31. El Edge lo marca cuando decidio con un cache que excedia el margen '
  'de vigencia configurado en copropiedades.margen_cache_reglas.';

-- Segunda barrera de idempotencia. La garantia real la aporta
-- bandeja_salida_edge, porque un indice unico particionado debe incluir la
-- clave de particion y por tanto no cubre un reenvio con ocurrido_en
-- recalculado (decision D-11).
CREATE UNIQUE INDEX IF NOT EXISTS eventos_idempotencia_uk
  ON public.eventos (copropiedad_id, clave_idempotencia, ocurrido_en);

-- Indices de consulta, derivados de los filtros reales de los mockups.
CREATE INDEX IF NOT EXISTS eventos_recientes_idx    ON public.eventos (copropiedad_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS eventos_por_vivienda_idx ON public.eventos (copropiedad_id, vivienda_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS eventos_por_persona_idx  ON public.eventos (copropiedad_id, persona_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS eventos_por_dispositivo_idx ON public.eventos (copropiedad_id, dispositivo_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS eventos_por_tipo_idx     ON public.eventos (copropiedad_id, tipo, ocurrido_en DESC);

-- -----------------------------------------------------------------------------
-- alertas · RN-18, CA-18, CA-26, KPI-25
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alertas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id   uuid NOT NULL REFERENCES public.copropiedades(id),
  evento_id        uuid NULL,
  evento_ocurrido_en timestamptz NULL,
  dispositivo_id   uuid NULL,
  tipo             tipo_alerta NOT NULL,
  severidad        severidad_alerta NOT NULL,
  estado           estado_alerta NOT NULL DEFAULT 'abierta',
  generada_en      timestamptz NOT NULL DEFAULT now(),
  escalada_en      timestamptz NULL,
  atendida_por     uuid NULL REFERENCES public.usuarios(id),
  atendida_en      timestamptz NULL,
  resuelta_en      timestamptz NULL,
  notas            text NULL,

  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT alertas_origen CHECK (evento_id IS NOT NULL OR dispositivo_id IS NOT NULL),
  CONSTRAINT alertas_evento_completo CHECK (
    (evento_id IS NULL) = (evento_ocurrido_en IS NULL)),
  CONSTRAINT alertas_resuelta_coherente CHECK ((estado = 'resuelta') = (resuelta_en IS NOT NULL)),
  CONSTRAINT alertas_dispositivo_fk FOREIGN KEY (copropiedad_id, dispositivo_id)
    REFERENCES public.dispositivos(copropiedad_id, id),
  CONSTRAINT alertas_evento_fk FOREIGN KEY (evento_id, evento_ocurrido_en)
    REFERENCES public.eventos(id, ocurrido_en)
);

CREATE INDEX IF NOT EXISTS alertas_abiertas_idx
  ON public.alertas (copropiedad_id, estado, generada_en DESC);

COMMENT ON COLUMN public.alertas.escalada_en IS
  'KPI-25 se mide como escalada_en - generada_en, con umbral de 10 s (CA-18).';

-- -----------------------------------------------------------------------------
-- auditoria_seguridad · decisión D-14 · RN-15, CA-24, KPI-38
--
-- Dos columnas de copropiedad, ambas anulables: el evento que esta tabla existe
-- para registrar involucra DOS copropiedades distintas, y un login fallido no
-- tiene ninguna resuelta todavia. Una sola columna obligaria a elegir cual
-- guardar y perderia la mitad de la informacion justo en el caso que importa.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.auditoria_seguridad (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id_actor      uuid NULL REFERENCES public.copropiedades(id),
  copropiedad_id_objetivo   uuid NULL REFERENCES public.copropiedades(id),
  ocurrido_en               timestamptz NOT NULL DEFAULT now(),
  usuario_id                uuid NULL REFERENCES public.usuarios(id),
  auth_user_id              uuid NULL,
  tipo                      tipo_evento_seguridad NOT NULL,
  recurso                   text NOT NULL,
  identificador_solicitado  text NULL,
  ip                        inet NULL,
  user_agent                text NULL,
  resultado                 text NOT NULL,

  creado_en                 timestamptz NOT NULL DEFAULT now(),
  creado_por                uuid NULL REFERENCES public.usuarios(id),

  CONSTRAINT auditoria_recurso_len CHECK (length(recurso) BETWEEN 1 AND 300),
  CONSTRAINT auditoria_resultado_valores CHECK (resultado IN ('403','404','409','429','permitido'))
);

CREATE INDEX IF NOT EXISTS auditoria_objetivo_idx
  ON public.auditoria_seguridad (copropiedad_id_objetivo, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS auditoria_tipo_idx
  ON public.auditoria_seguridad (tipo, ocurrido_en DESC);

-- -----------------------------------------------------------------------------
-- bandeja_salida_edge · decisión D-11 · RN-17, CA-22
--
-- NO particionada y con restriccion unica simple. Es la garantia real de la
-- idempotencia de la reconciliacion:
--   INSERT ... ON CONFLICT (copropiedad_id, clave_idempotencia) DO NOTHING
--   RETURNING id;   -- 0 filas = duplicado, se descarta en silencio (CU-04 6a)
-- Solo si devuelve fila se inserta el evento.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bandeja_salida_edge (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copropiedad_id      uuid NOT NULL REFERENCES public.copropiedades(id),
  edge_id             uuid NOT NULL,
  clave_idempotencia  text NOT NULL,
  ocurrido_en         timestamptz NOT NULL,
  recibido_en         timestamptz NOT NULL DEFAULT now(),
  estado              estado_recepcion NOT NULL DEFAULT 'recibido',
  evento_id           uuid NULL,

  creado_en           timestamptz NOT NULL DEFAULT now(),
  creado_por          uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_por     uuid NOT NULL REFERENCES public.usuarios(id),

  CONSTRAINT bandeja_clave_len CHECK (length(clave_idempotencia) BETWEEN 8 AND 200),
  CONSTRAINT bandeja_descartado_sin_evento CHECK (
    estado <> 'descartado_duplicado' OR evento_id IS NULL),
  CONSTRAINT bandeja_aplicado_con_evento CHECK (
    estado <> 'aplicado' OR evento_id IS NOT NULL),
  CONSTRAINT bandeja_edge_fk FOREIGN KEY (copropiedad_id, edge_id)
    REFERENCES public.edge_gateways(copropiedad_id, id)
);

-- ===== RN-17 · la garantia real de idempotencia ==============================
CREATE UNIQUE INDEX IF NOT EXISTS bandeja_idempotencia_uk
  ON public.bandeja_salida_edge (copropiedad_id, clave_idempotencia);
