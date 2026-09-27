# ETAPA 15-L · Entrega final en sitio

**Rama:** `etapa-15l-entrega-final` · **Base:** `develop` (`fc353bc`, con el PR #33 y `5466dfa`)

> Informe en construcción. La primera sección es el **Bloque 0**, que el
> encargo exige ANTES de escribir código: cada respuesta con archivo:línea y
> evidencia. Lo que sale «no existe» o «no probado» pasa a trabajo obligatorio
> de esta corrección. El avance por bloque, con su commit, está en
> [Avance](#avance).

---

## Bloque 0 · Informe de bloqueos

### 0.1 · ¿Existe y está probado el circuito de verificación remota de la terminal?

**Existe; NO está probado de punta a punta, y tiene cuatro defectos que lo
rompen en sitio. Es el bloqueo número uno.**

| Tramo                                    | Dónde                                                                                                                                                                                                                                                           | Estado                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| La terminal pregunta                     | Por la escucha que abre la API (`escuchas-de-equipos.ts:44-120` → `escucha-alertstream.ts:127-281`) o por el Alarm Server (`alarm-server.controller.ts:105-133`); se reconoce en `contratos-de-evento.ts:654` (`esperaVeredicto: acceso?.remoteCheck === true`) | Existe                                                                                                                               |
| La plataforma decide                     | `ingestor-de-publicaciones.ts:381-426` → `registrar-acceso.ts:140-150` → motor puro `reglas/motor.ts:75-98`                                                                                                                                                     | Existe                                                                                                                               |
| Responde a la terminal                   | `terminal-facial.ts:361-386`: `PUT /ISAPI/AccessControl/remoteCheck?format=json`, `checkResult` `success`/`failed`                                                                                                                                              | Ruta **documentada, no verificada** (`catalogo-de-rutas.ts:354-367`); forma del cuerpo = S-39                                        |
| La terminal abre o niega                 | —                                                                                                                                                                                                                                                               | El simulado **no actúa** sobre el veredicto (`equipo-simulado.ts:545-551` lo anota y nadie lo lee)                                   |
| Prueba de punta a punta                  | `ensayo-en-sitio-pg.test.ts:488-541` entra por HTTP y decide con el motor real, pero el veredicto lo recoge `MockProvider.veredictos` en memoria: **ninguna llamada ISAPI**                                                                                     | **No probado** de punta a punta contra un simulado por HTTP                                                                          |
| **R1 · tenant sólo por variable**        | `ingestor-de-publicaciones.ts:142-150`: la copropiedad se busca **sólo** en `ALARM_SERVER_EQUIPOS`. La guía dice que la terminal NO se declara ahí (`VALIDACION_HIKVISION_EN_SITIO.md:139`)                                                                     | **Defecto**: el evento de una terminal dada de alta en la consola se descarta; la terminal espera y agota su plazo                   |
| **R2 · clave de idempotencia constante** | `contratos-de-evento.ts:649-650`: `referenciaDelEquipo = ${dispositivoId}:${channelID}`, que se usa antes que `serialNo` (`ingestor…:386-388`); la clave no lleva hora (`politicas/idempotencia.ts:25-40`)                                                      | **Defecto**: del segundo rostro en adelante, todo es «DUPLICADO» y la terminal recibe `failed`                                       |
| **R3 · XML pierde la pregunta**          | `bloqueDesdeXml` (`contratos…:571-600`) no extrae `remoteCheck` ni `serialNo`; la suscripción pide XML (`escucha-alertstream.ts:68-70`)                                                                                                                         | **Defecto**: una pregunta por XML nunca se contesta                                                                                  |
| **R4 · «en vivo» por `alarmDataType`**   | `contratos…:428-433`: sin `alarmDataType`, el evento del Alarm Server es histórico y se descarta; la terminal pone `currentEvent` dentro de `AccessControllerEvent`                                                                                             | **Defecto** en el camino del Alarm Server                                                                                            |
| Modo por omisión                         | Consola: `reporta_y_espera` (`alta-de-equipo.tsx:125-126`); API con el campo ausente: `null` = `decide_el_equipo` (`hikvision-provider.ts:570, 613`); sonda: `null` = `reporta_y_espera` (`sonda-por-proveedor.ts:146-150`). **El ingestor no lee el modo**     | Incoherente                                                                                                                          |
| `remoteCheckDoorEnabled`                 | `capacidades-hikvision.ts:141`: `['remoteCheckDoorEnabled', 'remoteCheck']`, el primero gana (:149-153)                                                                                                                                                         | **Verificado** (corregido en la 15-K); quedan dos comentarios viejos (`capacidades-hikvision.ts:38`, `catalogo-de-rutas.ts:327-330`) |

### 0.2 · ¿Qué transporte emite eventos y qué pasa con un evento no catalogado?

| Familia                 | Transporte                                                                                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cámara LPR              | **Sólo Alarm Server** (`POST /alarm-server/:secreto`), con secreto e IP de origen contra `ALARM_SERVER_EQUIPOS` (`guardia-alarm-server.ts:37-53`); la API nunca escribe `httpHosts` (se configura a mano)                                                              |
| Terminal y videoportero | `subscribeEvent` si el equipo lo declara, si no `alertStream` (`escucha-alertstream.ts:59-60`), abierta por la API **sola** a los ~30 s del alta (`escuchas-de-equipos.ts:22,44-57`), **pero sólo con `PROVEEDOR_DE_EQUIPOS=hikvision`** (`alarmserver.module.ts:109`) |

**Evento no catalogado: se DESCARTA.** No hay catálogo major/minor
(`majorEventType`/`subEventType` están en el tipo, `contratos-de-evento.ts:476-477`,
y no se leen). Puntos de descarte: latido y «sin `currentEvent`»
(`contratos…:556-563`), `sin_placa` para todo lo que no es placa, rostro,
llamada ni timbre (`fuente-de-placas.ts:155-157`), `historico`
(`recepcion.ts:112-117`), `ilegible` (`recepcion.ts:91-96`), equipo sin
copropiedad (R1). Llamada y timbre se avisan y **no se guardan**
(`ingestor…:291-315`); el resultado de la verificación remota, sólo a la
bitácora (`:344-353`). Puerta abierta/cerrada/forzada, botón de salida,
sabotaje: sin tratar, o mal clasificados como «rostro». **No hay tabla para
eventos de equipo que no son un acceso**: sólo `eventos` (acceso) y
`recepciones_evento`.

### 0.3 · ¿La consola lee eventos de PostgreSQL o de memoria?

**De PostgreSQL por omisión** (`PERSISTENCIA_DE_EVENTOS` vale `postgres` si
falta, `esquema.ts:230`; `eventos.module.ts:118-137`). Pero **siguen en memoria
en producción, sin alternativa PG**:

| Puerto                                    | Dónde                                   | Efecto en sitio                                                                                        |
| ----------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `REPOSITORIO_DISPOSITIVOS` (latidos)      | `eventos.module.ts:151-154`             | El tablero lee `dispositivos.ultimo_latido`, que **nadie escribe**: el mismo desacuerdo que H-SITIO-02 |
| `REGISTRO_DE_BLOQUEOS`                    | `guardia.module.ts:132`                 | Los bloqueos de acceso se pierden al reiniciar                                                         |
| `OPERACIONES_DE_DISPOSITIVO`              | `tablero.module.ts:45-46`               | Configurar / sincronizar / reiniciar se encolan en memoria y no llegan al equipo (DT-15K-03)           |
| `REPOSITORIO_CODIGOS_MFA`                 | `autenticacion.module.ts:30-34`         | Los códigos de recuperación se pierden al reiniciar (la tabla de la `0026` no se usa)                  |
| `NOTIFICADOR_PUSH`                        | `eventos.module.ts:161-165`             | Sólo bitácora                                                                                          |
| Bytes de evidencia sin `EVIDENCIA_BUCKET` | `eventos.module.ts:166-199`, `:358-369` | La fila sobrevive al reinicio y la imagen no                                                           |

Además, `PROVEEDOR_DE_EQUIPOS` vale **`simulado`** si falta (`esquema.ts:208`).

### 0.4 · De «registrar equipo» a «ver video en vivo»

- **Nadie arranca go2rtc**: ni guion, ni configuración, ni versión fijada
  (`VALIDACION_HIKVISION_EN_SITIO.md:77`, `:119`).
- URL RTSP: `rtsp://<usuario>:<clave>@<host>:554/Streaming/Channels/102`
  (`video-rtsp.ts:37-47`), **canal 102 fijo en el código**, puerto 554 fijo;
  ningún campo ni variable lo cambia.
- **Sin detección de códec**; ninguna guía dice H.264. Con H.265 o con ICE
  fallido la consola queda en «En vivo · primer cuadro pendiente» sobre negro
  (`video-en-vivo.tsx:142-159`; `whep.ts` no vigila `connectionstatechange`).
- Video **sólo en Guardia** (`guardia/pantalla.tsx:83-100`); ni Portería ni la ficha.
- Con el proveedor `simulado`, siempre 409 (`mock-provider.ts:125-130`).
- **Fuga entre copropiedades**: la ruta WHEP comprueba la copropiedad
  (`video.controller.ts:92`) y **no que el equipo sea de ella**
  (`vista-en-vivo.ts:54-74`; el registro lee por id con claims de superadministrador,
  `registro-de-equipos-pg.ts:67-72`). Un operador de A puede pedir el video de un equipo de B.

### 0.5 · ¿Por qué la app en un iPhone físico no inicia sesión?

**La hipótesis ATS queda DESCARTADA para el inicio de sesión:**

- La app habla con la API por **Dio** (`apps/mobile/lib/main.dart:58`), que en
  iOS usa `dart:io`, no `URLSession`; ningún plugin de red del `pubspec.yaml`
  usa `URLSession`. ATS no gobierna esas conexiones.
- El motor de Flutter en iOS fija `settings.may_insecurely_connect_to_all_domains = true`
  («Disabled in flutter#72723», `FlutterDartProject.mm:171` del motor), así que
  tampoco la política de red de Flutter bloquea `http://<IP-del-Mac>`.

**Causa probable:** el permiso de red local de iOS, que alcanza a `dart:io` y
que la app no pedía hasta la 15-K (`NSLocalNetworkUsageDescription`, fusionado
después de la visita). No se ha verificado en un iPhone. Si se negó una vez,
queda negado en Ajustes → Privacidad → Red local. **Otras candidatas:** una
compilación sin `--dart-define=API_URL` (la app lo dice: `ambiente.dart:81-82`),
o el cortafuegos del Mac.

---

## Puntos de parada: tocan el dominio o un ADR cerrado

Respondidos por el usuario el 2026-09-27. Las decisiones 5 a 9 del mismo mensaje (verificación remota armada, `offlineDevCheckOpenDoorEnabled`, clave con `serialNo`, foto normalizada, catálogo de `voiceTalkEvent`) se aplican en los bloques que las nombran.

| Punto | Qué toca                                                                                                                                                              | Estado                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A2    | El puerto del dominio `FaceTemplateProvider.sincronizar(dispositivoId, plantillaId, plantilla)` (`domain-core/src/puertos/proveedores.ts:31-34`) no lleva la vigencia | **AUTORIZADO**: parámetro opcional y aditivo con el VO `Vigencia`; `Valid` en hora local de America/Bogota sin desplazamiento; `userType "visitor"`; prueba de que sin el parámetro nada cambia                                       |
| F4    | El agregado `ConsentimientoBiometrico` exige que acepte el titular (`domain-core/src/biometria/consentimiento.ts:134-138`, RN-10) · ADR-029 · Ley 1581                | **CONFIRMADO**: la casilla es el único mecanismo obligatorio; origen «declarado por quien registra» distinto de «otorgado por el titular»; ADR nuevo que deroga ADR-029 en lo pertinente y registra el riesgo aceptado; RN-11 intacta |
| H1–H3 | Sustituye ADR-023 (usuario + NIT)                                                                                                                                     | **CONFIRMADO**: ADR-023 derogado; NIT fuera de toda la interfaz; el correo y código+usuario de los demás roles, intactos                                                                                                              |
| E1    | No es ADR, pero la evidencia de 0.5 dice que no arregla nada                                                                                                          | **SUSTITUIDO**: nada de `NSAllowsLocalNetworking` en release; se hacen E2 y E3 con la comprobación previa de `/health` desde Safari y una pantalla de error que nombra la causa                                                       |

---

## Avance

Orden fijado por el usuario: «R1-R4, A1, A4, A5, la fuga WHEP y B, en ese
orden. La fuga WHEP lleva prueba negativa entre copropiedades antes de
cerrar». Después, el resto del Bloque A (A2, A3) y los bloques C, D, E, J, H,
F, G, I.

| Bloque                             | Commit    | Qué queda probado contra el simulador                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1–R4 · verificación armada        | `a7a2821` | La terminal simulada pregunta (`remoteCheck`), la plataforma contesta `PUT remoteCheck` con el MISMO `serialNo` dentro del plazo y la terminal abre; `failed` niega; tarde o con otra serie, nada. Clave de idempotencia con `serialNo`: dos rostros → dos eventos y dos veredictos. XML del Alarm Server leído. La copropiedad sale del registro de equipos, no de la petición                                                                                                                                                                                                                                                                           |
| A5 · credencial rechazada          | `3f9ceef` | Un 401 sin `stale` marca la credencial; durante 30 min (S-68) no se vuelve a presentar y el equipo sale «degradado» con el motivo. Reintentos sólo de lo reintentable (equipo ocupado, desafío vencido), 3 intentos con jitter                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Fuga entre copropiedades (WHEP +)  | `3f9ceef` | 10 operaciones sobre un equipo de la copropiedad B pedidas desde la A → 404 y `auditoria_seguridad`. La prueba negativa se escribió ANTES de la corrección y fallaba                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| B · todos los eventos              | `6883c6c` | Tabla append-only `eventos_de_equipo` (0040, las cuatro capas de ADR-05, RLS forzada, prueba 97). Catálogo por código; nada se descarta; lo histórico en cola por lotes sin retrasar lo vivo; línea de tiempo con filtros y refresco en vivo en la consola                                                                                                                                                                                                                                                                                                                                                                                                |
| A1 · desenlace en palabras         | `6883c6c` | La apertura del motor y la orden manual quedan en la línea de tiempo con «el equipo la aceptó / la rechazó — motivo / no respondió»; el mensaje técnico sólo va a la bitácora                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| A4 · la cámara decidió             | `6883c6c` | Si el control de la cámara no está atestado o el propio evento dice que abrió ella, la lectura se registra y se marca «La cámara decidió por su cuenta»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| A2 · persona con vigencia          | (este)    | Con la vigencia de la autorización, la terminal simulada guarda al visitante (`userType: "visitor"`) con `Valid` en hora de Bogotá sin desfase, su puerta y su plantilla horaria; y **niega en local** pasada la vigencia, aunque la supresión no haya llegado. Sin el parámetro, el alta es byte a byte la de antes. La foto se comprueba antes de subirla (JPEG/PNG, ≤ 200 KB, ≤ 1024 px, configurables). Una autorización inexistente, revocada o vencida no deja sincronizar                                                                                                                                                                          |
| A3 · videoportero                  | `ac04d6d` | La biblioteca de rostros y el audio bidireccional se leen por capacidad. Con biblioteca, el videoportero recibe la plantilla por el mismo ciclo de A2 (persona con vigencia, rostro, búsqueda). Sin ella, la sincronización lo **omite y lo dice**: en su resultado («este equipo no admite rostros» o «aún no se sabe: pruebe la conexión»), en la bitácora y en la consola; la ficha usa las mismas palabras. `CapacidadNoSoportada` no se reintenta. El timbre de la terminal (5/37) y la llamada del videoportero dejan evento **y** aviso a la guardia virtual. El audio (abrir, transmitir, cerrar, exclusividad) es el de la 15-K, con sus pruebas |
| E2 · la app dice la causa          | `c3ad781` | La pantalla de acceso nombra la causa de un fallo de red con la red del teléfono y lo que contestó el sistema (datos móviles, sin red, permiso de red local, el Mac no contesta, servidor apagado, dirección mal compilada), y manda a comparar con Safari en `/health`. E3: `docs/guias/APP_EN_IPHONE.md`                                                                                                                                                                                                                                                                                                                                                |
| C1 · el equipo nuevo o editado     | `a02f8a0` | Guardar refresca la tabla de Dispositivos (que sale del tablero) en el acto, no a los 30 s. Editar, dar de baja, reactivar, corregir o volver a sondear un equipo hace que el proceso **olvide** lo que recordaba de él: la siguiente orden sale hacia la dirección nueva (probado contra el simulado, con la prueba del defecto al lado)                                                                                                                                                                                                                                                                                                                 |
| C2 · edición completa y auditada   | `a02f8a0` | Número de puerta del videoportero, **canal de video** (migración 0041, con su forma validada en la base) y **zona** (la base rechaza la de otra copropiedad) editables desde la ficha. La auditoría dice qué cambió, con valores salvo dirección, usuario y credencial («credencial reemplazada»)                                                                                                                                                                                                                                                                                                                                                         |
| D2 · canal y puerto del video      | `a02f8a0` | El flujo RTSP usa el canal de la ficha (102 por omisión) y `VIDEO_PUERTO_RTSP` del `.env`: ningún canal ni puerto fijo en el código                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C4 · latido real                   | `4aeed02` | `dispositivos.ultimo_latido` se escribe (antes nadie lo hacía y con PostgreSQL todos los equipos salían «Fuera de línea»). Cada 60 s (`EQUIPOS_LATIDO_S`): la señal de la escucha si oyó al equipo hace poco —evento o su propio latido—, si no una lectura real del equipo; sólo «en línea» late. Nunca retrocede y no toca equipos de otra copropiedad (probado contra PostgreSQL). El `POST /ingesta/latidos` del Edge también persiste ya                                                                                                                                                                                                             |
| D2 · el códec, preguntado          | (este)    | «Probar conexión» le hace al equipo un `DESCRIBE` RTSP (Digest, un solo intento autenticado) en el canal de su ficha y lee el códec del SDP. La ficha lo dice («H.264 · respuesta RTSP del equipo», o H.265 con qué hacer, o el canal que no existe); la fila del equipo muestra «Video H.265: no se ve en el navegador», y la ruta del video lo niega con esa frase en vez de negociar un negro. Probado contra un equipo RTSP simulado en el bucle local                                                                                                                                                                                                |
| C3 · probar conexión por capacidad | (este)    | El botón de cada equipo se llama «Probar conexión» y la ficha trae, por capacidad, lo que el equipo contestó: apertura, audio, rostros, suscripción (ya estaban), **video** (respuesta RTSP) y **eventos** (la escucha real: transporte y segundos desde la última señal del equipo). Los eventos NO se prueban abriendo una segunda conexión: en un equipo de un solo flujo le quitaría los eventos a la escucha de verdad                                                                                                                                                                                                                               |
| D3 · video con estados             | (este)    | Video en la guardia (ya estaba), en **Portería** (el equipo del evento en curso) y en la **ficha** (a pedido, para no ocupar el puente por mirar). Estados: negociando, en vivo, error con su causa, **sin señal** (negoció y no llega imagen en 8 s) y **se cortó** (la conexión WebRTC cayó después de negociar)                                                                                                                                                                                                                                                                                                                                        |

### Hallazgos de esta corrección

- **La fuga del Bloque 0.4 era más ancha que el video.** Además del WHEP, el
  identificador de equipo de otra copropiedad se aceptaba en las órdenes de
  puerta, el bloqueo, el intercom (abrir, cerrar, estado, audio), la orden
  del tablero de dispositivos y el envío de plantillas de biometría. Todas
  pasan ahora por `AlcanceDeEquipos` (`apps/api/src/equipos/presentacion/alcance-de-equipos.ts`),
  con la prueba negativa `apps/api/test/equipos-entre-copropiedades.e2e.test.ts`.
- **Falso verde del tipo de la ETAPA 04.** La suite de la API resolvía
  `@ncr/providers` a su `dist/`: la prueba negativa de R2 pasaba en verde con
  el código corregido y sin él. Se corrigió con el alias al fuente en
  `apps/api/vitest.config.ts`; es la regla de §2.8.0 («las pruebas resuelven
  los paquetes internos a su código fuente, nunca a su `dist/`») aplicada a un
  paquete que se había quedado fuera.
- **Una puerta que se abría pasaba por el motor como un rostro.** Antes de la
  15-L todo `AccessControllerEvent` se trataba como rostro, así que un botón de
  salida o una puerta forzada producían un «acceso negado» sin persona. Ahora
  decide el par de códigos mayor/menor.

### A2: lo que se hizo distinto del encargo, y por qué

- **`employeeNo` sale del identificador de la PLANTILLA, no del de la
  autorización.** El encargo pide «derivado del id de la autorización». El
  puerto que el cliente autorizó ampliar sólo añade la vigencia; pasar además
  el id de la autorización sería una segunda ampliación del dominio, no
  autorizada. El identificador de la plantilla cumple lo que la regla protege
  —estable, nunca documento ni nombre— y cada plantilla pertenece a una sola
  autorización (`plantillas_biometricas.autorizacion_id`).
- **La foto no se recomprime en el servidor.** Se comprueba (formato, peso,
  lado) y, si no cabe, se dice en palabras. La reducción ya la hacen la
  consola y la app (640 px, 180 KB); recomprimir en la API exigiría una
  biblioteca nativa de imagen para un caso que los dos clientes cubren.
- **`doorRight`/`RightPlan` van siempre que la terminal tenga puerta
  declarada**, con o sin vigencia: no dependen de ella. Por eso la prueba
  «sin el parámetro nada cambia» se hace con una terminal sin puerta, y la de
  la puerta, aparte.

### Supuestos nuevos

S-66 (`uid` y `serialNo` del firmware para la clave), S-67 (qué contesta la
terminal a una serie que no espera), S-68 (30 min de bloqueo por credencial
rechazada), S-69 (plantilla con vigencia = visitante) y S-70 (la negación
local de la terminal y sus textos de rechazo), en
`docs/auditoria/contradicciones-y-supuestos.md`.
