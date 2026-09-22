-- =============================================================================
-- H-13-03 · LA ASERCIÓN DE ADR-005 CUBRÍA DOS DE LAS TRES CAPAS QUE SOSTIENE
--
-- Hallazgo de la ETAPA 13, medido por EJECUCIÓN contra el clúster de pruebas
-- con el dueño real (`sb_postgres_sim`, NO superusuario). La cadena completa,
-- reejecutada al cerrar la etapa:
--
--   1. ALTER TABLE ... DISABLE TRIGGER ALL ............. PERMISSION DENIED
--      («RI_ConstraintTrigger_... is a system trigger»: la clave ajena de la
--       partición protege de paso al disparador de inmutabilidad)
--   2. GRANT UPDATE ... TO <el propio dueño> ........... GRANT, y UPDATE 0
--      ← la RLS en modo FORCE, sin política de UPDATE, no deja pasar ni una fila
--   3. ALTER TABLE ... NO FORCE ROW LEVEL SECURITY ..... ALTER, y el UPDATE
--      sigue bloqueado ................................. por el DISPARADOR
--   4. ALTER TABLE <particion> DISABLE TRIGGER <nombre>. ALTER, y UPDATE 6
--      ← hacen falta los cuatro, y el cuarto por el NOMBRE EXACTO
--
-- Es decir: el riesgo residual de D-08 no es «el dueño conserva DISABLE
-- TRIGGER». Son CUATRO actos deliberados de DDL, cada uno de los cuales deja
-- rastro y ninguno de los cuales es un `UPDATE` desde el código.
--
-- Y de los cuatro, el tercero era el único que NADIE detectaba: la aserción de
-- la 0017 comprueba (a) las concesiones —acto 2— y (b) los disparadores
-- habilitados por tabla Y POR PARTICIÓN —acto 4, verificado aquí: nombra
-- `eventos_2026_09:tg_prohibir_update`—. Un `NO FORCE ROW LEVEL SECURITY`
-- pasaba inadvertido al siguiente despliegue, que es justo para lo que esa
-- aserción existe. Esta migración cierra ese hueco.
--
-- NOTA DE MÉTODO, porque costó un diagnóstico falso: ejecutar el FICHERO de la
-- 0017 para comprobar si detecta el acto 4 devuelve «verificado» aunque el
-- disparador esté desactivado — la migración lo RECREA antes de aseverar. Hay
-- que ejecutar el bloque de aserción SOLO. «Probable» no es «verificado».
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
