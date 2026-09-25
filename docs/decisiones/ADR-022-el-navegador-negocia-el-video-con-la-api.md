# ADR-022 · La vista en vivo se negocia con la API (WHEP); el navegador nunca ve RTSP ni el puente

|                 |                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ETAPA 15-E (2026-09-25)                                                                                                     |
| **Sustituye a** | Nada. Concreta el «Video de cámaras al navegador: go2rtc (RTSP → WebRTC)» de `CLAUDE.md` §2.6 y el camino de video separado de ADR-01  |
| **Afecta a**    | `packages/providers` (`origenDeVideo`), `apps/api/src/guardia` (puerto `PuenteDeVideo`, `VideoController`), `apps/web` (`VideoEnVivo`) |

---

## Contexto

La consola de guardia virtual necesita ver la cámara del equipo que atiende. El
stack fija go2rtc como puente RTSP → WebRTC, y go2rtc ofrece dos formas de
usarse desde un navegador:

1. **Directa**: la página habla con go2rtc (`/api/webrtc?src=…`), y go2rtc
   lleva en su configuración la URL RTSP de cada equipo con usuario y clave.
2. **A través de la API**: la página manda su oferta SDP a la API, que registra
   el flujo en go2rtc con la URL RTSP que ella construye y negocia en nombre
   del navegador.

La primera es más corta y es la que todos los ejemplos enseñan. Tiene tres
problemas que en este proyecto no son admisibles:

- **Autorización**: go2rtc no sabe de sesiones, roles ni copropiedades. Quien
  alcance su puerto ve cualquier cámara de cualquier copropiedad (RN-15,
  KPI-35).
- **Credenciales**: la URL RTSP lleva la clave del equipo. En go2rtc vive en un
  fichero de configuración en claro y, con la API directa, en la URL que el
  navegador consulta (RN-12, RN-21).
- **Marca fuera de su sitio**: la forma de la URL RTSP es vocabulario del
  fabricante. Ponerla en la configuración de go2rtc o en la consola la saca de
  `packages/providers` (KPI-11).

## Decisión

**El navegador negocia WebRTC contra la API por WHEP
(`POST /copropiedades/:id/guardia/video/:dispositivoId/whep`, `application/sdp`).
La API valida alcance, rol y cuerpo, pide al proveedor el origen de video del
equipo, lo registra en go2rtc y devuelve la respuesta SDP. El navegador nunca
recibe una URL RTSP ni la dirección del puente; el medio viaja por WebRTC entre
el navegador y go2rtc.**

- El proveedor expone `origenDeVideo(dispositivoId)`: `null` si el tipo de
  equipo no emite video, o la URL RTSP construida en `hikvision/video-rtsp.ts`
  con la credencial descifrada (S-46). Es el único sitio que la conoce.
- La capa de aplicación declara `PuenteDeVideo` (`asegurarFlujo`, `negociar`)
  y `PuenteGo2rtc` lo implementa con dos llamadas (S-47). Cualquier `rtsp://`
  que go2rtc devuelva en un error se **redacta** antes de salir.
- `GO2RTC_URL` es opcional y **sólo de la API**: sin él la ruta responde 503
  con motivo y el resto de la consola sigue. go2rtc escucha su API HTTP en
  bucle local; sólo su puerto WebRTC (`webrtc.listen`) mira a la red.
- La consola mide y muestra **negociación** y **primer cuadro** (KPI-33): la
  latencia se demuestra, no se afirma.
- `PUENTE_VIDEO_URL` de la consola se queda vacío. Sólo tendría sentido si
  go2rtc se expusiera directamente al navegador, que es justo lo que esta
  decisión descarta; entonces entraría en la CSP.

## Consecuencias

- **Una llamada más por sesión de video** (la API en medio). Es señalización,
  no medio: no añade latencia al video una vez negociado.
- **go2rtc acumula un flujo por equipo** con nombre `ncr-<dispositivoId>`. Un
  `PUT` posterior reemplaza la fuente, así que una credencial rotada no deja un
  flujo viejo (S-47, por confirmar en sitio).
- **Reproducir video en modo «sólo recibir» no exige contexto seguro**;
  `RTCPeerConnection` funciona por `http://<IP>`. El micrófono sí lo exige
  (`getUserMedia`): en sitio se ve por IP y se habla por `https` o `localhost`.
  El recuadro anterior de la consola decía lo contrario y se corrige.
- **Contingencia**: si go2rtc no alcanza el umbral con un modelo concreto, se
  cambia el adaptador detrás de `PuenteDeVideo` (otro puente, o MSE/HLS por la
  misma ruta), sin tocar la consola ni el proveedor.
