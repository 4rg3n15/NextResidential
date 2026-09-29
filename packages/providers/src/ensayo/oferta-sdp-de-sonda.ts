/**
 * E2/C1 (15-M) · LA OFERTA SDP CON LA QUE SE SONDEA EL PUENTE DE VIDEO
 *
 * Sirve al paso 7 de `pnpm sitio:ensayo` (negociación WebRTC real contra
 * go2rtc) y a las pruebas con el binario. No abre ningún medio: la prueba
 * termina en la respuesta SDP, que es lo que demuestra que el puente llegó al
 * equipo, negoció el códec y contestó.
 */
/**
 * Una oferta SDP de «sólo recibir» —video H.264 y audio PCMU— con lo mínimo que
 * el puente exige para contestar: credencial ICE, huella DTLS (no se llega a
 * verificar: la prueba termina en la respuesta), `setup`, `mid` y `rtcp-mux`.
 * Es la misma forma que manda el navegador de la consola.
 */
export const OFERTA_SDP_DE_SONDA = ((): string => {
  const huella = Array.from({ length: 32 }, (_, i) =>
    (i * 7 + 3).toString(16).padStart(2, '0').toUpperCase(),
  ).join(':');
  const comun = [
    'c=IN IP4 0.0.0.0',
    'a=rtcp:9 IN IP4 0.0.0.0',
    'a=ice-ufrag:ncrprueba',
    'a=ice-pwd:ncrpruebancrpruebancrprueba',
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${huella}`,
    'a=setup:actpass',
    'a=recvonly',
    'a=rtcp-mux',
  ];
  return [
    'v=0',
    'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0 1',
    'a=msid-semantic: WMS',
    'm=video 9 UDP/TLS/RTP/SAVPF 96',
    ...comun,
    'a=mid:0',
    'a=rtpmap:96 H264/90000',
    'a=fmtp:96 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
    'm=audio 9 UDP/TLS/RTP/SAVPF 0',
    ...comun,
    'a=mid:1',
    'a=rtpmap:0 PCMU/8000',
    '',
  ].join('\r\n');
})();
