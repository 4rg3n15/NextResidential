# ADR-001 · Intercom sobre ISAPI TwoWayAudio

- **Estado:** Aceptada — decisión del cliente, cerrada · **Enmienda 1 (15-P, 2026-10-01): el puente de audio**, al final
- **Fecha:** 2026-09-06 (formalización en la ETAPA 00)
- **Origen:** `CLAUDE.md` §4, ADR-01
- **Afecta a:** ETAPAS 10 y 15 · OE-07 · HU-26 · CA-19 · KPI-33

## Contexto

OE-07 exige que un operador externo al complejo converse con el visitante, autorice o niegue el ingreso y accione dispositivos. CU-03 detalla la cadena completa: el visitante pulsa el intercom, el evento se enruta a la cola del operador, se establece sesión de audio y vídeo, el operador verifica identidad, contacta al residente y ordena la apertura remota.

El documento de requisitos, en su §13.4, califica esta pieza como **el mayor riesgo de cronograma del proyecto**: _«El intercom con audio y video es la pieza más difícil del proyecto. OE-07 depende de él y el puente SIP a WebRTC no es trivial. Es donde más tiempo se pierde.»_

Existían dos caminos con respaldo documental:

- **§13.2 del documento de requisitos** proponía _«SIP hacia el videoportero, con puente WebRTC (LiveKit o Janus)»_, con el argumento de que _«los intercom Hikvision hablan SIP; el navegador del operador habla WebRTC»_.
- **El diagrama arquitectónico** dejaba ambas rutas abiertas: la caja «Puente de intercom» dice literalmente _«ISAPI TwoWayAudio, o SIP con Asterisk si el modelo no lo soporta»_.

## Decisión

**El audio bidireccional de la guardia virtual se implementa sobre ISAPI TwoWayAudio de Hikvision.** Se descarta el camino SIP + Asterisk / LiveKit / Janus.

Es una **decisión expresa del cliente**, posterior a la redacción del documento de requisitos.

## Resolución de la contradicción (C-01)

La sugerencia de §13.2 **no prevalece**, por tres razones acumulativas:

1. La decisión del cliente es **posterior** a la redacción del documento.
2. §13 **se declara a sí misma ajena al estándar de especificación**: _«Esta sección no forma parte del estándar de especificación de requisitos, pero se incorpora porque las decisiones de arquitectura condicionan directamente el cumplimiento de OE-03, OE-06 y OE-08.»_ Es una sugerencia, no un requisito.
3. **Ningún requisito verificable exige SIP.** Ningún OE, RN, HU, CU ni CA lo menciona. Los compromisos reales —KPI-32, KPI-33, CA-19, CA-20— son de latencia y trazabilidad, **agnósticos al protocolo**.

El diagrama no contradice la decisión: la contiene como primera opción.

**El documento de requisitos original no se modifica.** La corrección vive en este ADR y en el informe de auditoría. Si Grupo Control revisa el `.docx`, debe encontrar aquí el registro formal de por qué lo construido difiere de la sugerencia inicial.

## Alternativas consideradas

| Alternativa                              | Por qué se descarta                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SIP + Asterisk / LiveKit / Janus**     | Introduce un servidor de señalización, un plano de medios y un ciclo de vida de sesión SIP completos, para un caso de uso que no necesita interoperar con ninguna red telefónica. Es la ruta que §13.4 señala como sumidero de tiempo. No la exige ningún requisito |
| **SDK móvil/nativo de Hikvision**        | Es nativo por plataforma; obligaría a canales de plataforma en Flutter e introduciría dependencia binaria del fabricante en la capa equivocada. Contradice OE-03                                                                                                    |
| **WebRTC directo contra el dispositivo** | El navegador hablaría con el hardware. Viola RN-12 de forma frontal                                                                                                                                                                                                 |

## Diseño resultante

- El puerto **`IntercomProvider`** del dominio expone **intención pura, sin protocolo**: `abrirSesion(dispositivoId, operadorId)` · `enviarAudio(chunk)` · `recibirAudio()` · `cerrarSesion(motivo)` · `estadoSesion()`. **El dominio no sabe qué es TwoWayAudio.**
- **`HikvisionIntercomProvider`** (ETAPA 15) implementa ese puerto: abre el canal por `/ISAPI/System/TwoWayAudio/channels/<id>/open`, transmite y recibe el flujo con autenticación **Digest**, y lo cierra explícitamente. Maneja códec, muestreo y semiduplex o duplex completo según el modelo.
- **Puente de intercom** (en la nube o en el Edge, según latencia): traduce entre el flujo ISAPI y el navegador del operador vía WebSocket/WebRTC. **El navegador nunca habla ISAPI** (RN-12, RN-21).
- **Vídeo por camino separado:** RTSP del equipo → `go2rtc` → WebRTC en el navegador. Audio y vídeo se sincronizan **en la consola**, no en el dispositivo.
- **La apertura remota no viaja por el canal de audio:** es una orden independiente por `AccessPointProvider`, atribuida al operador y auditada (RN-08, CA-20).

## Consecuencias

**Que se aceptan:**

- **Exclusividad del canal.** Un canal TwoWayAudio suele ser exclusivo por dispositivo. Hay que gestionar bloqueo por dispositivo, cola de espera y liberación con _timeout_, para que dos operadores no colisionen. Se implementa simulado en la ETAPA 10 y real en la 15.
- **Semiduplex en algunos modelos.** La consola debe indicar visualmente el turno de palabra.
- **Alcance de implementación cerrado.** Toda referencia a SIP, Asterisk, LiveKit o Janus queda fuera: no se construye, no se deja andamiaje, no se menciona en el código.

**Objetivos medibles comprometidos:**

| Objetivo                            | Umbral    | Respaldo      |
| ----------------------------------- | --------- | ------------- |
| Audio y vídeo extremo a extremo     | **< 2 s** | KPI-33, CA-19 |
| Apertura remota                     | **< 3 s** | KPI-32, CA-20 |
| Atribución de la acción al operador | **100 %** | KPI-34, RN-08 |

## Verificación

1. **De encapsulamiento:** `grep -r "TwoWayAudio\|ISAPI" packages/domain-core/ apps/api/src/**/domain/` devuelve **0**. Verificado en CI como parte de KPI-11.
2. **De sustituibilidad:** la suite de la guardia virtual pasa completa con `MockProvider`, sin hardware (KPI-12).
3. **De latencia:** medición en sesión real contra el equipo, ETAPA 15, paso 6 de `INTEGRACION_HIKVISION.md`.
4. **De exclusividad:** prueba con dos operadores concurrentes sobre el mismo dispositivo (RNF-08.5).

## Contingencia — no es plan A

Si el modelo concreto **no soporta** TwoWayAudio, o su latencia **excede** el umbral de 2 s, la salida es **un adaptador nuevo detrás del mismo puerto**, sin tocar dominio, aplicación ni interfaz.

Que esa salida sea posible sin modificar nada aguas arriba **es precisamente el propósito del puerto**, y su verificación es la prueba de que el encapsulamiento es real y no nominal.

---

## Enmienda 1 · ETAPA 15-P (2026-10-01) — el puente de audio: WebSocket ordenado

**No es una reapertura.** El intercom sigue siendo **ISAPI TwoWayAudio** detrás de `IntercomProvider`. Lo que cambia es el **puente** entre el navegador y la API, que el diseño original dejaba abierto («vía WebSocket/WebRTC»), y el adaptador que habla con el equipo.

### Por qué hizo falta: el transporte anterior no funcionaba contra un equipo que siga el manual

Medido en la 15-P contra un videoportero simulado que implementa el flujo del manual de familia (capabilities → channels → `open` → `audioData` persistente de bajada y de subida → `close`, Digest, G.711 µ-law en tramas de 160 B / 20 ms, y el `0x40002068` de canal ocupado):

- **[Cierto]** La subida iba en trozos de **1600 B (200 ms)** por `fetch` POST —unas 5 peticiones por segundo, no 50 como suponía el encargo— y la API la reenviaba con `fetch` y un cuerpo en flujo, que `undici` serializa como `Transfer-Encoding: chunked`. El manual pide octetos crudos sin longitud declarada. Contra el simulado **no llegó al equipo ninguna de las 12 marcas de ida ni ninguna de las 3 «al pulsar»** (15 pérdidas; la vuelta sí funcionaba) y las tres sesiones se cerraron solas antes de colgar.
- **[Cierto]** `next.config.mjs` declaraba `Permissions-Policy: microphone=()` en **todas** las rutas: en producción `getUserMedia` fallaba y la guardia nunca pudo hablar con `pnpm start`.
- **[Cierto]** El audio no renovaba el turno: una conversación larga caducaba a los 90 s aunque el operador estuviera hablando.

### Medición (banco `e2e/medir-audio-guardia.mjs`, Chromium real, mismo reloj en los dos extremos)

3 sesiones × 4 marcas por opción. Ida = del micrófono del navegador al equipo; vuelta = del equipo al altavoz del navegador.

| Opción                | Establecer escucha (mediana / máx.) | Establecer subida | Ida (mediana / p95) | Vuelta (mediana / p95) | Marcas perdidas              | Canal tomado tras colgar |
| --------------------- | ----------------------------------- | ----------------- | ------------------- | ---------------------- | ---------------------------- | ------------------------ |
| **B · WebSocket**     | 33 / 97 ms                          | 10 / 72 ms        | **37 / 52 ms**      | **70 / 72 ms**         | 0                            | 0 de 3                   |
| A · go2rtc `isapi://` | 305 / 313 ms                        | 141 / 148 ms      | 16 / 19 ms          | 151 / 181 ms           | 0                            | **3 de 3**               |
| Transporte anterior   | 32 / 57 ms                          | 299 / 330 ms      | — (no llega)        | 71 / 93 ms             | 15 (12 de ida + 3 al pulsar) | 0 de 3                   |

Las dos opciones nuevas cumplen el objetivo de < 2 s (KPI-33, CA-19) con más de un orden de magnitud de margen **contra el simulado**. La cifra que vale es la de sitio (procedimiento en `VALIDACION_HIKVISION_EN_SITIO.md` §8.4.1).

### Decisión

**B: WebSocket binario y ordenado navegador ↔ API ↔ `audioData` persistente.**

- El navegador pide un **billete** de un solo uso (15 s, atado a operador, copropiedad, equipo e IP) con las guardas de siempre, y abre `wss` al **mismo origen** de la consola; el servidor de la consola reenvía la actualización a la API. `connect-src 'self'` lo cubre: **la CSP no se relaja**.
- Subida: tramas de 160 B sólo entre «pulsar» y «soltar»; la API descarta lo demás. Bajada: el flujo del equipo, desde que se abre, sin pulsar nada.
- El adaptador `IntercomIsapiPersistente` (en `packages/providers`) abre y cierra el canal y reparte el turno por `IntercomDeEquipo` —la máquina del dominio, sin cambios— y sostiene `GET`/`PUT audioData` persistentes sobre un socket crudo con su **propia** sesión Digest. El `0x40002068` se traduce a «canal ocupado».
- La API corta por su cuenta: tramo de más de 60 s ([SUPUESTO] S-177), turno caducado, tramas fuera de tamaño o de ritmo. Cada conversación deja constancia (operador, equipo, copropiedad, inicio, fin, tramos); **nunca el audio** (migración 0047).
- `Permissions-Policy: microphone=(self)` **sólo** en `/guardia`; el resto de la consola sigue con `microphone=()`.
- **Por omisión `GUARDIA_AUDIO_TRANSPORTE=websocket`**, porque la medición lo justifica. **Volver atrás es cambiar la variable a `http`**: el transporte anterior sigue construido y probado.

### Por qué no A (queda como contingencia documentada)

A es más rápida en la ida, pero sus fallos son de **control**, no de latencia, y no se arreglan desde fuera de go2rtc (v1.9.14):

- **[Cierto]** Abre el canal con `close` previo: **le quita el canal a quien lo tenga**, así que el `0x40002068` nunca se ve y la exclusividad del dominio queda decorativa.
- **[Cierto]** Al colgar, el productor sigue vivo: el canal quedó tomado en el equipo en **3 de 3** sesiones, y una segunda sesión con el mismo puente no obtuvo respuesta en 10 s.
- **[Cierto]** El canal de retorno es `sendonly` y no distingue «pulsar»: la API no puede cortar un tramo ni una caducidad sin tumbar también el video.

Si un modelo concreto exigiera el camino de go2rtc, entra como **adaptador nuevo** detrás del mismo puerto —el puerto no cambia— y con esas tres limitaciones escritas en su informe.

### Video bidireccional (operador visible en el videoportero) — fuera de alcance, sin andamiaje

Cabría detrás del mismo diseño así, y sólo así:

1. **Capacidad leída**, nunca supuesta: una capacidad nueva (p. ej. `videoDeRetorno`) que el adaptador lea del equipo. [SUPUESTO] El manual de familia no documenta una ruta de subida de video para esta serie; sin esa ruta declarada, la capacidad es «no».
2. **Puerto:** un método más del adaptador de intercom, o un puerto hermano, con la misma intención sin protocolo (`enviarVideo(trama)`), **atado al mismo turno** del dominio: quien no tiene la palabra no sale en pantalla.
3. **Transporte:** el mismo WebSocket con un segundo tipo de trama binaria, y `Permissions-Policy: camera=(self)` sólo en `/guardia`.

No hay código, configuración ni pruebas para esto en la 15-P.

### Verificación de la enmienda

- `apps/api/test/audio-guardia-ws.e2e.test.ts`: ida y vuelta por la API contra el simulado en red, segundo operador en cola, billete de un uso y de su IP, aislamiento entre copropiedades (KPI-35), `0x40002068`.
- `apps/web/src/lib/audio/canal-por-websocket.test.ts` y `componentes/controles-de-audio-ws.test.tsx`: pulsar, soltar, soltar antes de que abra el micrófono, caducidad, cambio de equipo, cierre de pestaña.
- `apps/web/src/politica-de-permisos.test.ts`: micrófono sólo en `/guardia`.
- `e2e/medir-audio-guardia.mjs`: la medición de esta tabla, repetible en sitio.
