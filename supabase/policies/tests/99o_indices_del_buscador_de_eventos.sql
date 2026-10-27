-- =============================================================================
-- 99o · ÍNDICES DEL BUSCADOR DE EVENTOS · D-145 · migración 0059
--
-- Lo que la base sostiene:
--   1 · los dos índices existen en el padre de `eventos`, son PARCIALES (con su
--       `WHERE ... IS NOT NULL`) y están en el orden que usa la consulta;
--   2 · cada partición de `eventos` tiene su índice heredado de los dos;
--   3 · la 0059 no hizo `eventos` modificable: sigue sin UPDATE ni DELETE
--       concedidos a nadie de la aplicación (RN-03; lo ejerce entero la 40).
--
-- Sólo lee el catálogo: no escribe nada.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE def text;
BEGIN
  SELECT indexdef INTO def FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'eventos_por_placa_idx';
  ASSERT def IS NOT NULL, 'falta eventos_por_placa_idx';
  ASSERT def LIKE '%(copropiedad_id, placa_detectada, ocurrido_en DESC)%',
    format('eventos_por_placa_idx en otro orden: %s', def);
  ASSERT def LIKE '%WHERE (placa_detectada IS NOT NULL)%',
    format('eventos_por_placa_idx no es parcial: %s', def);

  SELECT indexdef INTO def FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'eventos_por_operador_idx';
  ASSERT def IS NOT NULL, 'falta eventos_por_operador_idx';
  ASSERT def LIKE '%(copropiedad_id, operador_id, ocurrido_en DESC)%',
    format('eventos_por_operador_idx en otro orden: %s', def);
  ASSERT def LIKE '%WHERE (operador_id IS NOT NULL)%',
    format('eventos_por_operador_idx no es parcial: %s', def);
END $$;

DO $$
DECLARE particiones int; con_placa int; con_operador int;
BEGIN
  SELECT count(*) INTO particiones FROM pg_inherits WHERE inhparent = 'public.eventos'::regclass;
  SELECT count(*) INTO con_placa
    FROM pg_inherits i JOIN pg_index x ON x.indrelid = i.inhrelid
    JOIN pg_inherits ii ON ii.inhrelid = x.indexrelid
   WHERE i.inhparent = 'public.eventos'::regclass
     AND ii.inhparent = 'public.eventos_por_placa_idx'::regclass;
  SELECT count(*) INTO con_operador
    FROM pg_inherits i JOIN pg_index x ON x.indrelid = i.inhrelid
    JOIN pg_inherits ii ON ii.inhrelid = x.indexrelid
   WHERE i.inhparent = 'public.eventos'::regclass
     AND ii.inhparent = 'public.eventos_por_operador_idx'::regclass;
  ASSERT particiones > 0, 'eventos sin particiones';
  ASSERT con_placa = particiones,
    format('%s de %s particiones con el índice de placa', con_placa, particiones);
  ASSERT con_operador = particiones,
    format('%s de %s particiones con el índice de operador', con_operador, particiones);
END $$;

DO $$
BEGIN
  ASSERT NOT has_table_privilege('authenticated', 'public.eventos', 'UPDATE'),
    'authenticated puede UPDATE sobre eventos';
  ASSERT NOT has_table_privilege('authenticated', 'public.eventos', 'DELETE'),
    'authenticated puede DELETE sobre eventos';
END $$;

ROLLBACK;
\echo '99o OK · índices parciales del buscador en el padre y en cada partición; eventos sigue inmutable'
