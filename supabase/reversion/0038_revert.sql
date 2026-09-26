-- Reversión de la migración 0038 (ETAPA 15-I · residentes, acceso por código y
-- vehículos propios).
--
-- ADVERTENCIA: elimina la bitácora de residentes, que es de solo inserción. Es
-- un rastro de auditoría: exige respaldo verificado y autorización escrita, y el
-- guion la exige con una variable de confirmación, igual que la 0011 y la 0037.
-- Los vehículos registrados por residentes NO se borran: quedan como vehículos
-- del padrón sin origen (la columna desaparece) y sin sus ocupantes vinculados.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('ncr.confirmo_revertir_0038', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'Reversión de 0038 NO confirmada. Para continuar: SET ncr.confirmo_revertir_0038 = ''si'';';
  END IF;
END
$$;

DROP TABLE IF EXISTS public.bitacora_de_residentes;
DROP TABLE IF EXISTS public.plazas_de_ocupante;
DROP TABLE IF EXISTS public.vehiculos_ocupantes;
DROP FUNCTION IF EXISTS app.tg_plazas_solo_superadministrador();
DROP FUNCTION IF EXISTS app.tg_ocupante_de_la_vivienda();

DROP TABLE IF EXISTS public.ocupacion_de_viviendas;
DROP FUNCTION IF EXISTS app.tg_ocupacion_declarada();

DROP TRIGGER IF EXISTS tg_tope_vehiculos_propios ON public.vehiculos;
DROP FUNCTION IF EXISTS app.tg_tope_vehiculos_propios();
DROP INDEX IF EXISTS public.vehiculos_propios_por_vivienda_idx;
ALTER TABLE public.vehiculos DROP CONSTRAINT IF EXISTS vehiculos_origen_registro;
ALTER TABLE public.vehiculos DROP COLUMN IF EXISTS origen_registro;

ALTER TABLE public.personas DROP CONSTRAINT IF EXISTS personas_fecha_nacimiento_rango;
ALTER TABLE public.personas DROP CONSTRAINT IF EXISTS personas_apellidos_len;
ALTER TABLE public.personas DROP CONSTRAINT IF EXISTS personas_nombres_len;
ALTER TABLE public.personas DROP COLUMN IF EXISTS fecha_nacimiento;
ALTER TABLE public.personas DROP COLUMN IF EXISTS apellidos;
ALTER TABLE public.personas DROP COLUMN IF EXISTS nombres;

DROP TRIGGER IF EXISTS tg_copropiedad_ajustes_de_plataforma ON public.copropiedades;
DROP FUNCTION IF EXISTS app.tg_copropiedad_ajustes_de_plataforma();
DROP INDEX IF EXISTS public.copropiedades_codigo_corto_uk;
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_aprobacion_de_terceros;
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_tope_vehiculos_propios;
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_telefono_porteria_formato;
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_codigo_corto_formato;
ALTER TABLE public.copropiedades DROP COLUMN IF EXISTS aprobacion_de_terceros;
ALTER TABLE public.copropiedades DROP COLUMN IF EXISTS tope_vehiculos_propios;
ALTER TABLE public.copropiedades DROP COLUMN IF EXISTS telefono_porteria;
ALTER TABLE public.copropiedades DROP COLUMN IF EXISTS codigo_corto;
