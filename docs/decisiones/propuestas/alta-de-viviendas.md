# Rediseño del alta de viviendas — diseño para aprobar

> **APROBADO Y CONSTRUIDO** el 2026-09-16, en la rama
> `etapa-04-alta-de-viviendas`. El informe de lo construido, con lo que se
> desvió de aquí y por qué, está en
> [`etapas/ETAPA-04-alta-de-viviendas.md`](../../etapas/ETAPA-04-alta-de-viviendas.md).
>
> **Decisiones del usuario sobre este documento:**
>
> - **H-2, índice compuesto: sí.** Construido.
> - **H-3, control del alta individual: sí.** Construido, con dos respuestas
>   —rechazar al teclear, recortar al importar— por el motivo que explica el
>   informe §2.2.
> - **S-16, reparto de casas entre secciones:** distribución uniforme, **el
>   resto en la última**, editable después. Construido así.
> - **Baja masiva:** fuera de alcance, como se proponía. Queda como D-74.
>
> **Lo que se desvió, declarado:** el §4 de aquí proponía una clave de
> idempotencia en la confirmación. No se construyó: un segundo envío del mismo
> plan ya choca contra lo que el primero creó y se rechaza entero nombrándolo,
> que es más fuerte y no necesita almacenamiento. El informe lo explica en §8.
>
> Fecha: 2026-09-16

---

## 0 · Resumen en cinco líneas

1. La dirección sale de la vivienda y entra en la copropiedad. En Colombia la
   dirección es del conjunto; lo que cambia es la torre y el número.
2. La copropiedad gana un **tipo** (`apartamentos` · `casas` · `fincas` · `otro`)
   y **dos etiquetas** configurables. El tipo decide el formulario; las
   etiquetas deciden las palabras. Ninguna de las tres llega al motor de reglas.
3. El generador es una **función pura** del dominio. La vista previa y la
   confirmación llaman a la misma función, así que no pueden discrepar.
4. La unicidad la impone **el índice, no un `SELECT`** — pero el índice de hoy
   no sirve para apartamentos y hay que ensancharlo. Es el hallazgo H-2.
5. **Regenerar no existe.** Generar es aditivo y se niega entero ante la primera
   colisión. La operación peligrosa se elimina por diseño, no se advierte.

---

## 1 · Cinco hallazgos que condicionan el diseño

### H-1 · El diálogo de primera vez no puede crear la copropiedad

El encargo dice «al entrar por primera vez **sin copropiedad configurada**, un
diálogo pide sus datos». Con el repositorio delante, eso no puede ocurrir tal
cual: **nadie entra antes de que exista una copropiedad**.

- `roles_usuario.copropiedad_id` es `NOT NULL` (migración `0004`).
- El gancho de claims (`0024`) no emite `copropiedad_id` ni `rol` si no hay rol,
  y sin `rol` en el token la consola redirige a `/acceso`.
- La primera copropiedad la crea un operador con `scripts/registrar-copropiedad.mjs`
  antes de aprovisionar al primer usuario (`docs/guias/RECUPERACION_Y_USUARIOS.md` §B.3).

**Resolución propuesta:** el diálogo no crea el tenant, **completa su
configuración**. Se dispara por un estado real del servidor —`tipo IS NULL`—, no
por «es la primera sesión» ni por modo de compilación. Esa distinción es la
misma de D-67 y D-68: lo que depende del caso concreto no se decide por entorno.

Consecuencia agradable: si mañana Grupo Control da de alta la copropiedad
número 40 con el guion, su administrador ve el mismo diálogo el día que entra,
sin que nadie tenga que acordarse de configurarla.

### H-2 · El índice único de hoy no sirve para apartamentos

```
viviendas_identificador_uk  ON (copropiedad_id, identificador) WHERE estado='activo'
```

En un conjunto de apartamentos, la Torre 1 y la Torre 2 tienen **las dos** un 101. Con el índice actual, generar la segunda torre choca contra la primera en
el primer apartamento de cada piso, y ADR-04 —que es lo que hace correcta la
generación bajo concurrencia— trabajaría en nuestra contra.

Dos salidas:

| Salida                                                                      | A favor                                                                             | En contra                                                                                                                                                                             |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A · Meter la torre en el identificador** (`T1-101`)                       | Cero migración del índice                                                           | El dato se duplica: la torre vive en `agrupacion` **y** dentro de `identificador`. Renombrar la torre deja el identificador mintiendo, y la base no puede detectarlo                  |
| **B · Ensanchar el índice** a `(copropiedad_id, agrupacion, identificador)` | La identidad real de la vivienda **es** el par (torre, número); la base lo sostiene | Hay que tocar la resolución por identificador en tres sitios: repositorio, carga de padrón y buscador. Son cambios mecánicos y el compilador los guía porque el cliente está generado |

**Recomiendo B.** La duplicación de A no es un detalle estético: es un invariante
que ninguna capa puede garantizar, y esas son precisamente las que este proyecto
empuja a la base (ADR-04, ADR-05).

El índice pasa a ser, con la expresión para que los nulos no se escapen:

```sql
CREATE UNIQUE INDEX viviendas_identificador_uk
  ON public.viviendas (copropiedad_id, coalesce(agrupacion, ''), identificador)
  WHERE estado = 'activo';
```

`coalesce` hace falta porque en un índice único varios `NULL` **no chocan entre
sí**: sin él, una parcelación sin secciones podría tener dos «Casa 12» activas.

No es una reapertura de ADR-04: es la misma decisión —la integridad concurrente
la resuelve la base— aplicada a una clave que resultó ser compuesta.

### H-3 · La palabra no puede vivir dentro del dato

El encargo pregunta qué pasa con las viviendas existentes al cambiar el prefijo.
La respuesta depende de una decisión que se toma **ahora**: si el identificador
generado es `"Casa 42"`, la palabra está dentro de 300 filas y cambiarla es un
renombrado masivo. Si es `"42"` y «Casa» es una etiqueta de la copropiedad, el
cambio no toca ni una fila.

**Se guardan valores; las palabras se pintan.** Es exactamente el argumento de la
opción B de la propuesta de `agrupacion`, aplicado al segundo nivel. De ahí las
**dos** etiquetas: `etiqueta_vivienda` («Casa», «Apartamento», «Finca») y
`etiqueta_agrupacion` («Torre», «Sección», «Manzana»).

Control que lo sostiene: el alta individual **rechaza** un identificador que
empiece por la etiqueta vigente, con un mensaje que lo explica («escriba solo el
número: la palabra _Casa_ la pone el sistema»). Sin ese control, el primer
administrador que teclee «Casa 42» a mano reintroduce el problema y nadie se
entera hasta el día del cambio de prefijo.

### H-4 · Ningún requisito pide la generación, y ninguno la prohíbe

- **Requisitos:** HU-01…HU-06 cubren alta, edición, baja y carga desde archivo.
  Ninguna HU, RN, CU ni CA menciona generación en masa.
- **Mockups:** W-03 muestra una tabla de viviendas y una ficha «Casa 42 · Manzana B».
  No hay asistente de generación en ningún dibujo.
- **Glosario:** «Vivienda» se define sin subdivisión.

Es alcance nuevo y **aditivo**: no contradice ninguna resolución tomada. Lo digo
explícitamente porque §2.1.1 prohíbe adelantar trabajo no pedido, y este sí está
pedido — pero conviene que conste que sale del uso real, no del documento.

### H-5 · La dirección por vivienda no la pide nadie

Ni los requisitos ni los mockups. La tarjeta del mockup dice «Casa 42 · Manzana B»
y debajo «Urbanización Mira», que es el **nombre del conjunto**, no una calle.
Mover la dirección a la copropiedad no pierde ninguna trazabilidad comprometida.

---

## 2 · Cambios de esquema (migración `0029`)

Una sola migración, idempotente y reversible, con dos guardas que abortan antes
que perder un dato.

### 2.1 · `copropiedades` — cuatro columnas nuevas

```sql
ALTER TABLE public.copropiedades
  ADD COLUMN IF NOT EXISTS direccion            text NULL,
  ADD COLUMN IF NOT EXISTS tipo                 tipo_copropiedad NULL,
  ADD COLUMN IF NOT EXISTS etiqueta_vivienda    text NOT NULL DEFAULT 'Vivienda',
  ADD COLUMN IF NOT EXISTS etiqueta_agrupacion  text NOT NULL DEFAULT 'Torre o bloque';

ALTER TABLE public.copropiedades
  ADD CONSTRAINT copropiedades_direccion_len   CHECK (direccion IS NULL OR length(btrim(direccion)) BETWEEN 5 AND 200),
  ADD CONSTRAINT copropiedades_etiqueta_viv    CHECK (length(btrim(etiqueta_vivienda))   BETWEEN 1 AND 24),
  ADD CONSTRAINT copropiedades_etiqueta_agr    CHECK (length(btrim(etiqueta_agrupacion)) BETWEEN 1 AND 24);

CREATE TYPE public.tipo_copropiedad AS ENUM ('apartamentos', 'casas', 'fincas', 'otro');
```

**Por qué `tipo` es enumerado y las etiquetas son texto libre.** No es
incoherencia: son dos cosas distintas. El **tipo decide comportamiento** —qué
formulario se muestra, qué generador se ejecuta— y un valor que el código no
conoce no tendría formulario que mostrar. La **etiqueta solo decide una palabra**,
y un enumerado cerrado obliga a elegir mal al primer conjunto que use «manzana y
lote» a la vez (argumento ya aceptado en la propuesta de `agrupacion`).

**Por qué `tipo` admite `NULL`.** `NULL` **es** el estado «sin configurar», y es
lo que dispara el diálogo (H-1). Un valor por defecto fingido —`'otro'`— haría
indistinguible «todavía no me lo han dicho» de «me dijeron que es otro», y la
consola no sabría si preguntar.

**Por qué `direccion` admite `NULL` pero el formulario la exige.** La columna
nace después de la fila: la copropiedad de Grupo Control ya existe sin dirección
y un `NOT NULL DEFAULT ''` sería una cadena vacía haciéndose pasar por un dato.
El diálogo la pide obligatoria; el esquema admite el estado intermedio que la
realidad ya tiene.

### 2.2 · `viviendas` — un renombrado, un `DROP` guardado, un índice

```sql
ALTER TABLE public.viviendas RENAME COLUMN manzana TO agrupacion;
ALTER TABLE public.viviendas
  ADD CONSTRAINT viviendas_agrupacion_len
  CHECK (agrupacion IS NULL OR length(btrim(agrupacion)) BETWEEN 1 AND 24);

-- GUARDA: no se borra una columna con datos dentro. Si alguien cargó
-- direcciones por vivienda entre esta propuesta y su aplicación, la migración
-- se detiene y lo dice, en vez de perderlas en silencio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.viviendas WHERE direccion IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay viviendas con direccion propia: revise antes de retirar la columna';
  END IF;
END $$;

ALTER TABLE public.viviendas DROP COLUMN IF EXISTS direccion;

DROP INDEX IF EXISTS public.viviendas_identificador_uk;
CREATE UNIQUE INDEX viviendas_identificador_uk
  ON public.viviendas (copropiedad_id, coalesce(agrupacion, ''), identificador)
  WHERE estado = 'activo';
```

La segunda guarda no hace falta escribirla: `CREATE UNIQUE INDEX` **es** la
guarda. Si hubiera duplicados, falla y la migración se revierte entera.

### 2.3 · Auditoría

`0028` añadió `cambio_configuracion` a `tipo_evento_seguridad` con un argumento
que conviene respetar: no reutilizar un valor que significa otra cosa. Por eso:

- El diálogo de configuración inicial escribe `cambio_configuracion` —lo es—.
- La generación masiva escribe un valor nuevo, **`generacion_de_padron`**, con
  el plan completo en el detalle. Sin él, «¿quién creó estas 300 viviendas y con
  qué patrón?» se contesta leyendo 300 valores de `creado_por` iguales.

### 2.4 · ¿Implica migración de datos?

**Hoy no, y esa es toda la razón para hacerlo hoy.** Cero viviendas cargadas:

- El renombrado `manzana → agrupacion` es un cambio de catálogo, no reescribe filas.
- El `DROP COLUMN` no pierde nada y la guarda lo demuestra en tiempo de ejecución.
- El índice se reconstruye sobre una tabla vacía.
- `ADD COLUMN` con valor por defecto no reescribe la tabla desde PostgreSQL 11.

Con el padrón cargado, el mismo cambio pasa a exigir copia de valores,
verificación de que no se perdió ninguno y plan de vuelta atrás. La ventana se
cierra con la primera carga.

---

## 3 · El generador, como función pura del dominio

`packages/domain-core/src/padron/plan-de-viviendas.ts`

```
generarPlan(plan: PlanDeGeneracion): Resultado<readonly ViviendaProyectada[], ErrorDominio>
```

Pura, sin reloj, sin E/S, con **cota dura** (§2.4: nunca recursión ni bucle sobre
entrada no acotada del usuario).

**La vista previa y la confirmación llaman a esta misma función.** No es una
comodidad: es la única forma de que lo que el usuario vio y lo que se crea no
puedan separarse. Es el mismo argumento por el que `Documento.normalizarNumero`
es público — la consulta y la escritura pasan por el mismo sitio o divergen.

### 3.1 · Apartamentos

Entrada: cuántas torres · identificador por letras (`A, B, C…`) o por números
(`1, 2, 3…`) · cuántos pisos · cuántos apartamentos por piso · excepciones.

Numeración: **`piso × 100 + n`**, con `n` desde 1.
Con 3 por piso y 5 pisos: `101 102 103 201 202 203 … 503`.
Con 11 por piso: `101 … 111`. Con 10 pisos, el piso 10 da `1001 … 1011`.

Cotas: torres 1–26 con letras (más allá de la Z se pide numerar; inventar `AA`
sería una regla que nadie espera) · torres 1–99 con números · pisos 1–50 ·
apartamentos por piso 1–99 · **2 000 viviendas por operación**.

**Excepciones por torre** —el caso que el encargo señala como el real: las
urbanizaciones crecen con torres desiguales—. Cada excepción da torre, pisos y
apartamentos por piso; las torres sin excepción usan los valores generales.

Se rechazan con mensaje concreto, nunca en silencio:

| Caso                                  | Mensaje                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Excepción sobre una torre inexistente | «La torre 7 no existe: hay 5 torres, de la 1 a la 5»                    |
| Dos excepciones para la misma torre   | «La torre B aparece dos veces en las excepciones»                       |
| Excepción con 0 pisos o 0 por piso    | «Una torre con 0 pisos no es una excepción: es una torre que no existe» |
| El total supera la cota               | «El plan genera 3 400 viviendas y el máximo por operación es 2 000»     |

### 3.2 · Casas

Entrada: cuántas secciones (numérico; `0` = sin agrupación) · cuántas casas **en
total** · casilla «reiniciar la numeración en cada sección».

`etiqueta_agrupacion` la elige el usuario entre «Sección» y «Sector» —o escribe
la suya, que para eso es texto libre—.

> **[SUPUESTO] S-16 · a confirmar.** «Cuántas casas en total» con 3 secciones se
> reparte **por igual, y el resto a las primeras secciones**: 62 casas en 3
> secciones dan 21 · 21 · 20. La otra lectura —62 _por_ sección— daría 186, y la
> vista previa lo enseña antes de confirmar, así que la ambigüedad no llega a
> producir daño. Si prefiere pedir el número por sección, es un campo más y lo
> cambio.

Numeración corrida por defecto (`1…62`), que hace el identificador único incluso
sin sección; con la casilla marcada, `1…21` en cada una, y entonces la sección
forma parte de la identidad — que es justo lo que el índice de H-2 sostiene.

Con `0` secciones: `agrupacion = NULL` e identificadores `1…N`, que la consola
pinta como «Casa 1 … Casa N».

### 3.3 · Fincas

Cuántas. `agrupacion = NULL`, identificadores `1…N`, se pintan «Finca 1 … Finca N».

### 3.4 · Otro

**Sin generador.** Alta individual e importación, nada más. Es el comportamiento
conservador de §2.1.4: ante un tipo del que no sabemos la forma, no inventamos
un patrón de numeración.

---

## 4 · Unicidad al generar en masa, sin `SELECT` previo

Tres piezas, y la tercera es la única que garantiza algo.

**1 · La vista previa lee, y lo hace para informar.** Consulta qué
identificadores del plan ya existen y los enseña. Esa lectura **puede quedar
obsoleta** entre la previsualización y la confirmación —otro administrador
crea una vivienda suelta en ese minuto—, y por eso no es la garantía.

**2 · La confirmación escribe en una sola sentencia**, dentro de una
transacción, sin leer nada antes:

```sql
INSERT INTO public.viviendas (copropiedad_id, agrupacion, identificador, creado_por, actualizado_por)
SELECT $1, f.agrupacion, f.identificador, $2, $2
  FROM unnest($3::text[], $4::text[]) AS f(agrupacion, identificador)
ON CONFLICT (copropiedad_id, coalesce(agrupacion, ''), identificador) WHERE estado = 'activo'
DO NOTHING
RETURNING agrupacion, identificador;
```

**3 · El recuento decide.** Si `RETURNING` devuelve menos filas de las pedidas,
alguna colisionó: la diferencia entre lo pedido y lo devuelto **es la lista
exacta de colisiones**, y la transacción se revierte entera. El operador recibe
todas las que chocaron, no la primera; y no queda media generación aplicada.

Esto es ADR-04 tal cual: la restricción la impone el índice, bajo concurrencia,
con dos administradores generando a la vez. El `SELECT` de la vista previa es
cortesía de interfaz, igual que la validación de cliente (§2.7.3).

**Dos controles más en la ruta:**

- **Clave de idempotencia** en la petición de confirmación. Un doble clic o un
  reintento de red no crean 600 viviendas. Reutiliza la política de idempotencia
  de la ETAPA 02.
- **`totalEsperado`**: el cuerpo lleva el total que la vista previa mostró. Si el
  servidor recalcula el plan y le sale otro número, responde 409 y no crea nada.
  Cierra la ventana en que el formulario cambió después de previsualizar, sin
  pedirle al usuario que teclee una confirmación.

---

## 5 · La vista previa

Se pide antes de confirmar y muestra, por grupo:

```
Torre A · 15 viviendas     101, 102 … 502, 503
Torre B · 15 viviendas     101, 102 … 502, 503
Torre C ·  9 viviendas     101, 102 … 302, 303      (excepción: 3 pisos, 3 por piso)

Total: 39 viviendas en 3 torres
Ya existen y bloquean la operación:  Torre A · 101
```

Las **dos primeras y las dos últimas** de cada grupo, el recuento por grupo y el
total. Ver las 300 no ayuda; ver que la Torre C acaba en 303 y no en 503 es
exactamente lo que detecta un patrón mal puesto.

Si hay colisiones, el botón de confirmar queda deshabilitado y se nombran todas.

---

## 6 · La operación peligrosa: regenerar sobre un padrón con residentes

**No existe.** Y no por una advertencia, sino porque no hay ningún camino que la
ejecute:

1. La generación **solo inserta**. No hay `UPDATE` ni `DELETE` en la ruta.
2. `ON CONFLICT DO NOTHING` + reversión ante cualquier colisión significa que si
   una sola de las viviendas generadas ya existe activa, **no se crea ninguna**.
   Generar otra vez el mismo plan sobre el mismo conjunto no es destructivo: es
   un rechazo con la lista de lo que ya estaba.
3. El borrado físico está prohibido por disparador desde la migración `0013`
   (RN-19, CA-02): ni siquiera una ruta equivocada podría borrar la vivienda de
   un residente.

Así, «añadir la Torre 6 que construyeron el año pasado» funciona —esos
identificadores son nuevos— y «regenerar todo el conjunto» se niega solo.

**Lo que sí queda pendiente y digo ahora:** si alguien quiere de verdad sustituir
un padrón mal generado, hoy tiene que desactivar vivienda por vivienda, cada una
con su motivo (RN-19). Con 300 es inviable a mano. Una **baja masiva** es la
pieza que falta, y la dejo **fuera de este alcance** a propósito: es la operación
que sí destruye trabajo y merece su propio diseño —motivo obligatorio, recuento
de residentes y autorizaciones vigentes que arrastra, confirmación escrita—. Si
la quiere dentro, dígamelo y la diseño antes de construir.

---

## 7 · Las dos preguntas

### 7.1 · ¿El tipo de copropiedad puede cambiar después? ¿Qué pasa con las viviendas ya creadas?

**Sí, y no les pasa nada** — porque el diseño se hace para que no les pase.

`tipo` se lee **exactamente en dos sitios**: el formulario de generación y el
valor sugerido de las dos etiquetas. **No lo lee el motor de reglas, ni el
repositorio del padrón, ni ninguna consulta de eventos.** Ninguna vivienda
guarda el tipo. Cambiarlo de `casas` a `apartamentos` deja las 300 filas
intactas y cambia el formulario de la próxima generación.

Ese aislamiento es una condición del diseño, no una observación: si mañana algo
del dominio empezara a ramificar por `tipo`, la respuesta a esta pregunta
cambiaría. Propongo dejarlo escrito como invariante y ponerle control —el mismo
analizador de fronteras que ya corre en CI puede exigir que `tipo` no aparezca
en `domain-core` ni en el motor de reglas—.

Condiciones: lo cambian administrador y superadministrador, queda en
`auditoria_seguridad` como `cambio_configuracion`, y el diálogo avisa de lo
único que cambia de verdad («las viviendas ya creadas conservan su identificador;
esto decide el formulario de alta y las palabras»).

### 7.2 · Al cambiar el prefijo, ¿se renombran las viviendas, se conservan o se bloquea?

**Se conservan, y no hay nada que renombrar: el prefijo nunca estuvo en los
datos.** Es la consecuencia de H-3. «Casa», «Apartamento», «Torre», «Manzana»
son etiquetas de la copropiedad que se pintan al mostrar. Cambiar
`etiqueta_vivienda` de «Casa» a «Apartamento» repinta el directorio, el buscador,
la ficha del residente y los informes, y no toca una sola fila.

Ni renombrado (que rompería los identificadores que la gente ya tiene en la
puerta y en la boca) ni bloqueo (que sería arbitrario para un cambio que no
cuesta nada).

**Con una excepción honesta:** si alguien tecleó la palabra dentro del
identificador en el alta individual, esa vivienda **sí** se queda diciendo «Casa
42» cuando el conjunto ya dice «Apartamento». Por eso el control de H-3 —rechazar
un identificador que empieza por la etiqueta vigente— no es una cortesía de
interfaz: es lo que mantiene cierta la respuesta a esta pregunta.

---

## 8 · Después de generar

**Todo editable.** El identificador de cada vivienda se edita individualmente
—es como se llega a los prefijos propios que menciona el encargo, `1011`, `1112`,
`1023`—. La edición pasa por el mismo índice único: dos viviendas activas no
pueden acabar con el mismo par (agrupación, identificador) ni a mano.

**Vista en lista desplegable agrupada.** Un acordeón vertical por agrupación, con
el recuento en la cabecera y un **`+`** en cada grupo que pide **solo el número**
—la agrupación la pone el grupo donde se pulsó, y así el alta suelta no puede
equivocarse de torre—. Los grupos vienen cerrados salvo que haya uno solo.
Estados vacío, cargando, error, sin permiso y sin conexión, como toda vista
(ETAPA 09).

---

## 9 · Importación y exportación

### 9.1 · Columnas — las del archivo que el administrador ya tiene

`identificador` · `agrupacion` · `documento` · `tipo_documento` · `nombre` ·
`placa` · `es_titular`

Ni un identificador interno, que es la corrección D-72 recién hecha en la hoja de
padrón y que no se reintroduce aquí. Se siguen aceptando `vivienda`,
`vivienda_id` y `persona_id` como sinónimos **opcionales**, para quien exporta
del sistema y recarga sin traducir nada.

`agrupacion` es columna nueva y es consecuencia directa de H-2: con la identidad
compuesta, una hoja de apartamentos sin torre es ambigua. Si la copropiedad no
usa agrupación, la columna sobra y su ausencia no es error.

### 9.2 · Importación

Reutiliza **sin cambios** lo que ya está construido y verificado en 09-B:
validación por **tipo real** —un `.xlsx` empieza por `PK\x03\x04`—, cotas contra
bomba de descompresión, rechazo de `DOCTYPE`/`ENTITY`, y **carga transaccional de
todo o nada** con el informe de errores fila a fila. Lo único que cambia es el
mapeo de columnas, que vive en un solo sitio (`filaDesdeCeldas`) precisamente
para que CSV y XLSX no acepten cabeceras distintas.

### 9.3 · Exportación

**CSV, y solo CSV.** Escribir XLSX significa escribir un generador de ZIP y XML;
Excel abre CSV desde el menú Archivo sin ninguna ventaja perdida. Con dos
detalles que deciden si el archivo sirve:

- **BOM UTF-8 al principio.** Sin él, Excel en Windows abre «Peña» como «PeÃ±a» y
  el administrador concluye que el sistema corrompe los nombres.
- **Tope de filas declarado en la respuesta**, con la lección de D-33: si se
  trunca, se dice en el archivo y en la pantalla, no se entrega un archivo corto
  que parece completo.

El archivo exportado vuelve a importarse tal cual: es el ciclo
exportar → editar en Excel → importar, que es como se corrige un padrón de 300
filas en la práctica.

---

## 10 · Superficies que cambian

| Capa                | Qué cambia                                                                                                                                                                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Migración**       | `0029`: renombrado, cuatro columnas, `DROP` guardado, índice compuesto, valor de enumerado de auditoría                                                                                                                                       |
| **Dominio**         | `plan-de-viviendas.ts`: el plan, la proyección y `generarPlan` puro con sus cotas                                                                                                                                                             |
| **Aplicación**      | `GenerarViviendas` (previsualizar / confirmar, con idempotencia) · `ConfigurarCopropiedad` gana dirección, tipo y etiquetas · `CargarPadron` resuelve la vivienda por el par                                                                  |
| **Puertos**         | `AltaVivienda`: `manzana → agrupacion`, fuera `direccion` · `buscarViviendaPorIdentificador` pasa a recibir la agrupación · nuevo `generarViviendas(plan)`                                                                                    |
| **Presentación**    | `POST /copropiedades/{id}/viviendas/generacion/previsualizacion` y `…/generacion` · `GET …/padron/exportacion` · límite endurecido (§2.7.5) en la ruta que genera                                                                             |
| **Consola**         | Diálogo de configuración inicial · asistente de generación con excepciones y vista previa · directorio en acordeón con `+` por grupo · importar/exportar · las etiquetas sustituyen a «Manzana» en formulario, tabla, buscador global y ficha |
| **Contrato**        | Regenerado desde NestJS; el compilador guía el renombrado por las cuatro superficies                                                                                                                                                          |
| **Seeds y pruebas** | Renombrado del campo; la copropiedad de ejemplo estrena tipo, dirección y etiquetas                                                                                                                                                           |

**Quién puede:** generar, configurar y exportar → administrador y
superadministrador. El portero no genera padrón, igual que no bloquea accesos (H-3
de la validación en sitio). La API lo decide y responde 422/403; la consola solo
oculta.

**Esfuerzo estimado: 4,5 – 5,5 jornadas.** Migración 0,3 · dominio con pruebas
0,75 · aplicación y API 1,25 · consola 1,75 · carga y exportación 0,6 · rastro
documental e informe 0,4.

---

## 11 · Trazabilidad

HU-01, HU-02, HU-03 · CA-01, CA-02, CA-03 · CP-01 · KPI-01 … KPI-05 ·
RN-04 (placa única, intacta) · RN-13 · RN-15 · RN-19 (baja lógica: la generación
no borra nada) · ADR-04 (extendido a clave compuesta, no reabierto) ·
§2.7.3 (el DTO valida forma, el agregado valida verdad) · §2.7.4 (saneamiento
de todo texto) · §2.7.5 (límite endurecido en la ruta de generación) ·
§2.7.8 (tipo real en la importación).

---

## 12 · Lo que decide usted antes de que escriba una línea

1. **H-2 · ¿Opción B, índice compuesto?** Es el único cambio con consecuencias
   más allá de esta pantalla, y el que recomiendo.
2. **S-16 · «cuántas casas en total»**: ¿reparto por igual entre secciones, o
   prefiere que el formulario pida el número por sección?
3. **Baja masiva**: ¿dentro del alcance o en su propio diseño? Yo la dejaría
   fuera, por lo dicho en §6.
4. El resto —dirección en la copropiedad, tipo enumerado, etiquetas como texto,
   generador puro, vista previa, importación y exportación por columnas del
   administrador— va como está descrito salvo que corrija algo.
