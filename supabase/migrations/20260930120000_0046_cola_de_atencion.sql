-- ════════════════════════════════════════════════════════════════════════════
-- 0046 · G1 (ETAPA 15-N) · LA COLA DE ATENCIÓN LEE LO ÚLTIMO QUE LLEGÓ EN VIVO
--
-- La cola de atención de guardia y portería (P-22, decidido por el cliente)
-- recibe los accesos negados y lo que el equipo emite EN VIVO que necesita a
-- una persona (llamada, rostro no reconocido, lista negra), por la hora de
-- RECEPCIÓN —un videoportero con el reloj 13 h atrasado dejaba lo suyo fuera
-- de «lo último»— y se consulta cada pocos segundos. Sin índice, cada consulta
-- recorre la tabla entera.
--
-- Y las preferencias de la guardia por copropiedad (G2): qué disparadores
-- abren solos la atención y cuáles suenan. Sin fila, todo activado.
--
-- Idempotente y reversible: supabase/reversion/0046_revert.sql.
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS eventos_de_equipo_vivos_por_recepcion_idx
  ON public.eventos_de_equipo (copropiedad_id, recibido_en DESC)
  WHERE en_vivo AND origen = 'equipo';

CREATE INDEX IF NOT EXISTS ordenes_manuales_por_evento_idx
  ON public.ordenes_manuales (copropiedad_id, evento_id)
  WHERE evento_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.preferencias_de_atencion (
  copropiedad_id   uuid PRIMARY KEY REFERENCES public.copropiedades(id),
  -- { "<disparador>": { "abrir": bool, "sonar": bool } } para llamada, rostro,
  -- placa, lista_negra y dudoso. Lo que falte vale «activado».
  preferencias     jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  creado_por       uuid NOT NULL REFERENCES public.usuarios(id),
  actualizado_en   timestamptz NOT NULL DEFAULT now(),
  actualizado_por  uuid NOT NULL REFERENCES public.usuarios(id),
  CONSTRAINT preferencias_de_atencion_objeto CHECK (jsonb_typeof(preferencias) = 'object')
);
COMMENT ON TABLE public.preferencias_de_atencion IS
  'G2 (15-N): por copropiedad y disparador, si la atención se abre sola y si suena. '
  'Sin fila, todo activado. Migracion 0046.';

ALTER TABLE public.preferencias_de_atencion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preferencias_de_atencion FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.preferencias_de_atencion TO authenticated, service_role;
REVOKE DELETE, TRUNCATE ON public.preferencias_de_atencion FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS preferencias_de_atencion_lectura ON public.preferencias_de_atencion;
DROP POLICY IF EXISTS preferencias_de_atencion_insercion ON public.preferencias_de_atencion;
DROP POLICY IF EXISTS preferencias_de_atencion_edicion ON public.preferencias_de_atencion;
CREATE POLICY preferencias_de_atencion_lectura ON public.preferencias_de_atencion FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id) OR app.es_servicio(copropiedad_id));
-- Las lee quien opera; las cambia quien administra (o el servicio de la API).
CREATE POLICY preferencias_de_atencion_insercion ON public.preferencias_de_atencion FOR INSERT
  WITH CHECK (app.puede_administrar(copropiedad_id) OR app.es_superadmin()
              OR app.es_servicio(copropiedad_id));
CREATE POLICY preferencias_de_atencion_edicion ON public.preferencias_de_atencion FOR UPDATE
  USING (app.puede_administrar(copropiedad_id) OR app.es_superadmin()
         OR app.es_servicio(copropiedad_id))
  WITH CHECK (app.puede_administrar(copropiedad_id) OR app.es_superadmin()
              OR app.es_servicio(copropiedad_id));

