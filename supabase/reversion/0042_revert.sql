-- Reversión de la migración 0042 (ETAPA 15-L · porteros por identificador,
-- lista blanca de IP y modo pruebas · ADR-031).
--
-- Pierde los pools, los identificadores de portero, las IP de portería y de
-- guardia remota, el interruptor de modo pruebas y las sesiones registradas
-- del superadministrador. Los porteros vuelven a entrar como antes de la
-- 0042 sólo si la API vuelve a la versión anterior (ADR-023). No borra
-- historial: los intentos fallidos siguen en auditoria_seguridad. El valor
-- `restriccion_de_ip` del enumerado se queda (PostgreSQL no lo retira).
\set ON_ERROR_STOP on

-- NOT VALID, por lo mismo: las bajas ya anotadas se quedan.
ALTER TABLE public.bitacora_de_porteria DROP CONSTRAINT IF EXISTS bitacora_porteria_tipo;
ALTER TABLE public.bitacora_de_porteria ADD CONSTRAINT bitacora_porteria_tipo CHECK (tipo IN (
  'inicio_de_sesion', 'acceso_rechazado', 'cierre_de_sesion',
  'inicio_de_patrullaje', 'fin_de_patrullaje', 'codigo_incorrecto',
  'turno_asignado', 'turno_extra', 'turno_editado', 'turno_retirado', 'solape_de_turno',
  'alta_de_portero', 'edicion_de_portero',
  'restablecimiento_de_contrasena', 'cambio_de_contrasena')) NOT VALID;

DROP INDEX IF EXISTS public.auditoria_intentos_fallidos_idx;
-- NOT VALID: las filas `401` ya escritas se quedan (append-only); sólo no entran más.
ALTER TABLE public.auditoria_seguridad DROP CONSTRAINT IF EXISTS auditoria_resultado_valores;
ALTER TABLE public.auditoria_seguridad ADD CONSTRAINT auditoria_resultado_valores
  CHECK (resultado IN ('403','404','409','429','permitido')) NOT VALID;
DROP TABLE IF EXISTS public.sesiones_de_superadministrador;
DROP TABLE IF EXISTS public.ajustes_globales;

CREATE OR REPLACE FUNCTION app.tg_copropiedad_ajustes_de_plataforma()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.usuario_id() IS NULL OR app.rol() = 'superadministrador' THEN
    RETURN NEW;
  END IF;
  IF NEW.codigo_corto IS DISTINCT FROM OLD.codigo_corto
     OR NEW.telefono_porteria IS DISTINCT FROM OLD.telefono_porteria
     OR NEW.tope_vehiculos_propios IS DISTINCT FROM OLD.tope_vehiculos_propios
     OR NEW.aprobacion_de_terceros IS DISTINCT FROM OLD.aprobacion_de_terceros THEN
    RAISE EXCEPTION 'Código de acceso, teléfono de portería, tope de vehículos y aprobación '
                    'los cambia sólo el superadministrador (D1, D5, D7)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_ips_porteria_cuantas;
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_ips_guardia_remota_cuantas;
ALTER TABLE public.copropiedades DROP COLUMN IF EXISTS ips_porteria;
ALTER TABLE public.copropiedades DROP COLUMN IF EXISTS ips_guardia_remota;

ALTER TABLE public.perfiles_de_portero DROP CONSTRAINT IF EXISTS perfiles_portero_documento_formato;
ALTER TABLE public.perfiles_de_portero DROP COLUMN IF EXISTS documento;

DROP FUNCTION IF EXISTS app.asignar_numero_de_portero(uuid);
DROP TRIGGER IF EXISTS tg_numero_de_portero ON public.usuarios;
DROP FUNCTION IF EXISTS app.tg_numero_de_portero();
DROP INDEX IF EXISTS public.usuarios_numero_de_portero_uk;
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_numero_de_portero_rango;
ALTER TABLE public.usuarios DROP COLUMN IF EXISTS numero_de_portero;

DROP TRIGGER IF EXISTS tg_pool_de_porteros ON public.copropiedades;
DROP FUNCTION IF EXISTS app.tg_pool_de_porteros();
DROP TABLE IF EXISTS public.pools_de_porteros;
DROP SEQUENCE IF EXISTS public.pools_de_porteros_numero_seq;
