# RONDA 15-S2 · Video de la cámara y audio bidireccional real

**Rama:** `etapa-15s2-video-y-audio-duplex` · **Base:** `develop` (`2694422`, merge del PR #53, que ya traía el #52) ·
**PR:** hacia `develop`, sin fusionar · **Fecha:** 2026-10-08 ·
**Encargo:** RONDA 15-S2, bloques A (video), B (audio), D (documentación y cierre); C, sólo si sobraba tiempo ·
**Abre:** H-15S2-01 a H-15S2-10 · DT-15S2-01 a DT-15S2-11 · S-15S2-01 a S-15S2-04 · **E-09**

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Fuera de los adaptadores (`packages/providers`, infraestructura y
> presentación de la API) sólo cambian la **aplicación de la guardia** y la
> **consola**, que el cliente autorizó para el dúplex (E-09). **El dominio
> (`packages/domain-core`) no cambia.** No hay migración.

**Lo incómodo primero.**

1. **Nada de esto se ha ejercido contra los equipos.** Video y audio están
   probados contra go2rtc y ffmpeg **reales** y contra los simulados en red. Las
   cifras de latencia son de banco, no del Mac de la visita. **KPI-33 sigue sin
   cifra de sitio.**
2. **La negación de H.265 de la 15-S1 era una regresión** (H-15S2-01). La
   corrección C.2 negaba el canal H.265 ANTES del puente, también a Safari, que
   sí lo reproduce. Medido con go2rtc v1.9.14: con la oferta de Safari el
   puente negocia directo (201, 115 ms).
3. **En Chrome, el H.265 sólo se ve transcodificado, y eso cuesta tiempo.** En el
   banco, el primer cuadro llegó a **1,4–2,5 s** de pedirlo, frente a los 2 s de
   KPI-33. **En sitio, Safari es la vía que cumple.**
4. **No sé por qué la terminal no oía al operador.** Las evidencias que pedía el
   encargo (`extracto-0710.log`, las páginas de TwoWayAudio y de la
   DS-K1T344MBFWX-E1) **no están en el repositorio ni en el entorno**. Lo
   construido no adivina la causa: deja que **una corrida de
   `pnpm sitio:audio`** la diga:
   - `sessionId` usado o rechazado;
   - formato del canal;
   - bytes y nivel de cada sentido;
   - dúplex o semidúplex;
   - si se oyó el tono.
5. **El operador que no oía al equipo mientras hablaba: no era la consola ni la
   API.** Ninguna detenía la bajada al hablar; lo comprobé en el código. Si el
   equipo calla mientras recibe, es semidúplex. Ahora se **mide** y la consola
   muestra el turno.
6. **B4 (pasar la terminal a G.711) se confirma en el guion de sitio, no en la
   ficha de la consola** como pedía el encargo (DT-15S2-04). Exige respaldo
   escrito, «s» explícita y relectura.
7. **C no se hizo.** No dio el tiempo: QR en el ensayo y descubrimiento ONVIF
   (DT-15S2-09).
8. **La primera corrida del verificador dio FALLIDA** (H-15S2-07), por tres
   defectos míos que las pruebas unitarias no veían:

   - la capa de aplicación importaba valor del paquete de proveedores (frontera A);
   - `sitio-audio.mjs` nombraba la ruta TwoWayAudio (KPI-11);
   - la prueba de semidúplex del diagnóstico falló una de tres corridas bajo carga.

   Se corrigieron los tres. **Hicieron falta cuatro corridas FALLIDAS más
   antes de la verde** (§6):

   - la segunda y la cuarta, sólo por la sonda D-100 del banco de pruebas
     negativas, que fallaba sin decir por qué. Mi primera hipótesis —el plazo—
     **era falsa**. La causa (H-15S2-09) es que `metricas.mjs` terminaba con
     `process.exit(1)`, y eso tira la salida que Node tiene en cola cuando
     quien la lee se retrasa. Era un defecto del verificador desde antes de
     esta ronda: ya había fallado así en la 15-K;
   - la tercera, en la estabilidad: en una de tres pasadas un fichero de la API
     no llegó a ejecutarse, y el paso no dice cuál (DT-15S2-10). No se
     reprodujo en tres corridas forzadas;
   - durante la tercera y la cuarta, un vitest huérfano que lancé yo horas
     antes ocupaba un núcleo entero (H-15S2-10).

---

## 1 · Qué se construyó

**Video (A).**

- La decisión de por dónde se sirve el video es una **función pura**:
  `decidirViaDeVideo` en el núcleo de proveedores. Recibe el códec del equipo,
  los códecs de la oferta del navegador y si hay transcodificación, y devuelve
  directo, transcodificado o no reproducible con su motivo.
- La usan la API y el paso 7 del ensayo, con la misma regla.
- El proveedor ya no niega nada. Entrega el códec que el equipo **declara** para
  el canal o, si no lo declara, el de su última respuesta RTSP en ese canal (D2).
- Sin H.265 en la oferta (Chrome), el puente registra `<flujo>-h264` con la
  fuente `ffmpeg:<flujo>#video=h264`. Esa fuente **referencia el flujo por su
  nombre**, así que la clave del equipo no llega a los argumentos de ffmpeg
  (comprobado con `ps`).
- `VIDEO_TRANSCODIFICAR` vale `auto` o `nunca`, con `auto` por omisión.
- `pnpm sitio:video` enciende el RTSP interno de go2rtc **sólo en
  `127.0.0.1:8554`**.
- `pnpm sitio:video -- --preparar` falla sin ffmpeg y dice `brew install ffmpeg`.
- Sin vía posible, la API contesta «no reproducible» con **los tres remedios**:
  Safari, ffmpeg, o H.264 en el equipo con autorización del cliente.
- El paso 7 del ensayo dice:
  - la vía;
  - la SDP;
  - el **primer cuadro desde que se pide**;
  - y la vía de Safari.

**Audio (B).**

- **El `sessionId` que da `open` se usa.** Viaja en `audioData` (subida y
  bajada) y en `close`, en los dos adaptadores. Si el equipo rechaza la
  petición con él, se repite sin él.
- **Una línea por sesión en la bitácora:** bytes y primer byte de cada sentido,
  estados HTTP, uso del `sessionId` y formato. Nunca audio ni clave.
- **`pnpm sitio:audio`** lo mide todo en sitio con el adaptador de producción.
- **En la consola** hay «Manos libres» además de «Mantener para hablar», con los
  medidores de lo que se recibe y de lo que se envía.
- **La API mide el semidúplex** y lo avisa a la consola, que muestra el turno.
- **La terminal** entra en el respaldo con su canal de audio, y puede pasarse a
  G.711 con autorización.

## 2 · Cómo se organizó y por qué

### Video

- **La decisión, pura y en un solo sitio.** La pregunta «¿se ve?» depende de
  tres datos, y dos de ellos viven en capas distintas:

  - el códec, en el proveedor;
  - la oferta, en la API.

  Se llevó el códec en el `OrigenDeVideo` (campo opcional) y se decidió en la
  API. La alternativa era intentar directo y caer a transcodificado si fallaba:
  daba la misma imagen, pero sin una regla que el ensayo pudiera repetir.

- **La regla entra por puerto.** La aplicación declara `ReglaDeVideo` y la
  infraestructura entrega la del núcleo de proveedores (`regla-de-video.ts`).
  Así hay una sola regla para la API y el ensayo, y la aplicación no importa
  valor del paquete de proveedores (frontera A). La primera versión lo
  importaba y el verificador lo rechazó (H-15S2-07).
- **El puente declara si transcodifica.** `asegurarTranscodificado` es opcional
  en el puerto. Un puente sin él no transcodifica. El del Edge contesta `null`
  para los flujos que sirve el Edge: su go2rtc no transcodifica (DT-15S2-02), y
  la API se lo dice al operador con el motivo correcto.
- **La credencial, fuera de ffmpeg.** Se descartaron dos opciones:

  - darle a ffmpeg la URL RTSP del equipo: la dejaría en `ps`;
  - montar un segundo go2rtc.

  La fuente `ffmpeg:<nombre>` lee del RTSP interno de go2rtc. Eso exige
  encenderlo, y go2rtc deja entrar sin credencial desde el propio Mac
  (H-15S2-02). Por eso escucha sólo en `127.0.0.1`.

- **El primer cuadro, no la SDP** (H-15S2-03). Con una entrada rápida de ffmpeg,
  la SDP transcodificada llegó en 245 ms y el primer cuadro a los 2,5 s. Medir
  sólo la SDP habría dado KPI-33 por cumplido.
- **Las pruebas con binario real se omiten con nombre** sin `GO2RTC_BIN` o sin
  ffmpeg. Con `--con-base`, una omisión es FALLO (D-112). Por eso:
  - el CI de macOS instala ffmpeg;
  - el verificador lo nombra.

### Audio

- **`sessionId` con caída a «sin él».** No hay documento que diga si estos
  firmwares lo exigen (S-15S2-02). Mandarlo y, si el equipo lo rechaza, repetir
  sin él cubre los dos casos sin tocar código en sitio.
- **El estado se toma al enviar, no al responder.** La primera versión lo tomaba
  al responder, y había una carrera: la respuesta de la subida apagaba el
  `sessionId` antes de que llegara la de la bajada, y la bajada no se repetía
  (H-15S2-04). La prueba con el equipo que lo rechaza lo cazó.
- **El semidúplex se mide, no se declara.** Ningún campo documentado lo dice.
  La misma regla (`juzgarDuplex`) mide en `pnpm sitio:audio` y en la
  conversación: bajada mientras se habla frente a bajada callado. El medidor
  vive en el paquete de proveedores, junto a la regla, y la conversación lo
  recibe por su puerto `MedidorDeDuplex`, que pone la presentación.
- **Lo que está en vuelo no cuenta.** Al empezar el tono llega todavía bajada
  que ya venía en camino. El diagnóstico descuenta los primeros 300 ms; sin
  eso, un semidúplex salía «indeterminado» bajo carga (la corrida roja del
  verificador, reproducida sin carga en una prueba).
- **Manos libres sin turno eterno (E-09).**
  - El silencio no renueva el turno.
  - La voz sí: la consola manda «voz» como mucho una vez por segundo cuando el
    nivel del micrófono pasa el umbral.
  - La caducidad de 90 s sigue.
  - El tope de 60 s (S-177) parte el registro en tramos en vez de cortar.
- **B4, en el guion y con respaldo.** El canal de la terminal entra en
  `--capturar`, y `--pasar-a-g711` se niega sin `--respaldo`. Escribe el
  documento entero con sólo el formato cambiado y lo relee. Se revierte con
  `pnpm sitio:ensayo -- --restaurar`. No se llegó a la ficha de la consola
  (DT-15S2-04).

### El verificador (H-15S2-09)

- **`process.exitCode`, no `process.exit` vaciando antes la salida.** Hay otras
  dos formas:

  - escribir de forma síncrona con `writeSync(1, …)`: choca con el descriptor
    no bloqueante que deja `console.log` y puede lanzar `EAGAIN`;
  - vaciar la salida y salir en la devolución de llamada: obliga a cortar el
    flujo del guion a mano.

  `exitCode` es lo que Node recomienda, y en `metricas.mjs` las salidas ya
  eran lo último del guion: bastó encadenarlas con `else if` para conservar
  «sólo el primer fallo».

- **Una sonda determinista, no una repetición.** Esperar a que el fallo
  saliera solo costó dos corridas de 50 min. El lector lento lo provoca
  siempre, en el mismo byte.
- **Se corrigió el sitio demostrado, no la clase entera.** Hay ~120
  `process.exit` en los guiones, y la mayoría escribe dos líneas. Auditarlos
  queda como DT-15S2-11.

## 3 · Árbol de archivos

```
packages/providers/src/
├─ nucleo/via-de-video.ts               A2 · la decisión directo | transcodificado | no reproducible
├─ nucleo/video.ts                      OrigenDeVideo: + codec y canal (opcionales)
├─ nucleo/errores.ts · motivo-legible.ts los tres remedios; pasosParaH264
├─ hikvision/hikvision-provider.ts      ya no niega H.265; entrega el códec; formato al intercom (B5)
├─ diagnostico/ficha.ts · equipo/diagnostico-de-video.ts  textos con la regla nueva
├─ ensayo/paso-de-video-webrtc.ts       paso 7 con la misma regla, primer cuadro y vía de Safari
├─ ensayo/negociacion-de-ensayo.ts      las llamadas del paso 7 y el primer cuadro (stream.mp4)
├─ ensayo/oferta-sdp-de-sonda.ts        + la oferta con H.265 (forma de Safari)
├─ ensayo/pasos-de-lectura.ts           la sonda RTSP ya no falla por H.265
├─ ensayo/diagnostico-de-audio.ts       B1/B6 · canal, nivel, dúplex, diagnóstico
├─ ensayo/canal-a-g711.ts               B4 · a G.711 con autorización y relectura
├─ ensayo/respaldo-de-configuracion.ts  el canal de audio de la terminal, en el respaldo
├─ equipo/catalogo-de-rutas.ts          la terminal: «configurar un canal de audio»
├─ videoportero/sesion-de-audio.ts      B2/B5 · sessionId y lo que pasó en la sesión
├─ videoportero/medidor-de-duplex.ts    B3 · el semidúplex medido segundo a segundo
├─ videoportero/intercom-equipo.ts · intercom-isapi-persistente.ts  sessionId y conteo
└─ simulacion/videoportero-de-audio.ts · go2rtc-de-pruebas.ts  sessionId, semidúplex, RTSP interno, ffmpeg
apps/api/src/guardia/
├─ aplicacion/vista-en-vivo.ts          la vía antes del puente; derivado transcodificado
├─ aplicacion/puertos.ts                asegurarTranscodificado? · PoliticaDeTranscodificacion · ReglaDeVideo · MedidorDeDuplex
├─ aplicacion/causas-de-video.ts        sin ffmpeg, RTSP interno apagado, «codecs not matched»
├─ aplicacion/conversacion-de-audio.ts  manos libres, «voz», tramos, aviso de semidúplex (E-09)
├─ infraestructura/regla-de-video.ts    la regla del núcleo de proveedores, para la aplicación
├─ infraestructura/puente-go2rtc.ts     el flujo -h264 que referencia el original
├─ infraestructura/puente-de-video-por-el-edge.ts  null para los flujos del Edge; la política
└─ presentacion/audio/puerta-de-audio.ts  el mensaje «semiduplex» y el medidor
apps/api/src/configuracion/esquema.ts · apps/api/.env.example   VIDEO_TRANSCODIFICAR
apps/web/src/lib/audio/canal-por-websocket.ts  manos libres, niveles, «voz», «semiduplex»
apps/web/src/componentes/controles-de-audio-ws.tsx  botón, medidores, turno
scripts/sitio-video.mjs · lib/transcodificacion-del-puente.mjs   RTSP interno y ffmpeg
scripts/sitio-audio.mjs                 B6 · pnpm sitio:audio
scripts/sitio-ensayo.mjs                la política de transcodificación al paso 7
scripts/verificar-etapa.sh · .github/workflows/verificacion.yml  ffmpeg en el verificador y el CI
scripts/lib/metricas.mjs               H-15S2-09 · termina con exitCode: no tira su salida
scripts/lib/lector-lento.mjs           un lector que se retrasa a propósito (socket de UNIX en pausa)
scripts/lib/pruebas-negativas.mjs · ramas-de-los-controles.json  sonda 22 con el lector lento
docs/guias/ENTREGA_EN_SITIO.md · VALIDACION_HIKVISION_EN_SITIO.md · docs/auditoria/contradicciones-y-supuestos.md
```

Las pruebas nuevas: `via-de-video.test.ts`, `paso-de-video-webrtc-via.test.ts`,
`paso-de-video-webrtc.go2rtc.test.ts`, `vista-en-vivo-via.test.ts` (en
infraestructura: usa la regla real), `medidor-de-duplex.test.ts`,
`diagnostico-de-audio-arranque.test.ts`,
`puente-transcodificado.test.ts`, `puente-go2rtc-transcodificado.real.test.ts`,
`sitio-video-transcodificacion.test.ts`, `sesion-de-audio.test.ts`,
`sesion-de-audio-http.test.ts`, `diagnostico-de-audio.test.ts`,
`canal-a-g711.test.ts`, `conversacion-manos-libres.test.ts`,
`canal-manos-libres.test.ts` y `controles-de-audio-manos-libres.test.tsx`.

## 4 · Tabla SOLID

| Archivo                                      | S                       | O                                           | L                                                            | I                                     | D                                                        |
| -------------------------------------------- | ----------------------- | ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------- | -------------------------------------------------------- |
| `nucleo/via-de-video.ts`                     | Sólo decide la vía      | Un códec nuevo es una fila de `CODECS_SDP`  | —                                                            | Tres funciones pequeñas               | Sin I/O: la usan la API y el ensayo                      |
| `aplicacion/vista-en-vivo.ts`                | Orquesta la negociación | La vía es la regla, no un `if` de navegador | Cualquier `PuenteDeVideo` (con o sin transcodificar)         | `asegurarTranscodificado` opcional    | Depende de sus puertos (`PuenteDeVideo`, `ReglaDeVideo`) |
| `videoportero/medidor-de-duplex.ts`          | Sólo mide               | —                                           | Cumple el puerto `MedidorDeDuplex` de la aplicación          | Tres métodos                          | La conversación lo recibe por puerto; no lo construye    |
| `videoportero/sesion-de-audio.ts`            | El estado de una sesión | —                                           | La comparten los dos adaptadores                             | `ruta`, `anotar`, `contar`, `resumen` | La bitácora entra por parámetro                          |
| `ensayo/diagnostico-de-audio.ts`             | Medir un canal          | —                                           | Cualquier `AudioDiagnosticable` (el de producción, el falso) | Interfaz mínima de lo que usa         | No crea su adaptador: se lo dan                          |
| `ensayo/canal-a-g711.ts`                     | Un cambio guardado      | —                                           | —                                                            | `Pick<ClienteDeEquipo,'pedir'>`       | La confirmación entra por parámetro                      |
| `infraestructura/puente-go2rtc.ts`           | La API de go2rtc        | Cumple el puerto                            | Sustituible por el del Edge                                  | Cuatro métodos                        | Implementa el puerto de aplicación                       |
| `lib/audio/canal-por-websocket.ts` (consola) | El canal del navegador  | —                                           | —                                                            | 4 métodos públicos                    | Socket, contexto, micrófono y reloj inyectables          |

**Lo que no cumple, dicho (DT-15S2-06):**

- `IntercomDeEquipo` tiene 7 miembros públicos.
- Siguen por encima de 300 líneas, y alguno crece un poco:
  - `intercom-equipo.ts` (425 → 459);
  - `hikvision-provider.ts` (1057 → 1052);
  - `ficha.ts` (653 → 656);
  - `errores.ts` (311 → 315);
  - `esquema.ts` de la API.

## 5 · Trazabilidad

| Requisito                                               | Cómo queda                                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **KPI-33 / CA-19** (audio y video < 2 s)                | **Parcial.** Video directo (Safari) ≈ 0,2 s en el banco; transcodificado 1,4–2,5 s en el banco. Audio: sin cifra de sitio. Se mide en sitio con los pasos de abajo |
| **ADR-01** (TwoWayAudio, semidúplex con turno)          | Cumplido en consola y API: el turno se muestra cuando el equipo resulta semidúplex (medido)                                                                        |
| **RN-12 / RN-21** (credencial nunca fuera del servidor) | La fuente transcodificada no lleva la credencial y ffmpeg tampoco (`ps`); el informe de `sitio:audio` tampoco                                                      |
| **Ley 1581** (voz = dato personal)                      | Ni el diagnóstico ni la bitácora guardan audio: cuentan bytes y miden nivel                                                                                        |
| **OE-07** (guardia virtual)                             | Manos libres y dúplex medido (E-09)                                                                                                                                |
| **KPI-12** (la suite con el simulado)                   | Pasa; las aserciones de la suite de `MockProvider` no cambian                                                                                                      |

## 6 · Pruebas

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Sobre `1cd6f80`, desde cero (sin `dist/`, `.turbo/` ni `coverage/`,
instalación con `--frozen-lockfile`), con la base `ncr` reconstruida de 0001 a
0057 por `./supabase/verificar.sh --con-pruebas --modo-supabase` justo antes,
en 45 min 23 s:

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El control declarado y no ejercido es el de **D-112**: las cinco pruebas del
arranque en frío que el paso 5 salta porque necesitan los claims que escribe el
paso 12b, que es quien las ejecuta.

**Es la quinta corrida.** Las cuatro anteriores dieron FALLIDA, y ninguna se
cuenta como verde:

| #   | Sobre     | Qué falló                                                                                 | Qué se hizo                                                                          |
| --- | --------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | `ed41895` | Frontera A, KPI-11 y la prueba de semidúplex del diagnóstico (H-15S2-07)                  | Corregidos en `cd791c0`, con sus sondas en rojo                                      |
| 2   | `cd791c0` | Sólo la sonda D-100 («dijo: nada»)                                                        | Plazo propio y el porqué en la línea ✗ (`cc71d1e`, H-15S2-08)                        |
| 3   | `cc71d1e` | Estabilidad: un fichero de la API sin ejecutar en 1 de 3 pasadas, sin nombre (DT-15S2-10) | Fuentes H.265 de prueba más ligeras (`187b9da`)                                      |
| 4   | `187b9da` | Otra vez la sonda D-100: código 1, sin señal, salida cortada a mitad de la lista          | Causa hallada y corregida (`1cd6f80`, H-15S2-09); vitest huérfano muerto (H-15S2-10) |

**Pasos y recuentos de la quinta.** 31 de 31 pasos, sin ningún ✗.

- **Paso 5, TypeScript.** Ninguna omisión por falta de base: 46 ficheros usan la
  base, todos con su guardián. go2rtc v1.9.14 real y ffmpeg presentes, así que
  las pruebas del puente transcodificado **corrieron**, no se saltaron.

  | Paquete            | Pruebas en verde                    | Frente a la 15-X |
  | ------------------ | ----------------------------------- | ---------------- |
  | `@ncr/api`         | **2551**, más 5 saltadas declaradas | +41              |
  | `@ncr/providers`   | 1310 (con el go2rtc real)           | +62              |
  | `@ncr/web`         | 824                                 | +18              |
  | `@ncr/domain-core` | 483                                 | 0                |
  | `@ncr/edge`        | 331                                 | 0                |
  | `@ncr/config`      | 144                                 | 0                |

- **Total de TypeScript: 5648 pruebas.** Coinciden por los dos caminos (paso
  7b) y salen iguales tres veces seguidas sin caché (paso 14: la API, 2556 de
  2556 las tres).
- **Dart:** 508 (paso 5c), también en otro huso horario. La app no cambia.
- **Ficheros de prueba:** 562 de 562 recogidos.
- **Cobertura por capa (paso 7):**

  | Capa       | Líneas  | Ramas   | Umbral |
  | ---------- | ------- | ------- | ------ |
  | dominio    | 96,41 % | 96,54 % | 90 %   |
  | aplicación | 97,81 % | 91,71 % | 90 %   |
  | global     | 88,59 % | 87,69 % | 70 %   |

- **Paso 9:** los 35 controles detectan su violación, entre ellos la sonda 22
  con el lector lento. Trinquete de ramas: 44 controles, 257 bloques sin
  ejercer, uno bajó.
- **Paso 10:** fronteras, KPI-11 y frontera A en verde: 362 ficheros de dominio
  y aplicación sin un valor de `@ncr/providers`. Secretos limpios: 7772 blobs
  del historial.
- **Paso 10b:** el contrato y el cliente generado, al día. Esta ronda no cambia
  ningún DTO.
- **Paso 11, KPI-25:** p95 de 25 ms.
- **Pasos 12e y 12f:** el guion de sitio y `pnpm sitio:ensayo` contra los
  simulados. El ensayo da 47 OK, 0 FALLO, y el paso 7 ya con la regla nueva.
- **Pasos 13b y 13c:** el recorrido de la consola contra la API real.

**Cómo ejecutarlas.** `pnpm test` para la suite. Las pruebas del puente
transcodificado necesitan go2rtc (`GO2RTC_BIN`) y ffmpeg en el `PATH`; sin
ffmpeg se saltan declarando el motivo. `./scripts/verificar-etapa.sh
--con-base` para todo, con la base reconstruida antes (H-15S2-06).

**Aserciones existentes cambiadas a propósito.** Todas afirmaban la regla vieja
o una ruta que ahora lleva `?sessionId=`, y se dice cuál era:

- `canal-de-video-en-sitio.test.ts`: «C.2 se niega antes del puente» pasa a «A2,
  el origen lleva el códec».
- `video-y-codec-15l.test.ts`, dos aserciones: el proveedor y el texto de la
  ficha.
- `errores-neutrales.test.ts`: el mensaje, ahora con los tres remedios.
- `ensayo-enganosas.test.ts`: el H.265 de la sonda ya no falla por sí.
- `paso-de-video-webrtc.test.ts`: llega el `GET` del primer cuadro.
- `sitio-video.test.ts`: el RTSP interno en `127.0.0.1:8554`, y ffmpeg en el
  `PATH` de `--preparar`.
- `puente-de-video-por-el-edge.test.ts`: el falso devuelve `via`.
- `intercom-isapi-persistente.test.ts`: la ruta con `?sessionId=`.
- `catalogo-de-rutas.test.ts`: 6 rutas de audio en la terminal.
- `respaldo-y-juicios.test.ts`: el respaldo de la terminal trae su canal.

Ninguna es de la suite de `MockProvider` (KPI-12).

**Sondas de mutación: 47, las 47 en rojo**, más la de H-15S2-09 (§8): el `metricas.mjs` anterior en el banco completo, en rojo.

- **A-01 a A-26 (video).**
  - La **A-25** —«el paso 7 mide sólo tras la SDP»— salió **verde** la primera
    vez. Se añadió la prueba «1,5 s de SDP y 0,6 s de cuadro ya pasan de 2 s» y
    salió roja.
  - Tras mover la regla a un puerto se repitieron A-09 a A-13, con las pruebas
    en su sitio nuevo, y se añadió la **A-26**: la fábrica de la API sin la
    regla.
- **B-01 a B-21 (audio).**
  - La **B-10** salió **verde** como estaba escrita: cambiaba la familia y no la
    presencia. La B-10b, que retira la entrada, salió roja.
  - La **B-21** —«el diagnóstico cuenta el arranque del tono»— salió **verde**
    hasta que se escribió la prueba determinista del equipo que calla tarde.
  - B-11 a B-13 se repitieron con el medidor por puerto, y se añadieron B-18 a
    B-20.

**Banco de A1/A5** (go2rtc v1.9.14 con fuente H.265 y credencial, en este
entorno):

| Oferta | Flujo                       | Resultado                         | SDP        | Primer cuadro                                               |
| ------ | --------------------------- | --------------------------------- | ---------- | ----------------------------------------------------------- |
| Chrome | H.265 directo               | **500 · codecs not matched**      | —          | —                                                           |
| Safari | H.265 directo               | 201, H265 en la respuesta         | 106–139 ms | 68–245 ms (MP4)                                             |
| Chrome | transcodificado (`ffmpeg:`) | 201, H264                         | 1,4–1,8 s  | 1,9–2,6 s (MP4, sin WebRTC previo); 1,4–1,5 s con el paso 7 |
| Chrome | sin ffmpeg                  | 500 · `fork/exec …: no such file` | —          | —                                                           |
| Chrome | RTSP interno apagado        | 500 · `rtsp module disabled`      | —          | —                                                           |

La clave del equipo aparece **0 veces** en `ps -eo args`. Con usuario y clave
en el RTSP interno de go2rtc, **ffprobe sin credencial desde 127.0.0.1 leyó el
flujo**: es H-15S2-02.

## 7 · Verificación de seguridad (§2.7)

- **Secretos.**
  - La credencial del equipo no aparece en la fuente transcodificada, ni en los
    argumentos de ffmpeg, ni en las respuestas.
  - `sitio:audio` tacha claves, usuarios, llaves, tokens y hosts del `.env`, y
    las IP del registro.
  - Los informes van fuera del repositorio, a `0600`.
- **Red.** El RTSP interno de go2rtc escucha **sólo en `127.0.0.1`**.
  - **Riesgo residual (H-15S2-02):** un proceso del propio Mac puede leer el
    flujo mientras está registrado, sin credencial.
  - Se acepta porque el Mac de sitio es el puesto del operador. En un despliegue
    con usuarios no confiables, `VIDEO_TRANSCODIFICAR=nunca`.
- **Validación.** `VIDEO_TRANSCODIFICAR` va en Zod y en el guion: un valor
  inválido no arranca. El `sessionId` sólo se admite con
  `[A-Za-z0-9._-]{1,64}` y se codifica en la URL.
- **Abuso.**
  - «voz» cuenta en el tope de textos por segundo, que ya existía.
  - Manos libres no deja el turno eterno: el silencio no renueva.
- **Datos personales (Ley 1581).** No se guarda audio en ningún sitio.
- **Escrituras en el equipo.** B4 sólo escribe con respaldo, autorización
  explícita y relectura. Nunca en silencio.
- **CSP.** Los medidores usan `<meter>` nativo, sin `style` en línea.

## 8 · Hallazgos, deuda, supuestos y pendientes

**Hallazgos.**

- **H-15S2-01 · Alta, corregido.** La C.2 de la 15-S1 negaba el H.265 antes del
  puente, también a Safari.
- **H-15S2-02 · Media, mitigado.** go2rtc v1.9.14 deja leer su RTSP interno sin
  credencial desde `127.0.0.1`, aunque tenga `username` y `password`. Se escucha
  sólo en el bucle local.
- **H-15S2-03 · Media, corregido.** La SDP del flujo transcodificado no mide la
  espera: 245 ms de SDP y 2,5 s de primer cuadro. El paso 7 mide el primer
  cuadro desde que se pide.
- **H-15S2-04 · Media, corregido antes de cerrar.** El «¿llevaba `sessionId`?»
  se tomaba al responder. La respuesta de la subida lo apagaba y la bajada
  rechazada no se repetía.
- **H-15S2-05 · Baja, corregido antes de cerrar.** El primer «voz» de la consola
  no salía durante el primer segundo: el contador empezaba en 0, no en −∞.
- **H-15S2-07 · Media, corregido.** La primera corrida del verificador
  (`ed41895`) dio **FALLIDA**:

  - frontera A: la aplicación importaba valor de `@ncr/providers`;
  - KPI-11: `sitio-audio.mjs` nombraba la ruta TwoWayAudio;
  - la suite no era reproducible: la prueba de semidúplex, 1 de 3 corridas.

  Ninguna prueba unitaria lo veía; el verificador sí. Corregido en `cd791c0`.

- **H-15S2-08 · Baja, instrumentado.** La sonda D-100 del banco de pruebas
  negativas falló en la segunda corrida con «dijo: nada», sin más pista. El
  propio fichero ya anotaba un fallo igual en la 15-K. Mi hipótesis fue el
  plazo de 120 s de `correr`. Le di plazo propio de 300 s y la línea ✗ pasó a
  decir el código, la señal y las últimas líneas (`cc71d1e`). **El plazo no era
  la causa:** la cuarta corrida volvió a fallar, y esta vez la línea ✗ sí lo
  dijo: código 1, **sin señal**, y la salida cortada a mitad de la lista de
  ficheros. Eso llevó a H-15S2-09.
- **H-15S2-09 · Media, corregido. La causa del «dijo: nada».**
  - **Qué pasaba.** Con `stdio: 'pipe'`, la salida de un hijo de Node va a un
    socket de UNIX no bloqueante. Lo que no cabe se encola y sólo sale cuando
    el bucle de eventos gira. `metricas.mjs` escribe ~560 líneas y en seguida
    bloquea el bucle con el `execFileSync` de vitest. Al final, `process.exit(1)`
    tiraba la cola. Si el lector iba al día, no se notaba; si se retrasaba
    (verificador cargado, cobertura de V8), la salida llegaba cortada **con el
    mismo código de salida**, y la sonda leía «nada».
  - **Cómo se demostró.**
    - Un guion de 2 000 líneas con `process.exit(1)` llegó cortado a 12 519
      bytes (código 1, sin señal). El corte de la cuarta corrida estaba a los
      12 151.
    - Con `process.exitCode = 1` llegó entero, tres veces de tres.
  - **Arreglo.** `metricas.mjs` termina con `process.exitCode` en una cadena de
    `else if`: sale el mismo primer fallo que antes, y el proceso no termina
    hasta haberlo escrito todo.
  - **Prueba.** El banco tiene una aserción nueva en la sonda 22. Hace que el
    lector se retrase **a propósito**: socket de UNIX en pausa hasta que el
    proceso termine o pase el triple de la línea base
    (`scripts/lib/lector-lento.mjs`). Ahí exige la salida entera.
    - Con el `metricas.mjs` anterior: cortada en **15 189 bytes las cuatro
      veces**.
    - Con el arreglo: 32 027, entera.
    - El banco completo con la versión anterior da **una sola ✗, esa**:
      «con un lector lento la salida se corta en 15189 bytes (código 1)».
- **H-15S2-10 · Entorno, mío.** Un vitest que lancé en `packages/providers`
  casi cinco horas antes quedó **huérfano**, con un trabajador al 96 % de CPU.
  Seguía vivo durante la tercera y la cuarta corrida del verificador. Lo maté
  antes de la quinta. No es código del repositorio, pero sí carga que esas
  corridas no debían tener. [Probable] contribuyó a DT-15S2-10 y a que se
  viera H-15S2-09.
- **H-15S2-06 · Entorno.** Una base de pruebas sembrada hace más de 8 h hace
  fallar `edge-en-sitio-pg.e2e` (12 aperturas en vez de 15): la autorización de
  visita sembrada dura 8 h.
  - No es de este cambio: falla igual en `develop`.
  - Con la base reconstruida (`./supabase/verificar.sh --con-pruebas
--modo-supabase`) pasa.
  - En sitio, la víspera, reconstruir la base de pruebas.

**Deuda.**

- **DT-15S2-01** El transcodificado no cumple KPI-33 con holgura: 1,4–2,5 s en
  el banco. No se probó el codificador por hardware del Mac (`#hardware`,
  VideoToolbox), porque este entorno no lo tiene.
- **DT-15S2-02** El go2rtc del **Edge** no transcodifica. Con Edge, Chrome y una
  cámara H.265, la consola dice «no reproducible» con los tres remedios.
- **DT-15S2-03** No hay transcodificación de **audio** en la API: un canal que no
  es G.711 sólo se habla pasándolo a G.711 (B4).
- **DT-15S2-04** La confirmación de B4 está en `pnpm sitio:audio`, **no en la
  ficha de la consola**, como pedía el encargo.
- **DT-15S2-05** El semidúplex se mide por la bajada. Un equipo que envía
  silencio en vez de callar contaría como dúplex (S-15S2-04).
- **DT-15S2-06** Ficheros por encima de 300 líneas que crecieron, e
  `IntercomDeEquipo` con 7 miembros públicos (§4).
- **DT-15S2-07** [Probable] La bajada por el transporte **HTTP**
  (`GUARDIA_AUDIO_TRANSPORTE=http`) usa el plazo de 5 s del cliente también para
  el cuerpo. Venía de antes y no lo medí. El transporte por omisión es el
  WebSocket, que no lo tiene.
- **DT-15S2-08** Las evidencias del encargo no están en el repositorio:
  `extracto-0710.log` y las páginas del fabricante. B1 está diseñado con
  `[SUPUESTO]`.
- **DT-15S2-09** El bloque C (QR en el ensayo y `pnpm sitio:descubrir`) no se
  hizo.
- **DT-15S2-10** El paso 14 (estabilidad) no nombra un fichero que cae fuera de
  sus aserciones. En la tercera corrida, un fichero de la API con 12 pruebas
  quedó sin ejecutar en una de las tres pasadas («ninguna aserción en rojo»), y
  no hubo forma de saber cuál: el informe se sobrescribe en la pasada
  siguiente.
  - No se reprodujo en tres corridas forzadas de la suite completa.
  - [Probable] la carga: se aligeraron las fuentes H.265 de las pruebas con
    binario real (`187b9da`).
  - Que el paso los nombre exige una rama nueva en un control medido, con su
    prueba negativa: no se hizo en esta ronda.
- **DT-15S2-11** La clase de H-15S2-09 sigue abierta fuera de `metricas.mjs`.
  - Hay ~120 `process.exit(` en ~50 guiones de `scripts/`.
  - El riesgo está en los que escriben mucho y su salida la lee un proceso que
    puede retrasarse: como el banco, o el verificador en el Mac.
  - Corregí el que estaba demostrado. Los demás no están auditados.

**Supuestos:** S-15S2-01 a S-15S2-04, en el registro.

**Extensión al contrato:** E-09, manos libres y el turno medido (autorizada en
el encargo).

## 9 · Qué debe hacer el usuario manualmente

1. **Instalar ffmpeg en el Mac:** `brew install ffmpeg`. Comprobar con
   `pnpm sitio:video -- --preparar`, que debe decir «✓ ffmpeg en …».
2. **Recompilar:** `pnpm install --frozen-lockfile` y
   `pnpm --filter @ncr/providers build`, para los guiones de sitio. Después,
   reiniciar la API y la consola.
3. **Variable nueva:** `VIDEO_TRANSCODIFICAR=auto` en `apps/api/.env`. Es el
   valor por omisión: sólo hace falta escribirla para poner `nunca`.
4. **Arrancar el puente con la versión nueva** (`pnpm sitio:video`): enciende el
   RTSP interno en `127.0.0.1:8554`. Si el 8554 está ocupado en el Mac, la
   consola lo dirá.
5. **No hay migración.** `supabase db push` no cambia en esta ronda.
6. **Antes de la visita**, reconstruir la base de pruebas local si se va a
   correr el verificador (H-15S2-06).

### Qué medir mañana en sitio, paso a paso

1. **Video de la cámara (H.265).** Ábrala en la guardia con **Safari** y anote
   si se ve y cuánto tarda. Después, con **Chrome**. En la línea de la API debe
   salir «vista en vivo negociada… via: transcodificado».
2. **`pnpm sitio:ensayo -- --equipo=camara`, paso 7.** Anote:

   - la vía;
   - la SDP;
   - el «primer cuadro a los N ms de pedirlo»;
   - la línea de Safari.

   Si dice «SOBRE la meta de 2 s», en sitio vale Safari.

3. **`pnpm sitio:audio -- --equipo=videoportero`.** Anote formato, volumen,
   `sessionId`, bytes y nivel de la bajada, «dúplex:» y si se oyó el tono. Con
   alguien hablando delante del equipo, el nivel debe subir.
4. **`pnpm sitio:audio -- --equipo=terminal`.** Lo mismo.
   - Si «se oyó? NO» con «sessionId: usado», la sesión no era la causa: mire el
     volumen y el formato.
   - Si dice «NO es G.711», el paso 5.
5. **Sólo si el cliente lo autoriza:**
   `pnpm sitio:audio -- --equipo=terminal --pasar-a-g711
--respaldo=$HOME/ncr-sitio/respaldo`. Se revierte con
   `pnpm sitio:ensayo -- --equipo=terminal --restaurar=$HOME/ncr-sitio/respaldo`.
6. **En la consola de guardia,** con el videoportero y con la terminal:
   - «Manos libres»: hablar sin pulsar;
   - los medidores «Recibiendo» y «Enviando» a la vez;
   - si sale «Equipo semidúplex (medido)», anote el turno.
7. **KPI-33 con la palmada** (§8.4.1, fila 4), con «Manos libres» y con
   «Mantener para hablar».
8. **Copiar los informes de `$HOME/ncr-sitio`** al canal de la visita: no llevan
   IP ni claves.

## 10 · Rama y commits

Rama `etapa-15s2-video-y-audio-duplex`, desde `develop` (`2694422`):

- `6789d8a` fix(etapa-15s2/video): H.265 directo en Safari y transcodificado a H.264 para Chrome
- `d0f035e` feat(etapa-15s2/audio): sessionId, dúplex medido, manos libres y pnpm sitio:audio
- `ed41895` fix(etapa-15s2/guias): Safari, ffmpeg, manos libres y sitio:audio en las guías; S-15S2 y E-09
- `cd791c0` fix(etapa-15s2/fronteras): la regla de video y el medidor de dúplex entran por puerto; sitio:audio sin ISAPI; semidúplex estable
- `cc71d1e` fix(etapa-15s2/verificador): la sonda D-100 con plazo propio y el porqué de su fallo
- `187b9da` fix(etapa-15s2/pruebas): las fuentes H.265 de las pruebas con binario real, más ligeras
- `1cd6f80` fix(etapa-15s2/verificacion): metricas.mjs ya no pierde su salida al terminar (H-15S2-09)
- el cierre: `chore(etapa-15s2): cierre de etapa`, que sólo añade este informe y la ficha.
