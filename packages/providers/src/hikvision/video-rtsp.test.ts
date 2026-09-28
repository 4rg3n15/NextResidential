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
  });

  it('C2/D2 (15-L) · el canal sale de la ficha y el puerto de la configuración', () => {
    const principal = origenRtspDe({ ...equipo('intercom'), canalDeVideo: '101' }, 8554);
    expect(principal?.rtsp).toMatch(/@203\.0\.113\.20:8554\/Streaming\/Channels\/101$/);
    expect(principal?.flujo).toBe('principal');
    const otraCamara = origenRtspDe({ ...equipo('camara_lpr'), canalDeVideo: '202' });
    expect(otraCamara?.rtsp).toMatch(/:554\/Streaming\/Channels\/202$/);
    expect(otraCamara?.flujo).toBe('secundario');
    // `null` en la ficha es «el de siempre»: el subflujo del canal 1.
    expect(origenRtspDe({ ...equipo('camara_lpr'), canalDeVideo: null })?.rtsp).toMatch(/102$/);
  });
});
