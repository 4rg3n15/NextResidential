import { describe, expect, it } from 'vitest';
import { origenRtspDe } from './video-rtsp';
import type { EquipoRegistrado } from './registro-de-equipos';

const equipo = (tipo: EquipoRegistrado['tipo']): EquipoRegistrado => ({
  dispositivoId: 'd-1',
  tipo,
  host: '203.0.113.20',
  puerto: 80,
  protocolo: 'http',
  usuario: 'servicio',
  clave: 'cl@ve:rara',
});

describe('origen RTSP (A5, S-46)', () => {
  it('cámara, terminal y videoportero tienen video; relé y controlador no', () => {
    expect(origenRtspDe(equipo('camara_lpr'))).not.toBeNull();
    expect(origenRtspDe(equipo('terminal_facial'))).not.toBeNull();
    expect(origenRtspDe(equipo('intercom'))).not.toBeNull();
    expect(origenRtspDe(equipo('rele'))).toBeNull();
    expect(origenRtspDe(equipo('controlador_io'))).toBeNull();
  });

  it('el flujo secundario por omisión, con la credencial codificada dentro', () => {
    const origen = origenRtspDe(equipo('camara_lpr'));
    expect(origen?.rtsp).toBe(
      'rtsp://servicio:cl%40ve%3Arara@203.0.113.20:554/Streaming/Channels/102',
    );
    expect(origen?.flujo).toBe('secundario');
    expect(origenRtspDe(equipo('camara_lpr'), 'principal')?.rtsp).toMatch(/Channels\/101$/);
  });
});
