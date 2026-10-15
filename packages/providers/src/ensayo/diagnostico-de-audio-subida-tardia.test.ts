import { afterEach, describe, expect, it } from 'vitest';
import { videoporteroDeAudioEnRed } from '../simulacion/videoportero-de-audio';
import type { VideoporteroDeAudioEnRed } from '../simulacion/videoportero-de-audio';
import { IntercomIsapiPersistente } from '../videoportero/intercom-isapi-persistente';
import { diagnosticarAudio } from './diagnostico-de-audio';
import type { CanalDescrito } from './diagnostico-de-audio';

/**
 * DT-15S5-08 (15-S6) · «mientras sonaba» se mide desde que se ENTREGA la
 * primera trama del tono. Un equipo semidúplex habla hasta que le LLEGA la
 * primera trama; si la subida tarda en arrancar (la conexión y el Digest con
 * carga, una red lenta en sitio), lo que el equipo dijo en ese hueco contaba
 * como «habló mientras sonaba» y el veredicto era «indeterminado». Medido en
 * la 15-S5: 0 y 200 ms → semidúplex; 600 y 900 ms → indeterminado.
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
const G711U: CanalDescrito = {
  canal: 1,
  formato: 'G.711ulaw',
  muestreo: '8',
  tasa: '64',
  volumenAltavoz: '7',
  volumenMicrofono: null,
};
let equipo: VideoporteroDeAudioEnRed | null = null;
afterEach(async () => {
  await equipo?.cerrar();
  equipo = null;
});

const conPrimeraTramaRetrasada = async (retrasoMs: number) => {
  equipo = await videoporteroDeAudioEnRed({ ...CREDENCIAL, semiduplex: true });
  const audio = new IntercomIsapiPersistente({
    host: '127.0.0.1',
    puerto: equipo.puerto,
    ...CREDENCIAL,
    reloj: { ahora: () => new Date() },
    canalHabilitado: true,
    canal: 1,
    formato: 'G.711ulaw',
  });
  // Sólo la PRIMERA trama de cada sesión tarda: lo que tarda en arrancar la subida.
  const original = audio.enviarAudio.bind(audio);
  let enviadas = 0;
  audio.enviarAudio = async (trama: Uint8Array): Promise<void> => {
    enviadas += 1;
    if (enviadas === 1 && retrasoMs > 0) await new Promise((r) => setTimeout(r, retrasoMs));
    return original(trama);
  };
  return diagnosticarAudio({
    audio,
    canal: G711U,
    nombre: 'el equipo',
    escucharMs: 600,
    interlocutor: { indicar: async () => undefined, confirmar: async () => true },
  });
};

describe('diagnosticarAudio · la subida que tarda en arrancar (DT-15S5-08)', () => {
  for (const ms of [0, 400, 600, 900]) {
    it(`con la primera trama ${String(ms)} ms tarde, un semidúplex sigue siendo «semiduplex»`, async () => {
      const d = await conPrimeraTramaRetrasada(ms);
      expect(d.duplex, d.lineas.join('\n')).toBe('semiduplex');
    }, 20_000);
  }
});
