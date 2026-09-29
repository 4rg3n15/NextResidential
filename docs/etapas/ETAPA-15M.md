# ETAPA 15-M · Conexión completa con terminal y videoportero, video en vivo, indicadores fiables y ajustes de consola

**Rama:** `etapa-15m-equipos-y-consola` · **Base:** `develop` (`a46cb56`, merge del PR #34)

> **Encargo (`CORRIGE ETAPA 15`, 2026-09-29):** la visita del 29/09. La cámara
> LPR es la única ruta verificada con hardware y **no cambia su comportamiento
> observable**; terminal y videoportero fallaban por un rechazo de credencial
> falso (E1); no hay video en ningún equipo (E2); el videoportero debe
> reconocer visitantes como la terminal (E3); los receptores de eventos son
> restos de otra plataforma (E4); los indicadores y las alertas mienten (E5).
> Más los requisitos C1 a C10 del cliente. Se entrega en el orden de prioridad
> del encargo y se declara lo no hecho. **La ETAPA 15 sigue BLOQUEADA sólo por
> `BE-02`**.

---

## Bloque 0 · Confirmación o descarte de la evidencia, con archivo:línea

Escrito antes del código. Cada afirmación está etiquetada: **[Cierto]** se lee
en el código o se reprodujo; **[Probable]** es inferencia fundamentada;
**[Suposición]** rellena lo que no se pudo ver.

### 0.1 · E1 · el falso «rechazó el usuario o la clave» — **CONFIRMADO**

**[Cierto] La hipótesis del asesor es la mecánica exacta del código, y la
bitácora del 28/09 cae en una rama concreta.**

| Paso                                             | Dónde                                                                                                                       | Qué hace                                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Una sesión Digest por equipo, compartida         | `packages/providers/src/barrera/digest.ts:267-284`                                                                          | `sesionDigestCompartida` indexa por `(transporte, base, usuario)`: **un** `desafio`, **un** `contador` y **una** marca `rechazadaEn` para la escucha, los sondeos, las órdenes y las cargas de foto del mismo equipo                                                         |
| Autenticación preventiva con el nonce compartido | `equipo/cliente.ts:386` y `:502` (`enviar` → `sesion.autorizacionPara`)                                                     | Si la sesión ya tiene desafío —el que negoció la escucha—, **toda** petición sale con `Authorization` y ese nonce, `nc` incrementado                                                                                                                                         |
| El 401 a esa petición preventiva                 | `equipo/cliente.ts:388-412`                                                                                                 | Dos ramas. **Con** `WWW-Authenticate` y `stale=false` (`:391-404`): `marcarRechazada` → 30 min sin red. **Sin** `WWW-Authenticate` (`:405-412`): anota «el equipo contestó 401 SIN desafío Digest» —la línea literal de la bitácora del 28/09— y devuelve el 401 al llamador |
| Quién convierte ese 401 en «credencial»          | `diagnostico/diagnostico-de-equipo.ts:353-355`; `equipo/errores-del-fabricante.ts:397`; `equipo/escucha-alertstream.ts:227` | El sondeo (`clase: 'credencial'`), el mapa de errores (`401` → credencial) y la escucha (`CredencialRechazada`) leen cualquier 401 sin `stale` como la clave                                                                                                                 |
| La ventana                                       | `equipo/cliente.ts:64` y `:381-384`; `barrera/control-barrera.ts:125`                                                       | 30 minutos (`VENTANA_DE_CREDENCIAL_RECHAZADA_MS`) sin tocar la red, con `CredencialRechazada(hace)`. La cámara comparte esta marca                                                                                                                                           |

- **[Cierto] Los 16–29 ms son viajes de red reales**, no la ventana: la rama
  `:405-412` devuelve el 401 del equipo y el sondeo tarda lo que tarda el
  equipo. La ventana de 30 min responde en 0 ms.
- **[Cierto] Sin `lockStatus` ni `unlockTime` en el cuerpo, no es un bloqueo
  del equipo.** El mapa de errores hoy no distingue ese caso: se añade (E1-f).
- **[Probable] El disparador es el nonce de la escucha.** La escucha de 23 min
  negoció el desafío que quedó en la sesión compartida; cada petición suelta
  lo reutilizó con `nc` creciente. El equipo, que responde `stale="false"` a
  un nonce caducado (evidencia del 28/09), contestó 401 —con o sin desafío—
  y las dos ramas de `conDigest` lo leyeron como clave. `curl --digest` y el
  ensayo no lo ven porque **cada uno arranca sin desafío** y hace el
  intercambio limpio `401 → autenticación → 200`.
- **[Cierto] El criterio (a) del encargo no existe hoy en ninguna de las tres
  superficies**: `conDigest` no sabe si el desafío con que viajó la petición
  se obtuvo en ese mismo intercambio o lo heredó de otra conexión.

**RTSP (`equipo/rtsp-describe.ts:163-180`): la [Suposición] del encargo se
DESCARTA en el código.** La sonda hace un intercambio limpio por conexión:
`DESCRIBE` sin credencial → 401 → una `DESCRIBE` autenticada con el desafío de
ese mismo 401. No hay nonce cacheado que caducar. El 401 del videoportero por
RTSP tiene otra causa, y sin el equipo no se puede afirmar cuál. Lo que sí se
hace: el ensayo anotará el desafío recibido y la cabecera enviada (sin la
clave) para que la visita lo capture, y la sonda probará también `Basic` si
el Digest falla. Candidatas **[Suposición]**: `qop` ausente o distinto en el
RTSP del KD9633, `realm` distinto del HTTP, o el camino `/Streaming/Channels/…`
que ese modelo no expone por RTSP con esta credencial.

### 0.2 · E2 · video en vivo — **CONFIRMADOS los dos fallos con el binario real**

Se obtuvo el binario real de go2rtc (`@camera.ui/go2rtc-linux-x64`
1.9.14, en el scratchpad, fuera del repositorio) y se reprodujo:

| Fallo                                   | Dónde                                                                 | Reproducción con el binario                                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400 yaml: … did not find expected key` | `scripts/sitio-video.mjs:111` (`streams: {}`)                         | **[Cierto]** con `streams: {}` en el YAML, `PUT /api/streams` responde `400 yaml: line 7: did not find expected key`: el parche textual de go2rtc no sabe insertar bajo un mapa en línea                                                                                                                                               |
| La credencial queda en disco            | `apps/api/src/guardia/infraestructura/puente-go2rtc.ts:64-71` (`PUT`) | **[Cierto]** sin `streams:` el `PUT` responde 200 **y escribe** `streams:\n  prueba:\n    - rtsp://u:p@…` en el YAML. Contradice RN-21                                                                                                                                                                                                 |
| Sin persistir                           | —                                                                     | **[Cierto]** `PATCH /api/streams?name=&src=` responde 200, crea el flujo **en memoria** y el YAML **no cambia**. `POST /api/webrtc?src=<url>` sin registrar da `404 stream not found` en esta compilación                                                                                                                              |
| `HTTP 500 · EOF` al negociar            | `puente-go2rtc.ts:73-89`                                              | **[Probable]** el «backchannel» ONVIF: go2rtc pide el audio de vuelta en el `DESCRIBE` y el equipo cierra. Se reproduce con el simulador RTSP (que hoy sólo contesta `DESCRIBE`, `simulacion/servidor-rtsp.ts:81`) cerrando la conexión ante `Require: www.onvif.org/ver20/backchannel`, y se corrige con `#backchannel=0` en el `src` |

La lectura de la lista de flujos de go2rtc ya devuelve `rtsp://***@…`
(redactado); el registro de go2rtc no imprimió la clave en las pruebas.

> **Corrección posterior (al cierre).** Eso vale para la compilación de
> camera.ui que se usó aquí. La versión **oficial** v1.9.14 —la que descargan
> `pnpm sitio:video` y el verificador— devuelve la fuente **en claro** por
> `GET /api/streams`. Lo que se garantiza es el disco (el YAML nunca la
> guarda); la API de go2rtc escucha sólo en `127.0.0.1`.

### 0.3 · E3 · rostros en el videoportero — **CONFIRMADO: el camino existe y un campo lo rompe**

- **[Cierto]** `hikvision/hikvision-provider.ts:771-786` (`bibliotecaDe`): para
  un equipo que no es terminal construye el **mismo** `TerminalFacial` con
  `modo: 'decide_el_equipo'`. El videoportero ya usa las rutas de la terminal:
  `POST …/UserInfo/Record` y `POST …/FDLib/FaceDataRecord` multipart
  (`equipo/catalogo-de-rutas.ts:247-289`), que son las que el KD9633 declara
  (`post` en FDLib, sin `setUp`).

  > **Corrección posterior (al escribir E3).** Esta línea era **inexacta**. En
  > `a46cb56` el videoportero cargaba la cara por la ruta de la terminal,
  > `PUT …/Intelligent/FDLib/FDSetUp`, y el catálogo **no tenía** > `POST …/FDLib/FaceDataRecord`. Contra un equipo que declara `post` y no
  > `setUp`, esa carga habría fallado igual que el `userType`. E3 añadió la
  > ruta al catálogo (documentada, S-107) y elige la operación por lo que la
  > biblioteca declara (`terminal/forma-del-alta.ts`).

- **[Cierto]** `terminal/persona-en-el-equipo.ts:136`: con vigencia, la
  persona se da de alta con `userType: 'visitor'` **sin mirar lo que el
  equipo admite**. El KD9633 sólo admite `normal`: el alta fallaría con un
  400 que hoy se leería como «foto rechazada». Es el punto exacto que E3
  pide gobernar por capacidad.
- **[Cierto]** `apps/api/src/equipos/aplicacion/terminales-de-rostros.ts:72`:
  «aún no se sabe si admite rostros» sale cuando `bibliotecaDeRostros.estado`
  no es `si` ni `no`, y eso es lo que deja el sondeo cuando E1 lo tumba. **La
  omisión es consecuencia de E1**, no de una capacidad ausente.
- **[Cierto] Faltan los extractos ISAPI del KD9633**: `docs/hikdocs/` no está
  en este entorno. Las rutas que usa hoy el adaptador para el videoportero
  son las de la terminal, y se marcan **[SUPUESTO] S-107** hasta tener:
  «Access Control → UserInfo/Record (JSON)», «UserInfo/capabilities»,
  «Intelligent/FDLib/FaceDataRecord (multipart)» y «FDLib/FDSearch» del
  DS-KD9633. **Pedidos al usuario en el informe de avance.**

### 0.4 · Qué NO se toca sin avisar

- **La ruta de la cámara** (lectura → `POST /alarm-server/<secreto>` →
  decisión → relé) comparte `SesionDigest` y `conDigest`. Antes de tocarlos se
  escribe la suite de regresión del 28/09 (`packages/providers/src/barrera/regresion-camara-28-09.test.ts`
  y `apps/api/test/regresion-camara-28-09.e2e.test.ts`) y se exige verde sin
  cambiar una aserción.
- El dominio (`packages/domain-core`) no se toca en ningún bloque.

---

## Avance

Entregado en el orden de prioridad del encargo. Cada fila es un commit en la
rama; los que agrupan bloques lo dicen y el motivo está en
[Lo que se hizo distinto del encargo](#lo-que-se-hizo-distinto-del-encargo).

| Orden | Bloque                     | Estado | Commit    | Qué queda                                                                                                 |
| ----- | -------------------------- | ------ | --------- | --------------------------------------------------------------------------------------------------------- |
| 1     | 0 · evidencia              | Hecho  | `e7d18ba` | Una línea de §0.3 era inexacta; corregida arriba                                                          |
| 2     | Regresión de la cámara     | Hecho  | `c22f05b` | Nada. Sus aserciones no se tocaron en toda la etapa                                                       |
| 2     | E1 / C8 · Digest           | Hecho  | `aa7bbbc` | Confirmar en sitio con la escucha abierta (lista final, terminal y videoportero)                          |
| 3     | E2 / C1 · video            | Hecho  | `dbdc79c` | El 401 RTSP del videoportero no se reprodujo: el ensayo anota el esquema para capturarlo                  |
| 4     | E3 / C2 · rostros          | Hecho  | `38bc27e` | Las rutas del KD9633 están documentadas, no verificadas (S-107): extractos pedidos al final               |
| 5     | E5 / C7 · estado y alertas | Hecho  | `a7209c7` | Agrupado con E4 y C6                                                                                      |
| 6     | E4 · receptores            | Hecho  | `a7209c7` | —                                                                                                         |
| 7     | C10 · guardia y portería   | Hecho  | `4b10da3` | Agrupado con C4, C9 y C5                                                                                  |
| 8     | C4 y C9 · bajas y placa    | Hecho  | `4b10da3` | —                                                                                                         |
| 9     | C6 · N equipos             | Hecho  | `a7209c7` | —                                                                                                         |
| 10    | C3 · residente en la web   | Hecho  | `73f4a68` | Lo que no incluye está en §8                                                                              |
| 11    | C5 · fechas                | Hecho  | `4b10da3` | —                                                                                                         |
| 12    | Otros fallos               | Hecho  | `e0c1b5d` | Los que pedía el encargo                                                                                  |
| 12    | Búsqueda activa            | Hecho  | `c998316` | 8 de 12 corregidos; los otros 4, con su motivo, en [Otros fallos](#otros-fallos-encontrados-y-corregidos) |
| —     | Verificador                | Hecho  | `55cbabc` | El paso 5 pone go2rtc real (v1.9.14 fijada por huella) en vez de saltarse sus pruebas                     |
| —     | Herramientas de sitio      | Hecho  | `37a94e1` | Rutas de menú `[SUPUESTO]`: los manuales de los tres modelos no están en el repositorio                   |

**La ruta de la cámara no cambió su comportamiento observable.** Las dos suites
de regresión del 28/09 están en verde sin una aserción cambiada. En la versión
de la API sólo cambió un comentario, porque el control KPI-11 lo marcaba.

---

## Lo que se hizo distinto del encargo

1. **Tres commits agrupan bloques, en vez de uno por bloque.** `a7209c7` junta
   E5/C7, E4 y C6, y `4b10da3` junta C10, C4, C9 y C5. Comparten los mismos
   ficheros del módulo de equipos (controlador, repositorio, configuración en
   sitio, ensayo) y de la consola. Separarlos dejaba commits intermedios que no
   compilaban o no pasaban la suite. Se eligió que cada commit compile y pase
   entero.
2. **«Configurar / Sincronizar / Reiniciar · sólo registra» se ocultan, no se
   convierten en acciones.** Con un proveedor que no los ejecuta, la pantalla
   ya no los enseña y dice por qué. Convertirlos en acciones reales pedía rutas
   ISAPI por capacidad que no están verificadas en ningún equipo del sitio.
   Mostrar un botón que no llega al equipo era el fallo que se vio en sitio.
3. **C6 retiró un respaldo que tocaba la ruta de la cámara.** Hubo un decorador
   que usaba la barrera del `.env` como respaldo de cualquier cámara no
   registrada. Con N cámaras abriría la barrera equivocada, y cambiaba la ruta
   de la cámara. Se retiró antes del commit, conforme a la regla dura. N
   cámaras registradas accionan su propio relé por el proveedor.
4. **El commit del Bloque 0 lleva otra atribución de coautoría** que los demás.
   Refleja el modelo que servía la sesión en ese momento. No se reescribió la
   historia de la rama.

---

## 1 · Qué se construyó

La visita del 28/09 dejó una cámara que funcionaba y dos equipos que la
plataforma declaraba muertos. La causa principal era de la plataforma, no de
los equipos. La escucha larga de la terminal negociaba un nonce Digest que
todas las demás peticiones heredaban. Cuando ese nonce caducaba, el equipo
contestaba 401 y la plataforma lo leía como «usuario o clave». Dejaba entonces
de hablarle al equipo durante treinta minutos. Esta etapa separa esas dos
cosas: un 401 a un nonce heredado provoca **un** intercambio limpio, y sólo el
401 a ese intercambio es la credencial.

Sobre esa base, la terminal y el videoportero completan en simulación el
circuito entero: sondeo, escucha, apertura, alta y baja de rostro y
verificación remota, sin un solo rechazo falso. El video pasa por go2rtc sin
dejar la credencial en disco y negocia con el binario real. El videoportero da
de alta rostros según lo que declara: persona `normal` si no admite
`visitor`, y carga por `POST FaceDataRecord` si no declara `setUp`.

El estado de cada equipo sale de una sola función, y la lista, la ficha y el
tablero dicen lo mismo. Las alertas se abren una por condición y se archivan
con motivo, nunca se borran. La ficha enseña el receptor de cada equipo y
apaga el huérfano. La plataforma admite N equipos de cada tipo con cualquier
IP: cada cámara tiene su secreto de Alarm Server, cada videoportero su sesión
de audio, y el ensayo, la puesta en marcha y el respaldo leen el registro de la
consola.

La consola gana el selector de equipo en vivo en guardia y portería, bajas con
motivo de equipos y de residentes, la confirmación de placa y fechas sin
ambigüedad. El residente tiene sus ocho pantallas en la web. La API contesta
503 mientras arranca y se apaga en orden, y la consola distingue una API caída
de un error.

---

## 2 · Cómo se organizó y por qué

**E1 · el criterio de «credencial rechazada» vive en un solo sitio.**
`conDigest` en `equipo/cliente.ts` sabe ahora si el desafío con que viajó la
petición se obtuvo en ese mismo intercambio o se heredó. Un 401 a una
petición preventiva descarta el nonce y hace un intercambio limpio, con o sin
desafío y diga lo que diga `stale`. La escucha larga abre con su propia sesión
Digest. La marca de rechazo y el contador `nc` por nonce se comparten por
equipo (`barrera/marca-de-credencial.ts`), así que dos conexiones con el mismo
nonce nunca repiten `nc`. El cálculo puro del resumen se separó a
`barrera/digest-calculo.ts`. El cuerpo `<userCheck>` se lee en
`equipo/user-check.ts`: si el equipo declara bloqueo, la marca dura ese tiempo
y el mensaje lo dice.

**La regresión de la cámara se escribió antes que el arreglo.** Es la única
ruta verificada con hardware y comparte el cliente Digest. Las dos suites
(`barrera/regresion-camara-28-09.test.ts` y
`apps/api/test/regresion-camara-28-09.e2e.test.ts`) fijan su comportamiento
observable, con dos órdenes seguidas (H-SITIO-12). Ninguna aserción se tocó.

**E2 · go2rtc en memoria, nunca en disco.** El puente registra cada flujo con
`PATCH` en vez de `PUT`, y el fichero YAML no guarda ninguna URL RTSP. El
guion de video retira cualquier bloque `streams:` al arrancar y al cerrar y
deja el fichero en `0600`. `#backchannel=0` evita que go2rtc pida el canal de
retorno ONVIF, que es lo que cerraba la conexión. Sin STUN, la negociación
deja de tardar 5 s exactos. Todo se probó contra el binario real 1.9.14.

**E3 · la forma del alta se decide por capacidades, en una función pura.**
`terminal/forma-del-alta.ts` recibe lo que el equipo declara (`userType`,
`FDLibCap.supportFunction`) y devuelve el tipo de persona y la operación de
carga. Si el equipo no declara ninguna operación, devuelve `RutaNoSoportada`
antes de dar de alta a la persona. Así no queda nada a medias. La plataforma
sigue gobernando la vigencia (RN-11); el `Valid` del equipo es una segunda
barrera.

**E5 · una sola fuente de verdad del estado.** `estadoDelEquipo()` es pura y
con reloj inyectado: combina alcanzable, autenticación, escucha, último evento
y último latido. La usan la lista, la ficha y el tablero. `estado_salud` se
escribe con el resultado real de cada latido. Las alertas de equipo pasan por
`AbrirAlertaDeEquipo`, que deduplica por equipo, tipo, clave y ventana. Lista
negra y pánico nunca se deduplican. La alerta lleva la hora de recepción, así
que un reloj de cámara adelantado ya no produce latencias negativas.

**C6 · los singletons se sustituyeron por el registro.** El secreto de Alarm
Server lo emite la API al dar de alta una cámara y lo guarda cifrado con su
huella (0045). El receptor lo acredita por huella en tiempo constante. La
entrada de `ALARM_SERVER_EQUIPOS` sigue valiendo, así que la cámara de hoy no
se toca. Las sesiones de audio van por videoportero.

**C3 · el residente reutiliza los endpoints de la app.** La consola no ganó
ninguna ruta de API. Las ocho pantallas bajo `/mi` llaman a los mismos
endpoints `…/mi/…` que la app, con su RBAC. La vivienda la resuelve el
servidor desde el token (RN-15). Es la decisión del cliente D-12, registrada
como C-44 y E-06.

**Otros fallos · el apagado respeta el orden de las dependencias.** Nest llama
a `onApplicationShutdown` en el mismo orden que al arrancar, con los módulos
más profundos primero. El pool de PostgreSQL es de los más profundos, así que
se cerraba antes que las escuchas, los latidos y el planificador. Esos tres
paran ahora en `beforeApplicationShutdown`, que corre antes de cualquier
`onApplicationShutdown`. La prueba monta el contenedor real de Nest y se vio
fallar con los ganchos anteriores.

---

## 3 · Árbol de archivos (selección)

```
packages/providers/src/
  barrera/digest-calculo.ts                 cálculo puro del resumen Digest
  barrera/marca-de-credencial.ts            marca de rechazo y contador nc por equipo
  barrera/regresion-camara-28-09.test.ts    regresión de la cámara, antes del arreglo
  equipo/cliente.ts                         conDigest: intercambio limpio ante un nonce heredado
  equipo/user-check.ts                      lee lockStatus, unlockTime y retryTimes
  equipo/cliente-e1-nonce-cacheado.test.ts  los cuatro casos del encargo
  hikvision/canales-de-video.ts             canales que el equipo declara, con su códec
  hikvision/reconexion-terminal-videoportero-15m.test.ts   C8 de punta a punta
  hikvision/rostros-en-videoportero-15m.test.ts            E3 con las capacidades del KD9633
  terminal/forma-del-alta.ts                tipo de persona y carga por capacidades
  ensayo/paso-de-video-webrtc.ts            paso 7: PATCH, negociación WebRTC y medida
  ensayo/respaldo-de-configuracion.ts       respaldo por familia y serie
  ensayo/respaldo-en-sitio.test.ts          el guion de respaldo contra 2+2+2 equipos
  simulacion/go2rtc-de-pruebas.ts           arranca el binario real si GO2RTC_BIN existe
  simulacion/rtsp-mensajes.ts               RTSP completo del simulador, con backchannel
apps/api/src/
  arranque/puerto-mientras-arranca.ts       503 con Retry-After mientras se construye la API
  arranque/cierre-ordenado.ts               SIGINT/SIGTERM con plazo y segunda señal
  alarmserver/orden-de-apagado.test.ts      el pool se cierra el último
  equipos/aplicacion/estado-del-equipo.ts   la única fuente de verdad del estado
  equipos/aplicacion/secretos-de-alarm-server.ts   secreto por cámara
  equipos/aplicacion/retiro-de-plantillas.ts       baja de equipo: rostros antes
  eventos/aplicacion/deduplicacion-de-alertas.ts   una alerta por condición
  biometria/aplicacion/retirar-de-equipo.ts        retira del equipo lo sincronizado
  visitas/aplicacion/confirmacion-de-placa.ts      «Placa XXX registrada para la visita…»
  guardia/aplicacion/causas-de-video.ts            errores de video en palabras
apps/api/test/regresion-camara-28-09.e2e.test.ts   la cámara del 28/09 contra PostgreSQL
apps/web/src/
  app/(consola)/mi/**                       las ocho pantallas del residente
  app/(consola)/guardia/equipos-en-vivo.tsx selector de equipo en vivo
  app/(consola)/eventos/alertas-abiertas.tsx cola con archivo y filtros
  app/(consola)/dispositivos/baja-de-equipo.tsx     baja con motivo y reactivación
  app/(consola)/dispositivos/canal-de-video.tsx     lista de canales del equipo
  app/(consola)/residentes/baja-de-residente.tsx    baja de residente con motivo
  lib/fechas.ts                             DD-MM-YYYY y rangos con fecha en los dos extremos
supabase/migrations/…0044_estado_del_equipo_y_archivo_de_alertas.sql
supabase/migrations/…0045_secreto_de_alarm_server_por_camara.sql
supabase/reversion/0044_revert.sql · 0045_revert.sql
supabase/policies/tests/99b_estado_del_equipo_y_archivo_de_alertas.sql
scripts/lib/go2rtc-yaml.mjs                 retira streams: del YAML de go2rtc
scripts/lib/equipos-del-registro.mjs        el ensayo lee los equipos de la consola
scripts/lib/respaldo-en-sitio.mjs           --capturar / --restaurar por familia y serie
docs/guias/VISITA-29-09.md                  los ajustes de cada equipo y su comprobación
```

---

## 4 · Tabla SOLID (lo creado en la etapa)

| Fichero                                   | SRP                                    | OCP                                                       | LSP                                                | ISP                                      | DIP                                                 |
| ----------------------------------------- | -------------------------------------- | --------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| `barrera/digest-calculo.ts`               | Sólo el cálculo del resumen            | Un algoritmo nuevo es otra rama de la función pura        | —                                                  | Funciones sueltas, sin clase             | Sin I/O                                             |
| `barrera/marca-de-credencial.ts`          | Marca de rechazo y `nc` por nonce      | Otro criterio de marca no toca el cliente                 | —                                                  | Dos métodos de marca y uno de contador   | La inyecta el cliente; el reloj llega de fuera      |
| `equipo/user-check.ts`                    | Leer `<userCheck>`                     | Una etiqueta nueva es una línea                           | —                                                  | Una función de lectura y una de palabras | Sin I/O                                             |
| `terminal/forma-del-alta.ts`              | Decidir tipo de persona y carga        | Una operación nueva es un caso más, no un `if` por modelo | Terminal y videoportero pasan por la misma función | Recibe sólo las capacidades              | Sin I/O; el proveedor le pasa lo declarado          |
| `equipos/aplicacion/estado-del-equipo.ts` | Una fuente de verdad del estado        | Una señal nueva es un campo más                           | —                                                  | Entrada mínima: señales y reloj          | Reloj inyectado; sin repositorio                    |
| `eventos/…/deduplicacion-de-alertas.ts`   | Abrir o no abrir una alerta            | Las excepciones (lista negra, pánico) son un conjunto     | —                                                  | Un caso de uso, un método                | Depende del puerto de alertas, no de PostgreSQL     |
| `equipos/…/secretos-de-alarm-server.ts`   | Emitir y acreditar secretos            | Otra bóveda es otro adaptador                             | Memoria y PostgreSQL intercambiables               | Tres métodos del puerto                  | El módulo declara el puerto; el receptor lo consume |
| `biometria/…/retirar-de-equipo.ts`        | Retirar lo sincronizado en un equipo   | —                                                         | —                                                  | Un método                                | Puerto de plantillas y del proveedor                |
| `arranque/puerto-mientras-arranca.ts`     | Contestar 503 hasta que Nest escuche   | —                                                         | —                                                  | `cerrar()` y nada más                    | Sólo `node:http`                                    |
| `arranque/cierre-ordenado.ts`             | Traducir señales a un cierre con plazo | —                                                         | —                                                  | `CerrablePorSenal`: dos métodos          | Proceso, salida y bitácora inyectados               |
| `app/(consola)/mi/**`                     | Una pantalla por archivo               | Una pantalla nueva es una entrada de menú                 | —                                                  | Cada una usa sólo sus consultas          | Cliente generado desde OpenAPI                      |

Ningún adaptador lanza `NotImplemented`. El dominio (`packages/domain-core`)
no se tocó. **Ocho ficheros cruzaron las 300 líneas en esta etapa**
(DT-15M-01, §8).

---

## 5 · Trazabilidad

| Bloque       | Cubre                                                                                          | Parcial, y por qué                                                            |
| ------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| E1 / C8      | OE-03, OE-07 · RN-12, RN-21 · CA-26 · KPI-12                                                   | Sin equipo real: la visita confirma con la lista final                        |
| E2 / C1      | OE-07 · RN-21 · CA-19 · KPI-33                                                                 | KPI-33 extremo a extremo se mide en la consola en sitio; aquí, la negociación |
| E3 / C2      | OE-04 · RN-09, RN-11 · CA-09, CA-10, CA-11 · HU-13, HU-14, HU-15 · KPI-16, KPI-17, KPI-18      | Rutas del KD9633 documentadas, no verificadas (S-107)                         |
| E4           | RN-12, RN-21                                                                                   | —                                                                             |
| E5 / C7      | OE-05 · RN-02, RN-18, RN-19 · CA-18, CA-26 · KPI-25                                            | KPI-25 con reloj real del equipo, en sitio                                    |
| C10          | OE-07 · RN-08 · CA-16, CA-17, CA-20 · HU-21 a HU-29 · KPI-32                                   | —                                                                             |
| C4           | RN-11, RN-19 · CA-02                                                                           | Los rostros que el equipo no quite quedan pendientes y dichos                 |
| C9           | RN-04, RN-11, RN-13, RN-19 · CA-02, CA-03 · HU-07                                              | —                                                                             |
| C5           | HU-07 (la vigencia que ve quien autoriza)                                                      | —                                                                             |
| C6           | OE-03 · RN-15, RN-21 · KPI-11                                                                  | —                                                                             |
| C3           | OE-02 · RN-05, RN-13, RN-15 · HU-05, HU-07 a HU-11, HU-19, HU-33, HU-34                        | Lo que no incluye, en §8                                                      |
| Otros fallos | RN-19 (respaldo sin pisar) · disponibilidad de la API (KPI-28 a KPI-31, en su parte de la API) | —                                                                             |

---

## 6 · Pruebas

### Qué se probó y cómo

- **E1:** `cliente-e1-nonce-cacheado.test.ts` recorre los cuatro casos del
  encargo con un simulador que rota el nonce con la escucha abierta, contesta
  401 sin desafío o con `stale=false` a un nonce caducado, y rechaza de verdad
  una clave errónea. Sólo el cuarto termina en «credencial rechazada», con un
  único resumen malo.
- **C8:** `reconexion-terminal-videoportero-15m.test.ts` hace sondeo, escucha,
  tres aperturas, alta y baja de rostro y verificación remota con el nonce
  caducando entre pasos. Cero resúmenes malos.
- **Cámara:** las dos suites del 28/09, sin una aserción cambiada.
- **E2:** contra el binario real de go2rtc 1.9.14 (`GO2RTC_BIN`): `PATCH` no
  persiste la clave, sin `#backchannel=0` aparece el EOF y con él llega el SDP.
- **E3:** `rostros-en-videoportero-15m.test.ts` con las capacidades del KD9633
  del 28/09, incluida una prueba negativa con el alta de antes.
- **E5, E4, C6:** `estado-del-equipo.test.ts`, `deduplicacion-de-alertas.test.ts`,
  `alarm-server-por-camara-pg.e2e.test.ts`, la prueba RLS 99b y el ensayo
  simulado con dos equipos de cada tipo.
- **C4, C9:** `baja-de-residente-pg.test.ts`, `retirar-de-equipo.test.ts`,
  `confirmacion-de-placa.test.ts` y las pruebas de la consola.
- **C3:** `mi/formularios.test.tsx` y `mi/pantallas-lectura.test.tsx`: cuerpo
  enviado, `puedeAutorizar` y estados de cada pantalla.
- **Búsqueda activa:** `controles-de-audio.test.tsx`, `salir-de-la-cola.test.tsx`,
  `use-cuando-al-abrir.test.tsx`, `ficha-dialogo.test.tsx`, `fechas.test.ts`,
  `vigilancia-latidos.test.ts`, `tablero-pg.test.ts` y la 7b de
  `porteros-por-identificador-pg.test.ts`; cada una vista fallar con el
  código anterior.
- **Otros fallos:** `puerto-mientras-arranca.test.ts`, `cierre-ordenado.test.ts`,
  `orden-de-apagado.test.ts` (vista fallar con los ganchos anteriores),
  `whep.test.ts` y `respaldo-en-sitio.test.ts` (vista fallar con el guion
  anterior en sus dos casos nuevos).

Para ejecutarlas: `./scripts/verificar-etapa.sh --con-base`, con
`DATABASE_URL_PRUEBAS` apuntando a una base de pruebas y Flutter en el `PATH`.
El ensayo simulado: `pnpm sitio:ensayo -- --simulado`.

### Resultado

Corrida final del verificador, sobre `55cbabc`, con `--con-base` y sin tocar
el árbol mientras corría:

| Paquete                       | Pruebas                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| API (`@ncr/api`)              | 1640; 1635 en el paso 5 y 5 DECLARADAS que ejerce el paso 12b |
| Equipos (`@ncr/providers`)    | 1050, las cuatro de go2rtc real incluidas                     |
| Consola (`@ncr/web`)          | 652                                                           |
| Dominio (`@ncr/domain-core`)  | 438                                                           |
| Configuración (`@ncr/config`) | 144                                                           |
| Edge (`@ncr/edge`)            | 101                                                           |
| App (Dart)                    | 367                                                           |

| Capa (§2.4) | Líneas  | Ramas   | Umbral |
| ----------- | ------- | ------- | ------ |
| Dominio     | 96,20 % | 96,91 % | 90 %   |
| Aplicación  | 96,65 % | 89,58 % | 90 %   |
| Global      | 85,84 % | 86,29 % | 70 %   |

31 de 31 pasos ejecutados; la suite da lo mismo en tres corridas forzadas; 358
de 358 ficheros de prueba recogidos. El control declarado no ejercido es el
paso 5e en Linux (el recorrido de la app en un navegador de macOS), con su
motivo en el propio verificador.

Las dos corridas anteriores salieron FALLIDAS y se dicen: la primera se cortó
con el reinicio del contenedor tras marcar un 404 en el paso 12c que no se
reprodujo; la segunda, por las pruebas de go2rtc saltadas (corregido en
`55cbabc`) y por una corrida del paso 14 contaminada por una ejecución manual
en el mismo árbol.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

```
▸ 5 · suite completa
   ✓ go2rtc real para las pruebas del puente de video: <repo>/.sitio/bin/pruebas-v1.9.14/go2rtc
   @ncr/config:test:       Tests  144 passed (144)
   @ncr/edge:test:       Tests  101 passed (101)
   @ncr/domain-core:test:       Tests  438 passed (438)
   @ncr/providers:test:       Tests  1050 passed (1050)
   @ncr/web:test:       Tests  652 passed (652)
   @ncr/api:test:       Tests  1635 passed | 5 skipped (1640)
   ⚠ suite sin rojas · las saltadas están DECLARADAS y se ejercen en otro paso
       las 5 están DECLARADAS y se ejercen en otro paso
   ✓ omisiones por falta de base: ninguna · 28 fichero(s) de prueba usan la base por apps/api/test/base-exigida.ts, todos con su guardián · 6 informe(s) leído(s)

▸ 5c · app móvil: suite de Dart y cobertura POR CAPA
   00:49 +367: All tests passed!
   ✓ dominio           98.05 % (umbral 90 %, 302/308 líneas)
   ✓ aplicacion        96.89 % (umbral 90 %, 280/289 líneas)
   ✓ configuracion    100.00 % (umbral 70 %, 33/33 líneas)
   ✓ infraestructura   89.62 % (umbral 60 %, 639/713 líneas)
   ✓ presentacion      89.04 % (umbral 50 %, 2064/2318 líneas)
   ✓ resto             21.57 % (umbral 0 %, 11/51 líneas)
   ✓ global            89.68 % (umbral 70 %, sin contar lo generado)
   – 981 líneas generadas, excluidas del cómputo a propósito
   ✓ cobertura de la app dentro de los umbrales por capa
   ✓ la suite de Dart da lo mismo en otro huso (Pacific/Auckland): ninguna prueba depende del reloj del sistema

▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 358 de 358 ficheros de prueba ejecutados

▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 96.20 % · ramas 96.91 % · funciones 96.04 % (umbral 90 %, 40 archivos)
     OK   aplicacion (**/aplicacion/**): lineas 96.65 % · ramas 89.58 % · funciones 97.49 % (umbral 90 %, 108 archivos)
     OK   global: lineas 85.84 % · ramas 86.29 % · funciones 84.49 % (umbral 70 %, 734 archivos)
   ✓ las tres capas cumplen su umbral


   ✓ declaraciones: 1 paso(s) declarado(s) no ejercido(s), 0 de ellos en linux, con motivo y etapa de revisión vigente

▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
      corrida 1/3: codigo 0 · @ncr/api:test: Tests 1640 passed (1640) · @ncr/config:test: Tests 144 passed (144) · @ncr/domain-core:test: Tests 438 passed (438) · @ncr/edge:test: Tests 101 passed (101) · @ncr/providers:test: Tests 1050 passed (1050) · @ncr/web:test: Tests 652 passed (652)
      corrida 2/3: codigo 0 · @ncr/api:test: Tests 1640 passed (1640) · @ncr/config:test: Tests 144 passed (144) · @ncr/domain-core:test: Tests 438 passed (438) · @ncr/edge:test: Tests 101 passed (101) · @ncr/providers:test: Tests 1050 passed (1050) · @ncr/web:test: Tests 652 passed (652)
      corrida 3/3: codigo 0 · @ncr/api:test: Tests 1640 passed (1640) · @ncr/config:test: Tests 144 passed (144) · @ncr/domain-core:test: Tests 438 passed (438) · @ncr/edge:test: Tests 101 passed (101) · @ncr/providers:test: Tests 1050 passed (1050) · @ncr/web:test: Tests 652 passed (652)
   ✓ OK estabilidad: 3 corridas forzadas (sin caché de turbo) con resultado idéntico y ningún error sin manejar

▸ 15 · ningún paso declarado se quedó sin ejecutar
   ✓ OK 31 de 31 pasos ejecutados

VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

---

## 7 · Verificación de seguridad (§2.7)

| Medida            | En esta etapa                                                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 · Secretos      | El secreto de Alarm Server por cámara se guarda cifrado (AES-GCM) y se busca por huella (HMAC). El YAML de go2rtc no guarda credenciales y queda en `0600`; la API de go2rtc, que en su versión oficial devuelve la fuente en claro, escucha sólo en `127.0.0.1`. RTSP y Digest anotan esquema y desafío, nunca la clave |
| 2 · CORS          | Sin cambios                                                                                                                                                                                                                                                                                                              |
| 3 · Validación    | DTO con motivo mínimo en bajas y archivo de alertas. Una visita de 0 minutos se rechaza en el DTO y en el caso de uso; el dominio ya la impedía                                                                                                                                                                          |
| 4 · SQL           | Migraciones 0044 y 0045 parametrizadas y reversibles (`supabase/reversion/`)                                                                                                                                                                                                                                             |
| 5 · Rate limiting | «Desactivar el receptor huérfano» con límite propio. Archivo de alertas y baja de residente, bajo el límite global                                                                                                                                                                                                       |
| 6 · RLS           | No hay tablas nuevas: las columnas de 0044 y 0045 viven en `dispositivos` y `alertas`, con la RLS forzada de antes, y la prueba 99b cubre el estado y el archivo. El receptor toma la copropiedad del equipo dueño del secreto                                                                                           |
| 7 · CSP           | Sin cambios                                                                                                                                                                                                                                                                                                              |
| 8 · Transversales | Bajas y archivo sin borrado físico (RN-19), con autor, instante y motivo en la auditoría. El residente usa sólo sus endpoints (`@Roles('residente')`)                                                                                                                                                                    |

Las IPs y credenciales de los equipos viven sólo en el `.env` del usuario o en
la consola, cifradas. Los documentos usan direcciones de documentación
(RFC 5737).

---

## Otros fallos encontrados y corregidos

Los que pedía el encargo, más los que salieron de buscarlos:

| Fallo                                                                               | Cómo se vio                                          | Estado    |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| El puerto de la API rechazaba conexiones mientras arrancaba                         | Encargo                                              | Corregido |
| Ctrl+C dejaba la API colgada con los pools abiertos                                 | Encargo                                              | Corregido |
| El pool se cerraba antes que escuchas, latidos y planificador                       | Al escribir el cierre ordenado                       | Corregido |
| La consola pintaba igual «API caída» y «API no disponible»                          | Encargo                                              | Corregido |
| Con la API caída, el video culpaba al puente; arrancando, decía «no desplegada»     | Al cambiar el proxy a 502                            | Corregido |
| «Configurar / Sincronizar / Reiniciar · sólo registra» parecían actuar              | Encargo                                              | Ocultados |
| Modelo y firmware viejos presentados como de hoy                                    | Encargo                                              | Corregido |
| Visita de 0 minutos aceptada                                                        | Encargo                                              | Corregido |
| `--restaurar` identificaba el equipo por el nombre del fichero                      | Encargo                                              | Corregido |
| Todos los equipos simulados decían la misma serie y el respaldo se pisaba           | Al ejecutar `--capturar` y `--restaurar` en simulado | Corregido |
| La reversión de cámara y terminal encontraba el respaldo del videoportero y fallaba | Mismo ensayo                                         | Corregido |

**Búsqueda activa.** Una revisión de las cinco áreas (guardia, portería,
eventos, dispositivos y visitantes) propuso doce defectos. Cada uno se
comprobó leyendo el código antes de tocarlo, y cada corrección tiene una
prueba que se vio fallar con el código anterior.

| #   | Área              | Defecto                                                                                                         | Estado                                                                                            |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Portería          | La cola de atención exigía IP de guardia remota: un portero en su garita veía toda la pantalla en «Sin permiso» | Corregido. La prueba 7b de la 15-L fijaba ese 403; ahora fija 200 en la cola y 403 en el intercom |
| 2   | Guardia, portería | La cola incluye los accesos permitidos de la última hora y atender un evento no lo saca                         | **No corregido**: qué entra en la cola de CU-03 es decisión de producto → **P-22**                |
| 3   | Guardia           | El micrófono seguía transmitiendo si se soltaba el botón antes de que abriera                                   | Corregido                                                                                         |
| 4   | Guardia           | «Salir de la cola» volvía a pedir el canal; «Terminar llamada» no lo soltaba                                    | Corregido                                                                                         |
| 5   | Guardia, portería | Una barrera que rechaza la orden se lee como «el equipo no respondió»                                           | **No corregido**: es la ruta de la cámara; la regla dura manda reportarlo (DT-15M-06)             |
| 6   | Varias            | Al cambiar de copropiedad seguían la llamada, la selección y los filtros de la anterior                         | Corregido en cinco pantallas                                                                      |
| 7   | Alertas           | El tablero contaba las archivadas; los latidos reabrían una archivada y duplicaban por el corte de 200          | Corregido                                                                                         |
| 8   | Visitantes        | La hora propuesta era la de montar la pantalla, no la de abrir el formulario                                    | Corregido en los tres formularios, del operador y del residente                                   |
| 9   | Eventos           | Vaciar una fecha tumbaba la página; «hoy» era la fecha UTC                                                      | Corregido                                                                                         |
| 10  | Dispositivos      | El sondeo lento de una ficha se pintaba en la de otro equipo                                                    | Corregido                                                                                         |
| 11  | Dispositivos      | «Sin zona» no quita la zona al editar un equipo                                                                 | **No corregido**: exige distinguir campo ausente de `null` en el contrato (DT-15M-04)             |
| 12  | Guardia           | «Avisar al residente» abre una alerta a nombre de la vivienda como si fuera un equipo                           | **No corregido**: baja gravedad (DT-15M-05)                                                       |

**Lo que destapó el propio verificador.**

- **Las pruebas contra go2rtc real se saltaban.** Sin `GO2RTC_BIN`, las
  cuatro pruebas de E2/C1 se omitían, y con `--con-base` una omisión no
  declarada es FALLO (D-112). Ningún otro paso las ejerce, así que no se
  declararon: el paso 5 descarga la versión oficial v1.9.14, comprueba su
  SHA-256 por plataforma y la pasa a la suite (`go2rtc-para-pruebas.mjs`).
- **go2rtc oficial devuelve la clave por su API.** Con ese binario, una prueba
  que exigía la fuente tachada en `GET /api/streams` falló: la v1.9.14 oficial
  la devuelve en claro, y la compilación de camera.ui del Bloque 0 la tachaba.
  Lo que la plataforma garantiza es el disco (el YAML nunca la guarda). La API
  de go2rtc escucha sólo en `127.0.0.1` y `pnpm sitio:video` se niega a
  abrirla a la red sin `--api-en-red`, con su prueba. La guía decía «tachada»:
  corregida.
- **Un 404 por IP que no se reprodujo.** La primera corrida marcó un error de
  consola por IP en el recorrido del navegador (paso 12c): «Failed to load
  resource: 404». Repetido con una traza de toda respuesta 4xx por IP, el
  recorrido terminó en verde y sin ningún 4xx, y las corridas siguientes del
  verificador tampoco lo vieron.
- **Una corrida inestable que causé yo.** En la segunda corrida, el paso 14
  vio distinta la segunda de tres corridas de la suite: se ejecutaron a mano
  las pruebas de go2rtc en el mismo árbol mientras el verificador corría. La
  corrida final se hizo sin tocar el árbol.

---

## 8 · Deuda técnica, supuestos y pendientes

**Deuda nueva:**

- **DT-15M-01.** Ocho ficheros cruzaron las 300 líneas en esta etapa:
  `equipos.module.ts` (301), `repositorio-equipos-en-memoria.ts` (337),
  `registrar-acceso.ts` (325), `repositorio-tablero-pg.ts` (302),
  `navegacion.ts` (313), `correcciones-de-sitio.ts` (323),
  `respaldo-de-configuracion.ts` (327) y `capacidades.ts` (301). Se suman a
  los que ya estaban por encima (DT-15L-10, D-138).
- **DT-15M-02.** Al apagar, la cola del volcado histórico no se vacía antes de
  cerrar el pool. Lo que quede se pierde, y el equipo conserva su historial
  para pedirlo otra vez.
- **DT-15M-03.** El 401 RTSP del videoportero no se reprodujo en simulación.
  El paso 7 del ensayo anota qué esquema ofreció el equipo y cuál se envió.
- **DT-15M-04.** Al editar un equipo, «Sin zona» no le quita la zona: el
  servidor toma el campo ausente como «sin cambio». Arreglarlo exige aceptar
  `null` en el DTO y regenerar el contrato y el cliente Dart.
- **DT-15M-05.** «Avisar al residente» abre una alerta `acceso_dudoso` con la
  vivienda en el campo del equipo, y no comprueba que la vivienda sea de la
  copropiedad.
- **DT-15M-06.** Cuando la barrera de una cámara rechaza la orden, la guardia
  y la portería leen «el equipo no respondió». Está en la ruta de la cámara:
  no se toca sin que el cliente lo autorice (regla dura del encargo).

**Supuestos nuevos:** S-107 a S-114 (Digest, video y rostros), S-120 a S-124
(estado y alertas), S-130 a S-141 (consola, bajas y fechas), S-150 a S-156
(residente en la web) y S-157 a S-160 (arranque, cierre y respaldo). Todos en
`docs/auditoria/contradicciones-y-supuestos.md`.

**Contradicción nueva:** C-44, la consola de operación frente a la decisión del
cliente D-12. Resuelta a favor del cliente y registrada como extensión E-06.

**`PENDIENTE DE DEFINICIÓN`:** **P-22**, qué entra en la cola de atención de
guardia y portería. Hoy entran también los accesos permitidos, como desde la
ETAPA 10, y nada se le oculta al portero hasta que el cliente decida.

**Lo que C3 no incluye:** cambiar de vivienda con código, declarar ocupantes,
cambiar la contraseña desde el perfil y registrar el aparato para avisos al
teléfono. Son flujos del primer ingreso o propios del teléfono. El texto de la
casilla es una constante igual a la de la app mientras `GET …/visitas/casilla`
no se abra al residente (S-151).

**Lo que no se hizo:**

- Las rutas del videoportero para personas y rostros están documentadas y no
  verificadas: faltan los extractos ISAPI del KD9633 (ver §9).
- Las rutas de menú de `VISITA-29-09.md` son `[SUPUESTO]`: los manuales de
  los tres modelos no están en el repositorio.
- Nada se ejecutó contra un aparato. **La ETAPA 15 sigue BLOQUEADA sólo por
  `BE-02`.**

---

## 9 · Qué debe hacer el usuario manualmente

1. Enviar los extractos ISAPI del DS-KD9633-WBE6, con estos nombres de
   sección: «Access Control → UserInfo/Record (JSON)», «UserInfo/capabilities»,
   «Intelligent/FDLib/FaceDataRecord (multipart)» y «FDLib/FDSearch». Con
   ellos, S-107 pasa de documentado a verificado.
2. Antes de salir: `pnpm sitio:ensayo -- --simulado` debe terminar en
   `VEREDICTO: SIN FALLOS`.
3. En sitio, seguir [`ENTREGA_EN_SITIO.md`](../guias/ENTREGA_EN_SITIO.md) y los
   ajustes de [`VISITA-29-09.md`](../guias/VISITA-29-09.md), y completar la
   lista de verificación de abajo.
4. Aplicar las migraciones 0044 y 0045 en el proyecto Supabase
   (`supabase db push`) antes de arrancar la API.
5. Revisar y fusionar el PR hacia `develop`. No se fusiona desde aquí.

---

## 10 · Rama y commits

Rama `etapa-15m-equipos-y-consola`, desde `develop` (`a46cb56`). PR hacia `develop`:
[#35](https://github.com/4rg3n15/NextResidential/pull/35), sin fusionar.

- `e7d18ba` docs(etapa-15m): bloque 0 — E1 confirmado, E2 reproducido con go2rtc real, E3 confirmado
- `c22f05b` test(etapa-15m/camara): regresión del flujo de la cámara del 28/09 antes de tocar el Digest compartido
- `aa7bbbc` feat(etapa-15m/digest): E1/C8 — el 401 al nonce guardado nunca es la clave; UN intento real por credencial
- `dbdc79c` feat(etapa-15m/video): E2/C1 — go2rtc registra y negocia con el binario real, sin credenciales en disco
- `38bc27e` feat(etapa-15m/rostros): E3/C2 — el videoportero da de alta rostros como DECLARA, nunca por modelo
- `a7209c7` feat(etapa-15m/equipos): E5/C7 + E4 + C6 — un solo estado por equipo, alertas por condición, receptores y N equipos
- `4b10da3` feat(etapa-15m/consola): C10 + C4 + C9 + C5 — video por equipo, bajas con motivo, confirmación de placa y fechas DD-MM-YYYY
- `73f4a68` feat(etapa-15m/residente): C3 — el residente opera desde la consola web (D-12)
- `e0c1b5d` feat(etapa-15m/arranque): otros fallos — 503 al arrancar, cierre ordenado, «API caída» distinguible y respaldo por serie
- `37a94e1` docs(etapa-15m/sitio): guía VISITA-29-09 con los ajustes de cada equipo y cómo los comprueba la plataforma
- `c998316` fix(etapa-15m/consola): búsqueda activa en guardia, portería, eventos, dispositivos y visitantes
- `55cbabc` fix(etapa-15m/verificador): el paso 5 pone go2rtc real en vez de saltarse sus pruebas
- el commit de cierre de la etapa, con este informe y `ESTADO_ETAPAS.md`

---

## Lista de verificación en sitio

Cada casilla con el resultado del ensayo o de la consola. Una casilla sin
marcar al irse es un pendiente, no un éxito.

### Cámara LPR DS-TCG405-E

- [ ] Respaldo capturado (`--capturar`) antes de tocar nada; fichero con su serie
- [ ] Ficha: receptor apuntando a este Mac tras «Enviar eventos a este Mac», releído
- [ ] Ficha: imágenes del receptor = `detectionPicture`
- [ ] Ficha: país del algoritmo 210
- [ ] Ficha: «quién controla la barrera» conforme; «Paso automático» apagado
- [ ] Ensayo, paso 2: hora y zona GMT-05:00 conformes
- [ ] Ensayo, paso 4: un vehículo real produce el evento en la consola
- [ ] Ensayo, paso 5: la barrera abre con la persona mirando, y otra vez seguida (H-SITIO-12)
- [ ] Ensayo, paso 7: video por el canal elegido en la ficha, sin «no tiene el canal 102»
- [ ] Consola: **una** alerta de atestación, no una por lectura
- [ ] Consola: latencia del evento no negativa aunque el reloj de la cámara vaya adelantado

### Terminal facial DS-K1T344MBFWX-E1

- [ ] Ficha: firmware V4.61.0 leído hoy, sin «dato del …»
- [ ] Ensayo, paso 1: Digest aceptado; la ficha no dice «rechazó el usuario o la clave»
- [ ] Con la escucha abierta más de 20 minutos, alta de foto sin rechazo falso
- [ ] Receptor huérfano desactivado desde la ficha, con motivo
- [ ] Ensayo, paso 4: la escucha entrega el evento de una cara presentada
- [ ] Ensayo, paso 6: alta, permanencia y baja de la persona de prueba con su cara
- [ ] Ensayo, paso 9: cinco veredictos aceptados, p95 por debajo del plazo
- [ ] Ensayo, paso 7: video en el canal 102
- [ ] Lista, ficha y tablero dicen el mismo estado

### Videoportero DS-KD9633-WBE6

- [ ] Ensayo, paso 1: Digest aceptado
- [ ] Ficha: rostros «admite», tipo de persona `normal`, carga por `post`
- [ ] Ensayo, paso 6: alta como `normal` con vigencia, carga por `POST FaceDataRecord` y baja verificada
- [ ] Reconocimiento de un visitante dado de alta desde la app, con vigencia de hoy
- [ ] Receptor huérfano desactivado desde la ficha, con motivo
- [ ] Ensayo, paso 3: canal de audio 1 en G.711
- [ ] Ensayo, paso 8: canal de audio abierto y pitido oído
- [ ] Ensayo, paso 7: video en vivo; si dice 401, copiar a la hoja la línea con el esquema ofrecido y el enviado
- [ ] Consola, guardia: timbre, video, audio y apertura con motivo

### La plataforma

- [ ] `pnpm sitio:ensayo -- --solo-lectura` sin FALLO en las comprobaciones del Mac
- [ ] Guardia y portería: el selector de equipo cambia el video y filtra los eventos
- [ ] Eventos: archivar una alerta y un lote, con motivo; ninguna desaparece del historial
- [ ] Reiniciar la API con la consola abierta: «La API no responde», luego vuelve sola
- [ ] Ctrl+C en la API: se cierra en menos de 10 s
- [ ] Al terminar, y sólo si el cliente lo pide: `--restaurar`, sin «respaldo de OTRO equipo»
