-- Reversión de la migración 0056 (ronda 15-W · menores del hogar y plazas del
-- titular).
--
-- ADVERTENCIA:
--  · `tarjeta_identidad` y `registro_civil` NO salen de `tipo_documento`:
--    PostgreSQL no borra valores de un enum, y las personas registradas con
--    ellos los conservan. Es inocuo: ninguna ruta anterior a la 15-W los ofrece.
--  · Las plazas que ocupa un menor QUEDAN LIBRES al borrar `persona_id` (el
--    menor sigue siendo residente de su vivienda). Para que un código de
--    invitación anterior no reviva, la reversión sube su `generacion` antes.
--  · Los topes de plazas desaparecen: el número de plazas vuelve a cambiarlo
--    solo el superadministrador (D6 de la 0038).
-- Exige la variable de confirmación, como la 0038.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF current_setting('ncr.confirmo_revertir_0056', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'Reversión de 0056 NO confirmada. Para continuar: SET ncr.confirmo_revertir_0056 = ''si'';';
  END IF;
END
$$;

-- 4 · los topes ---------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_tope_de_plazas ON public.plazas_de_ocupante;
DROP FUNCTION IF EXISTS app.tg_tope_de_plazas();
DROP TRIGGER IF EXISTS tg_conservar_plazas_al_bajar_el_tope ON public.copropiedades;
DROP FUNCTION IF EXISTS app.tg_conservar_plazas_al_bajar_el_tope();
DROP FUNCTION IF EXISTS app.conservar_plazas_sobre_el_tope(uuid);
DROP POLICY IF EXISTS viviendas_tope_plataforma ON public.viviendas;
DROP TRIGGER IF EXISTS tg_tope_de_plazas_de_la_vivienda ON public.viviendas;
DROP FUNCTION IF EXISTS app.tg_tope_de_plazas_de_la_vivienda();
DROP TRIGGER IF EXISTS tg_tope_de_plazas_de_la_copropiedad ON public.copropiedades;
DROP FUNCTION IF EXISTS app.tg_tope_de_plazas_de_la_copropiedad();
DROP FUNCTION IF EXISTS app.plazas_activas(uuid);
ALTER TABLE public.viviendas DROP CONSTRAINT IF EXISTS viviendas_tope_de_plazas;
ALTER TABLE public.viviendas DROP COLUMN IF EXISTS tope_de_plazas;
ALTER TABLE public.copropiedades DROP CONSTRAINT IF EXISTS copropiedades_tope_de_plazas;
ALTER TABLE public.copropiedades DROP COLUMN IF EXISTS tope_de_plazas_por_vivienda;

-- 3 · el disparador de las plazas, como lo dejó la 0038 -------------------------
CREATE OR REPLACE FUNCTION app.tg_plazas_solo_superadministrador()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app.usuario_id() IS NULL OR app.rol() = 'superadministrador' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.ocupacion_de_viviendas o
                WHERE o.vivienda_id = NEW.vivienda_id AND o.declarada_en IS NOT NULL) THEN
      RAISE EXCEPTION 'El número de ocupantes ya se declaró: sólo el superadministrador lo cambia (D6)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.estado IS DISTINCT FROM OLD.estado OR NEW.numero IS DISTINCT FROM OLD.numero
        OR NEW.vivienda_id IS DISTINCT FROM OLD.vivienda_id THEN
    RAISE EXCEPTION 'Sólo el superadministrador añade o quita ocupantes (D6)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tg_plazas_solo_superadministrador ON public.plazas_de_ocupante;
CREATE TRIGGER tg_plazas_solo_superadministrador BEFORE INSERT OR UPDATE ON public.plazas_de_ocupante
  FOR EACH ROW EXECUTE FUNCTION app.tg_plazas_solo_superadministrador();

-- 2 · la persona sin cuenta que ocupa una plaza ---------------------------------
-- Sin claims: el disparador de la 0038 deja pasar al dueño.
UPDATE public.plazas_de_ocupante SET generacion = generacion + 1 WHERE persona_id IS NOT NULL;
DROP INDEX IF EXISTS public.plazas_persona_uk;
ALTER TABLE public.plazas_de_ocupante DROP CONSTRAINT IF EXISTS plazas_cuenta_o_persona;
ALTER TABLE public.plazas_de_ocupante DROP CONSTRAINT IF EXISTS plazas_persona_fk;
ALTER TABLE public.plazas_de_ocupante DROP COLUMN IF EXISTS persona_id;
