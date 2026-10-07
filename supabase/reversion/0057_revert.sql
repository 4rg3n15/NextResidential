-- Reversión de la migración 0057 (ronda 15-X · el rostro del residente).
--
-- ADVERTENCIA:
--  · No se revierte con consentimientos de representante legal VIVOS
--    (pendiente o vigente): revóquelos antes desde la app o la consola; la
--    revocación suprime el rostro del menor también en las terminales.
--  · Los consentimientos de representante legal YA REVOCADOS son historia
--    (Ley 1581: quién autorizó y cuándo). Si existe alguno, el origen
--    'autorizado_por_representante_legal' SIGUE admitido por el CHECK, como
--    los valores de enum que la 0056 no puede retirar; ninguna ruta anterior a
--    la 15-X lo escribe.
--  · Sin el índice único, dos rostros vivos de un residente vuelven a ser
--    posibles: la API anterior a la 15-X no los crea.
-- Exige la variable de confirmación, como la 0056.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('ncr.confirmo_revertir_0057', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'Reversión de 0057 NO confirmada. Para continuar: SET ncr.confirmo_revertir_0057 = ''si'';';
  END IF;
  IF EXISTS (SELECT 1 FROM public.consentimientos_biometricos
              WHERE origen = 'autorizado_por_representante_legal'
                AND estado IN ('pendiente', 'vigente')) THEN
    RAISE EXCEPTION 'Hay consentimientos de representante legal vivos: revóquelos antes de revertir la 0057 (la revocación suprime el rostro del menor).';
  END IF;
END
$$;

-- 4 · los hechos del rostro en la bitácora: si ya hay alguno, se conservan --------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bitacora_de_residentes
              WHERE tipo IN ('rostro_registrado', 'rostro_retirado',
                             'rostro_de_menor_registrado', 'rostro_de_menor_retirado')) THEN
    RAISE NOTICE 'La bitácora ya tiene hechos del rostro: es append-only y el CHECK los sigue admitiendo.';
  ELSE
    ALTER TABLE public.bitacora_de_residentes DROP CONSTRAINT IF EXISTS bitacora_residentes_tipo;
    ALTER TABLE public.bitacora_de_residentes ADD CONSTRAINT bitacora_residentes_tipo CHECK (tipo IN (
      'alta_de_cuenta', 'vinculacion', 'vinculacion_rechazada', 'codigo_incorrecto',
      'vinculacion_bloqueada', 'cambio_de_vivienda', 'ocupantes_declarados',
      'plaza_anadida', 'plaza_retirada', 'vehiculo_propio_registrado',
      'vehiculo_propio_rechazado_por_tope', 'vehiculo_propio_desactivado', 'perfil_editado',
      'autorregistro', 'autorregistro_rechazado', 'registro_codigo_incorrecto',
      'registro_suspendido_por_intentos', 'registro_reanudado',
      'titular_asignado_por_administracion', 'vivienda_asignada_por_administracion',
      'cuenta_bloqueada_por_edad',
      'menor_registrado', 'menor_editado', 'menor_dado_de_baja',
      'tope_de_plazas_cambiado',
      'vehiculo_propio_editado', 'vehiculo_propio_borrado',
      'visita_revocada_por_residente'));
  END IF;
END
$$;

-- 3 · el origen del representante legal ----------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.consentimientos_biometricos
              WHERE origen = 'autorizado_por_representante_legal') THEN
    RAISE NOTICE 'Se conservan consentimientos de representante legal revocados: el CHECK sigue admitiendo su origen.';
  ELSE
    ALTER TABLE public.consentimientos_biometricos DROP CONSTRAINT IF EXISTS consent_representante_con_autor;
    ALTER TABLE public.consentimientos_biometricos DROP CONSTRAINT IF EXISTS consent_origen_valores;
    ALTER TABLE public.consentimientos_biometricos ADD CONSTRAINT consent_origen_valores
      CHECK (origen IN ('otorgado_por_el_titular', 'declarado_por_quien_registra'));
    COMMENT ON COLUMN public.consentimientos_biometricos.origen IS
      'Quién dejó constancia: el TITULAR (otorgado_por_el_titular) o quien registró '
      'la visita con la casilla del formulario (declarado_por_quien_registra, ADR-032).';
  END IF;
END
$$;

-- 2 · una plantilla viva de residente por persona -------------------------------
DROP INDEX IF EXISTS public.plantillas_residente_viva_uk;
