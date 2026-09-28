-- ─────────────────────────────────────────────────────────────────────────────
-- 0043 · ETAPA 15-L (F) · CONSENTIMIENTO DECLARADO POR QUIEN REGISTRA · ADR-032
-- (deroga en lo pertinente ADR-029)
--
-- Decisión del cliente (F4): la ÚNICA constancia obligatoria del consentimiento
-- biométrico es una casilla en el formulario de la autorización —«El visitante
-- autorizó el uso de su foto para el ingreso»— que marca quien REGISTRA la
-- visita (residente, portero o administración). No hay enlace, ni QR, ni
-- espera. El riesgo legal frente a la Ley 1581 lo acepta el cliente (ADR-032).
--
-- Lo que esta migración deja escrito en la base, para que no se confunda:
--
-- 1 · EL ORIGEN DEL CONSENTIMIENTO. `consentimientos_biometricos.origen` dice
--     si lo otorgó el TITULAR (lo que había hasta ahora) o lo DECLARÓ quien
--     registró la visita; `declarado_por` dice qué cuenta marcó la casilla.
--     Una declaración sin autor no entra. Si el titular la confirma después
--     en persona (D-10, ahora opcional), el origen pasa a ser el suyo y el
--     autor de la declaración se conserva.
-- 2 · LA CASILLA DE CADA AUTORIZACIÓN. Un mismo visitante puede venir muchas
--     veces con un único consentimiento vigente; cada formulario deja su
--     propia constancia: quién la marcó, cuándo y la versión del texto. Las
--     tres columnas van juntas o ninguna.
-- 3 · Índices para la lista de visitas: por día (portería) y por vivienda
--     (historial del superadministrador y «Últimos visitantes» del residente).
--
-- La supresión al vencer, revocar o rechazar (RN-11) no cambia: la hace la
-- aplicación con identidad de servicio y el barrido programado la reintenta.
--
-- Idempotente. Reversión: supabase/reversion/0043_revert.sql.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1 · origen del consentimiento -----------------------------------------------
ALTER TABLE public.consentimientos_biometricos
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'otorgado_por_el_titular',
  ADD COLUMN IF NOT EXISTS declarado_por uuid NULL REFERENCES public.usuarios(id);

ALTER TABLE public.consentimientos_biometricos
  DROP CONSTRAINT IF EXISTS consent_origen_valores;
ALTER TABLE public.consentimientos_biometricos
  ADD CONSTRAINT consent_origen_valores
  CHECK (origen IN ('otorgado_por_el_titular', 'declarado_por_quien_registra'));

-- Una declaración siempre tiene autor. Al revés no: una declaración que el
-- titular confirmó conserva quién la había declarado.
ALTER TABLE public.consentimientos_biometricos
  DROP CONSTRAINT IF EXISTS consent_declaracion_con_autor;
ALTER TABLE public.consentimientos_biometricos
  ADD CONSTRAINT consent_declaracion_con_autor
  CHECK (origen <> 'declarado_por_quien_registra' OR declarado_por IS NOT NULL);

COMMENT ON COLUMN public.consentimientos_biometricos.origen IS
  'Quién dejó constancia: el TITULAR (otorgado_por_el_titular) o quien registró '
  'la visita con la casilla del formulario (declarado_por_quien_registra, ADR-032).';
COMMENT ON COLUMN public.consentimientos_biometricos.declarado_por IS
  'La cuenta que marcó la casilla. Nula si el titular otorgó el consentimiento '
  'directamente.';

-- 2 · la casilla de cada autorización -------------------------------------------
ALTER TABLE public.autorizaciones
  ADD COLUMN IF NOT EXISTS consentimiento_declarado_por uuid NULL REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS consentimiento_declarado_en  timestamptz NULL,
  ADD COLUMN IF NOT EXISTS consentimiento_texto_version text NULL;

ALTER TABLE public.autorizaciones
  DROP CONSTRAINT IF EXISTS autorizaciones_declaracion_completa;
ALTER TABLE public.autorizaciones
  ADD CONSTRAINT autorizaciones_declaracion_completa CHECK (
    (consentimiento_declarado_por IS NULL
     AND consentimiento_declarado_en IS NULL
     AND consentimiento_texto_version IS NULL)
    OR
    (consentimiento_declarado_por IS NOT NULL
     AND consentimiento_declarado_en IS NOT NULL
     AND consentimiento_texto_version IS NOT NULL
     AND length(consentimiento_texto_version) BETWEEN 1 AND 50));

COMMENT ON COLUMN public.autorizaciones.consentimiento_declarado_por IS
  'Quién marcó la casilla «El visitante autorizó el uso de su foto para el '
  'ingreso» al generar esta autorización (ADR-032).';
COMMENT ON COLUMN public.autorizaciones.consentimiento_texto_version IS
  'La versión del texto de la casilla que se marcó.';

-- 3 · índices de la lista de visitas --------------------------------------------
CREATE INDEX IF NOT EXISTS autorizaciones_por_inicio_idx
  ON public.autorizaciones (copropiedad_id, lower(vigencia));
CREATE INDEX IF NOT EXISTS autorizaciones_por_vivienda_inicio_idx
  ON public.autorizaciones (copropiedad_id, vivienda_id, lower(vigencia) DESC);
CREATE INDEX IF NOT EXISTS plantillas_por_autorizacion_idx
  ON public.plantillas_biometricas (copropiedad_id, autorizacion_id)
  WHERE autorizacion_id IS NOT NULL;
