# ETAPA 15-E · Integración en sitio: todo lo que se puede probar delante de los equipos sin tocar el dominio

**Rama:** `etapa-15e-integracion-en-sitio` · **Base:** `develop` (`4cea5f0`)

| Commit                | Qué trae                                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fd217bd`             | `fix(etapa-15e/consola)`: los umbrales técnicos dejan de enviarse y se muestran en sólo lectura con su escala (A7)                                                                                    |
| `e1b59c3`             | `fix(etapa-15e/movil)`: `API_URL` unificado, sin `localhost` por omisión y ATS sólo en depuración (A6)                                                                                                |
| `4008e65`             | `feat(etapa-15e/api)`: apertura, intercom y placas por los puertos de proveedor; el histórico va a PostgreSQL (A1)                                                                                    |
| `767097a`             | `feat(etapa-15e/terminal)`: verificación remota de la terminal facial de punta a punta (A2)                                                                                                           |
| `91fc03e`             | `feat(etapa-15e/biometria)`: CU-02 en PostgreSQL, enlace del titular y sincronización a todas las terminales (A3)                                                                                     |
| `99ad78f`             | `feat(etapa-15e/videoportero)`: llamada emergente, escuchas por capacidad, señalización y audio persistente (A4)                                                                                      |
| `e1bbe10`             | `feat(etapa-15e/guardia)`: vista en vivo por WHEP a través de la API con go2rtc (A5)                                                                                                                  |
| `6c8950c`             | `feat(etapa-15e/sitio)`: hoja de resultados de los 16 escenarios de aceptación en el guion de sitio (A8)                                                                                              |
| `4f942fb`             | `docs(etapa-15e)`: guía `INTEGRACION_HIKVISION.md`, README, ADR-022, ESTADO, contradicciones, cliente Dart regenerado (A9)                                                                            |
| `dcf863e` · `437e552` | `test`/`fix(etapa-15e/verificador)`: barrido de escrituras de la consola, contrato tipado y arranque en frío (hallazgos de las corridas 1 y 2)                                                        |
| _(lote)_              | `feat(etapa-15e/persistencia)`: alertas, órdenes manuales y auditoría en PostgreSQL; enlace del titular de un solo uso con evidencia y QR; hoja del videoportero; pruebas de las cinco comprobaciones |
| _(cierre)_            | `chore(etapa-15e)`: cierre de ronda con el veredicto literal del verificador                                                                                                                          |

Esta ronda **NO se fusiona**: abre PR contra `develop` y se detiene ahí. El
usuario prueba esta versión en sitio; el **Bloque B** (residentes y portería:
usuarios, primer inicio, turnos, patrullaje, supervisión) no se ejecuta hasta
que lo pida y quede registrado como extensión al contrato.

> **ESTA RONDA NO CIERRA LA ETAPA 15, y la 15 sigue BLOQUEADA (`BE-02`).**
> Cada afirmación de este informe está clasificada como **DOCUMENTADO**,
> **SIMULADO**, **PROBADO CONTRA MOCK** o **VERIFICADO CONTRA HARDWARE**. En
> esta ronda **no hay ni una afirmación nueva de la cuarta clase**: el entorno
> no alcanza ninguna dirección privada y no se habló con ningún aparato. Lo que
> sí hay, y no había, es la **hoja de resultados** con la que la cuarta clase
> se puede alcanzar (§11).

---

## 1 · Qué se construyó

**A1 · Los puertos del proveedor tienen consumidor.** `ACCESS_POINT_PROVIDER`,
`INTERCOM_PROVIDER` y la fuente de placas compartida están cableados: toda
orden de apertura resuelve por el proveedor contra el registro y decide por
capacidades; el canal de intercom abre el del aparato al conceder el turno; las
publicaciones de la cámara entran por la misma fuente que el adaptador. «Nunca
dos caminos silenciosos»: `BARRERA_*` sobrevive como compatibilidad declarada y
el arranque anuncia qué camino atiende. El histórico de eventos va a PostgreSQL
en tiempo de ejecución (`PERSISTENCIA_DE_EVENTOS`). _Probado contra mock y
contra base real; con `simulado` nada cambia (ADR-03)._

**A2 · La terminal facial pregunta y recibe respuesta.** El evento con
`remoteCheck` llega, `RegistrarAcceso` decide y la API responde `PUT
remoteCheck` con el veredicto; `remoteCheck` (pregunta) y `remoteCheckResult`
(eco) se distinguen para no registrar dos accesos. `AcsCfg` se escribe sólo
como corrección explícita desde la ficha. _Probado contra mock; la ruta es
DOCUMENTADA (S-35)._

**A3 · CU-02 completo contra PostgreSQL.** Consentimientos, plantillas y
sincronizaciones en las tablas 0008/0022 con sus cerrojos; el consentimiento se
pide **al visitante** (RN-10) por un enlace firmado por copropiedad y con
caducidad, que el visitante responde sin sesión desde su teléfono; la plantilla
se sincroniza a **todas** las terminales con biblioteca y cada alta se verifica
por **conteo**, no por HTTP 200; la supresión al vencer y la **inmediata al
revocar** (CA-11) retiran de las terminales y lo dicen si no pudieron. Actor de
ingesta propio (migración 0035, D-137). _Probado contra mock, por HTTP y contra
base real (`biometria-pg.test.ts`)._

**A4 · El videoportero llama y se le contesta.** Escuchas de equipo por
capacidad (`alertStream` o `subscribeEvent`), rearmadas cada 30 s; la llamada
resuelve la vivienda por edificio y unidad y aparece como aviso emergente en
portería y guardia por SSE; contestar y colgar van por `callSignal` **sólo si
el equipo lo declara** (el del proyecto no: NO APLICA POR CAPACIDAD); el audio
sube por **un** `PUT` persistente con contrapresión y baja por `GET`, en el
formato que el equipo anuncia; el navegador oye y habla por la API con
G.711 decodificado en el cliente. La apertura sigue siendo una orden aparte.
_Probado contra mock; formato de audio VERIFICADO el 18/09; rutas DOCUMENTADAS._

**A5 · Vista en vivo por WHEP a través de la API** (ADR-022). El proveedor
expone `origenDeVideo`; la API declara el puerto `PuenteDeVideo` y lo implementa
sobre go2rtc; `POST …/guardia/video/:equipo/whep` valida alcance, rol y cuerpo
antes de registrar el flujo y negociar en nombre del navegador. La URL RTSP con
la credencial nace en `packages/providers` y viaja sólo de la API a go2rtc;
cualquier `rtsp://` de un error se redacta. La consola mide negociación y primer
cuadro (KPI-33). _Probado contra mock y con fetch/RTCPeerConnection falsos;
S-46 y S-47 DOCUMENTADOS._

**A6 · La app sin `localhost` por omisión** y ATS sólo en depuración. **A7 · Los
umbrales técnicos** fuera de la consola del superadmin, en sólo lectura con su
escala. **A8 · La hoja de resultados** de 16 escenarios la escribe el guion de
sitio con lo que sabe. **A9 · La guía** `INTEGRACION_HIKVISION.md`, el README
con «las tres aplicaciones contra una base y los tres equipos», el ADR-022, el
ESTADO y el cliente Dart regenerado.

## 1 bis · Las cinco comprobaciones del cierre

Pedidas por el usuario antes de cerrar, respondidas **leyendo código** y con la
corrección aplicada en un solo lote cuando la respuesta era NO. **Nada de esta
ronda es VERIFICADO CONTRA HARDWARE.**

| #   | Comprobación                                                                               | Estado inicial                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Acción tomada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Evidencia (archivo:línea · prueba)                                                                                                                                                                                                                                                                                                  | Clasificación                                                                                   |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Los eventos se guardan en PostgreSQL en ejecución                                          | **SÍ** para eventos (`eventos.module.ts:114-130`, `RepositorioEventosPgDeServicio` por `PERSISTENCIA_DE_EVENTOS`); **NO** para alertas (`eventos.module.ts:133`, en memoria), la bitácora de órdenes (`guardia.module.ts:107`, en memoria) y la auditoría de seguridad (`nucleo.module.ts:50`, doble en memoria)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Migración **0036**: tabla `ordenes_manuales` con RLS forzada, auditoría y sin borrado; `alertas` admite el origen de consola (`origen_texto`) y pierde la clave ajena a `dispositivos` que `eventos` nunca tuvo. `RepositorioAlertasPg`, `BitacoraDeOrdenesPg` y `RegistroDeAuditoriaPg`, elegidos por el mismo interruptor y anunciados al arrancar. ADR-05 intacto                                                                                                                                                                                                                                                                                   | `eventos/infraestructura/repositorio-alertas-pg.ts` · `guardia/infraestructura/bitacora-de-ordenes-pg.ts` · `comun/auditoria/auditoria-pg.ts` · `test/persistencia-operativa-pg.test.ts` (evento leído por otra instancia y `UPDATE`/`DELETE` rechazados como dueño; alerta de evento y de consola; orden con desenlace; auditoría) | PROBADO CONTRA BASE REAL                                                                        |
| 2   | `consentimientoVigente: false` fijo retirado; consentimientos, plantillas y bóveda en base | **SÍ** · el cargador lo resuelve por `LectorDeConsentimientoBiometrico` (`cargador-pg.ts:88`, `131-140`), cableado en `eventos.module.ts:229-243` con `IdentidadBiometricaDesdeRepositorios`; biometría en PostgreSQL por `PERSISTENCIA_DE_BIOMETRIA` (`biometria.module.ts:90-136`), plantilla cifrada con `BovedaAesGcm` sobre `AlmacenDeBytesPg` (`biometria.module.ts:154-160`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Sin corrección de fondo. Se quitó un N+1 real: el lector consultaba el consentimiento **por cada plantilla** del titular; ahora son dos consultas fijas en paralelo (`identidad-biometrica.ts:38-52`). No es «la misma consulta que el evento»: son consultas paralelas sin bucle                                                                                                                                                                                                                                                                                                                                                                      | `test/biometria-pg.test.ts` (sin consentimiento no sincroniza; revocación suprime, verificada por conteo) · `cargador-pg.consentimiento.test.ts` · `identidad-biometrica.test.ts`                                                                                                                                                   | PROBADO CONTRA BASE REAL y CONTRA MOCK                                                          |
| 3   | El visitante acepta sin sesión de residente                                                | **SÍ** en la ruta pública (`consentimiento-publico.controller.ts`, `@Publico()` por método, 30/min), token HMAC por copropiedad con caducidad (`firmante-de-enlaces.ts`), página con finalidad y versión (`pagina-de-consentimiento.ts:61-62`); **NO** en tres cosas: el enlace no era de un solo uso, no dejaba evidencia de origen ni constancia en `auditoria_seguridad`, y no había QR. Y la app del residente **no recibía el enlace**: el DTO lo omitía (`mi.controller.ts:265-280`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Enlace de **un solo uso por estado**: el token lleva el estado al emitir (`s`) y deja de valer en cuanto el consentimiento cambia (`enlace-de-consentimiento.ts`, `enlaceVigente`); un enlace gastado muestra lo decidido sin formularios y los POST no actúan. Evidencia en `auditoria_seguridad` (`respuesta_de_titular`: respuesta, versión de la política, IP, agente, momento). QR en la consola (`componentes/codigo-qr.tsx`, SVG sin HTML inyectado). `enlaceDeConsentimiento` en `RostroCapturadoDto`; clientes regenerados. La página pública vive en la API y no en la consola: el proxy de la consola exige sesión y el titular no la tiene | `test/consentimiento-publico.e2e.test.ts` (acepta; gastado no revoca; enlace nuevo revoca; rechazo; token alterado, ajeno y caducado; evidencia con agente e IP) · `test/aislamiento-residente.e2e.test.ts` (rechazo por el enlace: la visita sigue viva y el enlace queda gastado) · `seguimiento.test.tsx` · `codigo-qr.test.tsx` | PROBADO CONTRA MOCK                                                                             |
| 4   | Qué declaró el videoportero real y si el timbre llega a portería                           | Volcado `docs/insumos/hikvision/hik-videoportero-capabilities.xml`: suscripción de eventos **sí** (l. 26), señalización de llamada **no** (l. 82), apertura remota **sí** (l. 72), audio 1 entrada/1 salida (l. 22-25; canal de audio VERIFICADO el 18/09 con G.711 µ-law, deshabilitado), biblioteca de rostros y personas **no constan**. (a) El timbre **SÍ** llega: `voiceTalkEvent` (`contratos-de-evento.ts:483-522`) → escucha por suscripción (`hikvision-provider.ts:278-304`) rearmada cada 30 s (`escuchas-de-equipos.ts:22,51-98`) → `ingerirLlamada` (`ingestor-de-publicaciones.ts:119,242-258`) → SSE `llamadas` (`avisador-por-canal.ts:22`, `web/lib/sse/canal.ts:179`) → aviso emergente (`aviso-de-llamada.tsx`) en portería y guardia. (b) `callSignal`: NO APLICA POR CAPACIDAD en la ficha (`diagnostico/ficha.ts`) y sólo se envía si se declara (`intercom-equipo.ts`). (c) Audio por su flujo propio, canal descubierto, PUT persistente, formato anunciado. (d) Apertura remota por `AccessPointProvider`, atribuida y auditada (`accionador-por-proveedor.ts`, `/guardia/ordenes`). (e) Facial en el videoportero: NO APLICA salvo que la ficha lo declare | Hoja de resultados del videoportero (V1–V6) reescrita con lo que ESTE equipo declara y cada NO APLICA explícito (`scripts/lib/hoja-de-resultados.mjs`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `hikvision-provider.escucha.test.ts` · `escuchas-de-equipos.test.ts` · `alarm-server.e2e.test.ts` (llamada → aviso) · `aviso-de-llamada.test.tsx` · guion `--simulado`                                                                                                                                                              | DOCUMENTADO (rutas) · PROBADO CONTRA MOCK (camino) · VERIFICADO el 18/09 sólo el canal de audio |
| 5   | El superadministrador puede guardar la configuración                                       | **NO** probado contra la API: sólo `formulario.test.tsx` contra un doble                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `test/configuracion-superadmin.e2e.test.ts`: el cuerpo EXACTO de la consola pasa el `ValidationPipe` real (200), se lee después y un campo retirado sigue dando 400. `formulario.test.tsx`: cada clave del PATCH tiene que existir en `CambiosDeConfiguracionDto` del contrato versionado                                                                                                                                                                                                                                                                                                                                                              | las dos pruebas nombradas                                                                                                                                                                                                                                                                                                           | PROBADO CONTRA MOCK (catálogo en memoria; la validación es la real)                             |

**Lo que no se hizo, dicho:** los bloqueos de acceso (`RegistroDeBloqueos`) siguen en memoria y un reinicio los pierde; es el mismo defecto de la comprobación 1 y queda como **D-140** con dueño. La app del residente recibe ya el enlace en su cliente generado, pero **no tiene pantalla** que lo muestre con QR: hoy lo entrega el operador desde la consola.

## 2 · Problemas encontrados

| Id        | Qué                                                                                                                                                                                                                                                   | Estado                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **D-137** | `ACTOR_INGESTA` era el superadministrador de la **semilla** y no existía en las migraciones: contra una base sin semilla, la ingesta no tenía actor y el disparador de tenant la rechazaba                                                            | Corregido · 0035, actor `…0003` (S-44)     |
| **D-138** | `guardia.controller.ts` tiene 534 líneas desde la A4 (§2.3: ≤ 300). El video fue a `VideoController`; el resto no se partió en esta ronda para no rehacer                                                                                             | **Abierto** · ETAPA 16                     |
| —         | El recuadro de video de la consola afirmaba que WebRTC exige HTTPS. Sólo `getUserMedia` lo exige; `RTCPeerConnection` en modo «sólo recibir» funciona por `http://<IP>`                                                                               | Corregido (ADR-022)                        |
| —         | Un filtro global exponía los mensajes `expose: true` de `http-errors` («request entity too large»): se sustituyó por un marcador propio (`EXPONE_MENSAJE`)                                                                                            | Corregido                                  |
| —         | Importar el barril de guardia desde `main.ts` cerraba un ciclo de inyección (D-66 otra vez): las constantes de rutas crudas viven en `comun/`                                                                                                         | Corregido                                  |
| —         | `PG` evalúa el `CHECK` sobre la fila propuesta **antes** de resolver `ON CONFLICT`: el `GREATEST` de la supresión tuvo que ir en `VALUES`, no en `DO UPDATE`                                                                                          | Corregido, con la explicación junto al SQL |
| **D-139** | Alertas, órdenes manuales y auditoría de seguridad vivían en memoria: la prueba en sitio no dejaba evidencia de CA-18, RN-08 ni KPI-38 tras un reinicio                                                                                               | Corregido · 0036 y tres repositorios PG    |
| **D-140** | Los bloqueos de acceso (`RegistroDeBloqueos`) siguen en memoria: un acceso bloqueado por administración se desbloquea solo al reiniciar                                                                                                               | **Abierto** · ETAPA 16                     |
| —         | El enlace del titular se emitía y **no llegaba a la app**: el DTO de la captura lo omitía; el cliente Dart tampoco lo tenía                                                                                                                           | Corregido (DTO + clientes regenerados)     |
| —         | Tres hallazgos del verificador que las corridas dirigidas no vieron: una pantalla que escribe sin clasificar en el barrido, una exención del contrato que sobraba y un 204 sin declarar, y el arranque en frío que contaba un solo actor tras la 0035 | Corregidos (`dcf863e`, `437e552`)          |

## 3 · Cómo se organizó y por qué

### 3.1 · Compones, no rehaces

Ninguna pieza de la 15-B a la 15-D se reescribió: `HikvisionProvider`, la
fábrica, el registro D5, `CargadorDeContextoPg`, las capacidades, la suite de
contrato, «Órbita», el diagnóstico y el guion `--simulado` siguen siendo los
mismos ficheros con los mismos contratos. La ronda **añade consumidores** a
puertos que no los tenían y **completa flujos** que quedaban a medias. Ningún
puerto del dominio cambió; donde hizo falta una forma nueva, la declaró el
consumidor en su capa de aplicación (`PuenteDeVideo`, `AvisadorDeLlamadas`,
`CatalogoDeTerminales`), como manda §2.2.

### 3.2 · Se decide por capacidad, no por clase de proveedor

Todo lo que habla con un aparato pregunta antes qué declara: audio, biblioteca
de rostros, señalización, suscripción, placas. El simulado con un identificador
que no conoce sigue funcionando (reparte turnos sin audio, no sincroniza, no
escucha) **y lo dice**. Es lo que hace que la misma consola valga para ensayar
y para operar.

### 3.3 · El navegador nunca toca un equipo

Audio, video y órdenes pasan por la API con sesión, rol y copropiedad. La URL
RTSP, la credencial y la dirección del puente no llegan al cliente ni a la
bitácora (RN-12, RN-21, C-28). Es la razón de ADR-022 frente a la forma «directa»
de usar go2rtc, que es más corta y no se puede autorizar.

### 3.4 · Verificar por efecto, no por respuesta

Una sincronización se da por hecha cuando el **conteo** de la biblioteca sube;
una supresión, cuando baja. Un `200` que no cambia el conteo es un fallo y se
reporta como tal. La misma regla que ya regía para el modo de control de la
cámara (`ctrlMode` se **lee**, no se supone).

### 3.5 · La hoja de resultados es el cierre, no el informe

El informe del guion dice si las rutas existen; la hoja dice si el sistema
cumple sus criterios de aceptación. Sin identificador de evento no hay PASA
(RN-02): la hoja no puede ser más laxa que la regla que verifica.

## 4 · Árbol de archivos (selección)

**Proveedores.** `nucleo/escucha.ts`, `nucleo/video.ts`,
`nucleo/verificacion-remota.ts` (contratos nuevos del puerto de operación);
`hikvision/video-rtsp.ts` (S-46); `equipo/escucha-alertstream.ts`;
`videoportero/intercom-equipo.ts` (PUT persistente, señalización);
`terminal/terminal-facial.ts` (verificación por conteo).

**API.** `alarmserver/aplicacion/escuchas-de-equipos.ts` (ciclo de vida de las
escuchas), `puertos.ts` (llamada, avisador, resolutor), `infraestructura/avisador-por-canal.ts`;
`biometria/aplicacion/{enlace-de-consentimiento,sincronizacion-total,identidad-biometrica}.ts`,
`infraestructura/{repositorios-pg,firmante-de-enlaces}.ts`,
`presentacion/{consentimiento-publico.controller,pagina-de-consentimiento}.ts`;
`guardia/aplicacion/vista-en-vivo.ts`, `infraestructura/{puente-go2rtc,canal-intercom-con-transporte,accionador-por-proveedor}.ts`,
`presentacion/video.controller.ts`; `comun/{ruta-de-audio,ruta-de-video,claims-de-servicio,filtros/error-expuesto}.ts`;
`eventos/infraestructura/repositorio-eventos-pg-de-servicio.ts`;
migración `0035_actor_de_ingesta.sql`.

**Consola.** `componentes/{video-en-vivo,aviso-de-llamada,controles-de-audio}.tsx`,
`lib/video/whep.ts`, `lib/audio/{g711,puente}.ts`, `lib/sse/llamadas.ts`,
`(consola)/biometria/seguimiento.tsx`, `(consola)/configuracion/ajuste-fijo.tsx`.

**App móvil.** `API_URL` por `--dart-define`, ATS de depuración, cliente
generado al día (`lib/infraestructura/api/generado`).

**Guion y docs.** `scripts/lib/hoja-de-resultados.mjs`;
`docs/guias/INTEGRACION_HIKVISION.md`; `docs/decisiones/ADR-022-…md`; README §2 y §6.

## 5 · Tabla SOLID

| Principio | Cómo se materializa en esta ronda                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SRP**   | El video tiene su controlador, su caso de uso y su adaptador; la hoja de resultados es un módulo aparte del guion. Deuda declarada: `guardia.controller.ts` (D-138)           |
| **OCP**   | Un puente de video distinto es otro `PuenteDeVideo`; otra forma de RTSP es una función del proveedor; una capacidad nueva no toca el caso de uso                              |
| **LSP**   | La suite de contrato corre contra simulado, Hikvision y «Órbita» con `origenDeVideo` y `escuchar` sin una rama por implementación                                             |
| **ISP**   | `PuenteDeVideo` tiene dos métodos; `AvisadorDeLlamadas`, uno; `CatalogoDeTerminales`, lo que la sincronización necesita y nada más                                            |
| **DIP**   | La aplicación importa `@ncr/providers` sólo como tipo (control `frontera-extensibilidad`); las URL del fabricante viven en `packages/providers` (`frontera-hardware`, KPI-11) |

## 6 · Trazabilidad

| Requisito                                                        | Cobertura en esta ronda                                                                 | Clase                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| CU-01 (LPR) · CA-04, CA-05, CA-12, CA-13                         | Apertura por proveedor, histórico en PG, hoja L1–L5                                     | Probado contra mock · pendiente en sitio               |
| CU-02 · RN-09, RN-10, RN-11 · CA-08 a CA-11 · KPI-16, 17, 20, 21 | Enlace del visitante, sincronización a todas, supresión verificada, hoja T1–T5          | Probado contra mock y contra base · pendiente en sitio |
| CA-26 · verificación remota                                      | `remoteCheck` de punta a punta, hoja T2–T3                                              | Probado contra mock · DOCUMENTADO                      |
| CU-03 · HU-25 a HU-29 · CA-16 a CA-20 · KPI-32, 33, 35           | Llamada emergente, audio, video por WHEP, órdenes con motivo, hoja V1–V6                | Probado contra mock · pendiente en sitio               |
| ADR-01                                                           | Audio por ISAPI TwoWayAudio detrás de `IntercomProvider`, exclusividad en el dominio    | Formato VERIFICADO (18/09); transporte DOCUMENTADO     |
| RN-12, RN-21, C-28                                               | Ninguna respuesta, bitácora ni cliente lleva RTSP, host ni credencial                   | Probado (pruebas de redacción y de exposición)         |
| KPI-11, KPI-12                                                   | Fronteras de hardware y extensibilidad; suite completa sin hardware                     | Probado                                                |
| KPI-13, 32, 33                                                   | Medidos en API (interceptor) y en consola (primer cuadro); extremo a extremo en la hoja | **Pendiente en sitio**                                 |
| Hitos 1, 2 y 3 del reto                                          | —                                                                                       | **SIN EJECUTAR** contra hardware                       |

## 7 · Seguridad (§2.7)

- **Secretos**: `GO2RTC_URL`, `API_URL_PUBLICA`, `ALARM_SERVER_EQUIPOS` sólo por
  entorno y en `.env.example` sin valor; el control `entorno-declarado` lo
  exige. La credencial del equipo sale del sobre cifrado sólo dentro del
  proveedor; la URL RTSP se redacta de todo error del puente.
- **CORS y CSP**: sin cambios; `PUENTE_VIDEO_URL` queda vacío porque el
  navegador no habla con go2rtc (ADR-022).
- **Validación**: la oferta SDP se acepta sólo como `application/sdp` y con
  `v=0`, acotada a 64 KiB bajo su ruta; el audio, como `octet-stream` acotado.
  Las rutas públicas del consentimiento validan el token HMAC con
  `timingSafeEqual` y caducidad, y aparecen en las listas justificadas de las
  suites de aislamiento y de escrituras.
- **Rate limiting**: consentimiento público a 30/min; el receptor de alarma
  conserva su tope alto por IP.
- **RLS**: todo acceso de servicio pasa por `claimsDeServicio` con el actor de
  ingesta propio (0035) y copropiedad explícita; probado contra base real.
- **Alcance**: el WHEP responde 404 fuera del alcance **antes** de mirar el
  puente; la suite de aislamiento lo recorre sola.

## 8 · Pruebas

Por paquete, con las corridas dirigidas de la ronda (las cifras definitivas son
las del verificador, más abajo):

| Paquete          | Qué se añadió                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `@ncr/providers` | escucha, señalización, PUT persistente, `origenDeVideo`, contrato del proveedor para los tres adaptadores                   |
| `@ncr/api`       | escuchas, ingesta de llamada, enlace de consentimiento, sincronización total, puente go2rtc, vista en vivo, e2e de WHEP, PG |
| `@ncr/web`       | aviso de llamada, G.711, puente de audio, WHEP, `VideoEnVivo`, seguimiento biométrico                                       |
| Flutter          | `dart analyze lib` sin incidencias con el cliente regenerado                                                                |

Contra **base real** (`DATABASE_URL_PRUEBAS`): `biometria-pg.test.ts` (A3),
`repositorio-eventos-pg-de-servicio` (A1), `cargador-pg.consentimiento` y los
de rondas anteriores.

### El veredicto literal de `./scripts/verificar-etapa.sh --con-base`

_(se pega en el commit de cierre)_

### El guion de sitio, ejecutado en modo SIMULADO

`node scripts/puesta-en-marcha-equipos.mjs --simulado --con-audio --hoja=…`:
salida 0, tres familias declaradas, hoja de 16 escenarios escrita y rotulada
SIMULADO. **No vale como verificación.**

## 9 · Deuda técnica, supuestos y pendientes

- **`[SUPUESTO]` S-39 a S-47** en `contradicciones-y-supuestos.md` §2. S-46
  (forma de la URL RTSP) y S-47 (API de go2rtc) se confirman en sitio.
- **D-138** · `guardia.controller.ts` > 300 líneas.
- **En memoria todavía**: los bloqueos de acceso (D-140). Alertas, órdenes y
  auditoría ya van a la base con `PERSISTENCIA_DE_EVENTOS=postgres`.
- **Una sesión de intercom por proceso** en `HikvisionProvider`: dos
  videoporteros a la vez en la misma API no se han diseñado.
- **La sincronización del consentimiento corre en la petición**; un trabajo de
  pg-boss con reintentos sería lo correcto para varias terminales lentas.
- **La app del residente recibe el enlace** (`enlaceDeConsentimiento`, ya en su
  cliente) pero **no tiene pantalla** que lo muestre con QR: hoy lo entrega el
  operador desde la consola, que sí lo muestra con QR.
- **Cámaras registradas antes de la 15-E** tienen `bloqueoDeAcceso` en
  `desconocida` hasta volver a sondear.
- **KPI-33 extremo a extremo** no tiene medida automática: la consola muestra
  el primer cuadro y la hoja lo anota.
- **Android**: la configuración de tráfico en claro para `http://<IP>` en
  depuración queda pendiente de comprobar en un dispositivo.
- **`PENDIENTE DE DEFINICIÓN`** · Bloque B (usuarios de residentes y portería,
  primer inicio, turnos, patrullaje, supervisión): no se construye hasta que el
  usuario lo pida y quede como extensión al contrato.

## 10 · Qué debe hacer el usuario manualmente

1. **Aplicar las migraciones 0035 y 0036** (`supabase db push`). Sin la 0036 no
   hay órdenes manuales ni alertas de consola en la base.
2. **Configurar la API** para sitio: `PERSISTENCIA_DE_EVENTOS=postgres`,
   `PERSISTENCIA_DE_BIOMETRIA=postgres`, `PROVEEDOR_DE_EQUIPOS=hikvision`,
   `API_URL_PUBLICA=http://<IP>:3000`, `ALARM_SERVER_EQUIPOS` con la cámara,
   `GO2RTC_URL=http://127.0.0.1:1984` si va a haber video.
3. **Instalar go2rtc** en la máquina de la API con la configuración mínima de
   la guía §6.4; ningún equipo en su fichero.
4. **Dar de alta los tres equipos** desde Dispositivos con su usuario de
   servicio; revisar la ficha y aplicar las correcciones que ofrezca
   (`ctrlMode`, verificación remota); habilitar el canal de audio del
   videoportero en el propio equipo.
5. **Apuntar la cámara** a `http://<IP>:3000/alarm-server/<secreto>`.
6. **Ejecutar el guion** (`--sin-accionar` primero, `--hoja=./hoja.md`) y
   **rellenar la hoja** con los 16 escenarios (guía §9). Adjuntarla elidida.
7. **Ratificar S-38** (ADR-020) y **confirmar S-46 y S-47** con lo observado.
8. **Pedir el Bloque B** por escrito si procede, para registrarlo como
   extensión al contrato antes de construirlo.

## 11 · Lo que sigue sin demostrarse, dicho sin suavizar

### Los tres hitos técnicos del reto · SIN EJECUTAR

Prototipo funcional contra equipos, prueba LPR real y prueba facial real:
**ninguno se ejecutó** en esta ronda. La ronda deja la versión y la hoja con
las que se ejecutan.

### KPI sin medir contra hardware

**KPI-13, 14, 17, 18, 22, 26, 27, 32 y 33.** El interceptor mide KPI-13, 32 y
33 en la API y la consola mide el primer cuadro; el extremo a extremo se anota
en la hoja.

### PROBADO CONTRA MOCK, no contra hardware

Toda la 15-E: apertura por proveedor, verificación remota, CU-02 con enlace y
sincronización a todas las terminales, escuchas, llamada, audio persistente,
señalización por capacidad, vista en vivo, hoja de resultados.

### SIMULADO

El guion y su hoja, rotulados.

### DOCUMENTADO

Las rutas de terminal y videoportero (D-125, S-35), los contratos de evento
JSON (S-36), `callSignal` (S-45), la forma de la URL RTSP (S-46), la API de
go2rtc (S-47), el formato multipart del servidor de alarma en sus nombres de
elemento.

### VERIFICADO CONTRA HARDWARE (de rondas anteriores, sin cambios)

La ruta de la barrera (15/09), la existencia del canal TwoWayAudio con G.711
µ-law y su estado deshabilitado, y la forma de los dos contratos de evento
(18/09).

### Qué cierra la ETAPA 15

La hoja de resultados con los 16 escenarios en PASA, o cada FALLA convertida en
defecto con dueño y una nueva hoja; y los tres hitos ejecutados de punta a
punta delante de los equipos.
