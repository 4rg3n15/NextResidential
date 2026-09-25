import { describe, expect, it, vi } from 'vitest';
import { ErrorDeVistaEnVivo, negociarVistaEnVivo, rutaWhep } from './whep';

/**
 * Lo que se puede probar sin navegador: que la oferta se manda como
 * `application/sdp` a la ruta del proxy, que la respuesta se aplica como
 * `answer`, y que cada negativa de la API se traduce a su código. Que se VEA la
 * cámara se mide en sitio (KPI-33), y así lo dice el informe.
 */
class ConexionFalsa {
  readonly escuchas = new Map<string, (e: unknown) => void>();
  iceGatheringState: RTCIceGatheringState = 'complete';
  localDescription: { sdp: string } | null = null;
  remota: RTCSessionDescriptionInit | null = null;
  cerrada = false;
  transceptores: string[] = [];
  addEventListener(tipo: string, fn: (e: unknown) => void): void {
    this.escuchas.set(tipo, fn);
  }
  removeEventListener(): void {
    // no hace falta en la prueba
  }
  addTransceiver(clase: string): void {
    this.transceptores.push(clase);
  }
  async createOffer(): Promise<{ type: 'offer'; sdp: string }> {
    return { type: 'offer', sdp: 'v=0\r\noferta' };
  }
  async setLocalDescription(d: { sdp: string }): Promise<void> {
    this.localDescription = d;
  }
  async setRemoteDescription(d: RTCSessionDescriptionInit): Promise<void> {
    this.remota = d;
  }
  close(): void {
    this.cerrada = true;
  }
}

const banco = (responder: () => Response) => {
  const conexion = new ConexionFalsa();
  const llamadas: { url: string; init: RequestInit | undefined }[] = [];
  const fetchFn = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    llamadas.push({ url: String(entrada), init });
    return responder();
  }) as unknown as typeof fetch;
  const flujos: unknown[] = [];
  const negociar = () =>
    negociarVistaEnVivo(rutaWhep('cop-a', 'disp-1'), {
      alFlujo: (f) => flujos.push(f),
      crearConexion: () => conexion as unknown as RTCPeerConnection,
      fetchFn,
    });
  return { conexion, llamadas, flujos, negociar };
};

describe('negociarVistaEnVivo (A5)', () => {
  it('manda la oferta como application/sdp a la ruta del proxy y aplica la respuesta', async () => {
    const { conexion, llamadas, negociar } = banco(
      () => new Response('v=0\r\nrespuesta', { status: 201 }),
    );
    const salida = await negociar();
    expect(llamadas[0]?.url).toBe('/api/ncr/copropiedades/cop-a/guardia/video/disp-1/whep');
    expect(llamadas[0]?.init?.method).toBe('POST');
    expect((llamadas[0]?.init?.headers as Record<string, string>)['content-type']).toBe(
      'application/sdp',
    );
    expect(llamadas[0]?.init?.body).toBe('v=0\r\noferta');
    expect(conexion.remota).toEqual({ type: 'answer', sdp: 'v=0\r\nrespuesta' });
    expect(conexion.transceptores).toEqual(['video']);
    expect(salida.latenciaNegociacionMs).toBeGreaterThanOrEqual(0);
    salida.cerrar();
    expect(conexion.cerrada).toBe(true);
  });

  it('el flujo que llega por `track` se entrega a `alFlujo`', async () => {
    const { conexion, flujos, negociar } = banco(() => new Response('v=0', { status: 201 }));
    await negociar();
    conexion.escuchas.get('track')?.({ streams: ['flujo-1'] });
    expect(flujos).toEqual(['flujo-1']);
  });

  it.each([
    [503, 'sin_puente'],
    [409, 'sin_video'],
    [502, 'puente'],
    [404, 'sin_permiso'],
    [500, 'red'],
  ])(
    'HTTP %i → código %s, con el mensaje de la API y la conexión cerrada',
    async (estado, codigo) => {
      const { conexion, negociar } = banco(
        () =>
          new Response(JSON.stringify({ estado, mensaje: `motivo ${String(estado)}` }), {
            status: estado,
          }),
      );
      const error = await negociar().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ErrorDeVistaEnVivo);
      expect((error as ErrorDeVistaEnVivo).codigo).toBe(codigo);
      expect((error as Error).message).toBe(`motivo ${String(estado)}`);
      expect(conexion.cerrada).toBe(true);
    },
  );

  it('sin RTCPeerConnection en el entorno: código «navegador»', async () => {
    const error = await negociarVistaEnVivo('/x', { alFlujo: () => undefined }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ErrorDeVistaEnVivo);
    expect((error as ErrorDeVistaEnVivo).codigo).toBe('navegador');
  });
});
