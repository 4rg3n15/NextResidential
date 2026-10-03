-- =============================================================================
-- 0054 · EL SERVICIO LEE LOS USUARIOS DE SU COPROPIEDAD · ronda 15-R, E2
--
-- DT-15K-02 / S-62: ocho adaptadores de la API presentaban claims `{}` y
-- funcionaban sólo porque la API se conecta con un rol que omite la RLS. Desde
-- la 15-R presentan los claims de SERVICIO de la copropiedad de cada operación
-- (`apps/api/src/comun/claims-por-operacion.ts`). Con un rol sujeto a la RLS
-- quedaba un hueco: `usuarios` no tenía cláusula de servicio, así que resolver
-- «este usuario → su vivienda» (el vínculo del residente) no veía al usuario.
--
-- Se añade una política de LECTURA, y sólo de lectura: el servicio de la
-- copropiedad A ve los usuarios cuya copropiedad es A. No ve los de B ni los de
-- copropiedad NULL (superadministradores y operadores de central). Es más
-- estrecho que lo que hoy tiene la API con su rol, que lo ve todo.
--
-- Idempotente. Reversión: supabase/reversion/0054_revert.sql.
-- =============================================================================

DROP POLICY IF EXISTS usuarios_lectura_servicio ON public.usuarios;
CREATE POLICY usuarios_lectura_servicio ON public.usuarios FOR SELECT
  USING (copropiedad_id IS NOT NULL AND app.es_servicio(copropiedad_id));

COMMENT ON POLICY usuarios_lectura_servicio ON public.usuarios IS
  '15-R E2 · el servicio de una copropiedad lee los usuarios de ESA copropiedad (no los de otra ni los de copropiedad NULL).';

-- ----------------------------------------------------------------------------
-- Aserciones de despliegue
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'usuarios'
                    AND policyname = 'usuarios_lectura_servicio' AND cmd = 'SELECT') THEN
    RAISE EXCEPTION '0054 incompleta: falta la política usuarios_lectura_servicio';
  END IF;
  IF NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.usuarios'::regclass) THEN
    RAISE EXCEPTION '0054: la RLS de usuarios dejó de estar forzada';
  END IF;
END $$;
