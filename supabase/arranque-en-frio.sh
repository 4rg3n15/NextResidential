#!/usr/bin/env bash
# =============================================================================
# PRUEBA DE ARRANQUE EN FRÍO · base vacía → migraciones → aprovisionamiento →
# claims válidos.
#
# POR QUÉ EXISTE. El 2026-09-09 el usuario intentó desplegar sobre un proyecto
# real y se encontró con que no había ninguna copropiedad, y con que el primer
# usuario no podía crearse porque `creado_por` es NOT NULL y apunta a
# `usuarios`. Nada lo detectaba:
#
#   · La suite SQL (`verificar.sh --con-pruebas`) corre DESPUÉS de las semillas,
#     así que siempre encuentra un actor de sistema ya creado.
#   · La suite de la API firma sus propios tokens y usa adaptadores en memoria,
#     así que nunca toca la base.
#
# Entre las dos cubrían todo menos el único camino que un despliegue recorre de
# verdad. Esta prueba recorre EXACTAMENTE ese: sin semillas, sin datos de
# ejemplo y sin ningún `INSERT` escrito a mano.
#
#   ./supabase/arranque-en-frio.sh
#
# Variables: las mismas que `verificar.sh` (PGHOST, PGPORT, PGUSER).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

export PGDATABASE="${PGDATABASE_ARRANQUE:-ncr_arranque}"
APLICADOR=sb_postgres_sim

echo "▸ base vacía + migraciones (SIN semillas)"
./supabase/verificar.sh --modo-supabase >/dev/null

echo "▸ arranque y aserciones"
psql -U "$APLICADOR" -v ON_ERROR_STOP=1 -Atq <<'SQL'
DO $$
DECLARE
  v_cop      uuid;
  v_admin    uuid;
  v_claims   jsonb;
  n          integer;
  v_error    text;
BEGIN
  -- ===== 0 · la base está DE VERDAD vacía ==================================
  -- Sin esto la prueba podría estar corriendo sobre una base con semillas y no
  -- probar nada. Es la comprobación previa que la sonda del contrato enseñó a
  -- poner: verificar la línea base antes de concluir.
  PERFORM set_config('request.jwt.claims',
    json_build_object('rol','superadministrador',
                      'usuario_id', app.actor_de_sistema())::text, true);

  SELECT count(*) INTO n FROM public.copropiedades;
  ASSERT n = 0, format('la base no está vacía: hay %s copropiedades', n);

  SELECT count(*) INTO n FROM public.usuarios;
  ASSERT n = 1, format('en una base recién migrada solo debe estar el actor de sistema, hay %s', n);

  -- ===== 1 · el actor de sistema rompe el ciclo de auditoría ===============
  SELECT count(*) INTO n FROM public.usuarios
   WHERE id = app.actor_de_sistema() AND creado_por = app.actor_de_sistema()
     AND actualizado_por = app.actor_de_sistema();
  ASSERT n = 1, 'el actor de sistema no existe o no se autorreferencia';

  -- ===== 2 · ninguna restricción de auditoría se ha debilitado =============
  -- Es la condición explícita del encargo: el arranque no puede haberse
  -- resuelto permitiendo nulos. Se comprueba contra el catálogo, no de memoria.
  -- La ÚNICA excepción admitida, y está razonada: un evento de seguridad puede
  -- registrarse sin autor autenticado —un login fallido, un límite de
  -- peticiones alcanzado—, así que ahí el autor nulo es información y no un
  -- hueco. Cualquier otra columna que pierda el NOT NULL rompe esta prueba.
  SELECT count(*) INTO n
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND a.attnum > 0 AND NOT a.attisdropped
     AND a.attname IN ('creado_por','actualizado_por') AND NOT a.attnotnull
     AND c.relkind = 'r'
     AND (c.relname || '.' || a.attname) <> 'auditoria_seguridad.creado_por';
  ASSERT n = 0, format('%s columna(s) de auditoría dejaron de ser NOT NULL', n);

  -- Y la excepción CADUCA SOLA: si algún día se endurece, hay que quitarla de
  -- aquí. Una lista de excepciones que nadie poda acaba tapando lo que vigila.
  SELECT count(*) INTO n
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relname = 'auditoria_seguridad'
     AND a.attname = 'creado_por' AND NOT a.attnotnull;
  ASSERT n = 1, 'auditoria_seguridad.creado_por ya es NOT NULL: sobra su excepción';

  -- ===== 3 · alta de copropiedad ==========================================
  v_cop := app.arranque_registrar_copropiedad('Copropiedad de arranque', '901000001');
  ASSERT v_cop IS NOT NULL, 'no se creó la copropiedad';

  -- Idempotente: repetir el arranque no duplica.
  ASSERT app.arranque_registrar_copropiedad('Copropiedad de arranque', '901000001') = v_cop,
    'el alta de copropiedad no es idempotente';

  -- ===== 4 · el guion valida sus argumentos ================================
  -- Un identificador inexistente tiene que fallar con un mensaje claro y ANTES
  -- de escribir nada, no reventar contra la clave ajena.
  BEGIN
    PERFORM app.arranque_vincular_usuario(
      '00000000-0000-4000-8000-0000000000e1'::uuid, 'x@y.invalid', 'X',
      'administrador'::rol_usuario, '00000000-0000-4000-8000-0000000000ff'::uuid);
    ASSERT false, 'una copropiedad inexistente NO fue rechazada';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    ASSERT v_error LIKE '%No existe ninguna copropiedad activa%',
      format('el rechazo no explica la causa: %s', v_error);
  END;

  SELECT count(*) INTO n FROM public.usuarios
   WHERE auth_user_id = '00000000-0000-4000-8000-0000000000e1';
  ASSERT n = 0, 'el rechazo dejó un usuario a medias';

  -- ===== 5 · superadministrador ===========================================
  v_admin := app.arranque_vincular_usuario(
    '00000000-0000-4000-8000-0000000000f1'::uuid, 'admin@grupocontrol.invalid',
    'Superadministrador', 'superadministrador'::rol_usuario, v_cop);

  SELECT count(*) INTO n FROM public.usuarios
   WHERE id = v_admin AND copropiedad_id IS NULL;
  ASSERT n = 1, 'el superadministrador debe ser identidad de plataforma (copropiedad nula)';

  -- Las filas de arranque quedan ATRIBUIDAS al actor de sistema: trazable.
  SELECT count(*) INTO n FROM public.copropiedades
   WHERE id = v_cop AND creado_por = app.actor_de_sistema()
     AND actualizado_por = app.actor_de_sistema();
  ASSERT n = 1, 'la copropiedad de arranque no quedó atribuida al actor de sistema';

  ASSERT app.arranque_vincular_usuario(
    '00000000-0000-4000-8000-0000000000f1'::uuid, 'admin@grupocontrol.invalid',
    'Superadministrador', 'superadministrador'::rol_usuario, v_cop) = v_admin,
    'el aprovisionamiento de rol no es idempotente';
  SELECT count(*) INTO n FROM public.roles_usuario WHERE usuario_id = v_admin;
  ASSERT n = 1, format('el rol se duplicó al repetir el aprovisionamiento (%s filas)', n);

  -- ===== 6 · el token que emitiría Supabase ===============================
  v_claims := public.custom_access_token_hook(
    jsonb_build_object('user_id', '00000000-0000-4000-8000-0000000000f1',
                       'claims', jsonb_build_object('aud','authenticated'))) -> 'claims';

  ASSERT v_claims->>'rol' = 'superadministrador',
    format('el gancho no emitió el rol: %s', v_claims);
  ASSERT v_claims->>'usuario_id' = v_admin::text,
    format('el gancho no emitió usuario_id: %s', v_claims);
  ASSERT v_claims ? 'copropiedad_id',
    'el gancho no emitió copropiedad_id; el guard lo necesita aunque sea nulo';
  ASSERT v_claims->>'aud' = 'authenticated',
    'el gancho perdió los claims que ya traía el evento';
  -- No puede fabricar el segundo factor: lo emite Supabase (ADR-008).
  ASSERT NOT (v_claims ? 'aal'), 'el gancho está escribiendo `aal`';

  -- ===== 7 · un administrador normal SÍ lleva copropiedad =================
  PERFORM app.arranque_vincular_usuario(
    '00000000-0000-4000-8000-0000000000f2'::uuid, 'gestor@grupocontrol.invalid',
    'Administradora', 'administrador'::rol_usuario, v_cop);

  v_claims := public.custom_access_token_hook(
    jsonb_build_object('user_id', '00000000-0000-4000-8000-0000000000f2',
                       'claims', '{}'::jsonb)) -> 'claims';
  ASSERT v_claims->>'rol' = 'administrador', format('rol incorrecto: %s', v_claims);
  ASSERT v_claims->>'copropiedad_id' = v_cop::text,
    format('el administrador debe llevar SU copropiedad: %s', v_claims);

  -- ===== 8 · una identidad sin rol NO recibe claims =======================
  -- Falla cerrado: un usuario a medio aprovisionar no debe poder entrar.
  v_claims := public.custom_access_token_hook(
    jsonb_build_object('user_id', '00000000-0000-4000-8000-0000000000fe',
                       'claims', '{}'::jsonb)) -> 'claims';
  ASSERT NOT (v_claims ? 'rol'),
    format('una identidad desconocida recibió claims: %s', v_claims);

  RAISE NOTICE 'arranque en frío: 8 bloques de aserciones en verde';
END
$$;
SQL

echo "ARRANQUE EN FRÍO: correcto — base vacía lleva a un superadministrador con claims válidos"
