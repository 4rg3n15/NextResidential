-- =============================================================================
-- 0029 · Alta de viviendas: agrupación, tipo de copropiedad y clave compuesta
--
-- Tres cambios que se hacen JUNTOS porque tocan el mismo campo y porque hoy no
-- hay ni una vivienda cargada. Con el padrón dentro, cada uno de los tres pasa
-- a exigir migración de datos; hoy son catálogo.
--
--   1 · `manzana` → `agrupacion`. El nombre venía de un mockup («Casa 42 ·
--       Manzana B») y no de ningún requisito. «Manzana» es correcta en una
--       parcelación y falsa en un edificio; el dato es el mismo —una cadena
--       corta que agrupa viviendas— y lo que cambia es la palabra. La palabra
--       se configura por copropiedad; el dato se queda aquí.
--
--   2 · La dirección SALE de la vivienda y entra en la copropiedad. Las
--       unidades residenciales colombianas no tienen dirección por vivienda:
--       la dirección es del conjunto y lo que cambia es la torre y el número.
--       Pedirla 300 veces era pedir 300 veces el mismo dato.
--
--   3 · El índice único pasa a ser COMPUESTO. Es el único cambio con
--       consecuencias fuera de la pantalla de alta, y el motivo es concreto:
--       en un conjunto de apartamentos la Torre 1 y la Torre 2 tienen LAS DOS
--       un 101. Con la clave `(copropiedad_id, identificador)`, generar la
--       segunda torre chocaba contra la primera en el primer apartamento de
--       cada piso, y ADR-04 —que es lo que hace correcta la generación bajo
--       concurrencia— habría trabajado en contra.
--
--       La alternativa era meter la torre DENTRO del identificador («T1-101»).
--       Se descarta: duplica el dato, y al renombrar una agrupación el
--       identificador se queda mintiendo sin que la base pueda detectarlo.
--       La identidad real de una vivienda en un edificio ES el par
--       (agrupación, número), y eso es lo que el índice sostiene ahora.
--
--       No reabre ADR-04: es la misma decisión —la integridad concurrente la
--       resuelve la base y no un `SELECT` previo— aplicada a una clave que
--       resultó ser compuesta.
--
-- Idempotente y reversible, como exige la ETAPA 01.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Tipo de copropiedad
--
-- Enumerado, y NO texto libre como las etiquetas de más abajo. No es
-- incoherencia: son dos cosas distintas. El tipo DECIDE COMPORTAMIENTO —qué
-- formulario de alta se muestra y qué generador se ejecuta— y un valor que el
-- código no conoce no tendría formulario que mostrar. La etiqueta solo decide
-- una palabra, y ahí un catálogo cerrado obliga a elegir mal al primer conjunto
-- que use «manzana y lote» a la vez.
--
-- Admite NULL, y ese nulo es el estado «sin configurar»: es lo que dispara el
-- diálogo de configuración inicial en la consola. Un valor por defecto fingido
-- —'otro'— haría indistinguible «todavía no me lo han dicho» de «me dijeron
-- que es otro», y la consola no sabría si preguntar.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_copropiedad') THEN
    CREATE TYPE tipo_copropiedad AS ENUM ('apartamentos', 'casas', 'fincas', 'otro');
  END IF;
END $$;

ALTER TABLE public.copropiedades
  ADD COLUMN IF NOT EXISTS direccion           text NULL,
  ADD COLUMN IF NOT EXISTS tipo                tipo_copropiedad NULL,
  ADD COLUMN IF NOT EXISTS etiqueta_vivienda   text NOT NULL DEFAULT 'Vivienda',
  ADD COLUMN IF NOT EXISTS etiqueta_agrupacion text NOT NULL DEFAULT 'Torre o bloque';

-- La dirección admite NULL en el esquema y es obligatoria en el formulario, y
-- esa asimetría es deliberada: la columna nace después de la fila. Un
-- `NOT NULL DEFAULT ''` sería una cadena vacía haciéndose pasar por un dato.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'copropiedades_direccion_len') THEN
    ALTER TABLE public.copropiedades ADD CONSTRAINT copropiedades_direccion_len
      CHECK (direccion IS NULL OR length(btrim(direccion)) BETWEEN 5 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'copropiedades_etiqueta_viv_len') THEN
    ALTER TABLE public.copropiedades ADD CONSTRAINT copropiedades_etiqueta_viv_len
      CHECK (length(btrim(etiqueta_vivienda)) BETWEEN 1 AND 24);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'copropiedades_etiqueta_agr_len') THEN
    ALTER TABLE public.copropiedades ADD CONSTRAINT copropiedades_etiqueta_agr_len
      CHECK (length(btrim(etiqueta_agrupacion)) BETWEEN 1 AND 24);
  END IF;
END $$;

COMMENT ON COLUMN public.copropiedades.direccion IS
  'Direccion del conjunto. La vivienda NO tiene direccion propia: en Colombia '
  'la direccion es de la copropiedad y lo que cambia es la agrupacion y el numero.';
COMMENT ON COLUMN public.copropiedades.tipo IS
  'Decide el formulario de alta y el generador. NULL = sin configurar, y es lo '
  'que dispara el dialogo inicial. NO lo lee el motor de reglas ni el padron.';
COMMENT ON COLUMN public.copropiedades.etiqueta_vivienda IS
  'Como se llama una vivienda aqui: Casa, Apartamento, Finca. Es una ETIQUETA: '
  'se pinta al mostrar y nunca se guarda dentro del identificador.';
COMMENT ON COLUMN public.copropiedades.etiqueta_agrupacion IS
  'Como se llama la agrupacion aqui: Torre, Bloque, Manzana, Etapa, Sector.';

-- -----------------------------------------------------------------------------
-- 2 · `manzana` → `agrupacion`
--
-- Un RENAME es un cambio de catálogo: no reescribe la tabla ni mueve una fila.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'viviendas' AND column_name = 'manzana'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'viviendas' AND column_name = 'agrupacion'
  ) THEN
    ALTER TABLE public.viviendas RENAME COLUMN manzana TO agrupacion;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viviendas_agrupacion_len') THEN
    ALTER TABLE public.viviendas ADD CONSTRAINT viviendas_agrupacion_len
      CHECK (agrupacion IS NULL OR length(btrim(agrupacion)) BETWEEN 1 AND 24);
  END IF;
END $$;

COMMENT ON COLUMN public.viviendas.agrupacion IS
  'Torre, bloque, manzana, etapa o sector. Como se LLAMA lo decide '
  'copropiedades.etiqueta_agrupacion; aqui vive solo el valor.';

-- -----------------------------------------------------------------------------
-- 3 · Retirada de `viviendas.direccion`, con guarda
--
-- No se borra una columna con datos dentro. Si alguien cargó direcciones por
-- vivienda entre el diseño y su aplicación, la migración se DETIENE y lo dice,
-- en vez de perderlas en silencio. Hoy la tabla está vacía y la guarda no
-- cuesta nada; el día que no lo esté, es la diferencia entre un aviso y una
-- pérdida.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  con_direccion bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'viviendas' AND column_name = 'direccion'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.viviendas WHERE direccion IS NOT NULL'
       INTO con_direccion;
    IF con_direccion > 0 THEN
      RAISE EXCEPTION
        'Hay % viviendas con direccion propia. La direccion pasa a la copropiedad: '
        'traslade o descarte esos valores antes de aplicar la 0029.', con_direccion;
    END IF;
    ALTER TABLE public.viviendas DROP COLUMN direccion;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4 · La clave única, ahora compuesta
--
-- `coalesce` no es adorno: en un índice único varios NULL **no chocan entre
-- sí**, así que sin él una parcelación sin secciones podría tener dos «12»
-- activas a la vez. Con la expresión, «sin agrupación» es un valor más.
--
-- Sigue siendo PARCIAL sobre `estado = 'activo'`, y eso también es deliberado
-- (RN-19): un identificador reutilizado tras una baja no choca con la vivienda
-- dada de baja, que conserva su historial.
--
-- Si hubiera duplicados, este `CREATE` falla y la migración se revierte entera:
-- la guarda no hay que escribirla, la impone el índice.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.viviendas_identificador_uk;
CREATE UNIQUE INDEX IF NOT EXISTS viviendas_identificador_uk
  ON public.viviendas (copropiedad_id, coalesce(agrupacion, ''), identificador)
  WHERE estado = 'activo';

COMMENT ON INDEX public.viviendas_identificador_uk IS
  'ADR-04 sobre clave COMPUESTA: la Torre 1 y la Torre 2 tienen las dos un 101. '
  'coalesce() porque varios NULL no chocan entre si en un indice unico.';

-- -----------------------------------------------------------------------------
-- 5 · Rastro de la generación masiva
--
-- Valor propio y no `cambio_configuracion`, por el mismo argumento que escribió
-- la 0028: reutilizar un valor que significa otra cosa inutiliza el filtro justo
-- en la consulta que se hace durante un incidente. Sin esta fila, «¿quién creó
-- estas 300 viviendas y con qué patrón?» se contesta leyendo 300 valores de
-- `creado_por` idénticos.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'tipo_evento_seguridad'
       AND e.enumlabel = 'generacion_de_padron'
  ) THEN
    ALTER TYPE public.tipo_evento_seguridad ADD VALUE 'generacion_de_padron';
  END IF;
END $$;
