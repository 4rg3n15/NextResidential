# ETAPA 12 — Edge Gateway: operación sin conexión y reconciliación

**Rama:** `etapa-12-edge-gateway-offline` · **Cerrada:** 2026-09-20
**Depende de:** ETAPA 06 (eventos e ingesta) · **Demuestra:** OE-06

---

## 1 · Qué se construyó

Un gateway que vive en la portería y **decide accesos cuando no hay internet**,
con las reglas que la nube le dio la última vez, y que al reconectar envía todo
lo que ocurrió durante el corte exactamente una vez.

Lo que hace que esto sea OE-06 y no «una copia pequeña del sistema» cabe en una
frase: **el Edge ejecuta el mismo motor de reglas que la nube, sin una línea
propia de lógica de acceso**. No hay un `if` sobre vigencias, ni sobre listas
negras, ni sobre horarios en todo `apps/edge`. Lo que hay es código que arma un
contexto —que es armar datos— y llama a `evaluarAcceso` de `@ncr/domain-core`,
el mismo que ejecuta la API.

Alrededor de eso: una caché de reglas versionada en SQLite, detección de pérdida
de WAN con histéresis, una bandeja de salida con clave de idempotencia, la
reconciliación ordenada que descarta duplicados en silencio, la política de
contingencia configurable que deniega por omisión, y el marcado de lo decidido
con caché que pudo envejecer.

Y en la API, la entrada que faltaba: una ruta de reconciliación que **no vuelve
a decidir**.

---

## 2 · Cómo se organizó, decisión por decisión

### 2.1 · El dominio no se tocó, y esa es la entrega

El enunciado pedía reutilizar `packages/domain-core` **sin modificarlo**, y
avisar antes de tocarlo si hacía falta. No hizo falta, y conviene decir por qué
con precisión, porque es la prueba de que las etapas anteriores estaban bien
hechas:

- `evaluarAcceso` ya era una función pura con el reloj en el contexto. No hubo
  que quitarle ningún `new Date()` escondido.
- `ContextoDeAcceso` ya declaraba «todo lo que el motor necesita, ya resuelto»,
  así que el Edge pudo construirlo desde su caché sin inventar un tipo paralelo.
- `VersionDeReglas` ya existía como objeto de valor, con su comentario diciendo
  que de él depende que el Edge sea auditable.
- `Autorizacion.rehidratar` ya distinguía «alta» de «reconstrucción desde
  persistencia». Sin ese método, una autorización revocada habría vuelto de la
  caché como vigente.
- `construirClaveIdempotencia` ya excluía la marca de tiempo de la clave, con el
  motivo escrito: «el Edge puede recalcular `ocurridoEn` al reconciliar».
- `HechoEntrante` de la API ya tenía `decididoPorEdge` y
  `cachePotencialmenteObsoleto`.

**Lo único que hubo que corregir fue mío:** la caché declaraba un estado
`'expirada'` que el dominio no tiene —la expiración se deriva de la `Vigencia`,
no se guarda— y el compilador lo rechazó. El dominio tenía razón.

### 2.2 · La caché es una instantánea cerrada, no una réplica de tablas

Lo tentador era replicar las tablas de la nube en SQLite y consultarlas igual.
Se descartó por lo que RN-16 obliga a demostrar: con tablas replicadas, la
decisión depende de **cómo consulte cada lado**, y dos consultas parecidas con
un `JOIN` distinto son dos sistemas de reglas que se parecen.

Una instantánea versionada es exactamente lo que `ContextoDeAcceso` pide. El
Edge no consulta nada durante la evaluación —igual que la nube— y el número de
versión es lo que después permite explicar por qué decidió así.

### 2.3 · Tres cosas se deciden fuera del motor, y ninguna es «quién entra»

1. **Qué hacer sin caché** (CU-04 3a). Sin instantánea no hay contexto que
   armar, así que no hay nada que preguntarle al motor. Es configurable y el
   valor por omisión es `denegar`.
   **`escalar` tampoco abre**: niega y entrega el caso al portero, que es una
   persona decidiendo. La diferencia está en a quién le toca el siguiente paso.
2. **Si la caché pudo envejecer** (KPI-31). No impide decidir —un gateway que se
   negara a operar tras 24 h incumpliría KPI-30, que es lo contrario de lo que
   se le pide— pero marca el evento. Y se mide desde que **la nube generó** la
   instantánea, no desde que el Edge la recibió: medir la llegada haría que un
   reinicio que recarga la caché del disco la diera por fresca.
3. **La clave de idempotencia**, que la construye el dominio.

### 2.4 · Histéresis en la detección del enlace

Un enlace de portería no cae limpiamente: pierde un paquete, vuelve, pierde
tres, vuelve. Con una sonda fallida bastando para conmutar, el gateway pasaría
el día entrando y saliendo del modo autónomo, y cada cambio arrastra trabajo
real. Hacen falta **tres** sondas fallidas seguidas para caer y **dos**
correctas para volver, y los números son distintos a propósito: caer cuesta caro
—se deja de intentar la nube— así que se exige más evidencia; volver es barato y
reversible.

Y **arranca en modo autónomo**, no en línea. Suponer nube al encender haría que
cada acceso esperara un tiempo de espera de red hasta que la primera sonda
fallara.

### 2.5 · La reconciliación corta el lote al primer fallo

Parece desperdicio y es lo contrario: si el número 3 falló por un corte, del 4
al 50 van a fallar igual y cada uno gasta un tiempo de espera y una entrada del
limitador. Peor: si el 3 falló y el 4 se confirmó, el histórico tendría el 4 sin
el 3 hasta el siguiente ciclo, y el orden —que es la mitad de CA-22— dejaría de
cumplirse.

Y se reanuda desde el último confirmado. La idempotencia descartaría los ya
enviados igual, pero reenviarlos consume la ventana de 5 minutos de la DoD.

### 2.6 · La ruta de reconciliación NO vuelve a decidir

Es el punto donde la API tuvo que crecer, y el único. `POST
/ingesta/reconciliacion` recibe cada evento **con la decisión que el gateway ya
tomó**, sellada con la versión de reglas que tenía, y con el instante real en
que ocurrió.

Recalcular habría sido un error de dos formas a la vez: con las reglas de hoy,
que pueden no ser las de entonces —así que el histórico afirmaría algo que nadie
decidió— y borrando la única prueba de qué hizo el Edge, que es justo lo que
CA-21 exige poder auditar.

El instante importa igual: sin él, veinte accesos de media hora aparecerían
apilados en el minuto de la reconexión y la línea de tiempo quedaría inservible.

**El duplicado responde 202, no 409.** El Edge reenvía a propósito porque no
sabe si el envío anterior llegó; un 409 le diría «error» a algo que salió bien
y le haría reintentar para siempre.

### 2.7 · La bandeja es la misma mecánica que la de la app del residente

Deliberado: un solo concepto en los dos sitios, una sola forma de razonar sobre
duplicados, y las dos pruebas se leen igual. La diferencia es la exigencia: el
teléfono puede perder una visita encolada y el residente la vuelve a crear; el
Edge no puede perder un acceso, porque RN-02 dice que ninguno existe sin evento
y nadie va a volver a pasar por la talanquera para regenerarlo.

---

## 3 · Árbol de archivos

```
apps/edge/
├─ src/
│  ├─ aplicacion/
│  │  ├─ instantanea-de-reglas.ts   Caché → ContextoDeAcceso. No decide: arma datos
│  │  ├─ decidir-localmente.ts      CU-04. Llama al motor del dominio; contingencia y KPI-31
│  │  ├─ enlace-wan.ts              Máquina de estados pura, con histéresis
│  │  ├─ reconciliacion.ts          CA-22: orden, duplicado silencioso, retroceso con jitter
│  │  ├─ gateway.ts                 Dos entradas: un hecho y un tic. Cero temporizadores
│  │  └─ puertos.ts                 Caché, bandeja, sonda, cliente de nube
│  ├─ infraestructura/
│  │  ├─ sqlite/motor.ts            El único punto que carga `node:sqlite`, y por qué
│  │  ├─ sqlite/esquema.ts          Clave primaria y secuencia: las garantías son de la base
│  │  ├─ sqlite/cache-de-reglas.ts  La versión solo AVANZA
│  │  ├─ sqlite/bandeja-sqlite.ts   RN-17 por clave primaria, no por un `if`
│  │  └─ api/cliente-de-nube.ts     Lo único que sabe que existe HTTP. Firma HMAC
│  ├─ configuracion/esquema.ts      Zod; no arranca sin lo obligatorio (D-91 ya aprendido)
│  └─ main.ts                       Raíz de composición: el único con temporizador y servidor
└─ test/
   ├─ misma-decision.test.ts        RN-16: nube y Edge, el mismo resultado y el mismo motivo
   ├─ dod-corte-de-wan.test.ts      La DoD ejecutada: 30 min, 20 accesos, una sola vez
   ├─ kpi-30-autonomia.test.ts      24 h sin degradación, medida en tres sentidos
   └─ gateway.test.ts               El cuerpo que viaja lleva la decisión sellada

apps/api/src/
├─ eventos/aplicacion/registrar-acceso.ts        + `decisionDelEdge` y `ocurridoEn`
└─ autorizaciones/presentacion/
   ├─ dtos.ts                                     + el lote y la decisión sellada
   └─ ingesta.controller.ts                       + POST /ingesta/reconciliacion

docs/guias/DESPLIEGUE_EDGE.md                     Aprovisionar, rotar, sincronizar, actualizar
docs/decisiones/ADR-017-…                          `node:sqlite` y no un módulo nativo
```

---

## 4 · Cumplimiento SOLID

| Principio | Cómo se materializa aquí                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **SRP**   | `DecidirLocalmente` decide, `Reconciliacion` vacía, `enlace-wan` conmuta, `Gateway` coordina. Ningún fichero pasa de 300 líneas          |
| **OCP**   | El motor recibe las políticas por parámetro (`reglas` en `OpcionesDeDecision`): cambiar el conjunto no toca `DecidirLocalmente`          |
| **LSP**   | `CacheDeReglas` y `BandejaDeSalida` tienen doble en memoria y adaptador SQLite; las pruebas de la DoD corren con el real y las de unidad con el doble, sin cambiar una aserción |
| **ISP**   | Cuatro puertos pequeños —caché, bandeja, sonda, nube— en vez de un `ServicioDelEdge`. Ningún adaptador lanza `NotImplemented`            |
| **DIP**   | `apps/edge/src/aplicacion/` no importa `node:sqlite` ni `fetch`. `grep -r "node:sqlite\|fetch(" src/aplicacion/` devuelve 0              |

---

## 5 · Trazabilidad

| Elemento   | Dónde se cumple                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| **OE-06**  | La etapa entera                                                                                       |
| **CU-04**  | `decidir-localmente.ts` + `reconciliacion.ts`, con la excepción 3a como política configurable         |
| **RN-16**  | `test/misma-decision.test.ts`: once casos por los dos caminos, resultado y motivo idénticos           |
| **RN-17**  | `construirClaveIdempotencia` del dominio; clave primaria en SQLite; 202 con `duplicado` en la API     |
| **CA-21**  | `VersionDeReglas` sellada en cada decisión; se lee de vuelta en `reconciliacion-edge.e2e.test.ts`     |
| **CA-22**  | Orden, descarte silencioso y reanudación desde el último confirmado                                   |
| **HU-30**  | Conmutación a modo autónomo con histéresis                                                            |
| **HU-31**  | Reconciliación al reconectar, con su resumen en el registro                                           |
| **KPI-28** | Los 20 accesos de un corte llegan a la nube; medido en la DoD                                         |
| **KPI-29** | Reconciliación en menos de 5 minutos; medido en la DoD                                                |
| **KPI-30** | `test/kpi-30-autonomia.test.ts`: decide igual en la hora 23, el coste no crece, y no degrada          |
| **KPI-31** | Marcado por antigüedad de la instantánea, medido desde que la generó la nube                          |
| **CP-09**  | El recorrido de §3.3 de la guía de despliegue                                                         |

**Parcial, y dicho:** la descarga de la instantánea desde la nube
(`descargarReglas`) tiene cliente y contrato, y **la ruta que la sirve no está
construida**: hoy la caché se siembra en el aprovisionamiento. Se cierra con el
tablero de reglas, que es de la ETAPA 14. No afecta a la DoD —que parte de un
gateway ya sincronizado— pero sí a la operación en régimen, y por eso queda
escrito aquí y en `ESTADO_ETAPAS.md`.

---

## 6 · Pruebas

| Suite                      | Qué demuestra                                                            |
| -------------------------- | -------------------------------------------------------------------------- |
| `misma-decision`           | 11 casos: permitido, lista negra, vigencia, vivienda, placa, confianza, zona, aforo, consentimiento. Y una prueba que exige que los casos cubran permitidos **y** denegados con cuatro motivos distintos: diez denegaciones por lo mismo no demostrarían la precedencia |
| `dod-corte-de-wan`         | El corte entero con reloj fabricado. Reenvío sin duplicar, conexión intermitente, nube caída |
| `kpi-30-autonomia`         | 1.440 accesos en 24 h; el coste por acceso no crece con la bandeja llena; el marcado no niega |
| `reconciliacion-edge.e2e`  | La API escribe la decisión del Edge **leída de vuelta del histórico**, con su motivo y su versión |
| `cliente-de-nube`          | La firma del Edge la verifica el **verificador real de la API**, importado, no reescrito |

Total del Edge: **101 pruebas**. Cobertura del paquete: líneas 99 %, ramas 90 %.

### Veredicto · de qué corrida sale, y en qué máquinas

**Este apartado se reescribió.** La primera versión daba por cerrada la etapa
con un veredicto local, sin decir en qué máquina se había obtenido, mientras el
CI de `ubuntu-latest` estaba en rojo sobre la misma SHA. Un veredicto que no
dice de dónde sale no es verificable, y uno de una sola plataforma no cubre el
entorno declarado en §2.8.0 —desarrollo en macOS, CI en Linux—.

**1 · Local**, `./scripts/verificar-etapa.sh --con-base`, 25 de 25 pasos, sobre
el árbol de la cabeza de la rama:

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

**2 · Integración continua**, flujo `verificacion.yml`, los dos trabajos de la
matriz sobre la SHA final:

| Trabajo                     | Resultado |
| --------------------------- | --------- |
| `controles (ubuntu-latest)` | **verde** |
| `controles (macos-latest)`  | **verde** |

El control declarado no ejercido sigue siendo el **5e** de la ETAPA 11 —el
recorrido de la app en un navegador real—, con su motivo escrito y revisión en
la ETAPA 14. Aparece en el veredicto en cada corrida, que es como se pidió.

| Medida del conjunto            | Valor                                            |
| ------------------------------ | -------------------------------------------------- |
| Pruebas                        | **1.729** · 136 de 136 ficheros recogidos          |
| Cobertura · dominio            | líneas 97,71 % · ramas 96,48 % (umbral 90 %)       |
| Cobertura · **aplicación**     | líneas 96,92 % · ramas 92,01 % (umbral 90 %) — ahora sobre **39** ficheros, con la del Edge dentro |
| Cobertura · global             | líneas 72,85 % (umbral 70 %)                       |

**Y un hallazgo del propio verificador que vale la pena contar:** el paso 7
informó «11 ficheros de prueba en disco que NADIE ejecutó». El paso 5 los corría
—136 de 136— y la **medición de cobertura** no los veía, porque `@ncr/edge` no
estaba en la lista de paquetes de `metricas.mjs`. Es decir: la capa de
aplicación del Edge, que es el corazón de esta etapa, quedaba fuera del umbral
del 90 % de §2.4 sin que nada se pusiera rojo. Es la misma forma del hueco que
`@ncr/providers` tuvo en la ETAPA 05, y lo destapó el control que se escribió
entonces para que no volviera a pasar.

---

## 7 · Verificación de seguridad (§2.7)

| Medida                        | Estado en esta etapa                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1 · Secretos en entorno        | El Edge no arranca sin los suyos. `.env.example` versionado sin valores; el control de D-90 ahora vigila **los dos** esquemas |
| 2 · CORS                       | No aplica: el receptor del Edge escucha en la red local y no sirve un navegador                             |
| 3 · Validación en servidor     | El lote se valida con DTO y `forbidNonWhitelisted`; un campo de más es 400                                  |
| 4 · Anti inyección             | Todo el SQL del Edge es parametrizado; cero concatenación                                                   |
| 5 · Rate limiting              | La ruta nueva hereda el tope de ingesta; el retroceso del Edge tiene jitter que **resta** para no chocar     |
| 6 · Aislamiento                | El gateway atiende UNA copropiedad; una instantánea de otra se descarta (RN-15). El lote valida la copropiedad de cada evento |
| 7 · Cabeceras                  | No aplica                                                                                                   |
| 8 · Transversales              | Firma HMAC con ventana de frescura; identidad y llave **por equipo**; el registro nunca imprime el secreto ni el cuerpo de un evento |

---

## 8 · Deuda, hallazgos y supuestos

| ID       | Qué                                                                                                                                                                                       | Estado        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| **D-98** | Una instantánea truncada —corte de luz a mitad de la escritura— **tumbaba el gateway**: el primer recorrido sobre una colección ausente lanzaba. En un equipo de portería eso no es una traza: es una puerta que deja de abrirse. Lo destapó la prueba de la caché ilegible | **Corregido** · `instantaneaUsable` |
| **D-99** | `SQLITE_PATH` admitía un byte nulo. Lo encontró la prueba genérica de D-91 al exigir que todo campo opcional rechace un valor inválido; §2.7.4 lo pide para toda entrada de texto            | **Corregido** |
| **S-24** | La ruta que SIRVE la instantánea de reglas no está construida: hoy la caché se siembra al aprovisionar. Cliente y contrato listos; se cierra con el tablero de reglas (ETAPA 14)            | `[SUPUESTO]` **abierto** |
| **S-23** | (de la 11) El horario de zonas se pinta en el huso del teléfono. **Anotado para la ETAPA 16**                                                                                              | `[SUPUESTO]` **abierto** |
| **D-100** | **El cierre de esta etapa se retiró por este defecto.** `metricas.mjs` tenía delante el informe JSON con la prueba roja y **no imprimía su nombre**: informaba «la corrida NO terminó» con un recuento de bytes, y mandaba a buscar una cobertura baja que no existía. Confundía **suite en rojo** —hay informe con rojas, y el remedio es arreglar la prueba— con **corrida interrumpida** —murió el proceso, y el remedio es mirar la máquina—. Además, su filtro de pistas se tragaba `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`, que es el eco de pnpm y no el nombre de nada | **Corregido** · prueba negativa 22 |
| **D-101** | Una prueba de `@ncr/api` falla **de forma intermitente en Linux bajo instrumentación de cobertura**: 1 roja de 658 en `ubuntu-latest` (`bbae506`), verde en `macos-latest` sobre la misma SHA. **No reproducida en 11 intentos deliberados** posteriores (5 en `ubuntu-latest` con un paso de caza, 6 en local con `taskset -c 0,1`). Su causa **no está establecida** | **Abierto** · instrumentado, no cerrado |

### D-100 · por qué esta etapa dejó de estar cerrada

La cerré sobre un veredicto local de macOS. En `ubuntu-latest`, **la misma SHA**
estaba en rojo: una prueba de 658 en `@ncr/api` bajo cobertura.

Lo que hace esto un defecto del control y no solo mala suerte: `metricas.mjs`
**tenía el nombre de esa prueba en memoria** —el informe JSON de vitest trae
cada aserción con su `status` y sus `failureMessages`— y lo descartaba para
imprimir «la corrida NO terminó» con un recuento de bytes. El mensaje llevaba
además una invitación explícita a buscar una cobertura baja, que no existía.

Son dos situaciones con remedios opuestos y se informaban igual:

| Situación              | Cómo se reconoce                      | Qué hay que hacer                          |
| ---------------------- | ------------------------------------- | ------------------------------------------ |
| SUITE EN ROJO          | hay informe y trae `numFailedTests>0` | arreglar **esa** prueba, que ahora se nombra |
| CORRIDA INTERRUMPIDA   | no hay informe, o lo hay sin rojas    | mirar la máquina: señal, memoria, contenedor |

Es la familia de siempre —el control existe y no comprueba lo que uno cree— y
esta vez dentro de la herramienta que la persigue: **llevaba desde la ETAPA 09
sin que nadie viera qué imprime cuando de verdad hay una roja**. La prueba
negativa 22 lo cierra: mete una prueba que falla a propósito y exige que la
salida diga su nombre, su fichero y la clasifique bien.

Y una nota de método, porque importa más que el arreglo: **re-ejecutar el
trabajo hasta que salga verde no es un arreglo**. «Flake» no es una causa raíz;
es lo que se dice cuando no se ha buscado la causa.

### D-101 · lo que se buscó, lo que se midió, y lo que queda abierto

**Se buscó.** Un paso temporal en el trabajo de `ubuntu-latest` repitió la suite
de `@ncr/api` bajo cobertura **cinco veces**, parándose a la primera roja. No
salió ninguna. En local, seis corridas completas con `taskset -c 0,1` y otras
cuatro de la prueba de latencia sola con `taskset -c 0`: todas limpias.

**Se midió el sospechoso principal.** El candidato natural era
`test/latencia-tiempo-real.test.ts`, la única prueba de `apps/api` con umbral de
reloj de pared apretado: p99 < 1 000 ms con 25 suscriptores SSE y 200 eventos en
ráfaga. Clavada a **un solo núcleo** y bajo instrumentación de cobertura:

| Medida  | Valor    | Umbral de la prueba | Compromiso (KPI-25) |
| ------- | -------- | ------------------- | ------------------- |
| p99     | 61–67 ms | 1 000 ms            | —                   |
| máximo  | 68–75 ms | —                   | 10 000 ms           |

Quince veces de margen contra la alarma temprana y ciento treinta contra el
compromiso. **No es el sospechoso**, o al menos no lo es en ninguna máquina a la
que tenga acceso.

**No se tocó ningún umbral**, y el criterio queda escrito por si alguien lo
intenta más adelante: el compromiso del producto es **KPI-25, 10 segundos**, y
eso se asevera siempre. El margen de 1 segundo del p99 **no es el compromiso**:
es una alarma temprana sobre la máquina, para avisar cuando la latencia empiece
a subir y no cuando ya se haya incumplido el indicador. Relajarlo para poner
verde una corrida sería cambiar una alarma por silencio, y encima sin haber
entendido qué la disparó.

**Qué queda.** La causa **no está establecida** y el defecto sigue abierto. Lo
que sí cambió es que la próxima vez no costará una tarde: con D-100 corregido,
una roja imprime su nombre, su fichero y su aserción en el propio paso 7. Por eso
el paso temporal de caza se retiró —el camino normal ya hace ese trabajo— y no
porque el problema esté resuelto.

**Sobre los controles, que también movieron:**

- El control de D-90 (`entorno-declarado`) vigilaba solo el `.env.example` de la
  API. El Edge estrena la misma pareja —esquema Zod y ejemplo— así que hereda el
  mismo modo de fallar; ahora el control recorre **las dos superficies**, y
  añadir una tercera es añadir una entrada a una lista.
- El trinquete de ramas señaló que `frontera-construccion.mjs` perdía una rama
  cubierta: hasta ahora `apps/edge` era un esqueleto **sin `tsconfig.json`**, y
  esa rama —«paquete sin tsconfig: saltar»— se ejercitaba por accidente. Al
  construirse el Edge de verdad dejó de tocarla nadie. Se añadió la prueba
  negativa deliberada. Es exactamente para lo que el trinquete está.
- Un control que ya existía atrapó la ruta nueva: «toda escritura cuelga de
  `copropiedades/:id`». `/ingesta/reconciliacion` no cuelga de ahí y no puede
  —quien reconcilia es un equipo, no una sesión— así que se declaró exenta con
  su motivo, junto a las otras dos rutas firmadas.

---

## 9 · Qué debe hacer usted

1. **Nada para que la suite corra.** Todo lo de esta etapa se verifica sin
   equipos ni credenciales suyas: el corte de WAN, las 24 horas y la
   reconciliación se ejecutan con reloj y red fabricados, contra SQLite de
   verdad y el motor de reglas de verdad.
2. **Para desplegar un gateway real**, siga `docs/guias/DESPLIEGUE_EDGE.md`. La
   comprobación que importa es la **§3.3**: 30 minutos de corte, 20 accesos, y
   los 20 en la nube exactamente una vez.
3. **Emita una llave secreta de Supabase por equipo**, no una compartida. El
   procedimiento está en §4.2 de la guía y es corto precisamente por eso.
4. **Active NTP en cada equipo.** No es higiene: la firma lleva ventana de
   frescura y un reloj desviado la invalida justo al reconciliar (§5 de la guía).

---

## 10 · Rama y commits

**Rama:** `etapa-12-edge-gateway-offline`.

**Corrección de esta línea.** Decía «desde `develop` con la ETAPA 11 ya cerrada»
y **no era cierto**: la rama salió de la punta de
`etapa-11-app-flutter-residente-b`, cuyo PR #20 seguía **abierto**, así que
`develop` no contenía 11-B ni 11-C y esta rama arrastraba siete commits de la
11. Que `develop` fuera un ancestro estricto —un avance rápido— hacía la base
equivalente **en contenido** a `develop` una vez fusionado el PR, y eso no
autoriza a escribir en el informe que ya lo estaba. Un informe que afirma un
estado del repositorio que nadie puede comprobar es el mismo defecto que esta
etapa persigue, aplicado a la documentación.

**Resuelto:** PR #20 fusionado contra `develop` (`a7c046d`), y esta rama
fusionada con `origin/develop` **por fusión, nunca reescribiendo historia ya
empujada**.

**Cabecera de la rama:** ver §11 (veredicto), que dice de qué corrida sale cada
cifra y en qué plataformas.
