# ETAPA 15-Q · Edge en sitio: contingencia real con los equipos

**Rama:** `etapa-15q-edge-en-sitio` · **Base:** `develop` (`40f0250`, merge del PR #38) ·
**PR:** [#39](https://github.com/4rg3n15/NextResidential/pull/39), sin fusionar · **Fecha:** 2026-10-02 ·
**Corrige:** ETAPA 12 (hallazgos S-24) · **Decisión:** [ADR-034](../decisiones/ADR-034-el-edge-es-contingencia.md)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Todo lo de aquí corre contra la API real con PostgreSQL y los **equipos
> simulados** de `packages/providers`. El corte de WAN con los equipos de verdad
> es un procedimiento escrito (`DESPLIEGUE_EDGE.md` §9) que **todavía no se ha
> ejecutado** (DT-15Q-04).

**Lo incómodo primero.** El Edge que la ETAPA 12 dio por cerrado **no podía
operar en una portería**: la API no servía reglas, `descargarReglas()` sólo la
llamaban las pruebas, `POST /hechos` no exigía autenticación y el gateway no
hablaba con ningún equipo. Su DoD se demostró con hechos fabricados contra una
caché sembrada a mano. Y por el camino de esta ronda aparecieron tres defectos
**míos, de la propia 15-Q**, que el verificador habría tumbado y que corregí
antes de la corrida de cierre: (1) `VersionesPg` ordenaba la última versión
**como texto** —`'9' > '10'`— y desde la versión 10 la instantánea respondía
500 para siempre: ningún Edge habría vuelto a recibir reglas; (2) la capa de
aplicación del ingestor de la API y de `ContingenciaEnSitio` importaba
`@ncr/providers` como valor, que la frontera O2 prohíbe; (3) el nombre del
adaptador del fabricante en la composición del Edge y en un comentario, que
KPI-11 prohíbe, y la IP de escucha en el registro de arranque.

**En una línea.** Con P-27 = B, elegido por el cliente, el Edge es
**contingencia**: la nube sigue hablando con los equipos; el Edge los escucha
en paralelo con el mismo `packages/providers`, pregunta por cada acceso si la
nube puede decidir y, si no puede, decide con el mismo motor y las reglas
versionadas que la API le sirve, **abre la barrera o contesta a la terminal**,
y al volver el WAN lo entrega exactamente una vez.

## Avance

| Bloque                 | Estado                                                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Q1** · API           | **Hecho.** `GET /copropiedades/:id/reglas/instantanea?desde=`; versión publicada por hash (0049); identidad del Edge derivada y validada en la aplicación; otra copropiedad → 404 y `auditoria_seguridad`, probado por los dos caminos (sin base y con PostgreSQL) |
| **Q2** · descarga      | **Hecho.** Periódica (`REGLAS_DESCARGA_SEGUNDOS`) y al recuperar el WAN; SQLite; la versión sólo avanza; hash verificado; cada decisión sella la versión y marca la caché obsoleta                                                                                 |
| **Q3** · fuentes       | **Hecho.** Escuchas de terminal y videoportero y receptor de Alarm Server local con el MISMO `packages/providers`; cero duplicación                                                                                                                                |
| **Q4** · actuación     | **Hecho.** `AccessPointProvider` tras la decisión local; el accionamiento viaja en la bandeja y la nube escribe su constancia atribuida al Edge                                                                                                                    |
| **Q5** · seguridad     | **Hecho.** HMAC con marca y nonce en `/hechos` y `/estado`; la cámara por secreto y origen (C-50); una interfaz; límites de cuerpo; límite por IP con `Retry-After`; rotación documentada                                                                          |
| **Q6** · sin regla     | **Hecho.** Niega. «Escalar» sin WAN también niega: PENDIENTE DE DEFINICIÓN (P-28)                                                                                                                                                                                  |
| **Q7** · configuración | **Hecho.** `.env.example` con las 8 variables de sitio (y el control que no las veía, ampliado); `entorno:diff` las cubre; `pnpm sitio:edge`; `DESPLIEGUE_EDGE.md` reescrita                                                                                       |
| **Q8** · DoD           | **Hecho contra PostgreSQL y equipos simulados**: 30 min sin WAN, 20 accesos, los 20 una sola vez en < 5 min con la primera respuesta perdida. **Con equipos reales: procedimiento escrito, sin ejecutar**                                                          |

## Lo que se hizo distinto del encargo

- **«Incremental (`?desde=`)» es condicional, no un delta** ([SUPUESTO] S-181).
  Un Edge que aplica deltas tiene un estado que ninguna versión publicada
  describe, y el hash dejaría de poder verificarlo. Con la versión vigente la
  API contesta «sin cambios» con fe de vida (`generadaEn` de ahora), que es lo
  que necesita KPI-31.
- **La paridad nube/Edge necesitó una ventana de pasado** ([SUPUESTO] S-183).
  Al comparar contra PostgreSQL, una visita vencida daba `VIGENCIA_EXPIRADA` en
  la nube y `PLACA_DESCONOCIDA` en el Edge: la instantánea sólo llevaba las
  vigentes. Ahora lleva las vencidas de los últimos 30 días.
- **La cámara no sabe firmar** (C-50): Q5 pide HMAC en todo endpoint local; el
  receptor de Alarm Server se acredita por secreto por cámara en la ruta **y**
  origen, como ya lo hace la API.
- **R1 y la regla de tamaño, con una excepción declarada.** «Ningún archivo
  existente crece» se cumple en todo lo escrito a mano. **Crecen tres ficheros
  generados** —`packages/contracts/openapi.json`, `src/generado/api.ts` y el
  cliente Dart— porque §2.6 obliga a regenerarlos y prohíbe editarlos (DT-15Q-05).
- **El verificador salió FALLIDO la primera vez, y con razón.** La prueba de
  paridad de rostros levantaba la API con la biometría **en memoria** (el valor
  por omisión de las pruebas) mientras el Edge leía el consentimiento de
  PostgreSQL: la nube negaba todo rostro por `SIN_CONSENTIMIENTO`. Pasaba
  mientras ninguna plantilla de la base fuera reconocible; cuando otra suite
  creó una, divergió (`VIGENCIA_EXPIRADA` en el Edge) en el paso 7 y en dos de
  las tres corridas del paso 14. No era un defecto de la nube ni del Edge, pero
  sí de mi prueba, que probaba menos de lo que decía: ahora las dos lecturas
  son de la base, la prueba siembra su propio rostro reconocible y exige que
  viaje reconocible (`fca3b32`, vista fallar con la biometría en memoria).
- **`pnpm sitio:edge` hace una pregunta más de las que pedía Q7**: si el
  gateway en marcha contesta en su interfaz con su secreto local (`GET /estado`
  firmado). El comentario del servidor local ya decía que `sitio:edge` lo
  usaba, y no era cierto hasta ahora.

---

## 1 · Qué se construyó

**En la API**, un módulo `edge` con frontera propia. Sirve la instantánea de
reglas de una copropiedad —autorizaciones con vigencia, patrón y placa, las
sintéticas de los vehículos del padrón, placas y personas en lista negra,
viviendas activas, zonas con horario y aforo, personas con consentimiento y
las **referencias** de las plantillas sincronizadas (nunca la plantilla)— y la
versiona por hash del contenido: sólo hay versión nueva cuando las reglas
cambian. La identidad del Edge es una credencial **derivada** de la maestra
`INGESTA_FIRMA_SECRETO` por copropiedad, Edge y generación; la API la verifica
sobre método, ruta, cuerpo y marca temporal, y exige que el Edge sólo pida lo
de su copropiedad, porque la identidad de servicio omite la RLS. El alta y la
rotación son dos rutas del superadministrador que enseñan el secreto una sola
vez. La reconciliación del Edge entra por la ruta acreditada y escribe, además
del acceso, la constancia de lo que el Edge hizo con el equipo.

**En el Edge**, la composición completa de un gateway de sitio: la descarga
periódica y al recuperar el WAN, la contingencia que por cada evento pregunta
a la nube y sólo actúa si la nube no puede, el accionador sobre el mismo
proveedor de equipos que usa la nube, el servidor local con sus tres entradas
protegidas, y `pnpm sitio:edge`, que diagnostica un gateway con el mismo código
con el que arranca.

**En la base**, la migración 0049: el servicio publica versiones de su
copropiedad, consecutivas por disparador con candado, y sólo mueve
`version_reglas_actual` de la suya.

## 2 · Cómo se organizó y por qué

**P-27 se preguntó, no se supuso.** Qué hace el Edge con WAN cambia todo el
diseño y ningún insumo lo dice. Las dos opciones y sus costes se presentaron
al cliente; eligió B. A (intermediario) habría cambiado el camino que ya
funciona en sitio y roto R1 por construcción.

**La pregunta es `/ready`, no `/health`.** El Edge necesita saber si la nube
puede **decidir**, y eso incluye la base: con la API viva y la base caída, la
nube niega por `FALLO_TECNICO`. Por cada acceso se pregunta con 1,5 s de
plazo, salvo que el tic ya haya confirmado la caída; así el primer acceso de un
corte no espera a la histéresis de tres sondas.

**La versión se publica perezosamente, en la base.** Que dos Edge pidan a la
vez no puede producir dos versiones con el mismo número: la consecutividad la
garantiza un disparador con candado consultivo y el índice único (ADR-04), no
un `SELECT` previo. Y la versión sólo sube cuando el hash cambia, para que
«sin cambios» signifique algo.

**Paridad por construcción, comprobada con datos.** `contexto-local.ts`
reproduce el cargador de la nube —normaliza la placa con el mismo objeto de
valor, reconoce placas de visita, aplica la autorización sintética sólo al
vehículo leído, juzga el consentimiento en el instante— y una prueba contra
PostgreSQL compara, caso por caso, lo que decide la nube con su cargador y lo
que decide el Edge con la instantánea que la API le sirve. Esa prueba es la
que encontró S-183.

**Inyección para cruzar fronteras.** La referencia del hecho de un evento
(mitad de la clave de idempotencia) tiene que ser la misma en la nube y en el
Edge, así que vive en un solo sitio: `packages/providers`. Las capas de
aplicación no la importan: la reciben por constructor (`InterpreteDeHechos` en
la API, `interpretar` en el Edge), y la composición —que sí puede— la pasa.

**El accionamiento viaja con el acceso.** El Edge anota en el cuerpo de la
bandeja qué hizo con el equipo y cómo le fue; al reconciliar, la nube escribe
una constancia `apertura_ordenada` o `resultado_de_verificacion` atribuida al
Edge, con su propia clave derivada. Una apertura sin constancia sería un
hueco en la trazabilidad justo durante un corte.

**La DoD se compone igual que en producción.** `componerEdge` construye todo
sin temporizadores ni servidores; `main.ts` los añade. La prueba de la DoD usa
la misma función con el tiempo y el WAN como interruptores, así que lo que se
prueba es el gateway, no un montaje paralelo.

## 3 · Árbol de archivos

**API (`apps/api/src`)**

| Archivo                                                                                      | Propósito                                                                          |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `edge/aplicacion/credencial-del-edge.ts`                                                     | Derivación y comprobación de la credencial por Edge y generación                   |
| `edge/aplicacion/acreditar-edge.ts`                                                          | Quién es el Edge, si está activo, si la firma vale y si pide SU copropiedad        |
| `edge/aplicacion/instantanea.ts` · `publicar-instantanea.ts`                                 | Contenido canónico, hash y publicación perezosa; «sin cambios» y «adelantada»      |
| `edge/aplicacion/accionamiento-del-edge.ts`                                                  | Constancia de lo que el Edge hizo con el equipo                                    |
| `edge/aplicacion/puertos.ts`                                                                 | Puertos del módulo                                                                 |
| `edge/infraestructura/*-pg.ts` · `edge-en-memoria.ts` · `referencia-de-credencial.ts`        | Gateways, versiones (orden numérico), fuente de reglas, doble sin base             |
| `edge/presentacion/edge.controller.ts` · `gateways.controller.ts` · `guardia-del-edge.ts`    | Instantánea, reconciliación, alta y rotación                                       |
| `eventos/aplicacion/reconciliar-decisiones.ts`                                               | La reconciliación que NO vuelve a decidir, compartida                              |
| `autorizaciones/infraestructura/lectura-de-autorizaciones-pg.ts`                             | Lectura compartida de autorizaciones (cargador e instantánea); 30 días de vencidas |
| `alarmserver/aplicacion/interprete-de-hechos.ts` · `infraestructura/interprete-de-hechos.ts` | Puerto e implementación de la referencia del hecho (O2)                            |

**Edge (`apps/edge/src`)**

| Archivo                                                          | Propósito                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `composicion.ts`                                                 | Raíz de composición sin temporizadores: lo que `main.ts` pone en marcha   |
| `aplicacion/contingencia-en-sitio.ts`                            | ¿La nube atiende? Si no: decide, acciona, guarda                          |
| `aplicacion/descarga-de-reglas.ts`                               | Descarga, hash, versión que sólo avanza, fe de vida                       |
| `aplicacion/contexto-local.ts`                                   | El contexto del motor a partir de la instantánea, con paridad con la nube |
| `infraestructura/equipos/accionador-por-proveedor.ts`            | Abrir y contestar a la terminal por el proveedor de `providers`           |
| `infraestructura/http/servidor-local.ts` · `proteccion-local.ts` | Entradas locales, HMAC, nonce, límites                                    |
| `infraestructura/api/cliente-de-nube.ts` · `sonda-http.ts`       | Cliente acreditado y sonda a `/ready`                                     |
| `infraestructura/sqlite/fe-de-vida.ts` · `memoria-de-accesos.ts` | Fe de vida de las reglas y claves ya accionadas                           |
| `configuracion/esquema-de-sitio.ts`                              | Variables de sitio validadas al arrancar                                  |
| `diagnostico-de-sitio.ts` · `diagnostico-local.ts`               | `pnpm sitio:edge`                                                         |

**Proveedores, base, guiones y documentos:** `packages/providers/src/equipo/hecho-de-acceso.ts`
(referencia y hecho de acceso compartidos) · `simulacion/publico.ts` ·
`supabase/migrations/…0049_edge_en_sitio.sql` + reversión + `policies/tests/99f_edge_en_sitio.sql` ·
`scripts/sitio-edge.mjs` · `scripts/lib/entorno-declarado.mjs` ·
`docs/guias/DESPLIEGUE_EDGE.md` · ADR-034 · registro de contradicciones y supuestos ·
`ETAPA-12.md` (anotada) · `ESTADO_ETAPAS.md` · `README.md`.

**Pruebas nuevas:** `apps/api/test/edge-aislamiento.e2e.test.ts` ·
`edge-instantanea-pg.e2e.test.ts` · `edge-misma-decision-pg.e2e.test.ts` ·
`edge-en-sitio-pg.e2e.test.ts` · `apps/edge/test/edge-en-sitio.test.ts` ·
`composicion.test.ts` · `diagnostico-de-sitio.test.ts` · unitarias junto a cada
fichero de `edge/aplicacion`, `apps/edge/src/**` y `hecho-de-acceso.test.ts`.

## 4 · Tabla SOLID

| Pieza                 | SRP                                 | OCP                                                     | LSP                                                     | ISP                                  | DIP                                                         |
| --------------------- | ----------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `PublicarInstantanea` | Versionar el contenido, nada más    | Contenido nuevo = campo en `contenidoDe`                | `VersionesPg` y el doble en memoria, con la misma suite | Tres puertos pequeños                | Depende de puertos; Nest inyecta por token                  |
| `AcreditarEdge`       | Decidir si una petición es del Edge | Otra credencial = otro derivador                        | Repositorio PG y en memoria                             | Sólo `porId`                         | Reloj y repositorio inyectados                              |
| `ContingenciaEnSitio` | Cuándo actúa el Edge                | La decisión la pone el motor; los equipos, el proveedor | `AccionadorLocal` real y doble                          | `AccionadorLocal` de dos métodos     | Recibe sonda, accionador, memoria e intérprete              |
| `DescargaDeReglas`    | Bajar y aceptar o rechazar reglas   | —                                                       | Cliente HTTP y nube de prueba                           | `descargarReglas` y `revalidar`      | Puertos `NubeDeReglas`, `CacheDeReglas`, `FeDeVidaDeReglas` |
| `crearManejador`      | Traducir HTTP a las tres puertas    | Ruta nueva = puerta nueva                               | —                                                       | `PuertasDelServidor` de tres métodos | No conoce el gateway: recibe puertas                        |
| `diagnosticarSitio`   | Preguntar y juzgar, sin escribir    | Pregunta nueva = función nueva                          | —                                                       | Dependencias opcionales por pregunta | Transportes y reloj inyectados                              |

Archivos nuevos: todos ≤ 300 líneas; ninguna clase nueva con más de 5 métodos públicos.

## 5 · Trazabilidad

| Elemento                          | Cómo queda                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **OE-06**                         | Operable en sitio contra equipos simulados; con equipos reales, pendiente de §9                         |
| **RN-16** · CA-21 · KPI-31        | Misma decisión nube/Edge con datos reales; versión sellada y caché marcada                              |
| **RN-17** · CA-22 · KPI-29        | 20 accesos, una vez, < 5 min, con la primera respuesta perdida                                          |
| **KPI-28**                        | 20 de 20 accesos resueltos sin WAN (15 aperturas, 5 negaciones)                                         |
| **KPI-30**                        | **Parcial**: la prueba de 24 h es la de la ETAPA 12 (`apps/edge/test`), no se repitió contra PostgreSQL |
| **RN-15** · KPI-36 · KPI-37       | Edge de otra copropiedad → 404 y auditoría; token de usuario → 401; por los dos caminos                 |
| **RN-02**                         | Todo acceso del Edge acaba en `eventos`; la apertura, en `eventos_de_equipo`                            |
| **RN-21** · KPI-11                | IPs y claves sólo en el `.env` del Edge; frontera verde                                                 |
| **CU-04** · HU-30 · HU-31 · CP-09 | Completos contra simulado; el flujo «escalar» queda en P-28                                             |

## 6 · Pruebas

### Qué se probó y cómo

| Qué                                                                                                                                                    | Dónde                                                          | Cómo                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------- |
| Credencial, acreditación, publicación (nueva, sin cambios, adelantada, carrera), accionamiento                                                         | `apps/api/src/edge/aplicacion/*.test.ts`                       | `pnpm --filter @ncr/api test`           |
| Aislamiento: token de usuario 401, Edge de otra copropiedad 404 con auditoría, firma vencida, cuerpo alterado, rotación                                | `apps/api/test/edge-aislamiento.e2e.test.ts`                   | ídem                                    |
| Instantánea contra PostgreSQL: hash, «sin cambios», regla nueva → versión nueva, anotación de descarga, acceso cruzado, bandeja una vez, **9 → 10**    | `apps/api/test/edge-instantanea-pg.e2e.test.ts`                | `--con-base`                            |
| Paridad nube/Edge con datos reales: 9 placas y cada plantilla                                                                                          | `apps/api/test/edge-misma-decision-pg.e2e.test.ts`             | `--con-base`                            |
| **DoD**: 30 min sin WAN, 20 accesos, barrera abierta 15 veces, 20 eventos una vez en < 5 min con la primera respuesta perdida, 15 constancias del Edge | `apps/api/test/edge-en-sitio-pg.e2e.test.ts`                   | `--con-base`                            |
| El Edge entero contra equipos simulados: nube atiende / no atiende, rostro, cámara, repetición, equipo caído, reconexión                               | `apps/edge/test/edge-en-sitio.test.ts` · `composicion.test.ts` | `pnpm --filter @ncr/edge test`          |
| Entradas locales por HTTP: firma, nonce, origen de la cámara, 413, 429 con `Retry-After`, 500 sin caer                                                 | `apps/edge/src/infraestructura/http/servidor-local.test.ts`    | ídem                                    |
| `sitio:edge`: cada pregunta con su respuesta buena y mala                                                                                              | `apps/edge/test/diagnostico-de-sitio.test.ts`                  | ídem                                    |
| Políticas de la 0049                                                                                                                                   | `supabase/policies/tests/99f_edge_en_sitio.sql`                | `./supabase/verificar.sh --con-pruebas` |

Pruebas negativas hechas a mano en la ronda: la prueba del 9 → 10 **falla**
con el orden por texto y pasa con el corregido; el control `entorno-declarado`
**falla** al leer `esquema-de-sitio.ts` antes de declarar las variables;
`frontera-hardware` y `frontera-extensibilidad` **fallaron** con lo commiteado
en `eae6cee` y `80d386a` hasta corregirlo.

### Resultado

Paso 5 de la corrida correcta: `@ncr/config` 144 · `@ncr/edge` **159** (eran 101) ·
`@ncr/domain-core` 438 · `@ncr/providers` 1156 · `@ncr/web` 737 · `@ncr/api`
1966 + 5 saltadas declaradas (las ejecuta el paso 12b) de **1971** (eran 1918).
**4605 pruebas**, las mismas por los dos caminos (paso 7b) y tres veces
seguidas sin caché (paso 14). 427 de 427 ficheros de prueba recogidos. KPI-25
(paso 11): 200 de 200 alertas, p50 7 ms · p95 24 ms · p99 32 ms.

| Medida de la DoD (contra PostgreSQL y equipos simulados) | Valor                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------- |
| Accesos resueltos sin WAN (KPI-28)                       | 20 de 20 · 15 aperturas de barrera · 5 negaciones          |
| Reconciliados al volver (KPI-29)                         | 20 eventos, 20 claves distintas, todos `decidido_por_edge` |
| Tiempo simulado hasta vaciar la bandeja                  | < 5 min (tics de 15 s), con la primera respuesta perdida   |
| Constancias de apertura atribuidas al Edge               | 15 de 15                                                   |

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Sobre `fca3b32`, desde cero (sin `dist/`, `.turbo/` ni `coverage/`, instalación con `--frozen-lockfile`):

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El control declarado no ejercido es el mismo de rondas anteriores («0 de ellos
en linux», con motivo y etapa de revisión vigentes). La corrida anterior, sobre
`b6881b0`, salió **FALLIDA** por la prueba de paridad de rostros; su causa
está en «Distinto del encargo».

### Cobertura por capa

| Capa                                          | Líneas  | Ramas   | Funciones | Umbral |
| --------------------------------------------- | ------- | ------- | --------- | ------ |
| Dominio (`packages/domain-core/src`)          | 96,20 % | 96,91 % | 96,04 %   | 90 %   |
| Aplicación (`**/aplicacion/**`, 134 archivos) | 96,90 % | 90,47 % | 97,73 %   | 90 %   |
| Global (832 archivos)                         | 86,87 % | 86,62 % | 85,78 %   | 70 %   |

El Edge por sí solo (`pnpm --filter @ncr/edge test:cobertura`): 99,55 % de
líneas y 92,08 % de ramas.

## 7 · Verificación de seguridad (§2.7)

| Medida                   | Estado en la ronda                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos             | Credencial del Edge derivada, mostrada una vez; maestra sólo en el `.env` de la API; IPs y claves de equipos sólo en el `.env` del Edge; escaneo limpio |
| 2 · CORS                 | Sin cambios: el Edge no es un navegador                                                                                                                 |
| 3 · Validación           | DTOs de la API con `whitelist`; el Edge valida configuración (Zod), hechos y sobres, y rechaza lo ilegible sin decidir                                  |
| 4 · Inyección SQL        | Consultas parametrizadas; un defecto de **orden** (no de inyección) corregido en `VersionesPg`                                                          |
| 5 · Rate limiting        | Rutas del Edge con límites propios en la API; en el Edge, por IP y minuto con `Retry-After`; la reconciliación con retroceso y jitter                   |
| 6 · RLS y `service_role` | 0049 con políticas y disparadores para el servicio; la API valida la copropiedad del Edge en la aplicación; acceso cruzado 404 y auditado               |
| 7 · CSP                  | Sin cambios                                                                                                                                             |
| 8 · Transversales        | Logs sin IPs (corregido el de arranque) ni secretos; cuerpos acotados (8 MiB / 64 KiB); el Edge escucha en una interfaz, nunca en todas                 |

## 8 · Deuda técnica, supuestos y pendientes

| ID            | Qué                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DT-15Q-01** | Sin WAN, el Edge no guarda los eventos de equipo que no son accesos (puerta forzada, sabotaje): no pasan por la bandeja                                              |
| **DT-15Q-02** | La nube en sitio con la base caída sigue contestando «negar» a la terminal mientras el Edge contesta su veredicto: gana el primero que llega                         |
| **DT-15Q-03** | La doble decisión (nube viva, sonda del Edge fallida) debería dejar un solo evento por construcción; no hay prueba de extremo a extremo                              |
| **DT-15Q-04** | El corte de WAN con equipos reales (`DESPLIEGUE_EDGE.md` §9) no se ha ejecutado                                                                                      |
| **DT-15Q-05** | Los ficheros generados del contrato y del cliente Dart crecen (excepción a «ningún existente crece»)                                                                 |
| S-181 a S-184 | Incremental condicional; la nube sella v1; 30 días de vencidas; dos clientes por equipo                                                                              |
| **P-28**      | «Escalar al portero» sin WAN: PENDIENTE DE DEFINICIÓN, hoy niega                                                                                                     |
| Consecuencia  | Las alertas de los accesos del Edge (lista negra) se escalan al reconciliar, no en < 10 s: sin WAN no hay central a quien avisar (KPI-25 no aplica durante el corte) |

## 9 · Qué debe hacer el usuario manualmente

1. En el `.env` de la API, confirmar `INGESTA_FIRMA_SECRETO` (32+ caracteres).
2. Aplicar la migración 0049 en el proyecto de Supabase (`supabase db push`).
3. Dar de alta el Edge con una sesión de superadministrador
   (`DESPLIEGUE_EDGE.md` §2.1) y copiar `edgeId` y `secreto` al `.env` del Edge.
4. En cada cámara, añadir el segundo destino de Alarm Server hacia el Edge
   (§2.2.2) y comprobar que el modelo lo admite (S-184).
5. Crear en cada equipo un usuario de servicio propio del Edge (§2.2.1).
6. Rellenar `/etc/next-control/edge.env` (`EDGE_EQUIPOS` entre comillas
   simples) y ejecutar `pnpm sitio:edge -- --env=…` hasta que no haya FALLO.
7. Si algún `.env` antiguo del Edge conserva `SUPABASE_SECRET_KEY`, borrarla y
   revocarla en el panel de Supabase.
8. Ejecutar el corte de WAN de §9 y rellenar su hoja de resultados.

## 10 · Rama y commits

Rama `etapa-15q-edge-en-sitio`, desde `develop` en `40f0250`. PR [#39](https://github.com/4rg3n15/NextResidential/pull/39), **sin fusionar**.

| Commit    | Qué                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------- |
| `80d386a` | `feat(etapa-15q/api)` · instantánea versionada, identidad del Edge, reconciliación acreditada, 0049 (Q1) |
| `eae6cee` | `feat(etapa-15q/edge)` · contingencia en sitio sobre los equipos, servidor local, descarga (Q2-Q5)       |
| `edebfc9` | `feat(etapa-15q/edge)` · paridad nube-Edge contra PostgreSQL, S-183 y la DoD real (Q8)                   |
| `38d890c` | `feat(etapa-15q/edge)` · `pnpm sitio:edge`, `.env.example`, fronteras O2 y KPI-11, orden 9 → 10 (Q7)     |
| `9615173` | `docs(etapa-15q/edge)` · `DESPLIEGUE_EDGE.md`, `/estado` en el diagnóstico, contrato y cliente Dart      |
| `b6881b0` | `docs(etapa-15q/edge)` · ADR-034, registro, `ETAPA-12.md`, `ESTADO_ETAPAS.md`, README                    |
| `fca3b32` | `fix(etapa-15q/edge)` · la paridad de rostros compara las dos lecturas de la base                        |
| cierre    | `chore(etapa-15q)` · cierre de la ronda: este informe y la verificación en `ESTADO_ETAPAS.md`            |
