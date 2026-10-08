import { describe, expect, it } from 'vitest';
import { FUENTE_EN_EL_EDGE } from '@ncr/providers';
import { PuenteGo2rtc, flujoTranscodificado } from './puente-go2rtc';
import { PuenteDeVideoPorElEdge } from './puente-de-video-por-el-edge';
import type { CredencialesEnElEdge } from '../../comun/credenciales-en-el-edge';

/**
 * A3/A6 (15-S2) · el flujo transcodificado se registra REFERENCIANDO el
 * original por su nombre: ni `rtsp://`, ni usuario, ni clave en la fuente que
 * go2rtc convierte en argumentos de ffmpeg (RN-21). El go2rtc del Edge no
 * transcodifica: para sus flujos, `null`.
 */
const RTSP = 'rtsp://servicio:clave-secreta@equipo.local:554/Streaming/Channels/101';

describe('PuenteGo2rtc · asegurarTranscodificado (A3)', () => {
  it('PATCH name=<nombre>-h264 src=ffmpeg:<nombre>#video=h264, sin credencial ni rtsp://', async () => {
    const urls: string[] = [];
    const puente = new PuenteGo2rtc('http://puente.local:1984', async (url) => {
      urls.push(url);
      return new Response('', { status: 200 });
    });
    await puente.asegurarFlujo('ncr-x', RTSP);
    expect(await puente.asegurarTranscodificado('ncr-x')).toBe('ncr-x-h264');
    const ultima = new URL(urls.at(-1) ?? '');
    expect(ultima.searchParams.get('name')).toBe('ncr-x-h264');
    const src = ultima.searchParams.get('src') ?? '';
    expect(src).toBe('ffmpeg:ncr-x#video=h264');
    expect(src).not.toMatch(/rtsps?:\/\/|@|clave/);
  });

  it('el nombre y la fuente derivados salen de una función pura', () => {
    expect(flujoTranscodificado('ncr-1')).toEqual({
      nombre: 'ncr-1-h264',
      fuente: 'ffmpeg:ncr-1#video=h264',
    });
  });
});

describe('PuenteDeVideoPorElEdge · asegurarTranscodificado (A3)', () => {
  const edge = {} as CredencialesEnElEdge;

  it('un flujo del Edge: null (su go2rtc no transcodifica)', async () => {
    const directo = new PuenteGo2rtc('http://p', async () => new Response('', { status: 200 }));
    const puente = new PuenteDeVideoPorElEdge(directo, edge);
    await puente.asegurarFlujo('ncr-e', `${FUENTE_EN_EL_EDGE}e`);
    expect(await puente.asegurarTranscodificado('ncr-e')).toBeNull();
  });

  it('un flujo del go2rtc de la API: el derivado; sin go2rtc en la API, null', async () => {
    const directo = new PuenteGo2rtc('http://p', async () => new Response('', { status: 200 }));
    const puente = new PuenteDeVideoPorElEdge(directo, edge);
    await puente.asegurarFlujo('ncr-d', RTSP);
    expect(await puente.asegurarTranscodificado('ncr-d')).toBe('ncr-d-h264');
    expect(
      await new PuenteDeVideoPorElEdge(null, edge).asegurarTranscodificado('ncr-d'),
    ).toBeNull();
  });
});
