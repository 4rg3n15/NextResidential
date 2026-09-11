-- =============================================================================
-- 0028 · Cambiar la configuración de una copropiedad deja rastro · §2.7.8
--
-- La pantalla de Configuración pasa de solo lectura a editable (bloque 7 de la
-- ETAPA 09-B), y con ella entran dos ajustes que NO son preferencias:
--
--   · `umbral_confianza_placa` decide por debajo de qué confianza una lectura
--     de placa deja de abrir sola y escala al portero (CU-01, excepción 3a).
--   · `politica_contingencia_edge` decide qué hace el Edge cuando la regla no
--     está en su caché (RN-16).
--
-- Cambiar cualquiera de los dos es un hecho de seguridad, no un ajuste de
-- comodidad, y §2.7.8 exige constancia append-only de esos hechos. Sin este
-- valor de enumerado, el rastro tendría que reutilizar uno existente y
-- `escalamiento_privilegio` significa otra cosa: mezclarlos inutilizaría el
-- filtro justo en la consulta que se hace durante un incidente.
--
-- La fila la escribe la API **en la misma transacción que el UPDATE** (ver
-- `repositorio-copropiedades-pg.ts`): si se escribiera después, una caída entre
-- las dos operaciones dejaría un cambio sin rastro, y esa ventana es
-- exactamente lo que la regla prohíbe.
--
-- Idempotente. Reversible en el sentido que admite PostgreSQL: un valor de
-- enumerado no se retira, así que revertir es dejar de emitirlo.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'tipo_evento_seguridad'
       AND e.enumlabel = 'cambio_configuracion'
  ) THEN
    ALTER TYPE public.tipo_evento_seguridad ADD VALUE 'cambio_configuracion';
  END IF;
END
$$;

-- Aserción de despliegue: si alguien revierte el enumerado, la API empezaría a
-- fallar al auditar y el cambio se quedaría sin guardar (la transacción hace
-- ROLLBACK). Mejor enterarse aquí.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'tipo_evento_seguridad'
     AND e.enumlabel = 'cambio_configuracion';
  ASSERT n = 1, '0028: el enumerado no admite cambio_configuracion';
END
$$;
