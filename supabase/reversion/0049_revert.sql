-- Reversión de la migración 0049 (RONDA 15-Q · instantánea de reglas del Edge).
--
-- Vuelve a dejar la publicación de versiones sólo al administrador y el
-- disparador de versión consecutiva como lo escribió la 0013. Las versiones ya
-- publicadas se conservan (no hay borrado físico en `versiones_de_reglas`), así
-- que un Edge que vuelva a pedir la instantánea tras revertir recibirá un 503:
-- la API no puede publicar la siguiente con la identidad de servicio.
\set ON_ERROR_STOP on

DROP TRIGGER IF EXISTS tg_copropiedad_servicio_solo_version ON public.copropiedades;
DROP FUNCTION IF EXISTS app.tg_copropiedad_servicio_solo_version();
DROP POLICY IF EXISTS copropiedades_version_por_servicio ON public.copropiedades;
DROP POLICY IF EXISTS versiones_de_reglas_insercion_servicio ON public.versiones_de_reglas;

CREATE OR REPLACE FUNCTION app.tg_version_reglas_monotona()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_actual bigint;
BEGIN
  SELECT c.version_reglas_actual INTO v_actual
    FROM public.copropiedades c WHERE c.id = NEW.copropiedad_id FOR UPDATE;

  IF NEW.numero <> v_actual + 1 THEN
    RAISE EXCEPTION
      'La version de reglas debe ser consecutiva: se esperaba %, llego %. RN-16',
      v_actual + 1, NEW.numero
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.copropiedades
     SET version_reglas_actual = NEW.numero
   WHERE id = NEW.copropiedad_id;

  RETURN NEW;
END
$$;
