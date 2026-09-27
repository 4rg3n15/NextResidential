# ETAPA 15-L · Entrega final en sitio

**Rama:** `etapa-15l-entrega-final` · **Base:** `develop` (`fc353bc`, con el PR #33 y `5466dfa`)

> **Ronda CERRADA el 2026-09-27** con `./scripts/verificar-etapa.sh --con-base`
> en «correcta» (veredicto literal en el §6 del cierre). La primera sección es
> el **Bloque 0**, escrito ANTES del código, con archivo:línea y evidencia. El
> avance por bloque, con su commit, está en [Avance](#avance); el cierre según
> §2.8, al final, con las dos listas «Probado contra simulador» y «Requiere
> prueba en sitio». **La ETAPA 15 sigue BLOQUEADA sólo por `BE-02`**.

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

| Punto | Qué toca                                                                                                                                                              | Estado                                                                                                                                                                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A2    | El puerto del dominio `FaceTemplateProvider.sincronizar(dispositivoId, plantillaId, plantilla)` (`domain-core/src/puertos/proveedores.ts:31-34`) no lleva la vigencia | **AUTORIZADO**: parámetro opcional y aditivo con el VO `Vigencia`; `Valid` en hora local de America/Bogota sin desplazamiento; `userType "visitor"`; prueba de que sin el parámetro nada cambia                                                                                                             |
| F4    | El agregado `ConsentimientoBiometrico` exige que acepte el titular (`domain-core/src/biometria/consentimiento.ts:134-138`, RN-10) · ADR-029 · Ley 1581                | **CONFIRMADO**: la casilla es el único mecanismo obligatorio; origen «declarado por quien registra» distinto de «otorgado por el titular»; ADR nuevo que deroga ADR-029 en lo pertinente y registra el riesgo aceptado; RN-11 intacta                                                                       |
| H1–H3 | Sustituye ADR-023 (usuario + NIT)                                                                                                                                     | **CONFIRMADO**: ADR-023 derogado; NIT fuera de toda la interfaz; el correo y código+usuario de los demás roles, intactos                                                                                                                                                                                    |
| E1    | No es ADR, pero la evidencia de 0.5 dice que no arregla nada                                                                                                          | **SUSTITUIDO por el agente, NO por el cliente** (rectificado en la corrección de la 15-L): se dejó la excepción de red local sólo en Debug y `APP_EN_IPHONE.md` lo atribuyó al cliente. El cliente pidió después la app en Release, abierta desde el ícono: **ADR-033** la pone en Debug, Release y Profile |

---

## Avance

Orden fijado por el usuario: «R1-R4, A1, A4, A5, la fuga WHEP y B, en ese
orden. La fuga WHEP lleva prueba negativa entre copropiedades antes de
cerrar». Después, el resto del Bloque A (A2, A3) y los bloques C, D, E, J, H,
F, G, I.

| Bloque                                          | Commit               | Qué queda probado contra el simulador                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1–R4 · verificación armada                     | `a7a2821`            | La terminal simulada pregunta (`remoteCheck`), la plataforma contesta `PUT remoteCheck` con el MISMO `serialNo` dentro del plazo y la terminal abre; `failed` niega; tarde o con otra serie, nada. Clave de idempotencia con `serialNo`: dos rostros → dos eventos y dos veredictos. XML del Alarm Server leído. La copropiedad sale del registro de equipos, no de la petición                                                                                                                                                                                                                                                                                                                                                              |
| A5 · credencial rechazada                       | `3f9ceef`            | Un 401 sin `stale` marca la credencial; durante 30 min (S-68) no se vuelve a presentar y el equipo sale «degradado» con el motivo. Reintentos sólo de lo reintentable (equipo ocupado, desafío vencido), 3 intentos con jitter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Fuga entre copropiedades (WHEP +)               | `3f9ceef`            | 10 operaciones sobre un equipo de la copropiedad B pedidas desde la A → 404 y `auditoria_seguridad`. La prueba negativa se escribió ANTES de la corrección y fallaba                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| B · todos los eventos                           | `6883c6c`            | Tabla append-only `eventos_de_equipo` (0040, las cuatro capas de ADR-05, RLS forzada, prueba 97). Catálogo por código; nada se descarta; lo histórico en cola por lotes sin retrasar lo vivo; línea de tiempo con filtros y refresco en vivo en la consola                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| A1 · desenlace en palabras                      | `6883c6c`            | La apertura del motor y la orden manual quedan en la línea de tiempo con «el equipo la aceptó / la rechazó — motivo / no respondió»; el mensaje técnico sólo va a la bitácora                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A4 · la cámara decidió                          | `6883c6c`            | Si el control de la cámara no está atestado o el propio evento dice que abrió ella, la lectura se registra y se marca «La cámara decidió por su cuenta»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| A2 · persona con vigencia                       | `e042264`            | Con la vigencia de la autorización, la terminal simulada guarda al visitante (`userType: "visitor"`) con `Valid` en hora de Bogotá sin desfase, su puerta y su plantilla horaria; y **niega en local** pasada la vigencia, aunque la supresión no haya llegado. Sin el parámetro, el alta es byte a byte la de antes. La foto se comprueba antes de subirla (JPEG/PNG, ≤ 200 KB, ≤ 1024 px, configurables). Una autorización inexistente, revocada o vencida no deja sincronizar                                                                                                                                                                                                                                                             |
| A3 · videoportero                               | `ac04d6d`            | La biblioteca de rostros y el audio bidireccional se leen por capacidad. Con biblioteca, el videoportero recibe la plantilla por el mismo ciclo de A2 (persona con vigencia, rostro, búsqueda). Sin ella, la sincronización lo **omite y lo dice**: en su resultado («este equipo no admite rostros» o «aún no se sabe: pruebe la conexión»), en la bitácora y en la consola; la ficha usa las mismas palabras. `CapacidadNoSoportada` no se reintenta. El timbre de la terminal (5/37) y la llamada del videoportero dejan evento **y** aviso a la guardia virtual. El audio (abrir, transmitir, cerrar, exclusividad) es el de la 15-K, con sus pruebas                                                                                    |
| E2 · la app dice la causa                       | `c3ad781`            | La pantalla de acceso nombra la causa de un fallo de red con la red del teléfono y lo que contestó el sistema (datos móviles, sin red, permiso de red local, el Mac no contesta, servidor apagado, dirección mal compilada), y manda a comparar con Safari en `/health`. E3: `docs/guias/APP_EN_IPHONE.md`                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| C1 · el equipo nuevo o editado                  | `a02f8a0`            | Guardar refresca la tabla de Dispositivos (que sale del tablero) en el acto, no a los 30 s. Editar, dar de baja, reactivar, corregir o volver a sondear un equipo hace que el proceso **olvide** lo que recordaba de él: la siguiente orden sale hacia la dirección nueva (probado contra el simulado, con la prueba del defecto al lado)                                                                                                                                                                                                                                                                                                                                                                                                    |
| C2 · edición completa y auditada                | `a02f8a0`            | Número de puerta del videoportero, **canal de video** (migración 0041, con su forma validada en la base) y **zona** (la base rechaza la de otra copropiedad) editables desde la ficha. La auditoría dice qué cambió, con valores salvo dirección, usuario y credencial («credencial reemplazada»)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D2 · canal y puerto del video                   | `a02f8a0`            | El flujo RTSP usa el canal de la ficha (102 por omisión) y `VIDEO_PUERTO_RTSP` del `.env`: ningún canal ni puerto fijo en el código                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| C4 · latido real                                | `4aeed02`            | `dispositivos.ultimo_latido` se escribe (antes nadie lo hacía y con PostgreSQL todos los equipos salían «Fuera de línea»). Cada 60 s (`EQUIPOS_LATIDO_S`): la señal de la escucha si oyó al equipo hace poco —evento o su propio latido—, si no una lectura real del equipo; sólo «en línea» late. Nunca retrocede y no toca equipos de otra copropiedad (probado contra PostgreSQL). El `POST /ingesta/latidos` del Edge también persiste ya                                                                                                                                                                                                                                                                                                |
| D2 · el códec, preguntado                       | `912086b`            | «Probar conexión» le hace al equipo un `DESCRIBE` RTSP (Digest, un solo intento autenticado) en el canal de su ficha y lee el códec del SDP. La ficha lo dice («H.264 · respuesta RTSP del equipo», o H.265 con qué hacer, o el canal que no existe); la fila del equipo muestra «Video H.265: no se ve en el navegador», y la ruta del video lo niega con esa frase en vez de negociar un negro. Probado contra un equipo RTSP simulado en el bucle local                                                                                                                                                                                                                                                                                   |
| C3 · probar conexión por capacidad              | `912086b`            | El botón de cada equipo se llama «Probar conexión» y la ficha trae, por capacidad, lo que el equipo contestó: apertura, audio, rostros, suscripción (ya estaban), **video** (respuesta RTSP) y **eventos** (la escucha real: transporte y segundos desde la última señal del equipo). Los eventos NO se prueban abriendo una segunda conexión: en un equipo de un solo flujo le quitaría los eventos a la escucha de verdad                                                                                                                                                                                                                                                                                                                  |
| D3 · video con estados                          | `912086b`            | Video en la guardia (ya estaba), en **Portería** (el equipo del evento en curso) y en la **ficha** (a pedido, para no ocupar el puente por mirar). Estados: negociando, en vivo, error con su causa, **sin señal** (negoció y no llega imagen en 8 s) y **se cortó** (la conexión WebRTC cayó después de negociar)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| D1 · `pnpm sitio:video`                         | `3d7cabe`            | Un comando genera `.sitio/go2rtc.yaml` (no versionado) desde `apps/api/.env`: API de go2rtc en `GO2RTC_URL` —se niega a abrirla a la red salvo `--api-en-red`—, medio en `VIDEO_PUERTO_WEBRTC` anunciado en `VIDEO_IP_ANUNCIADA` o la IPv4 de `en0`, sin flujos ni credenciales. Descarga go2rtc para la arquitectura del Mac si falta (versión fijable, SHA-256 impreso) y lo arranca; `--preparar` lo deja listo sin arrancar. Probado ejecutando el guion real contra `.env` de prueba (7 casos, incluida la credencial que no sale al fichero)                                                                                                                                                                                           |
| J1 · `pnpm sitio:ensayo`                        | `c9f00e8`            | Los ocho pasos por equipo (conexión y Digest, hora **y zona** frente al Mac, configuración con las capacidades de personas y rostros leídas del equipo —decisión 8—, eventos, apertura con confirmación humana, alta y baja de rostro, video, audio con un pitido G.711), OK/FALLO con causa y acción, credenciales tachadas y modo `--solo-lectura`. Antes, las comprobaciones del Mac: `/health` por el bucle local y **por la IP del Mac** (la del iPhone, E3), go2rtc y migraciones pendientes. Con la API en marcha el paso 4 mira la BASE (RLS con claims, transacción de sólo lectura) en vez de abrir otra suscripción. Probado contra los simulados, con las tres respuestas engañosas y el 400 de la terminal, y contra PostgreSQL |
| J2 · `--capturar` / `--restaurar`               | `c9f00e8`            | Respaldo por equipo (quién controla la barrera, receptor, disparador y país de la cámara; `AcsCfg` de la terminal; canales de audio del videoportero) en ficheros `0600` fuera del repositorio. La reversión sólo escribe lo que cambió, **relee** lo escrito (un «OK» sin efecto sale como fallo), no aplica el respaldo de otra serie y no guarda contraseñas                                                                                                                                                                                                                                                                                                                                                                              |
| J3 · `ENTREGA_EN_SITIO.md`                      | `c9f00e8`            | El guion del día en el orden pedido —arranque, comprobaciones, `supabase db push`, ensayo, los tres hitos, reversión, plan B por equipo— con `offlineDevCheckOpenDoorEnabled=false` por omisión y su plan B (decisión 6)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| H1 · pools por copropiedad                      | `3be3b30`            | `pools_de_porteros` con restricción de exclusión (0042); la copropiedad nueva recibe el suyo por disparador; la de un número se resuelve SIEMPRE por la tabla. Probado contra PostgreSQL: todos los pools cumplen `[n·1000+1, n·1000+999]` y el primero empieza en 1001                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| H2 · alta, cupo y baja                          | `3be3b30`            | Alta con nombre, documento y contraseña temporal; el número lo asigna la base con el pool bloqueado: **20 altas simultáneas, 20 números consecutivos, sin duplicados**. Cupo 0–999 auditado; con el cupo lleno, 409 con mensaje claro. **Baja** (nueva): cierra sus sesiones, libera la plaza y su número no vuelve al pool; con él ya no se entra                                                                                                                                                                                                                                                                                                                                                                                           |
| H3 · entrada por número                         | `3be3b30`            | `POST /auth/acceso` con el número y la contraseña, sin NIT ni código (el NIT ya no es un campo: 400). Un portero por correo anterior a la 15-H entra con el número que le dio la 0042 (S-77); por correo, ya no. La consola: un solo campo «Usuario» —arroba, correo; cifras, portero; lo demás, residente con código— y ni una mención al NIT                                                                                                                                                                                                                                                                                                                                                                                               |
| H4 · IP de portería y remotas                   | `3be3b30`            | El superadministrador edita las dos listas (IPv4, IPv6, CIDR; auditado). Portero fuera de la lista remota: 403 «No autorizado para guardia remota» **al entrar y en cada petición**, con la fila en `auditoria_seguridad`. Lista vacía: sólo desde la IP de un superadministrador activo (el mismo Mac), y deja de valer en cuanto la lista tiene una entrada. La IP de portería sirve para la consola presencial, no para la guardia remota. El superadministrador, desde cualquier IP                                                                                                                                                                                                                                                      |
| H5 · modo pruebas                               | `3be3b30`            | Interruptor global en Configuración (sólo superadministrador), ACTIVO por omisión, auditado, sin reiniciar. Activo: el caso de la IP no permitida entra y queda «habría sido rechazado»; sin bloqueo por intentos; el límite sube ×10 y no se apaga. Franja fija «Modo pruebas activo: restricciones de porteros desactivadas» en toda la consola. Apagado: 5 fallos desde la misma IP bloquean 5 min (429 con `Retry-After`); desde otra IP, no                                                                                                                                                                                                                                                                                             |
| H6 · la IP del cliente                          | `3be3b30`            | La API cree `X-Forwarded-For` sólo del proxy propio (`API_PROXIES_DE_CONFIANZA`, `loopback` por omisión); la consola arranca con `servidor.mjs`, que sustituye la cabecera del navegador por la IP del socket y la reenvía a la API en todo lo que pide en nombre de la persona. Probado: la misma cabecera falsificada, desde un proxy que no es de confianza, no se cree                                                                                                                                                                                                                                                                                                                                                                   |
| H7 · los doce casos                             | `3be3b30`            | `apps/api/test/porteros-por-identificador-pg.test.ts`: los doce casos de H7 contra PostgreSQL con el modo pruebas apagado salvo el último, más la baja, la IP de portería frente a la guardia remota y el adaptador del interruptor en la base                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| G · el superadministrador edita residentes      | `543f1a8`            | Residentes → «Editar perfil»: nombres, apellidos, documento, fecha de nacimiento, correo y teléfono, con las MISMAS validaciones del dominio que usa el residente y la unicidad del documento en la base. Cada cambio queda en la bitácora del residente con el autor y los NOMBRES de los campos cambiados (nunca los valores). Sólo cuentas de residente de esa copropiedad: otra, 404. Los vehículos se editan en Vehículos (placa única activa por índice parcial, sin borrado con historial), como ya estaba                                                                                                                                                                                                                            |
| F1–F4 · generar autorización con foto y casilla | `84d6f6c`            | Consola: «Generar autorización» para los cuatro roles, con nombre, documento, vivienda, fecha, hora, duración, placa opcional, FOTO obligatoria y la casilla. La foto se revisa ANTES de crear nada; la visita nace vigente; la foto va a todos los equipos con biblioteca de rostros y la respuesta dice a cuántos llegó y cuáles no la aceptaron. Sin la casilla, 422. Contra PostgreSQL (`visitas-pg.test.ts`, 17) y en el recorrido, con la foto en la biblioteca de la terminal simulada                                                                                                                                                                                                                                                |
| F2 · aviso y rechazo                            | `84d6f6c`            | Aviso en vivo «Nueva visita para …» en la consola de portero y superadministrador; «Rechazar» con motivo: la autorización queda anulada y SU plantilla sale de todos los equipos en la misma llamada (no el barrido global). El recorrido lo comprueba preguntando a la terminal simulada, y la lista del superadministrador cambia a «Anulada» sin recargar                                                                                                                                                                                                                                                                                                                                                                                 |
| F5 · el día del portero                         | `84d6f6c`            | Portería y central ven sólo las visitas que tocan hoy EN LA ZONA HORARIA DE LA COPROPIEDAD, calculado en la base con el reloj inyectado: a medianoche la lista cambia sola, nada se borra. El servidor impone el filtro; la pantalla no puede pedir otro rango                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| F7 · historial por vivienda                     | `84d6f6c`            | Superadministración y administración: fechas, vivienda, estado y texto, con el detalle por equipo y la confirmación en persona (opcional)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| F6 · últimos visitantes (API)                   | `84d6f6c`, `c5df04e` | `mi/visitas/ultimas` (lo último registrado, una fila por persona, sólo de SU vivienda) y `mi/visitas/:id/repeticion` (copia datos y foto; pide fecha, hora, duración y la casilla, C-42). La visita de otra vivienda no existe para él                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| F-e · recorrido de la entrega                   | `7fcac5d`            | Ver §6: los ocho pasos del cierre contra API real, PostgreSQL y equipos simulados por HTTP con Digest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| I · cero texto técnico (consola)                | `84d6f6c`, `7fcac5d` | Prueba sobre el árbol sintáctico de `apps/web/src` (texto de JSX y cadenas, nunca comentarios) con sus casos negativos; «!» con explicación en lenguaje de usuario (`componentes/ui/ayuda.tsx`, teclado y toque); los rechazos de la API se pintan sin su cita de regla; y el recorrido lee el texto REAL de cada pantalla del menú de cada rol                                                                                                                                                                                                                                                                                                                                                                                              |
| F-d · la app del residente                      | `e2520bd`, `28dd75e` | El mismo formulario que la consola (sin elegir vivienda: es la del residente), con la foto revisada en el teléfono antes de enviarla y la casilla; la respuesta dice en cuántos equipos quedó la foto. La bandeja de salida guarda el cuerpo nuevo y no reintenta un 400/422 (S-87). «Últimos visitantes» con «Volver a autorizar» (fecha, hora, duración y casilla). Retirados la captura suelta, el enlace, el QR, el compartir, el estado del consentimiento, sus modelos generados y `qr_flutter`/`share_plus`. 251 pruebas de Flutter, `flutter analyze` limpio, cliente Dart al día, recorrido web de la app completo                                                                                                                  |

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

- **El ensayo destapó un defecto del audio de producción.** `IntercomDeEquipo`
  daba el canal por abierto con cualquier HTTP 2xx, aunque el cuerpo dijera
  `notSupport` o un `statusCode` distinto de 1 —la tercera respuesta engañosa de
  sitio—: el operador habría quedado con un canal que creía tener. Ahora se
  rechaza lo que dice que no (`packages/providers/src/videoportero/intercom-equipo.ts`),
  sin exigir un `statusCode`, porque la respuesta buena puede ser una sesión.
- **Dos sesiones Digest contra el mismo equipo pueden chocar** (S-72). El
  simulado da un nonce para todos y rechaza un `nc` repetido; una sesión nueva
  empieza en `nc=1` y el equipo lo toma por réplica. Por eso el paso 5 del
  ensayo abre con el adaptador de producción (comparte la sesión del equipo) y
  no con una sesión nueva, y la guía de entrega dice qué hacer si ocurre entre
  la API y el ensayo.

- **H · los porteros por correo se quedaban fuera.** La 0042 dio número a los
  porteros anteriores a la 15-H (cuentas por correo, como el sembrado), pero el
  camino por número sólo sabía construir el correo sintético de las cuentas por
  usuario. Ahora el número resuelve al correo real cuando la cuenta es por
  correo (S-77), y el recorrido de la consola entra con el portero sembrado por
  su número.
- **H · el doble de sesión de las suites se saltaba la regla de IP.** El control
  de sesiones del portero tenía un «todo origen vale» por omisión y el doble de
  las suites lo usaba: ninguna prueba en memoria veía la regla al iniciar sesión.
  El parámetro es obligatorio (denegar por defecto) y el doble recibe la regla real.
- **H · `crearApp` ignoraba las variaciones de seguridad.** Aplicaba
  `aplicarSeguridad` con la configuración por omisión aunque la suite pidiera
  otra: el caso 10 de H7 (otro proxy de confianza) pasaba por la razón
  equivocada hasta corregirlo.
- **H · 429 sin `Retry-After`.** Los limitadores con nombre (acceso por cuenta y
  por origen, dispositivo) sólo emitían `Retry-After-<nombre>`, que ningún
  cliente lee. `GuardaDeLimites` añade el estándar (§2.7.5).
- **H · faltaba la baja del portero.** El mensaje de cupo decía «desactive a uno»
  y no había cómo. Se añadió, con su hecho `baja_de_portero` en la bitácora.
- **Falso verde de la prueba SQL 98 (Bloque C).** No fijaba identidad: con la
  RLS forzada, sus `UPDATE` no alcanzaban ninguna fila y ningún valor fallaba,
  ni el bueno ni el malo. Sólo se vio al rehacer la base en modo Supabase. Ahora
  actúa como superadministrador y exige que los valores válidos SÍ escriban.
- **El recorrido de la consola llevaba roto desde el Bloque C.** C3 renombró el
  botón «Ficha» a «Probar conexión» y el recorrido seguía buscando el nombre
  viejo (pasos 7 y 8). Corregido; y la plantilla del recorrido lleva ahora la
  huella de migraciones y semillas y se rehace si cambian: antes bastaba con
  que existiera, y con la 0042 el recorrido habría corrido contra un esquema
  viejo.
- **H · el portero de las semillas no tenía número.** La 0042 numera a los
  porteros que existen al migrar, y las semillas van después. Las semillas le
  dan el suyo con la misma función del alta, y la prueba 99 exige que todo
  portero activo tenga número.
- **H · cuatro suites contra la base dependían de que nadie más escribiera.**
  «Exactamente dos copropiedades», «las últimas 20 órdenes» (con otra suite
  fechándolas mañana), una placa entre mil y un nombre repetido en cada corrida.
  Se corrigieron sin aflojar lo que prueban.

- **Cierre · el verificador vio dos controles rotos por esta misma ronda.**
  (1) El 12c —el camino del navegador— se rompió con H: todo acceso de la
  consola pasa ahora por `/auth/acceso`, que consulta el modo pruebas y los
  intentos, y el camino corría con la base de marcador confiando en un valor
  por omisión que la 15-K había cambiado a `postgres`. Ahora declara sus
  adaptadores en memoria. (2) El 12d —`start:dev` inyecta y valida— usaba las
  rutas públicas del enlace del titular, que ADR-032 retiró: la validación
  daba 404 y, peor, la comprobación de inyección **pasaba por la razón
  equivocada** (un 404 de ruta inexistente). Ahora pregunta a `/ready` y
  valida con `/auth/acceso`. Ninguno de los dos se había corrido después de
  H y de F: la regla de §2.8.0 existe por esto.
- **Cierre · el recorrido de la entrega vio lo que ninguna suite veía** (C-43 y
  DT-15L-02): el portero aterrizaba en un tablero que la API le niega, y
  «Eventos» y «Observabilidad» pedían o enseñaban cosas que no debían.

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
rechazada), S-69 (plantilla con vigencia = visitante), S-70 (la negación
local de la terminal y sus textos de rechazo), S-71 (cómo se ve en la app el
permiso de red local negado) y S-72 (nonce Digest compartido entre procesos); y
del Bloque H: S-73 (30 min de sesión activa del superadministrador), S-74 (5
fallos, 5 minutos), S-75 (×10 con el modo pruebas), S-76 (relectura cada 5 y 3
s) y S-77 (el portero por correo entra con su número), en
`docs/auditoria/contradicciones-y-supuestos.md`. Contradicciones nuevas: C-39
(numeración progresiva frente a pools) y C-40 (el portero y la guardia remota),
resueltas por ADR-031.

---

# Cierre de la 15-L según §2.8

## 1 · Qué se construyó

La 15-L deja la plataforma lista para la entrega en sitio **sin escribir código
allí**: todo lo que puede variar en sitio (direcciones, puertos, número de
puerta, canal de video, códec, rutas, umbrales, modo pruebas) se configura en
la consola o en el `.env` local del usuario.

Con los equipos, la conversación es de ida y vuelta: la terminal pregunta y la
plataforma contesta dentro del plazo (verificación remota), la puerta se abre
con un documento que el equipo acepta de verdad, el visitante llega a la
terminal con su vigencia para que el propio equipo lo niegue al vencer, el
videoportero recibe rostros si tiene biblioteca y dice que no si no la tiene,
y una credencial rechazada no se vuelve a presentar en bucle. Todo lo que un
equipo emite queda guardado (tabla de sólo inserción) y a la vista en la
línea de tiempo de «Eventos y alertas». Los equipos se editan sin reiniciar,
se prueban capacidad por capacidad con lo que el equipo contestó, laten de
verdad y muestran su video en la guardia, la portería y la ficha. Para el día
de la entrega hay tres comandos (`pnpm sitio:video`, `pnpm sitio:ensayo`,
`--capturar`/`--restaurar`) y un guion (`ENTREGA_EN_SITIO.md`).

Los porteros entran con un **número** de un pool por copropiedad, sin NIT; el
superadministrador decide desde qué IP pueden entrar (portería y guardia
remota) y hay un **modo pruebas** para que la entrega no se bloquee. El
superadministrador edita el perfil de los residentes.

Y el flujo de visitantes es el que pidió el cliente: **un mismo formulario**
en la consola y en la app —nombre, documento, fecha, hora, duración, foto
frontal y una casilla—; la visita **nace autorizada**, la foto sale a todos
los equipos con rostros, portería y superadministración reciben el aviso en
vivo y pueden **rechazarla**, y el rechazo retira la foto de los equipos en el
acto. El portero ve sólo el día; el residente, sus últimos visitantes con
«Volver a autorizar»; la administración, el historial con filtros. La casilla
es la única constancia obligatoria del consentimiento (ADR-032, riesgo legal
aceptado por el cliente). Ninguna pantalla enseña ya un código del proyecto.

## 2 · Cómo se organizó y por qué (F e I; los demás bloques, en [Avance](#avance))

- **Un módulo `visitas` nuevo, no una ampliación de `autorizaciones` ni de
  `biometria`.** Generar una visita orquesta cuatro cosas que ya existían
  —crear la autorización, adjuntar la foto, capturar el rostro, sincronizarlo—
  más la casilla y el aviso. Es un caso de uso de aplicación (`GenerarVisita`)
  que compone los de los otros módulos por su barril; ninguno de ellos cambia
  de responsabilidad. El residente usa la misma segunda mitad
  (`RegistrarRostroDeVisita`), así que la consola y la app no pueden divergir.
- **El consentimiento declarado es un ORIGEN, no un `otorgar()` más**
  (ADR-032). `ConsentimientoBiometrico.declarar` crea el consentimiento vigente
  con `origen = declarado_por_quien_registra` y su autor; la regla de
  titularidad de `otorgar`, `rechazar` y `revocar` no se toca. La base rechaza
  una declaración sin autor (0043). Así ningún registro dice que el titular
  consintió cuando no consta.
- **La casilla vive en la autorización**, con quién, cuándo y la versión del
  texto que pone el servidor. Un consentimiento vigente por titular se
  reutiliza; cada visita guarda su propia constancia.
- **La foto se revisa ANTES de crear nada.** Tipo real, peso y medidas; si no
  sirve, no hay autorización a medias que limpiar. Si el registro del rostro
  falla después de crear, la autorización se revoca (compensación).
- **El rechazo suprime SÓLO la plantilla de esa visita.** La primera versión
  llamaba al barrido global y, en la suite completa, retiraba plantillas
  vencidas de otras visitas: `SuprimirRostroDeAutorizacion` se acota a la
  autorización.
- **El «día» del portero se calcula en PostgreSQL**, con
  `copropiedades.zona_horaria` y el instante del reloj inyectado. El servidor
  impone el filtro al rol: la pantalla no puede pedir otro rango.
- **La consola y el residente leen por puertos distintos**
  (`ConsultaDeVisitas`, 5 métodos; `HistorialDeVisitantes`, 2), cada uno en su
  fichero (§2.3).
- **Bloque I en tres capas.** (1) El fuente: una prueba recorre el árbol
  sintáctico de `apps/web/src` y de `apps/mobile/lib` —el texto de la interfaz
  y las cadenas, nunca los comentarios— y falla ante un código del proyecto;
  cada una se vio fallar con un texto plantado. (2) Lo que llega de la API: la
  consola quita las citas de regla («(RN-19)», «D-11 · ») de los rechazos antes
  de pintarlos. (3) La pantalla real: el recorrido abre cada entrada del menú
  de cada rol, con datos, y lee su texto. Esta tercera capa encontró lo que
  las otras dos no podían ver: los textos de «Observabilidad» venían de la API.
- **Lo que el recorrido destapó y se corrigió aquí** (C-43): el portero
  aterrizaba en un tablero cuyos indicadores la API nunca le dio; «Eventos»
  pedía la lista de equipos, que es de administración. Se resolvió a favor de
  la API (denegar por defecto): el portero entra por Portería.

## 3 · Árbol de archivos (selección de F e I)

```
supabase/migrations/20260927150000_0043_consentimiento_declarado.sql  origen del consentimiento y casilla en la autorización
supabase/reversion/0043_revert.sql                                   su reversión
supabase/policies/tests/100_consentimiento_declarado.sql              la base rechaza una declaración sin autor
packages/domain-core/src/biometria/consentimiento.ts                  declarar() y confirmarPorElTitular()
apps/api/src/visitas/
  aplicacion/generar-visita.ts        F1-F3 · generar, con compensación si falla el rostro
  aplicacion/rostro-de-visita.ts      foto + casilla + plantilla + equipos (consola y app)
  aplicacion/rechazar-visita.ts       F2 · anular y retirar SU foto
  aplicacion/aviso-de-visitas.ts      F2 · aviso en vivo por el canal existente
  aplicacion/consultar-visitas.ts     F5/F6/F7 · lista, día, equipos, últimos, repetir
  infraestructura/visitas-pg.ts       persona y casilla
  infraestructura/consulta-de-visitas-pg.ts     la consola
  infraestructura/historial-de-visitantes-pg.ts el residente
  presentacion/visitas.controller.ts  rutas de la consola; rechazo sólo portero y superadministración
apps/api/src/residente/aplicacion/mis-visitas.ts         F1/F6 del residente
apps/api/src/biometria/aplicacion/casos-de-uso.ts        SuprimirRostroDeAutorizacion; barrido de revocadas
apps/web/src/app/(consola)/visitantes/                   pantalla, «Generar autorización», confirmación opcional
apps/web/src/componentes/{captura-de-foto,rechazo-de-visita,aviso-de-visita}.tsx
apps/web/src/componentes/ui/ayuda.tsx                    «!» con explicación, teclado y toque
apps/web/src/texto-visible.test.ts                       Bloque I sobre el fuente de la consola
apps/web/src/lib/api/cliente.ts                          rechazos de la API sin citas de regla
apps/mobile/lib/presentacion/pantallas/nuevo_visitante.dart   F1 en la app: el formulario de la consola
apps/mobile/lib/presentacion/pantallas/volver_a_autorizar.dart F6: sólo cuándo, cuánto y la casilla
apps/mobile/lib/presentacion/widgets/foto_del_visitante.dart   la foto con sus consejos de calidad
apps/mobile/lib/presentacion/widgets/campos_de_visita.dart     fecha, hora, duración, casilla y el resultado
apps/mobile/lib/aplicacion/envio_de_visitas.dart               bandeja de salida con el cuerpo nuevo
apps/mobile/lib/infraestructura/api/soporte_de_api.dart        400/422 no se reintentan; rechazos sin citas de regla
apps/mobile/test/texto_visible_test.dart                       Bloque I sobre las cadenas de lib/
e2e/recorrido-de-consola.mjs                             los ocho pasos del cierre
e2e/recorrido-negativo.mjs                               H-SITIO-03 apunta a la ruta que genera la visita
docs/decisiones/ADR-032-consentimiento-declarado-por-quien-registra.md
```

## 4 · Tabla SOLID (lo creado en F e I)

| Principio | Cumplimiento                                                                                                                                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SRP**   | Un caso de uso por operación (`GenerarVisita`, `RechazarVisita`, `RegistrarRostroDeVisita`, `ListarVisitas`, `UltimosVisitantes`, `DatosParaVolverAAutorizar`); la consulta de la consola y el historial del residente en ficheros y puertos distintos. **Declarado (DT-15L-03):** tres ficheros cruzaron las 300 líneas en esta ronda |
| **OCP**   | El origen del consentimiento es un dato nuevo con su fábrica (`declarar`), no una rama en `otorgar`; el rechazo compone `RevocarAutorizacion` y `SuprimirRostroDeAutorizacion` sin cambiarlos                                                                                                                                          |
| **LSP**   | Los repositorios de biometría en memoria y en PostgreSQL cumplen los métodos nuevos (`deAutorizacion`, `registrarFallo`, `deAutorizacionesRevocadas`) con las mismas pruebas; el recorrido corre con el adaptador real contra los equipos simulados por HTTP                                                                           |
| **ISP**   | `HistorialDeVisitantes` (2 métodos) separado de `ConsultaDeVisitas` (5); `LectorDeFotosDeVisita` expone sólo `leer`                                                                                                                                                                                                                    |
| **DIP**   | Los casos de uso dependen de tokens (`CONSULTA_DE_VISITAS`, `HISTORIAL_DE_VISITANTES`, `PERSONAS_DE_VISITA`, `CONSTANCIA_DE_CASILLA`, `LECTOR_DE_FOTOS_DE_VISITA`); `@Inject` explícito en el controlador (control `inyeccion-explicita`); el dominio no importa nada de infraestructura                                               |

## 5 · Trazabilidad

- **Cubiertos en esta ronda:** CU-02 en su forma nueva (captura → calidad →
  casilla → plantilla → sincronización → supresión); RN-09 (sin
  consentimiento vigente no hay sincronización: la casilla lo crea y sin ella
  hay 422), RN-11 (supresión al vencer, revocar y **rechazar**), RN-15
  (aislamiento por los dos caminos en las rutas nuevas), RN-21 (foto en
  almacén privado; el vector nunca sale); HU-07 a HU-11 (la visita desde la app, con foto); CA-09, CA-10; KPI-09 medido en `POST …/visitas`.
- **Sin HU en el documento de requisitos:** el aviso en vivo y el rechazo de
  la visita por portería y superadministración (F2), la lista del día (F5) y
  «Volver a autorizar» (F6) son decisiones del cliente de la 15-L, no historias
  del documento; se trazan al encargo y a ADR-032.
- **Modificado por decisión del cliente:** RN-10 (el consentimiento lo da el
  titular) queda sustituido por la casilla de quien registra — ADR-032, C-41,
  E-05, con el riesgo legal escrito.
- **Parcial:** CA-11 (supresión dentro de 24 h del vencimiento) sigue
  dependiendo del barrido programado (`PLANIFICADOR_HABILITADO`); en sitio hay
  que confirmar que está activo.

## 6 · Pruebas

### Qué se probó y cómo

- **Contra PostgreSQL:** `visitas-pg.test.ts` (17: generar con foto y casilla,
  422 sin casilla, 422 con foto que no sirve, autoaprobación, rechazo con
  retiro por equipo, lista del día en hora de la copropiedad, historial con
  filtros, últimos visitantes sólo de su vivienda, volver a autorizar y la
  visita de otra vivienda), la prueba SQL `100_consentimiento_declarado.sql`,
  las suites de aislamiento y de roles actualizadas.
- **Recorrido de la entrega** (`node e2e/recorrido-de-consola.mjs`): API real
  compilada, PostgreSQL propio, consola compilada en Chromium y dos equipos
  simulados por HTTP con Digest, con el adaptador REAL. Los ocho pasos del
  cierre: (1) el superadministrador genera la autorización con foto y casilla
  —y sin la casilla el botón no deja—; (2) nace vigente; (3) el portero, con
  su pantalla abierta, recibe el aviso sin recargar; (4) la rechaza con motivo
  y **la foto sale de la biblioteca de la terminal simulada**, que es quien lo
  dice; (5) la lectura de placa del recorrido está en «Eventos y alertas»;
  (6) el equipo se edita por PUT; (7) el portero entra con su número;
  (8) ninguna de las pantallas del menú del superadministrador (15) ni del
  portero (7) enseña un código del proyecto.
- **Su prueba negativa** (`e2e/recorrido-negativo.mjs`): con H-SITIO-03
  reintroducido en la ruta que genera la visita, el recorrido falla
  nombrándolo (`✗ H-SITIO-03 · el superadministrador genera la autorización
con foto (403)`).
- **Simulador con las tres respuestas engañosas y el 400 de la terminal:**
  `packages/providers/src/ensayo/ensayo-enganosas.test.ts` (J1) y
  `anexo-de-sitio.test.ts`.
- **Bloque I:** `apps/web/src/texto-visible.test.ts`, `apps/web/src/lib/api/cliente.test.ts`
  y `apps/mobile/test/texto_visible_test.dart` (un analizador léxico de Dart: cadenas triples, crudas, interpoladas y adyacentes; nunca comentarios; visto fallar con un texto plantado) y `apps/mobile/test/infraestructura/sin_codigos_test.dart`.

### Resultado

Todo en verde en la corrida del verificador (Linux, Node 22.22.2, Flutter
3.47.4, PostgreSQL 16.13), tres veces seguidas sin caché con el mismo
resultado:

| Paquete            | Pruebas                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `@ncr/api`         | 1464 (1459 + 5 saltadas en el paso 5, **declaradas** y ejercidas en otro paso; 1464 en las tres corridas del paso 14) |
| `@ncr/providers`   | 916                                                                                                                   |
| `@ncr/web`         | 541                                                                                                                   |
| `@ncr/domain-core` | 438                                                                                                                   |
| `@ncr/config`      | 144                                                                                                                   |
| `@ncr/edge`        | 101                                                                                                                   |
| App Flutter        | 251                                                                                                                   |
| **Total**          | **3855**                                                                                                              |

Cobertura por capa (§2.4): dominio 96,20 % de líneas (ramas 96,91 %),
aplicación 95,59 % (ramas 86,84 %), global 84,39 %; app: dominio 96,41 %,
aplicación 95,38 %, global 85,15 %. El recorrido de la consola (13b), su
prueba negativa con los cinco defectos de sitio (13c), el camino del
navegador (12c), `start:dev` (12d), el guion y el ensayo de sitio contra los
simulados (12e, 12f) y el recorrido de la app en Chromium (5e) pasan.

**El control declarado no ejercido** es el 5e —el recorrido de la app en el
navegador—, declarado desde la ETAPA 14 **sólo para macOS** (el motor de
Flutter web no engancha el campo bajo Chromium en macOS). En esta corrida, en
Linux, **se ejerció y pasó**: «1 paso declarado no ejercido, 0 de ellos en
linux».

### Veredicto literal de `./scripts/verificar-etapa.sh` (§2.8.0)

```
$ ./scripts/verificar-etapa.sh --con-base   (extracto literal: pasos, comprobaciones y veredicto)

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
   @ncr/config:test:       Tests  144 passed (144)
   @ncr/edge:test:       Tests  101 passed (101)
   @ncr/domain-core:test:       Tests  438 passed (438)
   @ncr/providers:test:       Tests  916 passed (916)
   @ncr/web:test:       Tests  541 passed (541)
   @ncr/api:test:       Tests  1459 passed | 5 skipped (1464)
   ⚠ suite sin rojas · las saltadas están DECLARADAS y se ejercen en otro paso
▸ 5b · app móvil: análisis estático de Dart
   ✓ flutter analyze sin hallazgos
▸ 5c · app móvil: suite de Dart y cobertura POR CAPA
   ✓ dominio           96.41 % (umbral 90 %, 215/223 líneas)
   ✓ aplicacion        95.38 % (umbral 90 %, 165/173 líneas)
   ✓ configuracion    100.00 % (umbral 70 %, 33/33 líneas)
   ✓ infraestructura   86.41 % (umbral 60 %, 477/552 líneas)
   ✓ presentacion      83.67 % (umbral 50 %, 1680/2008 líneas)
   ✓ resto             26.19 % (umbral 0 %, 11/42 líneas)
   ✓ global            85.15 % (umbral 70 %, sin contar lo generado)
   ✓ cobertura de la app dentro de los umbrales por capa
   ✓ la suite de Dart da lo mismo en otro huso (Pacific/Auckland): ninguna prueba depende del reloj del sistema
▸ 5d · app móvil: cliente al día, sin secretos y sin dependencias a ciegas
   ✓ sin secretos: la app no nombra ni incrusta ninguna llave que omita la RLS
   ✓ dependencias: 1 acotación(es) con motivo escrito · objective_c fuera del grafo (lo arrastraba el plugin de Windows)
   ✓ Info.plist preprocesado: Debug y Release piden red local; ATS local sólo en Debug; nunca NSAllowsArbitraryLoads
   ✓ cliente Dart al día: 354 ficheros generados desde packages/contracts/openapi.json, sin diferencias
▸ 5e · app móvil: el RECORRIDO en un navegador de verdad
   ✓ las 10 lecturas salieron con el token en la cabecera
   ✓ el residente desactivado sigue apareciendo (RN-19)
   ✓ y está marcado
   ✓ la placa se muestra como la normalizó el dominio
   ✓ la pestaña de visitantes muestra lo que el conjunto tiene a su nombre
   ✓ y ofrece autorizar una visita, que es para lo que se abre (HU-07)
   ✓ los últimos visitantes se ofrecen para volver a autorizarlos (F6)
   ✓ el perfil trae el nombre de la persona (3.5)
   ✓ y el botón de portería (D7)
   ✓ el correo sintético del token no aparece en ninguna parte (C-36)
   ✓ el motivo de la negación se explica en lenguaje llano
   ✓ lo decidido por el Edge se marca (KPI-31)
   ✓ ni un error de JavaScript en el recorrido completo
   ✓ la app se recorre entera en el navegador, sin un error de JavaScript
▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 294 de 294 ficheros de prueba ejecutados
▸ 7 · umbrales de cobertura por capa (§2.4)
   ✓ las tres capas cumplen su umbral
▸ 7b · los dos recuentos de la MISMA suite coinciden (D-112)
   ✓ recuentos: 6 paquete(s) con el mismo resultado por los dos caminos (turbo y vitest directo) · 3604 pruebas
▸ 8 · portabilidad de las superficies con shell (macOS/BSD y CI/GNU)
   ✓ portabilidad: 17 superficies con shell sin construcciones divergentes BSD/GNU (.sh, scripts de package.json, .husky/, run: de workflows, Makefile)
▸ 9 · pruebas negativas de los propios controles
   ✓ entorno declarado: 63 variables de 2 esquemas, todas en su .env.example · 27 leídas fuera de Zod, con motivo
   ✓ declaraciones: 1 paso(s) declarado(s) no ejercido(s), 0 de ellos en linux, con motivo y etapa de revisión vigente
   ✓ controles: 40 de 42 con prueba negativa · 2 en deuda declarada (no puede crecer)
   ✓ PRUEBAS NEGATIVAS: los 33 controles detectan su violación y aceptan el caso legítimo, sin tocar el árbol
   ✓ ramas: 40 controles medidos · 261 bloques sin ejercer (no puede subir)
▸ 10 · fronteras de arquitectura y secretos
   ✓ fronteras (DoD ETAPA 02)
   ✓ frontera-modulos: 17 módulos (alarmserver, autenticacion, autorizaciones, biometria, cuentas, equipos, eventos, guardia, observabilidad, padron, planificacion, plataforma, porteria, residente, tablero, visitas, zonas), nin
   ✓ sin secretos
   ✓ escaneo de secretos: limpio (4763 blobs del historial alcanzable · 2 de línea base declarados)
   ✓ longitud por campo: 127 campo(s) @IsString(), todos con cota declarada
   ✓ 65 clases que Nest construye inyectan con @Inject() explícito en todos sus parámetros
   ✓ KPI-11: sin ISAPI ni IPs de dispositivo fuera de packages/providers/ (los rangos de documentación de RFC 5737 no cuentan: no son de nadie)
   ✓ frontera-extensibilidad: 223 fichero(s) de dominio/aplicación sin @ncr/providers, ningún adaptador nombrado fuera del paquete, y el ficticio sólo toca el núcleo
   ✓ ningún atributo `style` en la consola (221 ficheros, §2.7.7)
   ✓ 221 ficheros de la consola: todo color sale de un token con pareja medida en los dos temas
   ✓ frontera-vocabulario: 83 ficheros del dominio, sin tipo de copropiedad ni etiquetas (el tipo se puede cambiar sin consecuencias)
   ✓ sin claves ajenas vigentes hacia tablas append-only (2 declaradas, 2 retiradas, 8 tablas vigiladas)
   ✓ pwa: manifiesto completo, iconos reales de 192/512 y uno enmascarable distinto, service worker registrado con `/api/` fuera de la caché y página de sin conexión
   ✓ paleta: paleta.g.dart al día con el preset (40 tokens por tema)
   ✓ mermaid: 9 diagrama(s) en 2 fichero(s) analizan con Mermaid 11.17.2
▸ 10b · el contrato OpenAPI tiene tipos y el cliente generado está al día
   ✓ esquemas: 230 DTO con nombre único en apps/api/src
   ✓ 144 de 150 operaciones con respuesta tipada; 6 exentas con etapa declarada
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
▸ 12d · start:dev —el arranque de sitio— inyecta y VALIDA; con tsx la API se niega a arrancar
   ✓ con start:dev la API llega a «API arrancada»
   ✓ un controlador inyectado contesta con su lógica (503, no 500)
   ✓ el ValidationPipe valida: un cuerpo fuera del DTO recibe 400
   ✓ con tsx la API se niega a arrancar y dice por qué: sin metadatos no valida
   ✓ start:dev arranca, inyecta y valida; tsx no arranca sin metadatos
▸ 12e · el guion de sitio, ensayado contra los equipos simulados: --con-audio y --abrir
   ✓ la puerta SE MOVIÓ: H-SITIO-13 verificado en este equipo
   ✓ la puerta SE MOVIÓ: H-SITIO-13 verificado en este equipo
   ✓ el guion recorre los tres equipos simulados y --abrir abre como en sitio
▸ 12f · pnpm sitio:ensayo contra los equipos simulados: ocho pasos por equipo, respaldo y reversión
   ✓ el ensayo recorre los tres equipos simulados, respalda y revierte su configuración
▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base (requiere --con-base)
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)
   ✓ 50 ingresos simultáneos sobre 10 plazas, ni una de más (RN-14, CA-14)
   ✓ una hoja sin un solo UUID crea viviendas, personas y sus vínculos (D-72, RN-06)
   ✓ el superadministrador escribe el padrón en la copropiedad del selector (D-71)
   ✓ las 12 en una sentencia, el mismo número en tres agrupaciones, y una colisión revierte las 12
▸ 13b · el recorrido de la CONSOLA contra la API real, PostgreSQL y el simulado (requiere --con-base)
   ✓ el superadministrador y el portero recorren la consola de punta a punta
▸ 13c · el recorrido FALLA con H-SITIO-02, 03, 08, 13 y 15 reintroducidos (requiere --con-base)
   ✓ los cinco defectos de sitio, reintroducidos, se detectan cada uno por su nombre
▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
▸ 15 · ningún paso declarado se quedó sin ejecutar
   ✓ OK 31 de 31 pasos ejecutados
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

## 7 · Verificación de seguridad (§2.7)

| Medida                       | En F e I                                                                                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos                 | Ninguno en código, pruebas, semillas ni documentos; las IP y credenciales de los equipos sólo en el `.env` del usuario. El recorrido usa equipos simulados en `127.0.0.1` con claves aleatorias por corrida. `API_URL_PUBLICA` desaparece con el enlace del titular    |
| 2 · CORS                     | Sin cambios                                                                                                                                                                                                                                                            |
| 3 · Validación en el backend | DTOs con lista blanca (`GenerarVisitaDto`, `RechazoDeVisitaDto`, `RepetirVisitaDto`): duración 15–1440 min, foto con tope de tamaño y tipo, casilla booleana obligatoria. La foto se valida por su contenido antes de crear nada; el motivo del rechazo es obligatorio |
| 4 · Inyección SQL            | Todo parametrizado; la búsqueda por texto escapa `%` y `_` del usuario                                                                                                                                                                                                 |
| 5 · Rate limiting            | `POST …/visitas` y `POST …/rechazo`: 30 por minuto, además del global; ruta de foto con su propio límite de cuerpo                                                                                                                                                     |
| 6 · RLS                      | Las columnas de la 0043 viven en tablas con RLS forzada; prueba SQL 100; cada consulta con claims de servicio por copropiedad y `exigirAlcance` antes (los dos caminos); la visita de otra vivienda no existe para el residente                                        |
| 7 · CSP                      | Sin cambios; la vista previa de la foto es un `data:` de la propia pestaña                                                                                                                                                                                             |
| 8 · Transversales            | RBAC declarativo (`@Roles`): rechazar sólo portero y superadministrador; el vector nunca sale por ninguna ruta; la foto en almacén privado con URL firmada; la casilla y el rechazo quedan auditados con su autor                                                      |

## 8 · Deuda técnica, supuestos y pendientes

**Deuda nueva:**

- **DT-15L-01 · la persona se queda en la terminal.** La supresión retira el
  rostro (y lo comprueba buscándolo), pero la persona —sin datos personales:
  su nombre es un identificador opaco y su vigencia ya venció— sigue en la
  terminal. Se acumulan registros hasta el tope del equipo. Propuesta: tras
  verificar la ausencia del rostro, `darDeBajaPersona`, que el adaptador ya
  tiene.
- **DT-15L-02 · el portero ve «Equipo sin nombre» en la línea de tiempo.** La
  lista de equipos es de administración. Propuesta: el nombre del equipo en
  el evento de equipo.
- **DT-15L-03 · §2.3.** Cruzaron las 300 líneas en esta ronda
  `multiempresa/copropiedades.controller.ts` (330),
  `(consola)/eventos/pantalla.tsx` (307) y
  `domain-core/src/biometria/consentimiento.ts` (351); 38 ficheros tocados ya
  las superaban en `develop`.
- **DT-15L-04 · rutas sólo-placa sin pantalla** (S-78):
  `POST /copropiedades/:id/autorizaciones` y `POST …/mi/autorizaciones`
  siguen en la API para visitas por placa; ninguna pantalla las ofrece.
- **DT-15L-05 · los mensajes de la API siguen citando reglas.** La consola los
  limpia al pintarlos y la app también (`sinCodigosDelProyecto` en los dos clientes); el texto en la API no se cambió.

**Siguen abiertos del Bloque 0.3** (en memoria en producción):
`REGISTRO_DE_BLOQUEOS`, `OPERACIONES_DE_DISPOSITIVO` (DT-15K-03),
`REPOSITORIO_CODIGOS_MFA` (los códigos de recuperación se pierden al
reiniciar la API; el segundo factor, que vive en Supabase, no),
`NOTIFICADOR_PUSH` y la evidencia sin `EVIDENCIA_BUCKET`. Siguen también
DT-15K-02 / S-62 y H-15J-01.

**Supuestos:** S-66 a S-86 (los de F: S-78 a S-86). **Contradicciones:** C-39
a C-43 (C-43 nueva en el cierre). **Extensión:** E-05. **Pendiente:** P-21
(validez jurídica de la confirmación presencial, ahora opcional).

## 9 · Qué debe hacer el usuario manualmente

1. **Fusionar el PR** hacia `develop` cuando lo revise (no se fusiona desde
   aquí).
2. **Aplicar las migraciones 0040 a 0043** en el proyecto de Supabase
   (`supabase db push`) y comprobar la RLS como dice
   `docs/guias/CONEXION_SUPABASE.md`.
3. **Leer y firmar el riesgo legal de ADR-032** (la casilla no prueba el
   consentimiento del titular).
4. **Completar su `.env` local** (IP, puertos, credenciales de los tres
   equipos, `GO2RTC_URL`, `VIDEO_*`), nunca en el repositorio.
5. **Seguir `docs/guias/ENTREGA_EN_SITIO.md`**: `pnpm sitio:video`,
   `pnpm sitio:ensayo --capturar` antes de tocar ningún equipo, los tres hitos
   y `--restaurar` al terminar.
6. **Compilar la app para el iPhone** con la IP del Mac
   (`docs/guias/APP_EN_IPHONE.md`).
7. **Apagar el modo pruebas** en Configuración cuando termine la entrega.
8. **Confirmar que el barrido programado está activo**
   (`PLANIFICADOR_HABILITADO=true`) para la supresión al vencer.

## 10 · Rama y commits

Rama `etapa-15l-entrega-final`, base `develop`. PR: [4rg3n15/NextResidential#34](https://github.com/4rg3n15/NextResidential/pull/34) (sin fusionar: la fusión es del usuario).

- `0669b28` docs(etapa-15l): bloque 0 · informe de bloqueos antes de escribir código
- `a7a2821` fix(etapa-15l/equipos): la terminal pregunta, la plataforma contesta y la terminal abre (R1–R4)
- `3f9ceef` fix(etapa-15l/equipos): credencial rechazada sin reintento, y ningún equipo de otra copropiedad (A5 + fuga del Bloque 0.4)
- `6883c6c` feat(etapa-15l/eventos): todo lo que emite un equipo queda guardado y a la vista (Bloque B, A1, A4)
- `5698103` docs(etapa-15l): avance por bloque, puntos de parada respondidos y S-66 a S-68
- `e042264` feat(etapa-15l/biometria): la terminal recibe la vigencia del visitante y la caduca por su cuenta (A2)
- `ac04d6d` feat(etapa-15l/biometria): el videoportero sin biblioteca se omite y se dice (A3)
- `c3ad781` feat(etapa-15l/app): el acceso dice por qué no llega al servidor, y guía del iPhone (E2, E3)
- `a02f8a0` feat(etapa-15l/equipos): dispositivos editables de verdad, sin reiniciar (C1, C2, D2 canal)
- `4aeed02` feat(etapa-15l/equipos): en línea o fuera de línea por un latido real (C4)
- `912086b` feat(etapa-15l/video): el códec se le pregunta al equipo y el video tiene estados (D2, C3, D3)
- `3d7cabe` feat(etapa-15l/video): go2rtc en el Mac con un comando, desde el .env (D1)
- `c9f00e8` feat(etapa-15l/sitio): pnpm sitio:ensayo, respaldo y reversión, y el guion de la entrega (J)
- `3be3b30` feat(etapa-15l/porteros): número de portero por pool, lista blanca de IP y modo pruebas (H1-H7)
- `650652b` docs(etapa-15l/porteros): commit del Bloque H en el informe
- `543f1a8` feat(etapa-15l/residentes): el superadministrador edita el perfil de un residente (G)
- `2496484` docs(etapa-15l/residentes): commit del Bloque G en el informe
- `84d6f6c` feat(etapa-15l/visitas): generar autorización con foto y casilla, rechazo y lista del día (F-a/b/c, I web)
- `7fcac5d` feat(etapa-15l/visitas): recorrido de la entrega con la visita de punta a punta, ADR-032 y cero códigos en pantalla (F-e, I)
- `c5df04e` refactor(etapa-15l/visitas): consulta de la consola e historial del residente en puertos y ficheros separados
- `e2520bd` feat(etapa-15l/app): nuevo visitante con foto y casilla, últimos visitantes y volver a autorizar (F-d, I app)
- `28dd75e` feat(etapa-15l/app): los rechazos de la API llegan a la pantalla sin citas de regla (I)
- `ad058d7` docs(etapa-15l): ronda 15-L en el estado y el informe de cierre (§2.8), a falta del veredicto
- `451a58c` fix(etapa-15l/verificacion): el 12c declara sus adaptadores en memoria y el 12d deja de usar las rutas del enlace retirado

---

## Probado contra simulador

- Verificación remota armada: la terminal pregunta, la plataforma contesta con
  el mismo `serialNo` dentro del plazo y abre; `failed` niega; tarde o con
  otra serie, nada (R1–R4).
- Apertura con su desenlace en palabras; la cámara que decide por su cuenta,
  marcada (A1, A4).
- Persona con vigencia en la terminal y negación local al vencer (A2); el
  videoportero con y sin biblioteca de rostros (A3).
- Credencial rechazada sin reintento y reintentos sólo de lo reintentable (A5).
- **Las tres respuestas engañosas y el 400 `badXmlContent`** (J1, anexo 15-K).
- Todos los eventos de equipo guardados y visibles, incluido uno desconocido
  (B); la fuga entre copropiedades, cerrada con prueba negativa.
- Dispositivos editables sin reiniciar, «Probar conexión» por capacidad,
  latido, códec leído por RTSP, estados del video (C, D).
- El ensayo de sitio y el respaldo/reversión contra equipos simulados (J).
- Porteros por número, lista blanca de IP, modo pruebas e IP real, contra
  PostgreSQL (H); edición de residentes (G).
- **El flujo de visitantes de punta a punta** (F): generar con foto y casilla,
  autoaprobación, aviso al portero, rechazo que retira la foto de la terminal
  simulada, lista del día, historial, últimos visitantes y volver a autorizar.
- Cero texto técnico en el fuente de la consola y de la app y en las
  pantallas reales de la consola (I).

## Requiere prueba en sitio

- Verificación remota con el firmware real: nombres de campo, `serialNo`,
  plazo y textos de rechazo (S-66, S-67, S-70).
- **Que la puerta y la talanquera se muevan** con la orden (confirmación
  humana en el ensayo, paso 5).
- Vigencia de la persona en la terminal real (hora de Bogotá, `visitor`) y su
  negación local al vencer.
- **Alta y retiro del rostro** en la terminal y en el videoportero reales, con
  la búsqueda posterior (RN-11), y la calidad de fotos tomadas con el iPhone y
  la cámara del Mac.
- Audio bidireccional real (G.711, semiduplex/duplex) y su latencia (KPI-33).
- Video del subflujo 102 por go2rtc en el Mac; si la cámara entrega H.265, que
  la ficha lo diga.
- Eventos reales de los tres equipos (multipart y alertStream) y su catálogo.
- La cámara LPR en modo evento.
- **La app en el iPhone** contra la API del Mac por la red local (permiso de
  red local y compilación con la IP).
- Las listas de IP de porteros con la red real del conjunto (el Mac y otro
  equipo).
- Las migraciones 0040–0043 en el proyecto real de Supabase.
