-- =============================================================================
-- H-13-03 · LA ASERCIÓN DE ADR-005 CUBRÍA DOS DE LAS TRES CAPAS QUE SOSTIENE
--
-- Hallazgo de la ETAPA 13, medido por EJECUCIÓN contra el clúster de pruebas
-- con el dueño real (`sb_postgres_sim`, NO superusuario). La cadena completa:
--
--   1. El dueño desactiva los triggers .................. ALTER TABLE → funciona
--      pero UPDATE sigue bloqueado ...................... permission denied
--   2. El dueño se reconcede UPDATE ..................... GRANT → funciona
--      y aun así el UPDATE no toca nada ................. UPDATE 0   ← RLS FORCE
--   3. El dueño AÑADE `NO FORCE ROW LEVEL SECURITY` ..... UPDATE 66  ← cae todo
--
-- Es decir: la tercera capa —RLS en modo FORCE sin política de UPDATE— es la
-- que de verdad detiene el paso 2, y la aserción de la 0017 **no la verificaba**.
-- Comprobaba (a) las concesiones y (b) los triggers habilitados. Un
-- `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` pasaba inadvertido al siguiente
-- despliegue, que es exactamente para lo que esa aserción existe.
--
-- El riesgo residual real de D-08 no es «el dueño conserva DISABLE TRIGGER»:
-- son TRES actos deliberados de DDL, y ahora el despliegue detecta los tres.
--
-- Idempotente y sin efectos: solo verifica.
-- =============================================================================

DO $$
DECLARE
  n bigint;
  detalle text;
BEGIN
  -- RLS habilitada Y FORZADA en cada tabla append-only y en cada partición de
  -- `eventos`. `relrowsecurity` sin `relforcerowsecurity` no protege al dueño,
  -- que es el único atacante que esta migración contempla.
  SELECT count(*), coalesce(string_agg(
           c.relname || ':' ||
           CASE WHEN NOT c.relrowsecurity THEN 'RLS DESACTIVADA'
                ELSE 'RLS SIN FORCE' END, ', '), '')
    INTO n, detalle
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND c.relkind IN ('r','p')
     AND (c.relname LIKE 'eventos%'
          OR c.relname IN ('evidencias','auditoria_seguridad','purgas_retencion'))
     AND NOT (c.relrowsecurity AND c.relforcerowsecurity);
  IF n > 0 THEN
    RAISE EXCEPTION
      'ADR-005 incumplido (H-13-03): % tabla(s) append-only sin RLS forzada (%). '
      'Es la capa que detiene al dueño que se reconcede UPDATE.', n, detalle;
  END IF;

  -- Y que no haya nacido una política de UPDATE o DELETE sobre ellas: con RLS
  -- forzada, una política permisiva de UPDATE reabriría el camino entero.
  SELECT count(*), coalesce(string_agg(tablename || ':' || policyname || ':' || cmd, ', '), '')
    INTO n, detalle
    FROM pg_policies
   WHERE schemaname = 'public'
     AND cmd IN ('UPDATE','DELETE','ALL')
     AND (tablename LIKE 'eventos%'
          OR tablename IN ('evidencias','auditoria_seguridad','purgas_retencion'));
  IF n > 0 THEN
    RAISE EXCEPTION
      'ADR-005 incumplido (H-13-03): % política(s) de UPDATE/DELETE/ALL sobre tablas '
      'append-only (%). Con RLS forzada, esa política es el camino de vuelta.', n, detalle;
  END IF;

  RAISE NOTICE 'H-13-03 verificado: RLS ACTIVA y FORZADA en las append-only, sin política de escritura';
END
$$;
