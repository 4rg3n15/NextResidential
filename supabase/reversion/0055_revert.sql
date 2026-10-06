-- Reversión de la migración 0055 (ronda 15-W · autorregistro con código y
-- titular asignado por la administración).
--
-- ADVERTENCIA: borra `usuarios.origen_de_alta`, es decir, qué cuentas se
-- crearon con «Crear cuenta». El hecho sobrevive en la bitácora de residentes
-- (filas `autorregistro`), que es de SOLO INSERCIÓN y por eso no se toca: la
-- restricción de tipos vuelve a la de la 0038 como NOT VALID —rechaza los tipos
-- de la 15-W desde ahora, sin exigir borrar las filas que ya los usan—. Exige la
-- variable de confirmación, como la 0038.
--
-- Revertir la 0055 deja otra vez a la base sin la segunda barrera de la mayoría
-- de edad (D-W2): la API de la 15-W cuenta con ella. Se revierte junto con el
-- código, nunca sola.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('ncr.confirmo_revertir_0055', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'Reversión de 0055 NO confirmada. Para continuar: SET ncr.confirmo_revertir_0055 = ''si'';';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS tg_cuenta_solo_mayores ON public.usuarios;
DROP FUNCTION IF EXISTS app.tg_cuenta_solo_mayores();
DROP TRIGGER IF EXISTS tg_persona_con_cuenta_solo_mayor ON public.personas;
DROP FUNCTION IF EXISTS app.tg_persona_con_cuenta_solo_mayor();
DROP FUNCTION IF EXISTS app.es_menor_de_edad(date);

DROP INDEX IF EXISTS public.bitacora_residentes_registro_idx;
ALTER TABLE public.bitacora_de_residentes DROP CONSTRAINT IF EXISTS bitacora_residentes_tipo;
ALTER TABLE public.bitacora_de_residentes ADD CONSTRAINT bitacora_residentes_tipo CHECK (tipo IN (
  'alta_de_cuenta', 'vinculacion', 'vinculacion_rechazada', 'codigo_incorrecto',
  'vinculacion_bloqueada', 'cambio_de_vivienda', 'ocupantes_declarados',
  'plaza_anadida', 'plaza_retirada', 'vehiculo_propio_registrado',
  'vehiculo_propio_rechazado_por_tope', 'vehiculo_propio_desactivado', 'perfil_editado'))
  NOT VALID;
COMMENT ON TABLE public.bitacora_de_residentes IS
  'ETAPA 15-I · rastro de SOLO INSERCIÓN de altas, vinculaciones (y códigos equivocados, que '
  'cuentan para el límite de intentos), ocupantes y vehículos propios. Mismas tres capas que '
  'eventos (ADR-005). El documento de identidad NUNCA se escribe aquí.';

ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_origen_de_alta;
ALTER TABLE public.usuarios DROP COLUMN IF EXISTS origen_de_alta;
