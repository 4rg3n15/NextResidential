# Rediseño del alta de viviendas

**Rama:** `etapa-04-alta-de-viviendas`, desde `develop` · **Fecha:** 2026-09-16
**Diseño aprobado:** [`decisiones/propuestas/alta-de-viviendas.md`](../decisiones/propuestas/alta-de-viviendas.md)

---

## 1 · Qué se construyó

El alta de viviendas era inviable para un conjunto real: pedía torre y dirección
en cada una de las 300 unidades, y la dirección es la misma para todas porque en
Colombia la dirección es del conjunto. Ahora la copropiedad declara una vez
quién es —dirección, tipo, y cómo llama a sus viviendas y a sus agrupaciones— y
el padrón se genera entero desde un patrón, con una vista previa que hay que
mirar antes de que se cree nada.

Con el rediseño entra la migración de `agrupacion` que estaba aprobada y sin
hacer. Iban juntas porque tocan el mismo campo, y porque hoy no había una sola
vivienda cargada: los tres cambios de esquema son de catálogo, y con el padrón
dentro habrían sido migraciones con datos.

---

## 2 · Cómo se organizó, y por qué

### 2.1 · La clave de la vivienda pasó a ser compuesta — H-2

Es el único cambio con consecuencias fuera de esta pantalla, y es el que sostiene
todo lo demás.

En un conjunto de apartamentos, la Torre 1 y la Torre 2 tienen **las dos** un 101. El índice anterior era `(copropiedad_id, identificador)`, así que generar la
segunda torre chocaba contra la primera en el primer apartamento de cada piso:
ADR-04 —la razón por la que la generación es correcta bajo concurrencia— habría
trabajado en contra.

La alternativa era meter la torre dentro del identificador («T1-101»). Se
descartó porque duplica el dato: al renombrar una agrupación, el identificador se
queda mintiendo y **la base no puede detectarlo**. La identidad real de una
vivienda en un edificio es el par, y eso es lo que el índice sostiene ahora:

```
UNIQUE (copropiedad_id, coalesce(agrupacion, ''), identificador) WHERE estado = 'activo'
```

`coalesce` no es adorno: en un índice único varios `NULL` **no chocan entre sí**,
así que sin la expresión una parcelación sin secciones podría tener dos «7»
activas a la vez. Hay una prueba SQL para cada una de las tres caras —el mismo
número en dos torres se acepta, el mismo par se rechaza, dos sin agrupación con
el mismo número se rechazan— y las tres se vieron fallar quitando primero el
`coalesce` y después la agrupación entera del índice.

No reabre ADR-04. Es la misma decisión —la integridad concurrente la resuelve la
base, no un `SELECT` previo— aplicada a una clave que resultó ser compuesta.

### 2.2 · La palabra se pinta; nunca se guarda — H-3

El identificador que se persiste es `42`. «Casa» es `etiqueta_vivienda` de la
copropiedad y se compone al mostrar. De ahí sale la respuesta a _«al cambiar el
prefijo, ¿se renombran las viviendas?»_: **no hay nada que renombrar**.

Eso solo es cierto mientras nadie teclee la palabra dentro, y por eso hay control
en los dos caminos —con dos respuestas distintas, deliberadamente:

| Camino              | Qué hace                                  | Por qué                                                                                                                                        |
| ------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alta individual** | **Rechaza** y dice cuál sería el correcto | Hay una persona escribiendo. Decírselo una vez evita que lo repita trescientas                                                                 |
| **Importación**     | **Recorta** y lo cuenta                   | El archivo es el que el conjunto ya tenía. Rechazar 300 filas por una palabra que sabemos quitar convertiría la vía más rápida en la más lenta |

El recuento es lo que impide que el recorte sea silencioso: quien cargó «Casa 42»
ve que se guardó «42» y por qué.

### 2.3 · El generador es una función pura, y las dos operaciones la comparten

`generarPlan(plan)` vive en `domain-core`. La vista previa y la confirmación
llaman a **la misma función**. No es comodidad: es la única forma de que lo que
el usuario aprobó y lo que se crea no puedan separarse. Con dos cálculos, el día
que discrepen el usuario aprueba una cosa y recibe otra, y lo descubre con 300
viviendas dentro.

Las cotas se comprueban **antes** de construir el arreglo, no después: §2.4
prohíbe iterar sobre entrada no acotada del usuario, y «99 torres de 50 pisos por
99» son cien millones de cadenas si se construyen primero y se miden luego.

### 2.4 · Dónde está la garantía de unicidad, y dónde no

Tres piezas, y solo la tercera garantiza algo.

1. **La vista previa lee, para informar.** Dice qué identificadores del plan ya
   existen. Esa lectura **puede quedarse obsoleta** en el minuto que pasa hasta la
   confirmación, y el puerto lo dice por escrito.
2. **La confirmación escribe en una sola sentencia**, sin leer nada antes:
   `INSERT … SELECT FROM unnest(…) ON CONFLICT (…) WHERE estado='activo' DO NOTHING RETURNING …`.
3. **El recuento decide.** Si `RETURNING` devuelve menos filas de las pedidas, la
   diferencia **es** la lista de colisiones —se calcula restando, no consultando—
   y la transacción se revierte entera. El operador recibe todas las que
   chocaron, no la primera, y no queda media generación aplicada.

`totalEsperado` cierra la última ventana: el cuerpo lleva el número que la vista
previa enseñó, y si el servidor recalcula el plan y le sale otro, no crea nada.
Sin pedirle al usuario que teclee una confirmación que acabaría escribiendo sin
leer.

### 2.5 · La operación peligrosa no existe

La pregunta era qué ocurre al regenerar sobre una copropiedad que ya tiene
viviendas con residentes. La respuesta es que **no hay camino que lo ejecute**:

- La ruta de generación **solo inserta**. No hay `UPDATE` ni `DELETE` en ella.
- Una sola colisión revierte la operación entera, así que volver a lanzar el
  mismo plan es un rechazo con la lista, no un duplicado.
- El borrado físico sigue prohibido por disparador desde la `0013` (RN-19).

«Añadir la torre que construyeron el año pasado» funciona; «regenerar todo» se
niega solo.

### 2.6 · El diálogo inicial, disparado por el servidor — H-1

El encargo decía «al entrar por primera vez **sin copropiedad configurada**». Con
el repositorio delante, eso no puede ocurrir tal cual: **nadie entra antes de que
exista una copropiedad** —`roles_usuario.copropiedad_id` es `NOT NULL` y sin rol
el gancho de claims no emite token—. La primera la crea un operador con
`scripts/registrar-copropiedad.mjs`.

Así que el diálogo no crea el tenant: **completa su configuración**, y lo dispara
un estado real del servidor —`tipo IS NULL`—, no «es la primera sesión» ni una
marca del navegador. Es la lección de D-67 y D-68, y tiene una consecuencia
práctica: la copropiedad número 40 verá el diálogo el día que entre su
administrador, sin que nadie tenga que acordarse.

Vive en el marco de la consola, no en una pantalla: «al entrar» es al entrar.

### 2.7 · El tipo es enumerado y las etiquetas son texto libre

No es incoherencia. El **tipo decide comportamiento** —qué formulario se muestra,
qué generador se ejecuta— y un valor que el código no conoce no tendría
formulario que mostrar. La **etiqueta solo decide una palabra**, y un catálogo
cerrado obliga a elegir mal al primer conjunto que use «manzana y lote» a la vez.

`tipo` admite `NULL`, y ese nulo **es** el estado «sin configurar». Un valor por
defecto fingido haría indistinguible «todavía no me lo han dicho» de «me dijeron
que es otro», y la consola no sabría si preguntar.

### 2.8 · El control que sostiene una respuesta, no una convención

`scripts/lib/frontera-vocabulario.mjs` exige que el tipo de copropiedad y sus dos
etiquetas **no aparezcan en `domain-core`**. De eso depende que «el tipo se puede
cambiar después y las viviendas ya creadas no se enteran» siga siendo cierto: el
día que una política ramifique por él, cambiarlo dejaría de ser inocuo y nadie se
enteraría hasta que un conjunto lo cambiara en producción.

Al escribirlo, el control rechazó `nombreDeVivienda` —la composición del nombre
visible, que había puesto en el dominio—. Tenía razón: eso es presentación, no
decide nada y no se persiste. Se movió a la consola.

---

## 3 · Árbol de archivos

### Nuevos

| Archivo                                                                | Propósito                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `supabase/migrations/…_0029_alta_de_viviendas.sql`                     | Agrupación, tipo, dos etiquetas, dirección del conjunto, índice compuesto |
| `packages/domain-core/src/padron/plan-de-viviendas.ts`                 | `generarPlan` puro, con sus cotas y su vista previa por grupo             |
| `packages/domain-core/src/padron/etiquetas.ts`                         | Que la palabra no entre en el identificador. Invariante, no formato       |
| `apps/api/src/padron/aplicacion/generar-viviendas.ts`                  | Previsualizar y confirmar, sobre la misma función pura                    |
| `apps/api/src/padron/aplicacion/exportar-padron.ts`                    | CSV con la cabecera tomada del lector, y marca de orden de bytes          |
| `apps/api/src/padron/aplicacion/vocabulario.ts`                        | Puerto mínimo del padrón hacia `Copropiedad` (§2.2)                       |
| `apps/api/src/padron/infraestructura/vocabulario-desde-copropiedad.ts` | Lo cumple con el repositorio de `multiempresa`, no con una consulta       |
| `apps/web/src/lib/vocabulario.ts`                                      | Composición del nombre visible y detección de «sin configurar»            |
| `apps/web/src/componentes/configuracion-inicial.tsx`                   | El diálogo de entrada, disparado por `tipo` nulo                          |
| `apps/web/src/app/(consola)/viviendas/asistente-de-generacion.tsx`     | Dos pasos: no hay botón de crear sin vista previa                         |
| `scripts/lib/frontera-vocabulario.mjs`                                 | El control de §2.8                                                        |

### Modificados

`padron/aplicacion/{puertos,casos-de-uso,carga-padron}.ts` ·
`padron/infraestructura/repositorio-pg.ts` · `padron/presentacion/{dtos,respuestas}.ts` ·
`padron/presentacion/padron.controller.ts` · `padron/padron.module.ts` ·
`multiempresa/{configuracion,repositorio-copropiedades,repositorio-copropiedades-pg,respuestas,copropiedades.controller}.ts` ·
`packages/contracts/{openapi.json,src/index.ts,src/generado/api.ts}` ·
`apps/web/.../viviendas/{directorio,carga-de-padron}.tsx` ·
`apps/web/.../configuracion/formulario.tsx` · `apps/web/src/componentes/{marco-consola,buscador-global}.tsx` ·
`apps/web/src/lib/api/consultas.ts` · `supabase/seed/seed.sql` ·
`supabase/policies/tests/10_invariantes_estructurales.sql` ·
`scripts/{verificar-etapa.sh,lib/pruebas-negativas.mjs}`

---

## 4 · Cumplimiento SOLID

| Principio | Cómo se materializa aquí                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SRP**   | `generarPlan` calcula y no persiste; `GenerarViviendas` orquesta y no calcula; el repositorio escribe y no decide. El asistente de la consola pinta y no valida nada de negocio |
| **OCP**   | Un tipo de conjunto nuevo es una rama más en la unión discriminada del plan y su generador; no toca `GenerarViviendas`, ni el repositorio, ni el contrato de escritura          |
| **LSP**   | `RepositorioPadron` gana tres métodos y el doble en memoria de las pruebas los cumple igual que el de PostgreSQL: la suite corre con los dos sin cambiar una aserción           |
| **ISP**   | `LectorDeVocabulario` tiene **un** método. El padrón necesitaba tres datos de `Copropiedad` y pide exactamente eso, no el repositorio entero                                    |
| **DIP**   | El padrón declara el puerto del vocabulario; `multiempresa` lo cumple por el cableado del módulo. Ni una consulta del padrón a la tabla `copropiedades`                         |

---

## 5 · Trazabilidad

**Cubre:** HU-01, HU-02, HU-03 · CA-01, CA-02, CA-03 · CP-01 · KPI-01 … KPI-05 ·
RN-04 (intacta) · RN-13 · RN-15 · RN-19 · ADR-04 (extendido a clave compuesta) ·
§2.7.3, §2.7.4, §2.7.5, §2.7.8.

**Parcial:** la baja masiva queda fuera a propósito (§8). Es la operación que sí
destruye trabajo y merece su propio diseño.

---

## 6 · Pruebas

**Qué se probó, y qué se vio fallar antes de confiar en ello:**

| Control                             | Mutación con la que se comprobó                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| La consola no crea sin vista previa | `alEnviar` pasa a confirmar siempre → 4 pruebas en rojo                                        |
| El índice compuesto                 | Índice vuelto a `(copropiedad_id, identificador)` → la prueba SQL falla con `unique_violation` |
| El `coalesce` del índice            | Índice sin `coalesce` → «dos viviendas SIN agrupacion con el mismo numero»                     |
| `frontera-vocabulario`              | `TipoDeCopropiedad` y `etiquetaVivienda` inyectados en el dominio → detectados los dos         |
| El barrido de formularios           | Detectó por sí solo las dos pantallas nuevas antes de que nadie las clasificara                |

**Nuevas pruebas:** 20 del generador puro · 5 de las etiquetas · 12 del caso de
uso y la exportación · 9 de la consola · 3 caras del índice en SQL.

La exportación no se comprueba comparando dos listas de nombres de columna:
**se exporta, se analiza y se carga el resultado**. Si el círculo no cerrara, una
de las dos estaría mal.

**Veredicto literal de §2.8.0** — `./scripts/verificar-etapa.sh --con-base`,
con `DATABASE_URL_PRUEBAS` apuntando a una PostgreSQL local:

```
VERIFICACIÓN DE ETAPA: correcta — se puede escribir el informe
```

19 de 19 pasos ejecutados · 1 485 pruebas en verde · 116 de 116 ficheros
recogidos · dominio 97,68 % y aplicación 97,32 % de cobertura (umbral 90 %) ·
global 74,42 % (umbral 70 %) · 15 controles negativos detectando su violación ·
tres corridas idénticas sin caché. El desglose está en `docs/ESTADO_ETAPAS.md`.

**Hallazgo del camino.** El paso 13 se omite sin `DATABASE_URL_PRUEBAS`, y esa
omisión escondía **tres pruebas contra base en rojo**: los casos de uso del
padrón habían dejado de compilar con la firma nueva y la suite con dobles seguía
en verde. Es la familia de falso verde que el guion existe para impedir, esta vez
desde el otro lado —el control estaba, pero nadie le daba la base—. Se corrigió,
y el paso 13 ejecuta ahora también `test/generacion-padron.test.ts`.

---

## 7 · Verificación de seguridad (§2.7)

| Punto              | Estado                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| §2.7.1 Secretos    | Ninguno nuevo. El escaneo de pre-commit corrió en los cuatro commits                                                                 |
| §2.7.3 Validación  | El DTO valida forma —enteros acotados, arreglo de excepciones con tope— y `generarPlan` valida verdad, con su mensaje                |
| §2.7.4 Inyección   | Todo parametrizado, incluidas las dos listas del `unnest`. Cero concatenación                                                        |
| §2.7.5 Límites     | 2 000 viviendas por operación, comprobadas **antes** de construir nada; 99 excepciones por plan; 10 000 filas en la exportación      |
| §2.7.6 Aislamiento | `exigirAlcance` en las tres rutas nuevas, y la exportación filtra por `copropiedad_id` además de la RLS                              |
| §2.7.8 Auditoría   | La generación deja fila propia en `auditoria_seguridad` (`generacion_de_padron`) **en la misma transacción** que las 300 inserciones |
| RBAC               | Generar, configurar y exportar: administrador y superadministrador. El portero no genera padrón                                      |

---

## 8 · Deuda y pendientes

| ID   | Qué                                                                                                                                                             | Se salda en                            |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| D-74 | **Baja masiva.** Deshacer un padrón mal generado exige desactivar vivienda a vivienda con motivo (RN-19). Con 300 es inviable a mano                            | Diseño propio antes de usarlo en serio |
| D-75 | La exportación tiene tope de 10 000 filas y lo declara en el resultado, pero la consola descarga por enlace directo y no lee esa marca                          | Cuando un conjunto pase de ese tamaño  |
| S-16 | «Cuántas casas en total» se reparte **uniforme y el resto a la última** (decisión del usuario, 2026-09-16). Queda escrito porque la otra lectura era defendible | Cerrado                                |
| —    | El diálogo inicial es **aplazable**: bloquear la consola entera dejaría fuera a quien solo quiere mirar eventos. El generador sí queda deshabilitado sin tipo   | Decisión, no deuda                     |

**Desviación del diseño aprobado, declarada:** el diseño proponía una **clave de
idempotencia** en la confirmación. Al construirlo resultó innecesaria y más débil
que lo que ya hay: un segundo envío del mismo plan choca contra lo que el primero
creó y se rechaza entero, nombrándolo. Un doble clic no crea 600 viviendas —
recibe «estas 39 ya existen», que además es la verdad. La clave habría añadido
almacenamiento para contestar peor.

---

## 9 · Qué debe hacer usted

1. Aplicar la migración `0029` contra su proyecto.
2. Recorrer el **§12 de `docs/guias/VERIFICACION_CONTRA_SU_PROYECTO.md`**, que
   lleva los ocho pasos con su salida esperada.

Nada más. No hay credenciales nuevas, ni variables de entorno nuevas, ni nada
que crear en el panel.
