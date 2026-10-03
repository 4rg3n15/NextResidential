# Corrección de la 15-R · El Edge compone su proveedor de equipos como la API (DT-15R-09)

**Rama:** `etapa-15r-proveedor-del-edge` · **Base:** `etapa-15r-huecos-y-decisiones`
(`5566b8e`), **no** `develop` (§10) · **PR:** ninguno, no se pidió · **Fecha:** 2026-10-03 ·
**Cierra:** DT-15R-09 · **Corrige, fuera del encargo:** H-15R-C01 · **Abre:** DT-15R-C01 a DT-15R-C03

> **Esta corrección NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Nada de lo nuevo se ha ejercido contra un equipo real: la terminal es la
> simulada de `packages/providers` y el túnel, el de verdad en memoria.

**Lo incómodo primero.**

1. **La rama no sale de `develop`, como pide la regla del 2026-09-06.** DT-15R-09,
   el informe de la 15-R y la §8.3 de `ENTREGA_EN_SITIO.md` sólo existen en
   `etapa-15r-huecos-y-decisiones`, sin fusionar
   ([4rg3n15/NextResidential#42](https://github.com/4rg3n15/NextResidential/pull/42),
   abierto), que otra sesión cerró mientras se hacía esto (`0ce8ed5`, fusionado
   aquí en `da64043`). Desde `develop` no habría dónde marcar el cierre y
   `composicion.ts` chocaría con la cuarentena de la 15-R. Tampoco se empujó a la
   rama de la 15-R: dos sesiones escribiendo en la misma rama a la vez se pisan.
   **Esta rama se fusiona en la de la 15-R antes de fusionar su PR** —contiene su
   cabeza, así que es un avance rápido— o detrás de ella en `develop`.
2. **El enunciado se quedaba corto.** La API pasa al proveedor **siete**
   ajustes de su `.env`, no cuatro: el Edge omitía también `puertoRtsp` —con
   puente, el video iba al 554 aunque la API dijera otro puerto, y «Probar
   conexión» decía que el video estaba bien porque su puerto viaja con el
   diagnóstico— y la `traza`. Se pasan cinco; la `traza` y la vuelta atrás del
   audio quedan como deuda con su motivo (§8).
3. **Ahora hay DOS umbrales de reloj donde el cliente ve uno.** Con puente, la
   ficha de la consola juzga la hora con el de la API (viaja con el
   diagnóstico) y el alta con el del Edge. Una prueba exige que el nombre, el
   valor por omisión (30 s) y los límites sean los mismos; que los dos `.env`
   digan lo mismo depende de quien despliega, y por eso está en la lista de
   comprobación (`DESPLIEGUE_EDGE.md` §10.9).
4. **Un cambio de comportamiento sin tocar el `.env`:** la barrera del Edge
   esperaba 3 s (el plazo de fábrica de su adaptador) y ahora espera
   `EQUIPOS_TIEMPO_LIMITE_MS` = 5 s, como la API en modo directo desde la 15-L.
   Con puente eso agranda una ventana que ya existía: la nube da **4 s** a una
   apertura por el túnel, así que una barrera que contesta entre los 4 y los 5 s
   abre después de que la nube la diera por «no aceptada». Con 3 s también podía
   pasar —el equipo puede accionar una orden cuya respuesta se cortó—; lo que
   falta es reconciliar el desenlace tardío, no elegir un plazo (DT-15R-C03).
5. **Una corrida del verificador salió FALLIDA, y no por esta corrección.**
   La DoD del Edge en sitio (`edge-en-sitio-pg.e2e.test.ts`, 15-Q) cuenta como
   permitida la placa CONC001, que no está en la semilla: la deja la prueba SQL de
   KPI-03 (`30_concurrencia_placas.sh`), que el verificador corre en el paso 12,
   **después** de la suite del paso 5. Con la base que pide el propio
   verificador en su paso 1c (`supabase/verificar.sh --con-semillas`) daba 12
   aperturas de 15 —también sobre `5566b8e`, sin un cambio de esta rama—. Pasaba
   en CI porque el flujo corre antes `--con-pruebas` (que incluye KPI-03), y en la
   máquina del usuario porque su base viene de corridas anteriores: un verde que
   dependía de la historia de la base. El verde de la 15-R sobre `5566b8e`
   (`0ce8ed5`) no lo contradice: su base venía de dos corridas anteriores, que
   pasan por el paso 12 `[SUPUESTO]`. Se corrige (H-15R-C01): la prueba pone su
   precondición.
6. **`pnpm sitio:edge` juzgaba la hora de los equipos con 60 s fijos.** Con el
   arreglo, un equipo 45 s desviado habría salido «OK» en el diagnóstico y el
   alta lo habría rechazado. Ahora usa el mismo umbral; para no hacer crecer
   `diagnostico-de-sitio.ts`, el paso de cada equipo se mudó a su propio fichero.

---

## 1 · Qué se construyó

Desde la 15-Q2 (ADR-035), con puente, el Edge es el único que habla con los
equipos del conjunto: abre las puertas, da de alta los rostros que la consola
ordena por el túnel y sirve el video. La API, al componer su proveedor, le pasa
siete ajustes de su `.env`; el Edge componía el mismo proveedor con ninguno. El
más grave era el del reloj: sin `desvioDeRelojMaximoS`, `exigirRelojEnHora` sale
antes de mirar, y el Edge escribía la vigencia de un visitante en un equipo que
podía ir 13 h atrasado —el caso del 29/09—, con el resultado de una persona que
la terminal rechaza con «permiso vencido» o deja pasar fuera de su vigencia.

Ahora el Edge lee esos ajustes de **su** `.env`, con los mismos nombres, valores
por omisión y límites que la API, y su proveedor se compone con ellos en un solo
sitio. Con el reloj de la terminal 13 h atrasado, una orden de alta que sale de
la nube por el túnel vuelve como `RelojDelEquipoDesviado` —la misma clase, con el
desvío medido— y en la terminal no se escribe nada, ni la persona. `pnpm
sitio:edge` juzga la hora de cada equipo con ese mismo umbral. Y una prueba
compara las dos raíces de composición para que no vuelvan a separarse: si la
API empieza a pasar una opción nueva al proveedor y el Edge no la lee, rompe.

## 2 · Cómo se organizó y por qué

**Qué se pasa y qué no, opción por opción.** Comparada la composición de la API
(`apps/api/src/proveedores/proveedores.module.ts`) con la del Edge:

| Opción                 | Variable de la API                                    | Sin ella, en el Edge                                                                                                          | Decisión                                |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `desvioDeRelojMaximoS` | `EQUIPOS_DESVIO_DE_RELOJ_S`                           | El alta con vigencia **no lee la hora** del equipo (DT-15R-09)                                                                | **Se pasa**                             |
| `persona`              | `EQUIPOS_ZONA_HORARIA`, `TERMINAL_PLAN_DE_HORARIO`    | Vigencia escrita en `America/Bogota` y plantilla «1» aunque la API diga otra: credencial que caduca a otra hora o puerta muda | **Se pasa**                             |
| `limitesDeFoto`        | `EQUIPOS_FOTO_KB_MAXIMOS`, `EQUIPOS_FOTO_LADO_MAXIMO` | 200 KB y 1024 px aunque el sitio los haya cambiado; con puente, sólo el Edge mira la foto                                     | **Se pasa**                             |
| `tiempoLimiteMs`       | `EQUIPOS_TIEMPO_LIMITE_MS`                            | 5 s fijos (3 s la barrera): subirlo para una red de sitio lenta no llegaba a quien habla con los equipos                      | **Se pasa**                             |
| `puertoRtsp`           | `VIDEO_PUERTO_RTSP`                                   | Video del puente al 554 aunque el sitio use otro, con «Probar conexión» en verde                                              | **Se pasa** (no estaba en el enunciado) |
| `traza`                | —(la bitácora del proceso)                            | El adaptador calla: renegociaciones Digest e intercambios de puerta no salen en el registro del Edge                          | **No**: DT-15R-C01                      |
| `audioDelEquipo`       | `GUARDIA_AUDIO_TRANSPORTE`                            | El puente fija `persistente` (15-Q2): la vuelta atrás a `http` de la API no llega al equipo                                   | **No se toca**: DT-15R-C02              |

**La `traza`, no.** El registro del Edge escribe JSON a la salida estándar sin
redacción y sin nivel `debug`; la bitácora de la API redacta por clave (placa,
plantilla, documento…) y filtra por `LOG_LEVEL`. Pasarla tal cual llenaría el
registro con un latido por equipo cada pocos segundos y podría dejar en él
cuerpos de eventos con datos personales. Hace falta un adaptador con redacción,
y eso es otra pieza.

**Un esquema propio, no siete líneas más en el de sitio.** Las variables viven en
`configuracion/esquema-de-ajustes.ts` y entran en el esquema de sitio por
`...esquemaDeAjustes.shape`: así las validan **los dos** cargadores —el de la 15-Q
y el del puente, que extiende el de sitio— sin tocar el del puente, y el de sitio
no crece. El nombre no es `esquemaDeEquipos` a propósito: el de sitio ya tiene
`esquemaDeEquipo` (las credenciales de cada equipo) y la diferencia de una letra
confundiría.

**La composición del proveedor, en un solo sitio.** `composicion-del-proveedor.ts`
es lo que `componerEdge` le pasa a la fábrica: la clase, el reloj, el registro,
la fuente y `...ajustesDelProveedor(config)`. `componerEdge` adelgaza (180 → 176) y
el puente la hereda sin cambiar: compone el mismo `componerEdge`.

**El control de entorno, por carpeta.** `entorno-declarado.mjs` listaba a mano los
tres esquemas del Edge; un cuarto quedaba fuera y la variable declarada en
`.env.example` habría salido como «nadie la lee». Ahora el Edge se lee por
carpeta, como la API desde la 15-R, y la expresión excluye las pruebas
(`esquema-de-sitio.test.ts` casaba con la anterior). Se le vio fallar: con el
esquema nuevo y sin declarar las variables, nombró las siete.

**`sitio:edge`, con el umbral de las altas.** El paso de cada equipo salió de
`diagnostico-de-sitio.ts` (277 → 237) a `diagnostico-de-equipo.ts` sin cambiar una
frase, y recibe ahora `EQUIPOS_DESVIO_DE_RELOJ_S` y `EQUIPOS_TIEMPO_LIMITE_MS`.
La línea de «nube» sigue con sus 60 s: es otro desvío (el del Edge frente a la
nube, que gobierna las firmas).

**La prueba del defecto, por el camino de un sitio con puente.** No basta probar
`TerminalFacial` (eso ya lo hacía la 15-N): el defecto estaba en la composición.
La prueba compone el Edge con `componerPuente` y `EDGE_TUNEL=activo`, abre el
túnel contra un socket que hace de API, y manda el alta desde un
`ProveedorRemoto`, como la manda la nube. Se vio fallar sin el arreglo: «promise
resolved instead of rejecting», es decir, el Edge escribió en la terminal 13 h
atrasada.

**Que no vuelvan a separarse.** `proveedor-como-la-api.test.ts` importa el
esquema de la API y compara, variable a variable, el valor por omisión y lo que
acepta y rechaza; y lee `proveedores.module.ts` para exigir que toda
`configuracion.X` que la API pasa a `crearProveedorDeEquipos` tenga su pareja en
el Edge, o esté exenta con motivo. Tiene su prueba negativa: una opción
inventada en la API se detecta.

**ADR-018, enmendado.** Decía que `ProveedoresModule` era el único que invocaba
la fábrica; desde la 15-Q el Edge también lo hace, y esa segunda raíz de
composición sin comparar es la causa de fondo de DT-15R-09. La Enmienda 1 lo
registra y nombra la prueba que ahora las mantiene iguales.

## 3 · Árbol de archivos

```
apps/edge/
├─ .env.example                                   + los siete ajustes, con lo que gobiernan
├─ src/configuracion/esquema-de-ajustes.ts        nuevo · las siete variables y su traducción al proveedor
├─ src/configuracion/esquema-de-ajustes.test.ts   nuevo · D-91 por los dos cargadores
├─ src/configuracion/esquema-de-sitio.ts          las incorpora (92 → 91)
├─ src/composicion-del-proveedor.ts               nuevo · la fábrica, con los ajustes de la API
├─ src/composicion.ts                             la usa (180 → 176)
├─ src/diagnostico-de-equipo.ts                   nuevo · el paso de cada equipo de sitio:edge, con el umbral
├─ src/diagnostico-de-sitio.ts                    lo usa (277 → 237)
├─ test/reloj-del-equipo-en-el-puente.test.ts     nuevo · DT-15R-09 por el puente, y sitio:edge
└─ test/proveedor-como-la-api.test.ts             nuevo · paridad con la API y guardián de opciones
apps/api/test/
├─ vehiculo-sin-dueno.ts                          nuevo · H-15R-C01: CONC001 la pone quien la necesita
├─ edge-en-sitio-pg.e2e.test.ts                   la usa, sin crecer (201)
└─ edge-misma-decision-pg.e2e.test.ts             la usa, sin crecer (205)
scripts/lib/entorno-declarado.mjs                 los esquemas del Edge por carpeta (200 → 197)
docs/
├─ guias/DESPLIEGUE_EDGE.md                       §2.3, §2.4, §5, §7, §10.1, §10.9
├─ guias/ENTREGA_EN_SITIO.md                      §8.3
├─ decisiones/ADR-018-…                           Enmienda 1: dos raíces de composición, los mismos ajustes
├─ etapas/ETAPA-15R.md                            DT-15R-09 cerrado (§8)
├─ etapas/ETAPA-15R-proveedor-del-edge.md         este informe
└─ ESTADO_ETAPAS.md                               cabecera, defectos abiertos y ficha de la corrección
README.md                                         fila de la 15-R
```

**Ningún fichero existente de código, pruebas o guiones crece** (S-193): los
cuatro que se tocan adelgazan. Crecen la documentación y `.env.example`.

## 4 · Tabla SOLID

| Pieza                          | SRP                               | OCP                                                      | LSP                                     | ISP                                                        | DIP                                                    |
| ------------------------------ | --------------------------------- | -------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| `esquema-de-ajustes.ts`        | Validar los ajustes y traducirlos | Un ajuste nuevo = una clave y una línea en la traducción | —                                       | `ajustesDelProveedor` recibe sólo `ConfiguracionDeAjustes` | Tipo de `providers` importado como tipo                |
| `composicion-del-proveedor.ts` | Componer el proveedor del Edge    | Otra marca = otra clase en la fábrica, no aquí           | Devuelve el puerto `ProveedorDeEquipos` | Dependencias mínimas: reloj, registro, fuente, transporte  | Recibe todo; no lee el entorno                         |
| `diagnostico-de-equipo.ts`     | Un equipo en `sitio:edge`         | —                                                        | —                                       | Sólo los dos ajustes que usa, por `ConfiguracionDeAjustes` | El diagnóstico de `providers`, el transporte inyectado |
| `esquema-de-sitio.ts` (cambio) | Sigue siendo el esquema de sitio  | Los ajustes entran por composición (`...shape`)          | —                                       | —                                                          | —                                                      |

## 5 · Trazabilidad

| Elemento   | Qué toca                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| **OE-04**  | La plantilla que sincroniza el Edge se escribe con la vigencia correcta, o no se escribe                             |
| **OE-06**  | El Edge puente (ADR-035) aplica a los equipos los mismos ajustes que la API en modo directo                          |
| **RN-01**  | Una vigencia escrita en un equipo con el reloj corrido abre o niega fuera de ella: ahora no se escribe               |
| **RN-11**  | La terminal caduca la credencial por su cuenta (15-L, A2); con el reloj desviado lo haría a otra hora                |
| **CU-02**  | Alta con consentimiento → sincronización: el paso de sincronización por el Edge, con la lectura previa del reloj     |
| **KPI-17** | Falso rechazo: el «permiso vencido» del 29/09 era uno; parcial, sólo se evita escribir mal, no se mide en sitio      |
| **CP-06**  | Parcial: el ciclo de consentimiento y supresión no cambia; cambia que el alta por el Edge respete la hora del equipo |

## 6 · Pruebas

### Qué se probó y cómo

- **DT-15R-09 por el puente** (`reloj-del-equipo-en-el-puente.test.ts`): el Edge
  compuesto con `componerPuente` y su `.env`, el túnel abierto contra un socket
  que hace de API, el alta enviada por un `ProveedorRemoto`. 13 h atrasado →
  `RelojDelEquipoDesviado` con `desvioSegundos = -46 800` y **ninguna escritura**
  en la terminal; 10 s → alta completa; 45 s → rechazo con el umbral por
  omisión y alta con `EQUIPOS_DESVIO_DE_RELOJ_S=60`. Y `sitio:edge`: el mismo
  equipo, AVISO con 30 s y OK con 60 s.
- **Paridad y guardián** (`proveedor-como-la-api.test.ts`): valor por omisión y
  aceptación de 19 valores de prueba iguales a los de la API en las siete
  variables; ninguna variable de la composición de la API sin pareja (con prueba
  negativa); zona, plantilla horaria y foto llegan al equipo.
- **Configuración** (`esquema-de-ajustes.test.ts`): D-91 en los siete, por el
  cargador de sitio y por el del puente con túnel.
- **Vistas fallar.** Sin `...ajustesDelProveedor(config)` y sin el umbral en
  `diagnostico-de-equipo.ts` fallan las dos del puente que exigen el rechazo
  («promise resolved instead of rejecting»), la de `sitio:edge` con 30 s y las
  tres del efecto (zona, plantilla, foto); sin `VIDEO_PUERTO_RTSP` en el esquema
  del Edge, el guardián la nombra. Y H-15R-C01: sobre una base recién sembrada,
  la DoD da 12 de 15 en `5566b8e` y en esta rama antes del arreglo, y 15 de 15
  después.

Cómo ejecutarlas: `pnpm --filter @ncr/edge test`, o todo con
`./scripts/verificar-etapa.sh --con-base`.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Corrida sobre `6050b05`, con base (`DATABASE_URL_PRUEBAS`) recién sembrada
—`supabase/verificar.sh --con-semillas --modo-supabase`, la que pide el paso
1c—, desde un árbol limpio de artefactos:

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El declarado es **D-112**: las cinco pruebas saltadas del arranque en frío, que
ejerce el paso 12b. **31 de 31 pasos**; **5183 pruebas de TypeScript** (API
2262, proveedores 1231, consola 783, dominio 438, **Edge 325**,
configuración 144) —46 más que la 15-R, todas del Edge— y **367 de Dart**, tres
corridas forzadas idénticas; ninguna omisión por falta de base (44 ficheros con su
guardián); el ensayo de sitio contra los equipos simulados, «SIN FALLOS · 47
OK»; los 34 controles detectan su violación; escaneo de secretos limpio (6872
blobs del historial).

### Cobertura por capa

| Capa                                          | Líneas                      | Ramas   | Umbral         |
| --------------------------------------------- | --------------------------- | ------- | -------------- |
| Dominio (`packages/domain-core`)              | 96,20 %                     | 96,91 % | 90 %           |
| Aplicación (`**/aplicacion/**`, 152 ficheros) | 97,18 %                     | 90,64 % | 90 %           |
| Global (951 ficheros)                         | 87,77 %                     | 87,06 % | 70 %           |
| App · dominio / aplicación / global           | 98,05 % / 96,89 % / 89,68 % | —       | 90 / 90 / 70 % |

### Las corridas anteriores, y lo que vino después

1. **Se detuvo en el paso 1c**: la base de pruebas recién creada no tenía
   esquema. Se le aplicaron migraciones y semilla, como pide el paso.
2. **FALLIDA en el paso 5**: la DoD del Edge en sitio dio 12 aperturas de 15
   (H-15R-C01, «Lo incómodo», 5). Se reprodujo sobre `5566b8e`, se interrumpió
   la corrida y se corrigió en `857ae2b`.

Después de `6050b05` sólo entró documentación: la fusión del cierre de la 15-R
(`da64043`) y este cierre. Sobre la cabeza final se repitieron los controles que
leen documentos: la coherencia de ESTADO (paso 1b), las declaraciones (paso 9),
los diagramas Mermaid (paso 10) y Prettier.

## 7 · Verificación de seguridad (§2.7)

| §2.7              | Qué hizo esta corrección                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos      | Ningún secreto nuevo: las siete variables son ajustes, no credenciales. La llave de las pruebas se calcula en ejecución. Escaneo limpio            |
| 2 · CORS          | Sin cambios                                                                                                                                        |
| 3 · Validación    | Las siete, validadas con Zod al arrancar por los dos cargadores; una zona mal escrita impide arrancar                                              |
| 4 · Inyección     | Sin SQL nuevo                                                                                                                                      |
| 5 · Rate limiting | Sin cambios                                                                                                                                        |
| 6 · RLS           | Sin cambios                                                                                                                                        |
| 7 · CSP           | Sin cambios                                                                                                                                        |
| 8 · Transversales | La `traza` NO se pasa al Edge precisamente por esto: su registro no redacta (DT-15R-C01). KPI-11: la palabra de la marca sigue en una línea exenta |

## 8 · Deuda técnica, supuestos y pendientes

- **DT-15R-09 · CERRADO.** El Edge compone su proveedor con los ajustes de la API.
- **H-15R-C01 · CORREGIDO, fuera del encargo.** La DoD del Edge en sitio y la
  paridad nube-Edge dependían de CONC001, el vehículo «sin dueño» que crea la
  prueba SQL de KPI-03 en el paso 12; con una base recién sembrada la DoD fallaba
  (12 de 15) y la paridad no ejercía la persona sintética. Ahora las dos crean la
  fila si falta (`apps/api/test/vehiculo-sin-dueno.ts`), como la crea KPI-03. Es
  de la 15-Q (`edebfc9`) y sale aquí porque esta rama se verificó sobre una base
  nueva; sin corregirlo, el veredicto habría sido FALLIDA o un verde que no se
  reproduce. Lo que no cambia: el guion SQL de KPI-03 sigue exigiendo una base
  recreada —tras la DoD, CONC001 tiene historial y su `DELETE` previo no borra—,
  y por eso `supabase/verificar.sh` y el paso 12 la recrean, como antes.
- **DT-15R-C01 · el adaptador del Edge no tiene `traza`.** Con puente, las
  renegociaciones Digest, los intercambios de las órdenes de puerta y lo que
  pasa en cada escucha ya no salen en ningún registro (en modo directo salen en
  el de la API, redactados). Hace falta un adaptador de `Bitacora` para el Edge
  con redacción por clave y filtro de nivel.
- **DT-15R-C02 · la vuelta atrás del audio no llega al Edge.** Con puente, el
  Edge fija `persistente` hacia el videoportero (15-Q2); `GUARDIA_AUDIO_TRANSPORTE=http`
  en la API ya no lo cambia. Si el modo persistente fallara con un modelo, no
  hay palanca en el `.env` del Edge. Exenta con este motivo en el guardián.
- **DT-15R-C03 · una apertura por el túnel puede cumplirse después de que la nube
  la dé por «no aceptada».** La nube espera 4 s a `abrir` (KPI-32) y no hay
  cancelación por el túnel; el Edge espera al equipo hasta
  `EQUIPOS_TIEMPO_LIMITE_MS` (5 s por omisión; la barrera esperaba 3 s antes de
  esta corrección), y la respuesta que llega tarde se descarta sin registrarse.
  Aun con un plazo menor el equipo puede accionar una orden cuya respuesta se
  cortó. El defecto es de la 15-Q2 (no reconciliar el desenlace tardío); esta
  corrección agranda su ventana con el valor por omisión.
- **Supuestos y contradicciones:** ninguno nuevo.

## 9 · Qué debe hacer el usuario manualmente

1. **Fusionar esta rama en `etapa-15r-huecos-y-decisiones`** antes de abrir el PR
   de la 15-R (o abrir su propio PR contra `develop` cuando la 15-R esté
   fusionada). Va encima de `5566b8e`: si la 15-R no se movió, es un avance
   rápido; si se movió para su cierre, lo previsible es chocar sólo en
   documentación (`ESTADO_ETAPAS.md`, `ETAPA-15R.md`, `README.md`).
2. **En el `.env` de cada Edge puente**, los siete ajustes iguales a los de la API
   (`DESPLIEGUE_EDGE.md` §10.1). Si la API usa los valores por omisión, el
   `.env.example` ya los trae iguales.
3. **En la próxima visita**, con la consola: la fila «reloj del equipo» de la
   ficha conforme antes de dar de alta rostros, y NTP en los tres equipos
   (`ENTREGA_EN_SITIO.md` §8.2 y §8.3). No cambie la hora de un equipo para
   «probar» el rechazo sin autorización del cliente.

## 10 · Rama y commits

Rama `etapa-15r-proveedor-del-edge`, desde `etapa-15r-huecos-y-decisiones`
(`5566b8e`). **Desviación declarada** de la regla del 2026-09-06 («cada rama de
etapa se saca de `develop`»): es una corrección de una ronda sin fusionar, y lo
que corrige sólo existe en esa rama (§ «Lo incómodo», 1). El entorno propuso
`claude/adoring-mccarthy-8j0tcb`; se renombró antes del primer commit (§2.5).

| Commit    | Qué                                                                               |
| --------- | --------------------------------------------------------------------------------- |
| `0bb66dc` | El Edge compone su proveedor con los ajustes de la API; pruebas                   |
| `8a2362d` | `DESPLIEGUE_EDGE.md` y `ENTREGA_EN_SITIO.md` §8.3                                 |
| `857ae2b` | H-15R-C01 · CONC001 la pone la prueba que la necesita                             |
| `1684d6e` | El socket de prueba cierra por los dos lados; espera del túnel de 5 s             |
| `6050b05` | Este informe, `ETAPA-15R.md`, `ESTADO_ETAPAS.md`, `README.md`, ADR-018 y el plazo |
| `da64043` | Fusión del cierre de la 15-R (`0ce8ed5`): su veredicto y su PR, sólo documentos   |
| _este_    | Cierre: el veredicto del verificador                                              |
