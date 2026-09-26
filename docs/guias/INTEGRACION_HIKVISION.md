# Integración con los equipos Hikvision · guía de sitio

> **Para ejecutarse delante de los aparatos.** Escrita en la ETAPA 15-E
> (2026-09-25) **sin tocar ningún equipo**: todo lo que afirma sobre el
> comportamiento del hardware está clasificado. Lo que aquí se llama
> **VERIFICADO** se midió contra un aparato en una sesión anterior (barrera,
> 2026-09-15; canal de audio y contratos de evento, 2026-09-18); lo que se
> llama **DOCUMENTADO** sale de la guía del fabricante y puede fallar contra su
> firmware; lo **PROBADO CONTRA MOCK** pasa la suite contra el proveedor
> simulado y el ficticio. Que algo falle está previsto: la hoja de resultados
> de §9 existe para anotarlo, no para maquillarlo.
>
> Esta guía **compone** y no repite:
> [`VALIDACION_HIKVISION_EN_SITIO.md`](VALIDACION_HIKVISION_EN_SITIO.md) sigue
> siendo la guía de las comprobaciones previas equipo por equipo (Digest,
> descubrimiento, modo de control, relé) y de los estados que hay que anotar
> antes de tocar nada. Aquí se remite a ella por sección.

## Índice

0. [Principio y clasificación](#0--principio-y-clasificación)
1. [Inventario y prerrequisitos](#1--inventario-y-prerrequisitos)
2. [Acceso inicial y usuario de servicio](#2--acceso-inicial-y-usuario-de-servicio)
3. [Cámara LPR en modo evento y el servidor de alarma](#3--cámara-lpr-en-modo-evento-y-el-servidor-de-alarma)
4. [Relé y talanquera](#4--relé-y-talanquera)
5. [Terminal facial: enrolamiento, verificación remota y supresión](#5--terminal-facial-enrolamiento-verificación-remota-y-supresión)
6. [Videoportero: llamada, audio y video](#6--videoportero-llamada-audio-y-video)
7. [Registro de cada equipo en Next Control](#7--registro-de-cada-equipo-en-next-control)
8. [Las rutas exactas entre los equipos y la API](#8--las-rutas-exactas-entre-los-equipos-y-la-api)
9. [Batería de aceptación en sitio: los 16 escenarios](#9--batería-de-aceptación-en-sitio-los-16-escenarios)
10. [Diagnóstico de fallos frecuentes](#10--diagnóstico-de-fallos-frecuentes)
11. [Vuelta al simulado sin parar y puesta en marcha por fases](#11--vuelta-al-simulado-sin-parar-y-puesta-en-marcha-por-fases)

---

## 0 · Principio y clasificación

**Next Control decide. El hardware ejecuta.** Cada uno de los tres equipos opera
en **modo evento**: reporta y espera. La cámara con `ctrlMode = 1` (la
plataforma manda), la terminal con `remoteCheck = true` (reporta y espera el
veredicto), el videoportero con la puerta accionada sólo por orden de la
central. Si un equipo decide por su cuenta, el motor de reglas es decorativo y
la trazabilidad se pierde: es **hallazgo de bloqueo**, y se dice antes de
seguir.

| Etiqueta                       | Qué significa en esta guía                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| **VERIFICADO CONTRA HARDWARE** | Se midió contra un aparato en una sesión anterior y quedó anotado con fecha                          |
| **PROBADO CONTRA MOCK**        | La suite lo ejercita contra el proveedor simulado y el ficticio; el real usa las mismas líneas       |
| **SIMULADO**                   | Lo produjo el guion `--simulado`; sirve para ensayar el procedimiento, no para verificar             |
| **DOCUMENTADO**                | Sale de la guía del fabricante o de la especificación de go2rtc; no se ha probado contra su firmware |

## 1 · Inventario y prerrequisitos

| Elemento                  | Requisito                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cámara LPR con barrera    | Firmware con ISAPI `Traffic`/`ITC` y `Parking/barrierGate` (la ruta de la barrera está **VERIFICADA**). `ctrlMode` accesible                                                           |
| Terminal facial           | ISAPI `AccessControl` con `remoteCheck` en `AcsCfg` y biblioteca `FDLib`. **DOCUMENTADO**                                                                                              |
| Videoportero              | ISAPI `TwoWayAudio` (G.711 µ-law, **VERIFICADO** que existe y estaba deshabilitado), `VideoIntercom` (llamada), RTSP en el canal 1. `callSignal` sólo si el equipo lo declara          |
| Red                       | **IP fija** en cada equipo; el servidor de Next Control en la **misma red** o alcanzable por el Edge; VLAN de equipos recomendada (H-15-1)                                             |
| Puertos hacia los equipos | HTTP ISAPI (80 o el configurado), RTSP 554 desde la máquina de go2rtc                                                                                                                  |
| Puertos hacia la API      | El de la API (3000 por omisión) desde la cámara (servidor de alarma) y desde el teléfono del visitante (enlace de consentimiento); `webrtc.listen` de go2rtc (8555) desde el navegador |
| Máquina de la API         | Node según `.nvmrc`, pnpm, `go2rtc` si va a haber video, Supabase alcanzable con las migraciones aplicadas (0035 incluida)                                                             |
| Consola y app             | Consola por `http://<IP>:3001` (video sí; micrófono no sin TLS) o por `https`; app con `--dart-define=API_URL=http://<IP>:3000`                                                        |

Antes de nada: `VALIDACION_HIKVISION_EN_SITIO.md` §1 (qué NO hacer, la red de
seguridad, variables de la sesión).

## 2 · Acceso inicial y usuario de servicio

1. Cambie la credencial de fábrica de cada equipo desde su interfaz web.
2. Cree un **usuario de servicio con privilegio mínimo** por equipo: leer
   eventos, accionar, gestionar la biblioteca de rostros (terminal) y el canal
   de audio (videoportero). No administrador.
3. Compruebe que la autenticación es **Digest** y no Basic, y lea la identidad
   del equipo: `VALIDACION_HIKVISION_EN_SITIO.md` §2. Anote modelo, firmware y
   serie: la ficha de la consola los mostrará y tienen que coincidir.
4. Ese usuario y su clave son lo que se escribe en **Dispositivos → + Agregar
   equipo** (§7). La clave se guarda cifrada con `EQUIPOS_LLAVE` y **nunca
   vuelve a mostrarse**; nunca va a un `.env` versionado ni al repositorio.

## 3 · Cámara LPR en modo evento y el servidor de alarma

**Estado previo anotado, siempre** (`VALIDACION_HIKVISION_EN_SITIO.md` §8.2).

1. **Que deje de decidir.** Apertura por lista local y enlaces internos hacia
   la barrera: desactivados. `ctrlMode = 1`. La consola lo comprueba en «Probar
   conexión» y el alta lo **rechaza** con `0` o `2`.
2. **Declare la cámara en la API.** En `apps/api/.env`:

   ```
   ALARM_SERVER_EQUIPOS=<copropiedadId>|<dispositivoId>|<secreto de 64 hex>|<IP de la cámara>
   ```

   El secreto sale de `openssl rand -hex 32`. Sin declaración, el receptor
   **rechaza a todos**. El `dispositivoId` es el del equipo dado de alta en §7.

3. **Apunte la cámara al receptor** desde su interfaz (`Red → Configuración
avanzada → Notificación HTTP` / `Alarm Server`, según firmware):

   | Campo     | Valor                                                 |
   | --------- | ----------------------------------------------------- |
   | Dirección | la IP de la máquina de la API                         |
   | Puerto    | el de la API (3000)                                   |
   | URL       | `/alarm-server/<secreto>`                             |
   | Método    | `POST`                                                |
   | Formato   | multipart (XML + imagen de escena + recorte de placa) |

   Por ISAPI es `PUT /ISAPI/Event/notification/httpHosts` (**DOCUMENTADO**,
   guía oficial) y `POST …/httpHosts/1/test` pide al equipo que pruebe el envío.

4. **Habilite el envío de ANPR** en la detección y provoque una lectura.

**Formato exacto de lo que la API espera** (**VERIFICADO** el 18/09/2026 en su
forma; los nombres de elemento se cotejan en sitio, §4.2 de la guía previa):

```
POST /alarm-server/<secreto> HTTP/1.1
Content-Type: multipart/form-data; boundary=--MIME_boundary

----MIME_boundary
Content-Disposition: form-data; name="anpr.xml"; filename="anpr.xml"
Content-Type: application/xml

<EventNotificationAlert>
  <eventType>ANPR</eventType>
  <dateTime>2026-09-25T10:15:30-05:00</dateTime>
  <channelID>1</channelID>
  <ANPR>
    <licensePlate>ABC123</licensePlate>
    <confidenceLevel>92</confidenceLevel>
    <direction>forward</direction>
  </ANPR>
</EventNotificationAlert>
----MIME_boundary
Content-Disposition: form-data; name="licensePlatePicture.jpg"; filename="licensePlatePicture.jpg"
Content-Type: image/jpeg
… bytes …
----MIME_boundary
Content-Disposition: form-data; name="detectionPicture.jpg"; filename="detectionPicture.jpg"
Content-Type: image/jpeg
… bytes …
----MIME_boundary--
```

Respuesta de la API, **siempre** `200` con `Connection: close` y
`{"aceptado":true}`: cualquier otra cosa hace que la cámara reenvíe. Los
reenvíos y el reabastecimiento tras un corte se descartan por la clave de
idempotencia (RN-17). El equipo también admite JSON por parte
(`alarmHttpPushProtocol`, **DOCUMENTADO**); el receptor lee ambos.

## 4 · Relé y talanquera

`VALIDACION_HIKVISION_EN_SITIO.md` §5 y §8.5. Lo que añade la 15-E:

- **Toda orden pasa por el proveedor** (A1): `PUT /ISAPI/Parking/channels/<canal>/barrierGate`
  (**VERIFICADA**), resuelta contra el registro y decidida por capacidades. Las
  variables `BARRERA_*` siguen valiendo como **compatibilidad declarada**: si
  nombran un dispositivo, ese va por ellas y el arranque lo anuncia.
- **Latencia**: el guion mide el tramo API → relé (`KPI-13`, umbral 3 000 ms) y
  la hoja pide el extremo a extremo (lectura → relé) con cronómetro.
- **Bloqueo de acceso** (administración): mientras esté bloqueado, una placa
  autorizada **no abre**; se levanta con motivo.

## 5 · Terminal facial: enrolamiento, verificación remota y supresión

**Estado previo anotado** (`VALIDACION_HIKVISION_EN_SITIO.md` §8.3).

1. **Verificación remota.** La ficha del equipo (Dispositivos → Ficha) lee
   `GET /ISAPI/AccessControl/AcsCfg?format=json`. Si `remoteCheck` es `false`,
   la ficha lo marca como bloqueo y ofrece la **corrección explícita**
   «verificación remota», que escribe `PUT …/AcsCfg` con el mismo documento y
   sólo ese campo cambiado (**DOCUMENTADO**). No se cambia sin que alguien lo
   pida desde la consola.
2. **Cómo funciona una lectura** (A2, **PROBADO CONTRA MOCK**): la terminal
   reconoce, emite el evento con `remoteCheck` por el flujo de eventos al que
   la API está suscrita (§8), la API decide con el motor y **responde**
   `PUT /ISAPI/AccessControl/remoteCheck?format=json` con el veredicto; la
   terminal abre o no. El evento distingue `remoteCheck` (pregunta) de
   `remoteCheckResult` (eco del veredicto) para no registrar dos accesos.
3. **Enrolamiento por CU-02** (A3): desde la app del residente se captura el
   rostro del visitante (calidad validada antes de enviar), la API crea el
   consentimiento **a nombre del visitante** (RN-10) y devuelve un **enlace
   firmado** (`API_URL_PUBLICA/consentimiento/<token>`) que el residente le
   pasa al visitante. El visitante acepta o rechaza en su teléfono, sin sesión.
   El enlace es de **un solo uso** (deja de valer en cuanto el consentimiento
   cambia de estado) y la consola lo muestra también como **QR** (BE-01: el
   correo está bloqueado). La respuesta queda en `auditoria_seguridad` con la
   versión de la política, el momento, la IP y el agente del teléfono.
   Sólo tras aceptar se genera la plantilla y se sincroniza a **todas** las
   terminales con biblioteca (`FDLib`): alta de persona
   (`POST /ISAPI/AccessControl/UserInfo/Record`), carga de la plantilla
   (`PUT /ISAPI/Intelligent/FDLib/FDSetUp`) y **verificación por conteo**
   (`POST /ISAPI/Intelligent/FDLib/Count` antes y después): un `200` no basta.
4. **Supresión.** Al vencer (dentro de 24 h, RN-11) o **de inmediato al
   revocar** (CA-11): `PUT /ISAPI/Intelligent/FDLib/FDSearch/Delete` y baja de
   la persona, verificadas por conteo; si la plantilla sigue en la terminal, la
   API lo dice y la deja en la cola de retirada (la cola se **deriva**: no hay
   estado que alguien pueda olvidar).
5. **Seguimiento en la consola**: Biometría → seguimiento muestra por terminal
   si la plantilla está sincronizada, pendiente o retirada.

## 6 · Videoportero: llamada, audio y video

**Estado previo anotado** (`VALIDACION_HIKVISION_EN_SITIO.md` §8.4).

1. **Habilite el canal de audio** en el equipo (estaba deshabilitado,
   **VERIFICADO**). La API no lo habilita sola.
2. **Llamada** (A4): el equipo emite `CallInfo`/`VideoIntercomEvent` por el
   flujo de eventos; la API resuelve la vivienda por edificio y unidad y avisa
   a portería y guardia por SSE (tema `llamadas`) como **llamada, no acceso**.
3. **Audio** (A4): al conceder el turno, la API abre
   `PUT /ISAPI/System/TwoWayAudio/channels/<canal>/open`, mantiene **un** `PUT`
   persistente de subida (`…/audioData`) y un `GET` de bajada, en el formato
   que el equipo **anuncia** (G.711 µ-law, **VERIFICADO**). El navegador oye y
   habla por la API (`GET`/`POST …/guardia/intercom/<equipo>/audio`), nunca con
   el equipo; el canal es exclusivo (cola y timeout en el dominio). Contestar o
   colgar por `callSignal` se envía **sólo si el equipo declara** la capacidad;
   el del proyecto declara que no, y la ficha lo marca NO APLICA POR CAPACIDAD.
4. **Video** (A5, ADR-022): con `GO2RTC_URL` en la API y go2rtc en la misma
   máquina, la consola negocia WHEP contra
   `POST /copropiedades/<cop>/guardia/video/<equipo>/whep`; la API construye
   `rtsp://<usuario>:<clave>@<host>:554/Streaming/Channels/102` **sólo en
   `packages/providers`** (S-46), la registra en go2rtc y devuelve la respuesta
   SDP. La consola muestra **negociación** y **primer cuadro** en milisegundos
   (KPI-33 < 2 s). Configuración mínima de go2rtc:

   ```yaml
   api:
     listen: '127.0.0.1:1984' # sólo la API habla con él
   webrtc:
     listen: ':8555'
     candidates: ['<IP-de-la-máquina>:8555']
   ```

   Ningún equipo va en ese fichero. `PUENTE_VIDEO_URL` de la consola se queda
   vacío. Reproducir video no exige TLS; el micrófono sí.

5. **Reconocimiento facial en el videoportero**: el volcado del equipo del
   proyecto **no declara** biblioteca de rostros ni gestión de personas
   (`docs/insumos/hikvision/hik-videoportero-capabilities.xml`; sí declara
   `isSupportFaceContrast`, l. 64, que es detección, no biblioteca). Hasta que
   la ficha lo sondee en sitio es **NO APLICA POR CAPACIDAD**: T1–T5 se
   ejecutan en la terminal, no en el videoportero.
6. **Apertura de la puerta**: orden aparte por `/guardia/ordenes` con motivo,
   atribuida al operador (`PUT /ISAPI/AccessControl/RemoteControl/door/<canal>`,
   **DOCUMENTADO**). Nunca por el canal de audio.

## 7 · Registro de cada equipo en Next Control

`VALIDACION_HIKVISION_EN_SITIO.md` §9, íntegra. Resumen de lo que cambia con
la 15-E:

- «Probar conexión» descubre las **capacidades** y las persiste. La API decide
  por ellas, no por el modelo: un equipo sin `audioBidireccional = si` reparte
  turnos **sin** audio y lo dice; sin `bibliotecaDeRostros` no recibe
  plantillas; sin `reconocimientoDePlacas` no entra en la fuente de placas.
- Un equipo registrado antes de la 15-E tiene `bloqueoDeAcceso` en
  `desconocida` hasta que se vuelva a sondear (Ficha → sondear).
- Terminal y videoportero **activos** entran solos en las **escuchas** de la
  API (A4): al arrancar y cada 30 s la API comprueba qué equipos que emiten no
  tiene escuchados y los abre por el transporte que su capacidad indique. La
  bitácora lo anota. Con `PROVEEDOR_DE_EQUIPOS=simulado` no hay escuchas.

## 8 · Las rutas exactas entre los equipos y la API

### 8.1 · Del equipo hacia la API

| Equipo                 | Qué hace el equipo                                                                                    | Ruta en la API                                                           | Acreditación                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Cámara LPR             | `POST` multipart (o JSON) por cada lectura, y reenvía si no recibe `200`                              | `POST /alarm-server/<secreto>` (§3)                                      | Secreto largo en la ruta **y** IP de origen (`ALARM_SERVER_EQUIPOS`) |
| Terminal               | **Nada que configurar hacia la API.** Emite eventos por su flujo; la API se suscribe (§8.2)           | —                                                                        | La de la API contra el equipo (Digest, usuario de servicio)          |
| Videoportero           | **Nada que configurar hacia la API.** Emite llamada y eventos por su flujo; la API se suscribe (§8.2) | —                                                                        | Ídem                                                                 |
| Teléfono del visitante | Abre el enlace del consentimiento, acepta, rechaza o revoca                                           | `GET /consentimiento/<token>` · `POST …/respuesta` · `POST …/revocacion` | Token HMAC por copropiedad con caducidad; sin sesión                 |

### 8.2 · De la API hacia el equipo (por el proveedor, nunca desde el navegador)

| Propósito                                     | Ruta ISAPI                                                                                                    | Familia                        | Procedencia    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------- |
| Identidad y capacidades                       | `GET /ISAPI/System/deviceInfo` · `GET /ISAPI/System/capabilities`                                             | todas                          | documentada    |
| Quién controla la barrera                     | `GET /ISAPI/ITC/Entrance/entranceParam`                                                                       | cámara                         | guía oficial   |
| Accionar la barrera                           | `PUT /ISAPI/Parking/channels/{canal}/barrierGate`                                                             | cámara                         | **verificada** |
| Estado de la barrera                          | `GET …/barrierGate/barrierGateStatus`                                                                         | cámara                         | guía oficial   |
| Escuchar eventos (terminal, videoportero)     | `GET /ISAPI/Event/notification/alertStream` o `POST …/subscribeEvent` según capacidad                         | comunes                        | documentada    |
| ¿Espera el veredicto? / fijarlo               | `GET`/`PUT /ISAPI/AccessControl/AcsCfg?format=json`                                                           | terminal                       | documentada    |
| Responder la verificación remota              | `PUT /ISAPI/AccessControl/remoteCheck?format=json`                                                            | terminal                       | documentada    |
| Persona, plantilla, conteo, supresión         | `UserInfo/Record` · `FDLib/FDSetUp` · `FDLib/Count` · `FDLib/FDSearch/Delete` · `UserInfo/Delete`             | terminal                       | documentada    |
| Abrir la puerta                               | `PUT /ISAPI/AccessControl/RemoteControl/door/{canal}`                                                         | terminal, videoportero         | documentada    |
| Canal de audio: canales, abrir, audio, cerrar | `GET …/TwoWayAudio/channels` · `PUT …/{canal}/open` · `PUT`/`GET …/{canal}/audioData` · `PUT …/{canal}/close` | videoportero                   | documentada    |
| Contestar o colgar (sólo si lo declara)       | `PUT /ISAPI/VideoIntercom/callSignal?format=json`                                                             | videoportero                   | documentada    |
| Video (lo consume go2rtc, no la API)          | `rtsp://…:554/Streaming/Channels/102`                                                                         | cámara, terminal, videoportero | S-46           |

El catálogo completo, con lo que hay que confirmar en sitio de cada ruta, es
`packages/providers/src/equipo/catalogo-de-rutas.ts`, y el guion `--sin-accionar`
las sondea todas. **Una ruta desmentida se captura del equipo y se corrige en
el catálogo; no se prueba otra por parecido.**

### 8.3 · Del navegador y la app hacia la API

Sólo por la API, con sesión: órdenes (`POST …/guardia/ordenes`), canal de
intercom (`…/guardia/intercom/*`), audio (`…/intercom/<equipo>/audio`), video
(`…/guardia/video/<equipo>/whep`), captura del rostro del visitante (app),
seguimiento biométrico y sincronización total (consola). **Ninguna respuesta
de la API lleva la dirección, el usuario ni la clave de un equipo** (C-28), ni
una URL RTSP (ADR-022).

## 9 · Batería de aceptación en sitio: los 16 escenarios

El guion los escribe como plantilla:

```bash
pnpm --filter @ncr/providers build
node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --sin-accionar --hoja=./hoja.md
```

y `node scripts/lib/hoja-de-resultados.mjs` la imprime sin equipos. Cada fila
lleva **esperado · obtenido · motivo en consola · latencia · evento en
`/eventos` · evidencia · veredicto**; los pasos y criterios de cada escenario
van debajo de su tabla. Resumen:

> **Redefinidos en la ETAPA 15-I (26/09/2026, C-35).** L1–L5 y T1–T5 son ahora
> los que fijó el usuario —tercero en su día y su franja, fuera de franja, otro
> día, lista negra con autorización vigente— y **se ejecutan por dos canales**:
> la visita creada desde la app y desde la consola. Por eso la hoja tiene
> **26 filas escenario × canal para 16 escenarios**, más tres adicionales fuera
> de la cuenta (L6, L7, T6). La definición que manda es la de
> `scripts/lib/hoja-de-resultados.mjs`; el ensayo previo en SIMULADO, fila por
> fila, está en [`ENSAYO_PREVIO_EN_SITIO.md`](ENSAYO_PREVIO_EN_SITIO.md), y el
> orden de la visita, en
> [`VALIDACION_HIKVISION_EN_SITIO.md`](VALIDACION_HIKVISION_EN_SITIO.md) §V.

| #   | Escenario                                                   | Canales       | Criterio principal                        | Umbral                                      |
| --- | ----------------------------------------------------------- | ------------- | ----------------------------------------- | ------------------------------------------- |
| L1  | Tercero dentro de su día y su franja → abre                 | app · consola | CA-04, CA-05, KPI-13, D5 b, hito 2        | < 3 s lectura → relé                        |
| L2  | Placa desconocida → `PLACA_DESCONOCIDA`, no abre            | app · consola | CA-05, RN-01                              | < 3 s                                       |
| L3  | Día correcto, hora fuera de la franja → no abre             | app · consola | CA-05, CA-12, D5 b                        | < 3 s                                       |
| L4  | Hora correcta, día distinto → no abre                       | app · consola | CA-05, CA-12, D5 b                        | < 3 s                                       |
| L5  | Lista negra con autorización vigente → `LISTA_NEGRA`        | app · consola | CA-13, RN-06, RN-07, CA-18, HU-35         | alerta < 10 s                               |
| T1  | Rostro enrolado dentro de su día y su franja → abre         | app · consola | CU-02, RN-09, RN-10, CA-09, CA-26, hito 3 | sincronización < 60 s; reconocimiento < 3 s |
| T2  | Rostro no enrolado → no abre, sin dato biométrico           | app · consola | CA-07, RN-02                              | —                                           |
| T3  | Día correcto, hora fuera de la franja → no abre             | app · consola | CA-12, CA-26, RN-01                       | < 3 s                                       |
| T4  | Hora correcta, día distinto → no abre                       | app · consola | CA-12, RN-01, RN-11                       | < 3 s                                       |
| T5  | Lista negra con autorización vigente → `LISTA_NEGRA`        | app · consola | CA-13, RN-06, RN-07, HU-35                | < 3 s                                       |
| V1  | Llamada → aviso emergente con la vivienda                   | consola       | CU-03, HU-25                              | aviso < 10 s                                |
| V2  | Audio bidireccional exclusivo                               | consola       | ADR-01, CA-19, KPI-33                     | < 2 s extremo a extremo                     |
| V3  | Video por WHEP a través de la API                           | consola       | KPI-33, RN-12, RN-21                      | primer cuadro < 2 s                         |
| V4  | Apertura remota con motivo                                  | consola       | CA-20, RN-08, KPI-32                      | orden → relé < 3 s                          |
| V5  | Negación con motivo y aviso al residente                    | consola       | CA-17, HU-28                              | —                                           |
| V6  | Operador en otra copropiedad, escalamiento y emergencia     | consola       | KPI-35, HU-29, CA-18                      | escalamiento < 10 s                         |
| L6  | _Adicional_ · vehículo propio de residente a cualquier hora | app           | D5 a, RN-04, ADR-026                      | < 3 s                                       |
| L7  | _Adicional_ · baja confianza → apertura manual con motivo   | consola       | CU-01 3a, CA-16, CA-17, KPI-32            | orden → relé < 3 s                          |
| T6  | _Adicional_ · revocación → supresión inmediata              | app · consola | RN-11, CA-10, CA-11, KPI-20               | retirada < 60 s                             |

**Sin identificador de evento no hay PASA** (RN-02), salvo V1: un timbre no
deja evento de acceso. La ETAPA 15 se cierra con las 26 filas en PASA, o con
cada FALLA convertida en un defecto con dueño y una nueva hoja. La hoja rellenada se adjunta al informe de cierre **con host y usuario
elididos**.

## 10 · Diagnóstico de fallos frecuentes

| Síntoma                                                      | Causa probable                                                 | Qué hacer                                                                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `credenciales` en el guion o en «Probar conexión»            | Digest rechazado                                               | **No insista**: el equipo bloquea la cuenta. Confirme el usuario de servicio en el panel del equipo                           |
| La cámara publica y la API responde `200` pero no hay evento | Secreto u origen no declarados (`ALARM_SERVER_EQUIPOS`)        | El receptor responde `200` siempre y registra «origen no declarado» en bitácora; corrija la declaración                       |
| Dos eventos por una lectura                                  | La cámara reenvió porque no recibió `200` a tiempo             | Compruebe la latencia de la API y el `Connection: close`; el segundo se descarta por idempotencia, mire la bitácora           |
| Lectura correcta y motivo `CONFIANZA_INSUFICIENTE`           | Confianza bajo el umbral (P-02: 80 en la escala del evento)    | Es el diseño (CU-01 3a): decide el portero con motivo. Si todas las lecturas caen, revise encuadre e iluminación              |
| La talanquera no responde                                    | Bloqueo de acceso vigente, relé sin responder o `ctrlMode ≠ 1` | Bloqueos en `/guardia/bloqueo`; historial de órdenes con su desenlace; ficha de la cámara                                     |
| La terminal reconoce y **abre sola**                         | `remoteCheck = false`                                          | Ficha → corrección «verificación remota». Hasta entonces es hallazgo de bloqueo                                               |
| La terminal reconoce y **no abre nunca**                     | La API no está suscrita (no hay escucha) o no respondió        | Bitácora: «escucha abierta» para ese equipo; `PROVEEDOR_DE_EQUIPOS` no puede ser `simulado`; equipo `activo` y con capacidad  |
| Plantilla «sincronizada» y la terminal no reconoce           | El conteo no subió (la API lo habría dicho) o la calidad       | Biometría → seguimiento por terminal; sincronización total; conteo `FDLib/Count` en la ficha                                  |
| Revocado y la terminal sigue reconociendo                    | Retirada pendiente                                             | `porRetirar` en el seguimiento; el trabajo de retirada reintenta; si persiste, suprima desde la terminal y anótelo como FALLA |
| «tienes la palabra y no hay audio»                           | Canal de audio deshabilitado o capacidad `no`/`desconocida`    | Habilite el canal en el equipo (§6.1) y vuelva a sondear la ficha                                                             |
| Audio con ruido                                              | Formato distinto del anunciado                                 | La consola decodifica lo que el equipo declara (`X-Formato-De-Audio`); compare con el códec del panel                         |
| Canal ocupado                                                | Exclusividad                                                   | Es el diseño: cola con puesto y liberación por timeout; un segundo operador espera                                            |
| Video: «Vista en vivo no desplegada»                         | Falta `GO2RTC_URL`                                             | Configúrelo en la API y reinicie; el arranque anuncia el puente                                                               |
| Video: «El puente de video no responde» (502)                | go2rtc caído, RTSP incorrecto (S-46) o clave rotada            | Pruebe `rtsp://…/Streaming/Channels/101` en el proveedor si el secundario no existe; el `PUT` reemplaza la fuente (S-47)      |
| Video negocia y no llega cuadro                              | ICE: el navegador no alcanza `webrtc.listen`                   | `candidates` con la IP correcta; puerto 8555 abierto; misma red                                                               |
| Reloj desincronizado                                         | Eventos con hora futura o pasada                               | NTP en los equipos; la ficha lo señala; las vigencias se evalúan con el reloj de la API                                       |

## 11 · Vuelta al simulado sin parar y puesta en marcha por fases

**Rollback a `MockProvider`**: `PROVEEDOR_DE_EQUIPOS=simulado` en la API y
reinicio del proceso (segundos; la consola no cambia). Las escuchas se
detienen, ninguna orden mueve un relé, el video responde 409 (el simulado no
tiene origen) y el arranque lo anuncia con su consecuencia. Los datos —padrón,
autorizaciones, eventos— no se tocan.

**Por fases:**

1. **Sin accionar**: guion `--sin-accionar`, fichas sin bloqueos, cámara
   publicando y eventos en `/eventos` con motivo. Nadie abre nada.
2. **Barrera**: L1–L5 por los dos canales, y L6 y L7, con vehículos de prueba
   y alguien delante de la talanquera.
3. **Terminal**: T1–T5 por los dos canales con un visitante de prueba que
   acepta, y T6 cuando revoca.
4. **Videoportero**: V1–V6 con dos operadores.
5. **Operación**: `ALARM_SERVER_EQUIPOS` con la cámara definitiva, VLAN de
   equipos (H-15-1), TLS para la consola (micrófono), hoja de resultados
   adjunta al informe de cierre de la ETAPA 15.
