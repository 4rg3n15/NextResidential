-- =============================================================================
-- 0021 · Ninguna clave ajena puede apuntar a una tabla append-only
--        `alertas` → `eventos` y `consentimientos_biometricos` → `evidencias`
--        ADR-005 · RN-03 · RN-18 · CA-23
--
-- HALLAZGO DEL 2026-09-07, encontrado por ejecución al escribir la ETAPA 06.
--
-- La migración 0011 declaró `alertas_evento_fk` hacia `eventos(id, ocurrido_en)`.
-- Es correcta como modelo y **imposible en esta base**: la comprobación de
-- integridad referencial bloquea la fila referenciada con
-- `SELECT ... FOR KEY SHARE`, y PostgreSQL exige para ese bloqueo el privilegio
-- UPDATE o DELETE sobre la tabla, además del SELECT. ADR-005 se los revoca a
-- todos los roles y también al dueño, así que **cualquier** inserción en
-- `alertas` con `evento_id` no nulo falla con «permission denied for table
-- eventos» — no por la RLS, no por el trigger, sino por el bloqueo de fila.
--
-- POR QUÉ NADIE LO VIO ANTES. Hasta esta etapa no se insertaba ni un evento ni
-- una alerta: la clave ajena existía sobre dos tablas vacías, y una restricción
-- que nunca se ejerce no se distingue de una que funciona. Es la misma familia
-- de los tres falsos verdes anteriores —algo que parece activo y está inerte—,
-- y por el mismo motivo: falta la ejecución que lo pondría en rojo.
--
-- RESOLUCIÓN. Entre inmutabilidad e integridad declarativa gana la
-- inmutabilidad: RN-03 y CA-23 son requisitos con criterio de verificación; la
-- clave ajena protege de un borrado de eventos que esta base no concede a
-- nadie. Se sustituye por un trigger que comprueba la EXISTENCIA con un
-- `SELECT` normal, que solo necesita el privilegio SELECT.
--
-- Lo que se pierde y se declara: el trigger no toma el bloqueo de fila, así que
-- no protege de una alerta que referencie un evento insertado en una
-- transacción concurrente aún sin confirmar. Es una ventana estrecha y de
-- consecuencia nula: los eventos no se borran jamás, de modo que la referencia
-- no puede quedar colgando; a lo sumo se rechaza una alerta legítima, y esa
-- alerta se vuelve a abrir en la siguiente pasada.
-- =============================================================================

ALTER TABLE public.alertas DROP CONSTRAINT IF EXISTS alertas_evento_fk;

CREATE OR REPLACE FUNCTION app.tg_alerta_evento_existe()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evento_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.eventos
     WHERE id = NEW.evento_id
       AND ocurrido_en = NEW.evento_ocurrido_en
       AND copropiedad_id = NEW.copropiedad_id
  ) THEN
    RAISE EXCEPTION
      'La alerta referencia un evento inexistente en esta copropiedad (%, %)',
      NEW.evento_id, NEW.evento_ocurrido_en
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION app.tg_alerta_evento_existe() IS
  'Sustituye a alertas_evento_fk. Comprueba la existencia con un SELECT normal '
  'porque una clave ajena exigiria bloquear la fila de eventos, y ese bloqueo '
  'requiere UPDATE o DELETE, que ADR-005 revoca a todos. Comprueba ademas la '
  'copropiedad, cosa que la clave ajena original NO hacia (RN-15).';

DROP TRIGGER IF EXISTS tg_alerta_evento_existe ON public.alertas;
CREATE TRIGGER tg_alerta_evento_existe
  BEFORE INSERT ON public.alertas
  FOR EACH ROW EXECUTE FUNCTION app.tg_alerta_evento_existe();

-- La restricción de coherencia entre las dos columnas sigue siendo de la base:
-- o van las dos o no va ninguna. La clave ajena la daba por hecho; ahora se
-- declara explícitamente (ya existía como `alertas_evento_completo` en 0011, se
-- comprueba que sigue viva).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname = 'alertas_evento_completo' AND conrelid = 'public.alertas'::regclass;
  ASSERT n = 1, '0021: falta alertas_evento_completo; las dos columnas deben ir juntas';

  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname = 'alertas_evento_fk' AND conrelid = 'public.alertas'::regclass;
  ASSERT n = 0, '0021: alertas_evento_fk sigue presente; ninguna alerta se podria insertar';

  SELECT count(*) INTO n
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'alertas' AND t.tgname = 'tg_alerta_evento_existe' AND t.tgenabled <> 'D';
  ASSERT n = 1, '0021: el trigger de existencia del evento no esta activo';
END
$$;

-- ===== El MISMO defecto en `consentimientos_biometricos` ====================
-- La comprobación general de más abajo lo destapó al primer despliegue:
-- `consent_evidencia_fk` apunta a `evidencias`, que también es append-only con
-- UPDATE y DELETE revocados. Cualquier consentimiento con evidencia —que es el
-- caso normal de CU-02— habría fallado igual.
--
-- Se corrige aquí, con el mismo remedio, y NO se construye nada de la ETAPA 08:
-- esto es una corrección del esquema existente, no funcionalidad nueva. Dejar
-- la restricción en pie sabiendo que es inservible solo garantizaría que la
-- ETAPA 08 tropiece con ella.
ALTER TABLE public.consentimientos_biometricos DROP CONSTRAINT IF EXISTS consent_evidencia_fk;

CREATE OR REPLACE FUNCTION app.tg_consentimiento_evidencia_existe()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evidencia_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.evidencias
     WHERE id = NEW.evidencia_id AND copropiedad_id = NEW.copropiedad_id
  ) THEN
    RAISE EXCEPTION
      'El consentimiento referencia una evidencia inexistente en esta copropiedad (%)',
      NEW.evidencia_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END
$$;

COMMENT ON FUNCTION app.tg_consentimiento_evidencia_existe() IS
  'Sustituye a consent_evidencia_fk por el mismo motivo que el trigger de '
  'alertas: una clave ajena hacia una tabla append-only exige un bloqueo de '
  'fila que ADR-005 impide. Ver la migracion 0021.';

DROP TRIGGER IF EXISTS tg_consentimiento_evidencia_existe ON public.consentimientos_biometricos;
CREATE TRIGGER tg_consentimiento_evidencia_existe
  BEFORE INSERT ON public.consentimientos_biometricos
  FOR EACH ROW EXECUTE FUNCTION app.tg_consentimiento_evidencia_existe();

-- ===== Comprobación general: ninguna clave ajena apunta a una append-only ====
-- Si una etapa futura vuelve a declararla, el despliegue falla aquí en vez de
-- fallar en producción la primera vez que se inserte una fila.
DO $$
DECLARE n int; detalle text;
BEGIN
  SELECT count(*), coalesce(string_agg(conname, ', '), '')
    INTO n, detalle
    FROM pg_constraint c
    JOIN pg_class destino ON destino.oid = c.confrelid
    JOIN pg_namespace ns ON ns.oid = destino.relnamespace
   WHERE c.contype = 'f'
     AND ns.nspname = 'public'
     AND (destino.relname LIKE 'eventos%'
          OR destino.relname IN ('evidencias','auditoria_seguridad','recepciones_evento'));
  ASSERT n = 0,
    format('0021: %s clave(s) ajena(s) hacia una tabla append-only: %s. '
           'La comprobacion exige bloquear la fila y ADR-005 lo impide.', n, detalle);
END
$$;
