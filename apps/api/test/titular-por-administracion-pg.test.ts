import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DOMINIO_SINTETICO } from '../src/cuentas/dominio/correo-sintetico';
import { COP_A, COP_B } from './utilidades';
import { INICIAL, NUEVA, SUPER, bancoDelHogar } from './banco-del-hogar-pg';

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
 * la reciben con «Asignar vivienda», con motivo en la bitácora.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const banco = bancoDelHogar('sin DATABASE_URL_PRUEBAS o sin las migraciones 0055 y 0056');
const omitida = (): boolean => !banco.disponible;
const RESIDENTES = `/copropiedades/${COP_A}/residentes`;
const correoDe = (usuario: string, cop = COP_A): string => `${usuario}@${cop}.${DOMINIO_SINTETICO}`;

describe('15-W · D1 · el titular nace con su vivienda', () => {
  const s = banco.sufijo;
  let vivienda = '';
  let titularId = '';

  it('la cuenta nace asignada: ocupación, bitácora, origen y cambio obligatorio', async () => {
    if (omitida()) return;
    vivienda = await banco.vivienda(COP_A, `T${s}`);
    const libres = await banco.comoSuper('get', `${RESIDENTES}/viviendas-sin-titular?q=T${s}`);
    expect(libres.status, JSON.stringify(libres.body)).toBe(200);
    expect((libres.body as { id: string }[]).map((v) => v.id)).toEqual([vivienda]);
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
    expect(despues.body).toEqual([]);
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

  it('«Asignar vivienda» a una cuenta antigua: con motivo, queda de titular y entra a su vivienda', async () => {
    if (omitida()) return;
    // Una cuenta de residente anterior a la 15-W, sin vivienda: como la dejaba la 15-I.
    const authUserId = randomUUID();
    const vieja = await banco.uno<{ id: string }>(
      `INSERT INTO public.usuarios (copropiedad_id, auth_user_id, correo, nombre_usuario, nombre,
                                    debe_cambiar_contrasena, creado_por, actualizado_por)
       VALUES ($1, $2, NULL, $3, 'Cuenta antigua', false, $4, $4) RETURNING id`,
      [COP_A, authUserId, `vieja.${s}`, SUPER],
    );
    const viejaId = vieja?.id ?? '';
    await banco.pool.query(
      `INSERT INTO public.roles_usuario (copropiedad_id, usuario_id, rol, creado_por, actualizado_por)
       VALUES ($1, $2, 'residente', $3, $3)`,
      [COP_A, viejaId, SUPER],
    );
    banco.proveedor.declarar(correoDe(`vieja.${s}`), NUEVA, authUserId);
    const token = await banco.sesion(viejaId, NUEVA);
    const sinAsignar = await banco.con(token, 'get', `/copropiedades/${COP_A}/mi/alta`);
    expect(sinAsignar.body).toMatchObject({
      viviendaAsignada: false,
      aviso: 'La administración debe asignarle su vivienda',
    });
    // Sin vivienda, el primer ingreso no la inventa.
    const antes = await banco.con(
      token,
      'post',
      `/copropiedades/${COP_A}/mi/alta`,
      banco.perfil(2),
    );
    expect(antes.body.motivo).toBe('SIN_VIVIENDA');

    const v = await banco.vivienda(COP_A, `A${s}`);
    const ruta = `${RESIDENTES}/cuentas/${viejaId}/vivienda`;
    expect((await banco.comoSuper('post', ruta, { viviendaId: v })).status).toBe(400);
    const conTitular = await banco.comoSuper('post', ruta, {
      viviendaId: vivienda,
      motivo: 'Cuenta 15-I',
    });
    expect(conTitular.status).toBe(409);
    const asignada = await banco.comoSuper('post', ruta, {
      viviendaId: v,
      motivo: 'Cuenta anterior a la 15-W',
    });
    expect(asignada.status, JSON.stringify(asignada.body)).toBe(200);
    expect(asignada.body).toEqual({ asignada: true });
    const otraVez = await banco.comoSuper('post', ruta, {
      viviendaId: v,
      motivo: 'Por segunda vez',
    });
    expect(otraVez.status).toBe(409);
    expect(JSON.stringify(otraVez.body)).toContain('Esa cuenta ya tiene vivienda');
    const inexistente = await banco.comoSuper(
      'post',
      `${RESIDENTES}/cuentas/${randomUUID()}/vivienda`,
      {
        viviendaId: v,
        motivo: 'No existe',
      },
    );
    expect(inexistente.status).toBe(404);
    // Desde otra copropiedad, la cuenta no existe.
    const desdeRoble = await banco.comoSuper(
      'post',
      `/copropiedades/${COP_B}/residentes/cuentas/${viejaId}/vivienda`,
      {
        viviendaId: v,
        motivo: 'Intento cruzado',
      },
    );
    expect(desdeRoble.status).toBe(404);
    expect(
      await banco.uno(
        `SELECT detalle, actor_id::text AS actor FROM public.bitacora_de_residentes
          WHERE vivienda_id = $1 AND tipo = 'vivienda_asignada_por_administracion'`,
        [v],
      ),
    ).toEqual({ detalle: 'Cuenta anterior a la 15-W', actor: SUPER });
    const alta = await banco.con(token, 'post', `/copropiedades/${COP_A}/mi/alta`, banco.perfil(2));
    expect(alta.body, JSON.stringify(alta.body)).toMatchObject({
      vinculada: true,
      debeDeclararOcupantes: true,
    });
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

  it('un residente que llama a las rutas de la administración recibe 403', async () => {
    if (omitida()) return;
    const token = await banco.sesion(titularId, NUEVA);
    const v = await banco.vivienda(COP_A, `R${s}`);
    const intentos: [string, ReturnType<typeof banco.con>][] = [
      [
        'alta de cuenta',
        banco.con(token, 'post', `${RESIDENTES}/cuentas`, {
          usuario: `res.${s}`,
          contrasenaInicial: INICIAL,
          nombre: 'Intento',
          viviendaId: v,
        }),
      ],
      [
        'asignar vivienda',
        banco.con(token, 'post', `${RESIDENTES}/cuentas/${titularId}/vivienda`, {
          viviendaId: v,
          motivo: 'Me la asigno yo',
        }),
      ],
      ['viviendas sin titular', banco.con(token, 'get', `${RESIDENTES}/viviendas-sin-titular`)],
      ['estado del registro', banco.con(token, 'get', `${RESIDENTES}/registro`)],
      [
        'tope de la vivienda',
        banco.con(token, 'put', `/copropiedades/${COP_A}/viviendas/${v}/tope-de-plazas`, {
          tope: 9,
          motivo: 'Me lo subo yo',
        }),
      ],
      [
        'tope por omisión',
        banco.con(token, 'put', `/copropiedades/${COP_A}/tope-de-plazas`, {
          tope: 9,
          motivo: 'Para todos',
        }),
      ],
    ];
    for (const [nombre, peticion] of intentos) {
      const r = await peticion;
      expect(r.status, `${nombre}: ${JSON.stringify(r.body)}`).toBe(403);
    }
    expect(await banco.usuarioId(COP_A, `res.${s}`)).toBeUndefined();
  });
});
