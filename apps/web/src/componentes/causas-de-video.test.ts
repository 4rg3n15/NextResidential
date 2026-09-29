import { describe, expect, it } from 'vitest';
import { fraseDeErrorDeVideo } from './causas-de-video';

/**
 * E2/C1 (15-M) · lo que ve la guardia cuando no hay video: palabras y remedio.
 */
describe('fraseDeErrorDeVideo', () => {
  it('«HTTP 500 · EOF» (API anterior) se explica como cierre del equipo y conserva el dato', () => {
    const frase = fraseDeErrorDeVideo(
      'puente',
      'El puente de video no atendió la petición: negociación WebRTC con el puente: HTTP 500 · EOF',
    );
    expect(frase).toMatch(/^El equipo cerró la conexión de video \(backchannel\)/);
    expect(frase).toContain('HTTP 500 · EOF');
  });

  it('un JSON crudo se desenvuelve; sin `mensaje` legible, se dice que fue técnico', () => {
    expect(fraseDeErrorDeVideo('puente', '{"estado":502,"mensaje":"HTTP 500 · EOF"}')).toMatch(
      /cerró la conexión de video/,
    );
    expect(fraseDeErrorDeVideo('puente', '{"estado":502}')).toBe(
      'el puente devolvió un error técnico',
    );
    expect(fraseDeErrorDeVideo('puente', '{no es json')).toBe(
      'el puente devolvió un error técnico',
    );
  });

  it('sin puente: la frase de la API más cómo arrancarlo, una sola vez', () => {
    expect(fraseDeErrorDeVideo('sin_puente', 'falta GO2RTC_URL')).toBe(
      'falta GO2RTC_URL. Arranque el puente en el Mac: pnpm sitio:video',
    );
    expect(fraseDeErrorDeVideo('sin_puente', 'arranque con pnpm sitio:video')).toBe(
      'arranque con pnpm sitio:video',
    );
  });

  it('un canal que el equipo no tiene lo nombra y manda a la ficha', () => {
    expect(
      fraseDeErrorDeVideo('sin_video', 'el equipo contestó RTSP 412 a /Streaming/Channels/102'),
    ).toMatch(/^El equipo no tiene el canal 102: elija otro canal en la ficha del equipo/);
  });

  it('lo que la API ya explicó con remedio pasa tal cual; lo desconocido, también', () => {
    const explicado =
      'go2rtc no está en marcha o no escucha en GO2RTC_URL: arránquelo con `pnpm sitio:video` (fetch failed)';
    expect(fraseDeErrorDeVideo('puente', explicado)).toBe(explicado);
    expect(fraseDeErrorDeVideo('red', 'algo inédito')).toBe('algo inédito');
  });
});
