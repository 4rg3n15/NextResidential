-- =============================================================================
-- 0059 · ÍNDICES DEL BUSCADOR DE EVENTOS
--        D-145 (decisión del cliente, 2026-10-23)
--
-- El buscador de la consola filtra ahora por placa y por operador (quién abrió
-- o negó a mano). Las dos columnas son casi siempre nulas —una placa sólo la
-- trae la cámara LPR; un operador, sólo lo manual—, así que los índices son
-- PARCIALES: no cargan con las filas que nunca se buscarán por ellos.
--
-- `eventos` es append-only (RN-03, CA-23, ADR-05): esta migración NO toca una
-- sola fila. Sobre una tabla particionada, `CREATE INDEX` en el padre crea el
-- índice en cada partición existente y en las futuras. Sin `CONCURRENTLY`:
-- PostgreSQL no lo admite sobre el padre de una tabla particionada.
--
-- Idempotente (`IF NOT EXISTS`). Reversión: supabase/reversion/0059_revert.sql.
-- =============================================================================

CREATE INDEX IF NOT EXISTS eventos_por_placa_idx
  ON public.eventos (copropiedad_id, placa_detectada, ocurrido_en DESC)
  WHERE placa_detectada IS NOT NULL;

CREATE INDEX IF NOT EXISTS eventos_por_operador_idx
  ON public.eventos (copropiedad_id, operador_id, ocurrido_en DESC)
  WHERE operador_id IS NOT NULL;

COMMENT ON INDEX public.eventos_por_placa_idx IS
  'D-145 (0059) · buscador de eventos por placa normalizada; parcial: sólo filas con placa.';
COMMENT ON INDEX public.eventos_por_operador_idx IS
  'D-145 (0059) · buscador de eventos por operador manual; parcial: sólo filas con operador.';
