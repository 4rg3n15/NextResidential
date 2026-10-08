import { afterEach, describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { tramaDeSilencio } from '../simulacion/marcas-de-audio';
import { videoporteroDeAudioEnRed } from '../simulacion/videoportero-de-audio';
import type {
  GuionDeAudioEnRed,
  VideoporteroDeAudioEnRed,
} from '../simulacion/videoportero-de-audio';
import { IntercomIsapiPersistente } from './intercom-isapi-persistente';
import { rechazoPorSesion, rutaConSesion, sessionIdDe } from './sesion-de-audio';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B2/B5/B7 (15-S2) · EL `sessionId` Y EL DÚPLEX, CONTRA EL SIMULADO EN RED
 *
 * Tres equipos: uno que IGNORA el `sessionId` (el de la 15-S1), uno que lo
 * EXIGE (400 sin él) y uno que lo RECHAZA (400 con él). Con los tres, la
 * conversación funciona: se manda cuando el equipo lo dio y, si lo rechaza, se
 * repite sin él. Y con un equipo de dúplex completo, la bajada NO se detiene
 * mientras se sube audio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
let equipo: VideoporteroDeAudioEnRed | null = null;
afterEach(async () => {
  await equipo?.cerrar();
  equipo = null;
});

const arrancar = async (extra: Partial<GuionDeAudioEnRed> = {}) => {
  equipo = await videoporteroDeAudioEnRed({ ...CREDENCIAL, ...extra });
  const anotaciones: { mensaje: string; datos: unknown }[] = [];
  const traza = {
    registrar: (_n: string, mensaje: string, datos?: unknown) =>
      anotaciones.push({ mensaje, datos }),
  } as unknown as Bitacora;
  const intercom = new IntercomIsapiPersistente({
    host: '127.0.0.1',
    puerto: equipo.puerto,
    ...CREDENCIAL,
    reloj: { ahora: () => new Date() },
    canalHabilitado: true,
    canal: 1,
    formato: 'G.711ulaw',
    traza,
  });
  return { equipo, intercom, anotaciones };
};

const hasta = async (condicion: () => boolean, plazoMs = 3000): Promise<void> => {
  const limite = Date.now() + plazoMs;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error('la condición no se cumplió a tiempo');
    await new Promise((listo) => setTimeout(listo, 5));
  }
};

/** Una conversación corta: escucha, habla, escucha, cuelga. Devuelve los bytes bajados. */
const conversar = async (intercom: IntercomIsapiPersistente): Promise<number> => {
  await intercom.abrirSesion('vp-1', 'op-1');
  const flujo = intercom.recibirAudio()[Symbol.asyncIterator]();
  let bajados = 0;
  for (let i = 0; i < 3; i += 1) bajados += (await flujo.next()).value?.length ?? 0;
  // Al ritmo de un micrófono: una trama cada 20 ms.
  for (let i = 0; i < 10; i += 1) {
    await intercom.enviarAudio(tramaDeSilencio());
    await new Promise((listo) => setTimeout(listo, 20));
  }
  await intercom.cerrarSesion('fin');
  return bajados;
};

describe('sessionId · funciones puras', () => {
  it('lo lee del XML o del JSON de open, y no admite basura', () => {
    expect(sessionIdDe('<TwoWayAudioSession><sessionId>17</sessionId></TwoWayAudioSession>')).toBe(
      '17',
    );
    expect(sessionIdDe('{"TwoWayAudioSession":{"sessionId":"a1-b2"}}')).toBe('a1-b2');
    expect(sessionIdDe('<ResponseStatus><statusCode>1</statusCode></ResponseStatus>')).toBeNull();
    expect(sessionIdDe('<sessionId>a b&c</sessionId>')).toBeNull();
    expect(rutaConSesion('/x/audioData', '7')).toBe('/x/audioData?sessionId=7');
    expect(rutaConSesion('/x?y=1', '7')).toBe('/x?y=1&sessionId=7');
    expect(rutaConSesion('/x', null)).toBe('/x');
    expect([rechazoPorSesion(400, true), rechazoPorSesion(400, false)]).toEqual([true, false]);
    expect([rechazoPorSesion(403, true), rechazoPorSesion(500, true)]).toEqual([true, false]);
  });
});

describe('sessionId · contra el equipo en red (B2)', () => {
  it('un equipo que lo EXIGE: audioData de subida y bajada y close lo llevan', async () => {
    const { equipo, intercom } = await arrancar({ sessionId: 'exigido' });
    expect(await conversar(intercom)).toBeGreaterThan(0);
    await hasta(() => equipo.estado().bytesRecibidos >= 1600);
    const audio = equipo.peticiones().filter((p) => /audioData|close/.test(p));
    expect(audio.filter((p) => p.startsWith('GET'))).toContainEqual(
      expect.stringMatching(/audioData\?sessionId=1$/),
    );
    expect(audio).toContainEqual(expect.stringMatching(/^PUT .*audioData\?sessionId=1$/));
    expect(audio).toContainEqual(expect.stringMatching(/^PUT .*close\?sessionId=1$/));
    expect(equipo.estado()).toMatchObject({ cierres: 1, sesionAbierta: false });
  });

  it('un equipo que lo RECHAZA: se repite sin él y la conversación funciona', async () => {
    const { equipo, intercom, anotaciones } = await arrancar({ sessionId: 'rechazado' });
    expect(await conversar(intercom)).toBeGreaterThan(0);
    await hasta(() => equipo.estado().bytesRecibidos > 0);
    expect(equipo.peticiones()).toContainEqual(expect.stringMatching(/^GET .*audioData$/));
    expect(equipo.estado()).toMatchObject({ cierres: 1 });
    const registro = anotaciones.find((a) => a.mensaje === 'sesión de audio terminada');
    expect(registro?.datos).toMatchObject({ sessionId: 'rechazado' });
  });

  it('B5 · una línea por sesión: bytes, primeros bytes, estados y sessionId; ni clave ni audio', async () => {
    const { intercom, anotaciones } = await arrancar();
    await conversar(intercom);
    const registro = anotaciones.find((a) => a.mensaje === 'sesión de audio terminada');
    expect(registro?.datos).toMatchObject({
      dispositivoId: 'vp-1',
      bytesSubidos: 1600,
      sessionId: 'usado',
      formato: 'G.711ulaw',
    });
    const datos = registro?.datos as Record<string, unknown>;
    expect(datos['bytesBajados']).toBeGreaterThan(0);
    expect(typeof datos['primerByteBajadaMs']).toBe('number');
    expect(typeof datos['primerByteSubidaMs']).toBe('number');
    expect(datos['estadosHttp']).toEqual(
      expect.arrayContaining(['open 200', 'GET audioData 200', 'close 200']),
    );
    expect(JSON.stringify(datos)).not.toContain(CREDENCIAL.clave);
  });
});

describe('dúplex (B3/B7)', () => {
  /** Bytes que bajan MIENTRAS se sube audio durante ~400 ms. */
  const bajadaMientrasSeHabla = async (intercom: IntercomIsapiPersistente): Promise<number> => {
    await intercom.abrirSesion('vp-1', 'op-1');
    const flujo = intercom.recibirAudio()[Symbol.asyncIterator]();
    await flujo.next();
    let bajados = 0;
    let hablando = true;
    const leer = (async () => {
      while (hablando) bajados += (await flujo.next()).value?.length ?? 0;
    })();
    for (let i = 0; i < 20; i += 1) {
      await intercom.enviarAudio(tramaDeSilencio());
      await new Promise((listo) => setTimeout(listo, 20));
    }
    hablando = false;
    await intercom.cerrarSesion('fin');
    await leer.catch(() => undefined);
    return bajados;
  };

  it('dúplex completo: la bajada sigue llegando mientras el operador habla', async () => {
    const { intercom } = await arrancar();
    expect(await bajadaMientrasSeHabla(intercom)).toBeGreaterThan(160 * 5);
  });

  it('semidúplex (el simulado calla al recibir): la bajada se detiene, y se puede medir', async () => {
    const { intercom } = await arrancar({ semiduplex: true });
    expect(await bajadaMientrasSeHabla(intercom)).toBeLessThan(160 * 5);
  });
});
