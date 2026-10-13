import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DOMINIO_SINTETICO } from '../src/cuentas/dominio/correo-sintetico';
import { COP_A, COP_B } from './utilidades';
import { INICIAL, NUEVA, SUPER, bancoDelHogar } from './banco-del-hogar-pg';
import { interferir } from './interferencia';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * RONDA 15-W · D1 · EL TITULAR DE CADA VIVIENDA LO CREA LA ADMINISTRACIÓN
 * (cierra el CRÍTICO del problema 1; D-W9, ADR-037)
 *
 * Antes, la cuenta que daba la administración no traía vivienda, y en su
 * primer ingreso marcaba «no lo tengo» y se hacía titular de CUALQUIER vivienda
 * vacía. Ahora la primera cuenta de cada vivienda nace ya asignada a ella, con
 * contraseña inicial y cambio obligatorio, y la base sólo deja un titular por
 * vivienda aunque dos altas lleguen a la vez. Las cuentas antiguas sin vivienda
 * la reciben con «Asignar vivienda», con motivo: `asignar-vivienda-pg`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const banco = bancoDelHogar('sin DATABASE_URL_PRUEBAS o sin las migraciones 0055 y 0056');
const omitida = (): boolean => !banco.disponible;
const RESIDENTES = `/copropiedades/${COP_A}/residentes`;
const correoDe = (usuario: string, cop = COP_A): string => `${usuario}@${cop}.${DOMINIO_SINTETICO}`;

/** Lo que la búsqueda promete de CADA fila: el texto está en su identificador o su agrupación. */
const coinciden = (filas: unknown, q: string): boolean =>
  (filas as { identificador: string; agrupacion: string | null }[]).every((v) =>
    [v.identificador, v.agrupacion ?? ''].some((c) => c.toLowerCase().includes(q.toLowerCase())),
  );

describe('15-W · D1 · el titular nace con su vivienda', () => {
  const s = banco.sufijo;
  let vivienda = '';
  let titularId = '';

  it('la cuenta nace asignada: ocupación, bitácora, origen y cambio obligatorio', async () => {
    if (omitida()) return;
    vivienda = await banco.vivienda(COP_A, `T${s}`);
    // 15-S5 · otra vivienda de COP_A cuyo identificador también contiene `T${s}`.
    await interferir('vivienda-parecida', () => banco.vivienda(COP_A, `XT${s}`));
    const libres = await banco.comoSuper('get', `${RESIDENTES}/viviendas-sin-titular?q=T${s}`);
    expect(libres.status, JSON.stringify(libres.body)).toBe(200);
    // 15-S5 · DT-15M-C01 · la búsqueda es por subcadena sobre TODA COP_A: se exige
    // la de esta corrida, no que sea la única.
    expect((libres.body as { id: string }[]).map((v) => v.id)).toContain(vivienda);
    expect(coinciden(libres.body, `T${s}`)).toBe(true);
    const alta = await banco.comoSuper('post', `${RESIDENTES}/cuentas`, {
      usuario: `tit.${s}`,
      contrasenaInicial: INICIAL,
      nombre: 'Titular de prueba',
      viviendaId: vivienda,
    });
    expect(alta.status, JSON.stringify(alta.body)).toBe(201);
    titularId = alta.body.usuarioId as string;
    expect(
      await banco.uno(
        `SELECT o.primer_residente_id::text AS titular, u.origen_de_alta AS origen,
                u.debe_cambiar_contrasena AS cambia
           FROM public.ocupacion_de_viviendas o, public.usuarios u
          WHERE o.vivienda_id = $1 AND u.id = $2`,
        [vivienda, titularId],
      ),
    ).toEqual({ titular: titularId, origen: 'administracion', cambia: true });
    const rastro = await banco.uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE vivienda_id = $1 AND tipo = 'titular_asignado_por_administracion'
          AND usuario_id = $2 AND actor_id = $3`,
      [vivienda, titularId, SUPER],
    );
    expect(rastro?.n).toBe('1');
    // Ya no se ofrece a otra primera cuenta, y la lista la enseña con su vivienda.
    const despues = await banco.comoSuper('get', `${RESIDENTES}/viviendas-sin-titular?q=T${s}`);
    expect(despues.status).toBe(200);
    expect((despues.body as { id: string }[]).map((v) => v.id)).not.toContain(vivienda);
    expect(coinciden(despues.body, `T${s}`)).toBe(true);
    const lista = await banco.comoSuper('get', `${RESIDENTES}/cuentas`);
    const fila = (
      lista.body as { usuarioId: string; vivienda: string | null; origen: string }[]
    ).find((c) => c.usuarioId === titularId);
    expect(fila?.origen).toBe('administracion');
    expect(fila?.vivienda).toContain(`T${s}`);
  });

  it('el titular cambia la contraseña antes de nada, y su primer ingreso lo hace titular', async () => {
    if (omitida()) return;
    const inicial = await banco.sesion(titularId, INICIAL);
    const ruta = `/copropiedades/${COP_A}/mi/alta`;
    expect((await banco.con(inicial, 'get', ruta)).status).toBe(403);
    const cambio = await banco.con(inicial, 'post', '/auth/contrasena', {
      actual: INICIAL,
      nueva: NUEVA,
    });
    expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
    const token = await banco.sesion(titularId, NUEVA);
    const estado = await banco.con(token, 'get', ruta);
    expect(estado.body).toMatchObject({
      viviendaAsignada: true,
      viviendaVinculada: false,
      aviso: null,
    });
    const alta = await banco.con(token, 'post', ruta, banco.perfil(1));
    expect(alta.body, JSON.stringify(alta.body)).toMatchObject({
      vinculada: true,
      debeDeclararOcupantes: true,
    });
    const residente = await banco.uno<{ titular: boolean }>(
      `SELECT r.es_titular AS titular FROM public.residentes r
         JOIN public.usuarios u ON u.persona_id = r.persona_id
        WHERE u.id = $1 AND r.vivienda_id = $2 AND r.estado = 'activo'`,
      [titularId, vivienda],
    );
    expect(residente?.titular).toBe(true);
  });

  it('vivienda con titular → 409; inactiva, inexistente o de otra copropiedad → 404; y nada queda', async () => {
    if (omitida()) return;
    const alta = (usuario: string, viviendaId: string) =>
      banco.comoSuper('post', `${RESIDENTES}/cuentas`, {
        usuario,
        contrasenaInicial: INICIAL,
        nombre: 'Intento',
        viviendaId,
      });
    const conTitular = await alta(`otro.${s}`, vivienda);
    expect(conTitular.status).toBe(409);
    expect(JSON.stringify(conTitular.body)).toContain(
      'Esta vivienda ya tiene titular: los demás entran con un código de plaza',
    );
    const inactiva = await banco.vivienda(COP_A, `I${s}`);
    await banco.pool.query(
      `UPDATE public.viviendas SET estado = 'inactivo', desactivado_en = now(),
              desactivado_por = $2, motivo_desactivacion = 'prueba 15-W'
        WHERE id = $1`,
      [inactiva, SUPER],
    );
    const ajena = await banco.vivienda(COP_B, `J${s}`);
    for (const [usuario, viviendaId] of [
      [`ina.${s}`, inactiva],
      [`aje.${s}`, ajena],
      [`nex.${s}`, randomUUID()],
    ] as const) {
      const r = await alta(usuario, viviendaId);
      expect(r.status, `${usuario}: ${JSON.stringify(r.body)}`).toBe(404);
    }
    // Sin vivienda, ni con un campo de más: 400 por forma.
    const sinVivienda = await banco.comoSuper('post', `${RESIDENTES}/cuentas`, {
      usuario: `sin.${s}`,
      contrasenaInicial: INICIAL,
      nombre: 'Sin vivienda',
    });
    expect(sinVivienda.status).toBe(400);
    for (const usuario of [`otro.${s}`, `ina.${s}`, `aje.${s}`, `nex.${s}`, `sin.${s}`]) {
      expect(await banco.usuarioId(COP_A, usuario), usuario).toBeUndefined();
      expect(await banco.proveedor.iniciarSesion(correoDe(usuario), INICIAL), usuario).toBeNull();
    }
  });

  it('tres altas simultáneas para la misma vivienda: un titular, y las identidades sobrantes se eliminan', async () => {
    if (omitida()) return;
    const v = await banco.vivienda(COP_A, `C${s}`);
    const usuarios = [1, 2, 3].map((i) => `con${String(i)}.${s}`);
    const intentos = await Promise.all(
      usuarios.map((usuario) =>
        banco.comoSuper('post', `${RESIDENTES}/cuentas`, {
          usuario,
          contrasenaInicial: INICIAL,
          nombre: 'Concurrente',
          viviendaId: v,
        }),
      ),
    );
    const estados = intentos.map((r) => r.status).sort();
    expect(estados, JSON.stringify(intentos.map((r) => r.body))).toEqual([201, 409, 409]);
    const ganadora = intentos.find((r) => r.status === 201)?.body.usuarioId as string;
    expect(
      (
        await banco.uno<{ id: string }>(
          'SELECT primer_residente_id::text AS id FROM public.ocupacion_de_viviendas WHERE vivienda_id = $1',
          [v],
        )
      )?.id,
    ).toBe(ganadora);
    for (const [i, usuario] of usuarios.entries()) {
      if (intentos[i]?.status === 201) continue;
      // Ni en la base ni en el proveedor: la compensación borró la identidad.
      expect(await banco.usuarioId(COP_A, usuario), usuario).toBeUndefined();
      expect(await banco.proveedor.iniciarSesion(correoDe(usuario), INICIAL), usuario).toBeNull();
    }
  });

  it('un titular que resulta MENOR en su primer ingreso: la cuenta queda bloqueada y la vivienda, libre', async () => {
    if (omitida()) return;
    const v = await banco.vivienda(COP_A, `M${s}`);
    const menor = await banco.titular(COP_A, v, `menor.${s}`);
    const r = await banco.con(menor.token, 'post', `/copropiedades/${COP_A}/mi/alta`, {
      ...banco.perfil(5),
      fechaNacimiento: '2012-03-01',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ vinculada: false, motivo: 'CUENTA_BLOQUEADA_POR_EDAD' });
    expect(
      await banco.uno(
        `SELECT u.estado::text AS cuenta, u.persona_id,
                (SELECT count(*)::int FROM public.roles_usuario r
                  WHERE r.usuario_id = u.id AND r.estado = 'activo') AS roles,
                (SELECT count(*)::int FROM public.bitacora_de_residentes b
                  WHERE b.usuario_id = u.id AND b.tipo = 'cuenta_bloqueada_por_edad') AS rastro
           FROM public.usuarios u WHERE u.id = $1`,
        [menor.usuarioId],
      ),
    ).toEqual({ cuenta: 'inactivo', persona_id: null, roles: 0, rastro: 1 });
    // El gancho de la base ya no le da rol: un token nuevo no abre nada.
    const despues = await banco.sesion(menor.usuarioId, NUEVA);
    expect([401, 403]).toContain(
      (await banco.con(despues, 'get', `/copropiedades/${COP_A}/mi/alta`)).status,
    );
    // Y la vivienda vuelve a ofrecerse para su titular.
    const libres = await banco.comoSuper('get', `${RESIDENTES}/viviendas-sin-titular?q=M${s}`);
    expect((libres.body as { id: string }[]).map((x) => x.id)).toContain(v);
  });
});
