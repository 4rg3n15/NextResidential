import { afterEach, describe, expect, it } from 'vitest';
import { videoporteroDeAudioEnRed } from '../simulacion/videoportero-de-audio';
import type {
  GuionDeAudioEnRed,
  VideoporteroDeAudioEnRed,
} from '../simulacion/videoportero-de-audio';
import { canalesDeAudio } from '../simulacion/documentos-del-simulado';
import { codificarUlaw } from '../simulacion/marcas-de-audio';
import { IntercomIsapiPersistente } from '../videoportero/intercom-isapi-persistente';
import {
  describirCanalDeAudio,
  diagnosticarAudio,
  esG711,
  juzgarDuplex,
  nivelDbfs,
} from './diagnostico-de-audio';
import type { CanalDescrito } from './diagnostico-de-audio';

/**
 * B6/B7 (15-S2) · `pnpm sitio:audio` contra el equipo simulado EN RED: dúplex
 * completo y semidúplex, con y sin `sessionId` exigido, y un canal que no es
 * G.711. Nada del audio se guarda: el diagnóstico sólo cuenta y mide nivel.
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
let equipo: VideoporteroDeAudioEnRed | null = null;
afterEach(async () => {
  await equipo?.cerrar();
  equipo = null;
});

const preguntas: string[] = [];
const persona = (respuesta: boolean | null) => ({
  indicar: async (t: string) => {
    preguntas.push(t);
  },
  confirmar: async (t: string) => {
    preguntas.push(t);
    return respuesta;
  },
});

const G711U: CanalDescrito = {
  canal: 1,
  formato: 'G.711ulaw',
  muestreo: '8',
  tasa: '64',
  volumenAltavoz: '7',
  volumenMicrofono: null,
};

const diagnosticar = async (
  guion: Partial<GuionDeAudioEnRed> = {},
  canal: CanalDescrito = G711U,
  respuesta: boolean | null = true,
) => {
  equipo = await videoporteroDeAudioEnRed({ ...CREDENCIAL, ...guion });
  const audio = new IntercomIsapiPersistente({
    host: '127.0.0.1',
    puerto: equipo.puerto,
    ...CREDENCIAL,
    reloj: { ahora: () => new Date() },
    canalHabilitado: true,
    canal: 1,
    formato: canal.formato,
  });
  return diagnosticarAudio({
    audio,
    canal,
    nombre: 'el videoportero',
    escucharMs: 600,
    interlocutor: persona(respuesta),
  });
};

describe('diagnosticarAudio (B6)', () => {
  it('dúplex completo, sessionId usado, tono oído: sin fallo y con las cifras', async () => {
    const d = await diagnosticar({ sessionId: 'exigido' });
    expect(d.duplex).toBe('completo');
    expect(d.oyoElTono).toBe(true);
    expect(d.fallo).toBe(false);
    const texto = d.lineas.join('\n');
    expect(texto).toMatch(/bajada \(del equipo\): \d+ B\/s escuchando · \d+ B\/s mientras sonaba/);
    expect(texto).toMatch(/subida \(al equipo\): 16000 B/);
    expect(texto).toMatch(/sessionId: usado · estados HTTP: open 200/);
    expect(texto).toMatch(/volumen del altavoz 7/);
    expect(texto).not.toContain(CREDENCIAL.clave);
  }, 15_000);

  it('semidúplex: la bajada calla mientras suena el tono, y se dice', async () => {
    const d = await diagnosticar({ semiduplex: true });
    expect(d.duplex).toBe('semiduplex');
    expect(d.lineas.join('\n')).toMatch(/dúplex: semiduplex \(el equipo calla/);
  }, 15_000);

  it('el tono no se oyó: FALLO, que es lo que la terminal hizo el 07/10', async () => {
    const d = await diagnosticar({}, G711U, false);
    expect(d.fallo).toBe(true);
    expect(d.lineas.join('\n')).toMatch(/¿se oyó\? NO/);
  }, 15_000);

  it('un canal que no es G.711: lo dice y no envía el tono', async () => {
    const d = await diagnosticar({}, { ...G711U, formato: 'G.722.1' });
    expect(d.lineas.join('\n')).toMatch(/G\.722\.1 NO es G\.711/);
    expect(d.lineas.join('\n')).toMatch(/subida \(al equipo\): 0 B/);
    expect(d.oyoElTono).toBeNull();
  }, 15_000);
});

describe('piezas puras (B1/B3)', () => {
  it('lee el canal del equipo: formato y lo que declare', () => {
    const xml = canalesDeAudio([{ id: 2, habilitado: false, codec: 'G.711alaw' }]);
    expect(describirCanalDeAudio(xml)).toMatchObject({ canal: 2, formato: 'G.711alaw' });
    expect(describirCanalDeAudio(xml, 3)).toBeNull();
    expect(
      describirCanalDeAudio(
        '<TwoWayAudioChannel><id>1</id><speakerVolume>9</speakerVolume></TwoWayAudioChannel>',
      ),
    ).toMatchObject({ volumenAltavoz: '9', formato: null });
  });

  it('G.711: ley, nivel en dBFS; dúplex por proporción', () => {
    expect([esG711('G.711ulaw'), esG711('G711A'), esG711('AAC')]).toEqual(['ulaw', 'alaw', null]);
    expect(nivelDbfs(new Uint8Array(160).fill(codificarUlaw(0)), 'G.711ulaw')).toBe(-Infinity);
    expect(nivelDbfs(new Uint8Array(160).fill(codificarUlaw(16_000)), 'G.711ulaw')).toBeCloseTo(
      -6.2,
      0,
    );
    expect(nivelDbfs(new Uint8Array(160).fill(0xd5), 'G.711alaw')).toBeLessThan(-50);
    expect(nivelDbfs(new Uint8Array(1), 'AAC')).toBeNull();
    expect(juzgarDuplex(8000, 8000)).toBe('completo');
    expect(juzgarDuplex(8000, 0)).toBe('semiduplex');
    expect(juzgarDuplex(8000, 2000)).toBe('indeterminado');
    expect(juzgarDuplex(0, 0)).toBe('indeterminado');
  });
});
