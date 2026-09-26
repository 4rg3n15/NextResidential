# ETAPA 15-K · Hallazgos de sitio

**Rama:** `etapa-15k-hallazgos-de-sitio` · **Base:** `develop` (`5cceb89`, con el PR #32)
**Contrato:** extensión **E-04** —decisiones de sitio **D-10** y **D-11**, aprobadas por el cliente el 2026-09-26— (`docs/auditoria/contradicciones-y-supuestos.md` §3 bis)
**Decisiones:** [`ADR-029`](../decisiones/ADR-029-consentimiento-presencial-del-titular.md) · [`ADR-030`](../decisiones/ADR-030-atestacion-del-instalador.md)

Esta ronda **no se fusiona**: abre PR contra `develop` y se detiene. **No cierra
la ETAPA 15**, que sigue **BLOQUEADA sólo por `BE-02`**: la primera visita a
sitio (26/09/2026) no ejecutó los 16 escenarios porque la consola no dejó
operar los equipos. Esta ronda corrige lo que la visita encontró, cierra la
clase de defecto que lo permitió e instrumenta lo que no se puede corregir sin
volver a tener el equipo delante.

**Equipos de la visita:** cámara LPR `DS-TCG405-E` (firmware V5.4.0), terminal
facial `DS-K1T344MBFWX-E` (V4.47.0) y videoportero `DS-KD9633-WBE6` (V2.3.9).

---

## 0 · Los catorce hallazgos de sitio, uno por uno

**Vocabulario.** **CORREGIDO**: el defecto está demostrado, corregido y con
prueba que falla sin la corrección. **INSTRUMENTADO**: lo demostrable está
corregido, pero la causa última depende de lo que conteste el equipo real; la
próxima visita la captura (`--capturar`, la ficha y la bitácora) y el informe
deja las hipótesis numeradas. **PENDIENTE**: sin corregir ni instrumentar.
**Ninguno queda PENDIENTE.**

| Id             | Qué pasó en sitio                                                                                                             | Estado            | Por qué este estado                                                                                                                                                                                                                                                                                                                                                                                                              | Prueba                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H-SITIO-01** | Cámara: `barrierGateOper = 0` en las cuatro políticas, disparador ilegible, «decide sola» y el alta **no quedaba registrada** | **INSTRUMENTADO** | Corregido lo del software: el alta persiste como `rechazado`, aparece en la lista y la ficha trae el `EntranceParam` y el disparador **crudos y saneados**. Lo del equipo **no**: con 0 la cámara abría, y la guía dice «0 = sin operación» (C-38). Salida para operar: la atestación D-11. Qué campo refleja «Paso automático», en la próxima captura                                                                           | `veredicto-de-control.test.ts` · `diagnostico.test.ts` · `alta-de-equipo.test.tsx` · `ficha-del-equipo.test.tsx` · `equipos.e2e.test.ts` · recorrido 13b |
| **H-SITIO-02** | Dispositivos y el tablero leían SIEMPRE la memoria: el equipo dado de alta no aparecía                                        | **CORREGIDO**     | `RepositorioTableroPg` cableado con `PERSISTENCIA_DE_EVENTOS=postgres`. Ejecutarlo destapó dos defectos más (consultaba sin claims —con la RLS forzada, cero filas sin error— y filtraba por una columna inexistente). Las operaciones aún simuladas lo dicen en el botón                                                                                                                                                        | `tablero-pg.test.ts` (base real, rol sin superusuario) · recorrido 13b · **13c lo reintroduce y el recorrido lo nombra**                                 |
| **H-SITIO-03** | `GET consentimientos/:id` negaba al superadministrador (403 tras la captura)                                                  | **CORREGIDO**     | Las rutas de «Rostro del visitante» admiten a cada rol que ve la pantalla; RN-09 no se relaja (el dominio sigue negando sin consentimiento vigente)                                                                                                                                                                                                                                                                              | `roles-de-biometria.e2e.test.ts` (3 rojas sin la corrección) · **13c lo reintroduce**                                                                    |
| **H-SITIO-04** | La terminal rechazó la carga de la plantilla con 400, «sin decir por qué»                                                     | **INSTRUMENTADO** | Corregido lo que la guía de su serie demuestra: `employeeNo` de 36 bytes (máximo 32) → identificador compacto de 32 hexadecimales; registro `FaceDataRecord` plano, no envuelto; imagen en la parte `img`. `statusCode`, `subStatusCode`, `errorCode` y `errorMsg` van a la bitácora y al mensaje. La causa exacta del 400 no se puede afirmar sin el equipo: hipótesis H4-1 a H4-4 (§8)                                         | `terminal-facial.test.ts` · `identificador-en-el-equipo` · el simulado exige lo mismo que la guía · `carga-de-prueba.test.ts`                            |
| **H-SITIO-05** | En la terminal, `verificacionRemota` «desconocida»: con `reporta_y_espera` toda apertura se rechazaba                         | **CORREGIDO**     | El interruptor es `AcsCfg.remoteCheckDoorEnabled` en la guía de la serie de la terminal (el S-35 suponía `remoteCheck`). Cada ruta de capacidad consultada deja su línea con lo que contestó. Se confirma con la captura `terminal/…AcsCfg…`                                                                                                                                                                                     | `capacidades-hikvision.test.ts`                                                                                                                          |
| **H-SITIO-06** | `start:dev` (tsx) cayó al arrancar: «Cannot read properties of undefined (reading 'get')»                                     | **CORREGIDO**     | tsx no emite metadatos de tipos: **14** parámetros inyectados por tipo llegaban `undefined`. `@Inject` explícito en todos, control estático y un paso que ARRANCA la API con tsx                                                                                                                                                                                                                                                 | `inyeccion-explicita.mjs` (paso 10, sonda 33) · `e2e/arranque-con-tsx.mjs` (paso 12d, **sonda 35: reproduce el error literal de sitio**)                 |
| **H-SITIO-07** | pg-boss usaba la conexión directa `db.<ref>.supabase.co`, sólo IPv6: `ENOTFOUND` en la red del sitio                          | **CORREGIDO**     | `PGBOSS_DATABASE_URL` opcional (si falta, `DATABASE_URL`); el arranque dice por qué variable, contra qué host y de qué clase conecta, y avisa como error si es la directa o el pooler en modo transacción. **No probado contra una red sólo IPv4**: se confirma en la visita                                                                                                                                                     | `conexion-de-pgboss.test.ts`                                                                                                                             |
| **H-SITIO-08** | El proxy de la consola no exportaba `PUT`: toda edición respondía 405                                                         | **CORREGIDO**     | `PUT` añadido; una prueba deriva del contrato generado y de la consola TODOS los verbos en uso y exige que el proxy los reenvíe                                                                                                                                                                                                                                                                                                  | `proxy-verbos.test.ts` (2 rojas sin PUT) · recorrido 13b · **13c lo reintroduce**                                                                        |
| **H-SITIO-09** | Videoportero: biblioteca de rostros y gestión de personas «desconocidas»                                                      | **CORREGIDO**     | Con biblioteca de rostros, el videoportero entra en la sincronización total (terminales y videoporteros); sin ella, la fila dice «Rostros: no aplica». Si el KD9633 la tiene lo dirá su captura (`videoportero/…FDLib…`)                                                                                                                                                                                                         | `capacidades.test.tsx` · `capacidades-hikvision.test.ts` · `consentimiento-publico.e2e.test.ts` (sincroniza terminal y videoportero)                     |
| **H-SITIO-10** | Con el proveedor real y `API_URL_PUBLICA` de bucle local, el enlace y el QR no los abría ningún teléfono                      | **CORREGIDO**     | El arranque lo escribe como error; el enlace declara su alcance y la consola avisa junto al QR. Y D-10 da una salida que no depende del teléfono                                                                                                                                                                                                                                                                                 | `url-publica.test.ts` · `seguimiento.test.tsx`                                                                                                           |
| **H-SITIO-11** | La app en un iPhone físico: «No hay conexión con el servidor» mientras Safari abría la API                                    | **CORREGIDO**     | Faltaba `NSLocalNetworkUsageDescription` (la privacidad de red local alcanza a `dart:io`; ATS no, porque `dart:io` no usa `URLSession`). En Debug, panel con URL compilada, tipo y mensaje del fallo, sin tokens. **No verificable aquí sin un iPhone**: se confirma en la visita                                                                                                                                                | `info-plist-ios.mjs` (paso 5d, sonda 34, sobre el Info.plist preprocesado como Xcode) · `detalle_tecnico_test.dart`                                      |
| **H-SITIO-12** | La primera orden a cada equipo se aceptaba; la siguiente, 9–35 s después, se rechazaba como «usuario o clave»                 | **CORREGIDO**     | Una sesión Digest por equipo compartida por todo el proceso; `nc` que no se reinicia con el mismo nonce; `stale=true` distinguido de la clave; un 403 con código ISAPI ya no es «credencial»; **un solo reintento**, nunca más (bloqueo de cuenta). Que el equipo real vencía el nonce es inferencia del patrón                                                                                                                  | `digest-vencido.test.ts` contra `servidor-digest.ts` (vence por tiempo y por usos): órdenes, sondeos y suscripciones. Con el cliente anterior, falla     |
| **H-SITIO-13** | Terminal y videoportero contestaron «OK» a `RemoteControl/door/1` y la puerta **no se movió**                                 | **INSTRUMENTADO** | Cuerpo alineado con la guía (declaración, espacio de nombres y `version="2.0"`, requerido); el código ISAPI del cuerpo decide también en la terminal; petición y respuesta completas y saneadas a la bitácora; la consola dice «Aceptada por el equipo · sin confirmación de apertura», **nunca «Abierta»**. La causa: hipótesis H13-1 a H13-4 (§8)                                                                              | `resultado-de-orden.test.ts` · `desenlaces-de-error.test.ts` · recorrido 13b («Historial inmediato» sin «abierta»)                                       |
| **H-SITIO-14** | Una persona registrada pasó por la terminal con la escucha activa y no hubo ni una línea                                      | **CORREGIDO**     | Dos defectos de lectura demostrados: el flujo se cortaba contando llaves y la foto lo rompía (ahora se corta como multipart en bytes), y `currentEvent` se buscaba fuera de `AccessControllerEvent`, donde la guía lo pone: todo evento se descartaba como histórico **sin una línea**. La escucha registra ahora conexión, re-autenticación, cada bloque y cada descarte con su motivo; la ingesta, una línea `info` por evento | `escucha-multipart.test.ts` · `ingestor-de-publicaciones.test.ts`                                                                                        |

---

## 1 · Qué se construyó

La visita del 26/09/2026 conectó la API con la terminal y el videoportero
—suscripción activa, «verificado»— y aun así **la consola no dejó operarlos**.
La causa raíz no era un defecto sino una ausencia: **la consola nunca se había
probado de punta a punta contra la API real**. El ensayo de la 15-I fue en
SIMULADO y por la API, así que un proxy sin `PUT`, un tablero cableado a la
memoria y una ruta que negaba al superadministrador pasaron todas las pruebas.

Esta ronda hace tres cosas. **Corrige** los once defectos de software que la
visita destapó y los tres de integración que se pueden demostrar con las guías
del fabricante, cada uno con una prueba que falla sin la corrección. **Cierra la
clase de defecto** con un recorrido de la consola en Chromium contra la API
real, PostgreSQL con la RLS forzada y dos equipos simulados que hablan HTTP con
Digest, y con su prueba negativa: el recorrido se pone rojo, **nombrando el
hallazgo**, con H-SITIO-02, 03 y 08 reintroducidos. E **instrumenta** lo que no
se puede corregir sin el equipo: la ficha muestra lo que el equipo contestó,
cada orden deja su petición y su respuesta saneadas, la escucha deja una línea
por bloque y por descarte, y el guion de sitio gana `--capturar`, que guarda en
una carpeta fuera del repositorio las respuestas crudas y saneadas de cada
equipo —con una carga de prueba de rostro que se da de baja al terminar—.

Además, las dos decisiones del cliente que la visita hizo necesarias:
**D-10**, el consentimiento presencial escrito por el propio titular en la
pantalla de la foto, y **D-11**, la atestación física del instalador que
permite operar una cámara cuya configuración la API no puede confirmar, en
ámbar y sólo para el firmware atestado. Y la guía de sitio corregida:
arranque compilado, `API_URL` de la consola en bucle local, consola por IP,
captura **antes** de tocar nada y **reversión equipo por equipo** contra esa
captura.

---

## 2 · Cómo se organizó y por qué

### 2.1 · El recorrido de la consola es la respuesta a la causa raíz, no una prueba más

Tres de los catorce hallazgos (02, 03, 08) vivían en la costura consola ↔
proxy ↔ API ↔ base, que ninguna suite atravesaba entera. `e2e/recorrido-de-consola.mjs`
la atraviesa como una persona: base propia copiada de una plantilla migrada y
sembrada, doble de GoTrue que emite los claims **del gancho real de la base**,
API compilada (`node dist/main.js`, lo mismo que se arranca en sitio), consola
compilada y dos equipos simulados de `packages/providers` escuchando por HTTP
con Digest. Recorre como superadministrador el alta, la ficha, la corrección,
la edición por `PUT`, la apertura desde Portería y Guardia y el consentimiento
con su sincronización; y como portero, su turno y una apertura con motivo.

**Un recorrido verde sólo demuestra algo si se le ha visto ponerse rojo.**
`e2e/recorrido-negativo.mjs` reintroduce cada defecto en un árbol de sonda
(`e2e/arbol-de-sonda.mjs`: se copia sólo la aplicación mutada y el resto se
enlaza) y exige que el recorrido falle **por ese hallazgo**; un fallo por otro
motivo no cuenta. Los pasos 13b y 13c del verificador los ejecutan con base.

El recorrido destapó a su vez tres defectos que se corrigen aquí: con base
real y proveedor simulado, el simulado sólo conocía dos dispositivos fijos
(toda orden a un equipo dado de alta en la consola fallaba); el simulado no
recordaba la corrección del modo de control; y el doble de GoTrue sólo conocía
un usuario.

### 2.2 · Se corrige lo demostrable; lo demás se instrumenta y se numera

Para los hallazgos de integración (01, 04, 05, 09, 12, 13, 14) la regla fue la
del encargo: **corregir sólo lo que la guía del fabricante o una prueba
demuestran**. La guía de la serie de cada equipo manda: la K1T344 figura en la
lista de modelos de la serie Value, el KD9633-WBE6 en la de IP/Ultra y la
TCG405-E en la de cámaras ANPR. Esa comprobación corrigió además, al final de
la ronda, la baja de persona de la terminal: su serie documenta **sólo**
`UserInfoDetail/Delete` (asíncrona) y se usaba `UserInfo/Delete`, que sólo
aparece en la guía del videoportero.

Lo que no se puede afirmar sin el equipo queda como **hipótesis numerada**
(§8) y con su instrumento: la ficha muestra la respuesta cruda, la bitácora
lleva petición y respuesta saneadas y `--capturar` las guarda por equipo. En
sitio, cuatro fallos se quedaron sin diagnóstico por no tener esto.

### 2.3 · D-10 pasa por el mismo agregado, con la identidad escrita por el titular

`AceptarConsentimientoPresencial` no es un atajo: acepta con `quienAcepta =
titular` a través del mismo `ConsentimientoBiometrico`, y exige que el nombre y
el documento que **el titular escribe** —la consola no los precarga—
coincidan con la persona registrada (`identidadCoincide`, pura, en el
dominio). Otra identidad u otra versión de la política → 403 sin revelar el
registro. La auditoría, de sólo inserción, guarda el canal «presencial» y al
operador que atendía la pantalla como `usuario_id`, nunca lo escrito. Al
aceptar, la plantilla sale en el acto a todos los equipos con biblioteca. El
residente queda fuera de la ruta (RN-10). La validez jurídica es **P-21**.

### 2.4 · D-11 es una excepción firmada, no un interruptor

La atestación vive en una tabla **de sólo inserción** con las tres capas de
ADR-005 (REVOKE también al dueño, disparadores, RLS forzada). Sólo la inserta
el superadministrador. Su vigencia es una función pura del dominio
(`vigenciaDeAtestacion`): vale la más reciente y sólo para **el mismo
firmware**, leído **en vivo** del equipo antes de operar; un firmware distinto
o ilegible la deja sin efecto sin escribir nada. La consola la muestra en
ámbar y nunca en verde, y el estado de verificación de la API sigue siendo
«rechazado». Se rechazaron catalogar el 0 como «no abre» (falso verde
demostrado en sitio) y un interruptor de confianza sin prueba física.

### 2.5 · Una sesión Digest por equipo, no por cliente

H-SITIO-12 tenía la forma de un nonce reutilizado: dos clientes del mismo
proceso hablando con el mismo equipo, cada uno con su contador `nc`. La sesión
Digest se comparte ahora por transporte, equipo y usuario, y el reintento ante
`stale=true` es **uno**. Un segundo 401 es un 401: el equipo bloquea la cuenta
a los pocos intentos, y un cliente que reintenta a ciegas es peor que uno que
falla.

### 2.6 · «Aceptada» nunca es «Abierta»

Sin una señal de posición cableada, nadie en este sistema sabe si la puerta se
movió. H-SITIO-13 lo demostró: el equipo dijo «OK» y la puerta no se movió. La
consola ya no dice «Abierta» en ningún caso; dice «Aceptada por el equipo ·
sin confirmación de apertura».

### 2.7 · El rol con el que la API se conecta (S-62)

El recorrido conecta la API con `sb_postgres_api` (sin superusuario, con
`BYPASSRLS`) porque eso es lo que hace `postgres` en Supabase: la evidencia de
sitio es que el buscador de personas respondía aunque `RepositorioPadronPg`
fija `claims = {}`. Con el dueño simulado sin `BYPASSRLS`, el buscador quedó
vacío. **Ocho repositorios** se construyen con claims `{}` y dependen de ello;
un rol `app_api` sin `BYPASSRLS` los dejaría sin filas (DT-15K-02). No se
arregla aquí: es la persistencia de cuatro módulos y no la pedía el encargo.

### 2.8 · Lo que no se tocó

El motor de reglas, los agregados existentes y sus invariantes. El dominio
gana dos funciones puras (`identidadCoincide`, `vigenciaDeAtestacion`); la
aplicación, dos casos de uso. El resto de cambios está en adaptadores,
presentación, consola, app y guiones.

---

## 3 · Árbol de archivos (selección)

```
apps/api/src/
  tablero/infraestructura/repositorio-tablero-pg.ts     H-SITIO-02 · lecturas con claims de servicio en transacción de sólo lectura
  tablero/tablero.module.ts                              H-SITIO-02 · PG con PERSISTENCIA_DE_EVENTOS=postgres
  biometria/presentacion/biometria.controller.ts         H-SITIO-03 · roles por pantalla; D-10 · ruta presencial
  biometria/aplicacion/consentimiento-presencial.ts      D-10 · caso de uso por el agregado, identidad escrita
  padron/infraestructura/identidad-de-persona.ts         D-10 · puerto estrecho de identidad (PG y memoria)
  equipos/aplicacion/atestacion-del-instalador.ts        D-11 · caso de uso (sólo superadministrador)
  equipos/infraestructura/atestaciones.ts                D-11 · repositorio PG con claims y doble en memoria
  equipos/presentacion/atestaciones.controller.ts        D-11 · POST …/equipos/:id/atestacion
  planificacion/infraestructura/conexion-de-pgboss.ts    H-SITIO-07 · qué conexión usa pg-boss y por qué
  comun/url-publica.ts                                   H-SITIO-10 · la URL pública de bucle local, como error
apps/web/src/
  app/api/ncr/[...ruta]/route.ts                         H-SITIO-08 · PUT
  app/api/ncr/proxy-verbos.test.ts                       H-SITIO-08 · los verbos del contrato, reenviados
  app/(consola)/dispositivos/atestacion-dialogo.tsx      D-11 · distintivo ámbar/rojo y diálogo
  app/(consola)/biometria/seguimiento.tsx                D-10 · formulario presencial que rellena el titular
  componentes/resultado-de-orden.ts                      H-SITIO-13 · «Aceptada por el equipo», nunca «Abierta»
apps/mobile/
  ios/Runner/Info.plist                                  H-SITIO-11 · NSLocalNetworkUsageDescription
  lib/presentacion/widgets/detalle_de_fallo.dart         H-SITIO-11 · detalle técnico en Debug, sin tokens
packages/domain-core/src/
  padron/persona.ts                                      D-10 · identidadCoincide (pura)
  dispositivos/atestacion.ts                             D-11 · vigenciaDeAtestacion (pura)
packages/providers/src/
  equipo/cliente.ts · barrera/digest.ts                  H-SITIO-12 · sesión Digest compartida, nc, stale
  simulacion/servidor-digest.ts                          H-SITIO-12 · servidor que vence el nonce
  equipo/puerta-remota.ts                                H-SITIO-13 · cuerpo de la guía y bitácora completa
  equipo/partes-del-flujo.ts · escucha-alertstream.ts    H-SITIO-14 · multipart en bytes, currentEvent, bitácora
  terminal/identificador-en-el-equipo.ts                 H-SITIO-04 · employeeNo de 32
  terminal/terminal-facial.ts                            H-SITIO-04 · registro plano; baja por UserInfoDetail/Delete
  hikvision/capacidades-hikvision.ts                     H-SITIO-05, 09 · remoteCheckDoorEnabled, biblioteca del videoportero
  camara/veredicto-de-control.ts · diagnostico/ficha.ts  H-SITIO-01 · 1 abre, 0 a verificación física; crudos saneados
  hikvision/hikvision-provider.ts                        D-11 · opera la cámara atestada para su firmware
  diagnostico/carga-de-prueba.ts                         §5 · carga de prueba de --capturar, dentro del paquete (O2)
  mock/mock-provider.ts                                  §4 · el simulado conoce los equipos activos de la base
supabase/
  migrations/…_0039_atestacion_del_instalador.sql        D-11 · tabla de sólo inserción, RLS forzada
  reversion/0039_revert.sql                              D-11 · reversión con confirmación explícita
  policies/tests/95_atestacion_del_instalador.sql        D-11 · políticas, CHECK y sólo-inserción frente al dueño
e2e/
  recorrido-de-consola.mjs · recorrido-negativo.mjs      §4 · el recorrido y su prueba negativa
  arbol-de-sonda.mjs · arranque-con-tsx.mjs              §4 · árbol de sonda; H-SITIO-06
scripts/
  puesta-en-marcha-equipos.mjs                           §5 · --capturar
  lib/hoja-de-resultados.mjs                             §5 · columna «Evidencia cruda»
  lib/inyeccion-explicita.mjs · lib/info-plist-ios.mjs   H-SITIO-06, 11 · controles nuevos
  verificar-etapa.sh · lib/pruebas-negativas.mjs         pasos 5d, 12d, 13b, 13c; sondas 33 a 37
docs/
  decisiones/ADR-029 · ADR-030                           D-10, D-11
  guias/VALIDACION_HIKVISION_EN_SITIO.md §V              §5 · procedimiento de la visita corregido
  auditoria/contradicciones-y-supuestos.md               C-38, S-62, P-21, E-04
```

---

## 4 · Tabla SOLID

| Principio | Cumplimiento en lo creado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SRP**   | Un caso de uso por operación (`AceptarConsentimientoPresencial`, `RegistrarAtestacionDelInstalador`); la carga de prueba, la puerta remota, las partes del flujo y el servidor Digest, cada uno en su fichero. **Incumplido y declarado (DT-15K-01):** seis ficheros cruzan las 300 líneas de §2.3 en esta ronda (`cliente.ts` 274 → 461, `seguimiento.tsx` 223 → 374, `escucha-alertstream.ts` 246 → 315, `equipos/aplicacion/puertos.ts` 298 → 337, `biometria.module.ts` 300 → 331, `biometria.controller.ts` 317 → 383) y otros que ya lo estaban crecen |
| **OCP**   | La atestación es una excepción que el proveedor consulta, no una rama nueva en el veredicto: sin atestaciones, la guarda original sigue intacta. El recorrido negativo añade sondas como datos (`SONDAS`), no como código                                                                                                                                                                                                                                                                                                                                    |
| **LSP**   | El recorrido corre contra el proveedor simulado **por HTTP y con Digest**, el mismo transporte que el real; `IdentidadDePersonaPg` e `IdentidadDePersonaEnMemoria`, y los dos repositorios de atestaciones, cumplen el mismo puerto                                                                                                                                                                                                                                                                                                                          |
| **ISP**   | `IdentidadDePersona` expone una sola operación (`porId`) en vez de abrir el repositorio del padrón a la biometría; `RepositorioDeAtestaciones` separado del registro de equipos                                                                                                                                                                                                                                                                                                                                                                              |
| **DIP**   | Los casos de uso nuevos dependen de puertos por token (`IDENTIDAD_DE_PERSONA`, `REPOSITORIO_DE_ATESTACIONES`); `@Inject` explícito en toda inyección por tipo (H-SITIO-06). `grep` de `supabase\|axios\|isapi` en `domain/` sigue en 0 (paso 10); la frontera de extensibilidad (O2) cazó y obligó a corregir la construcción de un adaptador de marca desde el guion                                                                                                                                                                                        |

---

## 5 · Trazabilidad

| Requisito                                      | Cubierto                                                                                                                                                                    |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OE-03** (desacople del hardware)             | El recorrido de la consola corre completo contra el simulado por HTTP; ningún cambio de integración tocó dominio ni aplicación salvo las dos funciones puras de D-10 y D-11 |
| **OE-04**, **RN-09**, **RN-10**, **RN-11**     | D-10 por el mismo agregado; el residente fuera; la baja de persona por la ruta de la guía                                                                                   |
| **OE-05**, **RN-02**, **KPI-23**               | Cada evento de un equipo deja su línea `info`; la escucha ya no descarta en silencio (H-SITIO-14)                                                                           |
| **OE-07**, **RN-08**, **CA-16/17/20**          | Apertura con motivo desde Portería y Guardia en el recorrido; «Aceptada», nunca «Abierta» (H-SITIO-13)                                                                      |
| **OE-08**, **RN-15**, **CA-24**, **KPI-36/37** | Tablero con claims de servicio por copropiedad (H-SITIO-02); atestaciones con RLS forzada y prueba con el rol real de la API                                                |
| **RN-12**, **RN-21**, **CA-26**                | Las respuestas crudas se sanean (sin claves ni IPs) antes de la ficha, la bitácora y las capturas; ninguna credencial en la hoja                                            |
| **RN-03**, **CA-23**, **ADR-005**              | `atestaciones_de_equipo` de sólo inserción con las tres capas, dueño incluido                                                                                               |
| **Hitos 2 y 3 del reto**                       | **Pendientes en sitio (BE-02)**. Esta ronda quita los bloqueos de software que impidieron ejecutarlos el 26/09                                                              |
| **KPI-13, 17, 25, 32, 33**                     | **No medidos**: son latencias de extremo a extremo con el aparato delante (BE-02)                                                                                           |

---

## 6 · Pruebas

### Qué prueba cada cosa

- **Por hallazgo**, la tabla del §0: cada CORREGIDO tiene una prueba que falla
  sin la corrección (las cifras «N rojas sin la corrección» se midieron al
  escribirlas).
- **La costura entera**, el recorrido 13b; **su prueba negativa**, 13c, con
  H-SITIO-02, 03 y 08 reintroducidos, cada uno nombrado.
- **Los controles nuevos, vistos fallar**: sondas 33 (`inyeccion-explicita`),
  34 (`info-plist-ios`), 35 (el 12d con un `@Inject` quitado reproduce el error
  de sitio), 36 (el recorrido sin base o sin Chromium no es un verde) y 37 (el
  recorrido negativo sin sondas no es un verde).
- **D-10 y D-11**, de dominio a base: `identidad.test.ts`,
  `atestacion.test.ts`, los casos de uso, las e2e de la API (residente 403,
  aceptación falsa 400, otra identidad 403, sincronización; administrador 403
  en la atestación, placas iguales 400, sin efecto con otro firmware),
  `95_atestacion_del_instalador.sql` y las pantallas.
- **`--capturar`**: `carga-de-prueba.test.ts` (aceptada, rechazada, baja
  imposible) y un ensayo manual en SIMULADO del guion completo: 41, 34 y 20
  intercambios capturados, ninguna clave en los ficheros, la imagen elidida, y
  salida 2 si la carpeta está dentro del repositorio. **El guion no está en el
  verificador** (DT-15K-05).

### Lo que destapó el cierre

La corrida de las pruebas negativas con cobertura, previa a la del
verificador, cazó que `--capturar` construía la terminal con
`new TerminalFacial(` desde el guion: la frontera de extensibilidad (O2)
prohíbe construir un adaptador de marca fuera de `packages/providers`. Se movió a `diagnostico/carga-de-prueba.ts` con sus pruebas (`6d47fe9`). Y el trinquete de ramas de los controles encontró que `info-plist-ios` tenía **18 bloques** que ninguna sonda ejercía, entre ellos las comprobaciones de los `.xcconfig` —la que impide que la excepción de ATS llegue a Release—: la sonda 34 gana cuatro casos (Debug sin ATS, `NCR_DEPURACION` en Release, `.xcconfig` sin preprocesado, `.xcconfig` ausente) y quedan **11**, todos variantes de plist mal formado y la falta de preprocesador de C. `inyeccion-explicita` entra con 5. Los dos se registran en `ramas-de-los-controles.json`.

### La primera corrida final, FALLIDA, y lo que destapó

Sobre `65b7c84`: **FALLIDA, con dos ✗**. Literal:

```
▸ 7 · umbrales de cobertura por capa (§2.4)
   ✗ alguna capa por debajo del umbral de §2.4
     ## @ncr/providers: la corrida NO terminó
            CORRIDA INTERRUMPIDA · código 1 · Command failed: pnpm --filter @ncr/providers exec vitest run … --coverage …
…
▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
      ✗ la corrida 2 NO coincide con la primera. Diferencias:
        solo en la 1: @ncr/providers:test: Tests 704 passed (704)
        solo en la 2: @ncr/providers:test: Tests 711 passed (711)
   ✗ la suite no es reproducible entre corridas
…
VERIFICACIÓN DE ETAPA: FALLIDA — NO se cierra la etapa
```

- **Paso 7, real.** `@ncr/providers` tiene su propio umbral de ramas del 90 %
  (`vitest.config`), y el código de esta ronda —Digest, flujo multipart,
  puerta remota, atestación— lo dejó en **88,95 %**: vitest salía con 1 y el
  paso lo vio como corrida interrumpida. Las capas de §2.4 estaban en verde
  (dominio 96,85 % de ramas, aplicación 87,08 % de ramas con 95,75 % de líneas
  y el umbral en líneas, global 83,77 %). Corregido con pruebas de lo que un
  equipo raro hace y el de la visita no hizo (`70ae74c`): **90,12 %**. No se
  bajó el umbral.
- **Paso 14, provocado por mí.** Añadí esas pruebas con el verificador en
  marcha: la corrida 1 de estabilidad contó 704 pruebas y las dos siguientes, 711. No es un defecto de la suite; es la razón de que el árbol no se toque
  durante una corrida.
- **Todo lo demás, en verde**, incluidos 12d (arranque con tsx), 13b (el
  recorrido de la consola) y 13c (el recorrido negativo).

### La segunda corrida final, FALLIDA por una roja intermitente sin nombre

Sobre `93174b8`: **FALLIDA**. El paso 5 (la suite completa por turbo)
informó `@ncr/api: Tests 1 failed | 1315 passed | 5 skipped (1321)`; el paso 7
(la misma suite, por vitest directo) la dio entera en verde y el 7b cazó la
discrepancia; el paso 14, tres corridas más, en verde. Literal:

```
▸ 5 · suite completa
   @ncr/api:test:       Tests  1 failed | 1315 passed | 5 skipped (1321)
   ✗ la suite no terminó bien (código 1): puede que ni siquiera llegara a correr
▸ 7b · los dos recuentos de la MISMA suite coinciden (D-112)
   ✗ los dos caminos de la suite NO dan el mismo resultado: uno de los dos miente
       ✗ @ncr/api — difieren: verdes, rojas
```

- **La roja no se pudo nombrar**, y eso es un defecto del verificador, no
  mala suerte: con código ≠ 0, el paso 5 imprimía las diez primeras líneas que
  contenían «error» —pruebas **verdes** llamadas `errores-…` y trazas de
  peticiones fallidas a propósito— y el nombre, que estaba en el
  `.informe-paso5.json` que el propio paso pide, no se leía. **Corregido**
  (`7d56f8e`): `nombrar_rojas` lo lee en las dos ramas de fallo.
- **Perseguida:** cuatro corridas más de la suite completa por turbo, en
  paralelo como el paso 5: **cuatro verdes**. Con el paso 7 y las tres del
  paso 14, **ocho verdes contra una roja** sobre el mismo commit.
- ~~Se registra como una aparición más de D-101~~. **Rectificado por la
  tercera corrida**: con el paso 5 ya nombrando, las rojas eran **dos pruebas
  de esta ronda**, no D-101 (ver abajo). La de esta corrida fue, con toda
  probabilidad, una de ellas.

### La tercera corrida final, FALLIDA: la roja, por fin con nombre, era mía

Sobre `d7813c4`: **FALLIDA**, y esta vez el paso 5 la nombró. Literal:

```
▸ 5 · suite completa
   @ncr/api:test:       Tests  1 failed | 1315 passed | 5 skipped (1321)
   ✗ la suite no terminó bien (código 1): puede que ni siquiera llegara a correr
     ROJA apps/api/test/tablero-pg.test.ts › H-SITIO-02 · tablero contra base real los accesos por hora cuentan los eventos del día en la hora LOCAL del conjunto
       AssertionError: expected 7 to be 2 // Object.is equality at …/apps/api/test/tablero-pg.test.ts:269:69
▸ 7 · umbrales de cobertura por capa (§2.4)
     ## @ncr/api: PRUEBAS EN ROJO
            ✗ registro de equipos contra base real (D5, P6) D-11 · sólo el superadministrador atesta, y la atestación viaja al proveedor
              error: duplicate key value violates unique constraint "dispositivos_endpoint_uk"
```

**Dos defectos de aislamiento en pruebas escritas en esta ronda:**

- `tablero-pg.test.ts` contaba **exactamente** los eventos del día de la
  copropiedad sembrada, en la que otras suites anexan eventos en paralelo:
  esperaba 2 y vio 7. Ahora exige «al menos» lo que anexó —los eventos sólo se
  añaden— y sigue cazando la hora UTC: con ese defecto, estos eventos y los
  ajenos caerían cinco franjas más allá y la franja local no crecería.
- `registro-de-equipos-pg.test.ts` (y `tablero-pg.test.ts`) daban de alta
  equipos en `198.51.100.x:80` con sólo 200 hosts posibles, y la base de
  pruebas conserva los equipos activos de corridas anteriores: el índice
  `dispositivos_endpoint_uk` acabó chocando. El patrón venía de la 15-D; esta
  ronda añadió un tercer equipo en el mismo espacio. Ahora el puerto también
  varía por corrida.
- Repetidas cinco veces contra la base tras la corrección: 9 de 9 cada vez.

### El veredicto literal de la corrida final, sobre el árbol completo

Cuarta corrida, sobre `967fb4e`, con el árbol quieto de principio a fin: **correcta, 29 de 29 pasos, ni una ✗**. El único ⚠ son las cinco pruebas del arranque en frío, declaradas y ejercidas en el paso 12b, como en las rondas anteriores. Líneas de estado de cada paso, tal cual:

```
▸ 0 · borrando artefactos de compilación (así corre un checkout nuevo)
   ✓ dist, .turbo, coverage, registros de compilación y claims de arranque eliminados
▸ 1 · entorno dentro de lo declarado
   ✓ entorno: Node 22.22.2 y pnpm dentro de engines · .nvmrc 22.22.2 · Flutter 3.47.4 (Dart 3.13.3) dentro de lo declarado · recorrido listo (Chromium + puerto 4599)
▸ 1c · el árbol es escribible por las herramientas que van a usarlo
   ✓ escritura: 9 rutas ejercidas de verdad (crear, escribir, leer, borrar)
   ✓ base de pruebas: 127.0.0.1:55432/ncr como postgres · PostgreSQL 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1) on x86_64-pc-linux-gnu · conectado como postgres · esquema presente · 2 copropiedad(es) sembrada(s)
▸ 1b · docs/ESTADO_ETAPAS.md no se contradice a sí mismo
   ✓ coherente: 17 etapas en el mapa, 15 cerradas con ficha e informe, cabecera al día · 0 de 0 rama(s) «en curso» comprobadas contra git
▸ 2 · instalación coherente con el lockfile
   ✓ pnpm install --frozen-lockfile
▸ 3 · compilación desde cero
   ✓ @ncr/api construye SOLO, sin que nadie le prepare las dependencias
   ✓ @ncr/edge construye SOLO, sin que nadie le prepare las dependencias
   ✓ pnpm build
   ✓ ninguna aplicación compila contra un dist/ desfasado (7 paquetes del espacio de trabajo, D-65)
▸ 4 · lint y typecheck
   ✓ pnpm lint
   ✓ pnpm typecheck
▸ 5 · suite completa
   ⚠ suite sin rojas · las saltadas están DECLARADAS y se ejercen en otro paso
▸ 5b · app móvil: análisis estático de Dart
   ✓ flutter analyze sin hallazgos
▸ 5c · app móvil: suite de Dart y cobertura POR CAPA
   ✓ dominio           96.02 % (umbral 90 %, 193/201 líneas)
   ✓ aplicacion        95.06 % (umbral 90 %, 154/162 líneas)
   ✓ configuracion    100.00 % (umbral 70 %, 33/33 líneas)
   ✓ infraestructura   85.47 % (umbral 60 %, 447/523 líneas)
   ✓ presentacion      81.03 % (umbral 50 %, 1636/2019 líneas)
   ✓ resto             26.83 % (umbral 0 %, 11/41 líneas)
   ✓ global            83.05 % (umbral 70 %, sin contar lo generado)
   ✓ cobertura de la app dentro de los umbrales por capa
   ✓ la suite de Dart da lo mismo en otro huso (Pacific/Auckland): ninguna prueba depende del reloj del sistema
▸ 5d · app móvil: cliente al día, sin secretos y sin dependencias a ciegas
   ✓ sin secretos: la app no nombra ni incrusta ninguna llave que omita la RLS
   ✓ dependencias: 1 acotación(es) con motivo escrito · objective_c fuera del grafo (lo arrastraba el plugin de Windows)
   ✓ Info.plist preprocesado: Debug y Release piden red local; ATS local sólo en Debug; nunca NSAllowsArbitraryLoads
   ✓ cliente Dart al día: 329 ficheros generados desde packages/contracts/openapi.json, sin diferencias
▸ 5e · app móvil: el RECORRIDO en un navegador de verdad
   ✓ el distintivo administrativo se pinta
   ✓ las 9 lecturas salieron con el token en la cabecera
   ✓ el residente desactivado sigue apareciendo (RN-19)
   ✓ y está marcado
   ✓ la placa se muestra como la normalizó el dominio
   ✓ la pestaña de visitantes muestra lo que el conjunto tiene a su nombre
   ✓ y ofrece autorizar una visita, que es para lo que se abre (HU-07)
   ✓ el perfil trae el nombre de la persona (3.5)
   ✓ y el botón de portería (D7)
   ✓ el correo sintético del token no aparece en ninguna parte (C-36)
   ✓ el motivo de la negación se explica en lenguaje llano
   ✓ lo decidido por el Edge se marca (KPI-31)
   ✓ ni un error de JavaScript en el recorrido completo
   ✓ la app se recorre entera en el navegador, sin un error de JavaScript
▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 260 de 260 ficheros de prueba ejecutados
▸ 7 · umbrales de cobertura por capa (§2.4)
   ✓ las tres capas cumplen su umbral
▸ 7b · los dos recuentos de la MISMA suite coinciden (D-112)
   ✓ recuentos: 6 paquete(s) con el mismo resultado por los dos caminos (turbo y vitest directo) · 3231 pruebas
▸ 8 · portabilidad de las superficies con shell (macOS/BSD y CI/GNU)
   ✓ portabilidad: 17 superficies con shell sin construcciones divergentes BSD/GNU (.sh, scripts de package.json, .husky/, run: de workflows, Makefile)
▸ 9 · pruebas negativas de los propios controles
   ✓ entorno declarado: 54 variables de 2 esquemas, todas en su .env.example · 21 leídas fuera de Zod, con motivo
   ✓ declaraciones: 1 paso(s) declarado(s) no ejercido(s), 0 de ellos en linux, con motivo y etapa de revisión vigente
   ✓ controles: 40 de 42 con prueba negativa · 2 en deuda declarada (no puede crecer)
   ✓ PRUEBAS NEGATIVAS: los 33 controles detectan su violación y aceptan el caso legítimo, sin tocar el árbol
   ✓ ramas: 38 controles medidos · 250 bloques sin ejercer (no puede subir)
▸ 10 · fronteras de arquitectura y secretos
   ✓ fronteras (DoD ETAPA 02)
   ✓ frontera-modulos: 15 módulos (alarmserver, autenticacion, autorizaciones, biometria, cuentas, equipos, eventos, guardia, observabilidad, padron, planificacion, porteria, residente, tablero, zonas), ninguna importación ent
   ✓ sin secretos
   ✓ escaneo de secretos: limpio (3936 blobs del historial alcanzable · 2 de línea base declarados)
   ✓ longitud por campo: 117 campo(s) @IsString(), todos con cota declarada
   ✓ 54 clases que Nest construye inyectan con @Inject() explícito en todos sus parámetros
   ✓ KPI-11: sin ISAPI ni IPs de dispositivo fuera de packages/providers/ (los rangos de documentación de RFC 5737 no cuentan: no son de nadie)
   ✓ frontera-extensibilidad: 195 fichero(s) de dominio/aplicación sin @ncr/providers, ningún adaptador nombrado fuera del paquete, y el ficticio sólo toca el núcleo
   ✓ ningún atributo `style` en la consola (204 ficheros, §2.7.7)
   ✓ 204 ficheros de la consola: todo color sale de un token con pareja medida en los dos temas
   ✓ frontera-vocabulario: 83 ficheros del dominio, sin tipo de copropiedad ni etiquetas (el tipo se puede cambiar sin consecuencias)
   ✓ sin claves ajenas vigentes hacia tablas append-only (2 declaradas, 2 retiradas, 7 tablas vigiladas)
   ✓ pwa: manifiesto completo, iconos reales de 192/512 y uno enmascarable distinto, service worker registrado con `/api/` fuera de la caché y página de sin conexión
   ✓ paleta: paleta.g.dart al día con el preset (40 tokens por tema)
   ✓ mermaid: 9 diagrama(s) en 2 fichero(s) analizan con Mermaid 11.17.2
▸ 10b · el contrato OpenAPI tiene tipos y el cliente generado está al día
   ✓ esquemas: 212 DTO con nombre único en apps/api/src
   ✓ 131 de 139 operaciones con respuesta tipada; 8 exentas con etapa declarada
   ✓ contrato y cliente generado al día respecto de los controladores
▸ 11 · latencia del canal de tiempo real bajo carga (KPI-25)
   ✓ KPI-25 con margen sobre el umbral
▸ 12 · esquema y aislamiento en --modo-supabase (requiere --con-base)
   ✓ migraciones, semillas y suite SQL
▸ 12b · arranque en frío: base vacía → migraciones → superadministrador (requiere --con-base)
   ✓ una base recién migrada llega a un superadministrador con claims válidos
   ✓ y esa sesión ENTRA: la API la acepta con aal2 y la rechaza con aal1
▸ 12c · el camino del NAVEGADOR: contraseña → factor → QR → aal2 → tablero
   ✓ el camino completo se recorre en el navegador
▸ 12d · la API arranca con tsx —el start:dev de sitio— y sus controladores reciben sus dependencias
   ✓ con tsx la API llega a «API arrancada»
   ✓ con tsx un controlador inyectado contesta con su lógica (404, no 500)
   ✓ la API arranca con tsx y un controlador inyectado contesta
▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base (requiere --con-base)
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)
   ✓ 50 ingresos simultáneos sobre 10 plazas, ni una de más (RN-14, CA-14)
   ✓ una hoja sin un solo UUID crea viviendas, personas y sus vínculos (D-72, RN-06)
   ✓ el superadministrador escribe el padrón en la copropiedad del selector (D-71)
   ✓ las 12 en una sentencia, el mismo número en tres agrupaciones, y una colisión revierte las 12
▸ 13b · el recorrido de la CONSOLA contra la API real, PostgreSQL y el simulado (requiere --con-base)
   ✓ el superadministrador y el portero recorren la consola de punta a punta
▸ 13c · el recorrido FALLA con H-SITIO-02, 03 y 08 reintroducidos (requiere --con-base)
   ✓ los tres defectos de sitio, reintroducidos, se detectan cada uno por su nombre
▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
   ✓ OK estabilidad: 3 corridas forzadas (sin caché de turbo) con resultado idéntico y ningún error sin manejar
▸ 15 · ningún paso declarado se quedó sin ejecutar
   ✓ OK 29 de 29 pasos ejecutados
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

---

## 7 · Verificación de seguridad (§2.7)

| Medida                       | En esta ronda                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos                 | Ninguno en código, pruebas, semillas ni documentos. Las respuestas del equipo se sanean con `documentoSaneado` (claves, tokens, IPv4) antes de la ficha, la bitácora y `--capturar`; `--capturar` **se niega** a escribir dentro del repositorio. El escaneo del pre-commit, limpio en cada commit                         |
| 2 · CORS                     | Sin cambios en el código. La guía de sitio fija la lista blanca a los dos orígenes de la consola (IP y bucle local)                                                                                                                                                                                                        |
| 3 · Validación en el backend | DTO nuevos con `whitelist` y `forbidNonWhitelisted`: la aceptación presencial exige `aceptaPolitica = true` (`@Equals`), longitudes acotadas; la atestación, placas por el objeto de valor `Placa`, distintas, y evidencia de 20 a 2000 caracteres (también `CHECK` en la base)                                            |
| 4 · Inyección SQL            | Sólo consultas parametrizadas en los repositorios nuevos                                                                                                                                                                                                                                                                   |
| 5 · Rate limiting            | Aceptación presencial: 10 por minuto por ruta, además del global                                                                                                                                                                                                                                                           |
| 6 · RLS                      | `atestaciones_de_equipo` con RLS forzada y prueba negativa (95); el tablero lee ahora con claims de servicio por copropiedad. **Riesgo declarado S-62**: la API se conecta con un rol que omite la RLS y ocho repositorios dependen de ello (DT-15K-02); la validación en aplicación sigue siendo la barrera en esas rutas |
| 7 · CSP                      | Sin cambios; las pantallas nuevas no introducen `unsafe-inline`                                                                                                                                                                                                                                                            |
| 8 · Transversales            | Auditoría append-only del consentimiento presencial (canal y operador, nunca lo escrito); atestación de sólo inserción; RBAC por guard en las rutas nuevas (atestación sólo superadministrador; presencial sin residente); la bitácora de órdenes lleva petición y respuesta **saneadas**                                  |

---

## 8 · Deuda técnica, supuestos y pendientes

### Hipótesis numeradas de lo instrumentado

**H-SITIO-01 · la cámara que abre con `barrierGateOper = 0`**

- **H1-1** · «Paso automático» de la página «Control del paso» no se guarda en
  `EntranceParam` sino en otro recurso de la cámara. Se decide capturando, con
  las herramientas de desarrollo del navegador, la petición que la página
  envía al cambiar ese interruptor.
- **H1-2** · la lectura del disparador vinculado (`GET
/ISAPI/Event/triggers/vehicledetection-1`) falla porque la guía sólo
  documenta el `PUT` de ese recurso. Se decide con `camara/…triggers-vehicledetection…`
  de la captura.
- **Evidencia que ya llega sola:** el evento ANPR trae `openGateType` y la API
  lo traduce a «quién abrió»; un «white» con la barrera abierta demuestra que
  abrió la cámara por su lista.

**H-SITIO-04 · el 400 de la carga de plantilla**

- **H4-1** _(corregida)_ · `employeeNo` de 36 bytes con guiones; la guía
  admite 32 y el `FPID` sólo letras y dígitos.
- **H4-2** _(corregida)_ · el `FaceDataRecord` iba envuelto; la guía lo quiere
  plano con `faceLibType` y `FDID`.
- **H4-3** · la terminal no declara `setUp` en el `supportFunction` de
  `FDLib/capabilities`: entonces `FDSetUp` no existe en ella y la guía remite
  a `POST FDLib/FaceDataRecord`, que en su serie exige además `name` y
  `bornTime`. Se decide con `terminal/…FDLib-capabilities…`.
- **H4-4** · la imagen de la app o de la consola excede el tamaño o la
  resolución que la biblioteca admite. Se decide con el mismo fichero de
  capacidades y con la carga de prueba, cuyo rechazo trae `subStatusCode`.

**H-SITIO-13 · «OK» sin que la puerta se mueva**

- **H13-1** · el cuerpo sin declaración, espacio de nombres ni `version`
  _(alineado con la guía; puede bastar o no)_.
- **H13-2** · la puerta `1` no es el relé cableado a la cerradura. Se decide
  con `…RemoteControl-door-capabilities…` y probando la otra puerta que el
  equipo declare.
- **H13-3** · la puerta está en «permanecer cerrada» (`alwaysClose`): acepta
  `open` y no abre. Se decide con los parámetros de puerta del equipo y con su
  estado en el panel web.
- **H13-4** · en el videoportero, la cerradura va por un módulo de control
  externo o exige el contexto de una llamada (`controlType`, sin descripción en
  la guía). `[SUPUESTO]`, la más débil de las cuatro.

### Hallazgos de la ronda que no son de sitio

- **H-15K-01** · al cambiar de copropiedad en la consola y crear algo en el
  acto, la creación puede ir a la copropiedad anterior: la sesión se actualiza
  por `POST /api/sesion/copropiedad` y el formulario no espera. No cruza datos
  entre copropiedades (el servidor usa las de la sesión, que el usuario puede
  operar), pero escribe donde el usuario ya no mira. El recorrido espera esa
  respuesta; la consola, no. **Reportado**, no corregido.
- **H-15K-02** · la baja de persona usaba la ruta de la serie equivocada
  (`UserInfo/Delete`): **corregido** con la de la guía de la terminal
  (`UserInfoDetail/Delete`, asíncrona).

### Deuda técnica

- **DT-15K-01** · seis ficheros cruzan las 300 líneas de §2.3 en esta ronda
  (§4) y otros que ya las pasaban crecen. Partición mecánica; tamaño medio por
  el número de ficheros.
- **DT-15K-02** · **S-62**: ocho repositorios construidos con claims `{}`
  (`RepositorioPadronPg`, `RepositorioZonasPg`, `RepositorioAutorizacionesZonaPg`,
  `RepositorioAutorizacionesPg`, `DirectorioDelResidentePg`,
  `AutorizacionesDelResidentePg`, `ZonasDelResidentePg`,
  `NotificacionesDelResidentePg`). Con un rol sin `BYPASSRLS` quedarían sin
  filas. Tamaño medio: pasar los claims de servicio por copropiedad como ya
  hacen el tablero y la identidad de persona.
- **DT-15K-03** · configurar, sincronizar y reiniciar un dispositivo siguen
  simulados con el proveedor real; la API lo declara en
  `/dispositivos/pendientes` y la consola lo escribe en el botón.
- **DT-15K-04** · el proveedor aprueba un equipo una vez por proceso: un cambio
  de firmware con la API en marcha se detecta al reiniciarla o en el siguiente
  sondeo de la consola (ADR-030).
- **DT-15K-05** · el guion de sitio no se ejecuta en el verificador; `--capturar`
  tiene prueba unitaria de la carga de prueba y un ensayo manual en SIMULADO.
- **D-101** · sigue ABIERTA y **no** reapareció: la roja sin nombre de la segunda corrida era, con toda probabilidad, una de las dos pruebas de esta ronda que la tercera nombró. Lo que cambia es que el paso 5 ya nombra cualquier roja.
- **DT-15K-06** · una corrida de la sonda H-SITIO-08 del recorrido negativo
  falló una vez en el acceso, antes de llegar a la comprobación (la siguiente la
  detectó). Causa no encontrada; el fallo de acceso vuelca ahora el texto de la
  página para diagnosticarlo si reaparece.

### `[SUPUESTO]`, `[CONTRADICCIÓN]` y `PENDIENTE DE DEFINICIÓN` generados

- **S-62** (S-15K-1) · la API se conecta con un rol que omite la RLS. **Es el
  único supuesto no conservador del registro**: lo exige el código de hoy.
- **C-38** · `barrierGateOper = 0` «sin operación» frente a la cámara que abre
  con 0. Resuelta: manda la observación física; salida por D-11.
- **P-21** · validez jurídica del consentimiento presencial (D-10). Conservador:
  el enlace y el QR siguen siendo el canal principal; el operador no puede
  rellenar nada por el titular.

**Abierto y no bloqueante para BE-02:** S-38 (por ratificar), AR-01 a AR-04 y el
riesgo residual de H-15B-1 (aceptaciones sin firmar), P-19, P-20, P-21, H-15J-01,
H-15K-01 y DT-15K-01 a 06.

---

## 9 · Qué debe hacer el usuario manualmente

1. Revisar y fusionar el PR de esta rama contra `develop`.
2. `supabase db push` contra el proyecto de Grupo Control: aplica la `0039`.
3. Decidir P-21 con el área legal antes de usar el consentimiento presencial
   fuera de la prueba.
4. Preparar la visita con [`VALIDACION_HIKVISION_EN_SITIO.md`](../guias/VALIDACION_HIKVISION_EN_SITIO.md)
   §V.1, que ahora incluye `PGBOSS_DATABASE_URL` si la red es sólo IPv4,
   `API_URL=http://127.0.0.1:3000` en la consola, `API_URL_PUBLICA` con la IP
   del Mac y una carpeta de sitio fuera del repositorio.
5. En sitio, §V.2 **en su orden**: la captura `antes/` va antes de tocar
   ningún equipo, y la reversión del final se hace contra ella.
6. Devolver las carpetas de captura y `api.log` —ya saneadas— para cerrar las
   hipótesis del §8.

---

## 10 · Rama y commits

**Rama:** `etapa-15k-hallazgos-de-sitio`, sacada de `develop` (`5cceb89`).
Conventional Commits con el prefijo `etapa-15k/<módulo>`.

| Commit     | Qué trae                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `120fd98`  | `fix(etapa-15k/consola)`: el proxy reenvía PUT y una prueba deriva los verbos del contrato (H-SITIO-08)                                  |
| `40dfbc8`  | `fix(etapa-15k/tablero)`: Dispositivos e indicadores leen de PostgreSQL con claims de servicio (H-SITIO-02)                              |
| `2831d76`  | `fix(etapa-15k/biometria)`: las rutas de «Rostro del visitante» admiten a cada rol que ve la pantalla (H-SITIO-03)                       |
| `f15f905`  | `fix(etapa-15k/arranque)`: start:dev con tsx, conexión de pg-boss y URL pública de bucle local (H-SITIO-06, 07, 10)                      |
| `2e229d6`  | `fix(etapa-15k/movil)`: clave de red local de iOS y detalle técnico del fallo en Debug (H-SITIO-11)                                      |
| `de75aa3`  | `fix(etapa-15k/equipos)`: Digest con nonce vencido, apertura sin «abierta» y escucha que se ve (H-SITIO-12, 13, 14)                      |
| `bd5d0dc`  | `fix(etapa-15k/equipos)`: carga de plantillas, verificación remota, rostros del videoportero y cámara rechazada (H-SITIO-04, 05, 09, 01) |
| `7d303e1`  | `feat(etapa-15k/biometria)`: consentimiento presencial escrito por el titular (D-10)                                                     |
| `a697a97`  | `feat(etapa-15k/equipos)`: atestación física del instalador por firmware (D-11)                                                          |
| `2c2dce4`  | `test(etapa-15k/e2e)`: recorrido de la consola contra API real, PostgreSQL y simulado (§4)                                               |
| `ca011c7`  | `feat(etapa-15k/sitio)`: captura cruda por equipo y guía de sitio corregida (§5)                                                         |
| `2b593c0`  | `fix(etapa-15k/equipos)`: baja de la persona por UserInfoDetail/Delete, como la guía de la serie de la terminal (H-15K-02)               |
| `6d47fe9`  | `fix(etapa-15k/sitio)`: la carga de prueba de --capturar se construye dentro de @ncr/providers (O2)                                      |
| `637b890`  | `test(etapa-15k/controles)`: la sonda 34 ejerce los .xcconfig y el trinquete mide los dos controles nuevos                               |
| `65b7c84`  | `chore(etapa-15k)`: cierre de la ronda de hallazgos de sitio (informe, ESTADO y registro)                                                |
| `70ae74c`  | `test(etapa-15k/equipos)`: las ramas nuevas del proveedor, ejercidas (umbral de ramas de @ncr/providers)                                 |
| `93174b8`  | `docs(etapa-15k)`: la primera corrida final del verificador, FALLIDA, y lo que destapó                                                   |
| `7d56f8e`  | `fix(etapa-15k/verificador)`: el paso 5 nombra la roja desde su informe JSON                                                             |
| `d7813c4`  | `docs(etapa-15k)`: la segunda corrida final, FALLIDA por una roja intermitente sin nombre                                                |
| `cea9121`  | `fix(etapa-15k/pruebas)`: el tablero y el registro de equipos, aislados de las suites en paralelo y de corridas anteriores               |
| `967fb4e`  | `docs(etapa-15k)`: la tercera corrida final nombra la roja, y era de esta ronda                                                          |
| _(cierre)_ | `docs(etapa-15k)`: el veredicto literal de la cuarta corrida, correcta                                                                   |

**PR** contra `develop`, abierto y **sin fusionar**.

---

## LO QUE FALTA

**La prueba en sitio de los tres equipos y los 16 escenarios** (BE-02), ahora
con la consola probada contra la API real, y la **captura cruda** que cierra
H-SITIO-01, 04 y 13. Los extractos ISAPI que faltan para cerrarlos sin
adivinar, en el mensaje de cierre de la ronda y aquí:

1. **El «Error Code Dictionary»** de las tres guías (series Value, IP/Ultra y
   cámaras ANPR): las tres lo citan y ninguno de los extractos lo trae. Sin él,
   el `subStatusCode` del 400 de la terminal y el error del disparador de la
   cámara se leen como texto, no como causa.
2. **Cámara ANPR** · la lectura (`GET`) de la vinculación del evento de
   detección de vehículo, o el listado `GET /ISAPI/Event/triggers`: el extracto
   sólo documenta el `PUT` de `vehicledetection-<canal>`.
3. **Cámara ANPR** · el recurso que escribe la página «Control del paso» con
   «Paso automático» por tipo de lista, si la guía lo documenta en otra
   sección; si no, la captura del navegador del paso 5 lo sustituye.
4. **Terminal (serie Value)** · los parámetros de puerta
   (`AccessControl/Door/param/<puerta>`) con el significado de su estado
   «permanecer cerrada», y cuántas puertas y relés declara la K1T344.
5. **Videoportero (serie IP/Ultra)** · qué número de puerta corresponde a la
   cerradura del KD9633-WBE6 y si su apertura remota exige el contexto de una
   llamada (`controlType`).
