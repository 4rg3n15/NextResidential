# Validación en sitio de los tres equipos Hikvision

**Qué es esto.** El mínimo ejecutable para aprovechar que los equipos están
disponibles hoy. **No es** `INTEGRACION_HIKVISION.md`, que es entregable de la
ETAPA 15 y se escribe frente al equipo con el prompt adicional que exige §6.
Esto es lo anterior: comprobar qué responde cada equipo, con qué formato exacto,
y dejarlo anotado para que la ETAPA 15 se construya sobre hechos y no sobre
analogías.

**Equipos.**

| Papel           | Referencia declarada | Notas                                                           |
| --------------- | -------------------- | --------------------------------------------------------------- |
| Cámara LPR      | `DS-TCG405-E`        | Unidad de entrada ANPR                                          |
| Terminal facial | `DS-K1T344MBFWX-E`   | **Confirme el sufijo en la etiqueta**: el catálogo lista `…-E1` |
| Videoportero    | `DS-KD9633-WBE6`     | Estación de puerta con reconocimiento facial                    |

---

## V · Procedimiento de la visita · ETAPA 15-I, corregido en la 15-K · **empiece aquí**

> **Añadido el 26/09/2026 (ETAPA 15-I).** Es el procedimiento ÚNICO y ordenado
> para ir a sitio. Todo lo que sigue a este apartado (§0 a §9) es el detalle de
> cada paso, y se cita desde aquí. Tras fusionar la 15-I, **lo único pendiente de
> la ETAPA 15 es esto: registrar los tres equipos y ejecutar los 16 escenarios,
> desde la consola web y desde la app móvil (BE-02).** El ensayo previo, en
> SIMULADO y contra base real, está en
> [`ENSAYO_PREVIO_EN_SITIO.md`](ENSAYO_PREVIO_EN_SITIO.md): 24 de las 26 filas
> escenario × canal en verde, y los defectos que destapó ya corregidos.
>
> **Corregido tras la primera visita (ETAPA 15-K, H-SITIO-01 a 14).** Cambia
> cómo se arranca la API (`start`, no `start:dev`), qué `API_URL` lleva la
> consola (`127.0.0.1`, no la IP), por dónde se abre la consola (por IP), y
> añade dos cosas que faltaron aquel día: la **captura cruda** de lo que
> contesta cada equipo (`--capturar`), ANTES de tocar nada y después, y la
> **reversión equipo por equipo** contra esa captura. Cuatro fallos de la
> visita (H-SITIO-01, 04, 05 y 09) se quedaron sin diagnóstico por no tenerla.
>
> **Anexo de sitio (27/09/2026).** La terminal y el videoportero **abrieron**
> con `PUT door/1`, Content-Type `application/x-www-form-urlencoded;
charset=UTF-8`, el cuerpo con espacio de nombres y `version="2.0"` y el
> Digest con el cuerpo ya en la primera petición; con el cuerpo mínimo dijeron
> «OK» y no abrieron (H-SITIO-13), y `curl --digest`, que sondea con el cuerpo
> vacío, recibe de la terminal `400 badXmlContent` (H-SITIO-15). El sistema
> abre ya así, y el guion gana **`--abrir`** para comprobarlo delante de la
> puerta (paso 2 bis). **No abra puertas con `curl`** (§5.1).

### V.1 · Antes de salir de casa

- [ ] **Código.** `develop` con el PR de la 15-K fusionado; `pnpm install --frozen-lockfile`.
- [ ] **Verificador en verde en el Mac:** `./scripts/verificar-etapa.sh --con-base`.
- [ ] **Base del proyecto con TODAS las migraciones, hasta la `0039`**
      (`20260926130000_0039_atestacion_del_instalador.sql`): `supabase db push`.
      Comprobar que la RLS quedó activa y forzada (`docs/guias/CONEXION_SUPABASE.md`).
- [ ] **`apps/api/.env`**, con estos NOMBRES (los valores sólo en su `.env` local, nunca en el repositorio, RN-21):

  | Variable                                                                               | Para qué                                                                                                                                                                              |
  | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL` | Proyecto de Supabase: la secreta, SÓLO en la API                                                                                                                                      |
  | `DATABASE_URL`, `DATABASE_POOLER_URL`                                                  | Conexión de la API a PostgreSQL                                                                                                                                                       |
  | `PGBOSS_DATABASE_URL`                                                                  | **Si la red del sitio es sólo IPv4** (H-SITIO-07): el pooler en modo **sesión**, puerto **5432**. La directa `db.<ref>.supabase.co` sólo resuelve por IPv6. Vacía: usa `DATABASE_URL` |
  | `CORS_ALLOWED_ORIGINS`                                                                 | `http://<IP-del-Mac>:3100,http://127.0.0.1:3100`: los dos orígenes por los que se abre la consola (V.2.4)                                                                             |
  | `PROVEEDOR_DE_EQUIPOS=hikvision`                                                       | Equipos reales (con `simulado`, ninguno)                                                                                                                                              |
  | `CARGADOR_DE_CONTEXTO=postgres`                                                        | El motor lee autorizaciones, padrón y lista negra de la base                                                                                                                          |
  | `PERSISTENCIA_DE_EVENTOS=postgres`, `PERSISTENCIA_DE_BIOMETRIA=postgres`               | Histórico, evidencias, biometría y la lista de Dispositivos en la base (con `memoria` no hay trazabilidad, y el equipo dado de alta no aparece: H-SITIO-02)                           |
  | `GO2RTC_URL`                                                                           | `http://127.0.0.1:1984`: el puente de vídeo, visto desde la API                                                                                                                       |
  | `ALARM_SERVER_EQUIPOS`                                                                 | `copropiedad\|equipo\|secreto\|ip` de la cámara (se completa en sitio, paso V.2.7)                                                                                                    |
  | `INGESTA_FIRMA_SECRETO`                                                                | Firma de la ingesta del Edge                                                                                                                                                          |
  | `BIOMETRIA_LLAVE`, `BIOMETRIA_LLAVE_REF`                                               | Bóveda biométrica, códigos de patrullaje y de ocupante (ADR-025)                                                                                                                      |
  | `EQUIPOS_LLAVE`, `EQUIPOS_LLAVE_REF`                                                   | Cifrado de las claves de servicio de los equipos en la base                                                                                                                           |
  | `EVIDENCIA_BUCKET`                                                                     | Bucket privado de evidencias (si falta, la API avisa y usa memoria)                                                                                                                   |
  | `BARRERA_*`, `TERMINAL_*`, `VIDEOPORTERO_*`                                            | `HOST`, `PUERTO`, `USUARIO`, `CLAVE`, `CANAL` de cada equipo, para el guion de sitio (§8.1). Sólo en el `.env` local                                                                  |

- [ ] **`apps/web/.env`**: **`API_URL=http://127.0.0.1:3000`**, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`; `PUENTE_VIDEO_URL` vacío (ADR-022).
      `API_URL` la resuelve el **servidor** de la consola, que corre en el mismo Mac que la API; el navegador nunca habla con ella (todo pasa por `/api/ncr`, [`CONSOLA_EN_RED_Y_DESPLIEGUE.md`](CONSOLA_EN_RED_Y_DESPLIEGUE.md) §4). Con la IP del Mac en vez del bucle local, `next start` —que es producción— **no arranca**: exige `https` a toda API que no sea de bucle local (§2.7.8).
- [ ] **go2rtc**: `pnpm sitio:video -- --preparar` con Internet, ANTES de salir (descarga el binario a `.sitio/bin/` y escribe `.sitio/go2rtc.yaml` desde `apps/api/.env`; [`INTEGRACION_HIKVISION.md`](INTEGRACION_HIKVISION.md) §6, punto 4). **Sin equipos ni credenciales en el fichero**: la API registra cada flujo al pedirlo (§3.3). En sitio, si la IP del Mac cambió, basta con repetir `pnpm sitio:video`.
- [ ] **App en el iPhone físico** (Xcode con la cuenta de desarrollo, iPhone de confianza), compilada en **Release**, instalada una vez y abierta desde el ícono sin el Mac conectado ([`APP_EN_IPHONE.md`](APP_EN_IPHONE.md), ADR-033):

  ```
  cd apps/mobile
  flutter run --release -d <id-del-iPhone> \
    --dart-define=API_URL=http://<nombre>.local:3000 \
    --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
    --dart-define=SUPABASE_PUBLISHABLE_KEY=<la PUBLICABLE, nunca la secreta>
  ```

  Al primer uso, acepte los permisos de **cámara** (foto del visitante, hito 3) y de **red local** (H-SITIO-11: sin él, «No hay conexión con el servidor» aunque Safari abra la API). Si la app no llega, «Cambiar servidor» con la dirección que sí abrió Safari. Con Apple ID gratuito la app caduca a los 7 días.

- [ ] **Superadministrador** con MFA inscrito (arranque en frío: `scripts/registrar-copropiedad.mjs` y `scripts/aprovisionar-rol.mjs`).
- [ ] **La copropiedad de prueba**, desde Configuración → Ajustes de plataforma (superadministrador): **código corto** (p. ej. `MIRA`; es el que teclean app y consola, D1), tipo y etiquetas de vivienda, **teléfono de portería** (D7) y tope de vehículos propios (2).
- [ ] **Un residente de prueba** (Residentes → Nuevo residente: usuario y contraseña inicial) y **un portero de prueba** (Porteros) con turno de hoy.
- [ ] **Credenciales de servicio de los tres equipos**, en mano, y sus IP fijas. Nunca en el repositorio ni en la hoja.
- [ ] **Una carpeta de sitio FUERA del repositorio**, p. ej. `$HOME/ncr-sitio`. Ahí van las capturas, la bitácora de la API, la hoja y el informe. `--capturar` se niega a escribir dentro del repositorio (sale con 2).
- [ ] **La hoja de resultados** (16 escenarios en 26 filas escenario × canal, más L6, L7 y T6, con la columna **«Evidencia cruda»**): `node scripts/puesta-en-marcha-equipos.mjs --simulado --hoja=$HOME/ncr-sitio/hoja.md`.

### V.2 · En sitio

1. **Red.** Mac, iPhone y equipos en la misma LAN. Anote la IP del Mac: es la de la consola por IP, la de la app y la del Alarm Server. **No** es la de `API_URL` de la consola, que sigue en `127.0.0.1`.
2. **Estado previo de los equipos, capturado ANTES de tocar nada** —ni la consola, ni el panel web de ningún equipo—:

   ```
   pnpm --filter @ncr/providers build
   node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs \
     --sin-accionar --capturar=$HOME/ncr-sitio/antes --informe=$HOME/ncr-sitio/informe-antes.md
   ```

   Deja una carpeta por equipo (`camara/`, `terminal/`, `videoportero/`) con cada petición y cada respuesta **crudas y saneadas** (sin claves ni tokens, IPs tachadas): capacidades, `EntranceParam`, disparadores, servidor de alarma, `AcsCfg`/`remoteCheckDoorEnabled`, FDLib, TwoWayAudio. En la terminal hace además la **carga de prueba** con una imagen sintética que no es un rostro y **da de baja** la persona de prueba al terminar, la acepte o no (H-SITIO-04). Si el guion dice que la baja no se aceptó, compruebe en el equipo que no quedó esa persona antes de seguir. **Ésta es la referencia de la reversión (paso 13): sin ella no hay vuelta atrás exacta.**

2 bis. **La apertura demostrada, lo primero que se verifica** (anexo, H-SITIO-13). No cambia ninguna configuración: sólo abre, una vez, la puerta de la terminal y la del videoportero, con una persona delante de cada una:

```
node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs \
  --abrir --capturar=$HOME/ncr-sitio/abrir --informe=$HOME/ncr-sitio/informe-abrir.md
```

Por cada equipo escribe las dos peticiones (`401` y después `200`, las dos con el cuerpo y el Content-Type de formulario), la respuesta (`statusCode 1`, `subStatusCode ok`) y **pregunta si la puerta se movió**: mírela y conteste `s` o `n`. Sale en 0 sólo si las dos se movieron. Si una **no** se movió con la orden aceptada, H-SITIO-13 sigue abierto en ese equipo: no haga sus escenarios de puerta y devuelva la carpeta `abrir/`. Si la terminal contesta `400 badXmlContent`, algo entre el Mac y el equipo le quita el cuerpo (H-SITIO-15).

3. **Arranque.** Primero go2rtc, en su propia terminal: `pnpm sitio:video` (queda en primer plano). Después compile y arranque la API **con `start`**, guardando su bitácora en la carpeta de sitio:

   ```
   pnpm turbo run build --filter=@ncr/api --filter=@ncr/web
   pnpm --filter @ncr/api start 2>&1 | tee $HOME/ncr-sitio/api.log
   ```

   `start` es `node dist/main.js`, que es lo que ejecuta el recorrido de la consola en el verificador (paso 13b). `start:dev` ya no usa `tsx` (con él el `ValidationPipe` no validaba nada, H-SITIO-06): compila con `tsc` y arranca lo mismo, y con `tsx` la API se niega a arrancar. Aun así, para la visita, `start`: es lo que está verificado. Lea la bitácora de arranque: tiene que decir persistencia `postgres`, proveedor `hikvision`, el puente go2rtc y **qué conexión usa pg-boss** (H-SITIO-07); y **ningún error** de `API_URL_PUBLICA` de bucle local (H-SITIO-10).

4. **Consola en el Mac, abierta POR IP**: `pnpm --filter @ncr/web start` (puerto 3100) y, en el navegador, `http://<IP-del-Mac>:3100`. No en Netlify: el SSE y el audio pasan por su servidor (C-37, P-20). Por IP es como la abrirá cualquier otro aparato, y es la única forma de ver lo que verán ellos (D-67 y D-68 sólo aparecían por IP).
   **Una excepción, y es del navegador, no de la consola:** el **audio de la guardia (V2)** necesita el micrófono, y el navegador sólo lo concede en contexto seguro. `http://<IP>` sin TLS no lo es; `http://127.0.0.1:3100` sí. V2 se hace en el propio Mac por `127.0.0.1` ([`CONSOLA_EN_RED_Y_DESPLIEGUE.md`](CONSOLA_EN_RED_Y_DESPLIEGUE.md) §3).
5. **Acceso** a la consola como superadministrador: su correo, su contraseña y MFA.
6. **Registrar los tres equipos**: Dispositivos → + Agregar equipo (§9), con el usuario de servicio de cada uno. «Probar conexión» descubre modelo, firmware y capacidades (ADR-019). **El equipo aparece en la tabla aunque la ficha lo rechace** (H-SITIO-01, 02): se corrige desde su ficha. Cada ficha muestra, en «Respuesta del equipo», lo que el equipo contestó, saneado.

   - **La cámara**: en verde con `ctrlMode=1`, `CRIndex=210`, `detectionUpLoadPicturesType` distinto de «all» y formato XML. Si bloquea por operaciones de barrera no catalogadas (`barrierGateOper=0` NO se da por «no abre»: en la visita abría con 0) o por un disparador ilegible, **pruébelo físicamente** —una placa de la lista blanca del equipo y una desconocida; **ninguna** abre— y regístrelo con «Atestar» como superadministrador (D-11, [ADR-030](../decisiones/ADR-030-atestacion-del-instalador.md)). Queda en **ámbar**, nunca en verde, y sólo para ese firmware. Si alguna abre, es hallazgo de bloqueo (§4.1): pare.
   - **La terminal**: `AcsCfg.remoteCheckDoorEnabled` (verificación remota, H-SITIO-05) y la biblioteca FDLib.
   - **El videoportero**: TwoWayAudio, y «Rostros: recibe plantillas» o «no aplica» (H-SITIO-09).

   Lo que la ficha marque se corrige antes de seguir (§8.2 a §8.4). **Cada casilla que cambie en un equipo se anota en su tabla con el fichero de `antes/` que tiene su valor previo.**

7. **La cámara hacia la API.** Alarm Server apuntado a `http://<IP-del-Mac>:3000/alarm-server/<secreto>` (§4.2) y la cámara declarada en `ALARM_SERVER_EQUIPOS` con el id que le dio la consola. Reinicie la API (con `tee -a` al mismo `api.log`). La terminal y el videoportero no se configuran hacia la API: es la API la que se suscribe a ellos.
8. **Guion de sitio completo**, ya con los equipos configurados:
   `node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --capturar=$HOME/ncr-sitio/durante --informe=$HOME/ncr-sitio/informe.md` (sin `--sin-accionar`: acciona barrera y puertas). Ningún `✗ BLOQUEO`.
9. **La app, primer ingreso del residente de prueba:**

   1. código de la copropiedad, usuario y contraseña inicial;
   2. cambio de contraseña;
   3. alta con su vivienda, marcando «no lo tengo» si es la primera cuenta de esa vivienda;
   4. ocupantes: el aviso de que el número es DEFINITIVO, y confirmar.

   En Perfil, «Llamar a portería» tiene que marcar el número registrado.

10. **El portero de prueba** entra en la consola (por IP) con **su número y su contraseña**, dentro de su turno (ADR-031). Con el modo pruebas activo entra desde cualquier IP; para demostrar la lista blanca, [`ENTREGA_EN_SITIO.md`](ENTREGA_EN_SITIO.md) §3 bis.
11. **Los 16 escenarios por canal**, con la hoja delante. Orden sugerido:

    1. L1–L5 con la visita creada en la app, y otra vez creada en la consola;
    2. T1–T5 con la foto tomada en la app, y otra vez en la consola;
    3. V1–V6 (V2 por `127.0.0.1`, paso 4);
    4. después, L6, L7 y T6.

    Cada fila lleva su evento de `/eventos` y su evidencia; sin identificador de evento no hay PASA (RN-02). La única excepción es V1, porque un timbre no deja evento. La lista negra de L5 y T5 se crea en Listas negras → Vetar.
    **Evidencia cruda, en cada fila:** las líneas de `api.log` de ese escenario —cada evento que llega de un equipo deja una línea `info` con tipo, equipo y resultado, y cada orden su petición y su respuesta saneadas (H-SITIO-13, 14)— o el fichero de `--capturar` que lo muestre. **Un FALLA sin evidencia cruda no se puede corregir desde aquí.**
    **Consentimiento:** la única constancia es la casilla del formulario, «Declaro que <nombre del visitante> me autorizó a usar su foto para su ingreso al conjunto» (decisión final del cliente, [ADR-032](../decisiones/ADR-032-consentimiento-declarado-por-quien-registra.md), enmienda). No hay enlace ni confirmación presencial.

12. **Limpieza de datos de prueba:**
    1. levante los vetos de prueba;
    2. revoque los consentimientos de prueba y compruebe con el `Count` de la biblioteca que la plantilla salió de la terminal y, si recibe plantillas, del videoportero.
13. **Reversión, equipo por equipo, contra la captura de `antes/`:**

    1. para cada equipo, recorra su tabla de cambios (§8.2 cámara, §8.3 terminal, §8.4 videoportero) y devuelva cada casilla al valor que muestra su fichero de `antes/<equipo>/` —`…entranceParam…`, `…triggers-vehicledetection…` y `…httpHosts…` en la cámara; `…AcsCfg…` en la terminal; `…TwoWayAudio…` en el videoportero—;
    2. capture el resultado: `node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --sin-accionar --capturar=$HOME/ncr-sitio/despues`;
    3. compare, equipo por equipo: `diff -r $HOME/ncr-sitio/antes/camara $HOME/ncr-sitio/despues/camara` (y `terminal`, `videoportero`). Sólo pueden cambiar la hora del equipo y los ficheros de la carga de prueba (llevan un identificador nuevo en cada corrida). **Cualquier otra diferencia es una casilla sin revertir**: vuelva al punto 1 con ese equipo. Si los números de los ficheros no casan (el guion preguntó otra cosa porque el equipo contestó distinto), compare por el nombre de la ruta, que va en el nombre del fichero;
    4. si una casilla no puede volver a su valor previo (p. ej. la cámara debe quedarse sin decidir por su cuenta), anótelo en la hoja como decisión, no como olvido.

14. **Guarde, fuera del repositorio,** la hoja, los dos informes, `api.log` y las tres carpetas de captura. Eliden host y usuario, pero son respuestas de equipos reales: **no se versionan**.

---

## 0 · Procedencia de lo que hay aquí abajo · **léalo primero**

**No pude verificar los endpoints contra la documentación oficial.** El entorno
donde trabajo bloquea `hikvision.com`, `tpp.hikvision.com` y
`hikvisioneurope.com` en la política de red de salida: la conexión se corta con
un `403` en el túnel del proxy, no es un fallo transitorio. Usted sí tiene el
portal; yo no.

Así que esta guía **no le pide que se fíe de mis rutas**. Está construida al
revés: **el equipo es la autoridad**. El paso 3 hace que cada aparato enumere
lo que soporta, y usted anota lo que responde. Toda ruta que aparece abajo lleva
una marca de procedencia:

| Marca | Significado                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------- |
| **D** | La **descubre el equipo** en el paso 3. Es la única fuente que no puede estar desactualizada.     |
| **W** | Documentada en el wiki ISAPI oficial, en la sección que se nombra. **Confírmela en su portal.**   |
| **F** | Vista en material de terceros o en otra familia. **No la use a ciegas**: confírmela o descártela. |

Las de nivel **F** están marcadas una a una. Si una de ellas responde `404` o
`501`, no es un defecto: es la respuesta a la pregunta.

**Páginas concretas que conviene abrir en su portal antes de empezar** (son las
que cubren estos tres aparatos; los nombres son los del índice del wiki):

- Descarga **ISAPI & OTAP Developer Guide** — índice general.
- Sección **ANPR** del wiki ISAPI: páginas `XML_EventNotificationAlert_ANPRMsg`
  y `/ISAPI/System/IO/outputs/<ID>/trigger`.
- Sección **Access Control on Person**: páginas `XML_RemoteControlDoor`,
  `XML_Cap_RemoteControlDoor` y `/ISAPI/AccessControl/RemoteControl/door/capabilities`.
- Guías TPP: **«Fast guide for ANPR of TCG camera via ISAPI»** —es la familia
  TCG, la de su cámara— y **«How to get events by ISAPI listening mode»**.

---

## 0.quater · Los dos contratos de evento · dicho por el usuario el 18/09/2026

**Procedencia, otra vez lo primero.** Esta sección recoge lo que el usuario
reportó de la validación en sitio. **No hay captura pegada en el repositorio
todavía**, y por eso lo que aquí se afirma es la _forma_ del contrato —quién
inicia la conexión, qué transporte, qué campo gobierna—, nunca un cuerpo
literal. Pegar las capturas es el primer paso de la ETAPA 15; hasta entonces,
cualquier ejemplo de payload que vea en el código está marcado como inventado.

### Son DOS contratos, no uno

| Equipo           | Quién inicia la conexión | Transporte                    | Formato  |
| ---------------- | ------------------------ | ----------------------------- | -------- |
| **Cámara ANPR**  | **El equipo**            | POST al _Alarm Server_        | **XML**  |
| **Videoportero** | **Nuestro sistema**      | GET sostenido a `alertStream` | **JSON** |

No es una diferencia estética: son **direcciones de conexión opuestas**, y por
tanto dos adaptadores distintos en la ETAPA 15. La cámara _empuja_ —de ahí que
el Alarm Server viva en la capa de presentación y necesite firma (RNF-03), que
es la única cosa que acredita a un emisor sin sesión—. El videoportero **no
empuja**: hay que ir a buscarlo, mantener la conexión abierta y reconectar, que
es trabajo de infraestructura y tiene otros modos de fallo.

Un diseño que asumiera «un solo contrato de evento» habría que rehacerlo entero
al conectar el segundo equipo.

### `alertStream` vuelca el HISTORIAL antes del tiempo real

Al abrir la conexión, el videoportero suelta lo que ya tenía guardado, marcado
con **`currentEvent: false`**, y solo después empieza a emitir lo que ocurre.

**Consecuencia si se ignora, y es grave:** el adaptador procesaría como «está
llamando ahora mismo» cada timbrazo de las últimas semanas. Eso son alertas al
operador de central por visitas que ya pasaron, residentes avisados de gente
que vino hace quince días, y **eventos falsos en una tabla append-only**: por
ADR-05 no se pueden borrar ni siendo dueño de la tabla. Un error de arranque
quedaría en la auditoría para siempre.

La regla, implementada y probada desde la ETAPA 11-A en
`packages/providers/src/hikvision/contratos-de-evento.ts`: **un bloque sin
`currentEvent: true` es historial**. Sin el campo también, que es la dirección
segura —callar un timbre cuesta menos que escribir un evento irreversible—. Y
el adaptador **cuenta** cuántos descartó, porque esa cifra es lo que distingue
«el videoportero está mudo» de «volcó cuatrocientos y los tiramos todos».

### TwoWayAudio existe, con G.711 µ-law, y está **deshabilitado**

El canal está presente en el equipo y el códec es G.711 µ-law, pero el canal
viene con `enabled: false`.

**Lo que significa para ADR-01:** la decisión no se reabre —la capacidad está
ahí— pero **habilitar el canal es un paso de puesta en marcha**, con nombre y
dueño, no un detalle que el adaptador resuelva por su cuenta. Y hasta que
alguien lo habilite y se mida, **KPI-33 (audio y video < 2 s) no tiene cifra**:
el proveedor simulado no produce una que signifique nada, y publicarla sería
peor que no tenerla (misma decisión que en la ETAPA 10).

### Lo que falta para cerrar esta sección

1. Pegar la **captura real** del XML del Alarm Server, con sus etiquetas tal
   como las emite el firmware de su cámara.
2. Pegar la **captura real** de dos bloques del `alertStream`: uno del volcado
   histórico y uno en vivo.
3. Anotar el **modelo y firmware** del videoportero, como se hizo con la
   barrera en §0.ter.

Con esas tres cosas, los analizadores de `contratos-de-evento.ts` se ajustan en
una tarde y el resto del camino ya está probado.

---

## 0.ter · Barrera vehicular · medido el 15/09/2026 · **manda sobre lo anterior**

**Procedencia, y es lo primero.** Nada de esta sección viene de documentación
del fabricante. La ruta y el cuerpo se **capturaron del JavaScript de la propia
interfaz del equipo**, con el panel de red del navegador, y se reprodujeron
después con una petición manual. Equipo `DS-TCG405-E`, firmware
`V5.4.0 build 250425`. Es la única ruta verificada y la única que el adaptador
usa; **no se deduce ninguna otra por analogía** — esa suposición costó dos
intentos fallidos ese mismo día.

| Hecho              | Medido                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------ |
| Módulo             | `Parking`. **No** `Traffic` ni `System/IO`: los dos se probaron y contestaron `notSupport` |
| Operación          | `PUT` sobre el canal de barrera, con un cuerpo XML de un solo campo de modo                |
| Modos              | abrir · cerrar · bloquear · desbloquear                                                    |
| Respuesta correcta | `statusCode 1` con `statusString OK`                                                       |
| Autenticación      | Digest **MD5**                                                                             |
| Transporte         | HTTP. **No HTTPS**                                                                         |

### Los tres hallazgos que determinan el diseño

**H-1 · La respuesta correcta no prueba que la barrera se movió.** Observado, no
supuesto: con el equipo en estado bloqueado, la orden de abrir responde
`statusCode 1` **y el relé no actúa**. Una respuesta afirmativa significa «orden
aceptada» y nunca «paso franqueado».

**H-2 · No hay señal de posición.** Las tres entradas de estado de la barrera
están en `Ninguno`, y la propia interfaz del equipo lo advierte. **Hoy el
sistema no puede demostrar que una puerta se abrió.** Es cableado, no software:
ningún cambio de código lo resuelve.

**H-3 · Bloquear y desbloquear son estado persistente, no pulso.** Con la
barrera bloqueada, una placa autorizada **no abre**. El bloqueo manda sobre la
decisión por vehículo, y por eso no es una variante de la apertura manual sino
otra operación, con otros roles.

> **Consecuencia directa en el código.** El resultado de una orden tiene tres
> estados —`aceptada`, `rechazada`, `inalcanzable`— y **ninguno es «abierta»**.
> `aceptada` lleva marcado por el tipo que el paso no es observable. Añadir un
> estado que afirme la apertura exige antes la señal de H-2.

### Estado en que quedó el equipo

- Se pasó de **control por cámara** a **control por plataforma**. La dirección
  de armado previa era la propia cámara; ahora la decisión la toma Next Control
  y el equipo ejecuta, que es el principio rector del producto.
- `isSupportLPAuditDataDelete` es **`true`**: el registro de lecturas del equipo
  **se puede borrar por API**. De ahí una consecuencia que conviene tener
  escrita: **el equipo no es fuente de verdad auditable**. La trazabilidad vive
  en `eventos`, que es append-only por permisos y por disparador (ADR-05); lo
  que el aparato guarde es una conveniencia operativa, no evidencia.

### Lo que queda pendiente, y no se ha dado por bueno

| Pendiente                             | Estado                                                                                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Consulta de estado de la barrera**  | El `GET` al estado devuelve `notSupport`. La interfaz del equipo lo consulta por otro método, **aún sin capturar**. Hasta capturarlo, el sistema no puede preguntar en qué estado está |
| **Señal de posición**                 | Sin cablear (H-2). Mientras siga así, ninguna afirmación de «se abrió» es sostenible                                                                                                   |
| **Si `lock` sobrevive a un reinicio** | **Sin comprobar.** Importa: si no sobreviviera, un corte de luz desbloquearía el acceso sin que nadie lo sepa                                                                          |

---

## 1 · Antes de tocar nada

### 1.1 · Lo que NO debe hacer

Lo que sigue no es prudencia genérica: es la lista de acciones que dejan un
equipo en un estado del que no se vuelve sin tenerlo en las manos, o que rompen
un requisito del proyecto.

| No haga esto                                                      | Por qué                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cambiar la contraseña de administrador**                        | Si hay una plataforma o un instalador que ya conoce la actual, la rompe. Y si se pierde, en varios modelos la recuperación exige el fabricante.                                                                                        |
| **Restaurar a valores de fábrica / desactivar el equipo**         | Pierde la activación, la red y toda la configuración del instalador. Es la acción irreversible por excelencia.                                                                                                                         |
| **Actualizar firmware**                                           | Mueve rutas ISAPI —es justo lo que estamos midiendo— y puede degradar un equipo en producción.                                                                                                                                         |
| **Cambiar IP, máscara, puerta de enlace o pasar a DHCP**          | Se queda sin el equipo en mitad de la sesión, conectado por esa misma red.                                                                                                                                                             |
| **Reintentar la autenticación en bucle**                          | El bloqueo por intentos fallidos es una función de seguridad del propio equipo: unos pocos fallos seguidos **bloquean la cuenta durante minutos**. Un guion con reintentos le deja fuera. Escriba la contraseña a mano la primera vez. |
| **Usar `alwaysOpen` en cualquier orden de puerta**                | Deja la puerta desbloqueada **hasta que alguien la cierre a mano**. Para probar se usa `open`, que es momentáneo.                                                                                                                      |
| **Escribir en la lista blanca o negra de la cámara**              | Es la configuración que decide si la cámara abre sola. Se lee; no se toca.                                                                                                                                                             |
| **Inscribir el rostro de un tercero en el terminal**              | Es tratamiento de dato biométrico bajo la **Ley 1581 de 2012**: exige consentimiento previo, expreso e informado del titular (RN-09, RN-10). Para validar, use su propio rostro y bórrelo al terminar, o no inscriba ninguno.          |
| **Modificar el cableado del relé o el tipo de cerradura (NA/NC)** | Un relé mal configurado con cerradura de seguridad puede dejar una puerta abierta o una talanquera bloqueada.                                                                                                                          |

### 1.2 · La red de seguridad, antes del primer comando

1. **Exporte la configuración de cada equipo** desde su interfaz web
   (`Configuración → Sistema → Mantenimiento → Exportar archivo de
configuración`). Guarde los tres archivos fuera del equipo y anote la fecha.
   Es lo único que permite volver atrás si algo se descoloca.
   > Advertencia: en varios modelos el archivo va cifrado y **solo se puede
   > importar en el mismo equipo y con la misma versión de firmware**. Sirve
   > como red de seguridad para _este_ aparato, no como copia portable.
2. **Anote el estado de partida** de lo que vaya a tocar —el paso 4.2 hace una
   escritura y exige haber guardado antes lo que había—.
3. **Trabaje sobre una puerta o talanquera sin nadie detrás**, o con alguien
   presente. El paso 5 abre de verdad.

### 1.3 · Variables de la sesión

Defina esto en su terminal y **no lo pegue en ningún informe, ni me lo mande a
mí**. Las contraseñas no viajan a mi entorno; las rutas de abajo funcionan igual
con marcadores.

```
export LPR=192.0.2.10          # cámara ANPR
export FACIAL=192.0.2.11       # terminal facial
export PORTERO=192.0.2.12      # videoportero
export USUARIO=operador        # la cuenta que ya existe; no cree ninguna hoy
read -rs CLAVE                 # se teclea; no queda en el historial
export CLAVE
```

`192.0.2.x` es el rango de documentación de la RFC 5737: sustitúyalo por el
suyo. **Ninguna IP real entra en el repositorio** (§2.7.1, KPI-11).

---

## 2 · Autenticación Digest contra cada equipo

### 2.1 · Compruebe primero que es Digest y no Basic

Esto no es ceremonia: es la comprobación de que el control existe. Se pide sin
credenciales y se mira la cabecera del rechazo.

```
curl -sS -i -o /dev/null -D - "http://$LPR/ISAPI/System/deviceInfo"
```

**Salida esperada:**

```
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Digest qop="auth", realm="IP Camera(XXXXX)", nonce="...", stale="FALSE"
```

Lo que importa es la palabra `Digest`. Si dijera `Basic`, la contraseña viajaría
recuperable en cada petición y sería un hallazgo de seguridad que anotar.

**Si responde `400` o no responde:** pruebe HTTPS, que en firmware reciente
suele venir forzado:

```
curl -sS -i -k -o /dev/null -D - "https://$LPR/ISAPI/System/deviceInfo"
```

Anote **por qué esquema y puerto responde cada equipo**. No es un detalle de
hoy: decide cómo se configura el adaptador de la ETAPA 15 y si hace falta
confiar un certificado autofirmado.

### 2.2 · Autentique y lea la identidad del equipo · **W**

`GET /ISAPI/System/deviceInfo` — repita para `$FACIAL` y `$PORTERO`.

```
curl -sS --digest -u "$USUARIO:$CLAVE" "http://$LPR/ISAPI/System/deviceInfo"
```

**Salida esperada** — XML con la envoltura `DeviceInfo`:

```
<?xml version="1.0" encoding="UTF-8"?>
<DeviceInfo version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <deviceName>...</deviceName>
  <deviceID>...</deviceID>
  <model>DS-TCG405-E</model>
  <serialNumber>...</serialNumber>
  <macAddress>...</macAddress>
  <firmwareVersion>V5.x.x</firmwareVersion>
  <firmwareReleasedDate>...</firmwareReleasedDate>
</DeviceInfo>
```

**Lo que hay que mirar, y no es el `200`:**

- `model` **tiene que coincidir con la etiqueta**. Si el terminal dice
  `DS-K1T344MBFWX-E1` y usted esperaba `-E`, la guía ISAPI aplicable es la de la
  serie que diga el equipo, no la que teníamos anotada.
- `firmwareVersion` y `firmwareReleasedDate`: **el firmware mueve rutas**. Todo
  lo que descubra hoy vale para _esta_ versión, y así hay que anotarlo.

**Añada `?format=json` a la misma ruta** y anote si responde JSON o lo ignora.
Decide si el adaptador de la ETAPA 15 analiza XML o JSON, y no es igual en todas
las familias.

---

## 3 · Descubrimiento de capacidades · **el paso que sustituye a la analogía**

La idea: no dar por buena ninguna ruta. Se pregunta al equipo y se anota el
código de respuesta. **Un `404` o un `501` es información**, no un fallo.

### 3.1 · Sondeo de rutas, equipo por equipo

Recorra esta lista contra cada aparato y **anote el código de cada una**. Con
`-o` se guarda el cuerpo de las que responden `200`: ese cuerpo es el contrato
real de este firmware.

```
mkdir -p ~/validacion-hik/lpr && cd ~/validacion-hik/lpr
for r in \
  /ISAPI/System/capabilities \
  /ISAPI/System/deviceInfo/capabilities \
  /ISAPI/System/IO/capabilities \
  /ISAPI/System/IO/outputs \
  /ISAPI/Event/capabilities \
  /ISAPI/Event/notification/httpHosts \
  /ISAPI/Event/triggers \
  /ISAPI/Streaming/channels \
  /ISAPI/Security/users \
  /ISAPI/System/Network/interfaces \
  /ISAPI/System/time ; do
  codigo=$(curl -sS --digest -u "$USUARIO:$CLAVE" -o "$(echo $r | tr / _).xml" \
           -w '%{http_code}' "http://$LPR$r")
  printf '%-52s %s\n' "$r" "$codigo"
done
```

**Salida esperada** — una tabla como ésta, cuyos valores concretos son
justamente lo que hay que anotar:

```
/ISAPI/System/capabilities                           200
/ISAPI/System/deviceInfo/capabilities                200
/ISAPI/System/IO/capabilities                        200
/ISAPI/System/IO/outputs                             200
/ISAPI/Event/capabilities                            200
/ISAPI/Event/notification/httpHosts                  200
/ISAPI/Event/triggers                                200
/ISAPI/Streaming/channels                            200
/ISAPI/Security/users                                200
/ISAPI/System/Network/interfaces                     200
/ISAPI/System/time                                   200
```

Un `403` con credenciales correctas significa que **esa cuenta no tiene ese
permiso**: anótelo, porque la ETAPA 15 necesitará una cuenta de servicio con
privilegio mínimo y esto dice cuál es el mínimo.

### 3.2 · Rutas específicas por familia

**Cámara LPR (`$LPR`).** Añada al bucle anterior:

```
/ISAPI/Traffic/capabilities                    (F · confirmar en la sección ANPR del wiki)
/ISAPI/Traffic/channels/1/licensePlateAudit    (F)
/ISAPI/ITC/capabilities                        (F)
```

**Terminal facial (`$FACIAL`).**

```
/ISAPI/AccessControl/capabilities                      (W · sección Access Control on Person)
/ISAPI/AccessControl/RemoteControl/door/capabilities   (W · página homónima del wiki)
/ISAPI/AccessControl/UserInfo/capabilities             (W)
/ISAPI/AccessControl/Door/param/1                      (F)
/ISAPI/Intelligent/FDLib/capabilities                  (F · biblioteca de rostros)
```

**Videoportero (`$PORTERO`).**

```
/ISAPI/System/TwoWayAudio/channels                     (W · canales de audio bidireccional)
/ISAPI/VideoIntercom/capabilities                      (F)
/ISAPI/AccessControl/RemoteControl/door/capabilities   (F en esta familia · confirmar)
/ISAPI/Streaming/channels                              (D)
```

**Lo que hay que leer en `…/RemoteControl/door/capabilities`** es la lista de
`cmd` que el equipo admite. El wiki documenta `open`, `close`, `alwaysOpen`,
`alwaysClose` y dos de ascensor; **lo que vale es lo que responda su equipo**, y
de esa lista solo vamos a usar `open`.

### 3.3 · Vídeo

Anote la URL RTSP que funciona en cada equipo con cámara —la cámara LPR y el
videoportero— probándola con un reproductor. La ETAPA 15 la necesita para el
puente de vídeo hacia el navegador, y el formato del canal varía entre familias.

---

## 4 · El evento de placa, y la pregunta que decide todo

### 4.1 · Primero: ¿decide la cámara por su cuenta? · **hallazgo de bloqueo**

**Esto es lo más importante de la jornada.** La ficha técnica de esta cámara
declara control de talanquera **con lista blanca en modo autónomo**: la cámara
_puede_ accionar el relé por sí misma al reconocer una placa, sin preguntar a
nadie. Que la capacidad exista no es el problema; el problema sería que esté
**activa**.

Si lo está, el principio rector del proyecto se cae —«Next Control decide, el
hardware ejecuta»—, el motor de reglas queda decorativo y se pierde la
trazabilidad: habría aperturas sin evento, sin regla aplicada y sin actor.

**Compruébelo sin escribir nada.** En la interfaz web de la cámara, revise y
**anote tal cual** lo que diga cada una de estas pantallas —los rótulos varían
con el firmware, la sustancia no—:

1. Lista blanca / lista negra: cuántas entradas tiene. **Cero entradas no basta
   como respuesta**: lo que importa es si el modo está habilitado.
2. La configuración de salida de alarma o relé asociada al reconocimiento de
   placa: si hay una acción vinculada del tipo «abrir talanquera al coincidir».
3. El modo de trabajo de la talanquera (`normalmente abierta`, control por
   lista, control por plataforma).

**Y compruébelo por ejercicio, que es lo que vale.** Con un vehículo cuya placa
esté en la lista blanca —o con una foto de placa a la distancia de lectura—:
lea el estado del relé, provoque la lectura, vuelva a leerlo.

```
curl -sS --digest -u "$USUARIO:$CLAVE" "http://$LPR/ISAPI/System/IO/outputs/1/status"
```

**Salida esperada si la cámara NO decide** — el estado no cambia al reconocer:

```
<IOPortStatus version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <ioPortNo>1</ioPortNo>
  <ioState>inactive</ioState>
</IOPortStatus>
```

**Si el relé conmuta solo, o la talanquera sube sin que nadie lo ordene:**
deténgase y anótelo como **hallazgo de bloqueo**. No lo corrija hoy a ciegas: es
una decisión de configuración que hay que tomar con el instalador y dejar
documentada, y cambiarla con la talanquera en servicio puede dejar una entrada
sin funcionar.

### 4.2 · Recibir el evento con su fotografía

**Opción A — sin escribir nada en la cámara.** Muchos firmware exponen un flujo
de alertas por larga espera. Es la opción preferible: no cambia configuración.
**(F · confirme la ruta en la sección de eventos de su portal.)**

```
curl -sS --digest -u "$USUARIO:$CLAVE" -N "http://$LPR/ISAPI/Event/notification/alertStream"
```

**Salida esperada:** un flujo `multipart/mixed` que va soltando bloques XML
`<EventNotificationAlert>` a medida que ocurren. Al pasar un vehículo debe
aparecer uno con `<eventType>ANPR</eventType>`.

Si responde `404`, esta cámara no lo ofrece y hay que ir a la opción B.

> **Lo que la opción A no da.** El flujo de alertas suele traer el XML **sin las
> fotografías**. Para comprobar que llega la imagen —que es lo que el portero
> ve— hace falta la opción B.

**Opción B — servidor de escucha.** La cámara envía un `POST` a una dirección
suya. Exige **escribir** la configuración en la cámara, así que:

1. **Guarde lo que hay antes de tocarlo.** Sin esto no hay vuelta atrás:

   ```
   curl -sS --digest -u "$USUARIO:$CLAVE" \
     "http://$LPR/ISAPI/Event/notification/httpHosts" > httpHosts.original.xml
   cat httpHosts.original.xml
   ```

2. **Levante el receptor** en su equipo, en la misma red que la cámara. Es un
   guion de usar y tirar; no entra al repositorio. Guarda cada parte que reciba:

   ```
   cd ~/validacion-hik && node -e '
   const http=require("http"),fs=require("fs");let n=0;
   http.createServer((req,res)=>{const partes=[];
     req.on("data",d=>partes.push(d));
     req.on("end",()=>{const cuerpo=Buffer.concat(partes);
       const f=`evento-${++n}.bin`;fs.writeFileSync(f,cuerpo);
       console.log(req.method,req.url,req.headers["content-type"],cuerpo.length,"bytes ->",f);
       res.writeHead(200);res.end();});
   }).listen(9099,"0.0.0.0",()=>console.log("escuchando en 9099"));'
   ```

3. **Apunte la cámara a ese receptor.** Lo más seguro es hacerlo **desde la
   interfaz web** (`Red → Configuración avanzada → Notificación HTTP` o
   `Alarm Server`, según firmware) y no por ISAPI: la pantalla valida lo que
   escribe y no arriesga a dejar el bloque de configuración a medias. Si lo hace
   por ISAPI, es `PUT /ISAPI/Event/notification/httpHosts/1` **(W)**, con el
   mismo XML que acaba de guardar y solo la dirección, el puerto y la URL
   cambiados.

4. **Habilite el envío de ANPR** en la detección de la cámara, y provoque una
   lectura.

**Salida esperada en el receptor:**

```
POST /  multipart/form-data; boundary=--MIME_boundary  248713 bytes -> evento-1.bin
```

Y dentro del archivo, tres partes: un XML —suele llamarse `anpr.xml`— y dos
imágenes, la panorámica de la detección y el recorte de la placa. El XML
contiene una envoltura `EventNotificationAlert` con `eventType` igual a `ANPR` y
un bloque `ANPR` con la matrícula. **(W · página `XML_EventNotificationAlert_ANPRMsg`.)**

**Lo que hay que anotar del evento, y es literal, no de memoria:**

- Guarde `evento-1.bin` **entero**. Ese archivo es la especificación.
- El `Content-Type` exacto y el delimitador de partes.
- El nombre de cada parte y su tipo.
- **Los nombres exactos de los elementos XML**: cómo se llama el que trae la
  matrícula, el de la confianza, el de la dirección de marcha, el del canal, el
  de la fecha y hora, y si trae algún identificador propio del evento —que es lo
  que el proyecto usará como **clave de idempotencia** (RN-17, CA-22)—.
- Si la hora viene en hora local o UTC, y con qué desfase.

5. **Restaure** la configuración original de notificación al terminar, con el
   XML del punto 1.

---

## 5 · Accionar un relé y medir la latencia

> Con una cerradura o una talanquera conectada, **esto abre de verdad**.

### 5.1 · Terminal facial y videoportero · **W**

> **Corregido por el anexo de sitio (27/09/2026). No use `curl` para esto.**
> La receta que había aquí reproducía los dos defectos de la visita: el cuerpo
> mínimo `<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>` recibe «OK»
> y la puerta **no se mueve** (H-SITIO-13), y `curl --digest` sondea el
> desafío con el cuerpo **vacío**, que la terminal rechaza con
> `400 badXmlContent` antes de autenticar (H-SITIO-15).

Use el guion, que abre como abrió en sitio y mide la latencia:

```
node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --abrir
```

Lo que envía, para leerlo en su salida: `PUT /ISAPI/AccessControl/RemoteControl/door/1`,
Content-Type `application/x-www-form-urlencoded; charset=UTF-8` y el cuerpo
`<RemoteControlDoor xmlns="http://www.isapi.org/ver20/XMLSchema" version="2.0"><cmd>open</cmd></RemoteControlDoor>`
(el videoportero, con `<?xml version='1.0' encoding='utf-8'?>` delante, como
su interfaz), en la petición del `401` y en la autenticada. Es momentáneo.
**Nunca `alwaysOpen`.**

**Salida esperada** (por equipo; host elidido):

```
── Terminal facial · te…ne:80 · puerta 1 (--abrir)
   PUT /ISAPI/AccessControl/RemoteControl/door/1 · application/x-www-form-urlencoded; charset=UTF-8 · sin credencial · cuerpo de 113 caracteres → HTTP 401
   PUT /ISAPI/AccessControl/RemoteControl/door/1 · application/x-www-form-urlencoded; charset=UTF-8 · con Digest · cuerpo de 113 caracteres → HTTP 200
   ✓ orden ACEPTADA: statusCode 1 · subStatusCode ok · 80 ms
   ¿Se movió la puerta de «Terminal facial»? Mírela y conteste s/n: s
   ✓ la puerta SE MOVIÓ: H-SITIO-13 verificado en este equipo
```

El guion hace la terminal y el videoportero. Si alguno responde `404`, esa familia usa otra ruta:
anótelo y búsquela en la sección de videoporteros de su portal — **es
exactamente el tipo de diferencia entre familias que esta jornada existe para
descubrir.**

### 5.2 · Cámara LPR · **W**

`PUT /ISAPI/System/IO/outputs/1/trigger`, con la envoltura `IOPortData` y
`outputState` en `high`.

```
printf '%s' '<IOPortData><outputState>high</outputState></IOPortData>' > rele.xml
curl -sS --digest -u "$USUARIO:$CLAVE" -X PUT \
  -H 'Content-Type: application/xml' --data-binary @rele.xml \
  -w '\nhttp=%{http_code} tiempo_total=%{time_total}s\n' \
  "http://$LPR/ISAPI/System/IO/outputs/1/trigger"
```

Compruebe con `…/outputs/1/status` que vuelve a `inactive` solo. Si se queda
en `active`, el relé está en modo sostenido y hay que anotarlo: una talanquera
que no vuelve a bajar es un incidente, no un detalle.

### 5.3 · Las dos latencias, que no son la misma

`time_total` mide **el viaje HTTP**, no el movimiento físico. KPI-13 exige
apertura en menos de 3 s y KPI-32 apertura remota en menos de 3 s, y los dos se
miden **hasta que la barrera se mueve**.

Anote las dos cifras por separado:

1. **HTTP** — la de `time_total`. Repita diez veces y quédese con la mediana y
   la peor.
2. **Extremo a extremo** — con cronómetro o, mejor, grabando en vídeo la pantalla
   y la barrera en el mismo encuadre y contando fotogramas. Una sola medición no
   sirve: haga cinco.

---

## 6 · Qué anotar de cada equipo

Una ficha por aparato. Esto es lo que la ETAPA 15 consumirá, y lo que evita
repetir la visita.

| Campo                                                          | Por qué hace falta                                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Modelo **de la etiqueta** y de `deviceInfo`                    | Si difieren, la guía ISAPI aplicable es otra                                                        |
| Número de serie                                                | Identidad del equipo en el registro de dispositivos                                                 |
| `firmwareVersion` + fecha de publicación                       | Todo lo demás de esta ficha vale **para esa versión**                                               |
| Esquema y puerto que responden (80 / 443 / otro)               | Decide la configuración del adaptador y si hay certificado autofirmado                              |
| Tabla completa de rutas sondeadas con su código                | El contrato real de este firmware                                                                   |
| Si `?format=json` funciona                                     | Decide si el adaptador analiza XML o JSON                                                           |
| Salidas de relé: cuántas y con qué números                     | El adaptador las direcciona por número                                                              |
| Puertas: cuántas y sus `cmd` admitidos                         | Solo se usará `open`, pero hay que saber qué ofrece                                                 |
| Canales de audio bidireccional, con códec y muestreo           | El puente de audio de la ETAPA 15 depende de eso, y del semidúplex                                  |
| URL RTSP que funciona                                          | Puente de vídeo hacia el navegador                                                                  |
| **El archivo del evento, entero**                              | Es la especificación del Alarm Server; una transcripción a mano pierde justo el detalle que importa |
| Nombres exactos de los elementos del evento                    | Placa, confianza, dirección, canal, fecha, identificador de idempotencia                            |
| Estado de la lista blanca y del control autónomo de talanquera | La respuesta a «¿decide la cámara?»                                                                 |
| Hora del equipo y si tiene NTP                                 | Un reloj desfasado desordena la reconciliación del Edge (ETAPA 12)                                  |
| Nombre de la cuenta usada y qué rutas le dio `403`             | Define el privilegio mínimo de la cuenta de servicio                                                |
| **Nunca**: la contraseña                                       | Ni aquí, ni en el repositorio, ni en un informe (§2.7.1, RN-21)                                     |

---

## 7 · Al terminar

1. Restaure la configuración de notificación de la cámara (paso 4.2.5).
2. Borre el rostro que haya inscrito para probar (paso 1.1).
3. Compruebe que ninguna puerta quedó en modo permanente.
4. Guarde las tres fichas y el archivo del evento donde el proyecto pueda
   leerlos —**sin contraseñas ni IPs reales en el repositorio**—.
5. Si apareció el hallazgo de bloqueo del paso 4.1, dígalo antes que nada: cambia
   lo que hay que construir.

---

## 8 · ETAPA 15 · Lo que ya está construido, y lo que le toca a usted

> **Añadido el 22/09/2026, al cerrar la ETAPA 15.** Lo que sigue **no se ejecutó
> contra ningún equipo**: se escribió sin tocar hardware, a propósito, y esta
> sección es la lista de lo que falta comprobar. El adaptador de la barrera es
> la única pieza con una ruta **VERIFICADA**; todo lo demás está **DOCUMENTADO,
> NO VERIFICADO** y puede fallar contra su aparato. Que falle está previsto.

### 8.1 · Un solo comando, antes de tocar nada

```bash
pnpm --filter @ncr/providers build
node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs
node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --sin-accionar
node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --con-audio
node scripts/puesta-en-marcha-equipos.mjs --simulado --con-audio   # ensayo, sin aparatos
node scripts/puesta-en-marcha-equipos.mjs --simulado --hoja=./hoja.md --informe=./informe.md
```

Sondea los tres equipos, **confirma o desmiente cada ruta documentada**, acciona
lo que abre midiendo la latencia —barrera y puerta de la terminal contra
**KPI-13**, puerta del videoportero contra **KPI-32**— y escribe un informe. Con
`--sin-accionar` no mueve nada, que es como conviene ejecutarlo la primera vez
si hay alguien delante de la barrera.

**Desde la ETAPA 15-D el guion imprime además la FICHA de cada equipo**, con el
mismo diagnóstico que usa la consola y por familia: la cámara, quién decide por
las tres vías; la terminal, si espera el veredicto y si su biblioteca cabe; el
videoportero, si abre desde la central y si tiene canal de audio. Un `✗ BLOQUEO`
en la ficha es un problema del guion (salida 1), no una nota al pie.

Con `--con-audio` abre y cierra el canal de audio del videoportero y mide cuánto
tarda en abrirse. **Es un proxy de KPI-33** (< 2 s extremo a extremo): el extremo
a extremo exige el navegador del operador y NO se mide aquí; el informe lo dice
con esas palabras. Con `--simulado` no habla con ningún aparato: recorre el
mismo guion contra los tres equipos simulados, y el informe sale rotulado
SIMULADO.

**Desde la ETAPA 15-E (A8) el guion escribe además la HOJA DE RESULTADOS**:
la plantilla de los **dieciséis escenarios de aceptación** —5 de la cámara LPR,
5 de la terminal facial y 6 del videoportero— con las columnas _esperado ·
obtenido · motivo en consola · latencia · evento en `/eventos` · evidencia ·
veredicto_. Sale junto al informe (`--hoja=<ruta>`; por omisión en el
directorio temporal) con lo que el guion ya sabe rellenado: fecha, modo, qué
familias estaban declaradas y las latencias que midió, que son **cotas
inferiores** del tramo API → equipo. Lo demás se rellena delante del aparato,
escenario por escenario, y **sin la hoja completa la ETAPA 15 no se cierra**
(`BE-02`). El procedimiento de cada escenario está en
[`INTEGRACION_HIKVISION.md`](INTEGRACION_HIKVISION.md) §9.

| Salida         | Qué significa                                                                          |
| -------------- | -------------------------------------------------------------------------------------- |
| `confirmada`   | La ruta existe en este firmware. Ascienda su procedencia en el catálogo                |
| `desmentida`   | `notSupport` o `404`. **Capture la buena del equipo**; no pruebe otra por parecido     |
| `inalcanzable` | Ni IP, ni puerto, ni equipo. Es de red, no de código                                   |
| `credenciales` | Usuario o contraseña. **No insista**: el equipo bloquea la cuenta a los pocos intentos |

El informe **elide el host y el usuario**, así que se puede adjuntar. Las rutas
que dan de alta o suprimen plantillas y las del canal de audio **no se sondean**:
dejan rastro en el aparato o se lo quitan a quien esté hablando, y se prueban a
mano con esta guía delante.

Las variables van en su `.env` local y **nunca** en el repositorio:

```
BARRERA_HOST= BARRERA_PUERTO= BARRERA_USUARIO= BARRERA_CLAVE= BARRERA_CANAL=
TERMINAL_HOST= TERMINAL_PUERTO= TERMINAL_USUARIO= TERMINAL_CLAVE= TERMINAL_CANAL=
VIDEOPORTERO_HOST= VIDEOPORTERO_PUERTO= VIDEOPORTERO_USUARIO= VIDEOPORTERO_CLAVE= VIDEOPORTERO_CANAL=
```

`*_CANAL` es el carril de la barrera, la puerta de la terminal o el canal de
audio del videoportero; por omisión, 1.

### 8.2 · Cámara LPR · **que deje de decidir**

Es el cambio que sostiene el principio rector entero. Mientras la cámara abra
por su cuenta, el motor de reglas es decorativo y el histórico está incompleto.

**Anote el estado PREVIO de cada casilla antes de tocarla.** Sin eso no hay
vuelta atrás, y la vuelta atrás hace falta si algo sale mal con vehículos
esperando.

| #   | Qué hacer                                                                         | Estado previo (anótelo) |
| --- | --------------------------------------------------------------------------------- | ----------------------- |
| 1   | **Desactivar** la apertura por lista local de vehículos (lista blanca del equipo) |                         |
| 2   | **Desactivar** todo enlace que dispare la barrera desde el propio equipo          |                         |
| 3   | **Activar** la subida del evento por HTTP al «servidor de alarma»                 |                         |
| 4   | Destino: `http://<IP-de-su-Mac>:<puerto>/alarm-server/<secreto>`                  |                         |
| 5   | Formato del envío: multipart con XML, imagen de la escena y recorte de la placa   |                         |

El secreto se genera con `openssl rand -hex 32` y se declara en
`ALARM_SERVER_EQUIPOS` del `.env`, con la forma
`copropiedad|dispositivo|secreto|ip-de-la-cámara`. Sin equipos declarados, ese
extremo **rechaza todo**, que es la dirección segura.

> **H-15-1, y no se calla.** Esa acreditación —secreto largo más origen— es **más
> débil** que la firma HMAC que exige `POST /ingesta/eventos`: no da integridad
> del cuerpo, ni anti-repetición, ni resiste a quien vea la URL. La cámara no
> puede firmar y no hay ajuste que lo cambie. **El endurecimiento real es la VLAN
> de equipos**, no el código. El hallazgo completo, con su orden de prioridad,
> está escrito junto al código que lo aplica:
> `apps/api/src/comun/equipos-de-alarm-server.ts`.

**Verificación de que quedó en modo evento:** pase un vehículo con placa **no
autorizada**. La cámara tiene que **reportar y NO abrir**. Si abre, es
**hallazgo de bloqueo** (§4.1): pare y dígalo antes de seguir.

### 8.3 · Terminal facial · **la pregunta que decide la arquitectura**

Hoy la terminal **abre por su cuenta**. El adaptador está escrito para los dos
modos y el modo **se declara, no se deduce**; lo que hay que averiguar aquí es
cuál se puede usar.

| Qué comprobar                                                                    | Dónde mirar                         |
| -------------------------------------------------------------------------------- | ----------------------------------- |
| Si el equipo admite **reconocer sin accionar el relé**                           | Capacidades de control de acceso    |
| Si existe un modo «sólo notificación» o el relé se puede dejar sin asignar       | Configuración de puerta y de relés  |
| Cuál de los **dos relés** que declara es la puerta                               | Prueba con `--sin-accionar` quitado |
| Si la supresión de una plantilla es **verificable** (no basta con que se acepte) | RN-11 lo exige                      |

**Con `reporta_y_espera`** —si el firmware lo permite— el equipo notifica,
nuestro motor decide y nosotros accionamos: principio rector cumplido.

**Con `decide_el_equipo`** gobernamos sólo **qué plantillas están cargadas**, y la
revocación se ejerce **retirando la plantilla**. Es más débil y hay que decirlo
así: entre que la vigencia vence y que la supresión llega, el equipo abre. Mida
esa ventana y anótela.

### 8.4 · Videoportero · **habilitar el canal de audio**

Está **deshabilitado en el equipo** —medido el 18/09/2026, junto con que lo
soporta con G.711 µ-law—. El adaptador está escrito y **no lo habilita**: un
adaptador que encendiera por su cuenta una vía de audio hacia la calle sería una
decisión de seguridad tomada por el código.

| #   | Qué hacer                                                         | Estado previo (anótelo) |
| --- | ----------------------------------------------------------------- | ----------------------- |
| 1   | **Habilitar** el canal de audio bidireccional en la configuración |                         |
| 2   | Anotar el **códec** y la frecuencia de muestreo que negocia       |                         |
| 3   | Comprobar si es **semiduplex** o duplex completo                  |                         |
| 4   | Medir la latencia extremo a extremo (KPI-33 · < 2 s)              |                         |
| 5   | Probar qué pasa si **dos operadores** lo piden a la vez           |                         |

Hasta que (2) y (3) estén medidos, el transporte del audio **lanza en vez de
devolver silencio**, y la consola sigue usando el simulado. Devolver silencio
haría que la consola diera por bueno un canal que nunca se ha abierto.

### 8.5 · Las dos pruebas del recorrido de placa

Con el superadministrador, desde la consola:

1. Dé de alta una placa contra una vivienda.
2. Pase ese vehículo. **La talanquera abre** y queda evento con la decisión.
3. Pase un vehículo **no dado de alta**. **NO abre**, y queda evento con su
   motivo tipado.
4. Mida desde que entra el POST hasta el accionamiento: **KPI-13 · < 3 s**.

El recorrido se puede ensayar **sin cámara** antes de que llegue el vehículo,
publicando el mismo sobre que ella publica:

```js
// node, con la API levantada
const { publicarLectura } = require('./packages/providers/dist/index.js');
await publicarLectura('http://localhost:3000/alarm-server/<secreto>', { placa: 'ABC123' });
```

Si eso abre la talanquera y la cámara real no, el problema está en la
configuración del equipo —§8.2—, no en el sistema. Es la única forma de separar
las dos cosas sin adivinar.

### 8.6 · Al terminar, revierta

Con los estados previos que anotó en §8.2 y §8.4. Y si apareció el hallazgo de
bloqueo de §8.2 —la cámara que abre sola y no se puede separar—, dígalo antes
que nada: cambia lo que hay que construir.

---

## 9 · Registrar el equipo en Next Control · **desde la consola, no con `psql`**

_Añadido en la ronda `consola-superadmin-equipos` (2026-09-23)._

Hasta esta ronda, dar de alta un equipo exigía escribir la fila a mano en la
base. Ya no: se hace desde **Dispositivos → + Agregar equipo**, y lo que pide es
exactamente lo que usted tiene delante del aparato.

### 9.1 · Lo que hay que tener resuelto ANTES de abrir el formulario

| Prerrequisito                                 | Por qué                                                                                                                                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IP fija en el equipo**                      | Este proyecto ya pagó el precio de no tenerla: la cámara **desapareció de su dirección entre dos sesiones**. Con IP por DHCP, el sistema deja de encontrarla al reiniciar el router.   |
| **Usuario de servicio con privilegio mínimo** | No el de fábrica y no el de administrador. Lo que Next Control necesita es leer eventos y accionar, no administrar el equipo.                                                          |
| **El servidor en la misma red que el equipo** | Quien tiene que alcanzar el aparato es el **servidor** de Next Control, no el navegador desde el que usted rellena el formulario. Si está fuera, la conexión pasa por el Edge Gateway. |
| **`ctrlMod = 1` en las cámaras LPR**          | Es quien decide si abre la cámara o la plataforma. Con `0` o `2` el alta lo rechaza y dice por qué: ver §4.                                                                            |

### 9.2 · Qué hace «Probar conexión», y qué significa cada respuesta

La prueba corre **en el servidor** y devuelve una de cuatro cosas. Ninguna es
genérica, porque cada una se resuelve de una manera distinta:

| Respuesta                         | Qué hacer                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Responde y acepta la credencial   | Nada. Se guardan el modelo y el firmware que informó el propio equipo.                                                            |
| **El equipo abre por su cuenta**  | `ctrlMod` ≠ 1. **No lo ponga en servicio así**: cámbielo en el panel del equipo. Con la cámara decidiendo, la traza se pierde.    |
| **Rechazó el usuario o la clave** | **NO reintente a ciegas.** Unos pocos fallos seguidos bloquean la cuenta en el equipo. Confirme la credencial en su panel.        |
| No hay respuesta de `host:puerto` | Revise red, IP y puerto. Puede guardar igualmente: queda **NO VERIFICADO** con ese motivo, y se comprueba cuando esté disponible. |

### 9.3 · La clave no vuelve a mostrarse

Se guarda cifrada con AES-256-GCM y llave derivada por copropiedad, y **la API
no la devuelve nunca**. La consecuencia práctica: para volver a probar la
conexión de un equipo ya registrado hay que escribirla otra vez. No es un fallo
de la pantalla — es lo que hace que un volcado de la base no entregue las
credenciales de los equipos (`H-15B-1` en `docs/seguridad/AUDITORIA.md`).

Editar un equipo **sin** escribir la clave significa «no la cambies», y en ese
caso el sistema **no prueba la conexión**: dice que no la probó en vez de
inventar un rechazo, porque un rechazo falso invita a reintentar.
