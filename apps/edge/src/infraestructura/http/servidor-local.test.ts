import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { VersionDeReglas, negar } from '@ncr/domain-core';
import { sobreDeLectura } from '@ncr/providers';
import type { PublicacionDeEquipo } from '@ncr/providers';
import type { HechoLocal } from '../../aplicacion/instantanea-de-reglas';
import { crearManejador } from './servidor-local';
import { CacheDeNonces, LimitadorPorIp, firmaLocal, verificarLocal } from './proteccion-local';

/**
 * 15-Q · Q5 · las entradas locales del Edge, por HTTP de verdad: firma y nonce,
 * secreto y ORIGEN de la cámara, cuerpo acotado, ritmo acotado, y un hecho
 * ilegible que no se decide.
 */
const SECRETO = 'secreto-local-de-la-prueba-sin-valor-real';
const CAMARA = { dispositivoId: 'cam-1', host: '127.0.0.1', secreto: 's'.repeat(40) };
const OTRA = { dispositivoId: 'cam-2', host: '198.51.100.7', secreto: 'o'.repeat(40) };
const hechos: HechoLocal[] = [];
const publicadas: PublicacionDeEquipo[] = [];
const version = VersionDeReglas.crear(4, 'cop');
let servidor: Server;
let base = '';

beforeAll(async () => {
  if (!version.ok) throw new Error('versión');
  const manejador = crearManejador(
    {
      hecho: (h) => {
        hechos.push(h);
        return {
          claveIdempotencia: 'k',
          resultado: negar('PLACA_DESCONOCIDA', version.valor, 'politica.placa'),
          cachePotencialmenteObsoleto: false,
          porContingencia: false,
          requiereEscalamiento: false,
        };
      },
      estado: () => ({ modo: 'autonomo' }),
      publicar: async (p) => void publicadas.push(p),
    },
    { secretoLocal: SECRETO, limitePorMinuto: 40, camaras: [CAMARA, OTRA] },
  );
  servidor = createServer((req, res) => void manejador(req, res));
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  base = `http://127.0.0.1:${String((servidor.address() as AddressInfo).port)}`;
});
afterAll(async () => {
  await new Promise((listo) => servidor.close(listo));
});

const firmado = (
  metodo: 'GET' | 'POST',
  ruta: string,
  cuerpo = '',
  nonce = randomBytes(12).toString('hex'),
) => {
  const marca = String(Math.floor(Date.now() / 1000));
  return fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      'x-ncr-marca-temporal': marca,
      'x-ncr-nonce': nonce,
      'x-ncr-firma': firmaLocal(SECRETO, marca, nonce, metodo, ruta, cuerpo),
    },
    ...(metodo === 'POST' ? { body: cuerpo } : {}),
  });
};

describe('entradas locales del Edge (15-Q, Q5)', () => {
  it('/hechos firmado decide y contesta; ilegible o sin firma, no', async () => {
    const hecho = {
      dispositivoId: 'cam-1',
      metodo: 'placa',
      referenciaExterna: 'r-1',
      confianza: 0.9,
      placaLeida: 'ABC123',
    };
    const r = await firmado('POST', '/hechos', JSON.stringify(hecho));
    expect(await r.json()).toMatchObject({
      permitido: false,
      motivo: 'PLACA_DESCONOCIDA',
      versionDeReglas: 4,
    });
    expect(hechos[0]).toMatchObject({ placaLeida: 'ABC123', personaId: null, zonaId: null });
    expect((await firmado('POST', '/hechos', '{"metodo":"telepatia"}')).status).toBe(400);
    expect((await firmado('POST', '/hechos', 'no-json')).status).toBe(400);
    expect(
      (await fetch(`${base}/hechos`, { method: 'POST', body: JSON.stringify(hecho) })).status,
    ).toBe(401);
    expect(hechos).toHaveLength(1);
  });

  it('un cuerpo de más de 64 KiB en /hechos es 413', async () => {
    expect((await firmado('POST', '/hechos', 'x'.repeat(70 * 1024))).status).toBe(413);
  });

  it('la cámara publica con SU secreto desde SU origen; un sobre ilegible es 400', async () => {
    const sobre = sobreDeLectura({ placa: 'ABC123' });
    const publicar = (secreto: string, cuerpo: Buffer = sobre.cuerpo) =>
      fetch(`${base}/alarm-server/${secreto}`, {
        method: 'POST',
        headers: { 'content-type': sobre.tipoDeContenido },
        body: cuerpo,
      });
    expect((await publicar(CAMARA.secreto)).status).toBe(200);
    expect(publicadas[0]?.evento.dispositivoId).toBe('cam-1');
    // El secreto de OTRA cámara, desde un origen que no es el suyo: 401.
    expect((await publicar(OTRA.secreto)).status).toBe(401);
    expect((await publicar(CAMARA.secreto, Buffer.from('basura'))).status).toBe(400);
  });

  it('pasado el límite por minuto e IP, 429 con Retry-After', async () => {
    let ultima: Response | null = null;
    for (let i = 0; i < 45; i += 1) ultima = await fetch(`${base}/nada`);
    expect(ultima?.status).toBe(429);
    expect(Number(ultima?.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('protección local en frío (15-Q, Q5)', () => {
  it('fuera de ventana, nonce inválido o repetido, y firma ajena se rechazan', () => {
    const nonces = new CacheDeNonces(1000);
    const ahora = Date.now();
    const marca = String(Math.floor(ahora / 1000));
    const s = { marca, nonce: 'a'.repeat(16), metodo: 'GET', ruta: '/estado', cuerpo: '' };
    const firma = firmaLocal(SECRETO, marca, s.nonce, 'GET', '/estado', '');
    expect(
      verificarLocal(SECRETO, { ...s, firma, marca: String(Number(marca) - 120) }, ahora, nonces),
    ).toBe('fuera_de_ventana');
    expect(verificarLocal(SECRETO, { ...s, firma, nonce: 'corto' }, ahora, nonces)).toBe(
      'sin_firma',
    );
    expect(verificarLocal('otro'.repeat(10), { ...s, firma }, ahora, nonces)).toBe('firma');
    expect(verificarLocal(SECRETO, { ...s, firma }, ahora, nonces)).toBeNull();
    expect(verificarLocal(SECRETO, { ...s, firma }, ahora, nonces)).toBe('repetida');
    // Pasada la ventana del caché, el nonce se olvida (la marca ya lo rechazaría).
    expect(new CacheDeNonces(10).usar('n', 0) && new CacheDeNonces(10).usar('n', 100)).toBe(true);
  });

  it('el limitador cuenta por minuto e IP y se reinicia al minuto siguiente', () => {
    const l = new LimitadorPorIp(2);
    expect(l.admitir('a', 0).admitido && l.admitir('a', 1).admitido).toBe(true);
    expect(l.admitir('a', 2)).toMatchObject({ admitido: false });
    expect(l.admitir('b', 3).admitido).toBe(true);
    expect(l.admitir('a', 60_000).admitido).toBe(true);
  });
});

describe('un fallo dentro de una entrada (15-Q)', () => {
  it('es 500 y se registra; el proceso sigue', async () => {
    const errores: string[] = [];
    const manejador = crearManejador(
      {
        hecho: () => {
          throw new Error('caché rota');
        },
        estado: () => ({}),
        publicar: async () => undefined,
      },
      {
        secretoLocal: SECRETO,
        limitePorMinuto: 10,
        camaras: [],
        registrar: (_n, m) => void errores.push(m),
      },
    );
    const otro = createServer((req, res) => void manejador(req, res));
    await new Promise<void>((listo) => otro.listen(0, '127.0.0.1', listo));
    const ruta = '/hechos';
    const cuerpo = JSON.stringify({
      dispositivoId: 'c',
      metodo: 'placa',
      referenciaExterna: 'r',
      confianza: 1,
    });
    const marca = String(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(12).toString('hex');
    const r = await fetch(
      `http://127.0.0.1:${String((otro.address() as AddressInfo).port)}${ruta}`,
      {
        method: 'POST',
        headers: {
          'x-ncr-marca-temporal': marca,
          'x-ncr-nonce': nonce,
          'x-ncr-firma': firmaLocal(SECRETO, marca, nonce, 'POST', ruta, cuerpo),
        },
        body: cuerpo,
      },
    );
    expect(r.status).toBe(500);
    expect(errores).toContain('entrada local fallida');
    await new Promise((listo) => otro.close(listo));
  });
});
