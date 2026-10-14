# ETAPA 15 · RONDA 15-Y2 — El hogar del residente, en la consola: plazas, menores, vehículos y revocar

**Rama:** `etapa-15y2-web-residente-hogar` · **Base:** `etapa-15y1-web-residente-cuenta` (la contiene) · **Estado:** CERRADA · 2026-10-14 · **PR:** hacia `develop`, sin fusionar; fusionar DESPUÉS del PR de la 15-Y1 con merge commit · sexta de la cadena 15-S6 → 15-Y3 (encargo del 2026-10-13)

> **Lo incómodo primero.** La consola enseñaba las plazas con sus códigos y no
> dejaba hacer nada con ellas; «Mi familia» no sabía que existen menores; los
> vehículos propios se «daban de baja» por una ruta que la app no usa, en vez
> de editarse y eliminarse como en el teléfono; y una visita no se podía
> revocar. Esta ronda pone las cuatro cosas con las rutas que la app ya usa y
> sus mismas palabras, **sin tocar la API ni la app**. Dos verdades: la visita
> recurrente **no está** porque la API no tiene ruta para ella (DT-15R-03,
> parada parcial, como el encargo manda); y «Compartir» sólo abre la hoja del
> sistema en un contexto seguro (HTTPS), que es donde la consola vive —en
> `http://` local cae al portapapeles y lo dice.

---

## 1 · Qué se construyó

**Las plazas del hogar en el Perfil** (`PlazasDelHogar`), como «Ocupantes» en
la app: el cupo («Plazas: 3 de 4»), cada plaza libre con su código y un botón
«Compartir» —la hoja de compartir del sistema (Web Share, la de Safari en el
iPhone) y, si no la hay, el portapapeles, diciendo cuál de las dos pasó—, el
menor sin cuenta marcado, y, sólo para el titular, «Añadir plaza» hasta el tope
(con el aviso de a quién pedir más) y «Retirar» en las plazas libres, nunca la
1, con motivo. Si el titular todavía no declaró cuántos viven, lo declara ahí
mismo; los demás leen que el titular no ha declarado. Quien no es titular
comparte los códigos y lee por qué no añade ni retira.

**Los menores del hogar en «Mi familia»** (`MenoresDelHogar`, ADR-038):
cualquier adulto registra a un menor en una plaza libre con los mismos campos
que la app (nombres, apellidos, fecha, parentesco, tipo y número de documento
de menor, plaza), con la misma cortesía de la fecha (`motivoDeFechaDeMenor`:
quien ya cumplió 18 no se registra como menor); lo edita (sólo nombres,
apellidos, fecha y parentesco) y lo da de baja con un motivo de cinco letras.
Sin plazas libres, la consola dice a quién pedir una según quién mira. Cuando
el menor cumple 18, el titular —y sólo él— ve «Código para su cuenta»: el
código de traspaso se enseña una vez, en un diálogo, con «Compartir», y vive
sólo en memoria mientras el diálogo está abierto.

**Los vehículos propios**: «Editar» (placa, color, modelo y marca; la placa
viaja sólo si cambió de verdad y el servidor la rechaza con su explicación si
el vehículo tiene historial) y «Eliminar», que borra el vehículo sin historial
o lo deja dado de baja si lo tiene, diciendo cuál de las dos cosas pasó. Los
de la administración siguen sin botones.

**Revocar una visita** vigente o programada desde «Visitas», con motivo, y el
texto de la app contando de cuántos equipos salió la foto y cuántos la
retirarán al reintentar.

**El recorrido del residente** gana dos pasos: el titular, en Chromium a 360
px, añade una plaza y comparte su código, registra y edita a un menor,
registra, edita y elimina un vehículo y revoca una visita; quien no es titular
no ve «Añadir plaza» ni «Retirar» y lee por qué.

---

## 2 · Cómo se organizó y por qué

### Punto 1 · Las reglas del hogar, puras y repetidas de Dart (`lib/hogar.ts`)

Como en la 15-Y1: la consola depende sólo del contrato, no de
`@ncr/domain-core`, así que las reglas que la app aplica en Dart
(`plazas.dart`, `menores.dart`, `revocacion.dart`, `vehiculos_propios.dart`)
se repiten en TypeScript con sus pruebas: el cupo, al tope, quién añade y qué
se retira (la plaza 1 nunca), el detalle del menor, quién ya es mayor, qué
visita se revoca, los textos de la revocación y de la eliminación, y la placa
sin separadores. `motivoDeFechaDeMenor` va junto a `motivoDeFechaDeAdulto` en
`lib/registro/edad.ts`, con el margen de un día **a favor del menor** —el
inverso del de la cuenta—, exactamente como la app. El servidor decide de
verdad; esto es lo que se ve.

### Punto 2 · Una carpeta `mi/hogar/` con piezas pequeñas que comparten cuatro pantallas

Las plazas viven en el Perfil, los menores en «Mi familia», la edición del
vehículo en «Mis vehículos» y el diálogo del código sirve a los menores (y a
lo que venga). Ninguna pieza pasa de 300 líneas; la mayor, `plazas-del-hogar`,
265 con sus cuatro acciones. `BotonCompartir` no pinta el aviso: devuelve el
resultado y quien lo monta lo pone en SU `role="status"`, para que un lector
de pantalla lo anuncie donde el usuario ya está.

### Punto 3 · Compartir: la hoja del sistema, el portapapeles, y nunca un almacén (`lib/compartir.ts`)

`compartirTexto` prueba Web Share (`navigator.share`, con `canShare` cuando
existe) y cae al portapapeles; cerrar la hoja sin elegir es `AbortError` y se
trata como «cancelado», no como fallo ni se copia a escondidas; sin ninguno de
los dos medios, el aviso enseña el código para copiarlo a mano. Nunca lanza.
El mensaje que se comparte dice qué es el código, de qué vivienda y dónde se
usa («consola o app», porque el destinatario puede tener cualquiera de las
dos: S-15Y2-02). Nada queda en `localStorage`, `sessionStorage` ni en la caché
del service worker: el recorrido lo comprueba con los almacenes.

### Punto 4 · Menores: un formulario para registrar y editar, y las plazas libres de `mi/ocupantes`

`FormularioDeMenor` es uno: con `menor === null` registra (documento y plaza
libre obligatorios), con un menor edita (sin documento ni plaza, que no se
reescriben desde la consola, como en la app). Las plazas libres salen de la
misma consulta que el Perfil (`useMisOcupantes`), así que no hay una ruta ni
un estado nuevo; sin libres, el aviso depende de si quien mira es titular. El
código de traspaso se pide por `POST …/codigo-de-traspaso` sólo al pulsar, se
enseña en `DialogoDeCodigo` y se descarta al cerrar: no hay dónde guardarlo.

### Punto 5 · Vehículos: «Eliminar» por `DELETE`, como la app, en lugar de «Dar de baja» (S-15Y2-01)

La consola daba de baja por `POST …/desactivacion`, una ruta de la ETAPA 15-M
que la app nunca usó; la app (15-W) edita por `PUT` y elimina por `DELETE`,
que borra o da de baja según el historial y lo dice. La paridad manda: la
consola pasa a la misma pareja y lee el resultado con el mismo texto. La ruta
de desactivación sigue en la API, intacta (no se toca el contrato). La placa
viaja sólo si cambió sin separadores ni minúsculas, porque la misma placa no
es un cambio de placa, y un 409 `PLACA_CON_HISTORIAL` se lee tal cual.

### Punto 6 · Revocar: una ranura `accion` en la fila, no otra fila

`FilaDeAutorizacion` gana una ranura opcional `accion` (OCP): «Visitas» pone
«Revocar» en las filas vigentes o programadas y el inicio sigue sin botones.
La confirmación reutiliza `DialogoDeConfirmacion` con mínimo 1 (lo que exige
la API) y máximo 200.

### Punto 7 · El recorrido crece en dos pasos y el guion principal se parte en módulos

`recorrido-residente-web.mjs` pasó de 293 a 315 líneas al añadir los pasos 7
y 8; para quedar bajo 300 (278), el bloque del código inválido y el menor sale
a `residente-web/cuenta.mjs`, el hogar a `residente-web/hogar.mjs` y el
veredicto (`reportero`) a `acciones.mjs`. La visita que se revoca se crea por
la API con una «foto» que pasa por su tipo real (los bytes de un JPEG) y sus
medidas, porque capturar una foto real en el navegador es el recorrido de la
consola (13b), no éste.

### Punto 8 · Parada parcial: la visita recurrente

El encargo pedía la visita recurrente del residente «SÓLO si la ruta existe».
No existe en `mis-visitas` (DT-15R-03 sigue abierta): la consola no la enseña
ni deja andamiaje. Se registra aquí y en la ficha; no es una DT nueva.

---

## 3 · Árbol de archivos

```
apps/web/src/
├─ lib/hogar.ts                                  (97)  las reglas del hogar, puras, repetidas de Dart
├─ lib/hogar.test.ts                            (112)  plazas, menores, fecha del menor, revocación, eliminación
├─ lib/compartir.ts                              (45)  Web Share → portapapeles → nada, sin lanzar; el texto del código de plaza
├─ lib/compartir.test.ts                               cuatro casos: hoja, cancelada, portapapeles, sin medio
├─ lib/registro/edad.ts                       (69→88)  `motivoDeFechaDeMenor`, margen a favor del menor
├─ lib/api/residente.ts                      (124→136)  `useMisMenores`, tipos `PlazaDeOcupante` y `MenorDelHogar`
├─ app/(consola)/mi/hogar/boton-compartir.tsx    (52)  «Compartir» que entrega el aviso a quien lo monta
├─ app/(consola)/mi/hogar/plazas-del-hogar.tsx  (265)  cupo, códigos, declarar, añadir, retirar, compartir
├─ app/(consola)/mi/hogar/plazas-del-hogar.test.tsx    ocho casos: los cinco estados y sin declarar, titular, añadir, tope, retirar, compartir, no titular, declarar
├─ app/(consola)/mi/hogar/formulario-de-menor.tsx (239)  registrar o editar, con la cortesía de la app
├─ app/(consola)/mi/hogar/fila-de-menor.tsx      (64)  nombre, detalle, «Sin cuenta», acciones; a los 18, el código (titular)
├─ app/(consola)/mi/hogar/dialogo-de-codigo.tsx  (77)  un código de un solo uso, en memoria, con «Compartir»
├─ app/(consola)/mi/hogar/menores-del-hogar.tsx (191)  la sección: lista, añadir, baja con motivo, traspaso
├─ app/(consola)/mi/hogar/menores-del-hogar.test.tsx   siete casos: los cinco estados, lista, añadir, sin plazas, editar, baja, traspaso
├─ app/(consola)/mi/hogar/editar-vehiculo.tsx   (150)  placa (sólo si cambió), color, modelo, marca
├─ app/(consola)/mi/hogar/vehiculo-propio.test.tsx     cuatro casos: botones por origen, editar, placa con historial, eliminar
├─ app/(consola)/mi/hogar/revocar-visita.test.tsx      dos casos: quién lleva «Revocar», y el envío con su texto
├─ app/(consola)/mi/perfil/pantalla.tsx      (225→191)  la tarjeta de plazas sale a `PlazasDelHogar`
├─ app/(consola)/mi/familia/pantalla.tsx      (91→105)  `MenoresDelHogar`, con el reloj inyectable
├─ app/(consola)/mi/vehiculos/pantalla.tsx   (158→182)  «Editar» y «Eliminar» por DELETE; el aviso del resultado
├─ app/(consola)/mi/visitas/pantalla.tsx     (154→213)  «Revocar» con motivo y el aviso
├─ app/(consola)/mi/comunes.tsx              (143→152)  la ranura `accion` de la fila
├─ app/(consola)/mi/pruebas.tsx              (228→252)  plazas con tope, titular y `sinCuenta`; el menor
├─ app/(consola)/mi/formularios.test.tsx               la baja antigua del vehículo sale (la sustituye `vehiculo-propio.test.tsx`)
├─ app/(consola)/mi/pantallas-lectura.test.tsx         el Perfil enseña «Plazas: 3 de 4» y el código
└─ app/(consola)/formularios-sin-identificadores.test.tsx  cinco escrituras nuevas clasificadas con su prueba propia
e2e/
├─ recorrido-residente-web.mjs             (293→278)  pasos 7 y 8; el 6 y el veredicto salen a módulos
├─ residente-web/hogar.mjs                      (162)  la visita por la API; el hogar del titular; el del ocupante
├─ residente-web/cuenta.mjs                      (70)  el código inválido y el menor (antes en el guion)
└─ residente-web/acciones.mjs                (163→186)  `reportero`, `secretosFuera`
scripts/verificar-etapa.sh                             el paso 13d nombra el hogar
docs/guias/MANUAL_USUARIO.md                           «El hogar desde la consola web (15-Y2)»
```

## 4 · Tabla SOLID

| Fichero                        | SRP                                                             | OCP                                               | LSP                                                | ISP                                                  | DIP                                         |
| ------------------------------ | --------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------- |
| `lib/hogar.ts` · `edad.ts`     | Reglas puras del hogar, una función por regla                   | Otra regla es otra función                        | Mismos resultados que las de Dart (pruebas espejo) | Cada función recibe sólo los campos que lee (`Pick`) | Sin React ni red                            |
| `lib/compartir.ts`             | Elegir el medio y decir cuál fue                                | Otro medio es otra rama antes del «sin medio»     | —                                                  | Recibe texto y título                                | Sólo `navigator`                            |
| `boton-compartir.tsx`          | Un botón que comparte y entrega el aviso                        | El texto del aviso es una función aparte          | —                                                  | Recibe texto, código y `alResultado`                 | `compartirTexto`                            |
| `plazas-del-hogar.tsx`         | Las plazas con sus cuatro acciones; la fila es un subcomponente | Una acción más es una función `hacer(...)` más    | Misma consulta que el Perfil usaba                 | Recibe `copropiedadId` y el nombre de la vivienda    | El cliente generado; reglas de `lib/hogar`  |
| `formulario-de-menor.tsx`      | Registrar o editar, con la validación de la app                 | —                                                 | Con menor o sin él, el mismo diálogo               | Recibe el menor, las plazas libres y el reloj        | El cliente generado; `motivoDeFechaDeMenor` |
| `fila-de-menor.tsx`            | Pintar un menor y sus botones                                   | —                                                 | —                                                  | Tres callbacks, uno por acción                       | Reglas de `lib/hogar`                       |
| `dialogo-de-codigo.tsx`        | Enseñar un código una vez y compartirlo                         | Sirve a cualquier código de un solo uso           | —                                                  | Recibe el código, los textos y `alCerrar`            | `BotonCompartir`                            |
| `menores-del-hogar.tsx`        | La sección: lista, añadir, baja, traspaso                       | Una acción es un miembro más de la unión `Accion` | —                                                  | Recibe `copropiedadId`, `esTitular`, `ahora`         | El cliente generado                         |
| `editar-vehiculo.tsx`          | Editar un vehículo propio                                       | —                                                 | Mismo `DialogoDeFormulario` que el alta            | Recibe el vehículo y dos callbacks                   | El cliente generado; `placaSinSeparadores`  |
| `e2e/residente-web/hogar.mjs`  | Las acciones del hogar en el navegador                          | Otro paso del hogar es otra función               | —                                                  | Cada función recibe sólo su página y su veredicto    | `entrar` de `acciones.mjs`                  |
| `e2e/residente-web/cuenta.mjs` | El código inválido y el menor                                   | —                                                 | —                                                  | —                                                    | `llenarCrearCuenta`, `registroDeMenor`      |

Ningún fichero nuevo pasa de 300 líneas; ningún fichero que ya pasaba crece
(`verificar-etapa.sh` cambia tres líneas de texto del paso 13d, sin ganar
líneas de control; `recorrido-de-consola.mjs` no se toca).

## 5 · Trazabilidad

| Elemento                        | Cómo lo cubre esta ronda                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **D-W10, 15-W** (plazas)        | Cupo, códigos, declarar, añadir, retirar y compartir en el Perfil, como «Ocupantes» en la app          |
| **D-W2, D4, ADR-038** (menores) | Registrar, editar, dar de baja y el código de traspaso a los 18, con la cortesía de la fecha de la app |
| **DT-15W-02, 15-W** (vehículos) | Editar y eliminar sólo los `propio`; la placa sólo sin historial; el resultado dicho                   |
| **D-W6** (revocar)              | «Revocar» en las vigentes y programadas, con motivo y el texto de equipos                              |
| **P-23, DT-15W-07, DT-15X-01**  | El residente con iPhone gestiona su hogar desde la consola; el rostro queda para la 15-Y3              |
| **RN-19**                       | Eliminar no borra lo que tiene historial: el servidor lo da de baja y la consola lo dice               |
| **Parcial**                     | La visita recurrente: sin ruta en la API (DT-15R-03), parada parcial                                   |

## 6 · Pruebas

**Cómo se ejecutan:** `pnpm --filter @ncr/web exec vitest run src/lib/hogar.test.ts
src/lib/compartir.test.ts "src/app/(consola)/mi"` (99 en `mi/` y `lib`); el
recorrido: `DATABASE_URL_PRUEBAS=… node e2e/recorrido-residente-web.mjs`
(paso 13d del verificador, ahora con los pasos 7 y 8).

**Visto fallar antes de corregir:**

- `plazas-del-hogar.test.tsx`, `menores-del-hogar.test.tsx`,
  `vehiculo-propio.test.tsx` y `revocar-visita.test.tsx` se escribieron
  ANTES del componente o del cambio: cayeron por «no se resuelve el módulo»
  (plazas, menores) o porque los botones «Editar», «Eliminar» y «Revocar» no
  existían (seis fallos), y pasaron después.
- El barrido `formularios-sin-identificadores` cayó con cinco escrituras sin
  clasificar; se declararon con su prueba propia.
- `menores-del-hogar.test.tsx`: «Añadir menor» espera a `mi/ocupantes` antes
  de abrir el diálogo; la prueba lo esperaba de forma síncrona y cayó: se
  corrigió la prueba (`findByRole`), no el componente.

**Verificador (§2.8.0), la corrida que cierra (sobre `23ed21b`, 09:09 → 09:57 UTC, base del puerto 55432):** 32 de 32 pasos; 587 de 587 ficheros de prueba recogidos; 5756 pruebas por los dos caminos (turbo y vitest directo) con el mismo resultado; cobertura por capa: dominio 96,46 % de líneas (ramas 96,55 %), aplicación 97,82 % (ramas 91,67 %), global 88,65 % (ramas 87,51 %); 1 paso declarado no ejercido, preexistente y con motivo.

**Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0):**

**La corrida, sobre la rama ya rebasada sobre el cierre de la 15-Y1 (`8aea7dc`), base del puerto 55432, sin ningún otro proceso en la máquina:**

**`VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe`**

## 7 · Verificación de seguridad (§2.7)

| Medida               | Cómo queda                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Secretos             | Ninguno; el código de traspaso y los de plaza viven en memoria y se comparten por la hoja o el portapapeles, nunca se guardan |
| CORS, CSP            | Sin cambio; nada externo                                                                                                      |
| Validación           | La consola valida forma por cortesía con las reglas de la app; la API decide (DTOs, RN-04, RN-19, ADR-038, D-W6)              |
| Rate limiting        | Sin rutas nuevas; las de `/mi` ya tienen límite por identidad                                                                 |
| RLS, los dos caminos | Sin cambio en la API; las rutas de `/mi` ya exigen alcance y resuelven la vivienda desde el token                             |
| RBAC                 | Sin cambio; «Añadir plaza», «Retirar» y el código de traspaso se ocultan a quien no es titular y la API los niega igual       |
| Datos personales     | El documento del menor llega enmascarado y así se pinta; nada en `localStorage`/`sessionStorage`/caché (recorrido)            |

## 8 · Hallazgos, deuda, supuestos y pendientes

- **S-15Y2-01** · «Eliminar» por `DELETE` sustituye a «Dar de baja» por `POST …/desactivacion` en los vehículos propios de la consola, por paridad con la app; la ruta antigua sigue en la API.
- **S-15Y2-02** · el mensaje que se comparte con un código de plaza nombra la vivienda y dice «consola o app».
- **S-15Y2-03** · «Revocar» se ofrece en toda fila vigente o programada de «Mis autorizaciones» y es la API quien niega (404) la que no sea de la vivienda.
- **Parada parcial** · la visita recurrente no existe en la API (DT-15R-03): no se enseña.
- **DT-15W-07** queda cerrada en la parte del hogar; sólo el rostro sigue (15-Y3). **DT-15Y1-01** sigue: esta ronda añade dos guiones más a `e2e/`.

## 9 · Qué debe hacer el usuario manualmente

1. Nada en Supabase: no hay migración.
2. Tras fusionar (después de la 15-Y1), desde Safari en un iPhone como
   titular: Perfil → «Añadir plaza» → «Compartir» (se abre la hoja de
   compartir de Safari); Mi familia → «Añadir menor»; Mis vehículos →
   «Editar» y «Eliminar»; Visitas → «Revocar».
3. Nada más hasta la 15-Y3 (el rostro).

## 10 · Rama y commits

`etapa-15y2-web-residente-hogar`, desde `etapa-15y1-web-residente-cuenta`
(la contiene). PR hacia `develop`, sin fusionar; fusionar DESPUÉS del PR de
la 15-Y1, con merge commit. La rama se rebasó sobre el cierre de la 15-Y1
antes de su primer push (no tenía PR).

| Commit    | Qué                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `838ff1a` | `feat(etapa-15y2/web)` — las plazas del hogar en el Perfil: declarar, añadir, retirar y compartir el código            |
| `4efbd51` | `feat(etapa-15y2/web)` — los menores del hogar en «Mi familia»: registrar, editar, dar de baja y el código de traspaso |
| `00cb663` | `feat(etapa-15y2/web)` — editar y eliminar los vehículos propios y revocar una visita, como en la app                  |
| `23ed21b` | `test(etapa-15y2/e2e)` — el hogar en el recorrido del residente (pasos 7 y 8) y el manual                              |
| cierre    | `chore(etapa-15y2): cierre de etapa` — informe, ficha y registro                                                       |
