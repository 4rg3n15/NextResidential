import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { diagnosticarEquipo } from './diagnostico-de-equipo';
import { fichaDe } from './ficha';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import { servidorRtspSimulado } from '../simulacion/servidor-rtsp';
import type { ServidorRtspSimulado } from '../simulacion/servidor-rtsp';
import { HikvisionProvider } from '../hikvision/hikvision-provider';
import { RegistroEnMemoria } from '../hikvision/registro-de-equipos';
import { capacidadesDescubiertas } from '../nucleo/capacidades';
import { VideoNoReproducible } from '../nucleo/errores';
import { motivoLegible } from '../nucleo/motivo-legible';

/**
 * D2 · C3 (ETAPA 15-L) · «Probar conexión» pregunta el video al equipo por
 * RTSP y la ficha dice el códec; con H.265 la consola lo dice en vez de negro.
 * El equipo HTTP es el simulado de siempre; el RTSP, uno de verdad en el
 * bucle local.
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
let rtsp: ServidorRtspSimulado;

beforeAll(async () => {
  rtsp = await servidorRtspSimulado({ ...CREDENCIAL, canales: { '102': 'H264', '101': 'H265' } });
});
afterAll(async () => {
  await rtsp.cerrar();
});

const diagnosticar = (canal: string) =>
  diagnosticarEquipo({
    host: '127.0.0.1',
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    familia: 'videoportero',
    peticion: equipoSimulado({ familia: 'videoportero', ...CREDENCIAL }),
    video: { puerto: rtsp.puerto, canal },
  });

describe('la ficha dice el video que entrega el equipo', () => {
  it('H.264 en el subflujo: conforme, y la capacidad queda registrada', async () => {
    const d = await diagnosticar('102');
    expect(d.capacidadesDelEquipo?.video).toEqual({ estado: 'si', codec: 'H.264', canal: '102' });
    expect(fichaDe(d).hallazgos.find((h) => h.campo === 'video en vivo (canal 102)')).toMatchObject(
      { estado: 'conforme', valorLeido: 'H.264 · respuesta RTSP del equipo' },
    );
  });

  it('H.265: aviso con qué hacer, no un reproductor negro', async () => {
    const d = await diagnosticar('101');
    expect(d.capacidadesDelEquipo?.video.codec).toBe('H.265');
    const h = fichaDe(d).hallazgos.find((x) => x.campo === 'video en vivo (canal 101)');
    expect(h?.estado).toBe('aviso');
    // A2 (15-S2) · ya no «no lo reproduce»: Safari directo, Chrome transcodificado.
    expect(h?.detalle).toMatch(
      /H\.265 en el canal 101: Safari lo reproduce directo; Chrome, sólo si el puente lo transcodifica/,
    );
  });

  it('un canal que el equipo no tiene: se dice cuál, y la capacidad queda en «no»', async () => {
    const d = await diagnosticar('202');
    expect(d.capacidadesDelEquipo?.video.estado).toBe('no');
    expect(
      fichaDe(d).hallazgos.find((x) => x.campo === 'video en vivo (canal 202)')?.detalle,
    ).toMatch(/no tiene el canal 202/);
  });

  it('sin preguntar el video, la ficha no inventa un hallazgo', async () => {
    const d = await diagnosticarEquipo({
      host: '127.0.0.1',
      puerto: 80,
      protocolo: 'http',
      ...CREDENCIAL,
      familia: 'videoportero',
      peticion: equipoSimulado({ familia: 'videoportero', ...CREDENCIAL }),
    });
    expect(d.video).toBeUndefined();
    expect(fichaDe(d).hallazgos.some((h) => h.campo.startsWith('video en vivo'))).toBe(false);
  });
});

describe('el origen del video respeta lo que el equipo contestó', () => {
  const proveedorCon = (canalDeVideo: string | null) =>
    new HikvisionProvider({
      registro: new RegistroEnMemoria([
        {
          dispositivoId: 'v-1',
          tipo: 'intercom',
          host: '203.0.113.70',
          puerto: 80,
          protocolo: 'http',
          ...CREDENCIAL,
          canalDeVideo,
          capacidades: capacidadesDescubiertas({
            video: { estado: 'si', codec: 'H.265', canal: '101' },
          }),
        },
      ]),
      reloj: { ahora: () => new Date(0) },
    });

  // A2 (15-S2) · la MISMA regla que el códec declarado: la última respuesta
  // RTSP en ese canal viaja con el origen y la API decide con la oferta.
  it('H.265 en el canal de la ficha: el origen lleva el códec de la última respuesta RTSP', async () => {
    expect(await proveedorCon('101').origenDeVideo('v-1')).toMatchObject({
      codec: 'H.265',
      canal: '101',
    });
  });

  it('VideoNoReproducible, si llega de un Edge viejo, se dice con los tres remedios', () => {
    expect(motivoLegible(new VideoNoReproducible('v-1', 'H.265', '101'))).toMatch(
      /H\.265 en el canal 101 .*Safari.*ffmpeg.*H\.264 en el equipo/,
    );
  });

  it('si la ficha ya apunta a otro canal, la respuesta vieja no manda', async () => {
    expect((await proveedorCon('102').origenDeVideo('v-1'))?.rtsp).toMatch(
      /Channels\/102#backchannel=0$/,
    );
  });

  it('sin escucha abierta, no hay señal de eventos que contar', () => {
    expect(proveedorCon(null).senalDeEventos('v-1')).toBeNull();
  });
});
