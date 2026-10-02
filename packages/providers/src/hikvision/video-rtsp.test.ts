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

/**
 * V2 (15-N) · estas pruebas fijaban el 102 «por omisión» sin preguntar al
 * equipo, que es lo que dejó la cámara sin video el 29/09 (RTSP 412: no tiene
 * el 102). Ahora el canal sale de lo que el equipo declara.
 */
const DECLARA_101_Y_102 = [
  { id: '101', codec: 'H.265' },
  { id: '102', codec: 'H.264' },
];

describe('origen RTSP (A5, S-46)', () => {
  it('cámara, terminal y videoportero tienen video; relé y controlador no', () => {
    expect(origenRtspDe(equipo('camara_lpr'), 554, DECLARA_101_Y_102)).not.toBeNull();
    expect(origenRtspDe(equipo('terminal_facial'), 554, DECLARA_101_Y_102)).not.toBeNull();
    expect(origenRtspDe(equipo('intercom'), 554, DECLARA_101_Y_102)).not.toBeNull();
    expect(origenRtspDe(equipo('rele'))).toBeNull();
    expect(origenRtspDe(equipo('controlador_io'))).toBeNull();
  });

  it('sin canal en la ficha, el subflujo que el equipo DECLARA, con la credencial codificada', () => {
    const origen = origenRtspDe(equipo('camara_lpr'), 554, DECLARA_101_Y_102);
    expect(origen?.rtsp).toBe(
      'rtsp://servicio:cl%40ve%3Arara@203.0.113.20:554/Streaming/Channels/102#backchannel=0',
    );
    expect(origen?.flujo).toBe('secundario');
  });

  it('V2 · la cámara que sólo declara el 101: el 101, aunque la ficha diga 102', () => {
    const origen = origenRtspDe({ ...equipo('camara_lpr'), canalDeVideo: '102' }, 554, [
      { id: '101', codec: 'H.264' },
    ]);
    expect(origen?.rtsp).toMatch(/Channels\/101#backchannel=0$/);
  });

  it('V2 · nunca el 102 a ciegas; 15-P (0.5) · sin ficha y sin lista, el 101 por omisión', () => {
    // Antes era SinCanalDeVideo → 409 «sin video» que nadie podía corregir.
    const origen = origenRtspDe(equipo('camara_lpr'));
    expect(origen?.rtsp).toMatch(/\/Streaming\/Channels\/101#backchannel=0$/);
    expect(origen?.flujo).toBe('principal');
  });

  it('C2/D2 (15-L) · el canal sale de la ficha y el puerto de la configuración', () => {
    const principal = origenRtspDe({ ...equipo('intercom'), canalDeVideo: '101' }, 8554);
    expect(principal?.rtsp).toMatch(
      /@203\.0\.113\.20:8554\/Streaming\/Channels\/101#backchannel=0$/,
    );
    expect(principal?.flujo).toBe('principal');
    const otraCamara = origenRtspDe({ ...equipo('camara_lpr'), canalDeVideo: '202' });
    expect(otraCamara?.rtsp).toMatch(/:554\/Streaming\/Channels\/202#backchannel=0$/);
    expect(otraCamara?.flujo).toBe('secundario');
    // V2 (15-N) · `null` en la ficha ya no es «el 102»: es el que el equipo declara.
    expect(
      origenRtspDe({ ...equipo('camara_lpr'), canalDeVideo: null }, 554, DECLARA_101_Y_102)?.rtsp,
    ).toMatch(/102#backchannel=0$/);
  });
});
