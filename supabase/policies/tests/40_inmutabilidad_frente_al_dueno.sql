-- =============================================================================
-- Inmutabilidad frente al DUEÑO de la tabla · ADR-005 · RN-03 · CA-23
--
-- POR QUÉ EXISTE ESTA PRUEBA.
-- La prueba 20 recorre los seis roles de aplicación con `SET ROLE authenticated`
-- y verifica que UPDATE y DELETE fallan. Todos pasaban. Pero el rol con el que
-- la API se conecta de verdad en Supabase es `postgres`, el DUEÑO de las tablas,
-- y ese camino no se probaba: la prueba 20 nunca intenta la operación SIN hacer
-- `SET ROLE` antes. El hueco no era del esquema, era del alcance de la prueba.
--
-- Esta prueba ataca por el camino que faltaba: la sesión TAL COMO LLEGA, sin
-- cambiar de rol, que es exactamente lo que hace una cadena de conexión.
--
-- Nota sobre fidelidad: en la base local el dueño es superusuario y en Supabase
-- no lo es. Un superusuario ignora los permisos de tabla, así que el REVOKE no
-- se puede demostrar aquí por ejecución —se verifica leyendo el ACL, sección 1—.
-- El TRIGGER sí dispara contra un superusuario, así que la sección 2 es una
-- demostración real y no una comprobación documental.
-- =============================================================================

\set ON_ERROR_STOP on

-- Contexto de escritura. NO se hace `SET ROLE`: la prueba debe correr con la
-- identidad TAL COMO LLEGA la conexión — que es el punto ciego que dejó pasar
-- el hallazgo del rol `postgres`.
SET request.jwt.claims =
  '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';

-- 1 · Nadie, ni el dueño, conserva UPDATE/DELETE/TRUNCATE --------------------
DO $$
DECLARE n int; detalle text;
BEGIN
  SELECT count(*), coalesce(string_agg(DISTINCT grantee||':'||table_name||':'||privilege_type, ', '), '')
    INTO n, detalle
    FROM information_schema.role_table_grants
   WHERE table_schema='public'
     AND privilege_type IN ('UPDATE','DELETE','TRUNCATE')
     AND (table_name LIKE 'eventos%'
          OR table_name IN ('evidencias','auditoria_seguridad','purgas_retencion'));
  ASSERT n = 0, format('El dueño u otro rol conserva %s privilegios de escritura: %s', n, detalle);
  RAISE NOTICE '1 · ACL sin UPDATE/DELETE/TRUNCATE para NINGUN rol, dueño incluido: ok';
END
$$;

-- 2 · El trigger bloquea a la sesión actual (dueño y superusuario) ------------
-- Sin `SET ROLE`: se ejecuta con la identidad de la conexión, como haría la API.
DO $$
DECLARE
  v_id uuid;
  v_regla text;
BEGIN
  INSERT INTO public.eventos (copropiedad_id, ocurrido_en, tipo, resultado, motivo, metodo,
                              dispositivo_id, regla_aplicada, version_reglas,
                              clave_idempotencia, creado_por)
  SELECT c.id, now(), 'denegado','negado','LISTA_NEGRA','placa',
         d.id, 'lista_negra.original', 1, 'prueba-dueno-0001', u.id
    FROM public.copropiedades c
    JOIN public.dispositivos d ON d.copropiedad_id = c.id
    JOIN public.usuarios     u ON u.copropiedad_id = c.id
   LIMIT 1
  RETURNING id INTO v_id;

  ASSERT v_id IS NOT NULL, 'La prueba requiere las semillas cargadas';

  BEGIN
    UPDATE public.eventos SET regla_aplicada = 'ALTERADA' WHERE id = v_id;
    RAISE EXCEPTION 'ADR-005 INCUMPLIDA: el dueño de la tabla pudo hacer UPDATE sobre eventos';
  EXCEPTION WHEN restrict_violation OR insufficient_privilege THEN
    NULL;  -- correcto
  END;

  BEGIN
    DELETE FROM public.eventos WHERE id = v_id;
    RAISE EXCEPTION 'ADR-005 INCUMPLIDA: el dueño de la tabla pudo hacer DELETE sobre eventos';
  EXCEPTION WHEN restrict_violation OR insufficient_privilege THEN
    NULL;  -- correcto
  END;

  -- La fila sobrevive intacta: es la prueba de que no hubo escritura parcial.
  SELECT regla_aplicada INTO v_regla FROM public.eventos WHERE id = v_id;
  ASSERT v_regla = 'lista_negra.original',
    format('El evento fue alterado pese al bloqueo: regla_aplicada = %s', v_regla);
  RAISE NOTICE '2 · UPDATE y DELETE rechazados para el DUEÑO de la tabla: ok';
END
$$;

-- 3 · La protección alcanza a las particiones futuras -------------------------
DO $$
DECLARE v_nombre text; n int;
BEGIN
  v_nombre := split_part(app.crear_particion_eventos(
                (date_trunc('month', now()) + interval '13 months')::date), ' ', 1);

  SELECT count(*) INTO n
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name = v_nombre
     AND privilege_type IN ('UPDATE','DELETE','TRUNCATE');
  ASSERT n = 0, format('La particion %s nace con %s privilegios de escritura', v_nombre, n);

  -- Los triggers se clonan del padre particionado; se verifica que además
  -- llegan HABILITADOS, porque un trigger desactivado no protege nada.
  SELECT count(*) INTO n
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = v_nombre
     AND t.tgname IN ('tg_prohibir_update','tg_prohibir_delete')
     AND t.tgenabled <> 'D';
  ASSERT n = 2, format('La particion %s tiene %s de 2 triggers append-only activos', v_nombre, n);
  RAISE NOTICE '3 · Particion futura nace protegida por ACL y por trigger: ok';
END
$$;

-- 4 · Un trigger desactivado hace fallar la verificación ----------------------
-- Comprueba que la aserción de 0017 detecta el riesgo residual declarado:
-- `ALTER TABLE ... DISABLE TRIGGER`, la única vía que le queda al dueño.
DO $$
DECLARE n int;
BEGIN
  ALTER TABLE public.evidencias DISABLE TRIGGER tg_prohibir_update;

  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname='public' AND c.relname='evidencias'
     AND NOT EXISTS (SELECT 1 FROM pg_trigger t
                      WHERE t.tgrelid=c.oid AND t.tgname='tg_prohibir_update'
                        AND t.tgenabled <> 'D');
  ASSERT n = 1, 'La verificacion NO detecta un trigger desactivado: la asercion de 0017 es ciega';

  ALTER TABLE public.evidencias ENABLE ALWAYS TRIGGER tg_prohibir_update;
  RAISE NOTICE '4 · Un trigger desactivado se detecta y rompe el despliegue: ok';
END
$$;

-- 5 · El camino que SÍ elude la RLS: la llave secreta -------------------------
-- Es el escenario decisivo. Frente al dueño hay tres barreras y la RLS ya basta
-- (`eventos` no tiene política de UPDATE, y FORCE alcanza al dueño, así que la
-- sentencia afecta a cero filas). Pero `service_role` lleva BYPASSRLS: para él
-- la RLS no cuenta y solo quedan los permisos y el trigger. Aquí se comprueba
-- que, si alguien le devolviera el UPDATE, el trigger lo detiene igual.
--
-- Sin esta sección, «el trigger protege» sería una afirmación sin demostrar:
-- en el camino del dueño el trigger ni siquiera llega a dispararse.
DO $$
DECLARE v_id uuid; v_regla text;
BEGIN
  SET LOCAL request.jwt.claims =
    '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';

  INSERT INTO public.eventos (copropiedad_id, ocurrido_en, tipo, resultado, motivo, metodo,
                              dispositivo_id, regla_aplicada, version_reglas,
                              clave_idempotencia, creado_por)
  SELECT c.id, now(),'denegado','negado','LISTA_NEGRA','placa', d.id,
         'intacta', 1, 'prueba-bypassrls-0001', u.id
    FROM public.copropiedades c
    JOIN public.dispositivos d ON d.copropiedad_id = c.id
    JOIN public.usuarios     u ON u.copropiedad_id = c.id
   WHERE c.id = '10000000-0000-4000-8000-000000000001'
   LIMIT 1
  RETURNING id INTO v_id;
  ASSERT v_id IS NOT NULL, 'La prueba requiere las semillas cargadas';

  -- Se le devuelve deliberadamente el privilegio para dejar al trigger solo.
  GRANT UPDATE ON public.eventos TO service_role;
  BEGIN
    SET LOCAL ROLE service_role;
    BEGIN
      EXECUTE format(
        'UPDATE public.eventos SET regla_aplicada = ''ALTERADA'' WHERE id = %L', v_id);
      RESET ROLE;
      REVOKE UPDATE ON public.eventos FROM service_role;
      RAISE EXCEPTION
        'ADR-005 INCUMPLIDA: `service_role` con UPDATE concedido pudo alterar un evento. '
        'El trigger es la ultima barrera del camino BYPASSRLS y no actuo.';
    EXCEPTION WHEN restrict_violation THEN
      NULL;  -- correcto: lo paro el trigger
    END;
    RESET ROLE;
  END;
  REVOKE UPDATE ON public.eventos FROM service_role;

  SELECT regla_aplicada INTO v_regla FROM public.eventos WHERE id = v_id;
  ASSERT v_regla = 'intacta',
    format('El evento fue alterado por la via BYPASSRLS: regla_aplicada = %s', v_regla);
  RAISE NOTICE '5 · Con BYPASSRLS y UPDATE concedido, el TRIGGER detiene la alteracion: ok';
END
$$;
