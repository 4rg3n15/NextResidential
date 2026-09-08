# ETAPA 06 — Eventos, auditoría inmutable, alertas y tiempo real

Rama `etapa-06-eventos-auditoria` · sacada de `develop` actualizado (`c205a39`).

---

## 1 · Qué se construyó

El libro de la verdad del sistema: **ningún acceso existe sin evento, y ningún evento se
puede alterar**.

Se construyó el agregado `Acceso` —inmutable de verdad, no por convención—, el camino
completo desde que una cámara reporta hasta que el operador de central ve la alerta en su
consola, la clasificación y el escalamiento de lo que merece un humano, la vigilancia de
dispositivos que dejan de latir, el histórico con filtros y exportación en tres formatos, y
la evidencia servida por URL firmada de vida corta.

Se cerró **D-27** —la ingesta acreditaba la firma y no persistía nada—, **D-28** —sin límite
por dispositivo— y **D-21t** —claims por petición al repositorio—. Se resolvieron **P-06** y
**P-07** con las decisiones que el usuario fijó. Y se cerró el pendiente que la **ETAPA 01**
dejó abierto: la prueba de ejecución del `UPDATE` sobre `eventos`, que no se pudo hacer
entonces por tabla vacía y ahora se hace sobre una fila que existe.

Por el camino aparecieron dos defectos latentes que ninguna suite anterior podía ver, y un
tercero en el propio verificador. Los tres están en §8.

---

## 2 · Cómo se organizó y por qué

**El agregado `Acceso` no tiene setters, y eso se prueba enumerando su prototipo.** Es la
primera de las cuatro capas con las que ADR-005 sostiene RN-03 —el tipo, los permisos, el
trigger y la RLS—. `Object.freeze` en el constructor, todas las fechas copiadas al construir
—sin la copia, quien pasó el `Date` conserva una referencia y puede mover el instante del
evento _después_ de registrarlo— y una prueba que lee `Object.getOwnPropertyNames` del
prototipo y exige que solo esté el getter `resultado`. Si alguien añade `actualizar()`, esa
prueba se pone roja antes de que el problema llegue a la base.

**El evento se construye desde la DECISIÓN, no desde campos sueltos.** `Acceso.desdeDecision`
copia motivo, regla y versión del `ResultadoAcceso` y no admite ningún parámetro con el que
contradecirlos. Es lo que impide que el histórico diga una cosa y el motor haya decidido
otra — que es precisamente lo que una auditoría vendría a comprobar.

**El plazo de KPI-25 vive en el dominio, no en el adaptador.** `PLAZO_ESCALAMIENTO_MS` es una
constante de `alerta.ts`. Si estuviera en la configuración del canal, cambiar de transporte
cambiaría el compromiso sin que nadie lo notara. Y `escaladaDentroDelPlazo()` devuelve
`null` mientras no se haya escalado, no `true`: **lo no medido no se da por bueno**.

**`publicar` devuelve a cuántos llegó, y cero no cuenta como escalamiento.** No es telemetría:
una publicación a cero suscriptores es un no-envío, y con un `Promise<void>` sería
indistinguible de un envío correcto. Es la diferencia entre medir KPI-25 y suponerlo. Cuando
ocurre —el flujo alterno de CU-03, «ausencia de operador disponible»— la alerta se sella
igualmente para no perder el instante, se registra el aviso y se dispara el respaldo.

**El evento se anexa ANTES de publicar nada.** Si se publicara primero, un fallo de
persistencia dejaría a las consolas mostrando un acceso que no existe en el histórico, y el
histórico es la única fuente que la auditoría acepta. Publicar de más es un aviso perdido;
publicar de menos, un evento inventado.

**«Acceso dudoso» es toda decisión que el motor no pudo cerrar, y su consecuencia es un
humano** (P-07). No es un motivo concreto: son cuatro casos enumerados en
`politica-alertas.ts` —permiso con lectura sin confirmar, confianza insuficiente, placa
desconocida leída por LPR, fallo técnico—. Lo que NO alerta también está enumerado y probado:
una vigencia expirada o un patrón incumplido se registran y no escalan, porque ahí el motor
decidió con certeza y ahogar al operador en ruido es cómo se deja de mirar la consola.

**Tres estados de dispositivo y no dos** (P-06). Con un solo umbral hay que elegir entre
alertar por cada hipo de la red o esperar tanto que la alerta llegue cuando la puerta lleva
media hora sin control. `degradado` separa «se saltó un latido» de «lleva minutos mudo», y
solo el segundo alerta. Un dispositivo que **nunca** latió se trata como caído: «sin
noticias» y «todo bien» son lo mismo solo para quien no quiere enterarse.

**La idempotencia necesitaba una tabla nueva, y el motivo es estructural.** La migración 0011
ya traía `eventos_idempotencia_uk`, pero un índice único sobre una tabla particionada debe
incluir la clave de partición, y `ocurrido_en` **no es estable entre reintentos** — la propia
política de idempotencia del dominio prohíbe derivar la clave del instante, porque el Edge lo
recalcula al reconciliar. Dos entregas del mismo hecho caían como filas distintas. La
migración **0019** añade `recepciones_evento`: no particionada, clave primaria
`(copropiedad_id, clave_idempotencia)`, capaz de rechazar el duplicado en la misma sentencia
que lo inserta (ADR-04). **La recepción se escribe antes que el evento**, para descartar el
duplicado sin haber tocado una tabla donde deshacer una inserción exigiría un borrado que la
base no concede a nadie.

**Paginación por conjunto de claves, no por desplazamiento.** Un `OFFSET` sobre una tabla que
crece por la cabecera salta filas: entre la página 1 y la 2 entran eventos nuevos y la 2
empieza donde ya se leyó. El cursor lleva el par `(ocurrido_en, id)`.

**El módulo de eventos no importa el de autorizaciones.** Declara su propio puerto
`MotorDeDecision` —el consumidor declara el puerto, que es lo que dice el libro— y la raíz de
composición lo cablea contra `DecidirAcceso` a través de un barril nuevo,
`apps/api/src/autorizaciones/index.ts` (§2.2). La ETAPA 12 podrá enchufar ahí la decisión
local del Edge sin tocar una línea del caso de uso.

**Sin dependencias nuevas para los tres formatos de HU-32.** CSV con BOM y neutralización de
fórmulas —los campos vienen de usuarios y de equipos de red, y `=HYPERLINK(...)` en una celda
es ejecución al abrir el informe—, Excel en SpreadsheetML 2003, y un generador de PDF 1.4
escrito a mano cuya tabla `xref` se calcula sobre el buffer real, con una prueba que verifica
que cada desplazamiento apunta a su `N 0 obj`. Añadir dos bibliotecas para producir tablas
habría metido miles de líneas de terceros que la ETAPA 13 tendría que auditar y el SCA
vigilar para siempre.

**Los adaptadores en memoria son provisionales; la frontera no** (D-25). Sin contraseña de
PostgreSQL la API arranca con ellos, pero `RepositorioEventosPg` existe, cumple el **mismo
puerto** y se prueba contra una base real. Lo que se elige en el módulo es qué se cablea, no
qué se construyó: cuando llegue la credencial cambia una fábrica y nada más.

---

## 3 · Árbol de archivos

```
packages/domain-core/src/eventos/
├─ acceso.ts                     Agregado raíz INMUTABLE; se construye desde la decisión
├─ alerta.ts                     Alerta con métodos de intención; PLAZO_ESCALAMIENTO_MS (KPI-25)
├─ politica-alertas.ts           Qué merece un humano y qué es ruido (P-07)
├─ latido.ts                     Estado del dispositivo por latido (P-06)
├─ filtro-eventos.ts             VO del filtro del histórico; cubre el hueco D-05 del mockup
└─ *.test.ts                     (5 ficheros) bordes del plazo, inmutabilidad, los 10 motivos

apps/api/src/eventos/
├─ aplicacion/puertos.ts         Repositorios, canal, push, motor de decisión (el consumidor lo declara)
├─ aplicacion/registrar-acceso.ts  El camino entero: clave → decisión → evento → alerta → aviso
├─ aplicacion/escalamiento.ts    KPI-25 con cronómetro propio; cero destinatarios no cuenta
├─ aplicacion/consultar-eventos.ts  Historial, exportación con tope declarado, evidencia firmada
├─ aplicacion/vigilancia-latidos.ts  CA-26; no reabre alerta si ya hay una del mismo equipo
├─ aplicacion/dobles.ts          Dobles compartidos por las pruebas de la capa
├─ infraestructura/repositorio-eventos-pg.ts   Adaptador real; traduce `facial`↔`rostro`
├─ infraestructura/repositorios-en-memoria.ts  Provisionales, mismo puerto
├─ infraestructura/proyeccion-eventos.ts       Mapeo y cursor, COMPARTIDOS por los dos adaptadores
├─ infraestructura/canal-en-proceso.ts         SSE por copropiedad; retira sockets muertos
├─ infraestructura/evidencia-y-push.ts         URL firmada de vida corta (RN-21) y aviso al residente
├─ presentacion/eventos.controller.ts          Historial, exportación, evidencia y flujo SSE
├─ presentacion/alertas.controller.ts          Cola del operador; DTO, nunca el agregado crudo
├─ presentacion/formatos.ts                    CSV, Excel y PDF sin dependencias
├─ presentacion/limite-por-dispositivo.ts      D-28; limitador CON NOMBRE, no un guard
├─ presentacion/dtos.ts                        Forma; la verdad la valida el objeto de valor
└─ eventos.module.ts                           Raíz de composición

apps/api/src/autorizaciones/
├─ index.ts                                    Barril del módulo (§2.2)
└─ infraestructura/cargador-conservador.ts     Sin datos no se decide: se DENIEGA (§2.1.4)

apps/api/test/
├─ eventos.e2e.test.ts           Camino completo por HTTP, incluido el flujo SSE
├─ eventos-pg.test.ts            Adaptador real + INMUTABILIDAD SOBRE UN EVENTO REAL
└─ latencia-tiempo-real.test.ts  KPI-25 bajo carga: 200 eventos, 25 consolas

supabase/migrations/
├─ 0019_recepcion_de_eventos.sql            Libro de idempotencia no particionado (RN-17)
├─ 0020_umbral_de_latido.sql                P-06 configurable por copropiedad
└─ 0021_alertas_sin_clave_ajena_a_eventos.sql  El hallazgo de §8

scripts/lib/frontera-append-only.mjs         Sexto control, con prueba negativa
docs/arquitectura/tiempo-real-y-contingencia.md  Medición, escalera y procedimiento
```

Modificados: `ingesta.controller.ts` (cierra D-27), `app.module.ts` (dos limitadores con
nombre), `configuracion/esquema.ts` y `.env.example` (D-28), `aislamiento.e2e.test.ts`
(sustituye todos los `:param`, no solo `:id`), `supabase/verificar.sh` y
`scripts/verificar-etapa.sh` y `scripts/lib/metricas.mjs` (§8), `pruebas-negativas.mjs`
(sexto control), `verificar-frontera.sh`, `docs/ESTADO_ETAPAS.md`.

---

## 4 · Tabla SOLID

| Principio | Materialización en esta etapa                                                                                                                               | Verificación                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **SRP**   | `EscalarAlerta` solo escala; `RegistrarAcceso` orquesta; `clasificarAcceso` decide qué merece un humano y nada más. Ningún fichero > 300 líneas             | `escalamiento.ts` 108 · `alerta.ts` 168 · ninguna clase con > 5 métodos públicos         |
| **OCP**   | Un motivo de alerta nuevo es una rama en `clasificarAcceso`; un transporte nuevo es un adaptador. Ninguno de los dos toca el caso de uso                    | La prueba que reparte los 10 motivos deja de cuadrar si aparece el undécimo              |
| **LSP**   | `RepositorioEventosEnMemoria` y `RepositorioEventosPg` cumplen el mismo puerto y **comparten el mapeo y el cursor**, para no divergir sin que nadie lo note | `proyeccion-eventos.ts` es de los dos; ambos pasan las mismas afirmaciones de paginación |
| **ISP**   | `CanalTiempoReal` tiene un método; `NotificadorPush`, uno. Nada de un `ServicioDeEventos`                                                                   | Ningún adaptador lanza `NotImplemented`                                                  |
| **DIP**   | El módulo de eventos declara `MotorDeDecision`; la raíz de composición lo satisface con `DecidirAcceso` del otro módulo, por su barril                      | `grep -r "supabase\|pg" **/eventos/aplicacion/` → 0; el linter lo impone                 |

---

## 5 · Trazabilidad

**Cubierto.** OE-05 · RN-02 (todo intento genera evento, permitido o negado) · RN-03 y CA-23
(inmutabilidad, ahora **demostrada por ejecución sobre una fila real**) · RN-15 · RN-17 y
CA-22 (idempotencia real por `recepciones_evento`) · RN-18 y CA-18 (escalamiento con plazo
del dominio) · RN-21 (evidencia por URL firmada de vida corta) · HU-32 (historial filtrado,
paginado y exportable en CSV, Excel y PDF) · HU-34 (aviso al residente) · CA-26 y RN-12
(vigilancia de latidos) · **KPI-25 medido bajo carga** · KPI-22, KPI-23, KPI-24 (todo acceso
con evento, evento inalterable) · CP-07, CP-08.

**Parcialmente cubierto, con motivo.** KPI-26 (sabotaje) tiene su tipo de alerta y su camino
de escalamiento, pero la señal la produce el controlador de E/S de la ETAPA 15. HU-34 queda
en la cola del notificador: FCM exige el registro de tokens del dispositivo del residente,
que es de la ETAPA 11 (D-30). La consulta del histórico corre contra el adaptador en memoria
en tiempo de ejecución; el adaptador PostgreSQL está escrito y probado contra base real, y se
cablea cuando haya credencial (D-25).

**No cubierto y declarado.** El planificador de la vigilancia de latidos: `VigilarLatidos` es
una operación idempotente que nadie invoca todavía; pg-boss es de la ETAPA 14 (D-31). El
canal reparte solo dentro de su proceso (D-29).

---

## 6 · Pruebas

**413 pruebas en 40 ficheros**, todas verdes: 180 en el dominio, 24 en los proveedores, 209
en la API. La etapa añadió 207.

- **El agregado es inmutable, y se prueba de tres formas**: la asignación lanza; el prototipo
  no expone ningún método que cambie estado; y mover el `Date` original no mueve el evento.
- **CA-16 con cuatro pruebas**: sin operador, sin motivo, con motivo de solo espacios, y el
  caso que sí construye. Un motivo en blanco satisface un `NOT NULL` y dejaría la auditoría
  con un motivo vacío, que es lo mismo que sin motivo.
- **KPI-25 en los tres bordes**: 9 999 ms cumple, 10 000 ms exactos cumplen, 10 001 no. Y sin
  escalar devuelve `null`, no `true`.
- **Cero destinatarios no cuenta como escalamiento** aunque el reloj cuadre — la trampa que
  haría que el indicador diera siempre verde.
- **Los diez motivos repartidos**: una prueba comprueba que exactamente cuatro alertan y seis
  no, y que la suma son los diez. Si mañana se añade el undécimo, la cuenta deja de cuadrar y
  hay que decidir.
- **PDF**: cada desplazamiento del `xref` apunta a su `N 0 obj`, y el `/Length` declarado
  coincide con el flujo real. Un `xref` con un byte de más produce un fichero que unos
  lectores abren y otros rechazan — el peor fallo posible, intermitente y dependiente del visor.
- **Contra base real**: anexado idempotente con el instante recalculado (el caso del Edge),
  ausencia de fila a medias, traducción `facial`↔`rostro`, aislamiento por copropiedad, y la
  inmutabilidad sobre un evento que existe.

**Mutaciones ejecutadas para esta etapa** (un control que nadie ha visto fallar no está
demostrado):

| Mutación                                                        | Resultado                                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Trigger `tg_prohibir_update` desactivado y `UPDATE` reconcedido | La prueba de inmutabilidad **se pone roja**                                                  |
| Una migración con `FOREIGN KEY … REFERENCES public.eventos`     | El sexto control **la detecta**, y retirarla en una migración posterior la saca del recuento |
| Servidor de base de datos parado                                | El paso 13 informa **OMITIDA** en vez de dar verde                                           |

Ejecución: `pnpm test` para la suite; `./scripts/verificar-etapa.sh --con-base` para el cierre.

**Veredicto literal de §2.8.0:**

```
▸ 5 · suite completa
   @ncr/providers:test:       Tests  24 passed (24)
   @ncr/domain-core:test:       Tests  180 passed (180)
   @ncr/api:test:       Tests  209 passed (209)
   ✓ suite completa en verde

▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 40 de 40 ficheros de prueba ejecutados

▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 99.58 % · ramas 100.00 % · funciones 97.87 % (umbral 90 %, 19 archivos)
     OK   aplicacion (**/aplicacion/**): lineas 97.67 % · ramas 92.55 % · funciones 97.53 % (umbral 90 %, 13 archivos)
     OK   global: lineas 89.29 % · ramas 92.73 % · funciones 91.45 % (umbral 70 %, 83 archivos)
   ✓ las tres capas cumplen su umbral

▸ 8 · portabilidad de las superficies con shell (macOS/BSD y CI/GNU)
   ✓ portabilidad: 15 superficies con shell sin construcciones divergentes BSD/GNU (.sh, scripts de package.json, .husky/, run: de workflows, Makefile)

▸ 9 · pruebas negativas de los propios controles
   ✓ PRUEBAS NEGATIVAS: los 6 controles detectan su violación, sin tocar el árbol

▸ 10 · fronteras de arquitectura y secretos
   ✓ fronteras (DoD ETAPA 02)
   ✓ sin secretos
   ✓ KPI-11: sin ISAPI ni IPs de dispositivo fuera de packages/providers/
   ✓ sin claves ajenas vigentes hacia tablas append-only (2 declaradas, 2 retiradas, 4 tablas vigiladas)

▸ 11 · latencia del canal de tiempo real bajo carga (KPI-25)
   alertas entregadas: 200 de 200
   p50 / p95 / p99   : 2 / 4 / 11 ms
   maximo            : 23 ms
   umbral KPI-25     : 10000 ms
   ✓ KPI-25 con margen sobre el umbral

▸ 12 · esquema y aislamiento en --modo-supabase
   ✓ migraciones, semillas y suite SQL

▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)

VERIFICACIÓN DE ETAPA: correcta — se puede escribir el informe
```

**Entorno de esta medición:** contenedor Linux, Node 22.22.2, PostgreSQL 16.13 aplicado por
un rol dueño **no** superusuario (`--modo-supabase`). La cobertura global depende de qué
recorre la corrida y de la máquina; se anota el entorno junto a la cifra para que una
ejecución en macOS con otro número no parezca una discrepancia.

---

## 7 · Verificación de seguridad (contra §2.7)

1. **Secretos solo en entorno.** Dos variables nuevas (`THROTTLE_DISPOSITIVO_LIMITE`,
   `THROTTLE_INGESTA_IP_LIMITE`), en el esquema Zod y en `.env.example` sin valores. Escaneo
   de secretos verde sobre 266 archivos.
2. **CORS.** Sin cambios. El flujo SSE va a los mismos orígenes de la lista blanca.
3. **Validación en el backend.** DTOs nuevos con `class-validator`, importados **por valor**
   (la lección de D-24). El histórico sin rango responde 400: una consulta sin techo sobre
   una tabla particionada es una denegación de servicio con una petición legítima.
4. **Anti inyección.** Todo el SQL nuevo es parametrizado; las condiciones del filtro se
   construyen con marcadores numerados y nunca por concatenación. La exportación **neutraliza
   fórmulas** en CSV, que es inyección en el destino y no en la base.
5. **Rate limiting.** D-28 cerrada, y con ella un defecto que habría capado la ingesta de una
   copropiedad entera a 120 eventos por minuto (§8).
6. **RLS.** Dos tablas nuevas con RLS **activa y forzada** y su política por rol. El
   adaptador fija `request.jwt.claims` en la misma conexión que ejecuta la sentencia. La
   suite de aislamiento se **endureció**: sustituye todos los `:param`, no solo `:id`, así que
   rutas como `/alertas/:alertaId/atencion` llegan ahora hasta su comprobación de alcance en
   vez de morir en un 400 del `ParseUUIDPipe` y contarse como cubiertas.
7. **CSP.** Sin cambios. El endpoint SSE fija `X-Accel-Buffering: no` para que un proxy con
   búfer no acumule los mensajes — si lo hiciera, la latencia medida sería la del búfer.
8. **Transversales.** La evidencia sale por URL firmada con HMAC, comparación en tiempo
   constante y **120 segundos** de vida: el enlace acaba en un historial de navegador o en un
   correo reenviado. El cuerpo del aviso al residente **no** se registra en la bitácora —puede
   nombrar a una persona y a una vivienda, y la bitácora se envía a un tercero—; se registra
   su longitud. `404` y no `204` cuando no hay evidencia: distinguir «no hay» de «no existe»
   permitiría enumerar eventos ajenos contando respuestas.

---

## 8 · Deuda técnica, supuestos y pendientes

### Hallazgo 1 · Una clave ajena hacia una tabla append-only es imposible

`alertas_evento_fk` (migración 0011) apuntaba a `eventos`. La comprobación de integridad
referencial bloquea la fila referenciada con `SELECT … FOR KEY SHARE`, y PostgreSQL exige
para ese bloqueo el privilegio UPDATE o DELETE **además** del SELECT — que ADR-005 revoca a
todos, dueño incluido. **Toda** inserción en `alertas` con `evento_id` habría fallado con
«permission denied for table eventos»: no por la RLS, no por el trigger, sino por el bloqueo.

Vivió cinco etapas invisible porque las dos tablas estaban vacías: **una restricción que
nunca se ejerce no se distingue de una que funciona**. Es la cuarta de la misma familia que
las tres anteriores.

Resolución: entre inmutabilidad e integridad declarativa gana la inmutabilidad —RN-03 y CA-23
son requisitos con criterio de verificación; la clave ajena protege de un borrado que esta
base no concede—. La migración 0021 la sustituye por un trigger que comprueba existencia con
un `SELECT` normal, y que además verifica la copropiedad, cosa que la clave ajena **no**
hacía (RN-15). Su aserción general destapó el gemelo `consent_evidencia_fk` → `evidencias`,
corregido igual: dejar en pie una restricción sabiendo que es inservible solo garantizaría
que la ETAPA 08 tropiece con ella. Queda `scripts/lib/frontera-append-only.mjs` como sexto
control, que lo detecta al **escribir** la migración y no al aplicarla.

### Hallazgo 2 · El límite por IP capaba la ingesta de todo un conjunto

La prueba de carga entregó 120 de 200 alertas — exactamente el límite del `throttler`— con
200 dispositivos distintos saliendo de una sola IP. `@Throttle({ default: … })` en la ruta
reconfigura el limitador `default` para **todos** los guards, incluido el global, que cuenta
por IP. Era el defecto que el comentario del propio código decía evitar.

En un conjunto real todas las cámaras comparten enrutador: el tope las habría sumado a todas
y habría empezado a rechazar eventos con un 429 que ninguna cámara reporta. Corregido con dos
limitadores **con nombre**, cada uno con su `getTracker`: `default` por IP, `dispositivo` por
equipo firmante, acotado con `skipIf` a las peticiones que traen `dispositivoId`.

### Hallazgo 3 · Tres defectos del propio verificador

- `supabase/verificar.sh` concedía la pertenencia a `authenticated` **antes** de aplicar las
  migraciones. En PostgreSQL 16, un rol con `CREATEROLE` que crea otro recibe sobre él una
  pertenencia implícita con `set_option = false` que **sustituye** a la anterior: en un
  clúster limpio la suite SQL no podía ni arrancar. Solo se veía en una máquina nueva, porque
  los roles son de ámbito de clúster y `DROP DATABASE` no los borra.
- El paso de base real daba **verde con el servidor caído**: esas pruebas se omiten solas y
  el guion leía la omisión como éxito. Ahora comprueba la marca `OMITIDA`.
- `metricas.mjs` imprimía «(sin resumen de cobertura)» y **seguía**. Una ejecución informó
  «las tres capas cumplen su umbral» midiendo 21 archivos en vez de 83, con la capa de
  aplicación desaparecida por completo. Ahora una capa sin medir es fallo: no era una capa
  por debajo del umbral, era una capa que nadie miró.

### Dato que ADR-005 afirmaba y ahora está demostrado

La mutación reveló que, con el trigger desactivado y el `UPDATE` reconcedido, **la RLS sí
detiene la alteración** —la sentencia afectó a 0 filas y el evento quedó intacto—, pero **no
lanza**. Por eso la prueba exige un error y no solo una fila sin alterar: un no-op silencioso
no es «rechazar la operación» (CA-23).

### Deuda nueva

| ID   | Deuda                                                                                                                        | Se salda en                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| D-29 | `CanalEnProceso` reparte solo dentro de su proceso: con dos instancias de API, un operador conectado a la B no ve lo de la A | ETAPA 14                            |
| D-30 | El notificador push encola y deja constancia, pero no envía: FCM exige el registro de tokens del residente                   | ETAPA 11                            |
| D-31 | `VigilarLatidos` no tiene planificador                                                                                       | ETAPA 14                            |
| D-32 | El trigger que sustituye a las claves ajenas comprueba existencia **sin bloqueo de fila**                                    | Riesgo residual declarado; ETAPA 13 |
| D-33 | La exportación tiene tope de 10 000 filas y declara el truncado por cabecera; la consola debe mostrarlo                      | ETAPA 09                            |

**Cerradas:** D-27, D-28, D-21t. **Sigue abierta:** D-25 (la frontera quedó definitiva; el
adaptador se cablea con la credencial).

**`PENDIENTE DE DEFINICIÓN` y supuestos.** P-06 y P-07 **resueltas** por el usuario. Sigue
abierta P-02 (umbral de confianza), con `[SUPUESTO] S-16` vigente en 0,85, declarado en
`cargador-conservador.ts`.

---

## 9 · Qué debe hacer el usuario manualmente

1. **Aplicar las tres migraciones nuevas** al proyecto Supabase: `supabase db push`. Son
   `0019` (libro de recepción), `0020` (umbral de latido por copropiedad) y `0021` (retirada
   de las dos claves ajenas imposibles). La `0021` **falla a propósito** si detecta cualquier
   otra clave ajena hacia una tabla append-only.
2. **Ejecutar `./scripts/verificar-etapa.sh --con-base` en macOS** y confirmar el veredicto.
   Requiere `DATABASE_URL_PRUEBAS` apuntando a una base con las migraciones y las semillas, y
   con un rol de conexión que **no** sea superusuario: con un superusuario, el paso 13 no
   demuestra nada porque ignora los permisos de tabla.
3. **Confirmar contra el proyecto real** que la 0021 se aplicó sin hallazgos. Es la
   comprobación que cierra el hallazgo 1 fuera de este entorno.
4. **Opcionalmente**, ajustar `THROTTLE_DISPOSITIVO_LIMITE` (por defecto 120/min por equipo) y
   `THROTTLE_INGESTA_IP_LIMITE` (3000/min) según el número de cámaras del conjunto piloto.
5. **Cuando haya credenciales de Supabase**, seguir el procedimiento de §5 de
   `docs/arquitectura/tiempo-real-y-contingencia.md` para medir Supabase Realtime con la misma
   prueba y comparar contra la tabla de cifras.

---

## 10 · Rama y commits

Rama `etapa-06-eventos-auditoria`, sacada de `develop` actualizado (`c205a39`), sin
reescritura de historia.

- `611a14f` — `feat(etapa-06/eventos-auditoria)`: histórico inmutable, ingesta idempotente y
  KPI-25 medido.
- `chore(etapa-06): cierre de etapa` — este informe, el estado y los ajustes del verificador.
