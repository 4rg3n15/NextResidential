import { describe, expect, it } from 'vitest';
import { SesionDeAudio } from '../videoportero/sesion-de-audio';
import { diagnosticarAudio } from './diagnostico-de-audio';
import type { AudioDiagnosticable } from './diagnostico-de-audio';

/**
 * B6 (15-S2) · lo que ya venía en camino cuando empezó el tono NO cuenta para
 * el dúplex. Un equipo semidúplex de mentira sigue mandando 400 ms después de
 * la primera trama del operador (lo que estaba en vuelo) y luego calla: el
 * diagnóstico tiene que decir «semiduplex», no «indeterminado». Es la causa de
 * la corrida roja del verificador en la 15-S2, ahora reproducida sin carga.
 */
const equipoQueCallaTarde = (): AudioDiagnosticable => {
  let primeraSubida: number | null = null;
  let abierto = true;
  const sesionDeAudio = new SesionDeAudio();
  return {
    sesionDeAudio,
    abrirSesion: async () => sesionDeAudio.abrir('<sessionId>1</sessionId>', 200),
    enviarAudio: async (t) => {
      primeraSubida ??= Date.now();
      sesionDeAudio.contar('subida', t.length);
    },
    async *recibirAudio() {
      while (abierto) {
        await new Promise((listo) => setTimeout(listo, 20));
        const callado = primeraSubida !== null && Date.now() - primeraSubida > 400;
        if (!callado) yield new Uint8Array(160).fill(0xff);
      }
    },
    cerrarSesion: async () => {
      abierto = false;
    },
  };
};

describe('diagnosticarAudio · el arranque del tono', () => {
  it('lo que estaba en vuelo al empezar el tono no convierte un semidúplex en «indeterminado»', async () => {
    const d = await diagnosticarAudio({
      audio: equipoQueCallaTarde(),
      canal: {
        canal: 1,
        formato: 'G.711ulaw',
        muestreo: null,
        tasa: null,
        volumenAltavoz: null,
        volumenMicrofono: null,
      },
      nombre: 'el equipo',
      escucharMs: 600,
      interlocutor: { indicar: async () => undefined, confirmar: async () => true },
    });
    expect(d.duplex).toBe('semiduplex');
  }, 15_000);
});
