-- =============================================================================
-- 0020 · Umbral de latido por copropiedad · P-06 · CA-26 · RN-12 · ETAPA 06
--
-- P-06 («umbral de latido de dispositivo») queda RESUELTA por el usuario el
-- 2026-09-07: umbral conservador y **configurable por copropiedad**.
--
-- La migración 0004 ya traía `umbral_latido_dispositivo` (5 minutos), que es el
-- silencio tras el cual un equipo se da por CAÍDO. Faltaban las dos piezas que
-- hacen útil el escalón intermedio: cada cuánto se espera el latido y cuántos
-- se toleran antes de marcar `degradado`.
--
-- POR QUÉ TRES ESTADOS Y NO DOS. Con un solo umbral hay que elegir entre
-- alertar por cada hipo de la red —y que el operador deje de mirar la consola—
-- o esperar tanto que la alerta llegue cuando la puerta lleva media hora sin
-- control. `degradado` separa «se saltó un latido» de «lleva minutos mudo», y
-- solo el segundo levanta alerta. El dominio lo implementa en
-- `packages/domain-core/src/eventos/latido.ts`; aquí vive su configuración.
--
-- La restricción de coherencia NO es decorativa: con un silencio menor o igual
-- al margen tolerado, el estado `degradado` sería inalcanzable y la alerta
-- llegaría siempre tarde, sin ningún síntoma visible. Es exactamente la clase
-- de configuración incoherente que solo se descubre el día que falla.
-- =============================================================================

ALTER TABLE public.copropiedades
  ADD COLUMN IF NOT EXISTS periodo_latido     interval NOT NULL DEFAULT '60 seconds',
  ADD COLUMN IF NOT EXISTS latidos_tolerados  smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.copropiedades.periodo_latido IS
  'Cadencia con la que se espera el latido del dispositivo (P-06).';
COMMENT ON COLUMN public.copropiedades.latidos_tolerados IS
  'Latidos perdidos que se toleran antes de marcar el dispositivo degradado (P-06).';
COMMENT ON COLUMN public.copropiedades.umbral_latido_dispositivo IS
  'Silencio total tras el cual el dispositivo se da por CAIDO y levanta alerta '
  '(P-06, CA-26). Debe superar periodo_latido * (latidos_tolerados + 1).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'copropiedades_latidos_no_negativos'
  ) THEN
    ALTER TABLE public.copropiedades
      ADD CONSTRAINT copropiedades_latidos_no_negativos CHECK (latidos_tolerados >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'copropiedades_periodo_latido_positivo'
  ) THEN
    ALTER TABLE public.copropiedades
      ADD CONSTRAINT copropiedades_periodo_latido_positivo CHECK (periodo_latido > interval '0');
  END IF;

  -- Coherencia entre los tres valores. Espejo exacto de `umbralCoherente` en el
  -- dominio: la misma regla en los dos sitios, porque el dominio protege al
  -- caso de uso y la base protege a cualquier otra vía de escritura.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'copropiedades_umbral_latido_coherente'
  ) THEN
    ALTER TABLE public.copropiedades
      ADD CONSTRAINT copropiedades_umbral_latido_coherente
      CHECK (umbral_latido_dispositivo > periodo_latido * (latidos_tolerados + 1));
  END IF;
END
$$;

-- Aserción de despliegue: si alguien retira la coherencia, la migración falla.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname IN ('copropiedades_umbral_latido_coherente',
                     'copropiedades_periodo_latido_positivo',
                     'copropiedades_latidos_no_negativos');
  ASSERT n = 3, format('0020: faltan restricciones de coherencia del latido (%s de 3)', n);
END
$$;
