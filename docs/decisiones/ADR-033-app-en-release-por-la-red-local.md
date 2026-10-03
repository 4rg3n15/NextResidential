# ADR-033 · La app del residente en Release, por la red local, con el servidor configurable y sincronizada con la consola

|               |                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**    | Aceptada · corrección de la ETAPA 15-L (2026-09-27) · **requisito del cliente**, literal abajo                                                                                                                                                                    |
| **Sustituye** | La decisión A6 de la 15-E («App Transport Security sólo en depuración») y la fila E1 de los puntos de parada de la 15-L. **Ninguna de las dos la tomó el cliente**: fueron decisiones del agente, y así se registran ahora                                        |
| **Afecta a**  | `apps/mobile/ios/Runner/Info.plist` · `ios/Flutter/*.xcconfig` · `scripts/lib/info-plist-ios.mjs` · la app (servidor, recarga, notificaciones, bandeja) · `GET …/mi/notificaciones` · la consola (recarga de listas) · `APP_EN_IPHONE.md` · `ENTREGA_EN_SITIO.md` |

---

## Contexto

El cliente, por escrito:

> «la app debe poder funcionar en modo normal, no estrictamente en modo
> depuración, y debo poder abrirla sin estar conectado a cable»; «en sitio la
> app debe funcionar igual que en casa, sin error de conexión con el
> servidor»; «la información de la app debe sincronizarse con la de la consola
> web, porque ambas comparten información».

Hasta aquí la guía del iPhone decía que la excepción de App Transport Security
existía sólo en Debug **«por decisión del cliente»**. No era cierto, por dos
lados:

1. **No fue decisión del cliente.** La excepción sólo en depuración la
   introdujo la 15-E (A6) como precaución del agente; en la 15-L el agente la
   mantuvo (E1, «SUSTITUIDO») tras el Bloque 0.5. La guía la atribuyó al
   cliente.
2. **Contradecía el propio Bloque 0.5.** Dio usa `dart:io`, que abre sockets
   POSIX y **no pasa por ATS**: la excepción no era la que impedía entrar desde
   el iPhone, y quitarla de Release no protegía nada del transporte de la app.
   Lo que sí alcanza a `dart:io` es el **permiso de red local**
   (`NSLocalNetworkUsageDescription`), que ya estaba en todas las
   configuraciones.

Y la consecuencia práctica de «sólo Debug» era la que el cliente rechaza: una
app Flutter en Debug, en iOS 14 o posterior, no se abre desde el ícono; sólo la
lanza el Mac y se cierra al desconectarlo.

## Decisión

1. **Release, abierta desde el ícono.** La app se compila en Release, se
   instala una vez y se abre después sin cable ni Mac conectado; sólo hace
   falta estar en la misma red que la API.
2. **App Transport Security igual en Debug, Release y Profile:**
   `NSAllowsLocalNetworking = true` —relaja ATS sólo para lo local—, **nunca**
   `NSAllowsArbitraryLoads`. `NSLocalNetworkUsageDescription` en todas.
   El Info.plist deja de preprocesarse. `scripts/lib/info-plist-ios.mjs` lee
   del proyecto de Xcode el `.xcconfig` de cada configuración del target y
   falla si cualquiera de las tres pierde algo de lo anterior; su prueba
   negativa reintroduce exactamente la variante «sólo en depuración».
3. **Un servidor que no cambia de red a red.** El valor compilado admite un
   nombre `.local` (`--dart-define=API_URL=http://<nombre>.local:3000`), que
   `dart:io` resuelve por `getaddrinfo` → mDNSResponder. En la pantalla de
   acceso, **«Servidor»** deja ver y cambiar la dirección:
   - `http://` sólo hacia IP privadas (10/8, 172.16/12, 192.168/16) o nombres
     `.local`; `https://` hacia cualquier destino; con puerto;
   - antes de aceptarla se pide `GET /health` y el resultado se dice en
     palabras;
   - se guarda en el almacenamiento seguro y sobrevive al cierre;
   - cambiarla cierra la sesión (la sesión es de un servidor).
     Si la red del conjunto bloquea mDNS, el nombre no resuelve; toda pantalla
     de error de conexión ofrece «Cambiar servidor» y «Reintentar» ahí mismo.
4. **Una sola fuente de verdad: la API.** Nada del negocio vive sólo en el
   teléfono, salvo la bandeja sin conexión:
   - la pantalla visible se recarga cada 20 s en primer plano (backoff ante
     errores, nunca dos peticiones iguales a la vez, «renovar token → pedir»),
     y siempre al volver a primer plano;
   - la situación de cada visita la calcula el servidor (`situacion`,
     `motivoRechazo` en `GET …/mi/autorizaciones`);
   - las notificaciones salen de `GET …/mi/notificaciones`, acotado a la
     vivienda del residente;
   - la consola vuelve a pedir Visitantes, Residentes y Vehículos al recuperar
     el foco y cada 15 s.
5. **Sin push.** Sin Firebase no hay avisos con la app cerrada; la app lo dice
   en lenguaje de usuario —«Los avisos llegan mientras la app está abierta»—
   y no hay interruptores que prometan otra cosa.

## Condición de producción

Esto es para la entrega **por HTTP en la red local del conjunto**. En esa red,
el tráfico entre la app y la API —incluido el token de sesión— viaja sin
cifrar y lo puede leer cualquiera conectado a ella. **La salida a producción
exige HTTPS** con un certificado de confianza; con él, la excepción de ATS
sobra y la opción «Servidor» ya admite `https://` hacia cualquier destino.

## Alternativas consideradas

- **Seguir sólo en Debug.** Rechazada por el cliente: exige el Mac conectado.
- **`NSAllowsArbitraryLoads`.** Rechazada: abre HTTP hacia cualquier destino,
  no sólo la red local, y no hace falta.
- **Sólo la IP en el valor compilado.** Rechazada como único camino: la IP
  cambia entre la casa y el sitio. Queda como plan B desde «Cambiar servidor».
- **Push con Firebase.** Fuera de esta corrección: exige cuentas y llaves del
  cliente que no existen todavía.
  _Cerrado en la ronda 15-R por [ADR-036](ADR-036-avisos-por-web-push-sin-firebase.md):
  no habrá Firebase; los avisos con la app cerrada llegan por Web Push a la
  consola instalada, y la app sigue diciendo que avisa sólo mientras está abierta._

## Consecuencias

- **Firma con Apple ID gratuito: la app caduca a los 7 días** y hay que
  reinstalarla con cable antes de que venza. No es un fallo de la app.
- El ciclo de 20 s multiplica las lecturas por teléfono abierto; son lecturas
  pequeñas y acotadas por vivienda, y se detienen en segundo plano.
- La prueba de sincronización en los dos sentidos corre contra la API y
  PostgreSQL (`visitas-pg.test.ts` §3i, `residentes-y-vehiculos-pg.test.ts`);
  el ciclo de recarga de la app, con reloj falso, en su suite.
