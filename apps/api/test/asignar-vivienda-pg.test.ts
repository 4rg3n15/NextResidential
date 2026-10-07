import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DOMINIO_SINTETICO } from '../src/cuentas/dominio/correo-sintetico';
import { COP_A, COP_B } from './utilidades';
import { INICIAL, NUEVA, SUPER, bancoDelHogar } from './banco-del-hogar-pg';
import type { Sesion } from './banco-del-hogar-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * RONDA 15-W · D1 · «ASIGNAR VIVIENDA» A LAS CUENTAS ANTIGUAS (D-W9, ADR-037)
 *
 * Las cuentas de residente anteriores a la 15-W nacieron sin vivienda, y su
 * primer ingreso las hacía titulares de la que eligieran. Ya no: sin vivienda,
 * la app sólo dice «La administración debe asignarle su vivienda», y el
 * superadministrador se la asigna con motivo —sólo una vivienda sin titular—,
 * con su fila en la bitácora. Esa ruta, y las demás de la administración, le
 * están vedadas al residente: 403.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const banco = bancoDelHogar('sin DATABASE_URL_PRUEBAS o sin las migraciones 0055 y 0056');
const omitida = (): boolean => !banco.disponible;
const RESIDENTES = `/copropiedades/${COP_A}/residentes`;
const correoDe = (usuario: string): string => `${usuario}@${COP_A}.${DOMINIO_SINTETICO}`;

describe('15-W · D1 · «Asignar vivienda» y las rutas de la administración', () => {
  const s = banco.sufijo;
  let titular: Sesion = { usuarioId: '', token: '' };
  let ocupada = '';

  it('«Asignar vivienda» a una cuenta antigua: con motivo, queda de titular y entra a su vivienda', async () => {
    if (omitida()) return;
    ocupada = await banco.vivienda(COP_A, `H${s}`);
    titular = await banco.titular(COP_A, ocupada, `asig.${s}`);
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
      viviendaId: ocupada,
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

  it('un residente que llama a las rutas de la administración recibe 403', async () => {
    if (omitida()) return;
    const { token } = titular;
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
        banco.con(token, 'post', `${RESIDENTES}/cuentas/${titular.usuarioId}/vivienda`, {
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
