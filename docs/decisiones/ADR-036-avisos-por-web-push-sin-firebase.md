# ADR-036 · Avisos al residente por Web Push estándar, sin Firebase

|               |                                                                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**    | Aceptada · ronda 15-R (2026-10-03) · **decisión del cliente** (P-23 = sí, sin Firebase)                                                                                                                    |
| **Sustituye** | La fila «Push: Firebase Cloud Messaging» de CLAUDE.md §2.6 — `[CONTRADICCIÓN]` **C-53**, resuelta                                                                                                          |
| **Afecta a**  | `apps/api/src/eventos/infraestructura/web-push/` · `apps/api/src/residente` (suscripción) · migración 0052 · `apps/web/public/sw-avisos.js` y la pantalla Notificaciones · `apps/mobile` (sin SDK de push) |

---

## Lo incómodo primero

- **«Sin Firebase» no significa «sin Google».** En Chrome y en los navegadores
  basados en Chromium, el servicio de push del propio navegador **es** el de
  Google (`fcm.googleapis.com`); en Safari, el de Apple; en Firefox, el de
  Mozilla. Lo que esta decisión elimina es la **cuenta**, el **SDK** y la
  **llave de servidor** de Firebase: no hay proyecto de Firebase, ni
  `google-services.json`, ni `GoogleService-Info.plist`. La credencial es un par
  VAPID que genera Grupo Control, y el contenido viaja **cifrado de extremo a
  extremo** (RFC 8291): el servicio de push transporta el aviso y no puede leerlo.
- **En iPhone sólo hay avisos con la consola INSTALADA** en la pantalla de
  inicio y con iOS 16.4 o posterior. En Safari a secas, `PushManager` no
  existe. La consola lo detecta y explica cómo instalarla.
- **La app Flutter no recibe avisos con la app cerrada.** No lleva ningún SDK
  de push. Su bandeja se alimenta del historial de la API y se recarga cada
  20 s mientras está abierta. Quien quiera avisos con el teléfono en el
  bolsillo usa la consola instalada (Android o iPhone).

## Contexto

P-23 (15-N) preguntaba por qué canal llega al residente el «Avisar al
residente» de la guardia (HU-28, CU-03 alterno 1). Hasta la 15-R el
notificador era el provisional de la ETAPA 06, que **devolvía 1 sin enviar
nada**, y la guardia leía «no le llega a la app» (DT-15N-02). §2.6 del
contrato fijaba FCM para el push.

El cliente decidió (2026-10-03): avisos **sí**, **sin Firebase**, por Web Push
estándar a la consola web del residente instalada como PWA (E-06, ETAPA 14).
Android se distribuye como **APK firmado por descarga, sin tienda**
(`docs/guias/APK_FIRMADO.md`); el iPhone usa **sólo la PWA**.

## Decisión

1. **Transporte:** Web Push (RFC 8030) con contenido cifrado `aes128gcm`
   (RFC 8291 + RFC 8188) e identificación VAPID (RFC 8292), implementado con
   `node:crypto` y sin dependencias nuevas. El cifrado reproduce byte a byte el
   ejemplo del apéndice A de la RFC 8291 (prueba `web-push-cifrado.test.ts`).
2. **Mismo puerto:** `NotificadorPush` no cambia de forma (se añade un
   `destino` opcional, la pantalla que abre el aviso). Con las tres variables
   VAPID, `NotificadorWebPush`; sin ellas, `NotificadorPushSinLlaves`, que
   devuelve **0** y lo dice al arrancar y en cada aviso.
3. **Cuenta real:** el emisor devuelve a cuántos aparatos **aceptó** el
   servicio (201/202) y deja en la bitácora enviados, fallidos y retirados.
   Un 404/410 **retira** la suscripción (baja lógica con motivo).
4. **Suscripciones en la misma tabla** que `/mi/notificaciones/aparatos`
   (`dispositivos_de_notificacion`, ampliada por la 0052): plataforma `web`,
   `token` = endpoint, dos llaves y la **vivienda que la API resolvió**. RLS
   forzada; el residente sólo puede escribir una vivienda suya; un endpoint
   vivo es una fila en todo el sistema.
5. **Aislamiento por vivienda y por copropiedad:** el emisor lee con los
   claims de servicio de ESA copropiedad, filtra por vivienda y exige que el
   dueño de la suscripción **siga siendo residente activo** de ella.
6. **SSRF cerrado:** el endpoint lo da un cliente; sólo se admite si su host es
   de un servicio de push conocido (`WEB_PUSH_SERVICIOS_PERMITIDOS`), por HTTPS
   y sin seguir redirecciones. Se comprueba al suscribir y al enviar.
7. **Llaves:** la privada VAPID vive **sólo** en el entorno de la API (Secret
   Manager en Cloud Run). La pública llega a la consola por la API
   (`GET …/mi/notificaciones/web-push`), no por un `NEXT_PUBLIC_*`.
8. **Consola:** el permiso se pide **sólo tras un clic**; el service worker
   (`sw-avisos.js`) muestra el aviso y, al tocarlo, abre `/mi/notificaciones` o
   `/mi/historial` y ninguna otra ruta. **CSP y Permissions-Policy no se
   relajan**: la suscripción la hace el navegador con su servicio de push (no es
   un `fetch` de la página) y las notificaciones no son una capacidad de
   Permissions-Policy.

## Consecuencias

- DT-15N-02 **cerrada**: «Avisar al residente» envía el aviso y dice a cuántos
  aparatos llegó; con cero, lo dice como cero y pide avisar por teléfono.
- Rotar el par VAPID **invalida todas las suscripciones**: cada navegador se
  suscribió con la pública vieja. El procedimiento está en
  `docs/guias/AVISOS_WEB_PUSH.md` §5.
- Un navegador compartido entre dos cuentas del mismo conjunto: al suscribirse
  la segunda, la fila de la primera se da de baja en la misma transacción.

## Alternativas descartadas

- **FCM con su SDK** (lo que decía §2.6): exige proyecto de Firebase y sus
  ficheros de configuración. Descartado por decisión del cliente.
- **La librería `web-push` de npm:** cinco dependencias transitivas para algo
  que `node:crypto` hace en ~100 líneas probadas contra la RFC. La 15-U dejó
  `pnpm audit` en cero; no se reabre por esto.
- **APNs/FCM nativos en Flutter:** exigirían, otra vez, las cuentas que el
  cliente descartó.
