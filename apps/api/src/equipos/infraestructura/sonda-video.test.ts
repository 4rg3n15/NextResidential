import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { equipoSimulado, servidorRtspSimulado } from '@ncr/providers';
import type { ServidorRtspSimulado } from '@ncr/providers';
import { SondaPorProveedor } from './sonda-por-proveedor';

/**
 * D2 · C3 (15-L) · «Probar conexión» pregunta el video con el canal de la
 * ficha y el puerto del `.env`; sin puerto configurado, no pregunta.
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
let rtsp: ServidorRtspSimulado;
beforeAll(async () => {
  rtsp = await servidorRtspSimulado({ ...CREDENCIAL, canales: { '102': 'H264', '101': 'H265' } });
});
afterAll(async () => {
  await rtsp.cerrar();
});

const datos = (canalDeVideo: string | null) => ({
  host: '127.0.0.1',
  puerto: 80,
  protocolo: 'http' as const,
  usuario: CREDENCIAL.usuario,
  secreto: CREDENCIAL.clave,
  tipo: 'intercom' as const,
  canalDeVideo,
});

describe('SondaPorProveedor · video', () => {
  const sonda = (puertoRtsp?: number) =>
    new SondaPorProveedor(
      equipoSimulado({ familia: 'videoportero', ...CREDENCIAL }),
      undefined,
      puertoRtsp,
    );

  it('con el canal de la ficha: el códec va a las capacidades y a la ficha', async () => {
    const r = await sonda(rtsp.puerto).probar(datos('101'));
    expect(r.capacidades?.video).toEqual({ estado: 'si', codec: 'H.265', canal: '101' });
    expect(r.ficha?.hallazgos.find((h) => h.campo === 'video en vivo (canal 101)')?.estado).toBe(
      'aviso',
    );
  });

  it('sin canal en la ficha pregunta el 102', async () => {
    const r = await sonda(rtsp.puerto).probar(datos(null));
    expect(r.capacidades?.video.codec).toBe('H.264');
  });

  it('sin puerto RTSP configurado, no se pregunta el video', async () => {
    const r = await sonda().probar(datos('101'));
    expect(r.ficha?.hallazgos.some((h) => h.campo.startsWith('video en vivo'))).toBe(false);
  });
});
