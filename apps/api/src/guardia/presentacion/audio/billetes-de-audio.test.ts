import { describe, expect, it } from 'vitest';
import { BilletesDeAudio, VIGENCIA_DEL_BILLETE_S } from './billetes-de-audio';
import { ipDeLaActualizacion } from './ip-de-la-actualizacion';

const DATOS = {
  copropiedadId: 'cop-a',
  dispositivoId: 'vp-1',
  operadorId: 'op-1',
  ip: '192.0.2.7',
};

describe('15-P · el billete del WebSocket de audio', () => {
  it('vale UNA vez, desde su IP', () => {
    const billetes = new BilletesDeAudio(() => 0);
    const b = billetes.emitir(DATOS);
    expect(b).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(billetes.consumir(b, '192.0.2.7')).toEqual(DATOS);
    expect(billetes.consumir(b, '192.0.2.7')).toBeNull();
  });

  it('desde otra IP no vale, y queda gastado igual', () => {
    const billetes = new BilletesDeAudio(() => 0);
    const b = billetes.emitir(DATOS);
    expect(billetes.consumir(b, '198.51.100.1')).toBeNull();
    expect(billetes.consumir(b, '192.0.2.7')).toBeNull();
  });

  it('caduca a los 15 s', () => {
    let ahora = 0;
    const billetes = new BilletesDeAudio(() => ahora);
    const b = billetes.emitir(DATOS);
    ahora = VIGENCIA_DEL_BILLETE_S * 1000 + 1;
    expect(billetes.consumir(b, '192.0.2.7')).toBeNull();
  });

  it('no acumula sin límite: con 1000 vivos, el más viejo se descarta', () => {
    const billetes = new BilletesDeAudio(() => 0);
    const primero = billetes.emitir(DATOS);
    for (let i = 0; i < 1000; i += 1) billetes.emitir(DATOS);
    expect(billetes.consumir(primero, '192.0.2.7')).toBeNull();
  });

  it('un billete inventado no vale', () => {
    expect(new BilletesDeAudio().consumir('inventado', '192.0.2.7')).toBeNull();
  });
});

describe('15-P · la IP de la actualización, con el trust proxy acotado', () => {
  const peticion = (socket: string, xff?: string) =>
    ({
      socket: { remoteAddress: socket },
      headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    }) as never;
  const soloBucle = (d: string): boolean => d === '127.0.0.1' || d === '::ffff:127.0.0.1';

  it('sin proxy de confianza, la del socket aunque traiga X-Forwarded-For', () => {
    expect(ipDeLaActualizacion(peticion('192.0.2.9', '203.0.113.1'), soloBucle)).toBe('192.0.2.9');
  });

  it('por el proxy de la consola (bucle local), la del navegador', () => {
    expect(ipDeLaActualizacion(peticion('::ffff:127.0.0.1', '192.0.2.44'), soloBucle)).toBe(
      '192.0.2.44',
    );
  });

  it('en una cadena, el primer salto en el que no se confía', () => {
    expect(ipDeLaActualizacion(peticion('127.0.0.1', '203.0.113.1, 192.0.2.44'), soloBucle)).toBe(
      '192.0.2.44',
    );
  });

  it('sin dirección, null', () => {
    expect(ipDeLaActualizacion({ socket: {}, headers: {} } as never, soloBucle)).toBeNull();
  });
});
