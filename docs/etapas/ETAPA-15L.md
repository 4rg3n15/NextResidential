# ETAPA 15-L · Entrega final en sitio

**Rama:** `etapa-15l-entrega-final` · **Base:** `develop` (`fc353bc`, con el PR #33 y `5466dfa`)

> Informe en construcción. Esta primera sección es el **Bloque 0**, que el
> encargo exige ANTES de escribir código: cada respuesta con archivo:línea y
> evidencia. Lo que sale «no existe» o «no probado» pasa a trabajo obligatorio
> de esta corrección.

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

| Punto | Qué toca                                                                                                                                                              | Estado                     |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| A2    | El puerto del dominio `FaceTemplateProvider.sincronizar(dispositivoId, plantillaId, plantilla)` (`domain-core/src/puertos/proveedores.ts:31-34`) no lleva la vigencia | **Esperando confirmación** |
| F4    | El agregado `ConsentimientoBiometrico` exige que acepte el titular (`domain-core/src/biometria/consentimiento.ts:134-138`, RN-10) · ADR-029 · Ley 1581                | **Esperando confirmación** |
| H1–H3 | Sustituye ADR-023 (usuario + NIT)                                                                                                                                     | **Esperando confirmación** |
| E1    | No es ADR, pero la evidencia de 0.5 dice que no arregla nada                                                                                                          | **Esperando confirmación** |
