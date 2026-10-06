-- =============================================================================
-- 0055 · RONDA 15-W · AUTORREGISTRO CON CÓDIGO Y TITULAR ASIGNADO POR LA
--        ADMINISTRACIÓN
--
-- Decisiones del cliente D-W1, D-W2, D-W8 y D-W9 (docs/auditoria/
-- contradicciones-y-supuestos.md §3 quinquies) · ADR-037.
--
--   1 · usuarios.origen_de_alta: 'administracion' (la cuenta la dio la
--       administración —el titular, D-W9— o es anterior a esta ronda) o
--       'autorregistro' («Crear cuenta» con un código de plaza, D-W1).
--   2 · bitacora_de_residentes: los tipos de hecho nuevos. Los códigos fallidos
--       del registro se anotan ANTES de que exista la cuenta (`usuario_id`
--       NULL) y con un HMAC de la IP en `detalle`, nunca la IP en claro.
--   3 · app.tg_cuenta_solo_mayores: ninguna cuenta queda atada a una persona
--       menor de 18 años (D-W2). Es la segunda barrera: la primera es el
--       dominio (`edadEn`, `puedeTenerCuenta`), con el reloj inyectado. Y la
--       misma regla desde el otro lado: la fecha de nacimiento de una persona
--       CON cuenta no se cambia por la de un menor (si no, el criterio «ninguna
--       cuenta vinculada a un menor, tampoco por la base» tendría una puerta).
--
-- Idempotente y sin órdenes de psql (scripts/lib/migraciones-sin-psql.mjs).
-- Reversión: supabase/reversion/0055_revert.sql.
-- =============================================================================

-- 1 · usuarios.origen_de_alta --------------------------------------------------
ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS origen_de_alta text NOT NULL DEFAULT 'administracion';
ALTER TABLE public.usuarios DROP CONSTRAINT IF EXISTS usuarios_origen_de_alta;
ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_origen_de_alta
  CHECK (origen_de_alta IN ('administracion', 'autorregistro'));
COMMENT ON COLUMN public.usuarios.origen_de_alta IS
  'D-W1 · D-W9 · ADR-037 · administracion (la dio la administración: el titular de cada vivienda, '
  'o una cuenta anterior a la 15-W) o autorregistro («Crear cuenta» con un código de plaza).';

-- La cuenta no se cambia a sí misma su ORIGEN por la REST: se añade a los campos
-- que `tg_usuario_campos_propios` (0037) ya protegía. Lo demás, idéntico.
CREATE OR REPLACE FUNCTION app.tg_usuario_campos_propios()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.usuario_id() IS NULL OR OLD.id IS DISTINCT FROM app.usuario_id()
     OR app.rol() IN ('superadministrador', 'administrador', 'servicio') THEN
    RETURN NEW;
  END IF;
  IF app.rol() = 'portero' THEN
    RAISE EXCEPTION 'El portero ve su perfil y no lo edita (E-02, B3)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.nombre_usuario IS DISTINCT FROM OLD.nombre_usuario
     OR NEW.debe_cambiar_contrasena IS DISTINCT FROM OLD.debe_cambiar_contrasena
     OR NEW.copropiedad_id IS DISTINCT FROM OLD.copropiedad_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.persona_id IS DISTINCT FROM OLD.persona_id
     OR NEW.estado IS DISTINCT FROM OLD.estado
     OR NEW.mfa_habilitado IS DISTINCT FROM OLD.mfa_habilitado
     OR NEW.origen_de_alta IS DISTINCT FROM OLD.origen_de_alta THEN
    RAISE EXCEPTION 'Una cuenta no puede cambiarse a sí misma su identidad ni su estado (ADR-023)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

-- 2 · bitacora_de_residentes: los tipos de hecho de la 15-W -------------------
-- Se conservan TODOS los de la 0038 y se añaden los nuevos. `registro_reanudado`
-- es la marca con la que el superadministrador levanta la suspensión del
-- registro: la suspensión se cuenta desde la última reanudación.
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
  'visita_revocada_por_residente'));

-- Los fallos del registro se cuentan por copropiedad en la última hora (§7):
-- este índice parcial lo hace sin recorrer la bitácora entera.
CREATE INDEX IF NOT EXISTS bitacora_residentes_registro_idx
  ON public.bitacora_de_residentes (copropiedad_id, ocurrido_en DESC)
  WHERE tipo IN ('registro_codigo_incorrecto', 'registro_suspendido_por_intentos',
                 'registro_reanudado');

COMMENT ON TABLE public.bitacora_de_residentes IS
  'ETAPA 15-I · 15-W · rastro de SOLO INSERCIÓN de altas, vinculaciones (y códigos equivocados, '
  'que cuentan para el límite de intentos, también los del registro antes de que exista la '
  'cuenta), ocupantes, menores y vehículos propios. Mismas tres capas que eventos (ADR-005). El '
  'documento de identidad y la IP en claro NUNCA se escriben aquí.';

-- 3 · ninguna cuenta para un menor (D-W2) --------------------------------------
-- La fecha de HOY es la de Bogotá, como en el dominio (`edadEn`): a las 20:00
-- del día anterior al cumpleaños en Bogotá ya es el día siguiente en UTC, y la
-- base no puede dejar pasar lo que el dominio negó. Restar el intervalo da la
-- misma regla para el 29 de febrero que el dominio: en los años no bisiestos,
-- la mayoría de edad se cumple el 1 de marzo (S-15W-06).
CREATE OR REPLACE FUNCTION app.es_menor_de_edad(p_nacimiento date)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_nacimiento IS NOT NULL
     AND p_nacimiento > ((now() AT TIME ZONE 'America/Bogota')::date - interval '18 years')::date
$$;
COMMENT ON FUNCTION app.es_menor_de_edad(date) IS
  'D-W2 · S-15W-06 · menor de 18 años HOY en Bogotá. NULL (fecha desconocida) no es menor: la '
  'fecha la exige el dominio en el alta; aquí sólo se niega lo que se sabe.';

-- Si la persona no es VISIBLE con los claims de quien escribe, la edad no se
-- puede comprobar y se niega (falla cerrado). Sin claims —migraciones,
-- semillas, el dueño— pasa, como en el resto del esquema.
CREATE OR REPLACE FUNCTION app.tg_cuenta_solo_mayores()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_nacimiento date;
BEGIN
  IF NEW.persona_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT p.fecha_nacimiento INTO v_nacimiento FROM public.personas p WHERE p.id = NEW.persona_id;
  IF NOT FOUND AND app.usuario_id() IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede comprobar la edad de la persona de esta cuenta (D-W2)'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'usuarios_solo_mayores';
  END IF;
  IF app.es_menor_de_edad(v_nacimiento) THEN
    RAISE EXCEPTION 'Las cuentas son para mayores de edad (D-W2)'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'usuarios_solo_mayores';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_cuenta_solo_mayores ON public.usuarios;
CREATE TRIGGER tg_cuenta_solo_mayores BEFORE INSERT OR UPDATE OF persona_id ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION app.tg_cuenta_solo_mayores();

CREATE OR REPLACE FUNCTION app.tg_persona_con_cuenta_solo_mayor()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.es_menor_de_edad(NEW.fecha_nacimiento)
     AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.persona_id = NEW.id) THEN
    RAISE EXCEPTION 'Esta persona tiene cuenta: su fecha no puede ser la de un menor de edad (D-W2)'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'usuarios_solo_mayores';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_persona_con_cuenta_solo_mayor ON public.personas;
CREATE TRIGGER tg_persona_con_cuenta_solo_mayor BEFORE UPDATE OF fecha_nacimiento ON public.personas
  FOR EACH ROW EXECUTE FUNCTION app.tg_persona_con_cuenta_solo_mayor();

-- 4 · aserciones de despliegue --------------------------------------------------
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgname = 'tg_cuenta_solo_mayores' AND tgrelid = 'public.usuarios'::regclass
     AND tgenabled <> 'D';
  ASSERT n = 1, '0055: falta el disparador de mayoría de edad en usuarios (D-W2)';
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgname = 'tg_persona_con_cuenta_solo_mayor' AND tgrelid = 'public.personas'::regclass
     AND tgenabled <> 'D';
  ASSERT n = 1, '0055: falta el disparador de mayoría de edad en personas (D-W2)';
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname = 'usuarios_origen_de_alta' AND conrelid = 'public.usuarios'::regclass;
  ASSERT n = 1, '0055: falta la restricción del origen de la cuenta';
END
$$;
