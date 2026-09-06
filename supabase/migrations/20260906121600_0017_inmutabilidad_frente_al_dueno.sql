-- =============================================================================
-- 0017 · Inmutabilidad frente al DUEÑO de la tabla · ADR-005 · RN-03 · CA-23
--
-- HALLAZGO (verificación contra el proyecto real, 2026-09-06).
-- La migración 0015 revocaba UPDATE y DELETE a `anon`, `authenticated`,
-- `service_role` y `app_mantenimiento`, pero NO al dueño de las tablas. En
-- Supabase el dueño es `postgres`, que es exactamente el rol que trae la cadena
-- de conexión por defecto del proyecto. La API se conectaría con ese rol, así
-- que RN-03, CA-23 y ADR-005 no tenían garantía estructural: se comprobó que
-- `UPDATE public.eventos SET regla_aplicada = 'ALTERADA'` tenía éxito.
--
-- El DELETE ya estaba cubierto por `tg_prohibir_delete` (migración 0013). El
-- hueco real era UPDATE, que es el peor de los dos: un DELETE deja un vacío
-- detectable, un UPDATE reescribe la regla que decidió el acceso sin dejar rastro.
--
-- POR QUÉ UN REVOKE NO BASTA. El dueño puede reconcederse el privilegio
-- (`GRANT UPDATE ON eventos TO postgres`) en cualquier momento. Comprobado.
-- Por eso la defensa es en capas, y cada capa cubre el fallo de la anterior:
--
--   1 · REVOKE al dueño         → cierra el uso accidental desde la aplicación.
--                                 En Supabase surte efecto porque allí `postgres`
--                                 NO es superusuario. Comprobado con un dueño
--                                 no-superusuario: `permission denied for table`.
--   2 · Trigger BEFORE UPDATE   → bloquea al dueño incluso si se reconcede el
--                                 privilegio, y bloquea también al superusuario.
--   3 · Rol de aplicación       → la API deja de conectarse como dueño. Si nunca
--       dedicado                  se conecta con `postgres`, el punto 1 no se
--                                 puede revertir desde la aplicación.
--   4 · Aserción de despliegue  → si alguien revierte 1 o 2, la migración falla.
--
-- RIESGO RESIDUAL, declarado y no disimulado: el dueño conserva
-- `ALTER TABLE ... DISABLE TRIGGER`. Comprobado: es la única vía que queda. Ya
-- no es un UPDATE desde el código, sino un acto de DDL deliberado; la aserción
-- de esta migración lo detecta en el siguiente despliegue (verifica `tgenabled`,
-- no solo la existencia del trigger). Cerrarlo del todo exigiría que el dueño no
-- fuera `postgres`, lo que rompería `supabase db push`; se documenta como deuda.
-- =============================================================================

-- 1 · Prohibición de UPDATE en las tablas append-only --------------------------
CREATE OR REPLACE FUNCTION app.tg_prohibir_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'Modificacion prohibida en %.%: la tabla es append-only. RN-03, CA-23, ADR-005',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END
$$;

COMMENT ON FUNCTION app.tg_prohibir_update() IS
  'Bloquea UPDATE en las tablas append-only. A diferencia de un REVOKE, se '
  'aplica tambien al dueño de la tabla, que en Supabase es `postgres` y no '
  'puede reconcederse la excepcion sin desactivar el trigger explicitamente.';

-- El trigger va sobre el PADRE particionado: PostgreSQL lo clona a cada
-- particion existente y, lo que importa aqui, tambien a las que cree
-- `app.crear_particion_eventos` en el futuro. Comprobado sobre una particion
-- creada despues del trigger.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['eventos','evidencias','auditoria_seguridad','purgas_retencion'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tg_prohibir_update ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER tg_prohibir_update BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION app.tg_prohibir_update()', t);
  END LOOP;
END
$$;

-- 2 · REVOKE al dueño, incluida TRUNCATE ---------------------------------------
-- TRUNCATE se revoca explicitamente: no lo cubre ningun trigger de fila, y
-- vaciaria la tabla entera sin disparar `tg_prohibir_delete`.
-- Se revoca al dueño REAL, no al literal 'postgres', para que la migracion sea
-- correcta tanto en Supabase como en una base local y sobreviva a un cambio de
-- propietario.
DO $$
DECLARE
  t text;
  v_dueno text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r','p')
       AND (c.relname LIKE 'eventos%'
            OR c.relname IN ('evidencias','auditoria_seguridad','purgas_retencion'))
  LOOP
    SELECT pg_get_userbyid(c.relowner) INTO v_dueno
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = t;

    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM %I', t, v_dueno);
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC', t);
  END LOOP;
END
$$;

-- Las particiones futuras nacen con el mismo REVOKE al dueño.
CREATE OR REPLACE FUNCTION app.crear_particion_eventos(p_mes date)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fin    date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_nombre text := format('eventos_%s', to_char(v_inicio, 'YYYY_MM'));
  v_dueno  text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = v_nombre) THEN
    RETURN v_nombre || ' (ya existia)';
  END IF;

  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.eventos FOR VALUES FROM (%L) TO (%L)',
    v_nombre, v_inicio, v_fin);

  -- ===== ADR-005 en cada particion ==========================================
  -- Las particiones nuevas NO heredan las revocaciones del padre. Este es el
  -- punto exacto donde la garantia podria erosionarse en silencio: por eso el
  -- REVOKE se aplica aqui, en la misma funcion que las crea.
  -- El trigger `tg_prohibir_update` SI se clona automaticamente desde el padre.
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM PUBLIC', v_nombre);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_nombre);
  EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated, service_role', v_nombre);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated, service_role, app_mantenimiento', v_nombre);

  -- Y al dueño (0017): en Supabase es `postgres`, el rol de la cadena de conexion.
  SELECT pg_get_userbyid(c.relowner) INTO v_dueno
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = v_nombre;
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM %I', v_nombre, v_dueno);

  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_nombre);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_nombre);

  RETURN v_nombre || ' (creada)';
END
$$;

-- Los triggers append-only se marcan ENABLE ALWAYS: siguen disparando aunque la
-- sesion entre en `session_replication_role = replica`. En Supabase ese
-- parametro esta vedado al rol `postgres` (comprobado: «permission denied to set
-- parameter»), pero la marca no cuesta nada y cierra la via en cualquier otro
-- despliegue, incluida una base local donde el dueño si sea superusuario.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
       AND (c.relname LIKE 'eventos%'
            OR c.relname IN ('evidencias','auditoria_seguridad','purgas_retencion'))
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER tg_prohibir_update', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER tg_prohibir_delete', t);
  END LOOP;
END
$$;

-- 3 · El rol de conexión dedicado NO se crea aquí · verificado 2026-09-06 ------
--
-- La versión anterior de esta migración creaba el rol `app_api`. FALLÓ en
-- Supabase gestionado y revirtió la migración entera. Verificado despues contra
-- un PostgreSQL local con un rol NOSUPERUSER + CREATEROLE que replica las
-- capacidades del `postgres` de Supabase: fallaban CUATRO sentencias, no una.
--
--   ALTER ROLE ... NOSUPERUSER NOBYPASSRLS  → «permission denied to alter role».
--       PostgreSQL exige superusuario para TOCAR los atributos `superuser` y
--       `bypassrls`, aunque sea para ponerlos en NO. No falla por el valor:
--       falla por nombrarlos. `CREATE ROLE` con esos mismos NO sí funciona,
--       porque ahí solo se comprueba el caso afirmativo.
--   GRANT authenticated TO app_api          → «permission denied to grant role».
--       La documentación de Supabase concede un rol PROPIO *a* un rol reservado
--       (`grant mi_rol to authenticator`), que es la dirección contraria.
--   ALTER DEFAULT PRIVILEGES FOR ROLE ...   → «permission denied».
--   COMMENT ON ROLE ...                     → «permission denied».
--
-- DECISIÓN: crear un rol de conexión es una operación de OPERADOR, no de
-- esquema. Necesita una contraseña, que jamás puede vivir en el repositorio
-- (§2.7), y depende de una capacidad —conceder `authenticated`— que solo el
-- proyecto real puede responder. Ponerla en una migración convierte una mejora
-- opcional en un bloqueo del despliegue.
--
-- LO QUE IMPORTA: la garantía de inmutabilidad NO depende de ese rol. La
-- sostienen el REVOKE y el trigger de las secciones 1 y 2, y el trigger alcanza
-- al dueño. `app_api` es defensa en profundidad sobre CON QUÉ IDENTIDAD se
-- conecta la API, y su procedimiento está en CONEXION_SUPABASE.md §12.
--
-- Lo que sí hace esta migración es VIGILARLO: si el rol existe, sus atributos
-- se verifican en cada despliegue contra `pg_roles` (sección 4c). No se puede
-- reafirmar por ALTER ROLE, pero sí se puede exigir que sea correcto.

-- 4 · Aserciones de despliegue -------------------------------------------------
-- Si alguien revierte cualquiera de las tres capas, el despliegue FALLA.
-- La asercion de 0015 tenia `AND grantee <> 'postgres'`, que excluia justamente
-- al rol del hallazgo. Aqui no se excluye a nadie.
DO $$
DECLARE n int; detalle text;
BEGIN
  -- (a) Ningun rol —dueño incluido— conserva UPDATE, DELETE o TRUNCATE.
  SELECT count(*), coalesce(string_agg(DISTINCT grantee || ':' || table_name || ':' || privilege_type, ', '), '')
    INTO n, detalle
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')
     AND (table_name LIKE 'eventos%'
          OR table_name IN ('evidencias','auditoria_seguridad','purgas_retencion'));
  IF n > 0 THEN
    RAISE EXCEPTION 'ADR-005 incumplido: % concesiones de UPDATE/DELETE/TRUNCATE sobre tablas append-only (%)', n, detalle;
  END IF;

  -- (b) Los dos triggers existen Y estan habilitados en cada tabla append-only
  --     y en cada particion de `eventos`. Verificar solo la existencia dejaria
  --     pasar un `ALTER TABLE ... DISABLE TRIGGER`, que es el riesgo residual.
  SELECT count(*), coalesce(string_agg(DISTINCT c.relname || ':' || tg.nombre, ', '), '')
    INTO n, detalle
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   CROSS JOIN (VALUES ('tg_prohibir_update'), ('tg_prohibir_delete')) AS tg(nombre)
   WHERE ns.nspname = 'public' AND c.relkind IN ('r','p')
     AND (c.relname LIKE 'eventos%'
          OR c.relname IN ('evidencias','auditoria_seguridad','purgas_retencion'))
     AND NOT EXISTS (
       SELECT 1 FROM pg_trigger t
        WHERE t.tgrelid = c.oid AND t.tgname = tg.nombre AND t.tgenabled <> 'D');
  IF n > 0 THEN
    RAISE EXCEPTION 'ADR-005 incumplido: % triggers append-only ausentes o desactivados (%)', n, detalle;
  END IF;

  -- (c) Si el rol de conexion dedicado existe, sus atributos deben ser los
  --     esperados. No se pueden REAFIRMAR con ALTER ROLE sin ser superusuario,
  --     asi que se VERIFICAN contra `pg_roles` y el despliegue falla si alguien
  --     los cambio. La condicion `IF EXISTS` es deliberada: el rol lo crea el
  --     operador (CONEXION_SUPABASE.md §12), y su ausencia no debe bloquear el
  --     despliegue de una garantia que no depende de el.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    SELECT count(*) INTO n FROM pg_roles
     WHERE rolname = 'app_api' AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb);
    IF n > 0 THEN
      RAISE EXCEPTION
        'app_api tiene atributos indebidos. Esperado: NOSUPERUSER, NOBYPASSRLS, '
        'NOCREATEROLE, NOCREATEDB. Revisar CONEXION_SUPABASE.md §12.';
    END IF;

    -- Y tampoco puede haber ganado escritura sobre las tablas append-only:
    -- la comprobacion (a) ya lo cubre, pero se nombra para que el motivo del
    -- fallo sea legible si ocurre.
    IF EXISTS (SELECT 1 FROM information_schema.role_table_grants
                WHERE grantee = 'app_api' AND table_schema = 'public'
                  AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')
                  AND (table_name LIKE 'eventos%'
                       OR table_name IN ('evidencias','auditoria_seguridad','purgas_retencion'))) THEN
      RAISE EXCEPTION 'app_api tiene escritura sobre tablas append-only';
    END IF;

    RAISE NOTICE 'app_api presente y con atributos correctos';
  ELSE
    RAISE NOTICE 'app_api no existe todavia: la crea el operador (CONEXION_SUPABASE.md §12). '
                 'La inmutabilidad NO depende de ello.';
  END IF;

  RAISE NOTICE 'ADR-005 verificado sin excluir al dueño: append-only garantizado por permisos Y por trigger';
END
$$;
