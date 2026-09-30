import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diagnosticarEquipo } from './diagnostico-de-equipo';
import { fichaDe } from './ficha';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import { servidorRtspSimulado } from '../simulacion/servidor-rtsp';
import type { ServidorRtspSimulado } from '../simulacion/servidor-rtsp';
import { HikvisionProvider } from '../hikvision/hikvision-provider';
import { RegistroEnMemoria } from '../hikvision/registro-de-equipos';

/**
 * V2 (15-N) · «Probar conexión» y el alta preguntan el video en el canal que el
 * equipo DECLARA. La cámara del 29/09: ficha con 102, el equipo sólo tiene el
 * 101 y a un canal que no tiene contesta 412. Antes: aviso «no tiene el canal
 * 102» y sin video. Ahora: se prueba el 101, se dice por qué y se propone
 * para guardarlo.
 */
const CREDENCIAL = { usuario: 'admin', clave: 'clave-de-la-camara' } as const;
let rtsp: ServidorRtspSimulado;

beforeAll(async () => {
  rtsp = await servidorRtspSimulado({
    ...CREDENCIAL,
    canales: { '101': 'H264' },
    estadoSinCanal: '412 Precondition Failed',
  });
});
afterAll(async () => {
  await rtsp.cerrar();
});

const camara = (canal: string | null, lista = true) =>
  diagnosticarEquipo({
    host: '127.0.0.1',
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    familia: 'camara',
    peticion: equipoSimulado({
      familia: 'camara',
      ...CREDENCIAL,
      ...(lista ? { canalesDeVideo: [{ id: '101', codec: 'H.264' }] } : {}),
    }),
    video: { puerto: rtsp.puerto, canal },
  });

describe('V2 · el canal de video del diagnóstico sale de lo que el equipo declara', () => {
  it('ficha con 102 y el equipo sólo declara 101: se prueba el 101 y se propone', async () => {
    const d = await camara('102');
    expect(d.video).toMatchObject({
      clase: 'respondio',
      codec: 'H.264',
      canal: '101',
      origenDelCanal: 'propuesto',
      sustituido: '102',
    });
    const h = fichaDe(d).hallazgos.find((x) => x.campo === 'video en vivo (canal 101)');
    expect(h?.estado).toBe('conforme');
    expect(h?.detalle).toMatch(/la ficha tenía el 102, que el equipo NO declara/);
  });

  it('sin canal en la ficha: el declarado, nunca el 102', async () => {
    const d = await camara(null);
    expect(d.video).toMatchObject({ canal: '101', origenDelCanal: 'propuesto', sustituido: null });
  });

  it('sin lista del equipo, la ficha manda y el 412 se dice en palabras', async () => {
    const d = await camara('102', false);
    expect(d.video).toMatchObject({ clase: 'rechazo', estado: 412, causa: 'sin_canal' });
    const h = fichaDe(d).hallazgos.find((x) => x.campo === 'video en vivo (canal 102)');
    expect(h?.detalle).toMatch(/no tiene el canal 102 \(RTSP 412\)/);
  });
});

describe('V5 · el proveedor pregunta al equipo por qué no hay video', () => {
  const proveedor = (canalDeVideo: string | null, clave: string = CREDENCIAL.clave) =>
    new HikvisionProvider({
      registro: new RegistroEnMemoria([
        {
          dispositivoId: 'c-1',
          tipo: 'camara_lpr',
          host: '127.0.0.1',
          puerto: 80,
          protocolo: 'http',
          usuario: CREDENCIAL.usuario,
          clave,
          canalDeVideo,
        },
      ]),
      reloj: { ahora: () => new Date(0) },
      puertoRtsp: rtsp.puerto,
      peticion: equipoSimulado({ familia: 'camara', ...CREDENCIAL }),
    });

  it('un canal que no tiene: «sin_canal», con el canal y el código', async () => {
    const d = await proveedor('102').sondearVideo('c-1');
    expect(d).toMatchObject({ canal: '102', causa: 'sin_canal' });
    expect(d.frase).toMatch(/no tiene el canal 102 \(RTSP 412\)/);
  });

  it('la clave que el RTSP rechaza: «credencial», sin la clave en la frase', async () => {
    const d = await proveedor('101', 'otra-clave').sondearVideo('c-1');
    expect(d.causa).toBe('credencial');
    expect(d.frase).not.toContain('otra-clave');
  });

  it('todo en orden: H.264, sin causa', async () => {
    expect(await proveedor('101').sondearVideo('c-1')).toMatchObject({
      causa: 'ninguna',
      codec: 'H.264',
    });
  });
});
