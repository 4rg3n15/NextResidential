import { afterEach, describe, expect, it, vi } from 'vitest';
import { iceDe, olvidarIce, rutaIce, servidoresIce } from './ice';
import { negociarVistaEnVivo, rutaWhep } from './whep';

const WHEP = rutaWhep('cop-a', 'disp-1');
const respuesta = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });
const TURN = {
  urls: ['turns:turn.ejemplo.invalid:5349?transport=tcp'],
  username: '1790000000:operador',
  credential: 'Y3JlZGVuY2lhbA==',
};

afterEach(() => olvidarIce());

describe('E2 · los STUN/TURN de la consola (15-Q2)', () => {
  it('la ruta hermana de la del WHEP, por el mismo proxy', () => {
    expect(rutaIce(WHEP)).toBe('/api/ncr/copropiedades/cop-a/guardia/video/ice');
    expect(rutaIce('/otra/cosa')).toBeNull();
  });

  it('lo que da la API, validado: lo que no es stun:/turn: no entra', async () => {
    const fetchFn = vi.fn(async () =>
      respuesta({
        iceServers: [{ urls: ['stun:stun.ejemplo.invalid:3478'] }, TURN, { urls: ['http://x'] }, 7],
        ttlSegundos: 600,
      }),
    ) as unknown as typeof fetch;
    expect(await servidoresIce(WHEP, fetchFn, () => 0)).toEqual([
      { urls: ['stun:stun.ejemplo.invalid:3478'] },
      TURN,
    ]);
  });

  it('se guardan la MITAD de su vida: antes no se piden, después sí', async () => {
    const fetchFn = vi.fn(async () =>
      respuesta({ iceServers: [TURN], ttlSegundos: 600 }),
    ) as unknown as typeof fetch;
    await servidoresIce(WHEP, fetchFn, () => 0);
    await servidoresIce(WHEP, fetchFn, () => 299_000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await servidoresIce(WHEP, fetchFn, () => 300_001);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('si la API no los da (error, versión anterior, red), la lista vacía de siempre (R1)', async () => {
    const caida = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await servidoresIce(WHEP, caida)).toEqual([]);
    expect(await servidoresIce(WHEP, (async () => respuesta({}, 404)) as typeof fetch)).toEqual([]);
    expect(await servidoresIce(WHEP, (async () => new Response('no')) as typeof fetch)).toEqual([]);
  });

  it('negociarVistaEnVivo crea la conexión CON esos servidores', async () => {
    const configuraciones: RTCConfiguration[] = [];
    const conexion = {
      iceGatheringState: 'complete',
      localDescription: { sdp: 'v=0\r\noferta' },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addTransceiver: () => undefined,
      createOffer: async () => ({ type: 'offer', sdp: 'v=0\r\noferta' }),
      setLocalDescription: async () => undefined,
      setRemoteDescription: async () => undefined,
      close: () => undefined,
    };
    const salida = await negociarVistaEnVivo(WHEP, {
      alFlujo: () => undefined,
      crearConexion: (c) => {
        configuraciones.push(c);
        return conexion as unknown as RTCPeerConnection;
      },
      fetchFn: (async () => new Response('v=0\r\nrespuesta', { status: 201 })) as typeof fetch,
      servidoresIce: async () => [TURN],
    });
    salida.cerrar();
    expect(configuraciones).toEqual([{ iceServers: [TURN] }]);
    expect(await iceDe(WHEP, { servidoresIce: async () => [] })).toEqual([]);
  });
});
