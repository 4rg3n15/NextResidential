-- =============================================================================
-- MATRIZ COMPLETA DE RLS · ETAPA 13 · RN-15, CA-24, KPI-36
--
-- POR QUÉ EXISTE, siendo que la 00 ya prueba el aislamiento.
--
-- La 00 recorre una lista de tablas ESCRITA A MANO —veintiséis nombres en un
-- `ARRAY[...]`—. Una tabla nueva con `copropiedad_id` no entra en ella sola, y
-- una lista a mano que nadie actualiza es la familia de defecto que este
-- repositorio lleva trece etapas persiguiendo: el control existe y no comprueba
-- lo que uno cree.
--
-- Esta suite DERIVA el conjunto del catálogo: toda tabla del esquema `public`
-- con RLS forzada y columna `copropiedad_id` entra automáticamente. Si mañana
-- nace una tabla operativa y su política está mal, esto la caza sin que nadie
-- toque este fichero.
--
-- Lo que se demuestra POR EJECUCIÓN, y hay que decirlo con precisión (D-09):
--   · NEGATIVA: como `authenticated` con los claims de una copropiedad, CERO
--     filas de la otra son visibles, tabla por tabla.
--   · POSITIVA: las filas propias SÍ se ven donde las semillas las ponen.
--   · ESCRITURA CRUZADA: rechazada, no filtrada en silencio (CA-24).
--   · COBERTURA: toda tabla derivada tiene al menos una política de SELECT.
--
-- Lo que NO se demuestra aquí, y no se disimula: el comportamiento frente al
-- DUEÑO de las tablas. En este clúster el dueño es `sb_postgres_sim`, que no es
-- superusuario y reproduce a Supabase; pero el rol de conexión por defecto del
-- contenedor SÍ lo es, y un superusuario omite RLS por definición. Esa frontera
-- la cubren la 40 y la aserción de la 0031.
-- =============================================================================

\set ON_ERROR_STOP on
\set MIRA  '10000000-0000-4000-8000-000000000001'
\set ROBLE '10000000-0000-4000-8000-000000000002'

SET ROLE authenticated;
SET request.jwt.claims = '{"rol":"administrador","copropiedad_id":"10000000-0000-4000-8000-000000000001","usuario_id":"00000000-0000-4000-8000-000000000010"}';

-- ---------------------------------------------------------------------------
-- 1 · NEGATIVA derivada del catálogo: ni una fila ajena, en ninguna tabla.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  n bigint;
  fugas text[] := ARRAY[]::text[];
  miradas int := 0;
BEGIN
  FOR r IN
    SELECT c.relname AS tabla
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity AND c.relforcerowsecurity
       AND EXISTS (SELECT 1 FROM information_schema.columns col
                    WHERE col.table_schema='public' AND col.table_name=c.relname
                      AND col.column_name='copropiedad_id')
     ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE copropiedad_id = %L',
                   r.tabla, '10000000-0000-4000-8000-000000000002') INTO n;
    miradas := miradas + 1;
    IF n > 0 THEN
      fugas := fugas || format('%s(%s filas ajenas)', r.tabla, n);
    END IF;
  END LOOP;

  IF miradas = 0 THEN
    RAISE EXCEPTION 'MATRIZ RLS: no se derivó NI UNA tabla. Una matriz vacía no es una matriz limpia.';
  END IF;
  IF array_length(fugas, 1) > 0 THEN
    RAISE EXCEPTION 'FUGA MULTIEMPRESA (RN-15, KPI-36) en %: %',
      array_length(fugas,1), array_to_string(fugas, ', ');
  END IF;
  RAISE NOTICE 'matriz RLS · negativa: % tabla(s) derivadas del catálogo, cero filas ajenas', miradas;
END
$$;

-- ---------------------------------------------------------------------------
-- 2 · POSITIVA: donde las semillas ponen filas propias, se ven.
--     Una negativa sin positiva se cumple con una base vacía.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  n bigint;
  vistas int := 0;
  vacias text[] := ARRAY[]::text[];
BEGIN
  FOR r IN
    SELECT c.relname AS tabla
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname='public' AND c.relkind='r'
       AND c.relrowsecurity AND c.relforcerowsecurity
       AND EXISTS (SELECT 1 FROM information_schema.columns col
                    WHERE col.table_schema='public' AND col.table_name=c.relname
                      AND col.column_name='copropiedad_id')
     ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE copropiedad_id = %L',
                   r.tabla, '10000000-0000-4000-8000-000000000001') INTO n;
    IF n > 0 THEN vistas := vistas + 1; ELSE vacias := vacias || r.tabla; END IF;
  END LOOP;

  IF vistas = 0 THEN
    RAISE EXCEPTION 'MATRIZ RLS: el administrador no ve NINGUNA fila propia. '
                    'La negativa de arriba se estaría cumpliendo por una base vacía.';
  END IF;
  RAISE NOTICE 'matriz RLS · positiva: % tabla(s) con filas propias visibles; % sin semillas (%)',
    vistas, coalesce(array_length(vacias,1),0), coalesce(array_to_string(vacias, ', '), '—');
END
$$;

-- ---------------------------------------------------------------------------
-- 3 · COBERTURA: toda tabla derivada tiene política de SELECT. Una tabla con
--     RLS forzada y sin política no filtra: NIEGA TODO, y eso se lee como
--     aislamiento cuando en realidad es una funcionalidad rota.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  sin_politica text[];
BEGIN
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO sin_politica
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname='public' AND c.relkind='r'
     AND c.relrowsecurity AND c.relforcerowsecurity
     AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema='public' AND col.table_name=c.relname
                    AND col.column_name='copropiedad_id')
     -- Las PARTICIONES se excluyen, y el motivo importa: una partición de
     -- `eventos` no lleva políticas propias porque se alcanza por la tabla
     -- padre, y PostgreSQL aplica allí las del padre. Consultarla directamente
     -- con RLS forzada y sin política no devuelve nada — que es el
     -- comportamiento seguro, no un defecto. La primera versión de esta
     -- comprobación las marcaba como «inalcanzables»: era un falso positivo
     -- suyo, y queda escrito para que nadie lo reintroduzca.
     AND NOT c.relispartition
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname='public' AND p.tablename=c.relname
                        AND p.cmd IN ('SELECT','ALL'));
  IF array_length(sin_politica,1) > 0 THEN
    RAISE EXCEPTION 'MATRIZ RLS: % tabla(s) con RLS forzada y SIN política de lectura (%). '
                    'Niegan todo, y eso no es aislamiento: es una tabla inalcanzable.',
      array_length(sin_politica,1), array_to_string(sin_politica, ', ');
  END IF;
  RAISE NOTICE 'matriz RLS · cobertura: toda tabla derivada tiene política de lectura';
END
$$;

-- ---------------------------------------------------------------------------
-- 3b · Y que las particiones SÍ se alcancen por el padre, con su aislamiento
--      intacto. Excluirlas de la comprobación anterior sin demostrar esto
--      sería exentarlas, no explicarlas.
-- ---------------------------------------------------------------------------
DO $$
DECLARE propias bigint; ajenas bigint;
BEGIN
  SELECT count(*) INTO propias FROM public.eventos
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
  SELECT count(*) INTO ajenas FROM public.eventos
   WHERE copropiedad_id = '10000000-0000-4000-8000-000000000002';
  ASSERT ajenas = 0, format('FUGA: se vieron %s eventos de otra copropiedad por la tabla padre', ajenas);
  RAISE NOTICE 'matriz RLS · particiones: alcanzables por el padre (% propias) y sin fuga (% ajenas)',
    propias, ajenas;
END
$$;

-- ---------------------------------------------------------------------------
-- 4 · ESCRITURA CRUZADA rechazada, derivada también: se prueba sobre una tabla
--     con `copropiedad_id` y columnas simples. CA-24 exige RECHAZO.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    INSERT INTO public.viviendas (copropiedad_id, identificador, creado_por, actualizado_por)
    VALUES ('10000000-0000-4000-8000-000000000002','Lote intruso 60',
            '00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000010');
    RAISE EXCEPTION 'FUGA DE ESCRITURA (CA-24): se insertó en otra copropiedad';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'matriz RLS · escritura cruzada: RECHAZADA, no filtrada en silencio';
  END;
END
$$;

RESET ROLE;
