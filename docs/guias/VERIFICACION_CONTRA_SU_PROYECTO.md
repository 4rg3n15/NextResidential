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
