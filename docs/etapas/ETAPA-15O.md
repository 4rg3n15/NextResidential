# ETAPA 15-O · Un corte de PostgreSQL ya no tumba la API (sitio, 30/09/2026)

**Rama:** `etapa-15o-resiliencia-pg` · **Base:** `develop` (`d4620ca`, merge del PR #36) ·
**PR:** [#37](https://github.com/4rg3n15/NextResidential/pull/37), sin fusionar · **Fecha:** 2026-09-30

> **Esta corrección NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Todo está probado contra un PostgreSQL real al que se le cortan conexiones con
> `pg_terminate_backend`, **no contra el pooler de Supabase**. Lo que sólo se ve
> con el pooler real está en la [lista final](#lista-de-verificación-en-sitio).

**Lo primero, porque le obliga a actuar.** Con este cambio **la API no arranca**
si `PG_POOL_MAX` + `PGBOSS_POOL_MAX` no caben en `SUPABASE_POOLER_MAX_CLIENTES`
(15 por omisión). Si el `.env` del Mac tiene `PG_POOL_MAX=20` —el valor que
traía `.env.example`—, la API se negará a arrancar y dirá los números. Es a
propósito: esa configuración es, con lo que sabemos, la que llenó el pooler.

**En una línea.** El proceso moría porque `pg` emite `'error'` cuando la base
corta una conexión y nadie lo escuchaba ni en el pool ni en los 36 clientes
prestados; ahora un corte da un 503 «base de datos no disponible» a la petición
afectada (o un reintento, si es una lectura y se cortó una conexión que ya
estaba abierta), el proceso sigue, pg-boss se
repone solo, `/ready` dice qué pasa con la base, la API no puede configurarse
para pedir más conexiones de las que el pooler admite y el volcado histórico de
un equipo ya no hace un `INSERT` por evento.

---

## Bloque 0 · La causa, con archivo:línea (código de `develop`, `d4620ca`)

| #   | Qué                                                                                                                                                                         | Dónde                                                                                  | Veredicto                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pg` 8.13.1 emite `'error'` en el cliente al cerrarse el socket, aunque haya una consulta en curso: `new Error('Connection terminated unexpectedly')` y `_handleErrorEvent` | `node_modules/pg/lib/client.js:131` y `:146` (la misma línea 131 de la traza de sitio) | `[Cierto]`                                                                                                                                                        |
| 2   | El pool de la API se crea sin `pool.on('error')`                                                                                                                            | `apps/api/src/persistencia/pool.module.ts:73`                                          | `[Cierto]`                                                                                                                                                        |
| 3   | La sonda de `/ready` tenía su propio pool, también sin oyente                                                                                                               | `apps/api/src/arranque/sonda-postgres.ts:33`                                           | `[Cierto]`                                                                                                                                                        |
| 4   | 36 `pool.connect()` en la API y 2 en los guiones, ninguno con oyente en el cliente prestado ni `release(error)`                                                             | el control nuevo los nombra uno a uno contra `develop`: **42 faltas**                  | `[Cierto]`                                                                                                                                                        |
| 5   | pg-boss: `'error'` atendido                                                                                                                                                 | `planificacion/infraestructura/planificador-pgboss.ts:83`                              | `[Cierto]`                                                                                                                                                        |
| 6   | pg-boss: si `arrancar()` falla, se registra y **no se vuelve a intentar** hasta reiniciar la API                                                                            | `planificacion/planificacion.module.ts:126`                                            | `[Cierto]`                                                                                                                                                        |
| 7   | `/ready` sondeaba una conexión aparte: decía «ok» con el pool de la API roto o agotado                                                                                      | `salud/salud.controller.ts:77`                                                         | `[Cierto]`                                                                                                                                                        |
| 8   | `PG_POOL_MAX` 20 por omisión + pg-boss 2 + sonda 1 = 23 contra un pooler en modo sesión de 15 clientes                                                                      | `configuracion/esquema.ts:96`, `planificador-pgboss.ts:81`                             | `[Probable]`: el límite de 15 es el del plan gratuito (S-170), no se leyó del panel                                                                               |
| 9   | El volcado histórico: la cola arranca a vaciarse con el primer evento (`vaciando ??=`, `setImmediate`), así que eventos que llegan de uno en uno se guardan de uno en uno   | `eventos/aplicacion/eventos-de-equipo.ts:175`, `:187`, `:189`                          | `[Cierto]` en prueba: 300 eventos de uno en uno = **300 `INSERT`**; `[Probable]` que sea lo que se vio en sitio (cientos de «volcado histórico guardado» en 30 s) |

**La cadena en sitio, tal como se reconstruye `[Probable]`:** la terminal y el
videoportero se suscriben y vuelcan su historial → cada evento suelto pide una
conexión y hace su `INSERT` → con la API pidiendo hasta 23 conexiones contra 15,
el pooler rechaza o corta → `pg` emite `'error'` sin oyente → Node termina el
proceso → la consola ve un 502 y dice «la API no responde».

La API se cayó de verdad en esta sandbox, con el código de `develop`: la prueba
nueva `corte-de-postgres.e2e.test.ts` produjo **4 «Uncaught Exception»** («terminating
connection due to administrator command») y 500 donde ahora hay 503.

---

## Avance

| Requisito                                      | Estado                                                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** · `pool.on('error')` en todo Pool/Client | **Hecho.** Pool de la API, sonda (ahora por el pool de la API), pg-boss (ya estaba), `sitio:ensayo`, el recorrido y la verificación de la base. Control estático nuevo que lo exige                        |
| **2** · un único `conCliente(pool, fn)`        | **Hecho.** `persistencia/con-cliente.ts`; los 36 préstamos migrados. Los 2 de los guiones usan su gemelo `scripts/lib/con-cliente.mjs` (ver «Distinto del encargo»)                                        |
| **3** · pg-boss                                | **Hecho.** `'error'` atendido y publicado; si no arranca, reintento solo con espera creciente; `/ready` lo dice. Probado contra PostgreSQL real con corte en marcha y con la base apagada al arrancar      |
| **4** · presupuesto de conexiones              | **Hecho.** `SUPABASE_POOLER_MAX_CLIENTES` (15), `PGBOSS_POOL_MAX` (2), `PG_POOL_MAX` 20 → 10; la API no arranca si no cabe; `sitio:ensayo` lo juzga con la misma regla                                     |
| **5** · volcado histórico                      | **Hecho en su segunda opción** (lotes grandes con tope por segundo). La primera —pedir al equipo sólo lo nuevo— **no existe en la suscripción**; la vía más cercana (ANR) queda como P-24 para sitio       |
| **6** · `/ready` y la consola                  | **Hecho.** `/ready`: 503 `agotado` o `no-disponible` con motivo; avisos del planificador y del último corte. Consola: «Base de datos no disponible»                                                        |
| **7** · pruebas                                | **Hecho.** Cortes reales con `pg_terminate_backend`: ociosa, a mitad de transacción y a mitad de lectura. Vistas fallar con el código de `develop`. Regresión de la cámara en verde sin tocar una aserción |

## Lo que se hizo distinto del encargo

- **Requisito 2, un gemelo para los guiones.** `sitio:ensayo` corre con `node`
  a pelo y `engines` admite Node ≥ 22.11, que no importa `.ts`. Los dos
  préstamos de `scripts/` usan `scripts/lib/con-cliente.mjs` (32 líneas). El
  control `frontera-conexiones.mjs` admite exactamente esos dos ficheros como
  prestamistas; cualquier otro `pool.connect()` falla el verificador y el CI.
- **La sonda de `/ready` ya no tiene conexión propia.** Contradice una decisión
  escrita en D-66 («la sonda conserva su conexión aparte»). Se revisa porque su
  motivo —no esperar en la cola del pool agotado— se cumple de otra forma
  (mira los contadores del pool antes de pedir, y tiene tope de 2 s), y porque
  el encargo pide que `/ready` diga si **el pool** tiene conexiones sanas. Ahorra
  además un cliente del pooler.
- **Requisito 5, primera opción.** La guía ISAPI de las terminales (Value
  Series) y la de las cámaras IP (Ultra) describen `SubscribeEvent` con
  `eventMode`, `EventList`, `channels`, `identityKey`, `subscribeEventID`,
  `level`, `retransmissionID`, `retransmissionTimeoutDuration` y
  `subscribeWithoutPic`. **Ninguno es una hora de inicio ni un último
  identificador visto.** La búsqueda por `startTime` / `beginSerialNo` existe,
  pero en `AcsEvent` (consulta paginada), no en la suscripción. Lo más cercano es
  `retransmissionID` (ANR): «si se aplica al suscribirse, el ANR queda
  habilitado; al reconectar, la plataforma puede usar el mismo UUID para que el
  equipo reenvíe lo guardado durante la desconexión». No dice que evite el
  volcado de la primera suscripción, y cambiar el cuerpo de la suscripción toca
  la escucha de la terminal y del videoportero, que el encargo protege. Queda
  como **P-24**, para probar en sitio con un equipo y medir.
- **La primera corrida del verificador salió FALLIDA, y con razón.** El
  reintento de lecturas repetía también cuando la base **no se puede abrir**.
  En la suite, con un host inexistente, cada `GET` tardaba 100 ms más: la
  prueba de límites `H5` pasó de 0,4 s a 4,2 s y agotó su plazo bajo la carga
  de turbo (pasos 5 y 7b). En sitio habría sido peor: con el pooler lleno,
  repetir duplica la carga sobre lo que ya está saturado. Ahora sólo se repite
  el corte de una conexión que YA estaba abierta (`esCorteDeConexionAbierta`);
  `ECONNREFUSED`, `ENOTFOUND`, `53300`, `EMAXCONN` y el tope de espera del
  pool no (`c28585e`). La misma corrida señaló, en el paso 9, que el oyente que
  añadí en `verificar-base-de-pruebas.mjs` era una rama que ninguna prueba
  negativa ejecutaba: ahora comparte función con el `catch` y la prueba del
  puerto muerto la recorre (vuelve a 11 bloques, como en `develop`).
- **`max_connections` del PostgreSQL de pruebas.** Una corrida intermedia dio 5
  rojas en `aforo-concurrencia` («sin semillas»). No era el código: había
  levantado el PostgreSQL de esta sandbox a mano con `max_connections=100`, y
  `scripts/base-de-pruebas.sh` exige 300 (lo detecta y reinicia). Con 300, todo
  en verde. Se deja dicho porque el síntoma se parece a lo que corrige esta
  ronda.

---

## 1 · Qué se construyó

La API trata un corte de la base como lo que es —una dependencia que falla por
un momento— y no como un fallo del programa. Toda conexión prestada pasa por un
único ayudante que escucha el `'error'` mientras la conexión está fuera,
devuelve la rota para que el pool la descarte y convierte el corte en un error
con nombre, `BaseDeDatosNoDisponible`, que el filtro global responde con 503,
`Retry-After` y el código `BASE_DE_DATOS_NO_DISPONIBLE`. Una lectura (`GET` o
`HEAD`) cuya conexión se cortó a mitad se repite una vez antes de responder;
una escritura no, porque repetirla no es siempre inocuo, y tampoco una lectura
que ni siquiera pudo abrir conexión, porque repetirla sólo carga más a la base
que no la dio. La consola lee ese código y dice «Base de
datos no disponible», no «la API no responde».

pg-boss sigue escuchando su `'error'` y ahora lo publica; si no consigue
arrancar, lo reintenta solo con espera creciente (5 s, 10 s, 20 s… hasta cinco
minutos) y cierra lo que abrió en cada intento fallido. `/ready` mira el pool de
la API: si todas sus conexiones están ocupadas y hay peticiones esperando dice
`agotado` sin ponerse en la cola; si no, prueba una conexión con tope de dos
segundos. Además avisa —sin sacar la API del balanceador— del planificador que
no está en marcha y del último corte de la base durante cinco minutos.

La configuración ya no puede pedir más conexiones de las que el pooler admite:
la API no arranca y dice los números; `pnpm sitio:ensayo` aplica la misma regla
contando además sus dos conexiones. Y el volcado histórico de un equipo espera
un cuarto de segundo a acumularse, se escribe en lotes de hasta 500 con un
`INSERT` por lote y copropiedad, y no pasa de 500 eventos por segundo. Lo que
ocurre en vivo no pasa por esa cola y no espera.

## 2 · Cómo se organizó y por qué

- **Un ayudante, no 38 parches** (`persistencia/con-cliente.ts`). El oyente y el
  `release(error)` son dos líneas que es fácil olvidar; repetidas en 36 sitios,
  alguno las olvidaría. Por eso el préstamo es una función y un control
  estático (`scripts/lib/frontera-conexiones.mjs`) falla si reaparece un
  `pool.connect()` fuera de ella o un `new Pool`/`new Client`/`new PgBoss` sin
  oyente. El control se vio fallar en `develop` con 42 faltas, tiene su prueba
  negativa (sección 40) y corre en el verificador y en el CI.
- **El corte es de infraestructura; el 503 lo decide la presentación.** El
  ayudante sólo clasifica (`BaseDeDatosNoDisponible`); los repositorios no
  cambian su contrato; el filtro global traduce. El dominio no sabe nada de
  esto: `grep` de `pg` en `domain/` sigue en cero.
- **El reintento, sólo donde es inocuo y útil.** Un interceptor global repite
  UNA vez las lecturas, sólo si se cortó una conexión que ya estaba abierta (el
  pool ya la descartó: la siguiente es nueva) y sólo si la respuesta no empezó
  (un flujo SSE que ya emitió no se reabre por debajo). Las escrituras salen con 503: el Edge reintenta con su
  clave de idempotencia y la consola lo dice.
- **`/ready` mira lo que atiende las peticiones.** La sonda aparte medía otra
  cosa. La nueva no espera en la cola del pool que vigila, que era el motivo de
  tenerla separada. El detalle que publica es la **clase** del fallo, nunca el
  texto de `pg`, porque `/ready` es pública y ese texto puede llevar el host.
- **El planificador se repara solo y lo cuenta.** El puerto `Planificador` gana
  `estado()`; el inerte dice por qué no hay motor. El reintento vive en el
  adaptador de pg-boss, que es quien sabe qué abrió y qué cerrar.
- **El presupuesto es una regla pura** (`configuracion/presupuesto-de-conexiones.ts`)
  que el esquema aplica al arrancar; el ensayo la replica en `@ncr/providers`
  y una prueba de paridad compara las dos en nueve combinaciones.
- **El volcado se acumula, no se trocea.** La causa no era el tamaño del lote
  sino que la cola se vaciaba con el primer evento. La ventana y el tope son
  opciones del registro con una espera inyectable, así que la prueba no duerme.

## 3 · Árbol de archivos (selección)

```
apps/api/src/persistencia/con-cliente.ts           conCliente, vigilarPool, clasificación de fallos (nuevo)
apps/api/src/persistencia/pool.module.ts           oyente de 'error', application_name, espera máx. por conexión
apps/api/src/comun/interceptores/reintento-de-lecturas.ts   una lectura cortada se repite una vez (nuevo)
apps/api/src/comun/filtros/filtro-global.ts        503 «base de datos no disponible» con Retry-After
apps/api/src/arranque/sonda-postgres.ts            sonda por el pool de la API: agotado / no disponible
apps/api/src/salud/salud.controller.ts             /ready con motivos y avisos
apps/api/src/planificacion/…/planificador-pgboss.ts    estado(), reintento, pool propio configurable
apps/api/src/configuracion/presupuesto-de-conexiones.ts   la regla del presupuesto (nuevo)
apps/api/src/configuracion/esquema.ts              SUPABASE_POOLER_MAX_CLIENTES, PGBOSS_POOL_MAX, EVENTOS_HISTORICOS_*
apps/api/src/eventos/aplicacion/eventos-de-equipo.ts   ventana de acumulación y tope por segundo
apps/api/src/**/infraestructura/*-pg.ts            36 préstamos → conCliente
apps/api/test/corte-de-postgres.e2e.test.ts        cortes reales con la API en marcha (nuevo)
apps/api/test/pgboss-y-sonda-ante-cortes-pg.test.ts    pg-boss y la sonda ante cortes reales (nuevo)
apps/web/src/lib/api/cliente.ts                    ErrorDeApi con la causa del cuerpo
apps/web/src/componentes/estados.tsx               «Base de datos no disponible»
packages/providers/src/ensayo/comprobaciones-de-plataforma.ts   juzgarPresupuestoDeConexiones
scripts/lib/con-cliente.mjs                        el gemelo para los guiones (nuevo)
scripts/lib/frontera-conexiones.mjs                el control (nuevo) · verificador, CI y prueba negativa 40
docs/guias/CONEXION_SUPABASE.md                    «Presupuesto de conexiones»
```

## 4 · Tabla SOLID (lo creado en la etapa)

| Archivo                                        | SRP                               | OCP                                                       | LSP                                           | ISP                                               | DIP                                 |
| ---------------------------------------------- | --------------------------------- | --------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| `persistencia/con-cliente.ts`                  | La salud de una conexión prestada | Un código de corte nuevo es una entrada del conjunto      | —                                             | El repositorio sólo ve `conCliente(pool, fn)`     | Recibe el `Pool`; no conoce módulos |
| `comun/interceptores/reintento-de-lecturas.ts` | Repetir una lectura cortada       | —                                                         | —                                             | Un método (`intercept`)                           | Bitácora inyectada                  |
| `configuracion/presupuesto-de-conexiones.ts`   | La regla del presupuesto          | Función pura                                              | —                                             | —                                                 | Sin dependencias                    |
| `arranque/sonda-postgres.ts`                   | Decir si el pool atiende          | —                                                         | Doble de pruebas y sonda real intercambiables | `SondaDePostgres` de un método                    | Recibe el `Pool` por inyección      |
| `planificador-pgboss.ts` (ampliado)            | Hablar con pg-boss                | Otro motor es otro `Planificador`                         | Inerte y pg-boss cumplen `estado()`           | `estado()` es un método más de un puerto de cinco | La aplicación depende del puerto    |
| `scripts/lib/con-cliente.mjs`                  | El préstamo en los guiones        | —                                                         | —                                             | Una función                                       | Recibe el pool                      |
| `scripts/lib/frontera-conexiones.mjs`          | Un control                        | Una construcción nueva es una alternancia de la expresión | —                                             | —                                                 | Sin dependencias                    |

Todo archivo nuevo queda por debajo de 300 líneas. Los que ya estaban por
encima no crecieron salvo `configuracion/esquema.ts` (667 → 696, variables
nuevas; DT-15O-03) y `planificacion/planificacion.module.ts` (315 → 323).

## 5 · Trazabilidad

| Elemento                                                                   | Cubierto en la 15-O                                                                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| OE-06 (disponibilidad)                                                     | La API sobrevive al corte de la base; pg-boss se repone solo                                                                                      |
| RNF de disponibilidad (KPI-28 a KPI-31, `04-requisitos-no-funcionales.md`) | Un corte deja de ser una caída del proceso; `/ready` lo distingue                                                                                 |
| KPI-25 (alertas < 10 s)                                                    | Sin cambios de ruta; el volcado histórico ya no compite por el pool con lo vivo                                                                   |
| RN-02 (todo intento genera evento)                                         | Una escritura cortada responde 503 (el Edge reintenta con clave de idempotencia); ninguna fila a medias: la transacción se aborta con la conexión |
| RN-11 (supresión en 24 h)                                                  | El planificador que no arranca se reintenta solo en vez de quedar parado hasta el reinicio                                                        |
| CA-18                                                                      | Sin cambios                                                                                                                                       |
| §2.7.8                                                                     | `/ready` pública sin texto de `pg` ni host                                                                                                        |

## 6 · Pruebas

### Qué se probó y cómo

- **Cortes reales con la API en marcha** (`test/corte-de-postgres.e2e.test.ts`,
  PostgreSQL real, `pg_terminate_backend` sólo sobre las conexiones de esa app):
  ociosas → la siguiente petición 200; a mitad de una transacción de ingesta
  (bloqueada con `LOCK … IN SHARE MODE`) → 503 «base de datos no disponible» con
  `Retry-After`, y la siguiente 202; a mitad de una lectura → reintento y 200.
  **Vista fallar con el código de `develop`:** 4 «Uncaught Exception» y 500.
- **pg-boss y la sonda ante cortes** (`test/pgboss-y-sonda-ante-cortes-pg.test.ts`):
  pg-boss en marcha pierde todas sus conexiones y el siguiente trabajo
  encolado se ejecuta; pg-boss con la base apagada (proxy TCP que rechaza) se
  reintenta y arranca solo al encenderla; detenido mientras reintenta, no
  vuelve; la sonda con el pool agotado responde `agotado` en < 500 ms, con sus
  conexiones cortadas sigue `ok` y publica el corte, y con la base
  inalcanzable da la clase sin el host. **Vista fallar con el planificador de
  `develop`** (3 de 3).
- **El volcado:** 300 eventos de uno en uno → 1 lote (con `develop`, 300); 1 200
  eventos → lotes 500/500/200 con esperas 250/1000/1000/400 ms; lo vivo no
  espera a la ventana. Vistas fallar con `develop`.
- **Unitarias:** `con-cliente` (32 casos), reintento de lecturas (9), `/ready`
  (7 nuevas), presupuesto con paridad API/ensayo (5), ensayo (4), consola (3,
  vistas fallar con `develop`).
- **El control** `frontera-conexiones.mjs`: 42 faltas en `develop`, 0 en la
  rama, y su prueba negativa con 7 casos.

### Resultado

Sobre `c28585e`, tercera corrida de `./scripts/verificar-etapa.sh --con-base`.
La primera, sobre `9ef64ab`, salió **FALLIDA** (pasos 5, 7b y 9; ver «Lo que se
hizo distinto del encargo»); la segunda se perdió con un reinicio del
contenedor a mitad del paso 5, sin rojas hasta ahí.

| Superficie                         | Resultado                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| API (con PostgreSQL y go2rtc real) | 1845 pruebas: 1840 en verde y 5 omitidas **declaradas**, que se ejercen en el paso 12b   |
| Proveedores                        | 1103 en verde                                                                            |
| Consola                            | 691 en verde                                                                             |
| Dominio · configuración · Edge     | 438 · 144 · 101 en verde                                                                 |
| Total TypeScript                   | 4322 pruebas, el mismo recuento por turbo y por vitest directo (paso 7b)                 |
| App (Dart)                         | 367 en verde, iguales en otro huso horario                                               |
| Estabilidad                        | 3 corridas forzadas sin caché, con resultado idéntico                                    |
| Ficheros de prueba                 | 386 de 386 recogidos                                                                     |
| KPI-25 bajo carga                  | p50 / p95 / p99 = 6 / 30 / 37 ms (umbral 10 000 ms)                                      |
| `sitio:ensayo` en simulado         | SIN FALLOS · 47 OK · 0 FALLO · 10 no aplica (el paso nuevo del presupuesto, en OK)       |
| Recorrido de la consola            | En verde, y el negativo detecta los cinco defectos de sitio reintroducidos por su nombre |
| Regresión de la cámara del 28/09   | En verde, sin una aserción cambiada                                                      |
| Prueba de límites `H5`             | De vuelta a 0,33–0,41 s (4,2 s con el reintento anterior)                                |

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

```
▸ 15 · ningún paso declarado se quedó sin ejecutar
   ✓ OK 31 de 31 pasos ejecutados

VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

### Cobertura por capa

| Capa (TypeScript)                | Líneas  | Ramas   | Funciones | Umbral |
| -------------------------------- | ------- | ------- | --------- | ------ |
| Dominio (`packages/domain-core`) | 96,20 % | 96,91 % | 96,04 %   | 90 %   |
| Aplicación (`**/aplicacion/**`)  | 96,74 % | 89,87 % | 97,61 %   | 90 %   |
| Global                           | 86,24 % | 86,64 % | 85,12 %   | 70 %   |

| Capa (app Dart) | Líneas  | Umbral |
| --------------- | ------- | ------ |
| Dominio         | 98,05 % | 90 %   |
| Aplicación      | 96,89 % | 90 %   |
| Infraestructura | 89,62 % | 60 %   |
| Presentación    | 89,04 % | 50 %   |
| Global          | 89,68 % | 70 %   |

El control declarado y no ejercido es el mismo de la 15-M y la 15-N: se
declara sólo para macOS («0 de ellos en linux»), con motivo y etapa de revisión.

## 7 · Verificación de seguridad (§2.7)

| Medida              | En esta ronda                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos        | Ninguno en el repositorio (escaneo en cada commit). Los motivos de la bitácora pasan por `motivoSinSecretos` (nada con `://`) |
| 2 · CORS            | Sin cambios                                                                                                                   |
| 3 · Validación      | Variables nuevas validadas con Zod y con cotas; la API no arranca con un presupuesto imposible                                |
| 4 · Inyección       | Sin SQL nuevo salvo en pruebas (parametrizado)                                                                                |
| 5 · Rate limiting   | Sin cambios. El reintento de lecturas es interno (no una petición nueva del cliente) y es UNO                                 |
| 6 · RLS             | Sin cambios; `conCliente` no toca los claims: cada repositorio los sigue fijando dentro de su préstamo                        |
| 7 · CSP / cabeceras | 503 con `Retry-After`                                                                                                         |
| 8 · Transversales   | `/ready` pública publica la clase del fallo, nunca el texto de `pg` ni el host; probado                                       |

## 8 · Deuda técnica, supuestos y pendientes

- **DT-15O-01 · PENDIENTE DE DEFINICIÓN (P-24).** Pedir al equipo sólo los
  eventos nuevos: la suscripción no lo admite; ANR (`retransmissionID`) es la vía
  a probar en sitio. Hasta entonces, el volcado se acota con lotes y tope.
- **DT-15O-02.** `/ready` `agotado` es una foto del instante: en una ráfaga
  corta puede alternar. Con una sola instancia en sitio no saca nada del
  balanceador; con varias, convendría exigir dos lecturas seguidas.
- **DT-15O-03.** `configuracion/esquema.ts` (696) y
  `planificacion/planificacion.module.ts` (323) siguen por encima de 300 líneas
  y crecieron. Se suman a DT-15M-01 y DT-15N-04.
- **DT-15M-02 sigue abierto** y ahora pesa algo más: la cola del volcado no se
  vacía antes de cerrar el pool, y con la ventana y el tope puede haber más en
  ella al apagar. El equipo conserva su historial.
- **Supuestos nuevos:** S-170 (15 clientes en el pooler gratuito), S-171 (5 s a
  5 min entre reintentos de pg-boss), S-172 (ventana de 250 ms, lotes de 500,
  500/s), S-173 (cinco minutos de aviso en `/ready`). **Pendiente nuevo:** P-24.
  Todo en `docs/auditoria/contradicciones-y-supuestos.md`.

## 9 · Qué debe hacer el usuario manualmente

1. En el panel de Supabase: **Database → Settings → Connection pooling →
   «Pool Size»**. Ese número va en `SUPABASE_POOLER_MAX_CLIENTES` del `.env` de
   la API.
2. En el mismo `.env`: `PG_POOL_MAX=10` (o menos) y `PGBOSS_POOL_MAX=2`. Con 20,
   **la API no arrancará** y dirá por qué. `pnpm entorno:diff` muestra las
   variables nuevas.
3. `pnpm sitio:ensayo`: el paso de plataforma «Presupuesto de conexiones» debe
   salir OK.
4. Arrancar la API y abrir `/ready`: `postgres: ok`, y sin avisos del
   planificador.
5. Revisar la [lista de abajo](#lista-de-verificación-en-sitio) en la próxima
   visita.

## 10 · Rama y commits

Rama `etapa-15o-resiliencia-pg`, desde `develop` (`d4620ca`). PR [#37](https://github.com/4rg3n15/NextResidential/pull/37) hacia
`develop`, sin fusionar.

- `6fcf237` fix(etapa-15o/persistencia): un corte de PostgreSQL ya no tumba la API
- `db3beb1` fix(etapa-15o/api): pg-boss que se repone, /ready que mira el pool, presupuesto de conexiones y volcado por lotes
- `9ef64ab` fix(etapa-15o/web): un 503 por la base dice «Base de datos no disponible», no «la API no responde»
- `c28585e` fix(etapa-15o/persistencia): una lectura se repite sólo si se cortó una conexión ya abierta
- el commit de cierre documental (este informe, ESTADO y supuestos)

---

## Lista de verificación en sitio

Con la API arrancada contra el proyecto Supabase real y la consola abierta.

| #   | Qué hacer                                                                                | Qué debe pasar                                                                                                       |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Arrancar la API con el `.env` de siempre                                                 | Si `PG_POOL_MAX` es 20: no arranca y dice «presupuesto de conexiones excedido…». Con 10: arranca                     |
| 2   | `curl -s http://localhost:3000/ready`                                                    | `postgres: ok`; sin `avisos.planificador`                                                                            |
| 3   | Conectar la terminal y el videoportero (suscripción)                                     | La bitácora muestra pocos «volcado histórico de equipo guardado», con `recibidos` en cientos, no uno por evento      |
| 4   | Durante el volcado, abrir Portería y Eventos                                             | Responden; `/ready` puede decir `agotado` un instante, nunca la API caída                                            |
| 5   | En el panel de Supabase, reiniciar la base (o cortar la red del Mac 10 s)                | La API **sigue viva**; la consola dice «Base de datos no disponible»; al volver, todo responde sin reiniciar la API  |
| 6   | Tras el corte, `/ready`                                                                  | `avisos.postgres` con «la base cortó la conexión hace N s»; `avisos.planificador` vacío o «en marcha; último error…» |
| 7   | Contar cuántos eventos trae el volcado de cada equipo (campo `recibidos` de la bitácora) | El dato para decidir P-24: si vale la pena una ronda que pruebe ANR (`retransmissionID`) detrás de un interruptor    |
