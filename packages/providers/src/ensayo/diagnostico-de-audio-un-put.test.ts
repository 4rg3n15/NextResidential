import { afterEach, describe, expect, it } from 'vitest';
import { videoporteroDeAudioEnRed } from '../simulacion/videoportero-de-audio';
import type { VideoporteroDeAudioEnRed } from '../simulacion/videoportero-de-audio';
import { IntercomIsapiPersistente } from '../videoportero/intercom-isapi-persistente';
import { diagnosticarAudio } from './diagnostico-de-audio';
import type { CanalDescrito } from './diagnostico-de-audio';
import { REAPERTURAS_MAXIMAS } from './veredicto-de-sesion';

/**
 * DT-15S4-01 (15-S6) · el equipo que acepta UN SOLO `PUT audioData` por sesión
 * y cierra la subida que se queda ociosa. Es lo que el 09/10 hizo que
 * `sitio:audio` culpara al `sessionId` (C-65): el `PUT` abierto al abrir se
 * quedaba ocioso mientras se escuchaba, la primera trama del tono lo
 * encontraba muerto, la reapertura recibía 400, y ese 400 se atribuía al
 * `sessionId`; y la siguiente trama reabría sin pausa, cien veces.
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

/**
 * D-151 · LOS MÁRGENES, CONTRA EL RELOJ REAL. El equipo simulado cierra la
 * subida que pasa `subidaOciosaMs` sin datos, y el tono manda una trama cada
 * 20 ms. Con 300 ms bastaba que el proceso se parase ~280 ms —un runner de
 * macOS cargado lo hizo en la CI de #73— para que la subida se cerrase a mitad
 * del tono, la reapertura recibiese 400 y el veredicto dejase de ser
 * «sessionId: usado». Reproducido: una pausa de 400 ms entre dos tramas da ese
 * mismo mensaje; una de 250 ms, no.
 *
 * Lo que la prueba distingue es que el `PUT` del tono NO espere ocioso durante
 * la escucha: eso exige escuchar MÁS tiempo que el umbral de ocio. Se mantiene
 * la proporción (escucha = 2 × ocio) con más holgura: ahora tolera una pausa
 * de 900 ms y sigue fallando si el `PUT` espera ocioso lo que dura la escucha.
 */
const ESCUCHA_MS = 2000;
const OCIO_MS = 1000;

const diagnosticar = async (guion: { putsPorSesion: number; subidaOciosaMs?: number }) => {
  equipo = await videoporteroDeAudioEnRed({ ...CREDENCIAL, ...guion });
  const audio = new IntercomIsapiPersistente({
    host: '127.0.0.1',
    puerto: equipo.puerto,
    ...CREDENCIAL,
    reloj: { ahora: () => new Date() },
    canalHabilitado: true,
    canal: 1,
    formato: 'G.711ulaw',
  });
  const indicadoEn: number[] = [];
  const d = await diagnosticarAudio({
    audio,
    canal: G711U,
    nombre: 'el equipo',
    escucharMs: ESCUCHA_MS,
    interlocutor: {
      indicar: async () => {
        indicadoEn.push(Date.now());
      },
      confirmar: async () => true,
    },
  });
  return { d, texto: d.lineas.join('\n'), indicadoEn };
};

describe('diagnosticarAudio · un solo PUT por sesión y la subida ociosa (DT-15S4-01)', () => {
  it('el PUT del tono no queda ocioso: el tono va en una sesión abierta tras el Enter, con su PUT recién abierto', async () => {
    const { d, texto, indicadoEn } = await diagnosticar({
      putsPorSesion: 1,
      subidaOciosaMs: OCIO_MS,
    });
    expect(texto).toMatch(/sessionId: usado/);
    expect(texto).not.toMatch(/rechazad/);
    expect(d.fallo).toBe(false);
    // La ventana del tono empieza DESPUÉS del Enter: el equipo acepta el PUT del tono tras `indicar`.
    const aceptadas = equipo?.subidasAceptadas ?? [];
    expect(aceptadas.length).toBe(2);
    expect(aceptadas[1]).toBeGreaterThanOrEqual(indicadoEn[0] ?? Infinity);
  }, 20_000);

  it('si el equipo rechaza toda subida: pausa y tope de reaperturas, y «400 de causa no determinada», no «rechazado»', async () => {
    const { d, texto } = await diagnosticar({ putsPorSesion: 0 });
    expect(texto).toMatch(/400 de causa no determinada \(igual sin sessionId\)/);
    expect(texto).toMatch(/el tono se detuvo/);
    expect(d.fallo).toBe(false);
    // Como mucho el tope más una: ni una reapertura por trama.
    expect(equipo?.estado().subidasAbiertas ?? 0).toBeLessThanOrEqual(REAPERTURAS_MAXIMAS + 2);
  }, 20_000);
});
