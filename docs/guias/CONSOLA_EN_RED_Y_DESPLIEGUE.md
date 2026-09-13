# La consola fuera de `localhost`: red, TLS, dominio y proxy

> Escrito tras **D-67** y **D-68**, los dos defectos que sólo aparecían al
> entrar por una IP de red. Los dos tenían la misma forma, y por eso este
> documento existe: **algo decidido por `NODE_ENV` que en realidad depende de
> cómo se alcanzó la página.**

---

## 1 · Los dos defectos, y la regla que dejan

| Id       | Qué decidía mal                                    | Síntoma                                                                                                            | Corregido                          |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **D-67** | `upgrade-insecure-requests` según `NODE_ENV`       | La consola sin estilos: CSS y JavaScript reescritos a `https://` contra un servidor sin TLS                        | Depende del esquema de la petición |
| **D-68** | El atributo `Secure` de la cookie según `NODE_ENV` | **El código del autenticador rechazado siempre**, con «La sesión expiró»: el navegador descartaba las tres cookies | Depende del esquema de la petición |

**Por qué los dos se escondieron tanto tiempo.** El navegador trata `localhost`
y `127.0.0.1` como orígenes **potencialmente seguros**: ahí acepta cookies
`Secure` sobre HTTP y se salta la subida de esquema. Es decir, el bucle local
**no ejerce** ninguna de las dos comprobaciones, y el recorrido del navegador
sólo visitaba el bucle local. Cualquier prueba que sólo mire `localhost` está
midiendo el caso más favorable.

**La regla que queda, y que el código ya obedece:** todo lo que dependa del
esquema se decide **por petición**, con una sola función —`peticionLlegoPorHttps`—
y un solo dato: el que el middleware sella en `x-ncr-esquema-seguro`.

### Lo que se revisó al buscar más casos del mismo patrón

| Decisión                                     | Depende de                    | ¿Correcto?                                                                           |
| -------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `upgrade-insecure-requests`                  | Petición                      | ✅ corregido (D-67)                                                                  |
| Atributo `Secure` de las cookies             | Petición                      | ✅ corregido (D-68)                                                                  |
| `httpOnly`, `SameSite=Lax`, `path`           | Nada — constantes             | ✅ no dependen del esquema y **no se tocaron**                                       |
| `'unsafe-eval'` y `style-src-elem` de la CSP | `NODE_ENV`                    | ✅ **correcto así**: describen cómo compila `next dev`, no cómo se alcanzó la página |
| `connect-src` / `img-src` con `API_URL`      | Configuración                 | ✅ correcto; ver §4                                                                  |
| Registro del service worker                  | Contexto seguro del navegador | ⚠️ no es código nuestro; ver §3                                                      |

---

## 2 · Qué funciona ya por IP de red, comprobado

El paso **3.ter** del recorrido del navegador entra por una IP de red real y
compara con el bucle local. Lo verificado en cada corrida:

- Contraseña → segundo factor → `aal2` → tablero, **completo**.
- Las **tres cookies llegan** al navegador, ninguna con `Secure` sobre HTTP, y
  **todas siguen `httpOnly`**: el arreglo no aflojó lo que fijó la 09-A.
- **Las nueve pantallas se comportan igual** por los dos orígenes. No se
  pregunta «¿está bien esta pantalla?» sino «¿se comporta igual?», que es la
  pregunta que persigue la diferencia por origen y no el estado en sí.
- El canal en vivo (SSE) se comporta igual: **no exige contexto seguro**.
- Los estilos se aplican: reglas CSS > 0 y el fondo es el token `lienzo`.

---

## 3 · Lo que **no** funciona por IP sin TLS, y no es un defecto

**El service worker no se registra.** Un origen `http://<ip>` no es un contexto
seguro, y el navegador no registra service workers fuera de un contexto seguro.
Consecuencias, mientras se sirva así:

- La consola **no es instalable como PWA**.
- **No hay caché sin conexión**: la pantalla `/sin-conexion` no llega a
  servirse, porque quien la sirve es el service worker.

No se arregla en el código y no hay que intentarlo: vuelve sola en cuanto haya
dominio y HTTPS. El recorrido lo deja dicho en cada corrida en vez de callarlo:

```
   ✓ contexto seguro: bucle local true, IP por HTTP false — sin PWA ni caché sin conexión hasta que haya TLS
```

Otras dos cosas dependen del contexto seguro y conviene saberlo antes de
encontrárselas: `navigator.clipboard` —el botón «copiar» de los códigos de
recuperación, que ya cae con elegancia porque se invoca con `?.`— y, más
adelante, la cámara de la guardia virtual (ETAPA 10) y cualquier captura
biométrica desde el navegador. **`getUserMedia` exige contexto seguro**: la
consola de guardia virtual no se puede demostrar por IP sin TLS.

---

## 4 · `API_URL=http://localhost:3000` — **no es parte de este defecto**

Preguntó si lo era. No lo es, y conviene saber por qué para no cambiarlo por el
motivo equivocado.

**La consola nunca llama a la API desde el navegador.** Todo pasa por el proxy
`/api/ncr/…`, que corre en el servidor de Next y es quien pone el token desde la
cookie `httpOnly`. Así que `API_URL` lo resuelve **el proceso de Node**, no el
navegador: `localhost:3000` es correcto mientras la API corra en la misma
máquina, y lo seguiría siendo aunque usted entrara desde otro continente.

Su único efecto visible en el navegador es que ese origen entra en `connect-src`
y en `img-src` de la CSP. Hoy es inofensivo porque el navegador no habla con él.

**Cuándo sí importará, y es pronto:** la consola de portería (ETAPA 10) muestra
la evidencia de cada evento con una **URL firmada del bucket**, y esa URL apunta
al origen de **Supabase Storage**, no al de la API. Hoy `img-src` lista `'self'`,
`data:`, `blob:` y el origen de `API_URL` — **no el de Supabase**. Cuando la
portería pinte la primera miniatura, la CSP la bloqueará. Queda anotado aquí
para que no se descubra con la pantalla delante.

---

## 5 · Qué le espera para un despliegue real

En el orden en que conviene hacerlo.

### 5.1 · TLS y dominio

Un certificado y un nombre. Con eso, y sin tocar una línea:

- La cookie vuelve a salir `Secure` sola —lo decide la petición— y
  `upgrade-insecure-requests` reaparece.
- El service worker se registra: PWA instalable y caché sin conexión.
- La cámara de la ETAPA 10 pasa a ser posible.

**Lo único que hay que declarar** es lo que el proxy no pueda contar por sí
mismo. Si su proxy inverso **reenvía `x-forwarded-proto`** —Nginx, Caddy,
Traefik y los balanceadores de nube lo hacen por defecto—, no hay nada que
configurar. Si no lo reenvía, fuerce el atributo:

```
COOKIE_SEGURA=true
```

Es la única razón legítima para declararla. Sin declarar, decide la petición.

### 5.2 · Proxy inverso

Lo que tiene que reenviar, sin excepción:

| Cabecera            | Para qué                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `X-Forwarded-Proto` | Decide `Secure` y `upgrade-insecure-requests`. **Es la importante**                                                       |
| `Host`              | Next construye las URL absolutas con él                                                                                   |
| `X-Forwarded-For`   | El limitador de tasa cuenta por IP: sin esto, todas las peticiones parecen del proxy y se limita a todo el mundo a la vez |

Y lo que **no** debe hacer: reescribir ni añadir `Content-Security-Policy` —la
emite el middleware con el nonce de cada respuesta, y un proxy que la sustituya
la deja sin nonce, es decir sin JavaScript—, ni cachear respuestas de
`/api/ncr/…`.

### 5.3 · CORS de la API

`CORS_ALLOWED_ORIGINS` es **lista blanca explícita** (§2.7.2) y hoy vale
`http://127.0.0.1:3100`. Al desplegar hay que poner el origen público de la
consola:

```
CORS_ALLOWED_ORIGINS=https://consola.sudominio.co
```

Un detalle que evita una tarde: **con el proxy BFF, el navegador no hace
peticiones entre orígenes a la API**, así que CORS casi no interviene. Sigue
siendo obligatorio declararlo bien —el Alarm Server y la ETAPA 12 sí llegan de
fuera— pero si algo falla al desplegar, CORS es de los últimos sospechosos, no
de los primeros.

### 5.4 · Supabase: `Site URL` y `Redirect URLs`

Panel → Authentication → URL Configuration.

| Campo             | Qué poner                                              | Qué se rompe si falta                                           |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| **Site URL**      | `https://consola.sudominio.co`                         | El enlace de los correos de Supabase vuelve al sitio equivocado |
| **Redirect URLs** | `https://consola.sudominio.co/acceso/nueva-contrasena` | El restablecimiento de contraseña rebota con «enlace no válido» |

Y en el entorno de la API, la misma URL:

```
RECUPERACION_URL_REDIRECCION=https://consola.sudominio.co/acceso/nueva-contrasena
```

La comprobación de arranque ya avisa de que falta —hoy sale
`SIN-CONFIGURAR: recuperación de contraseña`— y verifica que el valor apunte a
un origen que la propia API admite. Lo que **no** puede ver es el SMTP: eso vive
en el panel y no hay endpoint que lo exponga. Es BE-01, y el bloque 4 lo resuelve
por el otro lado.

### 5.5 · Resumen del entorno que cambia al desplegar

| Variable                             | En su equipo hoy        | En el despliegue                                                |
| ------------------------------------ | ----------------------- | --------------------------------------------------------------- |
| `API_URL` (consola)                  | `http://localhost:3000` | La URL con la que **el servidor de la consola** alcanza la API  |
| `COOKIE_SEGURA`                      | sin declarar            | Sin declarar, salvo que el proxy no reenvíe `x-forwarded-proto` |
| `CORS_ALLOWED_ORIGINS` (API)         | `http://127.0.0.1:3100` | `https://consola.sudominio.co`                                  |
| `RECUPERACION_URL_REDIRECCION` (API) | sin declarar            | `https://consola.sudominio.co/acceso/nueva-contrasena`          |
| `EVIDENCIA_BUCKET` (API)             | `evidencias`            | Igual                                                           |
| `PG_POOL_MAX` (API)                  | 20 por defecto          | Según el plan de Supabase y lo que añada el Edge                |

---

## 6 · Cómo lo comprueba usted

### 6.1 · El camino completo, por los dos orígenes

```bash
node e2e/camino-de-acceso.mjs
```

**Esperado**, en el paso 3.ter:

```
▸ 3.ter · contraseña → segundo factor → aal2 → tablero, por IP de red (D-68)
   ✓ la contraseña lleva al segundo factor
   ✓ el navegador CONSERVA las cookies de sesión por IP (ncr_acceso, ncr_refresco, ncr_expira, ncr_factor)
   ✓ ninguna cookie sale con `Secure` sobre HTTP: el navegador la descartaría en silencio
   ✓ y todas siguen siendo `httpOnly`: el arreglo no afloja lo que 09-A fijó
   ✓ el código del autenticador ENTRA por IP de red, igual que por el bucle local
   ✓ las nueve pantallas se comportan IGUAL por IP que por bucle local
   ✓ el canal en vivo se comporta igual por los dos orígenes (local false, IP false)
   ✓ contexto seguro: bucle local true, IP por HTTP false — sin PWA ni caché sin conexión hasta que haya TLS
   ✓ sin errores de consola por IP (0)
```

El canal en vivo sale `false` en los dos lados **en el banco de pruebas**, que
no tiene base de datos. Lo que se comprueba no es que esté conectado, sino que
los dos orígenes se comporten **igual**.

### 6.2 · A mano, con su consola arrancada

Con la consola en marcha y su IP de red:

```bash
curl -s -D- -o /dev/null http://<su-ip>:3100/acceso | grep -i 'set-cookie\|upgrade-insecure'
```

Por HTTP **no** debe aparecer `upgrade-insecure-requests`, y ninguna cookie debe
llevar `Secure`. Y simulando el proxy con TLS:

```bash
curl -s -D- -o /dev/null -H 'x-forwarded-proto: https' \
  http://<su-ip>:3100/acceso | grep -io 'upgrade-insecure-requests'
```

Ahí **sí** debe aparecer.

### 6.3 · En el navegador, que es la prueba de verdad

1. Abra `http://<su-ip>:3100/acceso` y entre con su usuario.
2. En el paso del segundo factor, **antes** de teclear: DevTools →
   Application → Cookies. Deben estar `ncr_acceso`, `ncr_refresco`, `ncr_expira`
   y `ncr_factor`, con **HttpOnly marcado** y **Secure sin marcar**.
3. Teclee el código. Debe entrar al tablero.
4. Recorra las nueve pantallas del menú. Ninguna debe decir «Sin permiso» ni
   «Sin conexión con el servidor» si por `localhost` no lo dice.

Si en el paso 2 no hubiera cookies, el mensaje ya **no** dirá «La sesión
expiró»: dirá que el navegador no devolvió la cookie y qué mirar. Ese cambio es
parte del arreglo — el mensaje anterior mandaba a reintentar en bucle.
