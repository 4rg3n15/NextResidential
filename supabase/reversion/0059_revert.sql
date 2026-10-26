-- Reversión de la migración 0059 (D-145 · índices del buscador de eventos).
--
-- Sólo quita dos índices: no toca una fila de `eventos` (RN-03). Sin ellos el
-- buscador sigue funcionando por placa y por operador, más despacio.
\set ON_ERROR_STOP on

BEGIN;
DROP INDEX IF EXISTS public.eventos_por_placa_idx;
DROP INDEX IF EXISTS public.eventos_por_operador_idx;
COMMIT;
