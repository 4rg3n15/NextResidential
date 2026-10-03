# La app del residente en un iPhone físico, en Release, contra el Mac

**Para qué:** instalar la app en el iPhone de la entrega **una sola vez** y
abrirla después **desde el ícono**, sin cable ni Mac conectado, en casa y en
sitio igual. **Quién:** quien lleva el Mac a sitio. **Cuándo:** antes de la
prueba del residente. **Decisión:** [ADR-033](../decisiones/ADR-033-app-en-release-por-la-red-local.md).

> Las pruebas de residente, superadministrador y portero se hacen desde el
> mismo Mac; las de residente, además, desde el mismo iPhone.

> **15-R · P-23 (decisión del cliente).** En **producción el iPhone usa sólo la
> consola web instalada como PWA** (iOS 16.4+), que es la que recibe los avisos
> al teléfono: [AVISOS_WEB_PUSH.md](AVISOS_WEB_PUSH.md) §4. Esta guía queda para
> la **prueba de entrega** de la app Flutter desde el Mac; Android se entrega
> como APK firmado por descarga ([APK_FIRMADO.md](APK_FIRMADO.md)).

---

## Lo incómodo primero

- **Con un Apple ID gratuito la app caduca a los 7 días.** Pasado ese plazo no
  abre y hay que reinstalarla con cable (§2). Instálela como mucho una semana
  antes de la entrega y apunte la fecha.
- **Por HTTP en la red local, el tráfico va sin cifrar**: cualquiera en esa red
  puede leerlo. Vale para la entrega; producción exige HTTPS (ADR-033).
- **La app no recibe avisos con la app cerrada, y no los recibirá** (ADR-036:
  sin Firebase ni ningún SDK de push). La app lo dice: «Los avisos llegan
  mientras la app está abierta», y con la app abierta la pantalla visible se
  recarga sola cada 20 s. Los avisos al teléfono los recibe la **consola
  instalada** en la pantalla de inicio.

**Una corrección de esta guía.** Su versión anterior decía que la excepción de
App Transport Security existía sólo en Debug «por decisión del cliente». No
fue decisión del cliente —fue del agente, en la 15-E— y además no era lo que
impedía entrar: la app habla con la API por `dart:io`, que no pasa por App
Transport Security. Desde esta corrección la excepción de red local va en
Debug, Release y Profile, y la app se usa en **Release** (ADR-033).

---

## 1 · El nombre del Mac en la red (`.local`)

La IP del Mac cambia entre la casa y el sitio; **su nombre `.local` no**. Por
eso la app se compila con el nombre y no con la IP.

1. En el Mac: Ajustes del Sistema → General → Compartir → **Nombre de host
   local**, o en la terminal:
   ```
   scutil --get LocalHostName
   ```
   Si dice `MacBook-de-Argenis`, la dirección de la API es
   `http://MacBook-de-Argenis.local:3000`.
2. Que el Mac no se duerma durante la prueba:
   ```
   caffeinate -dimsu
   ```
   (déjelo corriendo en una pestaña de la terminal; `Ctrl+C` lo termina).
3. El **cortafuegos del Mac** tiene que aceptar conexiones de `node`: Ajustes
   del Sistema → Red → Cortafuegos → Opciones → **permitir conexiones
   entrantes** para `node`. Si macOS pregunta al arrancar la API, **Permitir**.
4. La API en marcha (`pnpm --filter @ncr/api dev`, o el arranque de
   [ENTREGA_EN_SITIO.md](ENTREGA_EN_SITIO.md) §1). En el Mac,
   `curl http://localhost:3000/health` contesta.

**Cómo resuelve la app un nombre `.local`.** La app abre la conexión con
`dart:io`, que llama a `getaddrinfo`; en iOS esa llamada la atiende
mDNSResponder, que pregunta el nombre por multidifusión (mDNS) en la red local.
Para eso iOS exige el **permiso de red local**, que la app pide la primera vez.
**Si la red bloquea mDNS** (algunas Wi-Fi de edificios aíslan a los clientes o
filtran la multidifusión), el nombre no resuelve y la app dice que no encuentra
el servidor: se usa la IP con «Cambiar servidor» (§4).

---

## 2 · Compilar en Release e instalar (una sola vez, con cable)

1. **Modo desarrollador** en el iPhone (iOS 16+): Ajustes → Privacidad y
   seguridad → Modo desarrollador → activar y reiniciar.
2. **Firma.** Abrir `apps/mobile/ios/Runner.xcworkspace` en Xcode → target
   **Runner** → Signing & Capabilities → **Team**: su Apple ID (Personal Team).
   Si Xcode dice que el identificador ya existe, cambie el _Bundle Identifier_
   por uno propio (p. ej. `co.grupocontrol.residente.<sus-iniciales>`).
3. Conectar el iPhone al Mac por cable y **confiar** en el Mac.
4. Identificar el iPhone:
   ```
   flutter devices
   ```
5. Compilar e instalar **en Release**:
   ```
   cd apps/mobile
   flutter run --release -d <id-del-iPhone> \
     --dart-define=API_URL=http://<nombre>.local:3000 \
     --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
     --dart-define=SUPABASE_PUBLISHABLE_KEY=<sb_publishable_…>
   ```
   Los valores salen del `.env` local del Mac. **Ninguno es secreto** (la llave
   es la publicable): todo `--dart-define` es extraíble del binario, y la app se
   niega a arrancar con una `sb_secret_…`.
6. La primera vez, iOS no deja abrir una app de un desarrollador que no conoce:
   Ajustes → General → VPN y gestión de dispositivos → su Apple ID →
   **Confiar**. Vuelva a lanzar el paso 5.
7. **Permiso de red local.** Al primer intento de entrar, iOS pregunta si la app
   puede buscar dispositivos en la red local: **Permitir**. Si alguien lo negó:
   Ajustes → Privacidad y seguridad → Red local → activar Next Control.
8. **Desconecte el cable.** Cierre la app del todo y ábrala desde el ícono: debe
   abrir y entrar igual. A partir de aquí no hace falta el Mac conectado, sólo
   la misma red.

---

## 3 · En sitio

1. Mac e iPhone en **la misma red**. En el iPhone, **datos móviles apagados**:
   con ellos, el iPhone puede salir por la red del operador, donde el Mac no
   existe.
2. **En Safari del iPhone**, abrir `http://<nombre>.local:3000/health`.

   | Lo que pasa en Safari                         | Causa                                               | Qué hacer                                                                  |
   | --------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
   | Muestra el estado de la API                   | La red está bien                                    | Siga al paso 3                                                             |
   | «No se encuentra el servidor»                 | La red bloquea mDNS: el nombre `.local` no resuelve | En el Mac, `ipconfig getifaddr en0` (o `en1` por cable); pruebe con esa IP |
   | Se queda cargando y termina sin respuesta     | El cortafuegos del Mac descarta la conexión         | Permitir `node` en el cortafuegos (§1.3)                                   |
   | «No se puede conectar al servidor» en el acto | La API no está en marcha o escucha en otro puerto   | Arránquela; el puerto es `PORT` del `.env` de la API                       |

3. **Abrir la app desde el ícono** y entrar.
4. **Si la app no llega:** en la pantalla de acceso o en cualquier pantalla de
   error de conexión, **«Cambiar servidor»** → escribir la dirección que sí
   abrió en Safari (con la IP: `http://192.168.x.y:3000`) → la app pregunta a
   `/health` y dice el resultado en palabras antes de aceptarla. La dirección
   se guarda y sobrevive al cierre de la app; cambiarla **cierra la sesión**, y
   hay que volver a entrar. «Reintentar» vuelve a probar sin cambiar nada.

   La app sólo acepta `http://` hacia una IP privada (10.x, 172.16–31.x,
   192.168.x) o un nombre `.local`; `https://` hacia cualquier destino.

### Plan B de red

Si la Wi-Fi del conjunto aísla a los clientes o bloquea el puerto:

- el **Mac con cable Ethernet a la red del conjunto** (así sigue alcanzando la
  cámara, la terminal y el videoportero), y
- el **Mac por Wi-Fi al Punto de acceso personal del iPhone** (Ajustes →
  Punto de acceso personal).

El iPhone y el Mac quedan en la red del punto de acceso; la API escucha en
todas las interfaces del Mac, así que el iPhone la alcanza por esa red. En la
app, «Cambiar servidor» con `http://<nombre>.local:3000` o con la IP del Mac en
esa red (`ipconfig getifaddr en0` con el Mac conectado al punto de acceso;
suele ser `172.20.10.x`). `[SUPUESTO]` S-90: el punto de acceso personal deja
pasar mDNS entre el iPhone y el Mac; si no, se usa la IP.

---

## 4 · Si la app no entra: qué dice y qué hacer

La pantalla de acceso nombra la causa con lo que el teléfono sabe (por qué red
sale y qué contestó el sistema), y ofrece **«Cambiar servidor»** y
**«Reintentar»** ahí mismo. Compare siempre con Safari (§3): si Safari abre
`/health` y la app no, el problema es de la app o de su permiso; si Safari
tampoco, de la red o del Mac.

| La app dice                                            | Causa                                      | Qué hacer                                                           |
| ------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------- |
| «El iPhone está usando datos móviles…»                 | Sale por la red del operador               | Misma red que el Mac; datos móviles apagados                        |
| «El iPhone no tiene red hasta el Mac…»                 | Sin Wi-Fi o red inalcanzable               | Conectar a la red del Mac                                           |
| «iOS no deja a la app usar la red local…»              | Permiso de red local negado                | Ajustes → Privacidad y seguridad → Red local → activar Next Control |
| «El Mac no contesta en …»                              | Cortafuegos del Mac, o el Mac cambió de IP | Permitir `node`; si usa la IP, «Cambiar servidor» con la nueva      |
| «El Mac contesta, pero el servidor no está en marcha…» | API apagada o en otro puerto               | Arrancar la API; comprobar `/health` en Safari                      |
| «La dirección … no existe…»                            | El nombre `.local` no resuelve (mDNS)      | «Cambiar servidor» con la IP                                        |
| «Código, usuario o contraseña incorrectos»             | Credencial                                 | Revisar la cuenta del residente en la consola                       |

`[SUPUESTO]` S-71: iOS no da un código propio para «permiso de red local
negado»; en la práctica el socket falla en el acto con «No route to host» u
«Operation not permitted» estando en Wi-Fi, y así lo clasifica la app. Se
confirma en sitio negando el permiso a propósito una vez.

---

## 5 · Lo que la app y la consola comparten

Las dos usan la misma API: lo que el portero rechaza en la consola aparece en
la app como **«Rechazada»** con su motivo en la siguiente recarga (20 s como
mucho con la app abierta, o al instante con «arrastrar para recargar»), y lo
que el residente crea o cambia en la app aparece en la consola sin recargar la
página (15 s como mucho). Lo único que vive sólo en el teléfono es la
**bandeja sin conexión**: una visita creada sin servidor queda «Pendiente de
envío» y se envía sola al reconectar, sin duplicarse.
