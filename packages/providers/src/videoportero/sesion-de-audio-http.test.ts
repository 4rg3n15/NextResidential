import { afterEach, describe, expect, it } from 'vitest';
import { tramaDeSilencio } from '../simulacion/marcas-de-audio';
import { videoporteroDeAudioEnRed } from '../simulacion/videoportero-de-audio';
import type { VideoporteroDeAudioEnRed } from '../simulacion/videoportero-de-audio';
import { IntercomDeEquipo } from './intercom-equipo';

/**
 * B2 (15-S2) · el `sessionId` también por el transporte HTTP (`IntercomDeEquipo`,
 * GUARDIA_AUDIO_TRANSPORTE=http y el paso 8 del ensayo), contra el mismo
 * equipo simulado en red.
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
let equipo: VideoporteroDeAudioEnRed | null = null;
afterEach(async () => {
  await equipo?.cerrar();
  equipo = null;
});

const conversar = async (sessionId: 'exigido' | 'rechazado') => {
  equipo = await videoporteroDeAudioEnRed({ ...CREDENCIAL, sessionId });
  const intercom = new IntercomDeEquipo({
    host: '127.0.0.1',
    puerto: equipo.puerto,
    ...CREDENCIAL,
    reloj: { ahora: () => new Date() },
    canalHabilitado: true,
    canal: 1,
  });
  await intercom.abrirSesion('vp-1', 'op-1');
  const bajada = intercom.recibirAudio()[Symbol.asyncIterator]();
  const primera = await bajada.next();
  for (let i = 0; i < 5; i += 1) await intercom.enviarAudio(tramaDeSilencio());
  await intercom.cerrarSesion('fin');
  await bajada.return?.(undefined);
  return { equipo, intercom, primera };
};

describe('IntercomDeEquipo · sessionId (B2)', () => {
  it('un equipo que lo EXIGE: la bajada y el close lo llevan, y la bajada llega', async () => {
    const { equipo, primera } = await conversar('exigido');
    expect(primera.done).toBe(false);
    expect(equipo.peticiones()).toContainEqual(
      expect.stringMatching(/^GET .*audioData\?sessionId=1$/),
    );
    expect(equipo.peticiones()).toContainEqual(expect.stringMatching(/^PUT .*close\?sessionId=1$/));
    expect(equipo.estado()).toMatchObject({ cierres: 1, sesionAbierta: false });
  }, 15_000);

  it('un equipo que lo RECHAZA: la bajada y el close se repiten sin él', async () => {
    const { equipo, intercom, primera } = await conversar('rechazado');
    expect(primera.done).toBe(false);
    expect(equipo.peticiones()).toContainEqual(expect.stringMatching(/^GET .*audioData$/));
    expect(equipo.estado()).toMatchObject({ cierres: 1 });
    expect(intercom.sesionDeAudio.resumen(null)['sessionId']).toBe('rechazado');
  }, 15_000);
});
