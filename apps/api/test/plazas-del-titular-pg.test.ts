import { describe, expect, it } from 'vitest';
import { SUPER, bancoDelHogar, ipDePrueba } from './banco-del-hogar-pg';
import type { Sesion } from './banco-del-hogar-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * RONDA 15-W · D4 bis · LAS PLAZAS LAS GESTIONA EL TITULAR (D-W10, S-15W-03)
 *
 * El titular añade plazas hasta el tope de su vivienda —4 por omisión,
 * contándose a sí mismo— y retira las LIBRES; la plaza 1, la suya, nunca. La
 * decisión final es del disparador de la base, también ante peticiones
 * simultáneas. El superadministrador amplía el tope de una vivienda concreta o
 * cambia el de la copropiedad, y bajarlo nunca le quita plazas a nadie.
 * Copropiedad propia: su tope por omisión es estado de la copropiedad.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const banco = bancoDelHogar('sin DATABASE_URL_PRUEBAS o sin las migraciones 0055 y 0056');
const omitida = (): boolean => !banco.disponible;

interface Plaza {
  id: string;
  numero: number;
  libre: boolean;
  codigo: string | null;
}

describe('15-W · D4 bis · las plazas del titular', () => {
  const s = banco.sufijo;
  let cop = { id: '', codigo: '' };
  let casa = '';
  let titular: Sesion = { usuarioId: '', token: '' };
  let adulto: Sesion = { usuarioId: '', token: '' };
  const mis = () => `/copropiedades/${cop.id}/mi/ocupantes`;
  // Una IP por petición: el límite de la ruta (10/min, §7) corre antes de la
  // autenticación y cuenta por dirección; aquí cada petición es un teléfono.
  const anadir = (token: string) =>
    banco.con(token, 'post', `${mis()}/plazas`).set('x-forwarded-for', ipDePrueba());
  const retirar = (token: string, plazaId: string, motivo?: string) =>
    banco
      .con(
        token,
        'post',
        `${mis()}/plazas/${plazaId}/retiro`,
        motivo === undefined ? {} : { motivo },
      )
      .set('x-forwarded-for', ipDePrueba());
  const vivas = async (): Promise<Plaza[]> =>
    (await banco.con(titular.token, 'get', mis())).body.plazas as Plaza[];

  it('prepara: el titular declara 2 y un adulto entra con el código de la plaza 2', async () => {
    if (omitida()) return;
    cop = await banco.copropiedadPropia();
    casa = await banco.vivienda(cop.id, '1');
    titular = await banco.titular(cop.id, casa, `tit.${s}`);
    await banco.completarAlta(cop.id, titular.token, banco.perfil(1));
    const r = await banco.con(titular.token, 'post', mis(), { numero: 2 });
    expect(r.body).toMatchObject({ declarados: 2, tope: 4, esTitular: true });
    const libre = (r.body.plazas as Plaza[]).find((p) => p.libre);
    adulto = await banco.adultoConCodigo(
      cop.id,
      String(libre?.codigo),
      `adu.${s}`,
      banco.perfil(2),
    );
  });

  it('otro adulto de la vivienda no añade ni retira plazas: 403', async () => {
    if (omitida()) return;
    expect((await anadir(adulto.token)).status).toBe(403);
    const [, segunda] = await vivas();
    expect((await retirar(adulto.token, String(segunda?.id), 'No soy el titular')).status).toBe(
      403,
    );
    const vistas = await banco.con(adulto.token, 'get', mis());
    expect(vistas.body.esTitular).toBe(false);
  });

  it('el titular llega hasta 4 —contándose— y la quinta da 409 con su explicación', async () => {
    if (omitida()) return;
    const tercera = await anadir(titular.token);
    expect(tercera.status, JSON.stringify(tercera.body)).toBe(200);
    const cuarta = await anadir(titular.token);
    expect(cuarta.body.plazas).toHaveLength(4);
    expect(cuarta.body.tope).toBe(4);
    const quinta = await anadir(titular.token);
    expect(quinta.status).toBe(409);
    expect(JSON.stringify(quinta.body)).toContain(
      'Su vivienda tiene el máximo de 4 plazas. Para más, pídalo a la administración.',
    );
    expect(await vivas()).toHaveLength(4);
  });

  it('retira una LIBRE con motivo; la ocupada y la plaza 1 no se retiran: 409', async () => {
    if (omitida()) return;
    const plazas = await vivas();
    const libre = plazas.find((p) => p.libre && p.numero === 4);
    expect((await retirar(titular.token, String(libre?.id))).status).toBe(400);
    const retirada = await retirar(titular.token, String(libre?.id), 'Ya no vive nadie más');
    expect(retirada.status, JSON.stringify(retirada.body)).toBe(200);
    expect(retirada.body.plazas).toHaveLength(3);
    const ocupada = plazas.find((p) => p.numero === 2);
    const conPersona = await retirar(titular.token, String(ocupada?.id), 'Intento con persona');
    expect(conPersona.status).toBe(409);
    expect(JSON.stringify(conPersona.body)).toContain('Primero dé de baja a la persona');
    const suya = plazas.find((p) => p.numero === 1);
    expect((await retirar(titular.token, String(suya?.id), 'La mía')).status).toBe(409);
    const rastro = await banco.uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.bitacora_de_residentes
        WHERE vivienda_id = $1 AND tipo IN ('plaza_anadida', 'plaza_retirada') AND actor_id = $2`,
      [casa, titular.usuarioId],
    );
    expect(rastro?.n).toBe('3');
  });

  it('cinco «añadir» a la vez sobre la cuarta plaza: entra UNA, la base decide', async () => {
    if (omitida()) return;
    const intentos = await Promise.all([1, 2, 3, 4, 5].map(() => anadir(titular.token)));
    const estados = intentos.map((r) => r.status);
    expect(
      estados.filter((e) => e === 200),
      estados.join(','),
    ).toHaveLength(1);
    expect(estados.filter((e) => e === 409)).toHaveLength(4);
    const activas = await banco.uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.plazas_de_ocupante WHERE vivienda_id = $1 AND estado = 'activo'`,
      [casa],
    );
    expect(activas?.n).toBe('4');
  });

  it('con tope 6 la quinta entra; el tope no baja de las plazas activas, ni volviendo al de la copropiedad', async () => {
    if (omitida()) return;
    const ruta = `/copropiedades/${cop.id}/viviendas/${casa}/tope-de-plazas`;
    expect((await banco.comoSuper('put', ruta, { tope: 6 })).status).toBe(400);
    const seis = await banco.comoSuper('put', ruta, { tope: 6, motivo: 'Familia numerosa' });
    expect(seis.status, JSON.stringify(seis.body)).toBe(200);
    expect(seis.body).toEqual({ tope: 6, activas: 4, propio: true });
    expect((await anadir(titular.token)).status).toBe(200);
    expect(await vivas()).toHaveLength(5);
    const bajo = await banco.comoSuper('put', ruta, { tope: 4, motivo: 'Bajarlo de más' });
    expect(bajo.status).toBe(409);
    expect(JSON.stringify(bajo.body)).toContain(
      'El tope no puede quedar por debajo de las plazas activas',
    );
    const alDeLaCopropiedad = await banco.comoSuper('put', ruta, {
      tope: null,
      motivo: 'Volver al general',
    });
    expect(alDeLaCopropiedad.status).toBe(409);
    const visto = await banco.comoSuper('get', ruta);
    expect(visto.body).toEqual({ tope: 6, activas: 5, propio: true });
    const rastro = await banco.uno<{ actor: string }>(
      `SELECT actor_id::text AS actor FROM public.bitacora_de_residentes
        WHERE vivienda_id = $1 AND tipo = 'tope_de_plazas_cambiado'`,
      [casa],
    );
    expect(rastro?.actor).toBe(SUPER);
  });

  it('bajar el tope de la copropiedad no le quita plazas a nadie: quien tenía más, las conserva', async () => {
    if (omitida()) return;
    const otra = await banco.vivienda(cop.id, '2');
    const suTitular = await banco.titular(cop.id, otra, `tit2.${s}`);
    await banco.completarAlta(cop.id, suTitular.token, banco.perfil(3));
    expect((await banco.con(suTitular.token, 'post', mis(), { numero: 4 })).status).toBe(200);
    const general = `/copropiedades/${cop.id}/tope-de-plazas`;
    expect((await banco.comoSuper('get', general)).body).toEqual({ tope: 4 });
    const tres = await banco.comoSuper('put', general, { tope: 3, motivo: 'Copropiedad pequeña' });
    expect(tres.status, JSON.stringify(tres.body)).toBe(200);
    expect((await banco.comoSuper('get', general)).body).toEqual({ tope: 3 });
    // La vivienda 2 tenía 4: conserva sus 4 con un tope propio, y no pasa de ahí.
    const suyo = await banco.comoSuper(
      'get',
      `/copropiedades/${cop.id}/viviendas/${otra}/tope-de-plazas`,
    );
    expect(suyo.body).toEqual({ tope: 4, activas: 4, propio: true });
    expect((await anadir(suTitular.token)).status).toBe(409);
    // Una plaza de OTRA vivienda no existe para su titular: 404, y sigue viva.
    const deLaPrimera = (await vivas()).find((p) => p.libre);
    expect((await retirar(suTitular.token, String(deLaPrimera?.id), 'No es mía')).status).toBe(404);
    expect((await vivas()).map((p) => p.id)).toContain(deLaPrimera?.id);
    // La 1 tenía tope propio (6): no la toca. Una vivienda nueva ya va con 3.
    const primera = await banco.comoSuper(
      'get',
      `/copropiedades/${cop.id}/viviendas/${casa}/tope-de-plazas`,
    );
    expect(primera.body).toEqual({ tope: 6, activas: 5, propio: true });
    const nueva = await banco.vivienda(cop.id, '3');
    const suTitular3 = await banco.titular(cop.id, nueva, `tit3.${s}`);
    await banco.completarAlta(cop.id, suTitular3.token, banco.perfil(4));
    expect((await banco.con(suTitular3.token, 'post', mis(), { numero: 4 })).status).toBe(409);
    expect((await banco.con(suTitular3.token, 'post', mis(), { numero: 3 })).status).toBe(200);
  });
});
