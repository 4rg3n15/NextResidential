# Verificación contra su proyecto Supabase real

**Para quién es.** Para usted, ejecutándolo en su equipo, con sus credenciales. Yo no las tengo y no las quiero: esta ronda se cerró en un contenedor sin ningún `.env`, así que **todo lo que sigue está sin ejercer contra su proyecto**. Lo que sí está ejercido, y contra procesos reales, se dice en cada paso.

**Cómo leerla.** Cada punto trae el comando, **la salida exacta que debe ver**, y qué significa si ve otra cosa. Si un paso falla, deténgase ahí: los siguientes dependen de él.

**Regla que gobierna todo el documento:** ningún comando de aquí imprime un valor secreto. Si alguna vez le pido que pegue una salida, puede pegarla tal cual.

---

## 0 · Antes de empezar

```bash
node --version   # v22.22.2 (lo fija .nvmrc)
pnpm --version   # 9.x
pnpm install --frozen-lockfile
```

---

## 1 · La URL del JWKS — el bloqueante que dejaba fuera a todo el mundo

Este es el primero porque **todo lo demás se mide contra él**. Sustituya `<ref>` por el identificador de su proyecto.

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://<ref>.supabase.co/auth/v1/.well-known/jwks.json"
```

**Esperado: `200`.**

Si ve `404`, ha copiado la ruta antigua. La ruta correcta termina en `/.well-known/jwks.json`; `https://<ref>.supabase.co/auth/v1/jwks` **no existe** y es exactamente lo que estaba escrito en las guías y en los `.env.example` hasta esta ronda.

Y el contenido importa tanto como el código:

```bash
curl -s "https://<ref>.supabase.co/auth/v1/.well-known/jwks.json"
```

**Esperado: un objeto con al menos una clave dentro de `keys`.**

Si ve **`{"keys":[]}`** el endpoint está vivo pero su proyecto **no tiene llaves asimétricas habilitadas**, y no podrá verificarse ni un token. Es el caso más engañoso de los dos —hay endpoint, hay JSON válido, y no funciona nada— y hasta esta ronda la sonda de la API lo daba por bueno. Se arregla en **Panel → Project Settings → JWT Keys**, migrando a llave asimétrica. No siga sin esto.

---

## 2 · Su `.env` comparado con lo que el código espera

```bash
pnpm entorno:diff
```

**Esperado:** `✓ 0 problema(s), 0 aviso(s).`

Lo que le va a señalar, y qué hacer con cada cosa:

| Lo que ve                                    | Qué significa                                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `✗ faltan N: …`                              | Variables que el `.env.example` declara y su `.env` no tiene. Cópielas                                                                              |
| `✗ X: su valor contiene «Y=» pegado`         | **Su `.env` no termina en salto de línea.** `X` está corrupta e `Y` nunca llegó a existir. Es el defecto que le ocurrió con `INGESTA_FIRMA_SECRETO` |
| `⚠ no están en el .example (¿errata?)`      | Una variable que el código no lee. Suele ser un nombre mal escrito, o una línea muerta como `MFA_OBLIGATORIO`                                       |
| `⚠ el fichero no termina en salto de línea` | Todavía no ha roto nada, pero lo hará con la próxima variable que añada                                                                             |

El comando **no imprime ningún valor**, solo nombres.

Añada al `.env` de la API las dos variables nuevas de esta ronda, **ambas opcionales**:

```
EVIDENCIA_BUCKET=            # nombre del bucket privado de evidencia, si ya lo creó
RECUPERACION_URL_REDIRECCION=  # a dónde vuelve el enlace del correo de recuperación
```

---

## 3 · El arranque de la API le dice qué recursos externos están rotos

```bash
pnpm --filter @ncr/api build
node apps/api/dist/main.js
```

**Esperado**, entre las primeras líneas del registro:

```
{"nivel":"info","mensaje":"API arrancada",…}
{"nivel":"info","mensaje":"recurso externo OK: JWKS de Supabase Auth","contexto":{"detalle":"N clave(s) pública(s) descargada(s)"}}
{"nivel":"info","mensaje":"recurso externo OK: PostgreSQL (pooler)",…}
```

Cada recurso roto sale con **nivel `error`**, su nombre y un **remedio**. Los que puede ver:

| Línea                                                               | Qué hacer                                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `ROTO: JWKS … no se pudo descargar el documento`                    | Vuelva al punto 1: la URL                                                                 |
| `ROTO: JWKS … responde 200 pero el documento no trae ninguna clave` | Panel → JWT Keys: migre a llave asimétrica                                                |
| `ROTO: PostgreSQL (pooler)`                                         | Revise `DATABASE_POOLER_URL` y que el proyecto esté activo                                |
| `ROTO: bucket … es PÚBLICO`                                         | Panel → Storage → desmarque «Public bucket». **Es evidencia de accesos: RN-21**           |
| `ROTO: bucket «X» no existe`                                        | Créelo, privado                                                                           |
| `SIN-CONFIGURAR: bucket`                                            | No ha declarado `EVIDENCIA_BUCKET`. La evidencia vive en memoria y se pierde al reiniciar |
| `SIN-CONFIGURAR: recuperación de contraseña`                        | Esperado hoy: ver el punto 7                                                              |

Si la aplicación **no arranca**, el mensaje nombra la variable y el motivo. Un secreto con espacios o con otra variable pegada ya no pasa: antes arrancaba con el valor corrupto.

---

## 4 · `/ready` — que ahora sí sonda las tres

```bash
curl -s http://localhost:3000/ready | jq .
```

**Esperado:**

```json
{ "estado": "listo", "dependencias": { "configuracion": "ok", "jwks": "ok", "postgres": "ok" } }
```

Si algo falla, responde **503** y **nombra cuál**, con estados distinguibles a propósito:

| Estado                        | Dónde se arregla                            |
| ----------------------------- | ------------------------------------------- |
| `"jwks": "inalcanzable"`      | En el entorno: la URL                       |
| `"jwks": "sin-claves"`        | En el panel: llaves asimétricas             |
| `"postgres": "no-disponible"` | La cadena del pooler, o el proyecto pausado |

**Ejercido aquí:** las tres sondas se vieron ponerse en rojo contra procesos reales. `postgres` era una cadena fija —`no-conectado-etapa-04`— y `/ready` respondía 200 sin tocar la base.

---

## 5 · El ciclo del segundo factor, desde cero

Su cuenta tiene un factor a medio verificar de los intentos fallidos. **Retírelo primero**, o la consola le pedirá el código en vez de ofrecerle el QR —y eso no es un defecto, es que ya tiene factor.

1. Panel → **Authentication → Users** → su usuario → **Remove MFA factors**.
2. Levante la API (punto 3) y la consola:
   ```bash
   pnpm --filter @ncr/web build && pnpm --filter @ncr/web start
   ```
3. Abra `/acceso` y entre con su correo y contraseña.

**Esperado, en este orden:**

| Paso                                   | Lo que debe ver                                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Tras la contraseña                     | La pantalla **«Configura tu segundo factor»**, con un **QR pintado** y la clave en texto para quien no pueda escanear |
| Tras escanear y escribir los 6 dígitos | **Diez códigos de recuperación**. Guárdelos: son de un solo uso                                                       |
| Tras confirmar                         | El **tablero**, sin ningún cartel de error                                                                            |
| Al volver a entrar                     | La pantalla **«Verificación en dos pasos»** —verificar, no inscribir— y el tablero                                    |

**Si el código correcto le devuelve al login**, es que la API rechaza el token. Mire el registro de la API: ahora el motivo se nombra. Si dice `JWKS_NO_DISPONIBLE` con nivel `error`, vuelva al punto 1 — y eso, casi con seguridad, era lo que pasaba antes: se registraba como `FIRMA_INVALIDA` y mandaba a buscar una firma rota que nunca existió.

**Ejercido aquí:** el ciclo entero, en Chromium, contra la API real y la consola compilada, con un doble de GoTrue con la semántica del proveedor. **No** contra su proyecto: eso es este paso.

---

## 6 · Que el interruptor de MFA ya no exista

```bash
grep -rn "MFA_OBLIGATORIO" apps/api/src apps/web/src --include=*.ts --include=*.tsx | grep -v test
```

**Esperado:** solo comentarios que **cuentan que se retiró**, ninguna lectura de la variable.

Y la comprobación que importa, con la variable puesta a propósito:

```bash
MFA_OBLIGATORIO=false node apps/api/dist/main.js
```

**Esperado:** la API arranca **sin ninguna línea sobre el segundo factor**, y un rol administrativo con `aal1` sigue recibiendo `401`. Antes, esa variable escribía `SEGUNDO FACTOR DESACTIVADO` al arrancar y dejaba pasar.

---

## 7 · Recuperación de contraseña — **bloqueo de entorno, no deuda de código**

Usted no tiene permisos para configurar SMTP ni las URLs de redirección en el panel, y está en gestión. El ciclo **está construido**: pantalla de solicitud, respuesta uniforme que no revela si el correo existe, canje por `token_hash` —no por fragmento, para que el token llegue al servidor—, y política de contraseña.

**Queda SIN VERIFICAR**, y el código lo dice en voz alta en vez de dar un verde: la comprobación de arranque de la recuperación **nunca** informa `ok`. Como mucho informa que la mitad que sí es nuestra está bien:

```
SIN-CONFIGURAR: recuperación de contraseña (SMTP y redirección) —
  la redirección apunta a https://… , que sí es un origen admitido.
  El SMTP y la plantilla viven en el panel de Supabase y NO son observables
  desde la API: este ciclo queda SIN VERIFICAR
```

**Cuando le den los permisos**, el ejercicio de punta a punta es: declarar `RECUPERACION_URL_REDIRECCION`, añadir ese mismo origen en Panel → **Authentication → URL Configuration → Redirect URLs**, pedir un enlace desde `/acceso/recuperacion`, recibirlo, y canjearlo. Un enlace ya usado debe responder «ya se usó o caducó»: son de un solo uso.

---

## 8 · La consola en el navegador

Con la consola **compilada** (`build` + `start`, no `dev`), abra la consola del navegador en `/acceso` y en `/tablero`.

**Esperado: cero errores.** En particular, **ninguna** violación de CSP.

> **Sobre las tres violaciones que usted vio.** Eran de `next dev`, no del producto: el cargador de CSS de desarrollo inyecta etiquetas `<style>` sin conocer nuestro nonce. Se sitúan en `webpack-internal`, comprobado con el evento `securitypolicyviolation`. En la consola compilada no aparecen. Se relajó `style-src-elem` **solo en desarrollo**, y no `style-src`: los atributos `style="…"` siguen bloqueados también en desarrollo, y menos mal — ese control es el que destapó que **nuestros propios gráficos** los emitían y salían a cero en producción.

Si tiene datos en el tablero, las barras del histograma y del gráfico semanal deben **verse**. Si salieran todas a cero, es el defecto D-63 y no está corregido en lo que esté ejecutando.

---

## 9 · La verificación completa del contrato

```bash
./scripts/verificar-etapa.sh
```

Es la de §2.8.0 y tarda. Con `--con-base` añade los pasos que necesitan PostgreSQL, que son los que **yo no pude ejecutar**: esquema, aislamiento, arranque en frío, KPI-03 e inmutabilidad de un evento real.

```bash
./scripts/verificar-etapa.sh --con-base
```

Esa corrida, contra su base, es la que cierra lo que aquí queda declarado como no ejercido.

---

## 10 · Las cuatro que deben quedar al 100 % antes de lanzar la ETAPA 10

Cuatro comprobaciones, cada una con **el comando y la salida esperada**. Están
pensadas para ejecutarse en su equipo, contra su proyecto, y ninguna necesita
que yo esté delante.

Las cuatro comparten un criterio: **verifican el hecho, no la configuración**.
Un panel que muestra el bucket como privado, un módulo que declara un `Pool`,
una consola que responde 200 — nada de eso demuestra lo que parece demostrar.

---

### 10.1 · Bucket de evidencia, verificado por ejercicio

```bash
SUPABASE_URL=https://<su-proyecto>.supabase.co \
SUPABASE_SECRET_KEY=sb_secret_… \
EVIDENCIA_BUCKET=evidencias \
  node scripts/verificar-bucket-evidencia.mjs
```

**Esperado** — las seis líneas, todas con `✓`:

```
Bucket de evidencia «evidencias»

  ✓ el bucket existe y se declara privado
  ✓ tipos permitidos: image/jpeg, image/png
  ✓ sonda subida con la llave secreta (PNG de 70 bytes)
  ✓ un GET sin firmar sobre un objeto que EXISTE responde 400
  ✓ con URL firmada de 60 s, el objeto se lee byte a byte igual que se subió
  ✓ sonda borrada

✓ bucket privado verificado por ejercicio: escribe con llave, niega sin firma, sirve con firma.
```

**Lo único inaceptable** en la cuarta línea es `200`: significaría que hay una
política sobre `storage.objects` concediendo `SELECT` a `anon`. `400`, `401` y
`403` son todos correctos según la versión de Storage.

Código de salida `0` en verde, `1` si algo falla. Sirve para CI.

---

### 10.2 · Evidencia y listas negras **sobreviven a un reinicio**

Esta es la que importa para la portería, y se comprueba **reiniciando de
verdad**. No hay atajo: un adaptador que persiste y uno que no responden igual
mientras el proceso siga vivo.

**Paso 1 — arranque la API con el bucket declarado y lea la primera línea:**

```bash
grep -E 'evidencia|bucket' <(node apps/api/dist/main.js 2>&1 | head -40)
```

**Esperado**, con `EVIDENCIA_BUCKET` puesta:

```
{"nivel":"info","mensaje":"recurso externo OK: bucket privado de evidencia",…}
```

**Y NO debe aparecer** esta línea, que es la del adaptador de memoria:

```
{"nivel":"aviso","mensaje":"evidencia EN MEMORIA: se pierde al reiniciar el proceso",…}
```

Si la ve, `EVIDENCIA_BUCKET` no está llegando al proceso: la evidencia se está
guardando en un `Map` y desaparecerá al reiniciar.

**Paso 2 — la lista negra, contra su base.** Cree una entrada, reinicie la API y
compruebe que sigue ahí:

```bash
psql "$DATABASE_URL" -c "
  INSERT INTO public.listas_negras
    (copropiedad_id, placa, motivo, creado_por, actualizado_por)
  SELECT c.id, 'PRUEBA1', 'sonda de persistencia', u.id, u.id
    FROM public.copropiedades c, public.usuarios u
   WHERE c.estado = 'activa' LIMIT 1
  RETURNING id;"
```

Reinicie la API y pregunte por ella:

```bash
psql "$DATABASE_URL" -c "
  SELECT placa, estado FROM public.listas_negras WHERE placa = 'PRUEBA1';"
```

**Esperado:**

```
  placa  | estado
---------+--------
 PRUEBA1 | activa
```

**Lo que esto demuestra y lo que no.** Demuestra que la fila persiste y que el
adaptador la lee. Lo que **no** puede demostrar sin la consola de portería —que
es la ETAPA 10— es que el portero la vea en pantalla. Lo que sí puede
comprobar hoy: que el motor de reglas la consulta. Con la placa vetada, un
evento de ingesta con esa placa tiene que salir denegado **con motivo
`LISTA_NEGRA`** y no con `FALLO_TECNICO`.

Cuando termine, borre la sonda:

```bash
psql "$DATABASE_URL" -c "DELETE FROM public.listas_negras WHERE placa = 'PRUEBA1';"
```

---

### 10.3 · Un solo `Pool` de PostgreSQL

```bash
node scripts/lib/frontera-modulos.mjs
```

**Esperado:**

```
OK frontera-modulos: 7 módulos (autenticacion, autorizaciones, biometria, eventos, padron, tablero, zonas), ninguna importación entra por dentro y un solo Pool de PostgreSQL (D-66)
```

Si alguien vuelve a abrir uno en un módulo, la salida nombra el fichero y el
código de salida es `1`, así que rompe la construcción:

```
FALLO frontera-modulos: 1 fichero(s) abren su propio Pool de PostgreSQL (D-66)
   apps/api/src/padron/algo.ts: usa el Pool global de `PoolModule`, que es @Global
```

**Contra su base**, además, puede ver el número real de conexiones que abre el
proceso. Con la API arrancada y en reposo:

```bash
psql "$DATABASE_URL" -c "
  SELECT count(*) AS conexiones
    FROM pg_stat_activity
   WHERE application_name <> '' AND datname = current_database();"
```

Antes de D-66 el tope era **35** —20 + 10 + 5, tres pools que no se conocían—.
Ahora el tope es uno solo, `PG_POOL_MAX`, que por defecto vale **20**. La sonda
de arranque conserva su conexión aparte a propósito: tiene que poder responder
`/ready` justo cuando el pool principal está saturado.

---

### 10.4 · La consola es usable **por cualquier origen**

Este es D-67, y es el que más fácil pasa desapercibido: por `localhost`
funcionaba.

**Comprobación rápida, con `curl`.** Sirva la consola compilada y pida la
cabecera por la IP de red:

```bash
curl -s -D- -o /dev/null http://<su-ip-de-red>:3100/acceso | grep -i upgrade-insecure
```

**Esperado: ninguna salida.** La directiva no debe estar cuando la página se
sirve por HTTP plano.

Y detrás de un proxy con HTTPS, **sí** debe estar:

```bash
curl -s -D- -o /dev/null -H 'x-forwarded-proto: https' \
  http://<su-ip-de-red>:3100/acceso | grep -io upgrade-insecure-requests
```

**Esperado:**

```
upgrade-insecure-requests
```

**Comprobación de verdad, con el navegador.** Abra
`http://<su-ip-de-red>:3100/acceso` y mire que **la pantalla se vea**: panel
oscuro a la izquierda, botón rojo, tipografía aplicada. En DevTools → Network no
debe haber ni una petición a `https://<su-ip>:3100/...`.

Y lo mismo, automatizado y sin que usted mire:

```bash
node e2e/camino-de-acceso.mjs
```

**Esperado**, en el paso 3.bis:

```
▸ 3.bis · la consola se ve, y por cualquier origen (D-67)
   ✓ por bucle local la hoja de estilos se aplica (397 reglas)
   ✓ por bucle local el fondo es el token lienzo y no el del navegador (rgb(248, 249, 250))
   ✓ por bucle local ningún subrecurso se cae
   ✓ por IP de red la hoja de estilos se aplica (397 reglas)
   ✓ por IP de red el fondo es el token lienzo y no el del navegador (rgb(248, 249, 250))
   ✓ por IP de red ningún subrecurso se cae
   ✓ ejercido también por 192.168.1.22, que es el origen donde falla si la CSP se ata al proceso
```

El número de reglas variará con el CSS; lo que no puede variar es que sea **> 0**
y que el fondo sea `rgb(248, 249, 250)` —el token `lienzo`— y no
`rgba(0, 0, 0, 0)`, que es lo que devuelve un `body` sin estilos.

Si su equipo no tiene ninguna IPv4 externa, el paso **lo dice** en vez de pasar
en verde:

```
   ✗ no hay ninguna IPv4 no interna: la mitad de este paso NO se ejerció
```

---

## 11 · Dar de alta el padrón sin escribir un solo identificador (D-72)

Es lo que bloqueaba todo lo demás: sin viviendas y sin personas no se puede
probar ni una autorización. Dos caminos, y los dos se recorren desde la consola.

> **Actualizado el 2026-09-16 con el rediseño del alta.** Las columnas de la
> hoja y el formulario cambiaron: ahora se escribe **solo el número** y la
> palabra la pone la copropiedad. Lo de aquí abajo ya refleja ese cambio; el
> paso a paso completo del alta nueva está en el **§12**.

### 11.1 · A mano, vivienda a vivienda

1. **Viviendas → Nueva vivienda.** Se escribe **el número** —«42», «101»— y, si
   el conjunto agrupa, la torre o manzana en su campo. La palabra «Casa» la pone
   el sistema. No hay ningún campo con forma de identificador interno.
2. **Visitantes → Nueva autorización.** En «Persona que visita» escriba un
   nombre o una cédula. Con dos caracteres empieza a buscar; los resultados
   dicen además de qué vivienda es residente cada quien, para que dos homónimos
   no sean la misma línea.
3. Si la persona no aparece, la última opción de la lista es **«Registrar a
   «…» como persona nueva»**. Pide tipo de documento, número y nombre, y vuelve
   al formulario con la persona ya elegida.

**Lo que debe ver si registra un documento que ya existía:**

```
Ese documento ya estaba registrado como «Ana María Pérez». Se usa esa persona:
el documento es la identidad.
```

No es un error: el documento **es** la identidad (RN-06). Crear una segunda
persona con la misma cédula sería justo la fuga que la lista negra no admite.

**Y la vigencia:** ponga «Hasta» antes que «Desde» a propósito. Debajo del
campo debe aparecer, **antes de enviar nada**:

```
La vigencia termina antes de empezar. Revisa a. m. y p. m.: «hasta» debe ser
posterior a «desde».
```

El botón «Autorizar» queda deshabilitado. Si lo consigue enviar, es un defecto:
repórtelo.

### 11.2 · El padrón entero, desde una hoja

**Viviendas → Cargar padrón.** La hoja se llena con lo que el conjunto tiene
escrito. La única columna obligatoria es `identificador`:

| identificador | agrupacion | documento  | nombre          | placa  | es_titular |
| ------------- | ---------- | ---------- | --------------- | ------ | ---------- |
| 12            | B          | 12.345.678 | Ana María Pérez |        | true       |
| 12            | B          |            |                 | ABC123 |            |
| 13            | B          | 98765432   | Luis Gómez      | XYZ987 | true       |
| 14            | C          |            |                 |        |            |

- `identificador` — si no existe, **se crea**. Si su archivo trae «Casa 12», se
  guarda «12» y el resumen cuenta cuántos recortó.
- `agrupacion` — torre, bloque, manzana, sección o sector. **Hace falta cuando
  el conjunto agrupa**: el 101 de la torre 1 y el de la torre 2 son dos
  viviendas distintas. Si su conjunto no agrupa, la columna sobra.
- `vivienda` sigue aceptándose como sinónimo de `identificador`, para quien ya
  tenga archivos de antes.
- `documento` + `nombre` — registran a la persona como residente de esa
  vivienda. El mismo documento en dos filas es **una** persona, con puntos o sin
  ellos.
- `placa` — registra el vehículo en esa vivienda.
- `tipo_documento` y `es_titular` — opcionales; por omisión, cédula y no
  titular.
- Una fila con solo `vivienda` da de alta la casa vacía.

**Salida esperada de una carga correcta:**

```
Padrón cargado: 4 filas de 4.
Se crearon 3 viviendas y 2 personas. Si alguno de esos números te sorprende,
revisa la hoja: una errata en «identificador» crea una vivienda nueva.
```

Ese segundo renglón es el control: la hoja nombra la vivienda por su
identificador, así que **«12 » con un espacio de más crea una vivienda
distinta**. El número lo delata en el momento.

**Salida esperada si una fila está mal** — la carga es de todo o nada (HU-03):

```
No se aplicó nada. Se leyeron 4 filas y 1 tiene errores.
  Fila 3: la fila trae documento pero no un nombre válido en la columna «nombre»
```

Compruebe después, en **Viviendas**, que el total de activas es el que esperaba,
y que ninguna vivienda quedó a medias.

---

## 12 · El alta de viviendas rediseñada — qué comprobar usted, paso a paso

Lo de aquí abajo se ejecuta **contra su proyecto**, que es donde están sus
credenciales. Cada paso lleva la salida esperada; si alguno no la da, es un
defecto y no una diferencia de entorno.

### 12.0 · Antes de nada: aplicar la migración `0029`

```bash
supabase db push        # o el procedimiento de CONEXION_SUPABASE.md §5
```

**Esperado:** aplica `20260916120000_0029_alta_de_viviendas.sql` sin errores.

Si su padrón ya tuviera viviendas con dirección propia, la migración **se
detiene** con este mensaje en vez de perder el dato:

```
ERROR: Hay N viviendas con direccion propia. La direccion pasa a la copropiedad:
traslade o descarte esos valores antes de aplicar la 0029.
```

Compruebe después, desde el SQL Editor del panel, que el índice quedó compuesto:

```sql
SELECT indexdef FROM pg_indexes WHERE indexname = 'viviendas_identificador_uk';
```

**Esperado** — las tres piezas tienen que estar: `UNIQUE`, `coalesce(agrupacion,
''::text)` y `WHERE (estado = 'activo')`.

```
CREATE UNIQUE INDEX viviendas_identificador_uk ON public.viviendas
  USING btree (copropiedad_id, COALESCE(agrupacion, ''::text), identificador)
  WHERE (estado = 'activo'::estado_registro)
```

### 12.1 · El diálogo de configuración inicial

Entre a la consola como administrador de una copropiedad **recién creada con el
guion**, sin configurar.

**Esperado:** al entrar —en cualquier pantalla, no solo en Viviendas— aparece
**«Configure su copropiedad»** pidiendo dirección y tipo.

Lo que NO debe ocurrir, y es lo que conviene comprobar de verdad: **que no
vuelva a aparecer** después de guardarlo, y que **sí aparezca** en otra
copropiedad sin configurar. Lo dispara el tipo nulo en la base, no una marca del
navegador; para confirmarlo, borre los datos del sitio y vuelva a entrar: no
debe reaparecer.

### 12.2 · Generar el padrón, con la vista previa por delante

**Viviendas → Generar padrón.** Con 3 torres por letras, 5 pisos y 3 por piso, y
una excepción: torre **C**, 3 pisos, 3 por piso.

Pulse **«Ver qué se va a crear»**. **Esperado**, antes de crear nada:

```
Se van a crear 39 viviendas en 3 torres
Torre A   15 viviendas   101, 102 … 502, 503
Torre B   15 viviendas   101, 102 … 502, 503
Torre C    9 viviendas   101, 102 … 302, 303   (excepción)
```

Que la torre C acabe en **303** y no en 503 es lo que hay que mirar: es lo que
delata un patrón mal puesto antes de que cueste deshacerlo.

Ahora, **sin cerrar el diálogo, cambie «cuántas torres» a 4**. El botón debe
volver a decir «Ver qué se va a crear» y la vista previa debe desaparecer. Si le
dejara crear 39 después de ese cambio, repórtelo.

Confirme. **Esperado:** «Se crearon 39 viviendas.» y el directorio agrupado por
torre, con el recuento en cada cabecera.

### 12.3 · La operación que debía ser peligrosa y no lo es

Repita **exactamente la misma generación** sobre el mismo conjunto.

**Esperado** — no se crea nada, y se nombran las que ya estaban:

```
No se creó ninguna vivienda: ya existen A · 101, A · 102, … (39 en total)
```

Es la comprobación que pidió: regenerar sobre un padrón con residentes **no
sustituye ni borra nada**, porque la generación solo inserta y se revierte
entera ante la primera colisión.

Añadir una torre nueva sí funciona: genere solo la torre **D** y debe crearse.

### 12.4 · Que la palabra no esté dentro del dato

En **Nueva vivienda**, escriba `Casa 42` en el número.

**Esperado**, del servidor y no del navegador:

```
Escriba solo el número: la palabra «Casa» la pone el sistema. Para esta
vivienda, «42»
```

Y compruébelo en la base, que es donde importa:

```sql
SELECT identificador, agrupacion FROM public.viviendas
 WHERE copropiedad_id = '<su-id>' AND estado = 'activo' ORDER BY agrupacion, identificador LIMIT 5;
```

**Esperado:** `identificador` solo con dígitos. Si aparece «Casa 42» guardado,
el control no está actuando y el día que cambie el prefijo esa fila mentirá.

### 12.5 · El mismo número en dos torres

```sql
SELECT agrupacion, identificador FROM public.viviendas
 WHERE copropiedad_id = '<su-id>' AND identificador = '101' AND estado='activo';
```

**Esperado:** una fila por torre (A, B, C…). Si solo hay una, el índice no quedó
compuesto y la generación de la segunda torre habría fallado.

### 12.6 · El círculo de exportar e importar

1. **Viviendas → Exportar.** Se descarga `padron.csv`.
2. Ábralo en Excel. **Esperado:** las tildes se ven bien —«Pérez», no «PeÌ rez»—
   y la cabecera es exactamente:

   ```
   identificador,agrupacion,documento,tipo_documento,nombre,placa,es_titular
   ```

3. **Sin editar nada**, guárdelo como `.xlsx` y cárguelo por **Cargar padrón**.

**Esperado:** se aplica, y el resumen dice **0 viviendas creadas y 0 personas
creadas** — porque todo lo que traía ya existía. Si creara algo, el archivo que
sale y el que entra no son el mismo formato, y eso es un defecto: repórtelo.

### 12.7 · Cambiar el prefijo no renombra nada

**Configuración → «Cómo se llama una vivienda aquí»**: cambie «Casa» por
«Apartamento» y guarde.

**Esperado:** el directorio, el buscador y la ficha pasan a decir «Apartamento
42». Y en la base:

```sql
SELECT count(*) FROM public.viviendas WHERE identificador LIKE '%Casa%';
```

**Esperado: `0`.** Ninguna fila se tocó, porque la palabra nunca estuvo dentro.
Es la respuesta a su segunda pregunta, comprobada.

### 12.8 · Cambiar el tipo no afecta a lo ya creado

**Configuración → Tipo de copropiedad**: de «Casas» a «Apartamentos».

**Esperado:** las viviendas siguen exactamente donde estaban, con su mismo
identificador y su misma agrupación; lo único que cambia es el formulario de la
próxima generación. Compruebe el recuento antes y después:

```sql
SELECT count(*) FROM public.viviendas WHERE copropiedad_id = '<su-id>' AND estado='activo';
```

**Esperado:** el mismo número antes y después del cambio.

---

## 13 · La superficie del residente contra su base — ETAPA 11-B

> **Empiece por dos.** Si solo tiene tiempo para dos puntos de este apartado,
> que sean **13.2** y **13.4**:
>
> - **13.2** es el que habría detectado D-89. Comprueba que el SQL de los
>   adaptadores del residente encaja con SU esquema. Un minuto.
> - **13.4** es el que comprueba que un reintento sin cobertura **no duplica la
>   visita**. Es la diferencia entre que el portero vea una autorización o dos
>   para la misma persona.
>
> Los demás son útiles y ninguno es bloqueante.

> **Antes de nada, dos avisos de `entorno:diff` que ya no debería ver.** > `DATABASE_POOLER_URL` estaba declarada en `.env.example` **sin el signo
> igual**, así que el comparador no la veía y se la reclamaba en cada corrida.
> `EVIDENCIA_BUCKET` no estaba declarada en absoluto. Las dos están corregidas
> en esta ronda (D-90), junto con tres nombres que el ejemplo pedía y el código
> nunca ha leído — ver §13.0.

**Por qué este apartado existe y es el más importante de la ronda.** En 11-A la
app del residente se probó entera contra un **doble en memoria**: 1.519 pruebas
en verde, incluidas las del segundo eje de aislamiento. Al escribir 11-B se
ejerció por primera vez el adaptador SQL contra PostgreSQL y aparecieron **dos
consultas rotas** (D-89): una unía una tabla que no existe y otra leía una
columna que no existe. Es decir: **ninguna lectura del residente funcionaba
contra una base real** y ningún control lo decía.

Está corregido y ahora hay una suite que lo vigila. Lo que sigue es cómo
comprobarlo usted contra SU proyecto.

### 13.0 · Las variables de entorno, corregidas (D-90)

Tres nombres del `.env.example` **no los leía nadie**. Como el esquema tiene
valores por omisión, la aplicación arrancaba igual, así que quien endurecía el
límite de peticiones creía haberlo endurecido:

| Lo que decía el ejemplo | Lo que el código lee de verdad |
| ----------------------- | ------------------------------ |
| `RATE_LIMIT_TTL`        | `THROTTLE_TTL_SEGUNDOS`        |
| `RATE_LIMIT_LIMIT`      | `THROTTLE_LIMITE`              |
| `MAX_PAYLOAD_BYTES`     | `LIMITE_PAYLOAD`               |

**Qué hacer en su `.env`:** renombrar esos tres. Los valores viejos no hacen
nada. `RATE_LIMIT_LIMIT=100` se convierte en `THROTTLE_LIMITE=100`, y si no lo
renombra seguirá con el valor por omisión de 120.

Y se declararon cuatro que faltaban: `DATABASE_POOLER_URL` (le faltaba el `=`),
`EVIDENCIA_BUCKET`, `PG_POOL_MAX` y `RECUPERACION_URL_REDIRECCION`.

> **D-91 · corrección de la corrección.** Al declarar las dos opcionales las
> escribí como `EVIDENCIA_BUCKET=` y `RECUPERACION_URL_REDIRECCION=`, y **eso
> impedía el arranque**: `dotenv` no produce «no configurada» para una línea
> `VAR=`, produce **la cadena vacía**, que sí llega al validador y no es una URL
> absoluta. Copiar el ejemplo al pie de la letra rompía la aplicación.
>
> Corregido en el sitio que lo cierra entero: el cargador descarta las cadenas
> vacías **antes** de validar, así que `VAR=` vuelve a significar «no
> configurada». Y al escribir la prueba genérica apareció la mitad que no se
> veía: **lo mismo le pasaba a todas las variables con valor por omisión**
> —`PORT=`, `PG_POOL_MAX=`, `THROTTLE_LIMITE=`—, que es justo lo contrario de
> lo que un valor por omisión promete.
>
> En su `.env`: si tiene alguna de esas líneas vacía, ya no le molestará. Las
> dos opcionales van en el ejemplo **comentadas y con un valor de referencia**,
> que es como se lee sin ambigüedad:
>
> ```
> # RECUPERACION_URL_REDIRECCION=http://localhost:3001/restablecer
> # EVIDENCIA_BUCKET=evidencias
> ```
>
> Si pone la primera, su origen tiene que estar en `CORS_ALLOWED_ORIGINS`: el
> arranque lo comprueba.

```bash
pnpm entorno:diff
```

**Esperado:** ninguna diferencia, o solo las que usted haya añadido a propósito.

**Las seis `BARRERA_*` son correctas y debe tenerlas**: las lee el adaptador de
barrera (`packages/providers`) y `BARRERA_DISPOSITIVO_ID` la lee el módulo de
guardia. La IP y las credenciales del equipo **viven solo en su `.env`**: §2.7.1
y KPI-11 prohíben que una IP de dispositivo entre en el repositorio, y el paso
10 del verificador lo comprueba.

Desde esta ronda hay un control que impide que esto se repita: el paso 9
compara el esquema Zod contra `.env.example` **en las dos direcciones** y falla
si una variable se lee y no se declara, o se declara y no se lee.

---

### 13.1 · Aplicar la migración 0030

```bash
supabase db push
```

**Esperado:** la migración `0030_autorizacion_del_residente` aplicada, sin error.
Añade dos cosas: la columna `clave_idempotencia` en `autorizaciones` con su
índice único parcial, y la tabla `dispositivos_de_notificacion`.

Compruébelo:

```sql
select column_name
  from information_schema.columns
 where table_name = 'autorizaciones' and column_name = 'clave_idempotencia';

select indexname from pg_indexes where indexname = 'autorizaciones_idempotencia_uk';

select count(*) from public.dispositivos_de_notificacion;
```

**Esperado:** una fila, una fila, y `0`. Si la tercera consulta da un error de
permisos en vez de `0`, está usando una llave sujeta a RLS y **eso es correcto**:
la política solo deja ver los aparatos propios.

### 13.2 · **[PRIORITARIO]** Que el SQL del residente encaje con SU esquema

Esta es la comprobación que faltaba en 11-A, y la que habría detectado D-89.

```bash
DATABASE_URL_PRUEBAS='postgresql://…' \
  pnpm --filter @ncr/api exec vitest run test/residente-pg.test.ts
```

**Esperado:**

```
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

**Si ve `el SQL no encaja con el esquema migrado (42P01)`** falta una tabla: su
base no tiene todas las migraciones. **Con `(42703)`** falta una columna: tiene
una versión anterior del esquema. En los dos casos, vuelva a 13.1.

**Si los cuatro se OMITEN**, no definió `DATABASE_URL_PRUEBAS`. Una omisión no
es un verde: el paso 13 del verificador la exige.

### 13.3 · Crear una visita desde la API, como la haría la app

Con un token de un usuario con rol `residente` y vínculo activo:

```bash
curl -s -X POST "$API/copropiedades/$COP/mi/autorizaciones" \
  -H "Authorization: Bearer $TOKEN_RESIDENTE" \
  -H 'Content-Type: application/json' \
  -d '{
        "visitante": "Visitante de prueba",
        "desde": "2026-09-20T14:00:00-05:00",
        "hasta": "2026-09-20T18:00:00-05:00",
        "acompanantes": ["Acompañante de prueba"],
        "observaciones": "creada a mano para verificar",
        "claveDeIdempotencia": "verificacion-manual-0001"
      }'
```

**Esperado:** `{"creada":true,"id":"…","repetida":false,"motivo":null,"explicacion":null}`.

**En ningún momento se envía la vivienda.** La deriva el servidor desde su
identidad; el cliente no puede nombrarla. Si intenta añadir `viviendaId` al
cuerpo recibirá **400**, porque el `ValidationPipe` corre con
`forbidNonWhitelisted`.

### 13.4 · **[PRIORITARIO]** La idempotencia, que es lo que hace seguro el modo sin conexión

Repita **el mismo comando de 13.3, sin cambiar nada**.

**Esperado:** `{"creada":true,"id":"<el MISMO id>","repetida":true,…}`.

Si obtiene un `id` distinto, la migración 0030 no está aplicada o el índice
único no existe: el reintento del ascensor crearía visitas duplicadas.

Compruebe que solo hay una:

```sql
select count(*) from public.autorizaciones
 where clave_idempotencia = 'verificacion-manual-0001';
```

**Esperado: `1`.**

### 13.5 · Los rechazos, con su motivo tipado

Vete a la persona y repita con otra clave:

```sql
insert into public.listas_negras (copropiedad_id, placa, motivo, creado_por, actualizado_por)
values ('<su copropiedad>', 'ABC123', 'prueba de verificación', '<su usuario>', '<su usuario>');
```

```bash
curl -s -X POST "$API/copropiedades/$COP/mi/autorizaciones" \
  -H "Authorization: Bearer $TOKEN_RESIDENTE" -H 'Content-Type: application/json' \
  -d '{"visitante":"Vetado","placa":"ABC123",
       "desde":"2026-09-20T14:00:00-05:00","hasta":"2026-09-20T18:00:00-05:00",
       "claveDeIdempotencia":"verificacion-vetado-0001"}'
```

**Esperado:**

```json
{
  "creada": false,
  "id": null,
  "repetida": false,
  "motivo": "LISTA_NEGRA",
  "explicacion": "Esta persona está en la lista negra del conjunto. …"
}
```

**Lo que importa de esa respuesta:** es un **200 con motivo**, no un 403. El
residente tiene que poder distinguir «está vetada» de «su vivienda está
inactiva», y una de las dos se arregla llamando a la administración. Un código
de error no distingue.

No olvide limpiar:

```sql
update public.listas_negras
   set estado = 'levantada', levantada_en = now(),
       levantada_por = '<su usuario>', motivo_levantamiento = 'fin de la prueba'
 where motivo = 'prueba de verificación';
```

### 13.6 · Que un residente NO alcance la vivienda del vecino

Con el token de un residente de la vivienda A, pida **todo**:

```bash
for r in vivienda familia vehiculos autorizaciones historial zonas; do
  echo "== $r"
  curl -s "$API/copropiedades/$COP/mi/$r" -H "Authorization: Bearer $TOKEN_RESIDENTE" | head -c 300
  echo
done
```

**Esperado:** seis respuestas `200`, y **ningún dato de otra vivienda**. Busque
el identificador de una vivienda vecina en las salidas: no debe aparecer.

`zonas` es la excepción declarada y está bien que lo sea: las zonas comunes son
del conjunto, no de una vivienda (RN-14).

### 13.7 · El token de notificaciones

```bash
curl -s -X POST "$API/copropiedades/$COP/mi/notificaciones/aparatos" \
  -H "Authorization: Bearer $TOKEN_RESIDENTE" -H 'Content-Type: application/json' \
  -d '{"instalacionId":"verificacion-manual","token":"token-de-prueba-0001","plataforma":"android"}'
```

**Esperado:** `{"id":"…"}`. Repítalo con otro `token` y el **mismo**
`instalacionId`:

```sql
select count(*), max(token) from public.dispositivos_de_notificacion
 where instalacion_id = 'verificacion-manual';
```

**Esperado: `1` fila y el token NUEVO.** Si aparecen dos filas, el `UPSERT` no
está tomando el índice y cada arranque de la app dejaría un token muerto más al
que se seguiría notificando.

---

## 14 · Las pantallas, la cámara y el KPI — ETAPA 11-C

Siete comprobaciones. **La 14.2 y la 14.6 son las prioritarias**: la primera es
la que separa dos personas ante la ley, y la segunda es el único número del KPI
que no puedo medir yo.

Se usan las mismas variables de §13 (`API`, `COP`, `TOKEN_RESIDENTE`). Añada la
del vecino, que hace falta en 14.2:

```bash
TOKEN_VECINO=<token de un residente de OTRA vivienda del mismo conjunto>
```

### 14.1 · La visita se crea y devuelve su identificador

```bash
curl -s -X POST "$API/copropiedades/$COP/mi/autorizaciones" \
  -H "Authorization: Bearer $TOKEN_RESIDENTE" -H 'Content-Type: application/json' \
  -d '{"visitante":"Plomero de prueba","desde":"'"$(date -u -d '+5 min' +%FT%TZ 2>/dev/null || date -u -v+5M +%FT%TZ)"'","hasta":"'"$(date -u -d '+4 hours' +%FT%TZ 2>/dev/null || date -u -v+4H +%FT%TZ)"'","acompanantes":["Ayudante"],"zonasPermitidas":[],"claveDeIdempotencia":"verificacion-14-1-0001"}'
```

**Esperado:** `{"creada":true,"id":"<uuid>","repetida":false,…}`. Guarde el
identificador:

```bash
AUT=<el uuid devuelto>
```

### 14.2 · **[PRIORITARIO]** El rostro es del visitante, no del residente (RN-10)

Es la comprobación que sostiene la Ley 1581 en esta superficie. Tres partes:

**a · su propio visitante sí.**

```bash
curl -s -X POST "$API/copropiedades/$COP/mi/autorizaciones/$AUT/rostro" \
  -H "Authorization: Bearer $TOKEN_RESIDENTE" -H 'Content-Type: application/json' \
  -d '{"vector":"'"$(head -c 64 /dev/urandom | base64 | tr -d '\n')"'","medidas":{"nitidez":0.9,"iluminacion":0.5,"rostrosDetectados":1,"proporcionRostro":0.4},"versionPolitica":"v1.0","suprimirEn":"'"$(date -u -d '+1 day' +%FT%TZ 2>/dev/null || date -u -v+1d +%FT%TZ)"'"}'
```

**Esperado:** `{"aceptada":true,"consentimientoId":"…","titular":"Plomero de
prueba",…}`. Mire el `titular`: **es el visitante**. Si apareciera su nombre de
residente, el consentimiento se le estaría pidiendo a la persona equivocada.

**b · el visitante del VECINO, no.** Con el mismo cuerpo, cambiando el token:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "$API/copropiedades/$COP/mi/autorizaciones/$AUT/rostro" \
  -H "Authorization: Bearer $TOKEN_VECINO" -H 'Content-Type: application/json' \
  -d '{"vector":"'"$(head -c 64 /dev/urandom | base64 | tr -d '\n')"'","medidas":{"nitidez":0.9,"iluminacion":0.5,"rostrosDetectados":1,"proporcionRostro":0.4},"versionPolitica":"v1.0","suprimirEn":"'"$(date -u -d '+1 day' +%FT%TZ 2>/dev/null || date -u -v+1d +%FT%TZ)"'"}'
```

**Esperado: `404`.** No 403: un 403 confirmaría que esa autorización existe, que
es la mitad de lo que alguien querría averiguar.

**c · `titularId` en el cuerpo se rechaza.** Repita (a) añadiendo
`"titularId":"<cualquier uuid>"`.

**Esperado: `400`**, con un mensaje que nombra la propiedad. Si respondiera
`201`, el campo se estaría ignorando en silencio y un cliente que lo enviara
creería que sirvió.

### 14.3 · Sin consentimiento no hay sincronización (RN-09)

Con el `consentimientoId` que devolvió 14.2:

```sql
select estado from public.consentimientos_biometricos where id = '<consentimientoId>';
```

**Esperado: `pendiente`.** Y en la app: la pantalla dice «Pendiente de que
&lt;visitante&gt; acepte» y **no hay ninguna casilla** con la que el residente
pueda aceptar por él. Si la hubiera, sería la firma de otro en un papel.

### 14.4 · **[PRIORITARIO]** Reintentar no duplica visitas (RN-17)

Es la comprobación del modo sin conexión. Repita 14.1 **tal cual**, con la misma
`claveDeIdempotencia`:

**Esperado:** `{"creada":true,"id":"<el MISMO uuid>","repetida":true}`. Y en la
base:

```sql
select count(*) from public.autorizaciones where clave_idempotencia = 'verificacion-14-1-0001';
```

**Esperado: `1`.** Si fueran dos, un residente en el ascensor con mala cobertura
crearía tres visitas idénticas y el portero vería tres autorizaciones.

Para verlo desde la app: active el modo avión, cree una visita, **verá «Quedó
pendiente de enviarse» y NO «creada»**, y en la pestaña Visitantes aparecerá el
recuadro «1 sin enviar» separado de la lista. Quite el modo avión, vuelva a
primer plano y la visita pasa a la lista con un aviso de cuántas se enviaron.

### 14.5 · El aforo refleja, no reserva

En la pestaña Zonas:

```bash
curl -s "$API/copropiedades/$COP/mi/zonas" -H "Authorization: Bearer $TOKEN_RESIDENTE" | head -c 400
```

**Esperado:** cada zona con `aforoMaximo`, `ocupacionActual`, `abiertaAhora` y
`franjasDeHoy`. En la app, la tarjeta dice «Quedan N de M plazas» y arriba, en
todas las visitas, **«No reserva plaza»**. Compruebe además una zona con horario
que cruce medianoche (por ejemplo 20:00–02:00): tiene que verse **entera**, no
partida ni con el contador reiniciado a las 00:00.

### 14.6 · **[PRIORITARIO]** KPI-10 — qué cronometra usted, y con qué criterio

Yo puedo medir la parte del sistema y la mido: `p95 ≈ 5 ms` de un presupuesto de
3 000 ms sobre los 60 000 (la suite lo imprime, §6 del informe). Lo que no cabe
en una suite es la persona.

**Lo que usted cronometra:** desde que el residente **toca el botón «Nuevo
visitante»** hasta que la pantalla **muestra el desenlace** —«Visita registrada»
o el rechazo con su motivo—.

**El criterio, para que la medida signifique algo:**

1. **Un residente real, no usted.** Quien construyó la pantalla sabe dónde está
   cada campo; el KPI habla de un residente cualquiera.
2. **Que no haya usado la app antes.** Si la usó, mida a otro: lo que KPI-10
   mide es si la pantalla se entiende, y eso solo se mide una vez por persona.
3. **Una visita normal:** nombre, documento, desde/hasta y una placa. **Sin
   patrón de recurrencia y sin acompañantes** —son opcionales y no los usa la
   mayoría—. Si quiere medir también el caso completo, cronométrelo aparte y
   anótelo como otra cifra.
4. **Con el teléfono en la mano, de pie, como en la portería.** Sentado en un
   escritorio con teclado sale un número que nadie va a vivir.
5. **Sin ayudarle.** Si pregunta, la respuesta es «haga lo que le parezca»; una
   pregunta es un hallazgo de usabilidad, no una pausa del cronómetro.
6. **Repita con tres personas** y quédese con **la peor**, no con el promedio.
   El promedio esconde justo al residente que no lo consigue.

**Criterio de aprobación: los tres por debajo de 60 s.** Si alguno se pasa,
anote en qué campo se detuvo: eso es lo accionable, no el número.

### 14.7 · Las notificaciones dicen la verdad

En la app, Perfil → Notificaciones. **Esperado:** con Firebase aún sin
aprovisionar, el estado es **«El servicio de avisos no respondió»** y no
«activadas». Si dijera «Activas en este aparato» sin que exista el proyecto de
Firebase, la pantalla estaría mintiendo y el residente creería que le avisarán
cuando llegue su visitante.

Con Firebase aprovisionado y el adaptador real conectado, el estado correcto es
**«Activas en este aparato»** y en la base:

```sql
select instalacion_id, left(token, 12), actualizado_en
  from public.dispositivos_de_notificacion where usuario_id = '<su usuario>';
```

**Esperado: una fila por aparato**, con el token actualizado. Dos filas para el
mismo teléfono significan que la fila se está identificando por el token y no
por la instalación, y cada rotación dejaría un registro muerto al que se
seguiría notificando.

### 14.8 · Que la suite de Dart no dependa del reloj de su máquina

Es la comprobación que salió de D-97, y la puede hacer usted en veinte segundos:

```bash
cd apps/mobile
TZ=Etc/UTC          flutter test | tail -1
TZ=America/Bogota   flutter test | tail -1
TZ=Pacific/Auckland flutter test | tail -1
```

**Esperado: las tres líneas idénticas.** Si una difiere, hay una prueba que
afirma una hora escrita a mano en vez de derivarla, y estará verde en su Mac y
roja en el CI —o al revés—, que es justo lo que pasó.

El paso **5c** del verificador ya lo hace solo: corre la suite una segunda vez en
un huso elegido por ser distinto del de su máquina. Si ve

```
✓ la suite de Dart da lo mismo en otro huso (Pacific/Auckland): ninguna prueba depende del reloj del sistema
```

no hace falta que lo repita a mano.

> **Nota sobre S-23, declarado y no corregido.** La app pinta el horario de las
> zonas comunes en el huso **de su teléfono**, no en el de la copropiedad. En
> Colombia coinciden siempre —un solo huso, sin horario de verano—, así que no
> lo verá. Se nota si abre la app desde otro país: la piscina aparecerá con las
> horas desplazadas. El arreglo está propuesto en `docs/etapas/ETAPA-11.md`
> (enviar el desplazamiento en minutos, como ya hace M-4) y es un cambio de
> contrato, así que lo decide usted.
