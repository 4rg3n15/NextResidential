# La app del residente en un iPhone físico, contra el Mac

**Para qué:** instalar la app en el iPhone de la entrega y que inicie sesión
contra la API que corre en el Mac, por la red local. **Quién:** quien lleva el
Mac a sitio. **Cuándo:** antes de la prueba del residente (ETAPA 15-L, E3).

> Las pruebas de residente, superadministrador y portero se hacen desde el
> mismo Mac; las de residente, además, desde el mismo iPhone.

---

## Lo incómodo primero: la app sólo arranca lanzada desde el Mac

La entrega es por `http://` en la red local, sin certificado. iOS bloquea ese
tráfico (App Transport Security) salvo con la excepción `NSAllowsLocalNetworking`,
y **por decisión del cliente esa excepción sólo existe en la compilación Debug**
(`ios/Flutter/Debug.xcconfig`; nunca en Release ni en Profile, nunca
`NSAllowsArbitraryLoads`).

Una app Flutter en Debug, en iOS 14 o posterior, **no se abre desde el ícono**:
sólo la lanza el Mac (`flutter run` o Xcode), y se cierra si el Mac se
desconecta. Consecuencias para la entrega:

- el iPhone queda **conectado al Mac** (cable, o depuración por Wi-Fi) durante
  toda la prueba del residente;
- si alguien cierra la app, se vuelve a lanzar con el mismo `flutter run`;
- la salida sin estas limitaciones es HTTPS con un certificado de confianza, y
  es condición de producción, no de esta entrega.

---

## 1 · Antes de compilar: que el iPhone llegue al Mac (Safari)

Esta comprobación decide de quién es el problema. **Si Safari no llega, la app
tampoco llegará, y no es la app.**

1. Mac e iPhone en **la misma Wi-Fi**. En el iPhone, **datos móviles apagados**
   (Ajustes → Datos móviles): con ellos, el iPhone puede salir por la red del
   operador, donde la IP privada del Mac no existe.
2. En el Mac, la dirección local:
   ```
   ipconfig getifaddr en0
   ```
   (si el Mac va por cable, `en1` u otra; `ifconfig` las lista).
3. La API en marcha en el Mac (`pnpm --filter @ncr/api dev`, o el arranque de la
   guía de sitio). En el Mac, `curl http://localhost:3000/health` contesta.
4. **En Safari del iPhone**, abrir `http://<IP-del-Mac>:3000/health`.

| Lo que pasa en Safari                         | Causa                                                                     | Qué hacer                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Muestra el estado de la API                   | La red está bien                                                          | Siga al paso 2                                                                                                                 |
| Se queda cargando y termina sin respuesta     | El **cortafuegos del Mac** descarta la conexión, o la IP no es la del Mac | Ajustes del Sistema → Red → Cortafuegos → Opciones: **permitir conexiones entrantes de `node`**. Vuelva a mirar la IP (paso 2) |
| «No se puede conectar al servidor» en el acto | La API no está en marcha, o escucha en otro puerto                        | Arránquela; el puerto es `PORT` del `.env` de la API                                                                           |
| «No se puede abrir la página» / sin red       | El iPhone no está en la Wi-Fi del Mac o usa datos móviles                 | Misma Wi-Fi; datos móviles apagados                                                                                            |

`pnpm sitio:ensayo` imprime esta misma comprobación con la IP del Mac ya puesta.

---

## 2 · Compilar e instalar

1. **Modo desarrollador** en el iPhone (iOS 16+): Ajustes → Privacidad y
   seguridad → Modo desarrollador → activar y reiniciar.
2. Conectar el iPhone al Mac por cable y **confiar** en el Mac cuando lo
   pregunte.
3. Identificar el iPhone:
   ```
   flutter devices
   ```
4. Lanzar la app en Debug contra la API del Mac:
   ```
   cd apps/mobile
   flutter run -d <id-del-iPhone> \
     --dart-define=API_URL=http://<IP-del-Mac>:3000 \
     --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
     --dart-define=SUPABASE_PUBLISHABLE_KEY=<sb_publishable_…>
   ```
   Los valores salen del `.env` local del Mac. **Ninguno es secreto** (la llave
   es la publicable): todo `--dart-define` es extraíble del binario, y la app se
   niega a arrancar con una `sb_secret_…`.
5. La primera vez, iOS no deja abrir una app de un desarrollador que no conoce:
   Ajustes → General → VPN y gestión de dispositivos → el perfil del
   desarrollador → **Confiar**. Vuelva a lanzar el paso 4.
6. **Permiso de red local.** Al primer intento de entrar, iOS pregunta si la app
   puede buscar dispositivos en la red local: **Permitir**. Si alguien lo negó:
   Ajustes → Privacidad y seguridad → Red local → activar Next Control.

---

## 3 · Si la app no entra: qué dice y qué hacer

La pantalla de acceso ya no dice «No hay conexión» a secas: nombra la causa con
lo que el teléfono sabe (por qué red sale y qué contestó el sistema). Compare
siempre con Safari (§1): si Safari abre `/health` y la app no, el problema es de
la app o de su permiso; si Safari tampoco, de la red o del Mac.

| La app dice                                             | Causa                                      | Qué hacer                                                                            |
| ------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| «El iPhone está usando datos móviles…»                  | Sale por la red del operador               | Misma Wi-Fi que el Mac; datos móviles apagados                                       |
| «El iPhone no tiene red hasta el Mac…»                  | Sin Wi-Fi o red inalcanzable               | Conectar a la Wi-Fi del Mac                                                          |
| «iOS no deja a la app usar la red local…»               | Permiso de red local negado                | Ajustes → Privacidad y seguridad → Red local → activar Next Control                  |
| «El Mac no contesta en … Abra …/health en Safari…»      | Cortafuegos del Mac, o el Mac cambió de IP | Permitir `node` en el cortafuegos; si cambió la IP, repetir el paso 2.4 con la nueva |
| «El Mac contesta, pero el servidor no está en marcha…»  | API apagada o en otro puerto               | Arrancar la API; comprobar `/health` en Safari                                       |
| «La dirección con que se instaló la app (…) no existe…» | `API_URL` mal escrita al compilar          | Repetir el paso 2.4 con la IP correcta                                               |
| «Código, usuario o contraseña incorrectos»              | Credencial                                 | Revisar la cuenta del residente en la consola                                        |
| «Falta API_URL…» (pantalla propia al abrir)             | Se compiló sin `--dart-define=API_URL`     | Repetir el paso 2.4                                                                  |

En Debug, bajo el aviso, **«Detalle técnico»** enseña la URL compilada, el tipo
de error y el mensaje del sistema (sin tokens). Es lo que hay que copiar si se
pide ayuda.

`[SUPUESTO]` S-71: iOS no da un código propio para «permiso de red local
negado»; en la práctica el socket falla en el acto con «No route to host» u
«Operation not permitted» estando en Wi-Fi, y así lo clasifica la app. Se
confirma en sitio negando el permiso a propósito una vez.
