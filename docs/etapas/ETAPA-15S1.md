# Ronda 15-S1 · Víspera de sitio: el turno de audio por sesión, la víspera en el ensayo y la guía de mañana

**Rama:** `etapa-15s1-vispera-de-sitio` · **Base:** `develop` (`369df17`, merge del PR #45) ·
**PR:** [4rg3n15/NextResidential#46](https://github.com/4rg3n15/NextResidential/pull/46), hacia `develop`, sin fusionar · **Fecha:** 2026-10-04 (los arreglos del CI, 2026-10-05) ·
**Cierra:** A1 (la carrera del turno de audio de la 15-P) · **Corrige, fuera del encargo:**
H-15S1-01 y, con autorización expresa del usuario, las tres intermitentes que tumbaron el CI
del PR: DT-15M-C03, DT-15M-C04 y H-15S1-02 · **Abre:** DT-15S1-01 a DT-15S1-04

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Nada de lo nuevo se ha ejercido contra el DS-KD9633: A1 se prueba contra el
> videoportero simulado en red, y A2 contra `.env`, bases y consolas de mentira.

**Lo incómodo primero.**

1. **`RECUPERACION_POR_CORREO` NO puede ir vacía**, aunque el encargo la ponía
   entre las que sí (H-15S1-01). Vacía, la consola se niega a arrancar —código 78,
   «RECUPERACION_POR_CORREO: Invalid enum value. Expected 'activa' | 'desactivada',
   received ''»—, comprobado contra `configuracion-de-despliegue.ts`. El
   `.env.example` la traía vacía y decía «Vacía = desactivada»: `entorno:diff`
   reclamaba la línea y quien la copiara tal cual se quedaba sin consola. Se
   corrige el ejemplo (`desactivada`), el ensayo lo marca ✗ y la guía lo dice. El
   esquema, que debería tratarla vacía como ausente igual que a las otras tres de
   Netlify, **no se toca**: es código de producto y esta ronda sólo admitía A1
   (DT-15S1-02). El paso 6 del §9 del informe de la 15-R («vacía en producción»),
   leído al pie de la letra, deja sin consola el despliegue de Netlify.
2. **Mañana, en modo directo, la carrera de A1 es improbable, no imposible.** Con
   el proveedor persistente, «Colgar» cierra en el equipo las conexiones de
   escucha y la conversación vieja termina DURANTE esa petición, antes de que la
   consola pueda volver a llamar. La carrera aparece cuando el final de la vieja se
   retrasa: una trama esperando al equipo (la subida que se reconecta puede tardar
   hasta el plazo del equipo), un cierre del WebSocket que llega tarde, o el Edge
   como puente, donde el fin de la escucha cruza el túnel. La prueba reproduce la
   primera, por orden de eventos.
3. **«Ningún fichero existente crece» se cumplió en el código, no en la guía.**
   `guardia.module.ts` (320), `puerta-de-audio.ts` (172), `sitio-ensayo.mjs` (300) y
   `apps/web/.env.example` (52) quedan con las mismas líneas. Para el módulo de
   guardia hubo que reescribir más corto el comentario de su proveedor (de 8 a 4
   líneas): repetía la documentación de `CanalIntercomConTransporte`.
   `ENTREGA_EN_SITIO.md` crece 48 líneas (539 → 587), que son la víspera, el orden de
   mañana y lo que no se prueba; `ESTADO_ETAPAS.md`, su ficha.
4. **Ninguna variable nueva desde la 15-N es obligatoria para que la API arranque
   en sitio**: todas tienen valor por omisión o son opcionales. El ensayo llama
   «obligatorias» a las que el `.env.example` declara con valor —las que
   `entorno:diff` reclama— y dice que, mientras falten, la API usa su omisión.
5. **Tres deslices propios, corregidos dentro de la ronda.** El primer arreglo de
   A1 (`7260b49`) sólo cerraba «colgar y volver a llamar»: cambiar de equipo o
   cerrar la pestaña y volver enseguida SIN colgar seguía perdiendo el turno
   (cerrado en `7e4a6df`, con su prueba). El primer commit de A2 dejó un fichero
   de 330 líneas y su prueba de 329, por encima del tope de §2.3 (partido en
   `c419d3a`, antes de empujar). Y la prueba de A2 usaba una IP privada, que el
   control KPI-11 prohíbe fuera de `packages/providers`: lo cazó CI en las pruebas
   negativas (`4896908`, ahora de documentación, RFC 5737).
6. **El CI del PR cayó dos veces en el verificador de macOS, por tres pruebas
   intermitentes previas a esta ronda**, y se arreglaron aquí con autorización
   expresa del usuario, como excepción a dos reglas de la ronda (las
   intermitentes, después de la visita; ningún fichero existente crece). Sobre
   `acebd40`, DT-15M-C03 (paso 5) y DT-15M-C04 (paso 14, corrida 1 de 3); en el
   relanzamiento, una tercera, H-15S1-02: «TODA ruta autenticada responde 403…»
   pasó de los 5 s por omisión (5206 ms). Causa común: el paso 5 satura el runner
   de macOS y caen las pruebas con un presupuesto de tiempo fijo. `4e816ab` toca
   tres ficheros de prueba, **+2 líneas y ninguna aserción**, y cada arreglo se vio
   fallar antes con su mecanismo. Se anunció +1: la espera de C03 hacía falta
   también al final de «segundo operador», y el videoportero simulado lento lo
   demostró. Quedan pruebas cerca del límite (DT-15S1-04).

## 1 · Qué se construyó

**A1.** El turno de audio de la guardia se suelta por SESIÓN. Antes, cuando el
operador colgaba y volvía a llamar enseguida, la conversación vieja —que termina
cuando su WebSocket se cierra y ha esperado sus tramas— soltaba «el turno de este
operador en este equipo», que ya era el nuevo: lo liberaba y cerraba el canal en
el equipo. Ahora cada concesión del canal del equipo es una sesión; cada
conversación la TOMA al aceptarse su WebSocket y su `soltar` suelta esa o nada.
Cubre las dos entradas de la carrera: colgar y volver a llamar, y cambiar de
equipo o cerrar la pestaña y volver enseguida sin colgar —el turno sigue siendo
del operador, la consola reabre el audio sobre él, y la conversación vieja ya no
es la dueña—.

**A2.** `pnpm sitio:ensayo` —también con `--solo-lectura`— añade, detrás de las
comprobaciones del Mac de siempre, un bloque «La víspera» de sólo lectura: las
migraciones 0047–0054 una a una y con su nombre contra la base real; las
variables nuevas desde la 15-N que falten en los `.env` de la API y de la consola,
por clase, y las combinaciones con las que una de las dos no arranca; y si la
consola contesta por el bucle local —el único contexto seguro en sitio, donde el
navegador da el micrófono— y reenvía el audio hasta la API. Ninguna línea lleva un
valor de un `.env` ni una IP de la red.

**A3.** `ENTREGA_EN_SITIO.md` empieza por la víspera, en el orden pedido; dice el
orden de las pruebas de mañana y lo que no se puede probar en sitio, y por qué.

## 2 · Cómo se organizó y por qué

- **La sesión, en aplicación y por fuera del canal** (`aplicacion/sesiones-de-audio.ts`).
  No es del dominio: la exclusividad —quién habla, quién espera, cuándo caduca—
  sigue en su máquina, y que una conversación sólo suelte lo suyo es una regla del
  caso de uso, no del canal. Tampoco va en `CanalIntercomConTransporte`, que es el
  transporte y habría crecido. `CanalConSesiones` envuelve el canal que ya había:
  una sesión nace cuando `pedir` deja la palabra con el canal del equipo abierto y
  acaba con `soltar`, o cuando `estado` o `renovar` dicen que ya no la tiene
  (caducidad, relevo). Pedir otra vez con la palabra no abre otra.
- **La conversación no cambia.** La puerta del WebSocket le da
  `canal.deLaConversacion(datos)`: el mismo canal, salvo un `soltar` que compara la
  sesión de ahora con la que la conversación TOMÓ al aceptarse su socket. Tomarla
  —y no sólo anotarla— es lo que cierra la segunda entrada de la carrera: sin
  «Colgar» en medio, la sesión no acaba, y sólo el relevo de dueña distingue la
  conversación vieja de la nueva sobre el mismo turno. `ConversacionDeAudio` y sus
  once pruebas quedan intactas; si la sesión ya acabó o es de otra, se anota en la
  bitácora —sin audio— y no se toca el turno.
- **Lo que se dejó fuera a propósito.** Un `estado` por sesión mataría antes a la
  conversación vieja, pero con el motivo «el turno caducó por inactividad» en una
  constancia que se guarda (0047) y que no sería verdad. La sesión se toma al
  aceptarse el WebSocket y no al emitirse el billete: la ventana entre los dos es
  un viaje de red con dos órdenes HTTP completas en medio (DT-15S1-01).
- **La prueba que falla con lo de antes.** `audio-guardia-sesion.e2e.test.ts` usa la
  API real con el proveedor real contra el videoportero simulado en red, y sólo
  gobierna el equipo: retiene una trama de subida. El orden lo ponen los eventos
  —la trama retenida, el 4010 del socket viejo, las respuestas HTTP, la constancia
  de la conversación—, nunca una espera. La vigilancia de cada segundo no interfiere:
  `terminar` la detiene antes de esperar la trama.
- **La víspera, en dos módulos nuevos** (`lib/vispera-de-sitio.mjs` y
  `lib/vispera-variables.mjs`), llamados desde `sitio-ensayo.mjs` en el sitio de
  `comprobacionesDelMac`, que siguen saliendo las primeras. Las migraciones se leen
  del registro de la CLI y, si el rol de la API no puede leerlo, de la huella que
  cada una deja en el catálogo, que cualquier rol lee (tabla, columna, función o
  política). La consola se sondea con una actualización a `/api/ncr-audio` con un
  billete inventado: 401 quiere decir que `servidor.mjs` reenvía y la API atiende el
  audio por WebSocket; 502, 404 o la conexión cortada dicen, cada uno, qué falta.
- **La guía.** §0 era «Antes de salir»; pasa a «La víspera» con los pasos nuevos
  delante y los de siempre renumerados. El orden de mañana va en §4 bis, después del
  ensayo; los «§8.4…» remiten a `VALIDACION_HIKVISION_EN_SITIO.md`.

## 3 · Árbol de archivos

| Fichero                                                      | Para qué                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `apps/api/src/guardia/aplicacion/sesiones-de-audio.ts`       | **Nuevo** (126). `CanalConSesiones`: la sesión y la vista de la conversación |
| `apps/api/src/guardia/aplicacion/sesiones-de-audio.test.ts`  | **Nuevo**. Nueve pruebas, una con la conversación de verdad                  |
| `apps/api/test/audio-guardia-sesion.e2e.test.ts`             | **Nuevo**. La carrera, de punta a punta y por orden de eventos               |
| `apps/api/src/guardia/guardia.module.ts`                     | El canal se envuelve en `CanalConSesiones` (320 → 320)                       |
| `apps/api/src/guardia/presentacion/audio/puerta-de-audio.ts` | La conversación recibe el canal de su sesión (172 → 172)                     |
| `scripts/lib/vispera-de-sitio.mjs` (+ `.d.mts`)              | **Nuevo** (179). Migraciones 0047–0054, consola y composición                |
| `scripts/lib/vispera-variables.mjs` (+ `.d.mts`)             | **Nuevo** (162). Las variables desde la 15-N, sin imprimir valores           |
| `apps/api/test/vispera-de-sitio.test.ts`                     | **Nuevo**. Migraciones, consola y composición, con todo simulado             |
| `apps/api/test/vispera-variables.test.ts`                    | **Nuevo**. Las variables: faltan, no arrancan, precedencia de la consola     |
| `apps/api/test/dobles/entornos-de-la-vispera.ts`             | **Nuevo**. Repositorio y `.env` de mentira; «ningún valor ni IP»             |
| `scripts/sitio-ensayo.mjs`                                   | Llama a la víspera; su cabecera lo dice (300 → 300)                          |
| `apps/web/.env.example`                                      | H-15S1-01: `RECUPERACION_POR_CORREO=desactivada` (52 → 52)                   |
| `docs/guias/ENTREGA_EN_SITIO.md`                             | §0 la víspera, §2 la fila nueva, §4 bis el orden de mañana (539 → 587)       |
| `apps/api/test/audio-guardia-ws.e2e.test.ts`                 | DT-15M-C03: dos pruebas esperan a que el equipo suelte la sesión (+2)        |
| `packages/providers/src/remoto/ejecutor-remoto.test.ts`      | DT-15M-C04: espera el aviso `audio.fallo`, no 15 ms fijos (+0)               |
| `apps/api/test/cuentas-y-porteria.e2e.test.ts`               | H-15S1-02: plazo propio de 30 s para «TODA ruta autenticada» (+0)            |
| `docs/etapas/ETAPA-15S1.md`, `docs/ESTADO_ETAPAS.md`         | Este informe y su ficha                                                      |

## 4 · Tabla SOLID

| Pieza                   | SRP                                         | OCP                                                       | LSP                                                      | ISP                                               | DIP                                               |
| ----------------------- | ------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `CanalConSesiones`      | Que cada conversación suelte sólo su sesión | Envuelve el canal; ni el canal ni la conversación cambian | Cumple `CanalDeIntercom`: la suite de siempre pasa igual | La conversación ve el mismo puerto, con su sesión | Recibe el puerto y la `Bitacora`; Nest lo compone |
| `vispera-de-sitio.mjs`  | Las preguntas de la víspera y su orden      | Una migración nueva = una huella en la lista              | —                                                        | `pool.query` y `decir`, nada más                  | Base, consola y `.env` le llegan; no los busca    |
| `vispera-variables.mjs` | Juzgar los `.env` sin imprimir un valor     | Una variable nueva = una clave con su clase               | —                                                        | Sólo los nombres y valores que juzga              | Lee los ficheros que le indican                   |

`CanalConSesiones` tiene **siete** métodos públicos, más de los cinco de §2.3: los
seis del puerto, como todo adaptador de `CanalDeIntercom` (S-190), y
`deLaConversacion`, que es la razón de ser de la clase.

## 5 · Trazabilidad

| Elemento              | Qué toca                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| **OE-07**, **CU-03**  | Guardia virtual: colgar y volver a llamar ya no deja al operador sin la palabra ni sin audio            |
| **CA-19**, **KPI-33** | Audio < 2 s: la prueba de mañana (§8.4.1) desde el navegador del propio Mac, con su comprobación previa |
| **ADR-01**            | La exclusividad del canal sigue en el dominio; la sesión sólo decide qué turno suelta cada conversación |
| **BE-02**             | La víspera y el orden de mañana: lo que hace falta para ejecutar los 16 escenarios en sitio             |

## 6 · Pruebas

### Qué se probó y cómo

- **A1 de punta a punta** (`audio-guardia-sesion.e2e.test.ts`): llama, habla con una
  trama retenida por el equipo, cuelga (4010 en el socket viejo, el equipo cerrado
  una vez), vuelve a llamar (segunda apertura), el equipo acepta la trama y la
  conversación vieja termina; el turno nuevo sigue «abierta» con el canal del
  equipo, el equipo sigue con UN cierre y la llamada nueva abre su audio. **Sobre el
  código de `369df17` falla 10 de 10** donde debe —«expected … to match object
  { estado: 'abierta', … }», recibido `cerrada` / `ninguno`— y **con el
  arreglo, sobre `7e4a6df`, pasa 20 de 20**.
- **A1, la sesión** (`sesiones-de-audio.test.ts`, nueve pruebas, 100 % de líneas y
  ramas del fichero): la carrera; **cambiar de equipo y volver sin colgar** —falla
  con la primera versión del arreglo (`7260b49`) y pasa con `7e4a6df`—; el cierre
  sin carrera, pedir dos veces, el turno que caduca o toma otro sin `soltar`, quien
  espera en la cola, la clave por copropiedad, equipo y operador, el audio que pasa
  tal cual y la conversación de verdad terminando después de la llamada nueva.
- **A2, cada aviso con lo que lo dispara** (once pruebas): el registro de la CLI con
  cuatro de ocho; sin permiso sobre él, la huella; las ocho; cada clase de variable
  que falta; Web Push a medias, TURN sin secreto, audio por HTTP, la recuperación
  vacía y las de Netlify con valor; `.env` y `.env.local` de la consola; sin `.env`;
  la consola con 401, 502, 404, sin reenvío, aceptando un billete inventado y sin
  nadie; la composición con una base ilegible. En todas, la salida sin un valor de
  los `.env` ni una IP de la red. Las huellas, además, contra PostgreSQL 16 real:
  las ocho presentes, inventadas ausentes y una tabla con una columna inexistente.
- **Corrida de humo** de `pnpm sitio:ensayo -- --solo-lectura` con un `.env`
  desechable fuera del repositorio: el bloque «La víspera» con sus ✗ y ningún valor.
- **Las tres intermitentes, cada una vista fallar antes de arreglarla.**
  DT-15M-C04 sin espera falla 3 de 3 con «promise resolved "undefined" instead of
  rejecting», como en CI; arreglada, 15 de 15 con los cuatro núcleos al 100 %.
  DT-15M-C03, con el videoportero simulado cerrando 300 ms tarde (cambio temporal,
  no se sube): la prueba anterior falla 3 de 3 con «el WebSocket no abrió», como en
  CI, y la arreglada pasa 3 de 3; las dos de audio por WebSocket, 5 veces con
  carga, 30 de 30. H-15S1-02 tarda 0,73 s con los núcleos al 100 %, frente a los
  5,2 s del paso 5 de macOS: los 30 s de plazo dejan casi seis veces la peor cifra.

Cómo ejecutarlas: `pnpm --filter @ncr/api exec vitest run test/audio-guardia-sesion.e2e.test.ts test/vispera-de-sitio.test.ts test/vispera-variables.test.ts src/guardia`;
todo, con `./scripts/verificar-etapa.sh --con-base`.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Corrida sobre `4e816ab` —la cabeza con los arreglos de las tres intermitentes—,
desde un árbol limpio de artefactos, con la base preparada como en CI
(`./supabase/verificar.sh --con-pruebas --modo-supabase`), Flutter 3.47.4 y el
Chromium del entorno (`NCR_CHROMIUM`):

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El declarado es **D-112**: las cinco pruebas saltadas del arranque en frío, que
ejerce el paso 12b. **31 de 31 pasos**; **5204 pruebas de TypeScript** (API 2283,
proveedores 1231, consola 783, dominio 438, Edge 325, configuración 144) —21 más
que `develop`, todas de esta ronda— y **367 de Dart**, tres corridas forzadas
idénticas; ninguna omisión por falta de base (44 ficheros con su guardián); el
ensayo de sitio contra los equipos simulados, «SIN FALLOS · 47 OK»; los 34
controles detectan su violación; escaneo de secretos limpio (6838 blobs del
historial). Cifras y cobertura, las mismas que sobre `7e4a6df`: los arreglos
sólo cambian cuándo esperan tres pruebas. Sobre `4e816ab`, los cuatro trabajos
del CI en verde, también el verificador de macOS.

### Cobertura por capa

| Capa                                          | Líneas                      | Ramas   | Umbral         |
| --------------------------------------------- | --------------------------- | ------- | -------------- |
| Dominio (`packages/domain-core`)              | 96,20 %                     | 96,91 % | 90 %           |
| Aplicación (`**/aplicacion/**`, 153 ficheros) | 97,14 %                     | 90,77 % | 90 %           |
| Global (952 ficheros)                         | 87,78 %                     | 87,35 % | 70 %           |
| App · dominio / aplicación / global           | 98,05 % / 96,89 % / 89,68 % | —       | 90 / 90 / 70 % |

### Las corridas anteriores

1. **Sobre `9e7c8e5`, interrumpida en el paso 5b** (los pasos 0 a 5, en verde):
   CI había cazado ya la IP privada de las pruebas de A2 (KPI-11), y esa corrida
   habría salido FALLIDA en el paso 9. Corregido en `4896908`.
2. **Sobre `4896908`, interrumpida en el paso 5** a propósito, para cerrar la
   segunda entrada de la carrera de A1 (`7e4a6df`).
3. **Sobre `7e4a6df`, correcta**, con las mismas cifras: el veredicto del primer
   cierre (`acebd40`).
4. **El CI sobre `acebd40`, FALLIDO dos veces** en el verificador de macOS
   (`verificar-etapa.sh --con-base (macos)`): DT-15M-C03 y DT-15M-C04 en el
   primer intento, H-15S1-02 en el relanzamiento; los otros tres trabajos, en
   verde («Lo incómodo», 6).

Antes de la corrida buena se volvió a preparar la base como en CI.

## 7 · Verificación de seguridad (§2.7)

| §2.7              | Qué hizo esta ronda                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos      | Ninguno nuevo. La víspera juzga valores y sólo imprime nombres; las pruebas lo exigen con un secreto y una IP de mentira     |
| 2 · CORS          | Sin cambios                                                                                                                  |
| 3 · Validación    | Sin cambios en la API; el ejemplo de la consola ya no lleva a un valor que su validación rechaza (H-15S1-01)                 |
| 4 · Inyección     | Las huellas son consultas parametrizadas al catálogo, de sólo lectura                                                        |
| 5 · Rate limiting | La sonda de la consola hace UNA actualización con un billete inventado: la API la rechaza y la anota como tal en su bitácora |
| 6 · RLS           | Sin cambios                                                                                                                  |
| 7 · CSP           | Sin cambios                                                                                                                  |
| 8 · Transversales | La anotación de la sesión acabada lleva equipo y operador, nunca audio                                                       |

## 8 · Deuda técnica, supuestos y pendientes

- **A1 · CERRADO.** El turno de audio se suelta por sesión.
- **H-15S1-01 · CORREGIDO en el ejemplo, fuera del encargo.** Ver «Lo incómodo», 1.
- **DT-15S1-01 · la conversación toma la sesión al aceptarse el WebSocket, no al
  emitirse el billete.** Si entre el billete y la actualización alguien colgara y
  volviera a llamar, la conversación del billete viejo tomaría la sesión nueva.
  Exige dos órdenes HTTP completas dentro de un viaje de red: no se alcanza a mano.
  Atarla al billete toca `billetes-de-audio.ts` y `audio.controller.ts`.
- **DT-15S1-02 · CERRADO por la corrección de la 15-S1**
  ([`ETAPA-15S1-recuperacion-vacia.md`](ETAPA-15S1-recuperacion-vacia.md)). Era: la
  consola rechazaba `RECUPERACION_POR_CORREO` vacía y salía con 78. Ahora vacía es
  «sin la línea», como las otras tres de Netlify —desactivada en producción, activa
  fuera—, y el ensayo de la víspera ya no la marca como «la consola NO arranca».
- **DT-15S1-03 · `HogarEnMemoria` no cumple `CuentasDeResidentes`** (le falta
  `darDeBaja`). Previa: sólo se ve compilando las pruebas, y las pruebas no se
  compilan (`apps/api/tsconfig.json` las excluye). Vista al comprobar los tipos de las
  pruebas nuevas; propuesta como tarea aparte.
- **DT-15M-C03 y DT-15M-C04 · CERRADAS** (`4e816ab`), con autorización expresa:
  ver «Lo incómodo», 6.
- **H-15S1-02 · CORREGIDO** (`4e816ab`). «TODA ruta autenticada responde 403…»
  hace una petición por ruta —unas 180— con el plazo por omisión de 5 s: 0,4 s
  aislada en local, 5,2 s en el paso 5 de macOS. Tiene ahora el suyo, 30 s.
- **DT-15S1-04 · el paso 5 satura el runner de macOS.** Las pruebas con un
  presupuesto de tiempo fijo caen de vez en cuando: se arreglaron las tres que
  cayeron, no las que aún no. `[Probable]` hay más cerca del límite: varias de la
  consola pasan de 1 s en local con carga. Para después de la visita: limitar la
  concurrencia del paso 5 en macOS, o revisar los presupuestos fijos.
- **Las sesiones viven en el proceso**, como los turnos (D-69).
- **Supuestos y contradicciones:** ninguno nuevo.

## 9 · Qué debe hacer el usuario manualmente

1. **Hoy, la víspera**, `ENTREGA_EN_SITIO.md` §0 en su orden: pull, compilación,
   `entorno:diff`, `supabase db push` (0047–0054), `pnpm sitio:ensayo -- --solo-lectura`
   con la API y la consola arrancadas, el ensayo simulado y la app del iPhone si
   pasaron 7 días. En `apps/web/.env`, **`RECUPERACION_POR_CORREO=desactivada` o sin
   la línea, nunca vacía**.
2. **Fusionar el PR de esta ronda en `develop`** ([4rg3n15/NextResidential#46](https://github.com/4rg3n15/NextResidential/pull/46)) antes del pull de la víspera.
3. **Mañana**, `ENTREGA_EN_SITIO.md` §4 bis en su orden. En §8.4.1, además de la
   fila 6, colgar —o cambiar de equipo— y volver enseguida: la llamada nueva tiene que
   conservar la palabra y el audio. Si no, guarde `api.log`: la línea «conversación terminada sin
   soltar: su sesión ya acabó» dice que la sesión hizo su trabajo y el fallo está en
   otra parte.

## 10 · Rama y commits

Rama `etapa-15s1-vispera-de-sitio`, desde `develop` (`369df17`).

| Commit     | Qué                                                                                     |
| ---------- | --------------------------------------------------------------------------------------- |
| `7260b49`  | A1 · el turno de audio se suelta por sesión; la prueba de la carrera                    |
| `c6bbca7`  | A2 · la víspera en `sitio:ensayo`; H-15S1-01 en el `.env.example`                       |
| `c419d3a`  | A2 · partida en dos módulos de menos de 300 líneas                                      |
| `9e7c8e5`  | A3 · `ENTREGA_EN_SITIO.md` al día para mañana                                           |
| `4896908`  | La IP de mentira de las pruebas de A2, de documentación (KPI-11, cazado en CI)          |
| `7e4a6df`  | A1 · la conversación TOMA la sesión: cambiar de equipo y volver tampoco pierde el turno |
| `acebd40`  | Este informe y la ficha de `ESTADO_ETAPAS.md`, con el veredicto                         |
| `4e816ab`  | Las tres intermitentes del CI: DT-15M-C03, DT-15M-C04 y H-15S1-02 (autorizado)          |
| _cierre 2_ | Este informe y la ficha, con el veredicto sobre `4e816ab`                               |
