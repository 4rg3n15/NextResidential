import { describe, expect, it } from 'vitest';
import { fraseDeErrorDeVideo, tituloPorCausa } from './causas-de-video';

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

describe('V5 (15-N) · el título nombra la causa, no sólo el código', () => {
  it.each([
    [
      'go2rtc no está en marcha o no escucha en GO2RTC_URL (fetch failed)',
      /puente de video está caído/,
    ],
    ['el puente rechazó la oferta de video del navegador: recargue', /rechazó la oferta/],
    [
      'el equipo no tiene el canal 102 (RTSP 412): elija uno de los que declara',
      /no tiene ese canal/,
    ],
    [
      'el equipo rechazó la credencial por RTSP (la misma que acepta por HTTP)',
      /credencial de video/,
    ],
    ['el equipo entrega H.265 en el canal 101 y el navegador sólo reproduce H.264', /Códec/],
    ['el equipo rechazó la sesión RTSP (RTSP 454 Session Not Found)', /sesión de video/],
  ])('%s', (mensaje, titulo) => {
    expect(tituloPorCausa(mensaje)).toMatch(titulo);
  });

  it('sin causa reconocida, ninguno: manda el título por código', () => {
    expect(tituloPorCausa('algo inédito')).toBeNull();
  });

  it('lo que la API ya explicó con remedio no se duplica', () => {
    const t = 'el equipo no tiene el canal 102 (RTSP 412): elija uno de los que declara';
    expect(fraseDeErrorDeVideo('puente', t)).toBe(t);
  });
});

describe('15-P · 0.5 · H.265: la consola dice CÓMO pasar a H.264, entero', () => {
  it('el texto del equipo con los pasos llega sin recortar', () => {
    // El 409 tal como lo arma la API (`VideoNoReproducible` del proveedor; C.2, 15-S1).
    const mensaje =
      'El equipo entrega H.265 en el canal 101; el navegador no lo reproduce por WebRTC: ' +
      'cambie ese flujo a H.264 en el equipo (requiere autorización del cliente). Para verlo: ' +
      'en la web del equipo, Configuración › Video/Audio › Video; en «Tipo de flujo» elija el ' +
      'principal (canal 101); en «Codificación de video» ponga H.264 y pulse Guardar; o elija ' +
      'otro canal en su ficha que ya entregue H.264.';
    const frase = fraseDeErrorDeVideo('sin_video', mensaje);
    expect(frase).toContain('Configuración › Video/Audio › Video');
    expect(frase).toContain('«Codificación de video» ponga H.264 y pulse Guardar');
    expect(frase).toContain('principal (canal 101)');
    expect(tituloPorCausa(frase)).toBe('Códec que el navegador no reproduce');
  });
});
