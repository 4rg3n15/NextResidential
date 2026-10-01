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

  /**
   * V2 (15-N) · esta prueba fijaba «sin canal en la ficha pregunta el 102», que
   * es lo que dejó la cámara del 29/09 sin video (no tiene el 102). Ahora se
   * pregunta uno de los que el equipo DECLARA y el veredicto lo trae para
   * guardarlo en la ficha.
   */
  const sondaQueDeclara = (canales: readonly { id: string; codec: string }[]) =>
    new SondaPorProveedor(
      equipoSimulado({ familia: 'videoportero', ...CREDENCIAL, canalesDeVideo: canales }),
      undefined,
      rtsp.puerto,
    );

  it('V2 · sin canal en la ficha: el subflujo que el equipo declara, y se propone guardarlo', async () => {
    const r = await sondaQueDeclara([
      { id: '101', codec: 'H.265' },
      { id: '102', codec: 'H.264' },
    ]).probar(datos(null));
    expect(r.capacidades?.video.codec).toBe('H.264');
    expect(r.canalDeVideo).toBe('102');
  });

  it('V2 · la ficha con un canal que el equipo NO declara: se prueba y se guarda el suyo', async () => {
    const r = await sondaQueDeclara([{ id: '101', codec: 'H.265' }]).probar(datos('102'));
    expect(r.canalDeVideo).toBe('101');
    expect(r.capacidades?.video.canal).toBe('101');
  });

  it('V2 · la ficha manda si el equipo declara su canal: no se propone nada', async () => {
    const r = await sondaQueDeclara([
      { id: '101', codec: 'H.265' },
      { id: '102', codec: 'H.264' },
    ]).probar(datos('101'));
    expect(r.canalDeVideo).toBeUndefined();
  });

  /**
   * 15-P (0.5) · esta prueba fijaba «sin ficha y sin lista no se pregunta»:
   * es el 409 «sin video» que el encargo manda cambiar por «proponer 101».
   * Se pregunta el 101, se dice que fue por omisión y, como el equipo lo
   * describe, se propone guardarlo.
   */
  it('V2 · sin canal en la ficha y sin lista del equipo: el 101 por omisión', async () => {
    const r = await sonda(rtsp.puerto).probar(datos(null));
    expect(r.canalDeVideo).toBe('101');
    const detalle = r.ficha?.hallazgos.find((h) => h.campo.startsWith('video en vivo'))?.detalle;
    expect(detalle).toMatch(/canal 101 por omisión: el equipo no lista sus canales; lo describió/);
    expect(detalle).toMatch(/Codificación de video» ponga H\.264/);
  });

  it('15-P · el 101 por omisión que el equipo NO tiene no se guarda en la ficha', async () => {
    const sinPrincipal = await servidorRtspSimulado({ ...CREDENCIAL, canales: { '102': 'H264' } });
    try {
      const r = await sonda(sinPrincipal.puerto).probar(datos(null));
      expect(r.canalDeVideo).toBeUndefined();
      expect(r.ficha?.hallazgos.find((h) => h.campo.startsWith('video en vivo'))?.detalle).toMatch(
        /canal 101 por omisión: el equipo no lista sus canales$/,
      );
    } finally {
      await sinPrincipal.cerrar();
    }
  });

  it('sin puerto RTSP configurado, no se pregunta el video', async () => {
    const r = await sonda().probar(datos('101'));
    expect(r.ficha?.hallazgos.some((h) => h.campo.startsWith('video en vivo'))).toBe(false);
  });
});
