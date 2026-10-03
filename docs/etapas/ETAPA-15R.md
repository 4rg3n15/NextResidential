# ETAPA 15-R · Huecos funcionales, decisiones del cliente y documentación

**Rama:** `etapa-15r-huecos-y-decisiones` · **Base:** `develop` con la 15-U fusionada (`7b31083`, merge del PR #41) ·
**PR:** [4rg3n15/NextResidential#42](https://github.com/4rg3n15/NextResidential/pull/42), sin fusionar · **Fecha:** 2026-10-03 ·
**Decisiones del cliente que aplica:** P-20, P-23, P-25, P-26, P-29, P-30 y AR-04 · **Cierra:** P-31, C-37, DT-15N-01, DT-15N-02, H-15J-01, H-15K-01, DT-15K-02

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Cierra huecos funcionales, aplica siete decisiones del cliente y pone la
> documentación al día. Nada de lo nuevo se ha ejercido contra un equipo real
> ni contra un despliegue real.

**Lo incómodo primero.**

1. **Nada de esto está desplegado ni probado contra los servicios reales.** Web
   Push se probó contra un servicio de push **falso** que verifica la firma
   VAPID y descifra el mensaje —reproduce byte a byte el ejemplo de la RFC 8291—,
   no contra Chrome, Firefox o Safari. El flujo directo a la API (P-20) se probó
   contra la API y el BFF reales en local, no contra Netlify y Cloud Run. El
   TURN (P-29) es configuración y guía: no hay ninguna máquina. La puerta libre
   o bloqueada (P-25) se probó contra el simulador y por el túnel del Edge, no
   contra un videoportero.
2. **Que `close` devuelva una puerta a su modo normal es un supuesto**
   (S-15R-03): lo dice la documentación ISAPI, nadie lo ha visto. Hasta probarlo,
   la consola registra la reversión como «aceptada por el equipo», no como
   «puerta en modo normal», y la guía de validación (§8.4.3) dice que, si falla,
   **el modo libre no se usa en producción**. Y una corrección sobre mi propio
   trabajo: el commit del bloque C afirmaba que esa guía ya pedía la prueba; no
   la pedía. Se añadió en el bloque G.
3. **AR-03 no se pudo verificar contra el proyecto real**: este entorno no tiene
   credenciales del proyecto de Grupo Control, y no debe tenerlas (§2.7.1).
   Queda redactada con el procedimiento exacto para que usted la cierre con un
   `supabase db push` y tres consultas.
4. **La rotación de la llave maestra tiene una ventana.** Entre recifrar y
   desplegar la API con la llave nueva —alrededor de un minuto con una
   instancia— la API todavía con la anterior no abre lo ya rotado: las órdenes
   a equipos en modo directo fallan con error y las cámaras reintentan. Nunca se
   abre un secreto equivocado, pero hay que hacerlo en horario de poco tráfico.
5. **Los registros llevaban las cuentas mal**, y no desde esta ronda: el resumen
   de contradicciones decía 42 y había 43; el de supuestos decía 150, ESTADO
   decía 154, y por fila hay 161 (160 vigentes). Se recontaron por sección y
   por fila, y se dice en cada resumen.
6. **El iPhone no tendrá avisos en la app**, ni con la app cerrada ni con un
   cambio futuro sin Firebase: los avisos llegan a la **consola instalada** como
   PWA (iOS 16.4 o posterior). Es la decisión P-23 aplicada, no una limitación
   escondida.

---

## 1 · Qué se construyó

**A · Lo que se perdía al reiniciar.** Los códigos de recuperación del segundo
factor, los bloqueos de acceso y las operaciones de dispositivo pendientes
vivían en memoria: un reinicio de la API los borraba. Ahora viven en
PostgreSQL con RLS forzada, sin borrado físico, y un solo uso garantizado por
la base. La prueba escribe con una API, la cierra y lee con otra.

**B · Avisos al residente sin Firebase (P-23).** El «Avisar al residente» de la
guardia y los avisos de visita llegan al teléfono del residente por **Web Push
estándar** a la consola instalada como PWA: cifrado `aes128gcm` y firma VAPID
hechos con `node:crypto`, sin dependencias nuevas ni cuentas de terceros. El
residente los activa por aparato; la guardia sabe a cuántos llegó. La app
Flutter no lleva SDK de push y lo dice.

**C · Puerta libre o bloqueada (P-25).** La administración puede dejar **una**
puerta libre o bloqueada, con motivo y plazo; vuelve sola a normal aunque la
API se reinicie, y una franja lo dice en toda la consola mientras dure.

**D · La consola en Netlify con flujos largos (P-20).** El tiempo real y el
audio ya no pasan por las funciones de Netlify: van **directos a la API** en
Cloud Run con un billete de un solo uso, atado al usuario, la copropiedad y la
IP que la consola firma. CORS por lista blanca y `connect-src` sólo hacia la
API.

**E · Ocho defectos conocidos.** Escrituras durante el cambio de copropiedad,
adaptadores que presentaban claims vacíos, la recurrente del residente sin sus
filas de patrón, el cierre de sesión con Supabase caído, una carrera en las
alertas, el evento que la nube rechaza para siempre (P-31, cuarentena en el
Edge), referencias largas sin constancia y la recuperación por correo
desactivada en producción (AR-04).

**F · Seguridad.** Un registro único de aceptaciones de riesgo; la **rotación de
la llave maestra de la bóveda con recifrado**, para que un respaldo previo deje
de abrir credenciales al destruir la llave anterior; y la guía de coturn.

**G · Documentación.** README al día hasta esta ronda, manual de usuario con la
consola del residente, pulsar para hablar, selector de punto y puertas, guías de
visita archivadas, atribución corregida en ESTADO y el registro de decisiones al
día.

## 2 · Cómo se organizó y por qué

**A · La base decide el «un solo uso», no el código.** `consumir` un código de
recuperación es **un único `UPDATE` condicionado**: dos peticiones a la vez no
pueden gastar el mismo código, porque sólo una ve la fila sin gastar (ADR-04).
Regenerar retira el juego anterior con `retirado_en` en vez de borrarlo
(RN-19). Con `PERSISTENCIA_DE_EVENTOS` distinto de `postgres` siguen los
adaptadores en memoria de siempre (R1), y la composición vive en ficheros
nuevos para que ningún módulo crezca.

**B · Web Push implementado, no importado.** Una biblioteca de push habría
traído dependencias y su propia superficie; el estándar son tres RFC y
`node:crypto` los cubre. La prueba que lo sostiene no es «se envió»: un
servicio falso **verifica la firma y descifra el cuerpo**. Sin llaves VAPID la
API arranca —desarrollo y CI son despliegues legítimos— y `NotificadorPushSinLlaves`
devuelve 0 y lo dice: nunca un éxito fingido. Una lista de servicios admitidos
cierra el SSRF que abriría aceptar cualquier endpoint, y las suscripciones que
el servicio da por muertas (404/410) se retiran. Un hallazgo de las pruebas:
unas 4 de cada 1000 llaves privadas ECDH salen con 31 bytes; se rellenan en vez
de rechazarse.

**C · El mismo puerto, y la reversión en la base.** `alwaysOpen`/`alwaysClose`
entran por `fijarModoDeSalida` del puerto que ya existía, así que funcionan en
directo, simulado y por el túnel del Edge sin tocar el dominio. La reversión no
es un temporizador en memoria: un trabajo de pg-boss lee cada minuto la tabla
append-only `ordenes_de_modo_de_puerta`, de modo que sobrevive al reinicio; si
el equipo o el túnel no contestan, reintenta con espera exponencial y abre una
alerta alta persistente (RN-18). Sólo administración, motivo obligatorio y tope
de plataforma de 12 h (S-15R-04).

**D · El billete en vez del token en la URL.** Un `EventSource` o un WebSocket
no pueden llevar cabecera `Authorization`; poner el JWT en la URL lo dejaría en
registros. El billete dura 15 s, sirve una vez y está atado a usuario, rol,
copropiedad, propósito e IP. La IP es el punto delicado: detrás de Netlify la
consola la lee **sólo** de la cabecera de confianza de Netlify y la firma con
HMAC; la API la adopta como `req.ip` sólo con firma válida de menos de 60 s.
Sin esas variables todo sigue como en sitio, por el proxy (R1).

**E · Lo más delicado era E2.** Ocho adaptadores presentaban `{}` como claims y
funcionaban porque la conexión de pruebas era superusuario: con un rol sin
`BYPASSRLS`, como el de producción, habrían devuelto vacío. Ahora presentan los
claims de servicio de la copropiedad de cada operación, y la migración 0054
deja al servicio leer los usuarios **de su** copropiedad. La prueba corre con un
rol sin `BYPASSRLS` y por los dos caminos del aislamiento. Dos cambios de
aserción quedan declarados (C-54, C-55): las dos pruebas afirmaban el defecto.

**F · Las dos llaves juntas sólo en una herramienta de un solo uso.** H-15B-1
había descartado recifrar porque obligaba a tener las dos llaves en un proceso
(C-56). La API sigue conociendo una sola; la rotación la hace
`scripts/rotar-llave-de-equipos.mjs`, un proceso aparte que vive lo que dura
(D-66 rige dentro de la API) y recibe la llave anterior por la entrada
estándar. Cada copropiedad va en su transacción con claims de servicio y se
comprueba con la nueva antes de confirmar; un sobre vigente que no abre con
ninguna detiene todo nombrando la fila, y el historial de una llave más antigua
—lo que dejaba el procedimiento viejo— se cuenta y se deja.

**G · Lo que no se reescribe.** Los informes de etapa y los documentos de
auditoría de la ETAPA 00 son historia: donde citaban FCM se añadió la enmienda,
no se borró lo que decían. Las guías de visita pasadas se archivaron con una
línea de motivo, y lo que seguía valiendo se llevó a `ENTREGA_EN_SITIO.md`.

## 3 · Árbol de archivos

```
apps/api/src/
├─ autenticacion/infraestructura/codigos-mfa-pg.ts, composicion-codigos-mfa.ts   A · códigos de recuperación en PG
├─ tablero/infraestructura/operaciones-con-rastro-pg.ts, composicion-de-operaciones.ts   A · operaciones de dispositivo
├─ guardia/infraestructura/registro-de-bloqueos-pg.ts, composicion-de-bloqueos.ts   A · bloqueos de acceso
├─ eventos/infraestructura/web-push/   B · cifrado, VAPID, notificador, sin llaves, suscripciones, composición
├─ residente/aplicacion/avisos-web.ts · presentacion/mis-avisos-web.controller.ts, dtos-avisos-web.ts   B · suscribirse y darse de baja
├─ residente/infraestructura/suscripciones-del-navegador-pg.ts · web-push.providers.ts   B
├─ guardia/aplicacion/aviso-al-residente.ts · infraestructura/composicion-del-aviso.ts   B · «Avisar al residente» que envía
├─ comun/servicios-de-push.ts · configuracion/esquema-de-avisos.ts, esquemas-adicionales.ts   B · lista de servicios y variables
├─ guardia/aplicacion/modo-de-puerta.ts, fijar-modo-de-puerta.ts, reversion-de-puertas.ts   C · reglas y casos de uso
├─ guardia/infraestructura/accionador-de-modo.ts, ciclo-de-reversion.ts, modos-de-puerta-{pg,en-memoria}.ts, composicion-de-modos.ts   C
├─ guardia/presentacion/modos-de-puerta.controller.ts, dtos-modos.ts   C
├─ comun/billetes-de-un-solo-uso.ts, ip-firmada.ts, origen-de-la-actualizacion.ts · configuracion/esquema-de-despliegue.ts   D
├─ eventos/presentacion/escritor-sse.ts, flujo-directo.controller.ts   D · el mismo SSE, por billete
├─ comun/claims-por-operacion.ts   E2 · claims de servicio por copropiedad
├─ residente/infraestructura/patron-de-la-visita-pg.ts   E3 · filas de patrón de la recurrente
├─ cuentas/aplicacion/revocacion-con-reintento.ts · cuentas/composicion-del-cierre.ts   E4
├─ eventos/aplicacion/fila-por-clave.ts   E5 · alertas en serie por equipo
├─ edge/aplicacion/alerta-de-rechazo.ts, referencia-de-la-constancia.ts   E6, E7
└─ equipos/infraestructura/rotacion-de-la-boveda-pg.ts   F2
apps/edge/src/aplicacion/cuarentena.ts · infraestructura/sqlite/cuarentena-sqlite.ts   E6 · P-31
apps/web/
├─ public/sw-avisos.js · src/app/(consola)/mi/notificaciones/avisos-en-este-aparato.tsx · src/lib/avisos-web.ts   B
├─ src/app/(consola)/dispositivos/modo-de-la-puerta.tsx · src/componentes/franja-de-puertas.tsx   C
├─ src/lib/configuracion-de-despliegue.ts, ip-firmada.ts, origen-directo.ts   D
├─ src/lib/cambio-de-copropiedad.ts   E1
└─ src/lib/recuperacion.ts · src/app/acceso/enlace-de-recuperacion.tsx, segun-recuperacion.tsx   E8
packages/providers/src/equipo/modo-de-puerta.ts   C · `fijarModoDeSalida` en Hikvision, simulado y túnel
supabase/migrations/0051 a 0054 · reversion/0051 a 0054 · policies/tests/99h a 99k   A, B, C, E2
scripts/generar-llaves-vapid.mjs (B) · scripts/rotar-llave-de-equipos.mjs (F2)
docs/
├─ decisiones/ADR-036-avisos-por-web-push-sin-firebase.md   B
├─ guias/AVISOS_WEB_PUSH.md, APK_FIRMADO.md (B) · COTURN.md (F3) · CONEXION_SUPABASE.md §13 (F2) · CONSOLA_EN_RED_Y_DESPLIEGUE.md §7 (D)
├─ guias/archivo/PROXIMA-VISITA-15N.md, VISITA-29-09.md   G3 · archivadas con su motivo
├─ seguridad/ACEPTACIONES_DE_RIESGO.md   F1
└─ etapas/ETAPA-15R.md   este informe
```

Pruebas nuevas: 17 ficheros en `apps/api/test/` (dos de ellos dobles: el
navegador con push y el servicio de push falso), uno en `apps/api/src`, uno en
`apps/edge/test`, seis en `apps/web`, uno en `packages/providers` y cuatro
de políticas SQL (`99h` a `99k`).

## 4 · Tabla SOLID

Comprobación mecánica (§2.3): **ningún fichero nuevo supera 300 líneas** (el
mayor, `rotacion-de-la-boveda-pg.ts`, 297) y **ningún fichero existente de
código, pruebas, guiones o configuración crece** frente a `origin/develop`; los
únicos que crecen son los del cliente Dart **generado** (excepción declarada).

| Bloque             | SRP                                                                                 | OCP                                                                                    | LSP                                                                                                | ISP                                                  | DIP                                                           |
| ------------------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| A · persistencia   | Un adaptador por tabla (códigos, bloqueos, operaciones) y la composición aparte     | Se elige el adaptador por configuración sin tocar los casos de uso                     | El adaptador PG y el de memoria pasan las mismas pruebas                                           | Los puertos de siempre, sin métodos nuevos           | Los casos de uso dependen del puerto; Nest inyecta por token  |
| B · Web Push       | Cifrado, VAPID, envío, suscripciones y «sin llaves» en ficheros distintos           | Un notificador nuevo detrás del puerto `Notificador`, sin cambiar a quien lo usa       | `NotificadorWebPush` y `NotificadorPushSinLlaves` intercambiables; el segundo devuelve 0, no finge | El residente ve suscribir/baja; la guardia, «avisar» | La guardia conoce el puerto de aviso, no el protocolo         |
| C · modo de puerta | Regla, fijar, revertir y accionar separados                                         | `fijarModoDeSalida` se añade al puerto de salidas; cada proveedor lo implementa        | Hikvision, simulado y vía Edge cumplen el mismo contrato                                           | Puerto de salidas pequeño; ningún `NotImplemented`   | El dominio pide «libre/bloqueada/normal», no `alwaysOpen`     |
| D · flujo directo  | Billete, IP firmada y origen de la actualización, cada uno en su fichero            | El billete es genérico por propósito: SSE y audio lo comparten                         | El SSE directo y el del proxy usan el mismo escritor                                               | El billete expone emitir y consumir                  | Controladores dependen del almacén de billetes inyectado      |
| E · defectos       | Cada corrección en su pieza (cola por clave, revocación con reintento, cuarentena)  | La cuarentena es opcional en la reconciliación: sin ella, el comportamiento de siempre | Cuarentena SQLite y doble de prueba intercambiables                                                | `Cuarentena` con un solo método                      | La reconciliación conoce el puerto, no SQLite                 |
| F · bóveda         | La rotación no comparte código con la API en marcha salvo las primitivas de cifrado | Un propósito nuevo de la bóveda se añade a la rotación sin tocar las demás             | —                                                                                                  | Una función pública de rotación y una de validación  | La herramienta inyecta el `Pool`; la lógica no lee el entorno |

## 5 · Trazabilidad

| Requisito                                                      | Cubierto por                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **HU-28, CU-03 alterno 1** · avisar al residente               | B: el aviso sale y la guardia sabe a cuántos llegó (DT-15N-02 cerrada)                                                    |
| **HU-34** · notificaciones al residente                        | B: Web Push a la consola instalada; la app lo dice sólo con la app abierta                                                |
| **RN-08, CA-16/17** · motivo obligatorio                       | C: sin motivo no se fija un modo (400)                                                                                    |
| **RN-18, CA-18** · escalamiento                                | C: reversión fallida → alerta alta persistente; E6: rechazo permanente → alerta                                           |
| **RN-02, RN-17, CA-22, KPI-29** · nada se pierde, una sola vez | E6: cuarentena con cuerpo y motivo; el transporte no cuenta; la bandeja sigue                                             |
| **RN-15, CA-24, KPI-36/37** · aislamiento                      | E2 con rol sin `BYPASSRLS` por los dos caminos; D: billete atado a copropiedad; suite de aislamiento con las rutas nuevas |
| **RN-20, CA-25** · MFA                                         | A: códigos de recuperación de un solo uso que sobreviven al reinicio                                                      |
| **RN-21** · credencial por referencia                          | F2: `llave_ref` nueva tras rotar; las claves nunca en registros ni errores                                                |
| **RN-22, CA-06** · patrón de recurrencia                       | E3: la recurrente del residente se crea con sus filas; un patrón inválido se niega                                        |
| **OE-06, CU-04** · Edge                                        | E6 y E7 en el Edge                                                                                                        |
| **OE-07** · guardia virtual                                    | D: audio y tiempo real fuera de Netlify; C: puertas desde la consola                                                      |
| **KPI-32, KPI-33** · latencias                                 | **Parcial:** el flujo directo quita un salto, pero no se midió contra Cloud Run                                           |

## 6 · Pruebas

### Qué se probó y cómo

- **Unitarias y de integración** de cada bloque (listadas en §3), sin hardware.
- **Contra PostgreSQL**, con el rol `authenticated` sin `BYPASSRLS` donde la RLS
  es lo que se prueba: persistencia tras reinicio (A), suscripciones (B), modo
  de puerta y reversión tras reiniciar (C), claims de servicio (E2), recurrente
  (E3), rotación de la bóveda (F2, 10 casos).
- **Políticas SQL** `99h` a `99k`, con prueba negativa por política.
- **Web Push** contra un servicio falso que verifica VAPID y descifra
  (`apps/api/test/dobles/servicio-de-push-falso.ts`).
- **Regresiones de R1** sin tocar una aserción salvo C-54 y C-55, declaradas.

Cómo ejecutarlas: `./scripts/verificar-etapa.sh --con-base` (base local en
`DATABASE_URL_PRUEBAS`), o por paquete `pnpm --filter @ncr/api test`.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Corrida sobre `5566b8e`, con base (`DATABASE_URL_PRUEBAS`), desde un árbol
limpio de artefactos:

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El declarado es **D-112**: las pruebas saltadas del arranque en frío, que ejerce
el paso 12b. **31 de 31 pasos**; **5137 pruebas de TypeScript** (API 2262,
proveedores 1231, consola 783, dominio 438, Edge 279, configuración 144) y **367
de Dart**, tres corridas forzadas idénticas; el ensayo de sitio contra los
equipos simulados, «SIN FALLOS · 47 OK»; la suite de Dart da lo mismo en otro
huso.

### Cobertura por capa

| Capa                                          | Líneas                      | Ramas   | Umbral         |
| --------------------------------------------- | --------------------------- | ------- | -------------- |
| Dominio (`packages/domain-core`)              | 96,20 %                     | 96,91 % | 90 %           |
| Aplicación (`**/aplicacion/**`, 152 ficheros) | 97,18 %                     | 90,64 % | 90 %           |
| Global (948 ficheros)                         | 87,66 %                     | 87,05 % | 70 %           |
| App · dominio / aplicación / global           | 98,05 % / 96,89 % / 89,68 % | —       | 90 / 90 / 70 % |

### Lo que destapó el verificador, y se corrigió en la ronda

Las dos corridas anteriores salieron **FALLIDAS**, y las dos por defectos míos de
esta ronda que ninguna prueba unitaria veía:

1. **`next build` no compilaba la consola** (corrida 1, paso 3). El gancho del
   cambio de copropiedad (E1) usaba `useEffect`/`useRef`/`useState` sin
   `'use client'`, y el cliente de la API —que llega a componentes de servidor—
   lo importaba. Se separó en un módulo de cliente (`dbaf167`).
2. **La herramienta de rotación abría un `Pool` sin oyente de `'error'`**
   (corrida 2, `frontera-conexiones`, 15-O): un corte de la base habría
   terminado el proceso a mitad de la rotación. Se le añadió (`5566b8e`).

El resto de la corrida 2 —estabilidad incluida— ya estaba verde.

## 7 · Verificación de seguridad (§2.7)

| §2.7              | Qué hizo esta ronda                                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 · Secretos      | Llaves VAPID, secreto de IP firmada y llaves de la bóveda sólo por entorno o Secret Manager; la llave anterior de la rotación entra por la entrada estándar; la llave de firma del APK, fuera del repositorio (`APK_FIRMADO.md`). Escaneo de secretos limpio |
| 2 · CORS          | Sin cambios: lista blanca. El WebSocket de audio rechaza con 403 un `Origin` fuera de ella                                                                                                                                                                   |
| 3 · Validación    | DTOs nuevos con cota por campo (`longitud-por-campo`); motivo obligatorio en el modo de puerta                                                                                                                                                               |
| 4 · Inyección     | Consultas parametrizadas; los lotes de la rotación van por `unnest` con parámetros                                                                                                                                                                           |
| 5 · Rate limiting | Las rutas nuevas heredan el global; emitir billetes y fijar modos pasan por sesión y rol                                                                                                                                                                     |
| 6 · RLS           | Cuatro migraciones con RLS forzada y prueba negativa por política; E2 cierra la dependencia de una conexión superusuario                                                                                                                                     |
| 7 · CSP           | `connect-src` sólo hacia el origen de la API; el service worker de avisos no relaja la CSP ni la `Permissions-Policy`                                                                                                                                        |
| 8 · Transversales | Recuperación por correo desactivada en producción (AR-04); el cierre de sesión nunca escribe el token; el TURN con `denied-peer-ip` contra la red interna; la auditoría de la rotación lleva la referencia, nunca la llave                                   |

## 8 · Deuda técnica, supuestos y pendientes

- **DT-15R-01 · nada desplegado.** Netlify + Cloud Run (P-20), coturn (P-29) y
  Web Push con navegadores reales están por ejercer en el entorno del cliente.
- **DT-15R-02 · S-15R-03 por probar en sitio**: la reversión con `close`
  (`VALIDACION_HIKVISION_EN_SITIO.md` §8.4.3).
- **DT-15R-03 · la consola y la app no ofrecen todavía crear una recurrente**
  desde su interfaz: E3 arregla el servidor; la pantalla sigue pidiendo una
  visita con fecha y duración.
- **DT-15R-04 · la sonda de arranque** avisa de la recuperación por correo
  aunque esté desactivada a propósito; es ruido, no un fallo.
- **DT-15R-05 · AR-03 sin verificar** contra el proyecto real (credenciales).
- **DT-15R-06 · recuperación por una persona, a medias en la consola.** La
  pantalla de acceso dice «Contacta al administrador de tu copropiedad», pero a
  porteros, operadores y administradores sólo los restablece el
  superadministrador; y el administrador, que puede restablecer residentes por
  la API, no tiene pantalla para hacerlo. Lo encontró la revisión del manual.
- **DT-15R-07 · la franja de puertas** dice «Puerta N» sin el equipo, ambiguo con
  varios videoporteros; el tope por copropiedad (`PUT …/puertas/ajustes`) no
  tiene pantalla, y si se fija por debajo de 120 min la opción «2 h» se rechaza.
  La consola sólo ofrece el modo en un videoportero activo con salidas
  descubiertas.
- **DT-15R-08 · el aviso de acceso** lleva el identificador crudo del equipo en
  el texto («… en <id>»): cosmético, sin dato personal.
- **DT-15R-09 · en modo puente, el Edge inscribe rostros sin comprobar el reloj
  del equipo.** `apps/edge/src/composicion.ts` construye el proveedor sin
  `desvioDeRelojMaximoS`, así que `exigirRelojEnHora` sale antes de mirar
  (`packages/providers/src/terminal/terminal-facial.ts`); la API sí lo hace en
  modo directo. Viene de la 15-Q2 (`2303350`), no de esta ronda; mientras tanto,
  el NTP del equipo es la única protección (`ENTREGA_EN_SITIO.md` §8.3). Lo
  encontró la revisión de las guías de visita.
- **P-32 · PENDIENTE DE DEFINICIÓN · a quién llega el respaldo de una alerta sin
  operador** (CU-03 alterno). Desde la ETAPA 06 se dirige a una «vivienda»
  `guardia` que no existe; desde la 15-R el notificador real lo reconoce y no
  envía a nadie. Comportamiento conservador vigente: la alerta queda persistente
  en la consola y en la bitácora; nadie recibe un push.
- **Supuestos nuevos:** S-15R-01 y S-15R-03 a S-15R-08 (S-15R-02 no se usó).
- **Contradicciones:** C-53 a C-56, todas resueltas; C-37 resuelta por P-20.
- **Decisiones:** P-20, P-23, P-25, P-29, P-30 y P-31 resueltas; P-26 fuera de
  alcance; **P-32 nueva**. Siguen abiertas, sin bloquear: P-19, P-24, P-28 y P-32.
- Todo en `docs/auditoria/contradicciones-y-supuestos.md`.

## 9 · Qué debe hacer el usuario manualmente

1. **Aplicar las migraciones 0051 a 0054** (`supabase db push`). Al hacerlo,
   anote si `0017` y `0031` pasan: es la verificación de **AR-03**
   (`ACEPTACIONES_DE_RIESGO.md`, AR-03, con las consultas de
   `CONEXION_SUPABASE.md` §12.5).
2. **Llaves VAPID**: `node scripts/generar-llaves-vapid.mjs` y las tres
   variables `WEB_PUSH_*` en Secret Manager para la API
   (`AVISOS_WEB_PUSH.md` §1–§3). La privada no va nunca a la consola.
3. **Llave de firma del APK**: créela en un equipo de TI con `keytool`,
   guárdela fuera del repositorio y con copia de seguridad
   (`APK_FIRMADO.md` §1–§2). Si se pierde, los teléfonos no aceptan
   actualizaciones firmadas con otra.
4. **Firmar —o rechazar— las aceptaciones de riesgo**: AR-01 (dirección del
   proyecto), **AR-05 y el riesgo residual de H-15B-1 (TI de Grupo Control)**,
   en `docs/seguridad/ACEPTACIONES_DE_RIESGO.md`. Para AR-05, además, filtro de
   IP en el equipo afectado y VLAN de equipos.
5. **Netlify y Cloud Run** (P-20, P-30): las variables de
   `CONSOLA_EN_RED_Y_DESPLIEGUE.md` §7 (mismo secreto de IP firmada en los dos
   lados, `CORS_ALLOWED_ORIGINS`, `API_PROXIES_DE_CONFIANZA`) y Cloud Run con
   `--max-instances=1 --min-instances=1 --no-cpu-throttling --timeout=360` o más.
6. **`RECUPERACION_POR_CORREO` vacía en producción** (AR-04): el
   restablecimiento lo hace una persona —el superadministrador desde la consola;
   el administrador, sólo a residentes y sólo por la API (DT-15R-06)—.
7. **Cuando quiera video desde fuera del conjunto**, desplegar coturn según
   `COTURN.md` y llenar las variables `WEBRTC_*`.
8. **En la próxima visita**: la prueba §8.4.3 de la puerta libre y bloqueada.

## 10 · Rama y commits

Rama `etapa-15r-huecos-y-decisiones`, desde `develop` con la 15-U fusionada.

| Commit    | Bloque                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| `2aa3d3f` | A · códigos MFA, bloqueos y operaciones de dispositivo sobreviven al reinicio    |
| `367d177` | B · avisos al residente por Web Push estándar, sin Firebase (P-23, ADR-036)      |
| `506d1f1` | C · puerta libre y bloqueada con reversión automática (P-25)                     |
| `37b2346` | D · SSE y audio directos a la API con billete; IP firmada desde Netlify (P-20)   |
| `16c900d` | E · E1–E8                                                                        |
| `ea02897` | F · aceptaciones de riesgo, rotación de la bóveda con recifrado y guía de coturn |
| `a5bfc0b` | G · documentación al día y registro                                              |
| `999305d` | informe, a falta del veredicto                                                   |
| `dbaf167` | la consola compila: el gancho del cambio de copropiedad, en un módulo de cliente |
| `5566b8e` | la herramienta de rotación escucha el `error` de su `Pool` (15-O)                |
| _este_    | cierre de la ronda: veredicto en el informe y en ESTADO                          |
