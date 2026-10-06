import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { LIMITE_DE_REGISTRO_POR_PREFIJO } from '../src/cuentas/presentacion/limites-de-registro';
import { crearApp, crearFirmante, sinModoPruebas } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * RONDA 15-W · §7 · EL LIMITADOR CON NOMBRE DE «CREAR CUENTA»: (IP, PREFIJO)
 *
 * 5 cada 15 minutos por dirección Y prefijo del código: frena a quien prueba
 * códigos de UN conjunto sin gastar el cupo con el que esa misma red registra
 * en otro. Una petición SIN código no entra en él: es con la que la app pide la
 * política (C-60), y si contara, abrir «Crear cuenta» cinco veces dejaría a la
 * familia sin el texto que tiene que aceptar. Un código MALFORMADO sí cuenta.
 *
 * Sin base: el limitador corre antes que el caso de uso, así que lo que éste
 * conteste no importa, sólo si es 429. Con el modo pruebas APAGADO por el
 * camino de producción, porque con él los topes con nombre suben (H5).
 * ═════════════════════════════════════════════════════════════════════════════
 */
let app: INestApplication;
beforeAll(async () => {
  app = await crearApp(await crearFirmante());
  await sinModoPruebas(app);
});
afterAll(async () => {
  await app?.close();
});

const registrar = (ip: string, codigoDeInvitacion: string) =>
  request(app.getHttpServer())
    .post('/auth/registro')
    .set('x-forwarded-for', ip)
    .send({ usuario: 'quien', codigoDeInvitacion });
const estados = async (ip: string, codigos: readonly string[]): Promise<number[]> => {
  const vistos: number[] = [];
  for (const codigo of codigos) vistos.push((await registrar(ip, codigo)).status);
  return vistos;
};
const veces = (n: number, codigo: (i: number) => string): string[] =>
  Array.from({ length: n }, (_, i) => codigo(i));
const MAS_UNO = LIMITE_DE_REGISTRO_POR_PREFIJO + 1;

describe('15-W · §7 · el limitador (IP, prefijo) de «Crear cuenta»', () => {
  it(`el intento ${String(MAS_UNO)} con el MISMO prefijo desde la misma IP da 429 con Retry-After`, async () => {
    const vistos = await estados(
      '192.0.2.10',
      veces(LIMITE_DE_REGISTRO_POR_PREFIJO, (i) => `ZZPRUEBA-ABCD-EFG${'HJKLM'[i] ?? 'N'}`),
    );
    expect(vistos.filter((e) => e === 429)).toEqual([]);
    const limitada = await registrar('192.0.2.10', 'ZZPRUEBA-ABCD-EFGP');
    expect(limitada.status).toBe(429);
    expect(Number(limitada.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('el cupo es del par: otro prefijo desde esa IP, o ese prefijo desde otra, siguen', async () => {
    expect((await registrar('192.0.2.10', 'YYPRUEBA-ABCD-EFGH')).status).not.toBe(429);
    expect((await registrar('192.0.2.11', 'ZZPRUEBA-ABCD-EFGH')).status).not.toBe(429);
  });

  it('el formulario sin código —con el que la app pide la política— no gasta ese cupo', async () => {
    const vistos = await estados(
      '192.0.2.12',
      veces(MAS_UNO + 1, () => ''),
    );
    expect(vistos.filter((e) => e === 429)).toEqual([]);
  });

  it(`y un código MALFORMADO sí: el intento ${String(MAS_UNO)} da 429`, async () => {
    const vistos = await estados(
      '192.0.2.13',
      veces(MAS_UNO, () => '¡no-es-un-código!'),
    );
    expect(vistos.slice(0, -1).filter((e) => e === 429)).toEqual([]);
    expect(vistos.at(-1)).toBe(429);
  });
});
