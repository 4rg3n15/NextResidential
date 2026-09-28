-- =============================================================================
-- 99 · PORTEROS POR IDENTIFICADOR, LISTA BLANCA Y MODO PRUEBAS · ETAPA 15-L (H)
-- ADR-031
--
-- Lo que la BASE sostiene por su cuenta, sin la API delante:
--  · cada copropiedad tiene su pool, nunca solapado y nunca bajo 1001;
--  · una copropiedad nueva recibe el SIGUIENTE pool por disparador;
--  · el identificador sale progresivo del pool, respeta el cupo de porteros
--    ACTIVOS, no se reutiliza al desactivar, no cambia una vez puesto y no
--    puede ser de otro pool;
--  · las IP de porteros sólo las cambia el superadministrador, y la base
--    rechaza lo que no es una IP o una red;
--  · el modo pruebas: una fila, que sólo cambia el superadministrador.
-- Dentro de una transacción que se DESHACE al final.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000001","copropiedad_id":null}';

DO $$
DECLARE
  v_cop   uuid;
  v_pool  public.pools_de_porteros%ROWTYPE;
  v_ant   public.pools_de_porteros%ROWTYPE;
  n1      integer;
  n2      integer;
  n3      integer;
  v_u1    uuid := gen_random_uuid();
  v_u2    uuid := gen_random_uuid();
BEGIN
  -- 1 · ningún pool bajo 1001, ninguno solapado ------------------------------
  ASSERT NOT EXISTS (SELECT 1 FROM public.pools_de_porteros WHERE inicio < 1001),
    'FALLO: un pool invade el 0001–0999 reservado';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.pools_de_porteros a JOIN public.pools_de_porteros b
      ON a.copropiedad_id <> b.copropiedad_id
     AND int4range(a.inicio, a.fin, '[]') && int4range(b.inicio, b.fin, '[]')),
    'FALLO: dos pools se solapan';
  BEGIN
    INSERT INTO public.pools_de_porteros (copropiedad_id, numero, inicio, fin, siguiente,
                                          creado_por, actualizado_por)
    SELECT '10000000-0000-4000-8000-000000000002', 999999, p.inicio, p.fin, p.inicio,
           p.creado_por, p.creado_por
      FROM public.pools_de_porteros p WHERE p.copropiedad_id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FALLO: entró un pool solapado';
  EXCEPTION WHEN unique_violation OR exclusion_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.pools_de_porteros SET inicio = 1, fin = 999, siguiente = 1
     WHERE copropiedad_id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FALLO: un pool entró en el 0001–0999';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 2 · la copropiedad nueva recibe el siguiente pool ---------------------------
  SELECT * INTO v_ant FROM public.pools_de_porteros ORDER BY numero DESC LIMIT 1;
  INSERT INTO public.copropiedades (nombre, nit, creado_por, actualizado_por)
  VALUES ('Prueba de pools', '900999111-1',
          '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')
  RETURNING id INTO v_cop;
  SELECT * INTO v_pool FROM public.pools_de_porteros WHERE copropiedad_id = v_cop;
  ASSERT v_pool.numero > v_ant.numero, 'FALLO: la copropiedad nueva no tiene el pool siguiente';
  ASSERT v_pool.inicio = v_pool.numero * 1000 + 1 AND v_pool.fin = v_pool.numero * 1000 + 999,
    format('FALLO: el pool %s no es [n·1000+1, n·1000+999]', v_pool.numero);

  -- 3 · progresivo, con cupo de ACTIVOS, sin reutilizar ---------------------
  UPDATE public.pools_de_porteros SET cupo = 1 WHERE copropiedad_id = v_cop;
  n1 := app.asignar_numero_de_portero(v_cop);
  ASSERT n1 = v_pool.inicio, 'FALLO: el primer identificador no es el inicio del pool';
  INSERT INTO public.usuarios (id, copropiedad_id, auth_user_id, nombre_usuario, nombre,
                               numero_de_portero, creado_por, actualizado_por)
  VALUES (v_u1, v_cop, gen_random_uuid(), 'p' || n1, 'Portero uno', n1,
          '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
  INSERT INTO public.roles_usuario (copropiedad_id, usuario_id, rol, creado_por, actualizado_por)
  VALUES (v_cop, v_u1, 'portero', '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM app.asignar_numero_de_portero(v_cop);
    RAISE EXCEPTION 'FALLO: el cupo de 1 admitió un segundo portero activo';
  EXCEPTION WHEN SQLSTATE 'NCP01' THEN NULL;
  END;
  -- Se desactiva: el cupo se libera, el número NO vuelve.
  UPDATE public.roles_usuario SET estado = 'inactivo', desactivado_en = now(),
         desactivado_por = '00000000-0000-4000-8000-000000000001'
   WHERE usuario_id = v_u1;
  n2 := app.asignar_numero_de_portero(v_cop);
  ASSERT n2 = n1 + 1, format('FALLO: tras desactivar se asignó %s y no %s', n2, n1 + 1);

  -- 4 · único, inmutable y de su pool ---------------------------------------
  BEGIN
    INSERT INTO public.usuarios (id, copropiedad_id, auth_user_id, nombre_usuario, nombre,
                                 numero_de_portero, creado_por, actualizado_por)
    VALUES (v_u2, v_cop, gen_random_uuid(), 'otro' || n1, 'Duplicado', n1,
            '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'FALLO: un identificador ya dado entró otra vez';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.usuarios SET numero_de_portero = n2 WHERE id = v_u1;
    RAISE EXCEPTION 'FALLO: el identificador de un portero cambió';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.usuarios (id, copropiedad_id, auth_user_id, nombre_usuario, nombre,
                                 numero_de_portero, creado_por, actualizado_por)
    VALUES (v_u2, v_cop, gen_random_uuid(), 'ajeno', 'De otro pool', 1500,
            '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'FALLO: entró un identificador de OTRO pool';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- 5 · pool agotado --------------------------------------------------------
  UPDATE public.pools_de_porteros SET siguiente = fin + 1, cupo = 999 WHERE copropiedad_id = v_cop;
  BEGIN
    n3 := app.asignar_numero_de_portero(v_cop);
    RAISE EXCEPTION 'FALLO: un pool agotado dio el %', n3;
  EXCEPTION WHEN SQLSTATE 'NCP02' THEN NULL;
  END;
  RAISE NOTICE 'OK 99 · pools sin solape, identificador progresivo, con cupo, único e inmutable';
END
$$;

-- 6 · las IP: sólo IP o redes, y sólo el superadministrador ----------------------
UPDATE public.copropiedades
   SET ips_porteria = '{192.0.2.10}', ips_guardia_remota = '{198.51.100.0/24,2001:db8::/32}'
 WHERE id = '10000000-0000-4000-8000-000000000001';
DO $$
BEGIN
  BEGIN
    UPDATE public.copropiedades SET ips_porteria = '{no-es-una-ip}'
     WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FALLO: entró una IP que no lo es';
  EXCEPTION WHEN invalid_text_representation THEN NULL;
  END;
  RAISE NOTICE 'OK 99 · la base sólo admite IP o redes';
END
$$;

-- Como `authenticated`: la conexión de pruebas es superusuario y la RLS no le
-- alcanzaría; con este rol, sí (como en la 97).
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"rol":"administrador","usuario_id":"00000000-0000-4000-8000-000000000010","copropiedad_id":"10000000-0000-4000-8000-000000000001"}';
DO $$
BEGIN
  BEGIN
    UPDATE public.copropiedades SET ips_guardia_remota = '{0.0.0.0/0}'
     WHERE id = '10000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'FALLO: el administrador abrió la guardia remota a todo Internet';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- El modo pruebas: el administrador lo LEE, no lo cambia.
  ASSERT (SELECT count(*) FROM public.ajustes_globales) = 1, 'FALLO: el modo pruebas no se lee';
  UPDATE public.ajustes_globales SET modo_pruebas = false;
  ASSERT (SELECT modo_pruebas FROM public.ajustes_globales), 'FALLO: el administrador apagó el modo pruebas';
  -- Ni ve las sesiones del superadministrador.
  ASSERT (SELECT count(*) FROM public.sesiones_de_superadministrador) = 0,
    'FALLO: el administrador ve las sesiones del superadministrador';
  RAISE NOTICE 'OK 99 · IP y modo pruebas: sólo el superadministrador';
END
$$;

SET LOCAL request.jwt.claims = '{"rol":"superadministrador","usuario_id":"00000000-0000-4000-8000-000000000001","copropiedad_id":null}';
DO $$
BEGIN
  BEGIN
    INSERT INTO public.ajustes_globales (id, modo_pruebas, creado_por, actualizado_por)
    VALUES (false, false, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'FALLO: una segunda fila de ajustes globales';
  -- Sin privilegio de INSERT para nadie, y aunque lo hubiera, una sola fila.
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
  UPDATE public.ajustes_globales SET modo_pruebas = false;
  ASSERT NOT (SELECT modo_pruebas FROM public.ajustes_globales), 'FALLO: el superadministrador no lo cambió';
  RAISE NOTICE 'OK 99 · una sola fila de ajustes globales';
END
$$;

-- H3 · todo portero ACTIVO tiene número: es su única forma de entrar. Cubre
-- a los que la 0042 numeró al migrar y al de las semillas, sembrado después.
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.roles_usuario r
      JOIN public.usuarios u ON u.id = r.usuario_id
     WHERE r.rol = 'portero' AND r.estado = 'activo' AND u.numero_de_portero IS NULL
  ), 'FALLO: hay un portero activo sin número: no podría entrar';
  RAISE NOTICE 'OK 99 · todo portero activo tiene número';
END
$$;

RESET ROLE;
ROLLBACK;
