# ADR-001 · Intercom sobre ISAPI TwoWayAudio

- **Estado:** Aceptada — decisión del cliente, cerrada
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
