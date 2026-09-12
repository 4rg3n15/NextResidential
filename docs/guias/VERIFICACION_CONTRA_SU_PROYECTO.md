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
