# ETAPA 15-P · Guardia virtual: audio bidireccional y puertas del videoportero

**Rama:** `etapa-15p-guardia-intercom-y-puertas` · **Base:** `develop` (`580ccc3`, merge del PR #37) ·
**PR:** [#38](https://github.com/4rg3n15/NextResidential/pull/38), sin fusionar · **Fecha:** 2026-10-01

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Todo lo de aquí está medido y probado contra **equipos simulados** que siguen
> el manual de familia «ISAPI IP Series / Ultra Series» (Digest, TwoWayAudio con
> `audioData` persistente y `0x40002068`; `RemoteControl/door`, `OpenDoorParams`,
> unidad de puerta segura, submódulos), **no contra el DS-KD9633-WBE6**. Lo que
> sólo se ve con el aparato está en la [lista de sitio](#lista-de-verificación-en-sitio).

**Lo incómodo primero.** El audio de la guardia **nunca funcionó en producción**
y la causa no era la que suponía el encargo. No eran «~50 POST/s de 20 ms»: eran
trozos de 200 ms, unas 5 peticiones por segundo (C-47). Lo que lo rompía era
otra cosa, medida: (1) `next.config.mjs` negaba el micrófono en **toda** la
consola (`Permissions-Policy: microphone=()`), así que `getUserMedia` fallaba
con `pnpm start`; (2) la API reenviaba la subida con un cuerpo en flujo que sale
`Transfer-Encoding: chunked`, y un equipo que siga el manual espera octetos
crudos: contra el simulado **no llegó ninguna marca de ida**; (3) hablar no
renovaba el turno, que caducaba a los 90 s aunque el operador estuviera
hablando; y (4) el límite global (120/min) cortaba la subida con 429 a los ~24 s.

**En una línea.** El audio va ahora por un **WebSocket ordenado** navegador ↔ API
↔ `audioData` persistente (elegido con cifras contra go2rtc: ida 37 ms, vuelta
70 ms, cero canales huérfanos), con «pulsar para hablar», turno del dominio,
cortes del servidor y constancia sin audio; y la guardia abre **cada salida**
que el videoportero declara, elegida por punto, con motivo y auditada.
**Volver al transporte anterior es `GUARDIA_AUDIO_TRANSPORTE=http`.**

---

## Avance

| Bloque                                               | Estado                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0.1** · `unhandledRejection` / `uncaughtException` | **Hecho.** Se registran; la segunda dispara el cierre ordenado y sale con 1                                                                                                                                                                                                                                      |
| **0.2** · `bombear()` con backoff                    | **Hecho.** Espera exponencial con jitter completo y SIGUE; tras cinco intentos el evento se da por perdido y se dice                                                                                                                                                                                             |
| **0.3** · token en Server Component                  | **Hecho.** La renovación va al middleware; las páginas sólo leen y sin token redirigen a `/acceso` sin lanzar. Probado con token vencido, visto fallar en `develop`                                                                                                                                              |
| **0.4** · WHEP abortable                             | **Hecho.** Una sola negociación por consola; cambiar de equipo aborta la suya                                                                                                                                                                                                                                    |
| **0.5** · cámara 409                                 | **Hecho.** Sin canales se pide el 101 por omisión (S-174); H.265 dice cómo pasar a H.264 (S-175)                                                                                                                                                                                                                 |
| **0.6** · `keepAlive`                                | **Hecho** en el pool de la API y en el de pg-boss, con prueba contra PostgreSQL real                                                                                                                                                                                                                             |
| **P1** · medir A vs B                                | **Hecho.** Banco con Chromium y mismo reloj contra un videoportero simulado en red; **elegido B**; A queda como contingencia escrita (ADR-01, enmienda 1)                                                                                                                                                        |
| **P2** · audio bidireccional                         | **Hecho.** Capacidad leída, turno del dominio, billete de un uso, pulsar para hablar (ratón, táctil, barra espaciadora), escucha al abrir, cortes del servidor, `close` al colgar / caducar / cambiar de equipo / cerrar la pestaña, constancia por sesión (0047), micrófono sólo en `/guardia`, límites propios |
| **P3** · puertas                                     | **Hecho.** Árbol equipo → módulo → salida leído de lo que el equipo declara (R3, tope 3); `puntos_de_acceso` (0048) con nombre editable; selector de punto en la guardia y apertura por punto con motivo, atribuida y auditada; sólo `open`                                                                      |
| **P4** · video bidireccional                         | **Sólo la sección del ADR-01 enmendado.** Sin andamiaje                                                                                                                                                                                                                                                          |
| **P5** · pruebas                                     | **Hecho**, con dos matices en «Distinto del encargo» (go2rtc real y la medición en sitio)                                                                                                                                                                                                                        |

## Lo que se hizo distinto del encargo

- **La premisa de P1 (C-47).** El transporte anterior subía trozos de 200 ms
  (≈ 5 POST/s), no de 20 ms (≈ 50). La conclusión —reemplazarlo— se sostiene
  por los cuatro defectos de arriba, que sí están medidos.
- **R1 y el transporte por omisión.** El encargo admite cambiar el valor por
  omisión «hasta que la medición lo justifique». La medición lo justifica: el
  anterior no entrega audio de ida a un equipo que siga el manual. Por eso
  `GUARDIA_AUDIO_TRANSPORTE` vale `websocket` por omisión; `http` deja todo
  como estaba (el código anterior sigue y su prueba también).
- **«§8.3» (C-48).** En la guía, habilitar el canal del videoportero es **§8.4**
  (§8.3 es la terminal). El mensaje de `CanalDeEquipoNoHabilitado` remitía a
  §8.3: corregido. El procedimiento nuevo está en §8.4.1 (audio) y §8.4.2 (salidas).
- **`puntos_de_acceso` no admitía salidas sin zona (C-49).** La 0009 exige
  `zona_id`. Una salida descubierta no trae zona: la **migración 0048** la hace
  opcional y añade puerta, módulo, ruta, origen, una puerta activa por equipo,
  borrado prohibido y la atadura de la orden manual al punto.
- **«Extremo a extremo con go2rtc real».** go2rtc real se usó donde está en el
  camino: en el banco, para medir A, y en la prueba de video que ya existía
  (`puente-go2rtc.real.test.ts`, R1). B no pasa por go2rtc, así que su prueba
  de punta a punta en la suite es API real + adaptador real + videoportero
  simulado **en red** (`audio-guardia-ws.e2e.test.ts`), y la de navegador es el
  banco con Chromium.
- **La latencia en sitio no la mide el banco (S-180).** El banco detecta las
  marcas en el simulado; en el equipo real no hay forma de leer lo que
  reproduce. La guía da un procedimiento acústico (§8.4.1, paso 4).
- **Ascensor (P-26).** El manual lo trae y el encargo no lo nombra: se descubre
  y se enseña como módulo sin acción, PENDIENTE DE DEFINICIÓN.
- **0.5 cambió una aserción.** `sonda-video.test.ts` (V2) fijaba el 409 que 0.5
  manda retirar. Las suites de sitio que R1 protege —cámara del 28/09, CRLF del
  SDP, cortes de la 15-O— no se tocaron.
- **El verificador salió FALLIDO tres veces antes de la corrida buena, y las
  tres eran ciertas.** (1) **Regresión de R1 mía:** el videoportero simulado
  contestaba `AccessControl/capabilities` sin salidas declaradas, la misma ruta
  que pregunta la lectura de la biblioteca de rostros, y dos regresiones de
  sitio (H-SITIO-09, F4) pasaron de «no» a «sí». Corregido en el simulado sin
  tocar aserciones (`6c01ffb`). En la misma corrida, el barrido de formularios
  pidió clasificar la sección «Salidas». (2) **Un falso fallo que también habría
  salido en sitio:** el guion de puesta en marcha contaba como «desmentidas» las
  rutas de la unidad de puerta segura y de los submódulos, que sólo existen si
  el módulo está instalado; ahora son `soloSiLaDeclara` y se informan como «no
  declarada» (`f66447b`). (3) **Una carrera de la 15-N:** la prueba con go2rtc
  real miraba el `PLAY` en el instante de la respuesta, y go2rtc lo manda en una
  gorrutina después (`add_consumer.go:111` → `producer.go:157`); se espera al
  `PLAY` antes de la MISMA aserción (`869029f`, 16 líneas añadidas, ninguna
  cambiada). La lección, dicha: los dos primeros se habrían visto antes de
  subir si hubiera corrido las suites completas del proveedor y del guion, no
  sólo las de los ficheros tocados.
- **El recorrido de la consola no habla.** El paso 9b recorre el panel de
  guardia con el videoportero de dos cerraduras (política de micrófono por
  ruta, descubrir, nombrar, elegir y abrir por punto, con el equipo simulado
  como oráculo), pero no abre el micrófono: el audio de punta a punta con un
  navegador real lo hace el banco.

---

## 1 · Qué se construyó

**Audio de la guardia por WebSocket (P1, P2).** Antes de construir se midió.
Un videoportero simulado **en red** implementa el flujo TwoWayAudio del manual
con Digest, `open`/`close`, bajada y subida persistentes, tramas G.711 µ-law de
160 B y el `0x40002068` cuando otro cliente tiene el canal. Contra él, un banco
con Chromium real y el mismo reloj en las dos puntas mide la ida (micrófono →
equipo), la vuelta (equipo → altavoz) y el establecimiento de tres opciones:
go2rtc como puente (A), WebSocket ordenado (B) y el transporte anterior. B ganó
por control, no sólo por cifras: A roba el canal con un `close` previo y lo deja
tomado tras colgar. Con B, el navegador pide un billete de un uso y abre un
`wss` al mismo origen de la consola, que reenvía la actualización a la API; la
API concede la subida sólo a quien tiene el turno del dominio, descarta todo
audio fuera de «pulsar»…«soltar», corta un tramo de más de 60 s y un turno
caducado, y al terminar suelta el turno —`PUT close` en el equipo— y deja una
fila de constancia con los tramos hablados, nunca el audio. La consola escucha
desde que se abre, transmite mientras se mantiene el botón (ratón, táctil o
barra espaciadora con el foco en el panel) y cuelga al desmontar, al cambiar de
equipo y al cerrar la pestaña.

**Puertas del videoportero (P3).** El proveedor lee lo que el equipo declara
—capacidades de control de acceso, órdenes y número de puertas de la orden
remota, estado de la unidad de puerta segura, submódulos— y arma un árbol de
tres niveles. La ficha del videoportero lo enseña por módulo y permite
«Descubrir salidas», que deja una fila por puerta en `puntos_de_acceso`, con un
nombre que el administrador cambia. En la guardia, dentro del bloque
abrir/denegar del mockup, un selector de punto elige la puerta: con varias, no
se abre sin elegir; con una, se usa sola; sin puntos, la puerta de la ficha
como siempre. La orden lleva el punto; la API resuelve su puerta **antes** de
registrar y de accionar —un punto ajeno es un 404 y la orden no sale— y el
proveedor manda `open` a ESA puerta. Sólo `open`: libre o bloqueada queda
PENDIENTE DE DEFINICIÓN (P-25).

**Remanentes de la 15-O (Bloque 0).** El proceso de la API se vigila; la escucha
de un equipo ya no enmudece cuando falla una publicación; la consola renueva la
sesión en el middleware; la vista en vivo aborta la negociación anterior; la
cámara sin canales declarados prueba el 101 y la que emite H.265 dice cómo
pasarla a H.264; y los dos pools mantienen viva la conexión TCP.

## 2 · Cómo se organizó y por qué

- **El transporte es un adaptador, el turno sigue en el dominio (R2).**
  `IntercomIsapiPersistente` implementa `IntercomProvider` y **delega** apertura,
  turno y cierre en `IntercomDeEquipo`, que ya era el dueño del `open`/`close` y
  de la máquina de estados. Lo único nuevo es cómo viajan las tramas: un socket
  crudo con su propia sesión Digest, porque `fetch` no sabe mandar un cuerpo
  persistente sin longitud ni `chunked`. Cero diff en `packages/domain-core`.
- **La conversación es un caso de uso de aplicación, el WebSocket es
  presentación.** `ConversacionDeAudio` no sabe qué es un socket: recibe una
  `SalidaDeConversacion` (audio, aviso, cerrar) y decide turno, tramos, límites
  y constancia. `PuertaDeAudioPorWebSocket` sólo traduce el protocolo. Por eso
  la prueba unitaria de la conversación no abre ningún socket.
- **El billete, no la cookie, en el WebSocket.** Un `upgrade` no lleva el
  `Authorization` que la consola añade en su proxy. El billete lo emite una ruta
  HTTP normal, con sesión, rol, guardia remota y alcance de copropiedad y de
  equipo —entra en el barrido de aislamiento—, y vale una vez, 15 s y desde su
  IP. El reenvío de la consola no pasa cookies ni tokens.
- **Mismo origen para no tocar la CSP.** `connect-src 'self'` ya cubre
  `wss://<consola>`; el puente no abre ningún puerto nuevo al navegador.
- **El árbol de salidas es la única recursión (R3), y una sola.**
  `recorrerSalidas` en `packages/providers/src/nucleo/salidas.ts`: preorden,
  caso base en la salida (hoja) y error —no recorte— al pasar de tres niveles.
  `aplanarSalidas` y el DTO plano de la API usan ese mismo recorrido.
- **Leer es del proveedor; decidir qué se persiste, de la aplicación.**
  `arbol-de-salidas.ts` son funciones puras sobre los documentos del equipo;
  `salidas-del-equipo.ts` sólo los pide. En la API, el adaptador
  `LectorDeSalidasPorProveedor` traduce al puerto `LectorDeSalidas` —árbol
  leído, sin lectura con motivo en palabras, o inválido por R3—, y la
  aplicación no importa nada de `@ncr/providers` como valor (O2, el control de
  extensibilidad lo cazó en la primera versión).
- **`puntos_de_acceso` es del módulo de equipos; la guardia lo consume por un
  puerto que declara ella.** `PuntosDelEquipo` vive en
  `guardia/aplicacion/puntos-del-equipo.ts`; lo satisface `PuntosDeOperacion`,
  que sale por el barril de `equipos`. Ningún módulo lee la tabla del otro.
- **La unicidad la garantiza la base (ADR-04).** Una puerta activa por equipo
  es un índice único parcial; diez «Descubrir» simultáneos contra PostgreSQL no
  duplican nada.
- **El punto se resuelve antes del rastro.** En `AccionarPuertaAMano` el orden
  es rol → alcance → motivo → punto → registrar → accionar. Un punto que no
  existe no es una orden fallida: es una orden que no se da.
- **Quien no sabe elegir puerta no abre otra.** Si el proveedor no tiene
  `abrirSalida`, o la orden va por la barrera de entorno (`BARRERA_*`), el
  accionador **rechaza** con motivo en vez de abrir la puerta de la ficha.

## 3 · Árbol de archivos (selección)

```
packages/providers/src/
  nucleo/salidas.ts                       árbol equipo → módulo → salida; el único recorrido (R3)
  videoportero/arbol-de-salidas.ts        lectores puros de lo que el equipo declara
  videoportero/salidas-del-equipo.ts      pide los documentos (cada uno opcional)
  videoportero/intercom-isapi-persistente.ts   el adaptador de audio persistente (B)
  videoportero/conexion-cruda.ts · cuerpo-trozado.ts · errores-de-audio.ts
  simulacion/videoportero-de-audio.ts     videoportero simulado EN RED (flujo del manual, 0x40002068)
  simulacion/marcas-de-audio.ts           G.711 µ-law, tramas de 160 B, detector de marcas
  hikvision/hikvision-provider.ts         salidasDe / abrirSalida (ampliado)
apps/api/src/
  guardia/aplicacion/conversacion-de-audio.ts   la conversación: turno, tramos, cortes, constancia
  guardia/presentacion/audio/*            billete, puerta del WebSocket, IP de la actualización
  guardia/aplicacion/puntos-del-equipo.ts       puerto: la puerta del punto elegido
  equipos/aplicacion/salidas-del-equipo.ts      descubrir, ver y nombrar
  equipos/aplicacion/puntos-de-operacion.ts     listar y resolver para quien abre
  equipos/infraestructura/puntos-de-acceso-{pg,en-memoria}.ts · lector-de-salidas-por-proveedor.ts
  equipos/presentacion/salidas.controller.ts · dtos-salidas.ts
apps/web/
  servidor.mjs · reenvio-de-audio.mjs     reenvío del WebSocket por el mismo origen
  src/lib/audio/canal-por-websocket.ts    el canal del navegador
  src/componentes/controles-de-audio-ws.tsx     pulsar para hablar
  src/app/(consola)/guardia/selector-de-punto.tsx
  src/app/(consola)/dispositivos/salidas-del-equipo.tsx
supabase/
  migrations/…0047_conversaciones_de_guardia.sql · …0048_salidas_del_videoportero.sql
  policies/tests/99d_…sql · 99e_…sql · reversion/0047_revert.sql · 0048_revert.sql
e2e/medir-audio-guardia.mjs (+ medir-audio/)   el banco A / B / anterior
e2e/recorrido-de-consola.mjs                   paso 9b: el panel de guardia con dos cerraduras
docs/decisiones/ADR-001-…md                    enmienda 1
```

## 4 · Tabla SOLID (lo creado en la ronda)

| Archivo                                                | SRP                                                  | OCP                                        | LSP                                                                                 | ISP                                    | DIP                                                   |
| ------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| `intercom-isapi-persistente.ts`                        | Mover tramas por `audioData` persistente             | Otro transporte es otro adaptador          | Intercambiable con `IntercomDeEquipo` detrás de `IntercomProvider` (las dos suites) | Los cinco métodos del puerto           | Recibe conexión y reloj; delega el turno              |
| `conversacion-de-audio.ts`                             | Una conversación: turno, tramos, límites, constancia | Límites por objeto inyectable              | —                                                                                   | `SalidaDeConversacion` de tres métodos | Canal, registro, reloj, ids y temporizador inyectados |
| `billetes-de-audio.ts` · `puerta-de-audio.ts`          | Emitir / canjear billetes · traducir el protocolo    | —                                          | —                                                                                   | Pocos métodos públicos                 | Nest inyecta por token                                |
| `nucleo/salidas.ts`                                    | El árbol y su único recorrido                        | Un tipo de nodo nuevo no toca el recorrido | —                                                                                   | Tipos y dos funciones                  | Sin dependencias                                      |
| `arbol-de-salidas.ts`                                  | Leer documentos del equipo                           | Una capacidad nueva es una bandera más     | —                                                                                   | Funciones puras                        | Sin I/O                                               |
| `salidas-del-equipo.ts` (API)                          | Descubrir, ver y nombrar                             | —                                          | —                                                                                   | Tres métodos                           | Puertos `LectorDeSalidas` y `RepositorioDePuntos`     |
| `puntos-de-operacion.ts`                               | Puntos para quien abre                               | —                                          | —                                                                                   | Dos métodos                            | Puerto de puntos                                      |
| `puntos-de-acceso-pg.ts` / `-en-memoria.ts`            | Persistir puntos                                     | —                                          | Mismo contrato (pruebas contra los dos)                                             | Tres métodos                           | Implementan el puerto                                 |
| `lector-de-salidas-por-proveedor.ts`                   | Traducir del proveedor al puerto                     | —                                          | —                                                                                   | Un método                              | Recibe `Pick<ProveedorDeEquipos,'salidasDe'>`         |
| `selector-de-punto.tsx` · `salidas-del-equipo.tsx`     | Elegir punto · administrar salidas                   | —                                          | —                                                                                   | Props mínimas                          | Cliente de API generado                               |
| `canal-por-websocket.ts` · `controles-de-audio-ws.tsx` | El canal · el botón                                  | —                                          | Canal de mentira en las pruebas                                                     | Tres métodos                           | `crearCanal` inyectable                               |

Ningún archivo nuevo pasa de 300 líneas (70 nuevos, el mayor por debajo del
tope). Tres que ya existían cruzaron el tope en esta ronda (DT-15P-02).

## 5 · Trazabilidad

| Elemento                       | Cubierto en la 15-P                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| OE-07 · CU-03 · HU-26          | Audio bidireccional real por el puerto, con turno, cola y cortes                                                        |
| KPI-33 · CA-19 (< 2 s)         | Medido contra el simulado: ida 37 ms (p95 52), vuelta 70 ms (p95 72). **En sitio, por medir**                           |
| KPI-32 · CA-20 (< 3 s)         | Apertura por punto medida de punta a punta contra el simulado (ver §6)                                                  |
| KPI-34 · RN-08 · CA-16 · CA-17 | Motivo obligatorio antes de resolver el punto, registrar y accionar; el punto queda en la orden y en la línea de tiempo |
| KPI-35 · RN-15                 | Billete y puntos por los dos caminos; clave ajena compuesta orden ↔ punto; políticas 99d y 99e                         |
| RN-12 · RN-21                  | El navegador nunca habla con el equipo; la credencial no sale de la API ni a la bitácora                                |
| RN-19                          | `puntos_de_acceso` sin borrado físico (0048)                                                                            |
| ADR-01                         | Enmienda 1: el puente; video bidireccional sólo descrito                                                                |
| ADR-04                         | Una puerta activa por equipo, por índice                                                                                |

## 6 · Pruebas

### Qué se probó y cómo

| Qué                                                                                                                                                                                                                                                                    | Dónde                                                                                                                                                                                                                    | Cómo se ejecuta                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Árbol de salidas: recorrido con caso base y tope 3 (error, no recorte), ciclo, lectores de documentos, cerraduras, unidad segura, submódulos, ascensor, libre/bloqueada                                                                                                | `packages/providers/src/nucleo/salidas.test.ts` · `videoportero/arbol-de-salidas.test.ts`                                                                                                                                | `pnpm --filter @ncr/providers test`              |
| Proveedor contra el simulado: árbol leído, cada puerta abre la suya (oráculo `puertasAbiertasPor`), sin operador no sale, sin apertura remota no abre, R1 sin salidas declaradas                                                                                       | `hikvision/salidas-del-videoportero-15p.test.ts`                                                                                                                                                                         | ídem                                             |
| Audio: marcas µ-law, adaptador persistente (subida cruda, 401, `0x40002068`), transporte anterior `chunked`                                                                                                                                                            | `simulacion/marcas-de-audio.test.ts` · `videoportero/intercom-isapi-persistente.test.ts`                                                                                                                                 | ídem                                             |
| Conversación: sin turno no empieza, escucha sin pulsar, pulsar/soltar en orden, tramo de 60 s, caducidad, renovación, límites, doble cierre                                                                                                                            | `apps/api/src/guardia/aplicacion/conversacion-de-audio.test.ts`                                                                                                                                                          | `pnpm --filter @ncr/api test`                    |
| Salidas en la API: roles, segundo camino de aislamiento, no videoportero, conservar nombre y dar de baja, sin lectura, R3, renombrar; orden por punto (antes de rastro y relé), punto ajeno, R1 sin punto; accionador que no sabe elegir puerta                        | `equipos/aplicacion/salidas-del-equipo.test.ts` · `lector-de-salidas-por-proveedor.test.ts` · `guardia/aplicacion/apertura-por-punto.test.ts` · `guardia/infraestructura/accionador-salidas.test.ts`                     | ídem                                             |
| Contra PostgreSQL **como `authenticated`** (la RLS forzada decide): descubrir, nombre que sobrevive, baja lógica; **diez «Descubrir» simultáneos sin duplicar**; el portero lee y no escribe; ROBLE ni ve ni renombra; orden ↔ punto con clave ajena compuesta        | `apps/api/test/salidas-del-videoportero-pg.test.ts` · `conversaciones-de-guardia-pg.test.ts` · políticas `99d` y `99e`                                                                                                   | `--con-base`                                     |
| De punta a punta por la API: audio de ida y vuelta, billete de un uso y de su IP, segundo operador en cola, KPI-35, `0x40002068`; salidas: árbol, descubrir, nombrar, abrir CADA salida con motivo, sin motivo no abre, punto ajeno 404, KPI-35, R1 sin punto          | `apps/api/test/audio-guardia-ws.e2e.test.ts` · `salidas-del-videoportero.e2e.test.ts`                                                                                                                                    | `pnpm --filter @ncr/api test`                    |
| Consola: canal WebSocket (pulsar, soltar, **soltar antes de que abra el micrófono**, autorrepetición, cortes del servidor, colgar), botón de pulsar para hablar, Permissions-Policy por ruta, selector de punto sobre la pantalla de guardia entera, sección «Salidas» | `apps/web/src/lib/audio/canal-por-websocket.test.ts` · `componentes/controles-de-audio-ws.test.tsx` · `politica-de-permisos.test.ts` · `guardia/selector-de-punto.test.tsx` · `dispositivos/salidas-del-equipo.test.tsx` | `pnpm --filter @ncr/web test`                    |
| Recorrido de la consola, **paso 9b**: micrófono sólo en la guardia; videoportero de dos cerraduras dado de alta, descubierto y nombrado en su ficha; en la guardia, «Abrir» espera a que se elija; el equipo simulado dice que se movió la puerta 2 y sólo ésa         | `e2e/recorrido-de-consola.mjs`                                                                                                                                                                                           | `node e2e/recorrido-de-consola.mjs` (o paso 13b) |
| Banco de audio A / B / anterior con Chromium y el mismo reloj                                                                                                                                                                                                          | `e2e/medir-audio-guardia.mjs`                                                                                                                                                                                            | `node e2e/medir-audio-guardia.mjs`               |

### Resultado

**Cifras medidas, contra el simulado:**

| Medida                                            | Valor                                                                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Audio por el banco (Chromium ↔ equipo), B        | ida 37 ms (p95 52) · vuelta 70 ms (p95 72) · establecer escucha 33 ms · al pulsar 30 ms · `close` tras colgar 7 ms · 0 canales huérfanos |
| Audio por la API (sin navegador), B               | ida 2 ms · vuelta 1 ms                                                                                                                   |
| Apertura por punto, de la petición a la respuesta | 17 ms y 8 ms (KPI-32 · < 3 s)                                                                                                            |
| KPI-25 (paso 11)                                  | 200 de 200 alertas · p50 6 ms · p95 23 ms · p99 30 ms                                                                                    |

Paso 5 de la corrida correcta: `@ncr/config` 144 · `@ncr/edge` 101 ·
`@ncr/domain-core` 438 · `@ncr/providers` 1145 · `@ncr/web` 737 · `@ncr/api`
1913 + 5 saltadas declaradas (las ejecuta el paso 12b) de 1918. **4483
pruebas**, las mismas por los dos caminos (paso 7b) y tres veces seguidas sin
caché (paso 14). 411 de 411 ficheros de prueba recogidos.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Sobre `869029f`, desde cero (sin `dist/`, `.turbo/` ni `coverage/`, instalación con `--frozen-lockfile`):

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El control declarado no ejercido es el mismo de rondas anteriores («0 de ellos
en linux», con motivo y etapa de revisión vigentes). Las tres corridas
anteriores salieron **FALLIDAS** y sus causas están en «Distinto del encargo».

### Cobertura por capa

| Capa                                          | Líneas  | Ramas   | Funciones | Umbral |
| --------------------------------------------- | ------- | ------- | --------- | ------ |
| Dominio (`packages/domain-core/src`)          | 96,20 % | 96,91 % | 96,04 %   | 90 %   |
| Aplicación (`**/aplicacion/**`, 122 archivos) | 96,74 % | 90,22 % | 97,56 %   | 90 %   |
| Global (795 archivos)                         | 86,64 % | 86,68 % | 85,53 %   | 70 %   |

## 7 · Verificación de seguridad (§2.7)

| Medida              | En esta ronda                                                                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos        | Ninguno en el repositorio (escaneo en cada commit). La credencial del equipo vive en la API y en el adaptador; ni el billete, ni el WebSocket, ni el SDP, ni la bitácora la llevan. El DTO de salidas no lleva host, usuario ni rutas del fabricante (probado) |
| 2 · CORS            | Sin cambios. El WebSocket va al mismo origen de la consola                                                                                                                                                                                                     |
| 3 · Validación      | `OrdenManualDto.puntoId` UUID opcional; `NombreDePuntoDto` 1–80; la aplicación vuelve a sanear (NFC, sin controles ni marcas bidi). En el WebSocket: tamaño por mensaje, tramas por segundo, textos por segundo                                                |
| 4 · Inyección       | SQL parametrizado; `ON CONFLICT` sobre el índice parcial                                                                                                                                                                                                       |
| 5 · Rate limiting   | Billete 30/min; subida HTTP anterior 1200/min (el global la cortaba); las órdenes siguen con su límite                                                                                                                                                         |
| 6 · RLS             | 0047 y 0048 con RLS forzada; pruebas 99d/99e positivas y negativas; el repositorio de puntos escribe con los claims del usuario (probado como `authenticated`, no como superusuario)                                                                           |
| 7 · CSP / cabeceras | CSP sin relajar. `Permissions-Policy: microphone=(self)` sólo en `/guardia`, `microphone=()` en el resto (prueba y recorrido)                                                                                                                                  |
| 8 · Transversales   | Auditoría por conversación sin audio; órdenes por punto atribuidas; borrado de puntos prohibido también frente al dueño                                                                                                                                        |

## 8 · Deuda técnica, supuestos y pendientes

- **DT-15P-01 · el audio en sitio está sin medir.** Las cifras son contra el
  simulado. Si el KD9633 fuera semiduplex o su latencia excediera 2 s, la salida
  es un adaptador nuevo detrás del mismo puerto (ADR-01, contingencia).
- **DT-15P-02.** Crecieron por encima de 300 líneas `guardia/guardia.module.ts`
  (277 → 329), `planificacion/infraestructura/planificador-pgboss.ts`
  (298 → 305) y `providers/src/nucleo/errores.ts` (280 → 308); y siguen
  creciendo otros que ya estaban por encima (`hikvision-provider.ts`,
  `equipo-simulado.ts`, `catalogo-de-rutas.ts`, `guardia/pantalla.tsx`). Se
  suman a DT-15M-01, DT-15N-04 y DT-15O-03.
- **DT-15P-03.** Las salidas de una cámara, un relé o una terminal no se
  descubren: abren la puerta de su ficha (R1). Ampliarlo es un caso de uso nuevo.
- **DT-15P-04.** El nombre del punto que muestra el historial es el de HOY (se
  lee por la clave ajena). La puerta que se mandó sí queda fija en la orden.
- **DT-15P-05.** `soloSiLaDeclara` lo usa sólo el guion de sitio. `pnpm
sitio:ensayo` y la ficha no lo leen todavía: si un día sondearan esas rutas
  a ciegas, tendrían que respetarlo.
- **Supuestos nuevos:** S-174 a S-180. **Contradicciones:** C-47 a C-49.
  **Pendientes:** P-25 (puerta libre o bloqueada) y P-26 (ascensor). Todo en
  `docs/auditoria/contradicciones-y-supuestos.md`.

## 9 · Qué debe hacer el usuario manualmente

1. Aplicar las migraciones **0047** y **0048** (`supabase db push`).
2. En el `.env` de la API, `GUARDIA_AUDIO_TRANSPORTE` puede quedar sin escribir
   (vale `websocket`). Para volver al transporte anterior: `http`. `pnpm
entorno:diff` muestra la variable.
3. Arrancar la consola con `pnpm start` (o `pnpm dev`): ambos pasan por
   `servidor.mjs`, que reenvía el WebSocket del audio. Un despliegue que sirva
   la consola sin `servidor.mjs` no tendrá audio por B.
4. En la próxima visita, la [lista de sitio](#lista-de-verificación-en-sitio).

## 10 · Rama y commits

Rama `etapa-15p-guardia-intercom-y-puertas`, desde `develop` (`580ccc3`). PR
[#38](https://github.com/4rg3n15/NextResidential/pull/38) hacia `develop`, sin fusionar.

- `49053a9` fix(etapa-15p/remanentes): bloque 0 — proceso vigilado, escucha que no enmudece, sesión renovada en middleware, WHEP abortable, canal 101 y keepalive
- `a9b170e` feat(etapa-15p/audio): medir antes de construir — videoportero simulado en red, adaptador persistente y banco A/B/actual
- `e2889bd` feat(etapa-15p/guardia): audio por WebSocket con turno, pulsar para hablar, caducidad y constancia
- `17553de` feat(etapa-15p/puertas): árbol de salidas del videoportero leído de lo que declara
- `a469def` feat(etapa-15p/puertas): puntos de acceso descubiertos y apertura por punto en la guardia
- `fc579d6` feat(etapa-15p/consola): punto de acceso en la guardia y salidas en la ficha del videoportero
- `f680714` docs(etapa-15p): ADR-01 enmendado, procedimiento de sitio y recorrido del panel de guardia
- `6c01ffb` fix(etapa-15p/simulado): las rutas de salidas sólo existen si el guion las declara (R1)
- `f66447b` fix(etapa-15p/sitio): la unidad de puerta segura y los submódulos son opcionales en el guion de sitio
- `869029f` test(etapa-15p/video): esperar el PLAY asíncrono de go2rtc antes de la misma aserción
- el commit de cierre documental (este informe y ESTADO)

---

## Lista de verificación en sitio

Con el KD9633 dado de alta, la API contra el proyecto real y la consola en
`pnpm start`. El detalle está en `VALIDACION_HIKVISION_EN_SITIO.md` §8.4.1 y §8.4.2.

| #   | Qué hacer                                                                             | Qué debe pasar                                                                       |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | **Leer capacidades**: Dispositivos → ficha del videoportero → «Probar conexión»       | Canal de audio, códec (G.711 µ-law) y si está habilitado, leídos del equipo          |
| 2   | **Habilitar** el canal en el equipo si sale «no habilitado» (§8.4)                    | La ficha lo lee habilitado; nada lo habilita por su cuenta                           |
| 3   | Atender una llamada en la guardia y pulsar «Hablar»                                   | Se escucha al equipo sin pulsar nada; «Mantener para hablar» transmite; soltar corta |
| 4   | **Medir < 2 s** en cada sentido con el método acústico de §8.4.1                      | Ida y vuelta < 2 s (KPI-33, CA-19). Anotar si es semiduplex                          |
| 5   | Segundo operador a la vez; otro cliente con el canal tomado                           | El segundo queda en cola; con el canal tomado, «canal ocupado»                       |
| 6   | Colgar, cambiar de equipo y cerrar la pestaña                                         | El equipo queda libre en los tres casos                                              |
| 7   | **Descubrir salidas** del KD9633 y nombrarlas                                         | Lo que declara: cerraduras, unidad segura con su estado, submódulos                  |
| 8   | **Abrir cada salida descubierta** desde la guardia, con motivo                        | Se mueve la cerradura correcta en < 3 s; la orden queda con operador, motivo y punto |
| 9   | **Volver al transporte anterior**: `GUARDIA_AUDIO_TRANSPORTE=http` y reiniciar la API | La guardia usa los controles anteriores; nada más cambia                             |
