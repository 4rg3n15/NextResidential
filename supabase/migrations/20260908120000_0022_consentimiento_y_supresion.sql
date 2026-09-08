-- =============================================================================
-- 0022 · El consentimiento manda sobre la sincronización, y la revocación
--        suprime sin esperar a nadie
--
-- RN-09, RN-10, RN-11 · CA-09, CA-10, CA-11 · Ley 1581 de 2012
--
-- La ETAPA 01 dejó dos cerrojos sobre `plantillas_biometricas`: la clave ajena
-- NOT NULL al consentimiento (nivel 1) y el disparador que impide la TRANSICIÓN
-- a un estado sincronizable sin consentimiento vigente (nivel 2, migración
-- 0013). Esta migración cierra lo que quedaba abierto y que solo se ve cuando
-- se escribe el caso de uso que lo usaría.
-- =============================================================================

-- 1 · El hueco: `plantilla_sincronizaciones` no tenía cerrojo ------------------
--
-- «Sincronizar» no es cambiar el estado de la plantilla: es escribir la fila que
-- dice «esta plantilla está en ESTE equipo». Esa tabla no tenía ningún
-- disparador, así que la fila podía insertarse con el consentimiento
-- `pendiente`, `rechazado` o `revocado`. Los dos cerrojos de la 0013 vigilaban
-- la puerta de al lado.
--
-- Es la misma familia que la clave ajena imposible de la ETAPA 06: una garantía
-- que parecía completa, con una puerta abierta que nadie veía **porque no había
-- filas que la cruzaran**. Aquí la puerta da al dato más sensible del sistema.
CREATE OR REPLACE FUNCTION app.tg_sincronizacion_exige_consentimiento()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_estado estado_consentimiento;
BEGIN
  -- Suprimir SIEMPRE se permite, y con más razón tras una revocación: el
  -- cerrojo protege de propagar el dato, nunca de retirarlo.
  IF NEW.estado = 'suprimida' THEN
    RETURN NEW;
  END IF;

  SELECT c.estado INTO v_estado
    FROM public.plantillas_biometricas p
    JOIN public.consentimientos_biometricos c ON c.id = p.consentimiento_id
   WHERE p.id = NEW.plantilla_id;

  IF v_estado IS DISTINCT FROM 'vigente' THEN
    RAISE EXCEPTION
      'Sin consentimiento vigente del titular no se registra sincronizacion de '
      'plantilla en terminal (consentimiento en estado %). RN-09, CA-09',
      COALESCE(v_estado::text, 'inexistente')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_sincronizacion_consentimiento ON public.plantilla_sincronizaciones;
CREATE TRIGGER tg_sincronizacion_consentimiento
  BEFORE INSERT OR UPDATE ON public.plantilla_sincronizaciones
  FOR EACH ROW EXECUTE FUNCTION app.tg_sincronizacion_exige_consentimiento();

-- 2 · Revocar suprime YA, sin esperar al barrido (RN-11, CA-11) ---------------
--
-- CA-11 exige que al revocar el consentimiento la plantilla se suprima «de
-- inmediato». Dejarlo en manos del trabajo programado de pg-boss haría que el
-- cumplimiento dependiera de que un worker esté vivo: si está caído, el dato
-- sigue ahí y la revocación fue decorativa.
--
-- Este disparador hace en la MISMA TRANSACCIÓN de la revocación lo único que no
-- puede esperar: borra el vector y marca la plantilla. Lo que sí puede esperar
-- —retirarla de cada terminal, que exige hablar con el hardware— queda encolado
-- como `pendiente_supresion` en `plantilla_sincronizaciones` y lo ejecuta el
-- adaptador (ETAPA 15). La distinción es deliberada: lo que está bajo control
-- de la base se hace ya; lo que depende de una red ajena se encola y se
-- acredita.
CREATE OR REPLACE FUNCTION app.tg_revocacion_suprime_plantillas()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado <> 'revocado' OR OLD.estado = 'revocado' THEN
    RETURN NEW;
  END IF;

  UPDATE public.plantillas_biometricas
     SET vector_cifrado  = NULL,
         llave_ref       = NULL,
         algoritmo       = NULL,
         estado          = 'suprimida',
         suprimir_en     = LEAST(suprimir_en, NEW.revocado_en),
         suprimida_en    = NEW.revocado_en,
         actualizado_en  = now(),
         actualizado_por = NEW.actualizado_por
   WHERE consentimiento_id = NEW.id
     AND estado <> 'suprimida';

  -- Las terminales que ya la tienen NO se tocan aquí, y esto es el resultado de
  -- un defecto que la prueba destapó.
  --
  -- La primera versión les ponía `estado = 'pendiente'` para encolar la
  -- retirada, y el cerrojo del punto 1 la rechazaba: con el consentimiento ya
  -- revocado, la única transición que ese cerrojo admite es a `suprimida`. Dos
  -- garantías escritas la misma tarde chocando entre sí — y el fallo era del
  -- encolado, no del cerrojo, porque `'pendiente'` en esa tabla significa
  -- «pendiente de SINCRONIZAR». Marcar una retirada con el estado que pide lo
  -- contrario habría sido, además de un choque, una mentira en la fila.
  --
  -- La cola de retirada no necesita estado propio: es una CONSULTA. Toda fila
  -- `sincronizada` cuya plantilla esté `suprimida` es una plantilla que sigue
  -- en un equipo y debe salir de él. Un estado derivable no se persiste: no
  -- puede desincronizarse de aquello que lo determina.
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_revocacion_suprime ON public.consentimientos_biometricos;
CREATE TRIGGER tg_revocacion_suprime
  AFTER UPDATE ON public.consentimientos_biometricos
  FOR EACH ROW EXECUTE FUNCTION app.tg_revocacion_suprime_plantillas();

-- 2b · La cola de retirada, como índice de la consulta que la define ---------
-- Lo que el adaptador de la ETAPA 15 recorrerá: plantillas suprimidas que
-- todavía constan en algún equipo.
CREATE INDEX IF NOT EXISTS sincronizaciones_por_retirar_idx
  ON public.plantilla_sincronizaciones (copropiedad_id, plantilla_id)
  WHERE estado = 'sincronizada';

COMMENT ON INDEX public.sincronizaciones_por_retirar_idx IS
  'Sostiene la cola de retirada de CA-10: filas sincronizadas cuya plantilla '
  'quedo suprimida. La cola no tiene estado propio porque es derivable, y un '
  'estado derivable que se persiste acaba desincronizado de su origen.';

-- 3 · La cota legal, también cuando no hay autorización que la fije -----------
--
-- El disparador `tg_plantilla_retencion` (0016) ata `suprimir_en` a la vigencia
-- de la autorización **y devuelve antes de comprobar nada cuando la plantilla
-- es de un residente**, porque su ciclo no lo fija una autorización. Correcto en
-- su intención y con una consecuencia no querida: en ese camino `suprimir_en`
-- admitía cualquier valor, el año 3000 incluido. Un plazo que se puede fijar
-- arbitrariamente lejos es, a efectos del principio de finalidad, no tener
-- plazo.
--
-- La cota va como CHECK y no como valor por defecto: un DEFAULT se sobrescribe
-- pasando otro valor; un CHECK no. Se fija en cinco años, que excede con holgura
-- cualquier permanencia razonable de un residente y sigue siendo un plazo.
ALTER TABLE public.plantillas_biometricas
  DROP CONSTRAINT IF EXISTS plantillas_supresion_acotada,
  ADD  CONSTRAINT plantillas_supresion_acotada
       CHECK (suprimir_en > creado_en AND suprimir_en <= creado_en + interval '5 years');

COMMENT ON CONSTRAINT plantillas_supresion_acotada ON public.plantillas_biometricas IS
  'Cota superior absoluta del plazo de conservacion (Ley 1581 art. 4 lit. d, '
  'principio de finalidad). El plazo REAL de un visitante lo fija su '
  'autorizacion mas el margen de la copropiedad (0016, <= 24 h por CHECK); '
  'esta cota cubre el camino en que no hay autorizacion que lo fije.';

-- 4 · Verificación de la propia migración -------------------------------------
-- No basta con crear los disparadores: hay que comprobar que quedaron ACTIVOS.
-- La lección es de ADR-005: `tgenabled` distingue el disparador que existe del
-- que además corre.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgname IN ('tg_sincronizacion_consentimiento','tg_revocacion_suprime')
     AND NOT tgisinternal AND tgenabled = 'O';
  IF n <> 2 THEN
    RAISE EXCEPTION 'Los cerrojos de consentimiento deben existir y estar habilitados: % de 2', n;
  END IF;

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname = 'plantillas_supresion_acotada' AND convalidated;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Falta la cota legal de supresion como CHECK validado';
  END IF;
END
$$;
