# ETAPA 07 — Zonas comunes: horario y aforo

Rama `etapa-07-zonas-comunes` · sacada de `develop` actualizado (`4cf1b5f`).

---

## 1 · Qué se construyó

La regla que CU-05 exige y que ninguna etapa anterior podía sostener: **tener permiso no
basta**. Una autorización vigente, de una vivienda activa, sin lista negra y dentro de su
patrón, puede aun así ser denegada porque la zona está cerrada o porque está llena.

El salón social abre los sábados de 22:00 a 01:00 y admite treinta personas. La trigésimo
primera se queda fuera aunque sea la hija del presidente del consejo, y a medianoche no se
vacía el salón. Eso es toda la etapa.

Se construyó el agregado `Zona` —horario, aforo, política de reinicio y apertura manual—,
sus cuatro casos de uso (`ConfigurarZona`, `AutorizarZonaAVisitante`, `ValidarAforo`,
`LiberarAforo`), dos adaptadores de repositorio —PostgreSQL y en memoria—, la superficie
HTTP bajo `/copropiedades/:id/zonas`, y el puerto `ResolutorDeZona` por el que la zona
entra al contexto del motor de reglas **ya resuelta**.

El esquema no se tocó: la migración `0007` de la ETAPA 01 ya traía `zona_aforo` con su
`CHECK`, `zona_horarios` con `continua_del_dia_anterior` y `zonas.politica_reinicio_aforo`.
Esta etapa es la que **usa** esa estructura y la que demuestra, por ejecución, que sostiene
lo que decía sostener.

---

## 2 · Cómo se organizó y por qué

### 2.1 El aforo lo garantiza la base, no el código

Es la decisión que ordena la etapa entera, y es la instrucción explícita del usuario.

La forma ingenua de respetar un aforo es leer el contador, compararlo con el máximo y
escribir el nuevo valor. Funciona en cualquier prueba de escritorio y falla el primer
sábado de fiesta, porque entre la lectura y la escritura caben otras cuarenta y nueve
peticiones. El adaptador no hace eso. Ocupa una plaza con **una sola sentencia**:

```sql
UPDATE public.zona_aforo
   SET conteo_actual = conteo_actual + 1, actualizado_en = now()
 WHERE copropiedad_id = $1 AND zona_id = $2 AND conteo_actual < aforo_maximo
RETURNING conteo_actual
```

La condición del aforo vive en el `WHERE`, así que PostgreSQL la evalúa **dentro** del
mismo bloqueo de fila que aplica el incremento. No hay ventana. Y no hace falta un código
de error: **cero filas devueltas ES el aforo superado**. El repositorio traduce esa
ausencia de filas al valor tipado `{ tipo: 'aforo_superado' }`, que la aplicación convierte
en el motivo `AFORO_SUPERADO` (§2.4: prohibido devolver `null` como señal de negocio).

Es el mismo patrón que ADR-04 fijó para la placa única —la integridad concurrente se
resuelve en la base—, aplicado a un invariante que no es de unicidad sino de conteo.

La salida es simétrica, con el suelo también en el `WHERE`:

```sql
UPDATE … SET conteo_actual = conteo_actual - 1 WHERE … AND conteo_actual > 0
```

Veinte salidas sobre tres entradas dejan el contador en cero, no en −17.

### 2.2 Por qué el `CHECK` no bastaba, y por qué el incremento tampoco

La migración `0007` ya traía `CONSTRAINT zona_aforo_no_supera_maximo CHECK (conteo_actual
<= aforo_maximo)`. Era tentador considerar el incremento atómico redundante. **La mutación
demostró que no lo es**, y esa es la lección más útil de la etapa: ver §6.

- El `CHECK` impide que la **fila** quede en un estado inválido.
- El incremento atómico impide la **carrera** que produce dos personas en una plaza.

Son garantías distintas y ninguna implica la otra.

### 2.3 S-09: la medianoche no cierra la jornada

Un horario que cruza el día no se modela con `hora_fin < hora_inicio` —eso metería un caso
especial en cada comparación del motor—, sino con **dos franjas**, la segunda marcada
`continua_del_dia_anterior`. Lo fijó S-09 en la ETAPA 01 y lo precisó el usuario al
aprobarla: **el corte de medianoche es artificio de representación, no cierre de jornada.**

`HorarioDeZona.cierraJornada` es la función que lo sostiene: una franja que termina a las
24:00 cierra jornada **solo si no hay una franja continuación al día siguiente**. Y
`debeReiniciarAforo` consulta esa función antes de proyectar cualquier reinicio. Una fiesta
del sábado 22:00 al domingo 01:00 no vacía el contador a las 00:00.

El agregado rechaza además, en el constructor de `FranjaHoraria`, dos formas de
representación mal formada: `minutoFin <= minutoInicio` (la fila que cruza el día por su
cuenta) y una continuación que no empiece a las 00:00. Es la misma disciplina que `Placa`:
**el objeto de valor se normaliza y se valida al construirse, o no se construye.**

### 2.4 La política de reinicio resuelve P-04 y CU-05 excepción 6a

Si un sensor de salida falla, el contador queda inflado y la zona se vuelve inutilizable
para siempre. El documento lo anticipa (CU-05, 6a) y P-04 pedía decidir la política. Se
resuelve con **tres políticas por zona**, en la columna que la migración `0007` ya tenía:

| Política         | Comportamiento                                      | Cuándo                                        |
| ---------------- | --------------------------------------------------- | --------------------------------------------- |
| `cierre_horario` | El contador vuelve a cero en cada cierre de jornada | **Por defecto**. Zonas con horario definido   |
| `manual`         | Solo el operador lo reinicia                        | Zonas con torniquete fiable en ambos sentidos |
| `nunca`          | El contador es acumulativo                          | Aforos que no se liberan por salida           |

El reinicio se **proyecta al leer** (`Zona.conAforoAlDia`) y se **persiste al ocupar**: así
una consulta nunca muestra un contador que el reloj ya invalidó, y la escritura solo ocurre
cuando hay motivo para escribir. La deuda que esto deja —una zona que nadie toca en un mes
conserva la fila antigua— está declarada como D-36 y se salda con pg-boss en la ETAPA 14.

### 2.5 La zona llega al motor resuelta, no consultada

El motor de reglas de la ETAPA 05 es una función pura sin I/O, y esta etapa **no lo toca**.
Lo que se añadió es un puerto en el módulo de autorizaciones —`ResolutorDeZona`— que el
cargador de contexto invoca antes de decidir; el módulo de zonas lo satisface en su propia
raíz de composición.

El motor recibe la zona ya reducida a tres booleanos: si abre, si está llena y si exige
permiso explícito. No sabe que existe una tabla `zona_aforo`, y el módulo de zonas no sabe
que existe un motor de reglas. Se comunican por una interfaz, que es lo que §2.2 exige.

La precedencia vinculante `listaNegra > vigencia > patrón > zona` se respeta sin cambiar
una línea del motor, porque la zona ya estaba en último lugar desde la ETAPA 05: lo que
faltaba era quién la resolviera.

### 2.6 Tres motivos que el documento separa a propósito

Es el punto donde era fácil colapsar criterios distintos, y el contrato lo prohíbe
explícitamente (E-01):

| Situación                                      | Motivo               | Fuente           |
| ---------------------------------------------- | -------------------- | ---------------- |
| La zona está cerrada a esta hora               | `FUERA_DE_HORARIO`   | RN-14, CA-15     |
| La zona está llena                             | `AFORO_SUPERADO`     | CA-14            |
| La autorización no tiene permiso sobre la zona | `ZONA_NO_AUTORIZADA` | CU-05 alterno 2a |

El orden importa: **primero el horario, después el aforo**. Una zona cerrada se deniega por
horario aunque además esté llena — decir «lleno» de un salón cerrado es una respuesta
falsa, y el operador actuaría sobre el dato equivocado.

`ValidarAforo` comprueba también el horario **antes** de tocar el contador, y no solo por
claridad del motivo: ocupar primero y descubrir después que la zona estaba cerrada dejaría
una plaza consumida por alguien que no entró.

### 2.7 El cierre manual se reporta como fuera de horario

El mockup de zonas tiene un interruptor de apertura (PB-04: el administrador cierra la zona
sin llamar a nadie). Cuando lo usa, la denegación sale como `FUERA_DE_HORARIO` y no como un
motivo nuevo: desde la perspectiva del visitante y del evento, la zona no está disponible
en este momento, que es exactamente lo que ese motivo significa. Añadir un motivo por cada
causa de indisponibilidad multiplicaría la enumeración sin añadir información accionable.

### 2.8 Las denegaciones son 200/201 con motivo, no errores HTTP

Un intento de entrar a una zona llena es una petición **legítima y bien formada** cuya
respuesta es una decisión de negocio. Devolver 403 lo convertiría en un error de protocolo
y —peor— lo sacaría del camino que la ETAPA 06 construyó: toda decisión, permitida o
negada, genera evento (RN-02). Los códigos de error se reservan para lo que sí es un error:
404 para una zona que no existe o de otra copropiedad, 400 para un horario mal formado, 409
para bajar el aforo por debajo del conteo vigente.

---

## 3 · Árbol de archivos

```
packages/domain-core/src/zonas/
├─ aforo.ts                        VO Aforo: ocupar/liberar/reiniciar, inmutable, sin setters
├─ aforo.test.ts                   límite exacto, límite+1, suelo en cero
├─ horario-zona.ts                 FranjaHoraria + HorarioDeZona; cierraJornada sostiene S-09
├─ horario-zona.test.ts            minuto de apertura, minuto de cierre, cruce de medianoche
├─ politica-reinicio.ts            ultimoCierreDeJornada + debeReiniciarAforo, funciones puras
├─ politica-reinicio.test.ts       las tres políticas y el caso de la medianoche que no reinicia
├─ zona.ts                         agregado Zona: disponibilidadEn, conAforoAlDia, reconfigurar
└─ zona.test.ts                    invariantes del agregado y proyección del reinicio

packages/domain-core/src/index.ts  (modificado) exporta los cuatro símbolos de zonas

apps/api/src/zonas/
├─ aplicacion/puertos.ts           RepositorioZonas y ResultadoOcupacion (tipado, sin null)
├─ aplicacion/casos-de-uso.ts      ValidarAforo, LiberarAforo, ConfigurarZona, AutorizarZonaAVisitante
├─ aplicacion/casos-de-uso.test.ts 28 pruebas: orden horario→aforo, reinicio persistido, 409
├─ infraestructura/repositorio-zonas-pg.ts      el incremento atómico; el desfase horario lo resuelve PostgreSQL
├─ infraestructura/repositorio-zonas-memoria.ts doble provisional, declarado incapaz de probar concurrencia
├─ presentacion/dtos.ts            DTOs validados; importados SIN `import type` (lección D-24)
├─ presentacion/zonas.controller.ts  GET '' · POST :zonaId/{configuracion,ingresos,salidas,autorizaciones}
└─ zonas.module.ts                 raíz de composición; único sitio que satisface RESOLUTOR_DE_ZONA

apps/api/src/autorizaciones/aplicacion/puertos.ts   (modificado) declara ResolutorDeZona
apps/api/src/autorizaciones/index.ts                (modificado) lo exporta por el barril
apps/api/src/autorizaciones/infraestructura/cargador-conservador.ts (modificado) resuelve la zona
apps/api/src/eventos/eventos.module.ts              (modificado) inyecta RESOLUTOR_DE_ZONA al motor
apps/api/src/app.module.ts                          (modificado) registra ZonasModule
apps/api/package.json                               (modificado) lint alcanza también test/

apps/api/test/aforo-concurrencia.test.ts   50 ingresos por 50 conexiones reales contra PostgreSQL
apps/api/test/zonas.e2e.test.ts            CU-05 por HTTP, incluidas las dos pruebas de aislamiento
scripts/lib/estabilidad.mjs                CONTROL NUEVO: la suite tres veces, resultado idéntico
scripts/lib/pruebas-negativas.mjs          (modificado) séptima prueba negativa: la suite intermitente
scripts/verificar-etapa.sh                 (modificado) paso 13 (concurrencia de aforo) y paso 14 (estabilidad)
apps/api/test/utilidades.ts                (modificado) `crearApp` escucha: fin del bind/close por petición
apps/api/test/latencia-tiempo-real.test.ts (modificado) espera por condición, no por 200 ms fijos
apps/api/test/eventos.e2e.test.ts          (modificado) SSE por fetch+AbortController: sin error suelto
apps/api/test/concurrencia-padron.test.ts  (modificado) placa única por corrida, no por reloj
apps/api/test/eventos-pg.test.ts           (modificado) claves únicas por corrida
docs/ESTADO_ETAPAS.md                      (modificado) cabecera, mapa, ficha 07, P-04, deuda
docs/auditoria/contradicciones-y-supuestos.md (modificado) S-09 implementado, P-04 resuelta
docs/etapas/ETAPA-07.md                    este informe
```

---

## 4 · Tabla SOLID

| Principio | Cómo se materializa en esta etapa                                                                                                                                                                            | Comprobación                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| **SRP**   | `Aforo` cuenta, `HorarioDeZona` responde si abre, `politica-reinicio` decide si toca vaciar, `Zona` los compone. Cuatro casos de uso, cuatro operaciones de negocio                                          | Ningún archivo supera 300 líneas; ninguna clase, 5 métodos públicos. El mayor es `zona.ts`        |
| **OCP**   | Una política de reinicio nueva es una entrada en `POLITICAS_REINICIO` y una rama en `debeReiniciarAforo`; no toca el agregado, ni los casos de uso, ni el motor                                              | Añadir la zona al motor no produjo diff en `MotorDeReglas`                                        |
| **LSP**   | `RepositorioZonasPg` y `RepositorioZonasEnMemoria` cumplen el mismo puerto; `casos-de-uso.test.ts` corre contra el doble y `aforo-concurrencia.test.ts` contra el real, sin cambiar una aserción de contrato | Las 28 pruebas de aplicación no saben cuál hay detrás                                             |
| **ISP**   | `RepositorioZonas` expone seis operaciones concretas —`ocupar` y `liberar` separadas de `guardar`— en vez de un `ZonaService` que lo hiciera todo                                                            | Ningún adaptador lanza `NotImplemented`                                                           |
| **DIP**   | El dominio no conoce PostgreSQL; el módulo de autorizaciones declara `ResolutorDeZona` y el de zonas lo implementa. La dirección de la dependencia va hacia el dominio                                       | `grep -r "supabase\|axios\|isapi" packages/domain-core/src/` sigue en 0 · paso 10 del verificador |

---

## 5 · Trazabilidad

### Cubierto

| Elemento   | Dónde                                                                                                            |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| **CU-05**  | Flujo principal y alternos 2a (sin permiso), 4a (fuera de horario), 5a (aforo lleno) y 6a (salida no registrada) |
| **RN-14**  | Horario y aforo de zona, sostenidos por `CHECK` + incremento atómico                                             |
| **HU-18**  | Configurar zona: nombre, horario, aforo, política de reinicio y apertura manual                                  |
| **HU-19**  | Consultar zonas con aforo y disponibilidad en tiempo de consulta                                                 |
| **HU-20**  | Autorizar una zona a un visitante (`autorizaciones_zona`)                                                        |
| **CA-14**  | Aforo exacto admite; aforo+1 deniega con `AFORO_SUPERADO`. Probado en dominio, aplicación, HTTP y concurrencia   |
| **CA-15**  | Fuera de horario deniega con `FUERA_DE_HORARIO`, distinto de `ZONA_NO_AUTORIZADA` y de `AFORO_SUPERADO`          |
| **CP-05**  | Batería de límite: minuto de apertura, minuto de cierre, aforo exacto, aforo+1                                   |
| **KPI-15** | 0 accesos concedidos con la zona llena: 50 simultáneos, 10 admitidos, contador en 10                             |
| **P-04**   | Resuelta: tres políticas de reinicio por zona                                                                    |
| **S-09**   | Implementado y probado: la medianoche no reinicia el contador                                                    |

### Parcialmente cubierto, con motivo

| Elemento                      | Estado                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CU-05 en runtime              | Los casos de uso corren contra el doble en memoria; la garantía del aforo se prueba contra PostgreSQL real. Sin contraseña de base (D-17), lo cableado es el doble. **La frontera es definitiva** |
| «Reservas del día» del mockup | No se construye: P-10 sigue abierta y el contrato deja las reservas con pago fuera de alcance. Esta etapa entrega aforo y horario, que es lo que CU-05 exige                                      |
| Interfaz de zonas             | Las pantallas llegan en la ETAPA 09; aquí solo la API                                                                                                                                             |
| Liberación por identidad      | `LiberarAforo` baja el contador sin registrar quién salió (D-37). La portería lo cerrará en la ETAPA 10                                                                                           |

---

## 6 · Pruebas

### La prueba que da sentido a la etapa

`apps/api/test/aforo-concurrencia.test.ts` abre **cincuenta conexiones distintas** —no
cincuenta promesas sobre una, que PostgreSQL serializaría y no probaría nada, la lección
que ya dejó KPI-03— y lanza cincuenta ingresos simultáneos sobre una zona de diez plazas.
Entran diez. Los conteos devueltos son 1..10 sin repetirse. El contador queda en diez.

Además comprueba que ni siquiera escribiendo por SQL directo, saltándose el adaptador, se
puede dejar la fila en un estado inválido: el `CHECK` rechaza `aforo_maximo + 1` y el
contador negativo.

### Verificación por mutación — el resultado más útil

Sustituido el incremento atómico por una lectura seguida de una escritura:

```
× 50 ingresos simultáneos sobre 10 plazas: entran 10, ni una más
  → expected 50 to be 10
× los conteos devueltos a los admitidos son 1..N sin repetirse
  → expected [ 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, …(40) ] to deeply equal [ 1, 2, 3, … 10 ]
```

**Los cincuenta entraron, y los cincuenta recibieron `conteo = 1`.** Y el `CHECK` no lo
detectó: cada escritura fijaba un valor absoluto —uno— que nunca supera el máximo. Una
restricción declarativa no ve la carrera; solo ve el estado final de cada escritura, y cada
escritura era, por separado, perfectamente válida.

Es la respuesta a la pregunta de si el incremento atómico era redundante con el `CHECK`. No
lo era. El adaptador se restauró tras el experimento.

### La prueba intermitente, y por qué no se cerró la etapa sin resolverla

La primera ejecución del usuario en macOS falló en `zonas · CU-05 por HTTP > lista las zonas
con su aforo y su disponibilidad (HU-19)` con **`socket hang up`**; la segunda pasó sin
tocar nada. El usuario lo detuvo con el argumento correcto: **una prueba intermitente es
peor que una rota**, porque enseña a reejecutar hasta el verde y ese hábito termina tapando
defectos reales.

#### Causa, medida y no supuesta

El fixture `crearApp` hacía `await app.init()` y **nunca `listen()`**. `supertest` es un
cliente, pero cuando el servidor que recibe no está escuchando se comporta como uno: en su
constructor ejecuta `if (!app.address()) this._server = app.listen(0)` y, al terminar la
petición, `if (server && server._handle) server.close(...)` (`supertest/lib/test.js`).

Instrumentando `listen` y `close` sobre un servidor idéntico al del fixture:

| Fixture                              | `listen()` | `close()` | Puerto al terminar |
| ------------------------------------ | ---------- | --------- | ------------------ |
| `app.init()` a secas — lo que había  | **300**    | **300**   | ninguno            |
| `app.init()` + `await app.listen(0)` | **1**      | **0**     | el asignado        |

300 peticiones producían **300 sockets de escucha montados y derribados**, cada uno en un
puerto efímero distinto, y el servidor terminaba sin escuchar. Multiplicado por los diez
ficheros de la suite, con `aislamiento.e2e.test.ts` recorriendo todos los endpoints con dos
identidades, son miles de bind/close en paralelo.

Ahí está la carrera: `supertest` fija la URL **en el constructor** y abre la conexión
**después**, así que basta con que otra petición cierre el servidor en ese hueco para que el
cliente encuentre el socket muerto. Eso es `socket hang up`, aparece solo a veces, y
reejecutar «lo arregla».

Se descartaron por ejecución dos hipótesis previas, que conviene dejar escritas para no
volver a recorrerlas: el cliente **no** reutiliza conexiones —superagent manda
`Connection: close`, comprobado: tres peticiones, tres conexiones nuevas—, así que la
carrera clásica de `keepAlive` del cliente contra el `keepAliveTimeout` de 5 s del servidor
no aplica aquí. Y no hay temporizadores ni ganchos de ciclo de vida en `src/` que pudieran
disparar un error asíncrono suelto.

**Honestamente:** no se consiguió reproducir el fallo exacto en este contenedor —ocho
corridas completas de la suite, 120 ciclos de «app nueva + primer golpe» y sondas de
solapamiento, todas verdes—. Lo que sí está medido es el mecanismo, y es
suficientemente grave por sí mismo: un fixture que monta y derriba el servidor una vez por
petición no es determinista, lo produzca o no en esta máquina.

#### Lo que el arreglo destapó

Con el servidor vivo durante todo el fichero, afloró un **error sin manejar** que antes
quedaba tapado: la prueba SSE de `eventos.e2e.test.ts` abortaba la petición de `supertest`
y el `ECONNRESET` que Node emite después no tenía a nadie escuchando. Vitest lo reportaba
como `Unhandled Error` con su propia advertencia —«This might cause false positive tests»—
y **el cierre del servidor por parte de `supertest` lo estaba ocultando**. Reescrita con
`fetch` y `AbortController`, como ya hacía la prueba de latencia.

#### Revisión del resto de la suite, con el mismo criterio

- **Todos** los ficheros e2e usaban `crearApp`, así que todos tenían el defecto: se corrige
  en un solo sitio. `latencia-tiempo-real.test.ts` era el único que ya hacía `listen(0)`
  explícito —porque medía el socket—, lo que corrobora el diagnóstico; se le retiró el
  `listen` duplicado.
- **Espera por tiempo en vez de por condición.** La medición de KPI-25 dormía 200 ms fijos
  «para que los `flushHeaders` de los 25 suscriptores llegaran». Bajo carga ese plazo se
  queda corto y un suscriptor que se pierde la ráfaga hace fallar KPI-25 sin que la latencia
  tenga culpa. Ahora `abrirSuscriptor` **solo vuelve cuando el flujo confirma apertura**
  (`event: listo`), con tope de 10 s. El `sleep` desapareció.
- **Datos que colisionan entre corridas.** `concurrencia-padron.test.ts` generaba la placa
  con los cuatro últimos dígitos del reloj en milisegundos: se repiten **cada diez
  segundos**, y como en `vehiculos` no hay borrado físico (RN-19) la fila de la corrida
  anterior sigue ahí. Dos corridas seguidas contra la misma base habrían dado 0 aceptados en
  vez de 1. Mismo problema en las claves de `eventos-pg.test.ts`. Ambos con entropía real
  ahora. **Este defecto solo se ve si se ejecuta la suite dos veces**, que es exactamente lo
  que el control nuevo hace.

#### El control genérico: paso 14

`scripts/lib/estabilidad.mjs` ejecuta la suite **tres veces** y exige que el resultado sea
idéntico. La firma que compara no es «pasó / no pasó»: lleva el recuento por paquete, el de
ficheros, los títulos de lo que falló y **los errores no manejados**, que cuentan como fallo
aunque las pruebas salgan verdes.

> **La trampa de este control, comprobada antes de confiar en él.** Sin `TURBO_FORCE`, la
> segunda corrida informa `cache hit, replaying logs` y **reimprime los números de la
> primera sin ejecutar una sola prueba**: tres corridas idénticas, ninguna ejecutada. Habría
> sido el falso verde más redondo del repositorio. El guion fuerza la ejecución.
>
> Y una segunda, encontrada al estrenarlo: los códigos de color de Vitest partían `Tests` de
> su número, no casaba ninguna línea, y comparar dos firmas vacías daba «idéntico». Ahora,
> si no reconoce ningún recuento, **falla**.

Es el **séptimo control con prueba negativa**: `pruebas-negativas.mjs` le da una suite que
alterna verde y rojo entre corridas y exige que la detecte, y otra estable que debe pasar
—un control que rechazara todo tampoco serviría—.

### Pruebas de límite exigidas por el DoD

| Límite             | Prueba                                                                               |
| ------------------ | ------------------------------------------------------------------------------------ |
| Aforo exacto       | La plaza número N entra; el contador queda en N                                      |
| Aforo + 1          | Deniega con `AFORO_SUPERADO`; el contador **no** avanza                              |
| Minuto de apertura | 08:00 con franja 08:00–09:00 → dentro. 07:59 → fuera                                 |
| Minuto de cierre   | 08:59 → dentro; 09:00 → fuera. La franja es cerrada-abierta, como `Vigencia`         |
| Medianoche (S-09)  | 00:00 del domingo con franja continuación → dentro, y el contador **no** se reinicia |
| Suelo del contador | Salir con el contador en cero lo deja en cero, no en −1                              |

### Cómo ejecutarlas

```bash
pnpm --filter @ncr/domain-core test           # dominio de zonas
pnpm --filter @ncr/api test                   # aplicación y HTTP
DATABASE_URL_PRUEBAS=… pnpm --filter @ncr/api exec vitest run test/aforo-concurrencia.test.ts
./scripts/verificar-etapa.sh --con-base       # todo, incluida la prueba de concurrencia
```

La prueba de concurrencia se **omite** sin `DATABASE_URL_PRUEBAS`, y el paso 13 del
verificador comprueba la marca `OMITIDA`: una omisión no cuenta como verde.

### Veredicto literal de §2.8.0

Ejecución de `./scripts/verificar-etapa.sh --con-base` en el contenedor Linux, contra
PostgreSQL 16 con las migraciones y las semillas aplicadas:

```
▸ 0 · borrando artefactos de compilación (así corre un checkout nuevo)
   ✓ dist, .turbo y coverage eliminados

▸ 1 · entorno dentro de lo declarado
   ✓ entorno: Node 22.22.2 y pnpm dentro de engines · .nvmrc 22.22.2

▸ 2 · instalación coherente con el lockfile
   ✓ pnpm install --frozen-lockfile

▸ 3 · compilación desde cero
   ✓ pnpm build

▸ 4 · lint y typecheck
   ✓ pnpm lint
   ✓ pnpm typecheck

▸ 5 · suite completa
   @ncr/providers:test:       Tests  24 passed (24)
   @ncr/domain-core:test:       Tests  258 passed (258)
   @ncr/api:test:       Tests  256 passed (256)
   ✓ suite completa en verde

▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 47 de 47 ficheros de prueba ejecutados

▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 99.67 % · ramas 99.21 % · funciones 98.32 % (umbral 90 %, 23 archivos)
     OK   aplicacion (**/aplicacion/**): lineas 97.82 % · ramas 92.99 % · funciones 97.85 % (umbral 90 %, 15 archivos)
     OK   global: lineas 88.30 % · ramas 92.08 % · funciones 90.70 % (umbral 70 %, 94 archivos)
   ✓ las tres capas cumplen su umbral

▸ 8 · portabilidad de las superficies con shell (macOS/BSD y CI/GNU)
   ✓ portabilidad: 15 superficies con shell sin construcciones divergentes BSD/GNU (.sh, scripts de package.json, .husky/, run: de workflows, Makefile)

▸ 9 · pruebas negativas de los propios controles
   ✓ PRUEBAS NEGATIVAS: los 7 controles detectan su violación, sin tocar el árbol

▸ 10 · fronteras de arquitectura y secretos
   ✓ fronteras (DoD ETAPA 02)
   ✓ sin secretos
   ✓ KPI-11: sin ISAPI ni IPs de dispositivo fuera de packages/providers/
   ✓ sin claves ajenas vigentes hacia tablas append-only (2 declaradas, 2 retiradas, 4 tablas vigiladas)

▸ 11 · latencia del canal de tiempo real bajo carga (KPI-25)
   alertas entregadas: 200 de 200
   p50 / p95 / p99   : 2 / 5 / 6 ms
   maximo            : 12 ms
   umbral KPI-25     : 10000 ms
   ✓ KPI-25 con margen sobre el umbral

▸ 12 · esquema y aislamiento en --modo-supabase
   ✓ migraciones, semillas y suite SQL

▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)
   ✓ 50 ingresos simultáneos sobre 10 plazas, ni una de más (RN-14, CA-14)

▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
      corrida 1/3: codigo 0 · @ncr/api:test: Tests 256 passed (256) · @ncr/domain-core:test: Tests 258 passed (258) · @ncr/providers:test: Tests 24 passed (24)
      corrida 2/3: codigo 0 · @ncr/api:test: Tests 256 passed (256) · @ncr/domain-core:test: Tests 258 passed (258) · @ncr/providers:test: Tests 24 passed (24)
      corrida 3/3: codigo 0 · @ncr/api:test: Tests 256 passed (256) · @ncr/domain-core:test: Tests 258 passed (258) · @ncr/providers:test: Tests 24 passed (24)
   ✓ OK estabilidad: 3 corridas forzadas (sin caché de turbo) con resultado idéntico y ningún error sin manejar

VERIFICACIÓN DE ETAPA: correcta — se puede escribir el informe
```

**538 pruebas en 47 ficheros**, con el paso 14 exigiendo que las tres corridas den lo mismo. Cobertura por capa, medida en el contenedor Linux: dominio
99,67 % de líneas y 99,21 % de ramas, aplicación 97,82 %, global 88,30 %. Los umbrales de
§2.4 son 90 % en dominio y aplicación y 70 % global.

> La cifra global depende de qué ficheros recorre la corrida y de la máquina que la
> ejecuta; se anota el entorno junto a la cifra, como se acordó al cerrar la ETAPA 05.

---

## 7 · Verificación de seguridad (contra §2.7)

| Medida                           | Estado en esta etapa                                                                                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 · Secretos                     | ✅ Ninguno. El escaneo de pre-commit y el paso 10 del verificador pasan sobre 285 archivos                                                                                                                                                                               |
| 2 · CORS                         | ✅ Sin cambios: las rutas nuevas quedan bajo la lista blanca global de la ETAPA 02                                                                                                                                                                                       |
| 3 · Validación en backend        | ✅ DTOs validados con `ValidationPipe` estricto, e importados **sin `import type`** (D-24: borraría la clase y dejaría el pipe inerte). El horario mal formado se rechaza en el DTO y **otra vez** en el objeto de valor: el DTO valida forma, el agregado valida verdad |
| 4 · Anti inyección SQL           | ✅ Todas las sentencias parametrizadas. El desfase horario se calcula **dentro** de PostgreSQL con `AT TIME ZONE` sobre la columna de la copropiedad, sin interpolar nada                                                                                                |
| 5 · Rate limiting                | ✅ Heredado del global. Las rutas de zona no son de ingesta ni de autenticación; no requieren límite endurecido propio                                                                                                                                                   |
| 6 · Aislamiento por doble camino | ✅ El guard de copropiedad cubre las cinco rutas nuevas; `copropiedad_id` va además en el `WHERE` de **todas** las sentencias del adaptador, incluidas `ocupar` y `liberar`. Dos pruebas HTTP: un administrador de otra copropiedad recibe 404, sin token 401            |
| 7 · CSP                          | ✅ Sin cambios (Helmet global)                                                                                                                                                                                                                                           |
| 8 · Transversales                | ✅ RBAC declarativo, sin `if (rol === …)`. Sin datos sensibles en logs: el registro de acceso cruzado anota usuario, rol y recurso, nunca el token                                                                                                                       |

> **Detalle que importa para el riesgo número uno.** `ocupar` y `liberar` no reciben la zona
> «ya validada» por una consulta anterior: llevan `copropiedad_id` en su propio `WHERE`. Si
> alguien lograra pasar un `zonaId` de otra copropiedad, la sentencia afectaría a cero filas
> —y cero filas se interpreta como aforo superado, que es la respuesta conservadora— en vez
> de incrementar el contador ajeno.

---

## 8 · Deuda técnica, supuestos y pendientes

### Hallazgo · `apps/api` lintaba solo `src`

`"lint": "eslint src --max-warnings=0"` dejaba **`apps/api/test/` —diez ficheros, entre
ellos las cuatro suites de aislamiento— fuera de ESLint en CI**. Solo lo veía el gancho de
pre-commit, que es local y se salta con `--no-verify`.

Se destapó al intentar el commit de esta etapa: el gancho rechazó dos errores que
`pnpm lint` había dado por buenos minutos antes, en una ejecución completa del verificador.
Corregido a `eslint src test`. Es la misma familia que los anteriores: **un control que
existe y no alcanza lo que todos creían que alcanzaba.**

### Corrección de frontera

`zonas.module.ts` importaba `RESOLUTOR_DE_ZONA` de `'../autorizaciones/aplicacion/puertos'`
—el interior de otro módulo—, lo que §2.2 prohíbe. Corregido a `'../autorizaciones'`, su
barril. Al buscar más casos aparecieron tres preexistentes en `multiempresa` y `salud`
hacia el interior de `autenticacion`: se registran como **D-34**, porque lo que falta no es
la corrección de tres líneas sino el control que impide que vuelvan a aparecer.

### Deuda nueva

| ID   | Deuda                                                                                                                                                 | Se salda en                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| D-34 | El control de fronteras no exige que un módulo importe a otro por su barril                                                                           | ETAPA 13                                                                            |
| D-35 | `RepositorioZonasPg` existe y se prueba contra base real, pero lo cableado en runtime es el doble en memoria                                          | Misma raíz que D-25 y D-17: sin contraseña de PostgreSQL. La frontera es definitiva |
| D-36 | El reinicio por `cierre_horario` se proyecta al leer y se persiste al ocupar: una zona intocada durante un mes conserva la fila antigua               | ETAPA 14, con pg-boss                                                               |
| D-37 | `LiberarAforo` no identifica a quién sale                                                                                                             | ETAPA 10                                                                            |
| D-38 | El paso 14 ejecuta la suite tres veces: el cierre de etapa pasa de ~40 s de pruebas a ~2 min. Es el precio de no volver a cerrar con una intermitente | ETAPA 14: en CI puede repartirse entre trabajos en paralelo                         |

### Supuesto nuevo

**`[SUPUESTO]` S-17 — toda zona común exige permiso explícito de la autorización.** Es lo
que separa CA-15 de `ZONA_NO_AUTORIZADA` (CU-05 alterno 2a); las zonas de paso se modelan
sin `zonaId` en la solicitud. Comportamiento conservador: sin permiso, se deniega.

### Pendientes que siguen abiertos

**P-10 · ¿reservas de zonas sin cobro?** Sigue abierta y **no se construyen**. El mockup
muestra una tarjeta «Reservas del día», pero el contrato deja fuera de alcance las reservas
con pago y ningún CA ni HU exige reserva sin pago. Esta etapa entrega aforo y horario, que
es lo que CU-05 pide. Si el usuario resuelve P-10 a favor, la reserva es un agregado nuevo
detrás de los puertos existentes; nada de lo construido aquí cambia.

---

## 9 · Qué debe hacer el usuario manualmente

1. **Nada obligatorio para cerrar la etapa.** No hay panel que tocar ni credencial que
   cargar: el esquema que esta etapa usa se aplicó en la ETAPA 01.
2. **Ejecutar `./scripts/verificar-etapa.sh --con-base` en macOS**, con
   `DATABASE_URL_PRUEBAS` apuntando a una base con migraciones y semillas, y confirmar que
   el paso 13 muestra las **tres** líneas en verde. Si la prueba de aforo aparece como
   `OMITIDA`, el paso falla a propósito: la garantía no se puede dar por buena sin base.
3. **Al configurar cada zona en producción, decidir su política de reinicio.** El valor por
   defecto (`cierre_horario`) es el conservador y cubre el fallo de sensor de CU-05 6a, pero
   una zona con torniquete fiable en ambos sentidos debería ir a `manual` para no perder el
   conteo real en cada cierre.
4. **Resolver P-10** (¿reservas de zonas sin cobro?) antes de la ETAPA 09, porque decide si
   la pantalla de zonas muestra la tarjeta «Reservas del día» del mockup o no.

---

## 10 · Rama y commits

**Rama:** `etapa-07-zonas-comunes`, sacada de `develop` actualizado en `4cf1b5f` (merge de
la PR #10, ETAPA 06), según la regla de ramificación fijada por el usuario.

| Commit     | Mensaje                                                                                 |
| ---------- | --------------------------------------------------------------------------------------- |
| `8b2b644`  | `feat(etapa-07/zonas): aforo garantizado por la base y horario que cruza la medianoche` |
| _(cierre)_ | `chore(etapa-07): cierre de etapa`                                                      |
