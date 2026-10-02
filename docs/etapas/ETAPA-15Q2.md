# ETAPA 15-Q2 · El Edge como puente entre la nube y los equipos (P-27 = A)

**Rama:** `etapa-15q2-edge-puente` · **Base:** `develop` (`4849f4e`, merge del PR #39) ·
**PR:** «PENDIENTE-PR», sin fusionar · **Fecha:** 2026-10-02 ·
**Corrige:** ETAPA 12 (y la 15-Q) · **Decisión:** [ADR-035](../decisiones/ADR-035-el-edge-es-el-puente-local-permanente.md), que sustituye en parte a ADR-034

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Todo lo de aquí corre contra la API real con PostgreSQL y los **equipos
> simulados** de `packages/providers`, con la API y el Edge en **procesos
> distintos**. Nada se probó contra un equipo físico ni contra un TURN real.

**Lo incómodo primero.**

1. **La base pedida no existe tal cual.** El encargo dice «develop con PR #39 y
   15-U fusionadas»: en `develop` no hay ninguna 15-U (C-51). Se trabajó desde
   `develop@4849f4e` sin suponer nada de ella.
2. **El primer registro de P-27 fue mío, y estaba mal.** La 15-Q construyó el
   Edge como contingencia (B) porque así quedó registrado; el cliente decidió A.
   Se corrigió el registro antes de tocar código (ADR-035, `3e32458`).
3. **El túnel no volvía nunca si la API estaba caída al reconectar.** En Node 22
   un WebSocket rechazado —o cerrado mientras conecta— emite `error` y **nunca**
   `close`; el cliente del Edge esperaba el `close` para reintentar. Lo destapó
   la DoD de dos procesos; corregido en el enlace con prueba que falla contra
   el código anterior (`enlace-websocket.test.ts`).
4. **R1 se rompió una vez, y lo vio el ensayo de sitio con base.** Con
   PostgreSQL, el puente de video quedaba siempre envuelto por el del Edge y una
   copropiedad **sin** Edge recibía 409 en lugar del 503 «falta GO2RTC_URL».
   Ahora la vista en vivo se elige **por copropiedad** (`b508a80`).
5. **Las pruebas de esta ronda encontraron una docena de defectos en mi código
   nuevo**, todos corregidos antes del cierre (§2, «Lo que destaparon las
   pruebas»). Dos los encontró la primera corrida del verificador, que salió
   FALLIDA: el panel del Edge tumbaba la pantalla de Dispositivos ante una
   respuesta que no era lista, y mi corrección de la reversión hacía reventar
   el alta de un equipo con un token de usuario (RLS). Yo había corrido sólo
   las pruebas de los archivos que tocaba, no las suites enteras. El más serio: en la migración de credenciales, una respuesta del
   Edge `"false"` o `1` contaba como «sí» y **la nube borraba su copia** (D3).
6. **Hallazgos de la 15-Q que NO se tocaron** porque piden una decisión: un
   evento que la nube rechaza para siempre bloquea la bandeja del Edge
   (`seRindio` existe y nadie lo llama: P-31), y una referencia de evento de más
   de ~115 caracteres deja la apertura del Edge sin constancia.

**En una línea.** El Edge abre un WebSocket saliente hacia la API; por él la
consola opera los equipos del conjunto con los **mismos puertos** de siempre,
las credenciales viven **sólo** en el Edge, la nube decide y el Edge ejecuta
—con un solo actor sobre la barrera—, y una copropiedad **sin** Edge puente
funciona exactamente como antes.

## Avance

| Bloque                   | Estado                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** · túnel           | **Hecho.** WebSocket saliente `/edge/tunel`; `hola` firmado con la identidad de la 15-Q (HMAC, marca, nonce); la API valida Edge, generación de credencial y copropiedad en la aplicación; reconexión con retroceso exponencial y dispersión completa; un Edge conectado por copropiedad, el segundo rechazado (4409) y auditado                                                          |
| **A2** · protocolo       | **Hecho.** v1 tipado: correlación, clave de idempotencia y plazo en cada pedido; resultado tipado; latido 10 s / silencio 30 s; canales binarios multiplexados para el audio; tope de tamaño y de mensajes por segundo; cierre ante un mensaje inválido                                                                                                                                   |
| **A3** · estado          | **Hecho.** `/ready` dice cuántos Edge hay conectados; panel «Edge del conjunto» con «Conectado / Desconectado desde…»; alerta `dispositivo_caido` persistente por equipo tras 30 s de desconexión (RN-18, S-185)                                                                                                                                                                          |
| **A4** · una instancia   | **Hecho.** `DESPLIEGUE.md` §4.4 reescrita (C-52); escalar es P-30                                                                                                                                                                                                                                                                                                                         |
| **B1–B3** · eventos      | **Hecho.** Los equipos reportan sólo al Edge, que reenvía con clave de idempotencia; con nube, decide la nube y ejecuta el Edge; sin respuesta en `EDGE_PLAZO_NUBE_MS`, decide el Edge; nunca los dos (cierra DT-15Q-03, retira S-184); la API no se suscribe a equipos de una copropiedad con puente                                                                                     |
| **C1–C3** · órdenes      | **Hecho.** `ProveedorEnrutado` detrás de los mismos puertos; la suite de contrato corre contra directo y vía Edge sin cambiar aserciones; abrir por punto con motivo, plantillas (con consentimiento; el Edge no las guarda), «Probar conexión», diagnóstico, salidas y reloj; con el Edge caído, fallan en el acto con 503 `EDGE_NO_DISPONIBLE`. Libre/bloqueado: P-25 sigue sin existir |
| **D1–D4** · credenciales | **Hecho.** AES-256-GCM con `EDGE_EQUIPOS_LLAVE`, fuera del SQLite; en la nube, referencia `edge:` y huella HMAC; alta y edición por el túnel sin persistir ni registrar la clave; migración que borra de la nube sólo tras confirmar el Edge; reversión documentada y probada; go2rtc junto al Edge (cierra DT-15N-05)                                                                    |
| **E1** · audio           | **Hecho.** Navegador ↔ API (WS con billete) ↔ túnel ↔ Edge ↔ `audioData` persistente: ida «IDA» ms, vuelta «VUELTA» ms contra el videoportero simulado en red (KPI-33, CA-19)                                                                                                                                                                                                         |
| **E2** · video           | **Hecho, salvo el TURN.** WHEP por la API hacia el go2rtc del Edge por el túnel; STUN/TURN por variables con credencial TURN efímera. **Dónde va el TURN: PENDIENTE DE DEFINICIÓN (P-29); no se probó con un TURN real** (no hay coturn en este entorno ni forma de probar NAT)                                                                                                           |

## Lo que se hizo distinto del encargo

- **«Tiene Edge activo» = tiene un Edge marcado como puente** (S-186). La
  semilla da a MIRA un gateway desde la ETAPA 01; tomarlo como puente habría
  desviado todas las regresiones. Marcar es un acto del superadministrador
  (consola o `POST …/edge-gateways/:id/puente`).
- **El videoportero simulado en red no se puede diagnosticar.** Exige Digest
  incluso en la consulta de activación, que en un equipo real contesta sin
  credencial, y el diagnóstico lo lee como «credencial mala» también por el
  camino directo. En la DoD se da de alta sin probar conexión; su credencial la
  prueba E1, que abre el audio con la clave que sólo el Edge tiene.
- **Una línea de montaje en una regresión.** `ensayo-en-sitio-pg.test.ts` tomaba
  el simulado del token `FACE_TEMPLATE_PROVIDER`, que con base ahora es el
  `ProveedorEnrutado` que lo envuelve; lo toma de `PROVEEDOR_DIRECTO`. Ninguna
  aserción cambió y el archivo no creció.
- **Una línea más en el barrido D-72.** `formularios-sin-identificadores.test.tsx`
  exige clasificar cada pantalla que escribe; el panel del Edge escribe sin
  formulario (dos botones) y se declaró en `SIN_FORMULARIO`. Es la única
  excepción a «ningún existente crece» fuera de los generados, y la lista
  existe para crecer así.
- **La reversión del esquema no siempre es posible, y se dice.** Una fila de
  credencial trasladada se conserva sin bytes (RN-19): `0050_revert.sql` se
  niega con ese motivo. Volver al modo directo es quitar el puente y reescribir
  las claves, y con eso la referencia vuelve a la bóveda.
- **`pnpm sitio:edge` no conoce el modo puente** (DT-15Q2-02): exige
  `EDGE_EQUIPOS` y no lee el registro cifrado. La guía no lo recomienda para el
  puente hasta que lo haga.

---

## 1 · Qué se construyó

Una copropiedad cuyo Edge está marcado como puente se opera **entera** a
través de él. El Edge abre un WebSocket hacia la API y se presenta con su
credencial; la API comprueba en la capa de aplicación que es ese Edge, de esa
copropiedad y su puente, y lo registra como el túnel de la copropiedad. Desde
ese momento, cada orden que la consola da a un equipo de esa copropiedad —abrir
un punto, sincronizar o suprimir un rostro, probar la conexión, diagnosticar,
leer salidas, corregir el reloj, hablar por el videoportero, ver su video— entra
por los mismos puertos de siempre y sale por el túnel. En el Edge, las mismas
órdenes las ejecuta el mismo `packages/providers` contra los equipos del
conjunto, que sólo él alcanza.

Los eventos de los equipos llegan sólo al Edge. Por cada acceso, el Edge lo
reenvía a la nube y espera su decisión; si llega a tiempo, la nube decide y el
Edge ejecuta la orden que ella le manda; si no, decide el Edge con su caché,
acciona, sella la versión y lo guarda para reconciliar. Una orden tardía de la
nube se rechaza: nunca hay dos actores sobre la barrera.

Las credenciales de los equipos viven sólo en el Edge, cifradas. La consola las
escribe; la API las pasa por el túnel sin guardarlas; en la base quedan una
referencia y una huella. Las heredadas se mudan con un botón, y la nube borra
las suyas sólo cuando el Edge confirma que el equipo autentica con ellas.

Una copropiedad sin Edge puente no ve nada de esto: la API habla directo con
sus equipos, como en el portátil en sitio y en todas las pruebas anteriores.

## 2 · Cómo se organizó y por qué

- **El túnel es un puerto, no un caso especial.** `packages/providers/src/remoto`
  define el protocolo, la sesión (latido, plazos, ritmo, tamaño, canales) y un
  `ProveedorRemoto` que implementa `ProveedorDeEquipos` por el túnel, y el
  ejecutor que, en el Edge, traduce cada pedido a una llamada del proveedor
  real. Ni el dominio ni los casos de uso saben que existe: la prueba es que la
  suite de contrato del proveedor corre contra el directo y contra el vía Edge
  con las mismas aserciones.
- **La elección es por copropiedad, en un solo lugar.** `ProveedorEnrutado`
  (API) pregunta a `RutasDeEquipos` si la copropiedad del equipo tiene puente
  (caché de 5 s) y delega en el directo o en el remoto de su túnel. Con base en
  memoria (`TODO_DIRECTO`) ni siquiera se instancia: R1 por construcción.
- **La copropiedad viaja con la petición, no con el equipo.** Un interceptor
  global pone la copropiedad de la ruta en un contexto asíncrono; la sonda, el
  corrector y el video la leen de ahí. El hecho en curso (`hecho-en-curso`)
  hace lo mismo con el acceso, para que el Edge sepa a qué hecho pertenece una
  orden de apertura (un solo actor).
- **Las credenciales son un decorador del repositorio.**
  `RepositorioConCredencialEnElEdge` envuelve el repositorio de equipos de
  siempre: sin puente, todo pasa tal cual; con puente, la clave se separa del
  alta y viaja por el túnel. `credencialPara` devuelve `edge:<equipo>`, que el
  Edge sustituye por la clave guardada **sólo** para el host de ese equipo
  (S-187).
- **El Edge puente es el Edge de la 15-Q con cuatro piezas cambiadas.**
  `componerPuente` reutiliza `componerEdge` y sustituye el registro de equipos
  (cifrado), la sonda (sin túnel la nube no atiende), el ingestor
  (`PuenteConLaNube`) y las cámaras del receptor local. `EDGE_TUNEL=inactivo`
  es, byte a byte, el Edge de la 15-Q; `domain-core` no se tocó.
- **La DoD tiene dos procesos de verdad.** La API real contra PostgreSQL en el
  proceso de la prueba, con un guardián en su proveedor directo y en su `fetch`
  que anota cualquier intento de tocar un equipo; el Edge en un proceso hijo con
  los equipos simulados. Lo único que los une es el túnel.

### Lo que destaparon las pruebas (y se corrigió en la ronda)

| Defecto (código nuevo de esta ronda)                                                                         | Corrección                                                     |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| WebSocket de Node 22 sin `close` tras un `error`: el túnel no volvía a intentarlo                            | El enlace cierra solo si el `close` no llega en 100 ms         |
| Diagnóstico y correcciones del Edge con el `fetch` global y no con el transporte de sus equipos              | Mismo transporte que el proveedor                              |
| Con base, una copropiedad sin Edge recibía 409 en vez del 503 «falta GO2RTC_URL» (R1)                        | Vista en vivo elegida por copropiedad                          |
| Respuesta del Edge sin forma: se marcaba la credencial y luego 500; `"false"`/`1` borraba la de la nube      | Lectura estricta; `ProtocoloInvalido` y nada se marca ni borra |
| Alta con puente cuya entrega fallaba después de escribir: equipo sin credencial en ningún lado               | El alta se deshace con baja lógica                             |
| Una alerta de desconexión fallida dejaba sin aviso al resto                                                  | Equipo por equipo; se cuentan las abiertas                     |
| El 503 repetía el pedido interno o el motivo de cierre del otro lado                                         | Texto fijo                                                     |
| `detener()` del túnel no cancelaba el reintento ni el apretón de manos                                       | Cancela los dos                                                |
| `EDGE_PLAZO_NUBE_MS=` vacío impedía arrancar (D-91)                                                          | Se quitan las vacías antes de validar                          |
| `limpiarRtsp` no tapaba la URL con credencial codificada en `%`                                              | También la codificada                                          |
| Reescribir la clave de un equipo trasladado dejaba `edge:` y la huella vieja                                 | La referencia vuelve a la bóveda                               |
| `0050_revert.sql` prometía desbloquearse al reescribir las claves y nunca lo hacía                           | Dos motivos de rechazo distintos y verdaderos                  |
| (verificador) El panel del Edge hacía `edges.map` sobre una respuesta que no era lista: Dispositivos se caía | Sólo pinta listas                                              |
| (verificador) `RETURNING` en el CTE de `guardarSecreto`: con `authenticated`, el alta reventaba por RLS      | Sin `RETURNING`                                                |

## 3 · Árbol de archivos

**providers** · `packages/providers/src/remoto/`

- `protocolo.ts`, `serializacion.ts`, `errores-remotos.ts` — el protocolo v1, su forma en el cable y sus errores tipados.
- `sesion-de-tunel.ts`, `canales-del-tunel.ts`, `cola-de-canal.ts` — sesión con latido, plazos, ritmo y tamaño; canales binarios del audio.
- `proveedor-remoto.ts`, `audio-por-tunel.ts` — `ProveedorDeEquipos` por el túnel.
- `ejecutor-remoto.ts` — en el Edge, cada pedido al proveedor real; un solo actor (`padreVigente`).
- `enlace-en-memoria.ts`, `tunel-en-memoria.ts` — el túnel sin red, para la suite de contrato.

**API** · `apps/api/src/`

- `edge/aplicacion/abrir-tunel.ts` — acreditar el `hola` y ocupar el túnel de la copropiedad.
- `edge/aplicacion/publicaciones-del-edge.ts`, `alerta-de-desconexion.ts`, `inventario-del-edge.ts` — eventos reenviados, alerta tras 30 s, inventario vigente.
- `edge/aplicacion/credenciales-del-puente.ts`, `migrar-credenciales.ts`, `puentes.ts` — D1–D3 y la marca de puente.
- `edge/infraestructura/*` — puentes, auditoría del túnel y credenciales en PostgreSQL.
- `edge/presentacion/puerta-del-tunel.ts`, `enlace-ws.ts`, `puentes.controller.ts` — el WebSocket y las rutas de puentes y migración.
- `edge/tunel-del-edge.module.ts` — el módulo global del túnel.
- `proveedores/proveedor-enrutado.ts`, `rutas-de-equipos.ts`, `tuneles-de-edge.ts`, `copropiedad-en-curso.ts`, `hecho-en-curso.ts` — enrutado por copropiedad.
- `equipos/infraestructura/credencial-en-el-edge.ts`, `por-el-edge.ts`, `composicion-con-edge.ts` — repositorio, sonda y corrector por el Edge.
- `guardia/infraestructura/puente-de-video-por-el-edge.ts` — WHEP hacia el go2rtc del Edge y la elección por copropiedad.
- `guardia/aplicacion/servidores-ice.ts`, `infraestructura/servidores-ice-de-configuracion.ts`, `presentacion/ice.controller.ts`, `configuracion/esquema-de-ice.ts` — STUN/TURN con credencial efímera.
- `comun/credenciales-en-el-edge.ts`, `comun/filtros/error-del-tunel.ts`, `comun/despachador-de-actualizaciones.ts` — puerto, 503 tipado y despacho del WebSocket.

**Edge** · `apps/edge/src/`

- `composicion-puente.ts`, `extras-del-puente.ts`, `configuracion/esquema-del-puente.ts` — el Edge puente y sus variables.
- `aplicacion/puente-con-la-nube.ts` — B2: decide la nube o, a tiempo vencido, el Edge.
- `infraestructura/tunel/cliente-de-tunel.ts`, `enlace-websocket.ts`, `atenciones-del-edge.ts` — el túnel y lo que el Edge atiende.
- `infraestructura/equipos/registro-cifrado.ts` — credenciales con AES-256-GCM en SQLite.
- `infraestructura/video/go2rtc-local.ts` — el go2rtc junto al Edge.

**Consola** · `apps/web/src/`

- `app/(consola)/dispositivos/edge-del-conjunto.tsx` — el panel del Edge.
- `lib/video/ice.ts` — los STUN/TURN de la API antes de negociar.

**Base** · `supabase/migrations/…_0050_edge_puente.sql`, `reversion/0050_revert.sql`, `policies/tests/99g_edge_puente.sql`.

**Pruebas de punta a punta** · `apps/api/test/edge-puente-procesos-pg.e2e.test.ts` y `test/edge-hijo/*` (DoD de dos procesos), `servidores-ice.e2e.test.ts`, `credencial-vuelve-a-la-nube-pg.test.ts`.

**Modificados sin crecer:** `app.module.ts`, `proveedores.module.ts`, `equipos.module.ts`, `guardia.module.ts`, `salud.controller.ts`, `filtro-global.ts`, `esquema.ts`, `repositorio-equipos-pg.ts`, `sonda-por-proveedor.ts`, `corrector-por-proveedor.ts`, `registro-de-equipos-pg.ts`, `puerta-de-audio.ts`, `video.controller.ts`, `composicion.ts` y `main.ts` del Edge, `whep.ts` y `pantalla.tsx` de la consola, `ensayo-en-sitio-pg.test.ts`. **Crecen sólo los generados** (contrato OpenAPI, tipos de la consola, cliente Dart), excepción declarada.

## 4 · Tabla SOLID

| Pieza                              | SRP                                   | OCP                                            | LSP                                                    | ISP                                | DIP                                                |
| ---------------------------------- | ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------ | ---------------------------------- | -------------------------------------------------- |
| `SesionDeTunel`                    | Sesión: latido, plazos, ritmo, tamaño | Pedido nuevo = `atender` nuevo                 | Enlace WebSocket y en memoria                          | 5 métodos y `canales` aparte       | Recibe `Enlace` y reloj                            |
| `ProveedorRemoto`                  | Un puerto por el túnel                | Método nuevo del puerto = pedido nuevo         | **La suite de contrato pasa igual que con el directo** | Implementa el puerto (S-190)       | Depende de `SesionDeTunel`                         |
| `ProveedorEnrutado`                | Elegir directo o remoto               | Otra ruta = otra `RutasDeEquipos`              | Sustituye al directo sin que nadie lo note (R1)        | Implementa el puerto (S-190)       | Rutas y túneles inyectados                         |
| `AbrirTunel`                       | Acreditar y ocupar                    | —                                              | Repos PG y en memoria                                  | Puertos de una o dos operaciones   | Acreditación, puentes y auditoría por puerto       |
| `CredencialesDelPuente`            | Entregar y retirar credenciales       | —                                              | —                                                      | Puerto `CredencialesEnElEdge` de 5 | Rutas, túneles, lectura, marca y huella inyectados |
| `MigrarCredencialesAlEdge`         | Mudar con confirmación                | —                                              | `CredencialesEnLaNube` PG y doble                      | Puerto propio de 3                 | Ídem                                               |
| `RepositorioConCredencialEnElEdge` | Separar la clave del alta             | Decorador: el repositorio de siempre no cambia | Sin puente, idéntico al repositorio PG                 | Implementa el puerto (S-190)       | Repositorio y Edge por puerto                      |
| `PuenteConLaNube`                  | Quién decide cada acceso              | —                                              | Es un `IngestorDePublicaciones` más                    | `ingerir` y `enManosDeLaNube`      | Recibe el ingestor local y la sesión               |
| `ClienteDeTunel`                   | Conectar, saludar, reconectar         | Socket inyectable                              | Socket real y falso                                    | `iniciar`, `detener`, `sesion`     | Socket, reloj, azar y espera inyectados            |
| `RegistroCifrado`                  | Guardar y leer cifrado                | —                                              | Es un `RegistroDeEquipos`                              | 4 métodos                          | Base y llave inyectadas                            |
| `ServidoresIceDeConfiguracion`     | La lista ICE de un usuario            | —                                              | —                                                      | `para`                             | Configuración y reloj inyectados                   |
| `EdgeDelConjunto` (consola)        | Mostrar y operar el Edge              | —                                              | —                                                      | —                                  | Cliente generado desde OpenAPI                     |

Archivos nuevos: todos ≤ 300 líneas. Clases nuevas con más de 5 métodos públicos: sólo los adaptadores de puerto de S-190.

## 5 · Trazabilidad

| Elemento                    | Cómo queda                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **OE-06**                   | El Edge es el puente: opera con y sin WAN contra equipos simulados en otro proceso; con equipos reales, pendiente         |
| **OE-03** · KPI-12          | La suite de contrato corre contra directo y vía Edge sin cambiar aserciones                                               |
| **OE-07** · CU-03           | Abrir, audio y video de la guardia por el túnel                                                                           |
| **RN-16** · CA-21 · KPI-31  | Sin nube a tiempo, el Edge decide con su caché y sella la versión                                                         |
| **RN-17** · CA-22 · KPI-29  | Reconciliación exactamente una vez tras cortar y devolver el túnel (DoD)                                                  |
| **RN-15** · KPI-36 · KPI-37 | Un Edge que dice servir otra copropiedad → 4404; otra copropiedad no ve la ficha; la ruta ICE fuera del alcance → 403/404 |
| **RN-18** · KPI-25          | Alerta persistente por equipo tras 30 s de desconexión                                                                    |
| **RN-21** · KPI-11          | Credenciales sólo en el Edge; frontera de fabricante verde                                                                |
| **RN-09** · CA-09           | Plantillas sólo con consentimiento; viajan por el túnel y el Edge no las guarda (probado sobre su SQLite y su WAL)        |
| **KPI-32** · CA-20          | Apertura desde la consola por el túnel (DoD)                                                                              |
| **KPI-33** · CA-19          | Audio de ida y vuelta < 2 s; video negociado; **sin medir contra un TURN real** (P-29)                                    |
| **KPI-13**                  | El plazo de la nube (2,5 s) cabe en los 3 s de la barrera                                                                 |

## 6 · Pruebas

### Qué se probó y cómo

| Qué                                                                                                                                                                                                                                                                                  | Dónde                                                           | Cómo                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ----------------------------------- |
| **DoD de dos procesos**: túnel y `/ready`; migración de la credencial heredada; alta con credencial que no queda en la nube; abrir; un solo actor; video; rostro (sincronizar y suprimir); audio < 2 s; túnel caído con motivo tipado; reconciliación una vez; aislamiento; guardián | `apps/api/test/edge-puente-procesos-pg.e2e.test.ts`             | `--con-base`                        |
| Contrato del proveedor contra directo y vía Edge                                                                                                                                                                                                                                     | `packages/providers/src/contrato/contrato-de-proveedor.test.ts` | `pnpm --filter @ncr/providers test` |
| Sesión, canales, ejecutor y proveedor remoto                                                                                                                                                                                                                                         | `packages/providers/src/remoto/*.test.ts`                       | ídem                                |
| Túnel, credenciales, migración, alertas, inventario, enrutado, video, ICE, 503                                                                                                                                                                                                       | `apps/api/src/**/` (16 archivos de prueba nuevos)               | `pnpm --filter @ncr/api test`       |
| Ruta ICE de punta a punta: vacía sin configurar, TURN efímero, roles, aislamiento, arranque                                                                                                                                                                                          | `apps/api/test/servidores-ice.e2e.test.ts`                      | ídem                                |
| La credencial vuelve a la nube (falla sin la corrección)                                                                                                                                                                                                                             | `apps/api/test/credencial-vuelve-a-la-nube-pg.test.ts`          | `--con-base`                        |
| Edge: puente con la nube, cliente de túnel, enlace (Node 22 real), registro cifrado (fichero y WAL), go2rtc, configuración, atenciones                                                                                                                                               | `apps/edge/src/**/` (7 archivos de prueba nuevos)               | `pnpm --filter @ncr/edge test`      |
| Consola: panel del Edge y STUN/TURN                                                                                                                                                                                                                                                  | `edge-del-conjunto.test.tsx`, `lib/video/ice.test.ts`           | `pnpm --filter @ncr/web test`       |
| Garantías de la 0050                                                                                                                                                                                                                                                                 | `supabase/policies/tests/99g_edge_puente.sql`                   | `--con-base`                        |
| **R1**: suites de la API, el Edge y providers, regresiones de sitio y DoD de la 15-Q                                                                                                                                                                                                 | todo lo anterior a la ronda                                     | `--con-base`                        |

Pruebas negativas hechas a mano en la ronda: el enlace WebSocket **falla**
con el código anterior (se agota esperando un `close`); la reversión **falla**
sin la corrección de `guardarSecreto`; la frontera de fabricante **falló** con
una palabra del protocolo en un comentario de la DoD, hasta quitarla.

### Resultado

«RESULTADO»

| Medida de la DoD (dos procesos, PostgreSQL, equipos simulados) | Valor               |
| -------------------------------------------------------------- | ------------------- |
| Pruebas de la DoD                                              | 12 de 12            |
| Audio por el túnel, ida / vuelta                               | «IDA» / «VUELTA» ms |
| Aperturas de la barrera por un acceso con la nube viva         | 1                   |
| Intentos de la API de tocar un equipo (guardián)               | 0                   |
| Accesos reconciliados tras el corte                            | 3 de 3, una vez     |

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

«VEREDICTO»

### Cobertura por capa

«COBERTURA»

## 7 · Verificación de seguridad (§2.7)

| Medida                   | Estado en la ronda                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 · Secretos             | Credenciales de equipos sólo en el Edge (AES-256-GCM, llave fuera del SQLite); en la nube, referencia y huella; secreto del TURN sólo en la API; `.env.example` sin valores; escaneo limpio en cada commit                     |
| 2 · CORS                 | Sin cambios; el túnel es un WebSocket servidor a servidor autenticado por HMAC, no un origen de navegador                                                                                                                      |
| 3 · Validación           | Protocolo del túnel validado mensaje a mensaje (cierre ante inválido); respuesta del Edge leída con forma estricta; variables ICE y del puente con Zod; DTOs de las rutas nuevas con `whitelist`                               |
| 4 · Inyección SQL        | Consultas parametrizadas; un CTE nuevo en `guardarSecreto`, parametrizado                                                                                                                                                      |
| 5 · Rate limiting        | Mensajes por segundo y tamaño por túnel; rutas nuevas bajo el limitador global; reconexión con retroceso y dispersión                                                                                                          |
| 6 · RLS y `service_role` | 0050 con CHECK e índice único; copropiedad del Edge validada en la aplicación (otra → 4404 y auditoría); la DoD prueba el aislamiento por los dos caminos                                                                      |
| 7 · CSP                  | Sin cambios; WebRTC no lo gobierna `connect-src`                                                                                                                                                                               |
| 8 · Transversales        | Ninguna clave en registros, respuestas ni errores (probado en el SQLite, su WAL y los mensajes del túnel); 503 con texto fijo; la URL RTSP, también codificada, redactada; credencial TURN efímera y `Cache-Control: no-store` |

## 8 · Deuda técnica, supuestos y pendientes

- **DT-15Q2-01 · el TURN.** Sin servidor TURN alojado ni probado (P-29).
- **DT-15Q2-02 · `pnpm sitio:edge` no conoce el modo puente.**
- **DT-15Q2-03 · el modo puente no se ha probado con equipos reales** ni con la API en Cloud Run.
- **DT-15Q2-04 · una instancia de la API** (P-30).
- **Hallazgos de la 15-Q, sin tocar:** el evento rechazado para siempre bloquea
  la bandeja del Edge (P-31); la nube devuelve su rechazo con clave vacía y el
  Edge pierde el motivo; referencias de más de ~115 caracteres dejan la
  apertura del Edge sin constancia (`accionamiento-del-edge.ts:47`).
- **Prueba de la 15-Q sensible al paralelo:** `edge-instantanea-pg.e2e.test.ts`
  supone que nadie cambia las reglas de MIRA mientras corre; en una corrida
  completa falló una vez (otra suite publicó una versión) y pasa sola.
- **Residual de un solo actor** (S-189): una orden tardía de la nube no mueve
  la barrera, pero ese acceso puede quedar con dos decisiones registradas.
- **Supuestos nuevos:** S-185 a S-192. **Pendientes nuevos:** P-29, P-30, P-31.
  **Contradicciones:** C-51 y C-52, resueltas.

## 9 · Qué debe hacer el usuario manualmente

1. Decidir **dónde se aloja el TURN** (P-29) y, con él, poner
   `WEBRTC_TURN_URLS` y `WEBRTC_TURN_SECRETO` en la API y lo mismo en el
   `go2rtc.yaml` del Edge.
2. En el equipo del Edge: `EDGE_TUNEL=activo` y `EDGE_EQUIPOS_LLAVE`
   (`openssl rand -base64 32`) fuera de la carpeta del SQLite.
3. Desplegar la API con **una** instancia (`DESPLIEGUE.md` §4.4).
4. Aplicar la migración 0050.
5. En la consola, como superadministrador: Dispositivos → Edge del conjunto →
   **Usar como puente**; luego **Mudar credenciales al Edge**.
6. En cada cámara, dejar **un solo** destino de Alarm Server: el Edge
   (`DESPLIEGUE_EDGE.md` §10.3).
7. Repetir el corte de WAN de `DESPLIEGUE_EDGE.md` §9 / §10.8 con los equipos
   de verdad.
8. Decidir P-31 (qué hacer con un evento que la nube nunca aceptará).

## 10 · Rama y commits

Rama `etapa-15q2-edge-puente`, desde `develop@4849f4e`:

«COMMITS»
