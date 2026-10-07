import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { cumpleMayoriaEn } from '@ncr/domain-core';
import { POLITICA_DEL_ROSTRO_DE_MENOR } from '../src/residente/aplicacion/politica-del-rostro';
import { ipDePrueba } from './banco-del-hogar-pg';
import { bancoConTerminales } from './terminales-de-rostro-pg';
import type { Sesion } from './banco-del-hogar-pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D3 · EL ROSTRO DE UN MENOR CONTRA LA BASE REAL (ADR-039, Ley 1581 art. 7)
 *
 * Sólo el titular del hogar (otro adulto, 403) y sólo un menor de SU vivienda
 * (el del vecino, 404) · de 15 a 17 años (14, 400) · consentimiento con el
 * origen del representante y su cuenta como autora · vence al año o a los 18 ·
 * retiro que revoca y retira de los equipos · la baja del menor lo saca de los
 * equipos EN EL ACTO · la bitácora sin bytes ni documento.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const {
  banco,
  espia,
  terminales: altaDeTerminales,
} = bancoConTerminales('sin DATABASE_URL_PRUEBAS o sin la migración 0057');
const omitida = (): boolean => !banco.disponible;

/** Una fecha de nacimiento a `anios` y `dias` de hoy, con margen frente al cambio de día. */
const nacidoHace = (anios: number, dias: number): string => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - anios);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
};
const jpeg = (): string =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    randomBytes(96),
    Buffer.from([0xff, 0xd9]),
  ]).toString('base64');
const cuerpo = (extra: Record<string, unknown> = {}) => ({
  contenidoBase64: jpeg(),
  tipoMime: 'image/jpeg',
  medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
  versionPolitica: POLITICA_DEL_ROSTRO_DE_MENOR.version,
  aceptaPolitica: true,
  declaraRepresentacionLegal: true,
  menorInformadoYDeAcuerdo: true,
  ...extra,
});

describe('15-X · D3 · el rostro de un menor', () => {
  const s = banco.sufijo;
  let cop = { id: '', codigo: '' };
  let titular: Sesion = { usuarioId: '', token: '' };
  let adulto: Sesion = { usuarioId: '', token: '' };
  let vecino: Sesion = { usuarioId: '', token: '' };
  const menores: Record<'de16' | 'de14' | 'de17' | 'delVecino', string> = {
    de16: '',
    de14: '',
    de17: '',
    delVecino: '',
  };
  const terminales: string[] = [];
  const ruta = (residenteId: string) => `/copropiedades/${cop.id}/mi/menores/${residenteId}/rostro`;
  const pedir = (t: string, metodo: 'get' | 'post', r: string, c?: object) =>
    banco.con(t, metodo, r, c).set('x-forwarded-for', ipDePrueba());
  const libre = async (token: string): Promise<string> => {
    const r = await banco.con(token, 'get', `/copropiedades/${cop.id}/mi/ocupantes`);
    const plaza = (r.body.plazas as { id: string; libre: boolean }[]).find((p) => p.libre);
    if (plaza === undefined) throw new Error('sin plaza libre');
    return plaza.id;
  };
  const registrarMenor = async (token: string, nacimiento: string, n: number) => {
    const r = await banco.con(token, 'post', `/copropiedades/${cop.id}/mi/menores`, {
      nombres: `Menor ${String(n)}`,
      apellidos: `Prueba ${s}`,
      fechaNacimiento: nacimiento,
      tipoDocumento: 'tarjeta_identidad',
      numeroDocumento: `${String(n)}${s}7`,
      parentesco: 'Hijo',
      plazaId: await libre(token),
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    return r.body.residenteId as string;
  };
  const vivas = async (residenteId: string) =>
    (
      await banco.pool.query<{ id: string; suprimir_en: Date }>(
        `SELECT p.id, p.suprimir_en FROM public.plantillas_biometricas p
           JOIN public.residentes r ON r.persona_id = p.persona_id
          WHERE r.id = $1 AND p.autorizacion_id IS NULL
            AND p.estado IN ('pendiente_consentimiento','pendiente_sincronizacion','activa')`,
        [residenteId],
      )
    ).rows;

  it('prepara: titular con plazas, otro adulto, tres menores, un vecino con el suyo y dos terminales', async () => {
    if (omitida()) return;
    cop = await banco.copropiedadPropia();
    titular = await banco.titular(cop.id, await banco.vivienda(cop.id, '11'), `trm.${s}`);
    await banco.completarAlta(cop.id, titular.token, banco.perfil(1));
    const plazas = await banco.con(titular.token, 'post', `/copropiedades/${cop.id}/mi/ocupantes`, {
      numero: 4,
    });
    adulto = await banco.adultoConCodigo(
      cop.id,
      String(plazas.body.plazas[1]?.codigo),
      `arm.${s}`,
      banco.perfil(2),
    );
    menores.de16 = await registrarMenor(titular.token, nacidoHace(16, 60), 1);
    menores.de14 = await registrarMenor(titular.token, nacidoHace(14, 60), 2);
    vecino = await banco.titular(cop.id, await banco.vivienda(cop.id, '12'), `vrm.${s}`);
    await banco.completarAlta(cop.id, vecino.token, banco.perfil(3));
    await banco.con(vecino.token, 'post', `/copropiedades/${cop.id}/mi/ocupantes`, { numero: 2 });
    menores.delVecino = await registrarMenor(vecino.token, nacidoHace(16, 60), 3);
    terminales.push(...(await altaDeTerminales(cop.id, ['Terminal C', 'Videoportero D'])));
  });

  it('el titular lee el estado con la política del representante; sin caché y sin imagen', async () => {
    if (omitida()) return;
    const r = await pedir(titular.token, 'get', ruta(menores.de16));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toMatchObject({
      estado: 'sin_rostro',
      equiposConRostro: 2,
      politica: POLITICA_DEL_ROSTRO_DE_MENOR,
    });
  });

  it('otro adulto del MISMO hogar: 403 en las tres rutas, y no se crea nada', async () => {
    if (omitida()) return;
    expect((await pedir(adulto.token, 'get', ruta(menores.de16))).status).toBe(403);
    expect((await pedir(adulto.token, 'post', ruta(menores.de16), cuerpo())).status).toBe(403);
    expect((await pedir(adulto.token, 'post', `${ruta(menores.de16)}/retiro`)).status).toBe(403);
    expect(await vivas(menores.de16)).toEqual([]);
  });

  it('el menor de OTRA vivienda no existe para esta ruta: 404 en los dos sentidos', async () => {
    if (omitida()) return;
    expect((await pedir(vecino.token, 'get', ruta(menores.de16))).status).toBe(404);
    expect((await pedir(vecino.token, 'post', ruta(menores.de16), cuerpo())).status).toBe(404);
    expect((await pedir(titular.token, 'post', ruta(menores.delVecino), cuerpo())).status).toBe(
      404,
    );
    expect((await pedir(titular.token, 'post', `${ruta(menores.delVecino)}/retiro`)).status).toBe(
      404,
    );
    // Un adulto CON cuenta del hogar tampoco es un «menor» para esta ruta.
    const delAdulto = await banco.uno<{ id: string }>(
      `SELECT r.id FROM public.residentes r JOIN public.usuarios u ON u.persona_id = r.persona_id
        WHERE u.id = $1 AND r.estado = 'activo'`,
      [adulto.usuarioId],
    );
    expect((await pedir(titular.token, 'get', ruta(String(delAdulto?.id)))).status).toBe(404);
    expect(await vivas(menores.de16)).toEqual([]);
    expect(await vivas(menores.delVecino)).toEqual([]);
  });

  it('con 14 años: 400 EDAD_INSUFICIENTE, y nada se crea', async () => {
    if (omitida()) return;
    const r = await pedir(titular.token, 'post', ruta(menores.de14), cuerpo());
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toMatchObject({ codigo: 'EDAD_INSUFICIENTE' });
    expect(await vivas(menores.de14)).toEqual([]);
  });

  let plantilla = '';
  it('con 16: 201, en los equipos, autorizado por el representante, al año, en la bitácora', async () => {
    if (omitida()) return;
    const foto = cuerpo();
    const r = await pedir(titular.token, 'post', ruta(menores.de16), foto);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ estado: 'activa', equiposConMiRostro: 2 });
    expect(JSON.stringify(r.body)).not.toContain(foto.contenidoBase64.slice(0, 24));
    const [viva] = await vivas(menores.de16);
    plantilla = viva?.id ?? '';
    const dias = ((viva?.suprimir_en.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(364);
    expect(dias).toBeLessThan(366);
    expect(terminales.map((t) => espia.recibidas.includes(`${t}/${plantilla}`))).toEqual([
      true,
      true,
    ]);
    expect(
      await banco.uno(
        `SELECT c.origen, c.declarado_por, c.estado::text FROM public.consentimientos_biometricos c
           JOIN public.plantillas_biometricas p ON p.consentimiento_id = c.id WHERE p.id = $1`,
        [plantilla],
      ),
    ).toEqual({
      origen: 'autorizado_por_representante_legal',
      declarado_por: titular.usuarioId,
      estado: 'vigente',
    });
    const hecho = await banco.uno<{ detalle: string; actor_id: string }>(
      `SELECT detalle, actor_id FROM public.bitacora_de_residentes
        WHERE copropiedad_id = $1 AND tipo = 'rostro_de_menor_registrado'`,
      [cop.id],
    );
    expect(hecho).toEqual({
      detalle: `residente:${menores.de16} politica:${POLITICA_DEL_ROSTRO_DE_MENOR.version}`,
      actor_id: titular.usuarioId,
    });
  });

  it('retiro: revoca la autorización y lo saca de los dos equipos en el acto', async () => {
    if (omitida()) return;
    const r = await pedir(titular.token, 'post', `${ruta(menores.de16)}/retiro`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.estado).toBe('sin_rostro');
    expect(await vivas(menores.de16)).toEqual([]);
    expect(terminales.map((t) => espia.retiradas.includes(`${t}/${plantilla}`))).toEqual([
      true,
      true,
    ]);
    expect(
      await banco.uno(
        `SELECT c.estado::text FROM public.consentimientos_biometricos c
           JOIN public.plantillas_biometricas p ON p.consentimiento_id = c.id WHERE p.id = $1`,
        [plantilla],
      ),
    ).toEqual({ estado: 'revocado' });
    expect((await pedir(titular.token, 'post', `${ruta(menores.de16)}/retiro`)).status).toBe(404);
  });

  it('a punto de cumplir 18: vence ese día, a las 00:00 de Bogotá', async () => {
    if (omitida()) return;
    // La plaza del de 14 queda libre con su baja; la ocupa uno que cumple 18 en 100 días.
    const baja = await banco.con(
      titular.token,
      'post',
      `/copropiedades/${cop.id}/mi/menores/${menores.de14}/baja`,
      { motivo: 'Prueba del rostro de un menor' },
    );
    expect(baja.status, JSON.stringify(baja.body)).toBeLessThan(300);
    const nacimiento = nacidoHace(18, -100);
    menores.de17 = await registrarMenor(titular.token, nacimiento, 4);
    const r = await pedir(titular.token, 'post', ruta(menores.de17), cuerpo());
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const [viva] = await vivas(menores.de17);
    expect(viva?.suprimir_en.toISOString()).toBe(cumpleMayoriaEn(nacimiento)?.toISOString());
  });

  it('la baja del menor saca su rostro de los equipos EN EL ACTO, sin esperar al barrido', async () => {
    if (omitida()) return;
    const [viva] = await vivas(menores.de17);
    const baja = await banco.con(
      adulto.token,
      'post',
      `/copropiedades/${cop.id}/mi/menores/${menores.de17}/baja`,
      { motivo: 'Se mudó con su otra familia' },
    );
    expect(baja.status, JSON.stringify(baja.body)).toBeLessThan(300);
    expect(await vivas(menores.de17)).toEqual([]);
    expect(terminales.map((t) => espia.retiradas.includes(`${t}/${String(viva?.id)}`))).toEqual([
      true,
      true,
    ]);
  });
});
