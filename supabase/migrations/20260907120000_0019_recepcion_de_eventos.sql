-- =============================================================================
-- 0019 · Libro de recepción de eventos · RN-17 · CA-22 · ETAPA 06
--
-- POR QUÉ HACE FALTA UNA TABLA MÁS.
-- La migración 0011 ya trae `eventos_idempotencia_uk` sobre
-- (copropiedad_id, clave_idempotencia, ocurrido_en). Un índice único sobre una
-- tabla particionada DEBE incluir la clave de partición, y ahí está el hueco:
-- `ocurrido_en` NO es estable entre reintentos. La política de idempotencia del
-- dominio lo dice explícitamente —la clave no puede derivarse del instante,
-- porque el Edge recalcula `ocurrido_en` al reconciliar (D-11)—, así que dos
-- entregas del mismo hecho traen instantes distintos, caen en el índice como
-- filas distintas y se duplican. El propio comentario de 0011 lo anticipa y
-- remite a `bandeja_salida_edge`.
--
-- `bandeja_salida_edge` resuelve el camino del Edge y solo ese: su clave ajena
-- exige un `edge_id` de `edge_gateways`. El camino de la ingesta directa —una
-- cámara reportando al Alarm Server, que es el de la ETAPA 15— no tiene gateway
-- y se quedaba sin garantía. Esta tabla es su equivalente: NO particionada,
-- clave primaria (copropiedad_id, clave_idempotencia), y por tanto capaz de
-- rechazar el duplicado en la MISMA sentencia que lo inserta (ADR-04):
--
--   INSERT INTO public.recepciones_evento (...) VALUES (...)
--   ON CONFLICT (copropiedad_id, clave_idempotencia) DO NOTHING
--   RETURNING evento_id;   -- 0 filas = duplicado; se descarta en silencio
--
-- Solo si devuelve fila se inserta en `eventos`. Nunca al revés: un evento sin
-- su recepción sería un duplicado esperando al siguiente reintento.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.recepciones_evento (
  copropiedad_id      uuid NOT NULL REFERENCES public.copropiedades(id),
  clave_idempotencia  text NOT NULL,
  evento_id           uuid NOT NULL,
  evento_ocurrido_en  timestamptz NOT NULL,
  origen              text NOT NULL,
  recibido_en         timestamptz NOT NULL DEFAULT now(),
  creado_por          uuid NOT NULL REFERENCES public.usuarios(id),

  PRIMARY KEY (copropiedad_id, clave_idempotencia),

  CONSTRAINT recepciones_clave_len   CHECK (length(clave_idempotencia) BETWEEN 8 AND 200),
  CONSTRAINT recepciones_origen_len  CHECK (length(origen) BETWEEN 1 AND 40)

  -- ===========================================================================
  -- SIN CLAVE AJENA A `eventos`, Y NO ES UN OLVIDO.
  --
  -- Hallazgo del 2026-09-07, por ejecución: una clave ajena hacia `eventos`
  -- FALLA con «permission denied for table eventos» en el COMMIT. La causa no
  -- es la RLS ni el trigger: la comprobación de integridad referencial bloquea
  -- la fila referenciada con `SELECT ... FOR KEY SHARE`, y PostgreSQL exige
  -- para ese bloqueo el privilegio UPDATE o DELETE sobre la tabla — además del
  -- SELECT. ADR-005 se los quita a TODOS, dueño incluido.
  --
  -- Es decir: **una tabla append-only con UPDATE y DELETE revocados no puede
  -- ser destino de una clave ajena.** Las dos garantías son incompatibles, y
  -- entre inmutabilidad e integridad declarativa gana la inmutabilidad: RN-03 y
  -- CA-23 son requisitos verificables del documento; la clave ajena protege de
  -- un borrado que esta base no concede a nadie.
  --
  -- Lo que sí queda: `evento_id` y `evento_ocurrido_en` siguen guardándose, la
  -- recepción se escribe siempre dentro de la misma transacción que el evento,
  -- y el orden —recepción primero— es lo que permite descartar el duplicado sin
  -- tocar `eventos`. La misma corrección se aplica a `alertas` en la 0021.
  -- ===========================================================================
);

COMMENT ON TABLE public.recepciones_evento IS
  'Libro append-only de claves de idempotencia del camino de ingesta directa '
  '(RN-17, CA-22). No particionada a proposito: es lo que permite una clave '
  'primaria SIN ocurrido_en, y por tanto deduplicar un reintento cuyo instante '
  'se recalculo. Equivalente de bandeja_salida_edge para el Alarm Server.';

COMMENT ON COLUMN public.recepciones_evento.origen IS
  'Metodo o procedencia declarada del hecho. Diagnostico: permite saber que '
  'equipo esta reintentando sin tener que cruzar con eventos.';

CREATE INDEX IF NOT EXISTS recepciones_recientes_idx
  ON public.recepciones_evento (copropiedad_id, recibido_en DESC);

-- ===== RLS · activa y FORZADA, como toda tabla (§2.7.6) ======================
ALTER TABLE public.recepciones_evento ENABLE  ROW LEVEL SECURITY;
ALTER TABLE public.recepciones_evento FORCE   ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recepciones_lectura   ON public.recepciones_evento;
DROP POLICY IF EXISTS recepciones_insercion ON public.recepciones_evento;

-- Lectura para quien opera la copropiedad; el residente NO la necesita: es un
-- libro de control interno, no parte de su historial.
CREATE POLICY recepciones_lectura ON public.recepciones_evento FOR SELECT
  USING (app.puede_leer_operacion(copropiedad_id));
CREATE POLICY recepciones_insercion ON public.recepciones_evento FOR INSERT
  WITH CHECK (app.puede_leer_operacion(copropiedad_id));

-- ===== Append-only, con las MISMAS cuatro capas de ADR-005 ===================
-- No basta con revocar a los roles de aplicación: en Supabase el dueño de las
-- tablas es `postgres`, que es el rol de la cadena de conexión. La lección de
-- la migración 0017 se aplica aquí desde el primer día en vez de descubrirse
-- otra vez contra el proyecto real.
DO $$
DECLARE v_dueno text;
BEGIN
  REVOKE ALL ON public.recepciones_evento FROM PUBLIC, anon;
  GRANT SELECT, INSERT ON public.recepciones_evento TO authenticated, service_role;
  REVOKE UPDATE, DELETE, TRUNCATE ON public.recepciones_evento
    FROM PUBLIC, authenticated, service_role, app_mantenimiento;

  SELECT pg_get_userbyid(c.relowner) INTO v_dueno
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'recepciones_evento';
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.recepciones_evento FROM %I', v_dueno);
END
$$;

DROP TRIGGER IF EXISTS tg_prohibir_update ON public.recepciones_evento;
CREATE TRIGGER tg_prohibir_update BEFORE UPDATE ON public.recepciones_evento
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_update();

DROP TRIGGER IF EXISTS tg_prohibir_delete ON public.recepciones_evento;
CREATE TRIGGER tg_prohibir_delete BEFORE DELETE ON public.recepciones_evento
  FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_delete();

-- ===== Aserción de despliegue ================================================
-- Si alguien revierte cualquiera de las capas, la migración falla. Verifica
-- `tgenabled` y no solo la existencia del trigger: un trigger desactivado no
-- protege nada y es el riesgo residual declarado en D-08.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='recepciones_evento'
     AND privilege_type IN ('UPDATE','DELETE','TRUNCATE');
  ASSERT n = 0, format('0019: recepciones_evento conserva %s privilegios de escritura', n);

  SELECT count(*) INTO n
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname='recepciones_evento'
     AND t.tgname IN ('tg_prohibir_update','tg_prohibir_delete')
     AND t.tgenabled <> 'D';
  ASSERT n = 2, format('0019: recepciones_evento tiene %s de 2 triggers append-only activos', n);

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname='public' AND c.relname='recepciones_evento'
     AND c.relrowsecurity AND c.relforcerowsecurity;
  ASSERT n = 1, '0019: recepciones_evento debe tener RLS activa y FORZADA';
END
$$;
