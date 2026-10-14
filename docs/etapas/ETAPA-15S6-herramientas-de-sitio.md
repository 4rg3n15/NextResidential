# RONDA 15-S6 · Herramientas de sitio antes de la visita

**Rama:** `etapa-15s6-herramientas-de-sitio` · **Base:** `develop` (`d98c9b1`, merge del PR #56) ·
**PR:** hacia `develop`, sin fusionar · **Fecha:** 2026-10-13 ·
**Encargo:** cadena 15-S6 → 15-Y3, ronda 1 (puntos 1 a 8) ·
**Cierra:** DT-15S5-01 · DT-15S5-02 · DT-15S5-07 · DT-15S5-08 · DT-15S4-01 (el lado del diagnóstico) · DT-15S4-02 (en la consola) ·
**Abre:** DT-15S6-01 · DT-15S6-02 · H-15S6-01

> **La excepción a la congelación se usó sólo en lo listado en el encargo:** > `scripts/sitio-ensayo.mjs`, `scripts/sitio-audio.mjs`, `scripts/sitio-video.mjs`,
> `scripts/puesta-en-marcha-equipos.mjs`, `packages/providers/src/ensayo/**` y las
> dos pruebas de `apps/api/src`. Además, el doble de red
> `packages/providers/src/simulacion/videoportero-de-audio.ts` (no está en la
> lista congelada: es un simulado de pruebas), la sonda nueva en
> `scripts/lib/sondas/` y la consola (`apps/web`) para DT-15S4-02. **No se tocó** > `sesion-de-audio.ts`, `rechazoPorSesion`, ningún adaptador ni
> `apps/api/src/guardia/infraestructura`. Nada de lo que la guardia envía o
> recibe en una conversación real cambia. **La ETAPA 15 sigue BLOQUEADA sólo por
> `BE-02`.**

**Lo incómodo primero.**

1. **La sonda de lector lento para los guiones de sitio no muerde en Linux.**
   - `sitio-ensayo` escribe 15,8 KB por el socket y `puesta-en-marcha` 18 KB; el
     socket de Linux absorbe ~27 KB (15-S5), así que la sonda pasaría aquí
     aunque el guion usara `process.exit`. Muerde en macOS (16 KB), que es donde
     DT-15S5-01 y -02 se abrieron. Lo digo en la sonda y aquí.
   - Lo que **sí se vio fallar** aquí, antes de corregir, fue el mecanismo con
     una tubería de 4 KiB y un lector de 1 KiB cada 50 ms: llegaban **4007 y
     4081 bytes**, sin VEREDICTO. Después, 16 415 y 19 023, enteros. Esa
     medición es de Python con `F_SETPIPE_SZ` (sólo Linux) y queda en §6, no en
     el repositorio.
2. **DT-15S4-01 queda cerrada sólo por el lado del diagnóstico.** El adaptador
   congelado sigue reabriendo la subida en cada trama sin pausa; la pausa y el
   tope viven en `diagnosticarAudio`. Queda como **DT-15S6-01**, con el cambio
   propuesto en §8.
3. **DT-15S4-02 queda mitigada en la consola, no corregida en la API.** La
   guardia ve «no se está enviando audio» con el micrófono activo y cero tramas;
   la propuesta del registro (contar en la API las tramas descartadas sin
   «pulsar») toca `guardia/infraestructura`: **PARADA PARCIAL**, DT-15S6-02.
4. **El diagnóstico abre ahora dos sesiones TwoWayAudio, no una.** Es el cambio
   de comportamiento más visible de la ronda: escucha en la primera y manda el
   tono en una segunda que abre tras el Enter. Sin eso el `PUT` del tono se
   queda ocioso mientras se escucha, que es lo que el 09/10 lo mató. Las
   cifras de la bajada «escuchando» salen de la primera; las de «mientras
   sonaba», la subida y los estados HTTP, de la segunda.
5. **Una corrida intermedia se quedó colgada y no fue del cambio.** Al probar la
   tubería de 4 KiB, un `sitio-ensayo --simulado` lanzado mientras
   `packages/providers` se recompilaba se quedó en el bucle de eventos sin
   terminar. Con la compilación quieta, 6 corridas en las seis combinaciones de
   tubería (4/16/64 KiB) y lector (rápido/lento), más 3 repeticiones del caso
   exacto, terminaron enteras. [Probable] la causa fue cargar un `dist/` a
   medio escribir; no lo pude reproducir después. Queda como **H-15S6-01**.

---

## 1 · Qué se construyó

Las herramientas con las que se mide el audio en sitio dejan de culpar al
equipo de un fallo propio, y los guiones de sitio ya no pierden su veredicto
cuando quien los lee es lento.

- **DT-15S5-01 y -02 (y la misma clase en `sitio-audio` y `sitio-video`).** Las
  salidas finales de los cuatro guiones ponen `process.exitCode` y vuelven;
  los `salir` tempranos se quedan, uno por uno justificados (§2). `sitio-audio`
  gana `--simulado`. Una sonda nueva corre los tres guiones en `--simulado`
  con el lector lento de la 15-S2 y exige que lleguen enteros.
- **DT-15S5-08.** `diagnosticarAudio` mide «mientras sonaba» desde que se
  **entrega** la primera trama del tono. Con la primera trama 0, 400, 600 y
  900 ms tarde, un semidúplex sigue siendo «semiduplex».
- **DT-15S4-01, lado del diagnóstico.** El tono va en una sesión abierta
  **después del Enter**, con su `PUT` recién abierto; una subida rechazada
  espera 250 ms y al cuarto rechazo el tono se detiene y se dice; un 400 sólo
  se atribuye al `sessionId` cuando la misma petición, sin él, obtuvo 2xx.
- **DT-15S4-02, en la consola.** Con el micrófono activo 3 s y cero tramas
  salidas, la guardia ve «Pulse para hablar: no se está enviando audio».
- **DT-15S5-07.** Los dos servidores de prueba de `apps/api/src` que quedaban
  en la comodín escuchan en `127.0.0.1`.
- **Guías.** `VALIDACION_HIKVISION_EN_SITIO.md` §8.4.4 dice qué significa cada
  veredicto nuevo de `sitio:audio` y qué se espera en la próxima visita.

## 2 · Cómo se organizó y por qué

### Punto 1 · `process.exit` en los guiones de sitio

**Qué se cambió y qué no, salida por salida.**

| Guion                          | Salida                                                        | Antes                       | Ahora                                                 | Por qué                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------- | --------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `sitio-ensayo.mjs`             | final                                                         | `process.exit`              | `process.exitCode`                                    | La lee el paso 12f por texto («VEREDICTO»)                                                                                                |
| `sitio-ensayo.mjs`             | `--capturar`/`--restaurar`                                    | `process.exit`              | `exitCode` + `return`                                 | Misma clase; sale de `principal`                                                                                                          |
| `sitio-ensayo.mjs`             | `salir` del `--informe` dentro del repositorio                | tardío, tras todo el ensayo | se juzga **antes** de ensayar                         | Era el único `salir` que podía perder salida                                                                                              |
| `sitio-ensayo.mjs`             | `salir` de `.env`, compilación, sin equipos                   | `process.exit`              | se quedan                                             | Una línea antes de que haya nada que perder                                                                                               |
| `puesta-en-marcha-equipos.mjs` | final                                                         | `process.exit`              | `process.exitCode`                                    | La lee el paso 12e y la sonda 38                                                                                                          |
| `puesta-en-marcha-equipos.mjs` | rama `--abrir`                                                | `process.exit`              | espera a que lo escrito **salga** del proceso, y sale | No es final: detrás viene el guion entero. Un `exitCode` exigía envolver 330 líneas en un `else` en un fichero de 908 que no puede crecer |
| `puesta-en-marcha-equipos.mjs` | `salir` de compilación y `--capturar` dentro del repositorio  | `process.exit(2)`           | se quedan                                             | Tempranos                                                                                                                                 |
| `sitio-audio.mjs`              | final                                                         | `process.exit`              | `process.exitCode`                                    | Misma clase                                                                                                                               |
| `sitio-audio.mjs`              | `salir` del informe dentro del repositorio y del `--respaldo` | tardíos                     | se juzgan **al principio** de `principal`             | Igual que en `sitio-ensayo`                                                                                                               |
| `sitio-audio.mjs`              | `salir` de `.env`, compilación, sin equipos                   | `process.exit(2)`           | se quedan                                             | Tempranos                                                                                                                                 |
| `sitio-video.mjs`              | al cerrar go2rtc                                              | `process.exit`              | `process.exitCode`                                    | Misma clase; su salida es de unas líneas                                                                                                  |
| `sitio-video.mjs`              | `--solo-configuracion`, `--preparar`, `salir`                 | `process.exit`              | se quedan                                             | Guardas a mitad de fichero con menos de 2 KB escritos; convertirlas exigía reestructurar                                                  |

`sitio-ensayo` sigue en 300 líneas y `puesta-en-marcha` en 908: lo que entró
se compensó con lo que salió (el cálculo del informe, que estaba duplicado).

**La sonda** (`scripts/lib/sondas/lector-lento-de-sitio.mjs`, invocada desde la
clase 3 de `lector-lento-por-clase.mjs`, que ya invoca `pruebas-negativas.mjs`
sin que ésta crezca): los tres guiones en `--simulado`, por el socket del
lector lento de la 15-S2, con 8 s de espera. Exige código 0 y la última línea
(«VEREDICTO: SIN FALLOS», «Rellénela delante de los equipos», «informe:»); en
`puesta-en-marcha`, además, más de 16 KB. Medido: 15 754, 18 076 y 839 bytes.
Lanza los guiones **sin `NODE_V8_COVERAGE`** (`45c5db3`): la primera corrida del
verificador salió FALLIDA porque, medidos bajo la cobertura del paso 9, diez
módulos de `scripts/lib` que son herramientas de sitio y no controles
(`vispera-de-sitio`, `ensayo-plataforma`, `equipos-del-ensayo`…) entraban en
el trinquete de ramas sin estar en su base (47 bloques). Es el mismo
tratamiento que la sonda 41 de la 15-S5 da a los programas que no son
controles.

**`sitio-audio --simulado`.** Monta `videoporteroDeAudioEnRed` (el doble de
las pruebas del paquete, que `operacion.ts` ahora exporta) con la credencial de
las pruebas, y le pasa a `elegirEquipos` un `sim` con esa ficha, como hace
`sitio-ensayo`. `--semiduplex` lo hace semidúplex. No lee `.env`. Hasta hoy
nada ejecutaba `sitio-audio.mjs`; ahora lo corre la sonda en cada verificación.

### Punto 2 · DT-15S5-08: desde la entrega de la primera trama

`diagnosticarAudio` descontaba 300 ms fijos desde que **empezaba** a mandar el
tono. Un equipo semidúplex habla hasta que le **llega** la primera trama; si la
subida tardaba más de 0,5 s en arrancar, lo que el equipo dijo en ese hueco
contaba como «habló mientras sonaba». Ahora `enviarTono` anota cuándo resolvió
el primer `enviarAudio` y la ventana «mientras sonaba» va desde ahí más los
300 ms de lo que iba en vuelo (`EN_VUELO_MS`) hasta el fin del tono.

Prueba (`diagnostico-de-audio-subida-tardia.test.ts`): el simulado en red
semidúplex y la primera trama de cada sesión retrasada 0, 400, 600 y 900 ms.
**Visto fallar** con el diagnóstico de `develop`: 600 y 900 → «indeterminado».
Con el nuevo, los cuatro → «semiduplex».

### Punto 3 · DT-15S4-01, el lado del diagnóstico

**Dos sesiones.** El `PUT` de subida lo abre el adaptador al abrir la sesión, y
el equipo lo cierra si se queda ocioso. Con una sola sesión el `PUT` esperaba
N segundos de escucha; la primera trama del tono lo encontraba muerto; la
reapertura recibía 400; y el 400 se le colgaba al `sessionId`. Ahora
`sesionDeEscucha` se usa dos veces: escucha, cierra; Enter; abre otra y manda
el tono en el acto. La ventana «del tono» empieza, por construcción, después
del Enter.

**Pausa y tope.** `enviarTono` lee entre trama y trama los `estadosHttp` de la
sesión; cada `PUT audioData 4xx` nuevo es una reapertura rechazada: la trama
siguiente espera 250 ms (`PAUSA_TRAS_RECHAZO_MS`), y pasado el tope
(`REAPERTURAS_MAXIMAS` = 3) el tono se detiene y la línea
`⚠ subida rechazada N veces … el tono se detuvo` lo dice. El adaptador sigue
reabriendo en cada trama (congelado): la pausa está en quien manda las tramas.

**El veredicto del `sessionId`** (`veredicto-de-sesion.ts`, función pura sobre
`estadosHttp`): `usado` · `no lo dio el equipo` · `rechazado (demostrado: sin
él, 2xx)` sólo si tras «se repite sin sessionId» la misma petición obtuvo 2xx ·
`400 de causa no determinada (igual sin sessionId)` si siguió en 400 · `400 de
causa no determinada (no se repitió sin sessionId)` si no hubo ocasión.
`rechazoPorSesion` no cambia: sigue dejando de mandar el id al primer 400,
que es prudente para hablar; lo que cambia es lo que el informe afirma.

Pruebas: `veredicto-de-sesion.test.ts` (los cinco casos, con la secuencia del
09/10) y `diagnostico-de-audio-un-put.test.ts` con el simulado que acepta **un
solo `PUT` por sesión** y cierra la subida ociosa (`putsPorSesion: 1`,
`subidaOciosaMs: 300`): **visto fallar** con el diagnóstico de `develop`
(«sessionId: rechazado»); con el nuevo, «usado», `d.fallo` falso y el segundo
`PUT` aceptado **después** del `indicar`. Y con `putsPorSesion: 0`: «400 de
causa no determinada (igual sin sessionId)», «el tono se detuvo» y ≤ 5
reaperturas en vez de 100.

**Lo que sigue en el adaptador (DT-15S6-01).** `IntercomIsapiPersistente.
enviarAudio` reabre el `PUT` en cada trama rechazada sin pausa ni tope. El
cambio propuesto: una pausa acotada y un tope en el adaptador mismo, para la
guardia; está en `packages/providers/src/videoportero/`, congelado.

### Punto 4 · DT-15S4-02, en la consola

`CanalDeAudioPorWebSocket` cuenta las tramas que **salen** por el socket desde
que se pulsó y las publica en `NivelesDelCanal.tramasEnviadas` (campo
opcional, aditivo). `usarAvisoSinAudio` (gancho propio, 25 líneas) arma un
plazo de 3 s al pasar a «hablando»; vencido con cero tramas, el panel muestra
un `role="alert"`: «Pulse para hablar: no se está enviando audio. Compruebe el
micrófono del navegador y vuelva a pulsar». Sin recuento (un canal que no lo
dé) no se avisa: no se inventa un fallo. Al soltar, o en cuanto sale una
trama, se va. El texto del encargo («Pulsa para hablar») va en usted, como el
resto de la consola.

### Punto 5 · DT-15S5-07

`jwks.test.ts:41` y `puerto-mientras-arranca.test.ts:58,69` escuchan en
`127.0.0.1`. Son tres `listen()` por corrida frente a los cientos de
`crearApp`; el escaneo de `servidores-en-loopback.test.ts` sigue mirando sólo
`apps/api/test`, y lo deja escrito.

### Puntos 6 y 7

DT-15S4-03 y DT-15S5-06 no entran (adaptador congelado; fuera del encargo).
La guía: §8.4.4 de `VALIDACION_HIKVISION_EN_SITIO.md` (filas 2 y 4 y una nota
nueva con los cinco veredictos) y la lista de la próxima visita; una línea en
`ENTREGA_EN_SITIO.md` §9.

## 3 · Árbol de archivos

**Nuevos (todos ≤ 300 líneas):**

```
packages/providers/src/ensayo/
├─ veredicto-de-sesion.ts                        61  qué afirma el informe de un 400; pausa y tope de reaperturas
├─ veredicto-de-sesion.test.ts                   61  los cinco veredictos, con la secuencia del 09/10
├─ diagnostico-de-audio-subida-tardia.test.ts    66  DT-15S5-08: primera trama 0/400/600/900 ms tarde → semidúplex
└─ diagnostico-de-audio-un-put.test.ts           79  DT-15S4-01: un PUT por sesión y la subida ociosa
packages/providers/src/simulacion/
└─ respuestas-del-videoportero.ts                29  las respuestas ISAPI del simulado, fuera para que no pase de 300
scripts/lib/sondas/
└─ lector-lento-de-sitio.mjs                     73  los tres guiones de sitio enteros con un lector lento
apps/web/src/
├─ lib/audio/aviso-sin-audio.ts                  25  el plazo de 3 s con cero tramas
└─ componentes/controles-de-audio-sin-audio.test.tsx 69  el aviso aparece, se va, y no se inventa
docs/etapas/ETAPA-15S6-herramientas-de-sitio.md      este informe
```

**Modificados** (líneas antes → después; ninguno de más de 300 crece):

| Fichero                                                                         | Líneas    | Qué                                                               |
| ------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| `packages/providers/src/ensayo/diagnostico-de-audio.ts`                         | 209 → 275 | Dos sesiones; ventana desde la entrega; rechazos; veredicto       |
| `packages/providers/src/simulacion/videoportero-de-audio.ts`                    | 290 → 296 | `putsPorSesion`, `subidaOciosaMs`; respuestas fuera               |
| `packages/providers/src/operacion.ts`                                           | +2        | Exporta `videoporteroDeAudioEnRed`                                |
| `scripts/sitio-ensayo.mjs`                                                      | 300 → 300 | `exitCode`; el informe se juzga antes                             |
| `scripts/sitio-audio.mjs`                                                       | 198 → 230 | `--simulado`, `--semiduplex`; `exitCode`; `salir` al principio    |
| `scripts/sitio-video.mjs`                                                       | 252 → 252 | `exitCode` al cerrar go2rtc                                       |
| `scripts/puesta-en-marcha-equipos.mjs`                                          | 908 → 908 | `exitCode` final; la rama `--abrir` espera a que salga lo escrito |
| `scripts/lib/sondas/lector-lento-por-clase.mjs`                                 | 103 → 108 | Clase 3: los guiones de sitio                                     |
| `apps/web/src/lib/audio/canal-por-websocket.ts`                                 | 274 → 283 | `tramasEnviadas`                                                  |
| `apps/web/src/componentes/controles-de-audio-ws.tsx`                            | 278 → 286 | El aviso                                                          |
| `apps/api/src/autenticacion/infraestructura/jwks.test.ts`                       | 1 línea   | `127.0.0.1`                                                       |
| `apps/api/src/arranque/puerto-mientras-arranca.test.ts`                         | 2 líneas  | `127.0.0.1`                                                       |
| `docs/guias/VALIDACION_HIKVISION_EN_SITIO.md`, `docs/guias/ENTREGA_EN_SITIO.md` | —         | Veredictos de `sitio:audio`; próxima visita                       |
| `docs/ESTADO_ETAPAS.md`                                                         | —         | Cabecera y ficha                                                  |

## 4 · Tabla SOLID

| Fichero                                                               | S                                                                                 | O                                                                       | L                                                                                             | I                                      | D                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `veredicto-de-sesion.ts`                                              | Una pregunta: qué afirma el informe de un 400                                     | Un veredicto nuevo es una rama nueva de la misma función pura           | —                                                                                             | Dos funciones sueltas y dos constantes | Lee `estadosHttp`, no la sesión                        |
| `diagnostico-de-audio.ts`                                             | Sigue siendo «medir el audio»; la sesión y el tono salen a dos ayudantes internos | Una política nueva (pausa, tope, veredicto) vive fuera                  | El `AudioDiagnosticable` sigue siendo el puerto: el adaptador real y los dobles cumplen igual | Sólo el puerto `AudioDiagnosticable`   | `audio`, `interlocutor` y `ahora` llegan por parámetro |
| `videoportero-de-audio.ts` / `respuestas-del-videoportero.ts`         | El simulado; sus respuestas, aparte                                               | Dos opciones nuevas del guion, sin tocar las existentes                 | Sigue siendo el mismo doble para todas las pruebas que lo usan                                | —                                      | —                                                      |
| `lector-lento-de-sitio.mjs`                                           | Una sonda: los guiones de sitio enteros                                           | Un guion nuevo es una fila                                              | —                                                                                             | Recibe `{ raiz, banco, ok, mal }`      | El lector lento llega importado, no construido         |
| `sitio-audio.mjs`                                                     | Medir el audio en sitio; el simulado es una función aparte                        | `--simulado` es una fuente de equipos más, por la misma `elegirEquipos` | —                                                                                             | —                                      | El simulado entra por `sim`, como en `sitio-ensayo`    |
| `aviso-sin-audio.ts`                                                  | Un gancho, una regla: 3 s con cero tramas                                         | El plazo es parámetro                                                   | —                                                                                             | Tres entradas primitivas               | —                                                      |
| `canal-por-websocket.ts`, `controles-de-audio-ws.tsx`                 | Sin cambio de responsabilidad: un contador y un párrafo                           | Campo opcional: quien no lo lee no cambia                               | Los dobles de las pruebas existentes siguen valiendo (campo opcional)                         | —                                      | —                                                      |
| `sitio-ensayo.mjs`, `sitio-video.mjs`, `puesta-en-marcha-equipos.mjs` | Sin cambio de responsabilidad                                                     | —                                                                       | —                                                                                             | —                                      | —                                                      |

## 5 · Trazabilidad

| Requisito                                              | Cómo queda                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **KPI-33 / CA-19** (audio < 2 s, dúplex)               | La medida en sitio deja de dar «indeterminado» por una subida lenta y de culpar al `sessionId` sin prueba   |
| **ADR-01** (ISAPI TwoWayAudio tras `IntercomProvider`) | El diagnóstico sigue usando el adaptador de producción; el adaptador no cambia                              |
| **RN-21** (credenciales por referencia)                | `--simulado` usa la credencial de las pruebas del paquete, nunca una real; el informe sigue sin IP ni clave |
| **§2.8.0** (un verde que no se reproduce no vale)      | El veredicto de los guiones llega entero a quien lo lee; la sonda lo exige                                  |
| **KPI-12**                                             | Ninguna aserción existente cambia; la suite con MockProvider pasa                                           |

## 6 · Pruebas

**Cómo se ejecutan:** `pnpm --filter @ncr/providers test` (ensayo, 126 pruebas),
`pnpm --filter @ncr/web test` (controles de audio, 46), `pnpm --filter @ncr/api
exec vitest run src/autenticacion src/arranque`, `node
scripts/lib/pruebas-negativas.mjs` (la clase 3 del lector lento), y los guiones:
`pnpm sitio:audio -- --simulado [--semiduplex]`, `pnpm sitio:ensayo --
--simulado`.

**Visto fallar antes de corregir:**

- DT-15S5-08: 600 y 900 ms → «indeterminado» con el diagnóstico de `develop`.
- DT-15S4-01: «sessionId: rechazado» con `putsPorSesion: 1` + subida ociosa;
  y 100 reaperturas con `putsPorSesion: 0`.
- DT-15S5-01/02: tubería de 4 KiB (`F_SETPIPE_SZ`) y lector de 1 KiB cada
  50 ms, desde el árbol de `develop`: `sitio-ensayo --simulado` 4007 bytes,
  `puesta-en-marcha --simulado --con-audio` 4081 bytes, ninguno con VEREDICTO.
  Con la rama: 16 415 y 19 023 (y `--abrir` 2279, `sitio-audio` 925), enteros,
  en las seis combinaciones de tubería (4/16/64 KiB) y lector (rápido/lento).
- DT-15S4-02: el aviso no existía; la prueba nueva lo exige.

**Verificador (§2.8.0):** dos corridas de `./scripts/verificar-etapa.sh --con-base`.

- Primera, sobre `b813cbb` (23:01 → 23:46 UTC): `VERIFICACIÓN DE ETAPA: FALLIDA
— NO se cierra la etapa`. Único rojo: «hay ramas de control que nadie ha
  visto correr» con diez módulos de `scripts/lib` «no está en la base»; causa
  y corrección en §2 (la sonda lanzaba los guiones de sitio con la cobertura
  heredada). No se tocó la base del trinquete.
- Segunda, sobre `45c5db3` (23:48 → 00:30 UTC), veredicto literal:

  `VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe`

  31 de 31 pasos; estabilidad 3/3 idéntica (api 2559 · config 144 ·
  domain-core 483 · edge 331 · providers 1321 · web 826; 568 ficheros
  recogidos y 568 ejecutados en las tres pasadas); el control declarado no
  ejercido es el mismo de la 15-S5 (0 en Linux, con motivo y etapa de
  revisión vigente).

## 7 · Verificación de seguridad (§2.7)

| Medida               | Estado                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos         | Ninguno. `--simulado` usa la credencial de las pruebas del paquete (`servicio` / `clave-de-prueba`); los informes siguen pasando por `sinSecretosConocidos` y van fuera del repositorio |
| 8 · Datos personales | Del audio no se guarda un byte (Ley 1581): el diagnóstico sigue contando y midiendo nivel, nada más                                                                                     |
| 7 · CSP              | El aviso nuevo no lleva `style` ni script en línea                                                                                                                                      |
| Resto                | Sin cambio: ni rutas, ni RLS, ni guardas                                                                                                                                                |

## 8 · Hallazgos, deuda, supuestos y pendientes

**Cerradas en esta ronda.** DT-15S5-01 · DT-15S5-02 · DT-15S5-07 · DT-15S5-08 ·
DT-15S4-01 (diagnóstico) · DT-15S4-02 (consola).

**Hallazgos.**

- **H-15S6-01 · Un `sitio-ensayo --simulado` se quedó colgado una vez, durante
  una recompilación.** Lo incómodo, punto 5. No reproducido con la compilación
  quieta (9 corridas). [Probable] `dist/` a medio escribir.

**Deuda que abre.**

- **DT-15S6-01 · Media · el adaptador reabre la subida en cada trama rechazada,
  sin pausa ni tope.** `IntercomIsapiPersistente.enviarAudio` (congelado). La
  pausa y el tope están hoy en el diagnóstico; la guardia en vivo no los tiene.
  Propuesta: en el adaptador, `PAUSA_TRAS_RECHAZO_MS` y `REAPERTURAS_MAXIMAS`
  de `veredicto-de-sesion.ts`, y un error tipado al tope.
- **DT-15S6-02 · Baja · la API no cuenta las tramas descartadas sin «pulsar».**
  La propuesta original de DT-15S4-02; toca `apps/api/src/guardia/
infraestructura`. PARADA PARCIAL del punto 4: la consola avisa, la API no.

**Sigue abierta.** DT-15S4-03 (el 401 del primer `PUT`; adaptador congelado,
no entraba) · DT-15S5-06 (no entraba).

**Supuestos.** Ninguno nuevo. S-15S5-02 (16 KB en macOS) sigue siendo la razón
de la sonda, no medido aquí.

**Ningún `PENDIENTE DE DEFINICIÓN` nuevo.**

## 9 · Qué debe hacer el usuario manualmente

1. Revisar y fusionar el PR hacia `develop`, el primero de la cadena. Yo no fusiono.
2. **En la próxima visita**, en los dos equipos:
   `pnpm sitio:audio -- --equipo=videoportero --segundos=1` y
   `pnpm sitio:audio -- --equipo=terminal --segundos=1`, y pulsar Enter en
   cuanto pregunte. **Resultado esperado:** «¿se oyó? sí», «sessionId: usado»,
   estados HTTP sin 400 (`open 200, PUT audioData 200, GET audioData 200, close
200` en cada sesión), «dúplex: completo» o «semiduplex», no
   «indeterminado», y ningún `⚠ subida rechazada`. Si sale «400 de causa no
   determinada», anote la línea entera de estados HTTP: el 400 no es del
   `sessionId` (DT-15S4-01, DT-15S6-01).
3. En la consola de guardia, pulsar «Mantener para hablar» 3 s con el
   micrófono bloqueado en el navegador: debe aparecer «no se está enviando
   audio».
4. Para una ronda que pueda tocar el adaptador: DT-15S6-01 y DT-15S4-03.

## 10 · Rama y commits

`etapa-15s6-herramientas-de-sitio`, desde `develop` (`d98c9b1`, merge del PR
#56). PR hacia `develop`, sin fusionar; es la primera de la cadena y las
siguientes la contienen.

| Commit    | Qué                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c687723` | DT-15S5-07: los dos servidores de prueba de `apps/api/src` escuchan en `127.0.0.1`                                                                  |
| `701ff36` | DT-15S5-08 y DT-15S4-01: el diagnóstico mide desde la primera trama entregada, abre el tono tras el Enter y no culpa al `sessionId` sin demostrarlo |
| `1a65cba` | DT-15S5-01 y -02: los guiones de sitio terminan con `exitCode`; `sitio:audio --simulado`; la sonda del lector lento por guion                       |
| `b813cbb` | DT-15S4-02: «no se está enviando audio» en la consola                                                                                               |
| `45c5db3` | La sonda lanza los guiones de sitio sin `NODE_V8_COVERAGE` (la primera corrida del verificador, FALLIDA)                                            |
| cierre    | `chore(etapa-15s6): cierre de etapa` — guías, informe y ESTADO                                                                                      |
