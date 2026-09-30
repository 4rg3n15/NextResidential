import { afterEach, describe, expect, it } from 'vitest';
import { describirRtsp } from './rtsp-describe';
import {
  causaDeRechazoRtsp,
  describirOfrecidos,
  elegirDesafio,
  separarDesafios,
} from './rtsp-desafios';
import { servidorRtspSimulado } from '../simulacion/servidor-rtsp';
import type { GuionRtsp, ServidorRtspSimulado } from '../simulacion/servidor-rtsp';

/**
 * V3 (15-N) · «credencial rechazada por RTSP» con la clave buena. El 29/09 el
 * videoportero lo dijo con la credencial que su HTTP acepta. La sonda ya hacía
 * un intercambio limpio; lo que fallaba era el DESAFÍO: dos Digest se mezclaban
 * y el resumen era MD5 aunque se pidiera SHA-256. Cada escenario, contra el
 * equipo simulado en el bucle local.
 */
const MD5 = 'Digest realm="IP Camera(x)", nonce="n1", stale="FALSE"';
const SHA = 'Digest realm="IP Camera(x)", nonce="n2", algorithm=SHA-256, stale="FALSE"';
const BASIC = 'Basic realm="IP Camera(x)"';

describe('V3 · qué desafío se responde', () => {
  it('cada cabecera es un desafío; dos unidos por coma también se separan', () => {
    expect(separarDesafios([`${SHA}, ${MD5}`, BASIC])).toEqual([SHA, MD5, BASIC]);
  });

  it('Digest MD5 antes que SHA-256, aunque venga segundo; Basic sólo si no hay Digest', () => {
    expect(elegirDesafio([SHA, MD5])?.digest?.nonce).toBe('n1');
    expect(elegirDesafio([SHA])?.digest?.algorithm).toBe('SHA-256');
    expect(elegirDesafio([BASIC])).toEqual({ esquema: 'Basic', digest: null });
    expect(elegirDesafio([])).toBeNull();
  });

  it('lo ofrecido se describe sin nonce', () => {
    const texto = describirOfrecidos([SHA, BASIC]);
    expect(texto).toContain('algorithm=SHA-256');
    expect(texto).toContain('Basic');
    expect(texto).not.toContain('n2');
  });

  it('cada código de rechazo tiene su causa', () => {
    expect(causaDeRechazoRtsp(403)).toBe('sin_permiso');
    expect(causaDeRechazoRtsp(404)).toBe('sin_canal');
    expect(causaDeRechazoRtsp(412)).toBe('sin_canal');
    expect(causaDeRechazoRtsp(454)).toBe('sesion');
    expect(causaDeRechazoRtsp(500)).toBe('otro');
  });
});

describe('V3 · la sonda RTSP contra un equipo que ofrece otros desafíos', () => {
  let equipo: ServidorRtspSimulado | null = null;
  afterEach(async () => {
    await equipo?.cerrar();
    equipo = null;
  });
  const CLAVE = 'clave-buena-de-la-prueba';
  const sonda = async (guion: Partial<GuionRtsp>, camino = '/Streaming/Channels/101') => {
    equipo = await servidorRtspSimulado({
      usuario: 'admin',
      clave: CLAVE,
      canales: { '101': 'H264' },
      ...guion,
    });
    return describirRtsp({
      host: '127.0.0.1',
      puerto: equipo.puerto,
      camino,
      usuario: 'admin',
      clave: CLAVE,
      tiempoLimiteMs: 2000,
    });
  };

  it('sólo Digest SHA-256: con la clave buena, describe (antes: «credencial rechazada»)', async () => {
    const r = await sonda({ desafios: ['sha256'] });
    expect(r.clase).toBe('respondio');
    expect(r.enviado).toMatch(/Digest SHA-256/);
  });

  it('Digest SHA-256 y Digest MD5 en dos cabeceras: se responde UNO, el MD5 (antes se mezclaban)', async () => {
    const r = await sonda({ desafios: ['sha256', 'md5', 'basic'] });
    expect(r.clase).toBe('respondio');
    expect(r.enviado).toMatch(/Digest MD5/);
    expect(r.ofrecido).toMatch(/SHA-256.*MD5.*Basic/);
  });

  it('la clave mala sigue siendo UNA tentativa, con lo ofrecido y lo enviado y sin la clave', async () => {
    equipo = await servidorRtspSimulado({
      usuario: 'admin',
      clave: CLAVE,
      canales: { '101': 'H264' },
    });
    const r = await describirRtsp({
      host: '127.0.0.1',
      puerto: equipo.puerto,
      camino: '/Streaming/Channels/101',
      usuario: 'admin',
      clave: 'otra-clave',
      tiempoLimiteMs: 2000,
    });
    expect(r.clase).toBe('credencial');
    expect(equipo.peticiones()).toBe(2);
    expect(r.detalle).toMatch(/ofreció Digest realm=.*algorithm=MD5/);
    expect(r.detalle).toMatch(/se envió Digest MD5 con el usuario «admin»/);
    expect(r.detalle).not.toContain('otra-clave');
  });

  it.each([
    ['403 Forbidden', 'sin_permiso', /permiso de vista en vivo/],
    ['412 Precondition Failed', 'sin_canal', /no tiene el canal/],
    ['454 Session Not Found', 'sesion', /sesión RTSP/],
  ])('%s → %s, en palabras', async (estado, causa, frase) => {
    const r = await sonda({ estadosPorCanal: { '101': estado } });
    expect(r).toMatchObject({ clase: 'rechazo', causa });
    expect(r.detalle).toMatch(frase);
  });

  it('un canal que el equipo no tiene y contesta 412 (la cámara del 29/09): sin canal', async () => {
    const r = await sonda({ estadoSinCanal: '412 Precondition Failed' }, '/Streaming/Channels/102');
    expect(r).toMatchObject({ clase: 'rechazo', estado: 412, causa: 'sin_canal' });
  });
});
