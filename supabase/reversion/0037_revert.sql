-- Reversión de la migración 0037 (ETAPA 15-H · identidad por usuario y portería).
--
-- ADVERTENCIA: elimina la bitácora de portería, que es de solo inserción. Es un
-- rastro de auditoría: exige respaldo verificado y autorización escrita, y el
-- guion la exige con una variable de confirmación, igual que la 0011.
-- Las cuentas por usuario (correo sintético en auth.users) NO se tocan aquí:
-- deben darse de baja antes desde la API, o quedarán sin fila en usuarios.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('ncr.confirmo_revertir_0037', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'Reversión de 0037 NO confirmada. Para continuar: SET ncr.confirmo_revertir_0037 = ''si'';';
  END IF;
END
$$;

DROP TABLE IF EXISTS public.bitacora_de_porteria;
DROP TABLE IF EXISTS public.sesiones_de_porteria;
DROP TABLE IF EXISTS public.turnos_de_porteria;
DROP TABLE IF EXISTS public.perfiles_de_portero;
DROP FUNCTION IF EXISTS app.tg_sesion_cerrada_no_se_reabre();
DROP FUNCTION IF EXISTS app.tg_franja_de_turno();

DROP TRIGGER IF EXISTS tg_usuario_campos_propios ON public.usuarios;
DROP FUNCTION IF EXISTS app.tg_usuario_campos_propios();

-- El gancho vuelve a la versión de 0024: se reaplica ese fichero.
\ir ../migrations/20260909120100_0024_hook_de_claims.sql

DROP INDEX IF EXISTS public.usuarios_nombre_usuario_uk;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_usuario_con_copropiedad;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_identificador_de_acceso;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_nombre_usuario_formato;
-- Sólo si no quedan cuentas sin correo: si las hay, se detiene aquí.
ALTER TABLE public.usuarios ALTER COLUMN correo SET NOT NULL;
ALTER TABLE public.usuarios DROP COLUMN IF EXISTS debe_cambiar_contrasena;
ALTER TABLE public.usuarios DROP COLUMN IF EXISTS nombre_usuario;
