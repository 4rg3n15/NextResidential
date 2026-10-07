-- =============================================================================
-- 0057 · RONDA 15-X · EL ROSTRO DEL RESIDENTE
--
-- Decisiones del cliente D-W3 y D-W4 (docs/auditoria/contradicciones-y-
-- supuestos.md) · ADR-039 · supuesto S-15W-01 (15 años CUMPLIDOS).
--
--   1 · Antes de nada, la ASERCIÓN: si alguna persona tiene ya dos o más
--       plantillas vivas sin autorización (el rostro de un residente), la
--       migración se detiene y las nombra. Cuál sobra no se decide en
--       silencio: lo decide quien opera, pasándolas a `pendiente_supresion`.
--   2 · `plantillas_residente_viva_uk`: a lo sumo UNA plantilla viva de
--       residente por persona. Viva = pendiente_consentimiento,
--       pendiente_sincronizacion o activa. La que se reemplaza pasa a
--       `pendiente_supresion` en la MISMA transacción en que entra la nueva, y
--       de dos reemplazos simultáneos uno gana y el otro choca aquí (409 en la
--       API, ADR-04). Las plantillas de visitante (con autorización) no cambian.
--   3 · `consent_origen_valores` admite 'autorizado_por_representante_legal':
--       el rostro de un menor de 15 a 17 años lo autoriza el TITULAR del hogar
--       como representante legal (RN-10, D3). Su autor es obligatorio:
--       `declarado_por` = la cuenta del titular (`consent_representante_con_autor`).
--   4 · la bitácora de residentes admite los hechos del rostro: registrado y
--       retirado, propio o de un menor. Sin bytes ni documento en `detalle`.
--
-- Idempotente y sin órdenes de psql (scripts/lib/migraciones-sin-psql.mjs).
-- Reversión: supabase/reversion/0057_revert.sql.
-- =============================================================================

-- 1 · la aserción previa -------------------------------------------------------
DO $$
DECLARE
  repetidas text;
BEGIN
  SELECT string_agg(format('%s en %s (%s)', d.persona_id, d.copropiedad_id, d.n), '; ')
    INTO repetidas
    FROM (SELECT p.copropiedad_id, p.persona_id, count(*) AS n
            FROM public.plantillas_biometricas p
           WHERE p.autorizacion_id IS NULL
             AND p.estado IN ('pendiente_consentimiento', 'pendiente_sincronizacion', 'activa')
           GROUP BY p.copropiedad_id, p.persona_id
          HAVING count(*) > 1) d;
  IF repetidas IS NOT NULL THEN
    RAISE EXCEPTION
      '0057: estas personas tienen más de una plantilla viva de residente: %. Pase las '
      'sobrantes a pendiente_supresion (la supresión las retira de las terminales) y '
      'vuelva a aplicar.', repetidas
      USING ERRCODE = 'unique_violation';
  END IF;
END
$$;

-- 2 · una plantilla viva de residente por persona -------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS plantillas_residente_viva_uk
  ON public.plantillas_biometricas (copropiedad_id, persona_id)
  WHERE autorizacion_id IS NULL
    AND estado IN ('pendiente_consentimiento', 'pendiente_sincronizacion', 'activa');

COMMENT ON INDEX public.plantillas_residente_viva_uk IS
  '15-X · ADR-039 · a lo sumo un rostro VIVO de residente por persona. El reemplazo '
  'pasa la anterior a pendiente_supresion en la misma transacción; dos reemplazos '
  'simultáneos: uno gana y el otro choca aquí (ADR-04).';

-- 3 · el origen del representante legal ----------------------------------------
ALTER TABLE public.consentimientos_biometricos
  DROP CONSTRAINT IF EXISTS consent_origen_valores;
ALTER TABLE public.consentimientos_biometricos
  ADD CONSTRAINT consent_origen_valores
  CHECK (origen IN ('otorgado_por_el_titular', 'declarado_por_quien_registra',
                    'autorizado_por_representante_legal'));

ALTER TABLE public.consentimientos_biometricos
  DROP CONSTRAINT IF EXISTS consent_representante_con_autor;
ALTER TABLE public.consentimientos_biometricos
  ADD CONSTRAINT consent_representante_con_autor
  CHECK (origen <> 'autorizado_por_representante_legal' OR declarado_por IS NOT NULL);

COMMENT ON COLUMN public.consentimientos_biometricos.origen IS
  'Quién dejó constancia: el TITULAR (otorgado_por_el_titular), quien registró la '
  'visita con la casilla del formulario (declarado_por_quien_registra, ADR-032) o el '
  'titular del hogar como representante legal de un menor de 15 a 17 años '
  '(autorizado_por_representante_legal, ADR-039).';
COMMENT ON COLUMN public.consentimientos_biometricos.declarado_por IS
  'La cuenta que marcó la casilla o que autorizó como representante legal. Nula si '
  'el titular otorgó el consentimiento directamente.';

-- 4 · los hechos del rostro en la bitácora de residentes ------------------------
ALTER TABLE public.bitacora_de_residentes DROP CONSTRAINT IF EXISTS bitacora_residentes_tipo;
ALTER TABLE public.bitacora_de_residentes ADD CONSTRAINT bitacora_residentes_tipo CHECK (tipo IN (
  -- 0038 (15-I)
  'alta_de_cuenta', 'vinculacion', 'vinculacion_rechazada', 'codigo_incorrecto',
  'vinculacion_bloqueada', 'cambio_de_vivienda', 'ocupantes_declarados',
  'plaza_anadida', 'plaza_retirada', 'vehiculo_propio_registrado',
  'vehiculo_propio_rechazado_por_tope', 'vehiculo_propio_desactivado', 'perfil_editado',
  -- 0055 (15-W)
  'autorregistro', 'autorregistro_rechazado', 'registro_codigo_incorrecto',
  'registro_suspendido_por_intentos', 'registro_reanudado',
  'titular_asignado_por_administracion', 'vivienda_asignada_por_administracion',
  'cuenta_bloqueada_por_edad',
  'menor_registrado', 'menor_editado', 'menor_dado_de_baja',
  'tope_de_plazas_cambiado',
  'vehiculo_propio_editado', 'vehiculo_propio_borrado',
  'visita_revocada_por_residente',
  -- 0057 (15-X)
  'rostro_registrado', 'rostro_retirado',
  'rostro_de_menor_registrado', 'rostro_de_menor_retirado'));
