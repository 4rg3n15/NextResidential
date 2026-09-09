-- =============================================================================
-- 0023 · El restablecimiento de contraseña deja rastro · RN-15 · §2.7.8
--
-- La recuperación de contraseña la ejecuta Supabase Auth (ADR-008: es el
-- proveedor de identidad autoritativo), así que el cambio en sí no pasa por
-- nuestra API. Lo que sí tiene que pasar es el RASTRO: un restablecimiento es
-- un cambio de credencial, y §2.7.8 exige auditoría append-only de esos
-- hechos. Sin este registro, la única huella viviría en los registros de
-- Supabase, fuera del sistema que el operador audita.
--
-- Se añade un valor al enumerado en vez de reutilizar uno existente:
-- `escalamiento_privilegio` significa otra cosa y mezclarlos haría inútil el
-- filtro justo en la consulta que más importa durante un incidente.
--
-- Idempotente y reversible en el sentido que admite PostgreSQL: un valor de
-- enumerado no se puede retirar, así que la reversión es dejar de emitirlo.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'tipo_evento_seguridad'
       AND e.enumlabel = 'restablecimiento_contrasena'
  ) THEN
    ALTER TYPE public.tipo_evento_seguridad ADD VALUE 'restablecimiento_contrasena';
  END IF;
END
$$;

-- Índice para la consulta real del operador durante un incidente: «qué
-- credenciales se cambiaron en esta ventana». Sin él, la tabla se recorre
-- entera, y es la que más crece.
CREATE INDEX IF NOT EXISTS auditoria_tipo_idx
  ON public.auditoria_seguridad (tipo, ocurrido_en DESC);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
   WHERE t.typname = 'tipo_evento_seguridad'
     AND e.enumlabel = 'restablecimiento_contrasena';
  ASSERT n = 1, '0023: el enumerado no admite restablecimiento_contrasena';
END
$$;
