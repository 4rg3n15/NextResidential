# Entrega en sitio · el guion del día

> **ETAPA 15-L (J3).** El orden de la visita de entrega, de principio a fin, en un
> solo documento. Todo se hace desde **el Mac** (consola, superadministrador,
> portero) y **el iPhone** (residente). Ningún paso exige escribir código: lo que
> varía en sitio —IPs, puertos, puerta, canal de video, zona, tiempos— está en
> `apps/api/.env` o en la consola.
>
> Documentos de apoyo: [`INTEGRACION_HIKVISION.md`](INTEGRACION_HIKVISION.md)
> (cada equipo en detalle), [`VALIDACION_HIKVISION_EN_SITIO.md`](VALIDACION_HIKVISION_EN_SITIO.md)
> (la hoja de los 16 escenarios) y [`APP_EN_IPHONE.md`](APP_EN_IPHONE.md) (la app
> en el iPhone). Las guías de visita de la 15-M
> ([`archivo/VISITA-29-09.md`](archivo/VISITA-29-09.md)) y de la 15-N
> ([`archivo/PROXIMA-VISITA-15N.md`](archivo/PROXIMA-VISITA-15N.md)) están
> archivadas desde la 15-R: lo que seguía vigente de ellas está en
> [§8](#8--lo-que-sigue-valiendo-de-las-visitas-archivadas).

## Índice

- [0 · La víspera](#0--la-víspera)
- [1 · Arranque de API, consola y go2rtc](#1--arranque-de-api-consola-y-go2rtc)
- [2 · Comprobaciones](#2--comprobaciones)
- [2 bis · Al llegar: la cámara, a la IP de ahora del Mac](#2-bis--al-llegar-la-cámara-a-la-ip-de-ahora-del-mac)
- [3 · `supabase db push` pendiente](#3--supabase-db-push-pendiente)
- [3 bis · Porteros: número, IP y modo pruebas](#3-bis--porteros-número-ip-y-modo-pruebas)
- [4 · Ensayo](#4--ensayo)
- [4 bis · Mañana: el orden de las pruebas](#4-bis--mañana-el-orden-de-las-pruebas)
- [5 · Demostración de los tres hitos del reto](#5--demostración-de-los-tres-hitos-del-reto)
- [6 · Reversión](#6--reversión)
- [7 · Plan B por equipo](#7--plan-b-por-equipo)
- [8 · Lo que sigue valiendo de las visitas archivadas](#8--lo-que-sigue-valiendo-de-las-visitas-archivadas)
- [9 · La visita del 09/10: lo medido y lo que falta](#9--la-visita-del-0910-lo-medido-y-lo-que-falta)

---

## 0 · La víspera

> **15-S1.** La noche antes, con Internet, en este orden. Lo nuevo desde la
> visita anterior: las migraciones **0047–0054**, variables nuevas en los dos
> `.env` y el audio de la guardia por WebSocket.

1. **Código:** `git pull` de `develop` y `pnpm install --frozen-lockfile`.
2. **Compilación:**
   `pnpm turbo run build --filter=@ncr/api --filter=@ncr/web --filter=@ncr/providers`.
3. **`pnpm entorno:diff`**, y lo que falte, copiado del `.env.example` de cada uno.
   En sitio **pueden ir vacías** las de Web Push (`WEB_PUSH_*`) y TURN (`WEBRTC_*`), y
   **deben** ir vacías las de Netlify (`API_IP_FIRMA_SECRETO`, `API_ORIGEN_PUBLICO`,
   `CONSOLA_CABECERA_IP_DE_CONFIANZA`, `CONSOLA_IP_FIRMA_SECRETO`).
   `GUARDIA_AUDIO_TRANSPORTE=websocket`. **`RECUPERACION_POR_CORREO`: `desactivada`,
   vacía o sin la línea**: las tres la dejan desactivada con `pnpm start` (DT-15S1-02).
4. **`supabase db push`**: **0047 a 0054** —conversaciones de guardia, salidas del
   videoportero, Edge en sitio, Edge puente, estado que sobrevive al reinicio,
   suscripciones Web Push, modo de puerta y lectura de usuarios por servicio—, y
   reinicio de la API. **Desde la 15-W, también la 0055 y la 0056** (autorregistro,
   titular asignado, menores y plazas). La víspera de abajo no las mira todavía
   (DT-15W-08): confírmelas con `supabase migration list`.
5. **Contra la base real**, con la API y la consola arrancadas (§1):
   `pnpm sitio:ensayo -- --solo-lectura`. Su bloque **«La víspera»** tiene que decir
   «están las ocho», ningún ✗ en las variables y «contesta por el bucle local y
   reenvía el audio a la API». Cada ✗ trae su remedio; ninguna línea lleva un valor.
6. **Ensayo simulado:** `pnpm sitio:ensayo -- --simulado` → `VEREDICTO: SIN FALLOS`.
   Si no, no salga.
7. **La app del iPhone:** con Apple ID gratuito **caduca a los 7 días**. Si pasaron 7
   días desde que se instaló, reinstálela hoy —en Release, con
   `--dart-define=API_URL=http://<nombre>.local:3000`, una sola vez con cable— y ábrala
   después desde el ícono, sin cable ni Mac ([`APP_EN_IPHONE.md`](APP_EN_IPHONE.md)
   §1–§2, ADR-033). Apunte la fecha.
8. `pnpm sitio:video -- --preparar`: descarga go2rtc para el Mac y deja
   `.sitio/go2rtc.yaml` escrito desde el `.env`. Anote el SHA-256 que imprime.
9. **Los equipos, en la consola** (Dispositivos → alta), N de cada tipo, con su
   IP, usuario y credencial: el ensayo, la puesta en marcha y el respaldo los
   leen de ahí (15-M, C6). `BARRERA_*`, `TERMINAL_*` y `VIDEOPORTERO_*`
   (`HOST`, `PUERTO`, `USUARIO`, `CLAVE`, `CANAL`) en `apps/api/.env` quedan de
   respaldo, sólo si la base no está. Las credenciales, **sólo en la consola o en
   ese fichero**: ni en la hoja, ni en un documento, ni en una foto.
10. Una carpeta de sitio **fuera del repositorio**: `mkdir -p $HOME/ncr-sitio`.
    Ahí van el respaldo, los informes y la bitácora. El ensayo se niega a
    escribir dentro del repositorio.
11. **Ensayo en casa con IPv6 desactivado.** El host directo de Supabase
    (`db.<ref>.supabase.co`) sólo tiene IPv6, y muchas redes de conjunto no lo
    dan: pg-boss no arrancaría en sitio. Con la API parada:
    ```
    networksetup -setv6off Wi-Fi                 # como la red del conjunto
    pnpm --filter @ncr/api start                 # debe llegar a «API arrancada»
    pnpm sitio:ensayo -- --solo-lectura          # sin FALLO de pg-boss
    networksetup -setv6automatic Wi-Fi           # al terminar, como estaba
    ```
    Si falla, `PGBOSS_DATABASE_URL` al pooler en modo sesión (puerto 5432).
12. `TERMINAL_PLAZO_DE_VERIFICACION_S=8` en el `.env` (el valor por omisión): la
    terminal espera 8 s el veredicto, no los 5 de fábrica.
13. **HikCentral.** Los tres equipos están dados de alta también en HikCentral.
    Pida a quien lo administra que los **deshabilite en HikCentral durante la
    prueba**: una plataforma que ya tiene la conexión de eventos puede hacer que
    el equipo rechace la nuestra, y su sincronización puede borrar los rostros
    que cargue Next Control. El ensayo y la ficha lo dicen en palabras si pasa.
14. Una foto JPEG de **su propia cara** (≤ 200 KB, ≤ 1024 px):
    `$HOME/ncr-sitio/cara.jpg`. Es para el paso 6 del ensayo; se da de alta y de
    baja en la terminal en el acto.

## 1 · Arranque de API, consola y go2rtc

Cada uno en su terminal del Mac, en este orden:

```
caffeinate -dimsu                                       # que el Mac no se duerma
pnpm sitio:video                                        # go2rtc, primer plano
pnpm --filter @ncr/api start 2>&1 | tee -a $HOME/ncr-sitio/api.log
pnpm --filter @ncr/web start                            # consola en el 3100
```

`pnpm --filter @ncr/web start` es `node servidor.mjs`, no `next start`: fija
en `X-Forwarded-For` la IP del navegador que se conecta, y la API la cree porque
le llega del propio Mac (`API_PROXIES_DE_CONFIANZA=loopback`, el valor por
omisión). Con `next start` a secas, un navegador podría declararse desde
cualquier IP y la lista blanca de porteros no serviría (ADR-031).

Si la IP del Mac cambió respecto de la oficina, `pnpm sitio:video` la toma sola
(`en0`); si no es esa interfaz, `VIDEO_IP_ANUNCIADA` en el `.env`. La consola se
abre **por IP**: `http://<IP-del-Mac>:3100`. El audio de la guardia (micrófono)
sólo en `http://127.0.0.1:3100`, que el navegador trata como contexto seguro.

El **cortafuegos del Mac** tiene que aceptar conexiones entrantes de `node`
(Ajustes del Sistema → Red → Cortafuegos → Opciones); si macOS pregunta al
arrancar la API, **Permitir**. Sin eso, ni Safari ni la app del iPhone llegan.

### 1 bis · Video: qué genera `pnpm sitio:video` y qué se comprobó con el binario

Lo visto el 28/09 y lo que cambió (15-M, E2/C1):

- `.sitio/go2rtc.yaml` **no lleva `streams:`** —ni `streams: {}`—: con esa
  clave go2rtc rechazaba el alta de cada flujo con `400 … did not find
expected key`. Se escribe con **permisos 0600**, y si en el fichero quedó un
  `streams:` de una versión anterior (con la URL RTSP y la credencial dentro),
  el guion **lo retira al arrancar y al cerrar** y lo dice por pantalla.
- La API registra cada flujo con **`PATCH /api/streams`** (antes `PUT`): el
  flujo vive **en memoria** y go2rtc **no escribe nada al fichero**, así que la
  credencial del equipo no toca el disco (RN-21). **Ojo:** la versión oficial
  de go2rtc (v1.9.14) devuelve esa fuente **en claro** por `GET /api/streams`;
  la compilación de camera.ui la tachaba. Por eso la API de go2rtc escucha
  sólo en `127.0.0.1` y `pnpm sitio:video` se niega a abrirla a la red sin
  `--api-en-red`: sólo la lee quien ya está en el Mac.
- La fuente lleva **`#backchannel=0`**. Sin él, go2rtc pide en el DESCRIBE el
  canal de retorno ONVIF (`Require: www.onvif.org/ver20/backchannel`); un
  equipo que cierra la conexión ante eso —y rechaza la reconexión inmediata—
  produce el `HTTP 500 · EOF` de la visita anterior. El audio de la guardia no
  va por ahí (ADR-01), así que no se pierde nada.
- **Sin STUN** (`ice_servers: []`): consola y puente están en la misma red. Con
  el STUN de Google por omisión y sin Internet, cada negociación tardaba **5 s
  exactos** (lo que expira la recogida ICE); ahora contesta enseguida.
- La ficha del equipo ofrece **la lista de canales de video que el equipo
  declara** (`Streaming/channels`), con su códec, y propone el subflujo
  (`x02`). «No tiene el canal 102» ya no se adivina: se elige.
- **15-S1 · C.** El 06/10 la cámara LPR (DS-TCG405-E V5.4.0) declaró **un solo**
  canal, el `101`, en **H.265**, y su ficha guardaba el `102`. Desde esta ronda:
  «Probar conexión» **avisa** con el hallazgo «canal de video de la ficha» (cuál
  tenía, que el equipo no lo declara, cuál se usará) y lo guarda; si la lista no
  se pudo leer lo dice con el motivo —pruébela con el **usuario de servicio**,
  no con `admin`—. _Corregido en la 15-S2:_ la 15-S1 negaba ese canal ANTES
  del puente, también a Safari, que sí reproduce H.265; ver el punto siguiente.
  El código no cambia el códec del equipo.
- **15-S2 · A · H.265: Safari directo, Chrome transcodificado.** Medido con
  go2rtc v1.9.14 y una fuente H.265: con la oferta de **Safari** el puente sirve
  el H.265 **directo** (primer cuadro en ≈0,2 s); la de **Chrome** no trae H.265
  y go2rtc contestaba `500 · codecs not matched`. Ahora la API decide la vía
  con el códec del equipo y lo que el navegador acepta:
  - **Safari** → directo, sin coste.
  - **Chrome** → el puente lo **transcodifica a H.264** con **ffmpeg**, si
    `VIDEO_TRANSCODIFICAR=auto` (por omisión). Instálelo la víspera:
    **`brew install ffmpeg`**; `pnpm sitio:video -- --preparar` falla si falta y
    lo dice. Cuesta CPU y retraso: en el banco, el primer cuadro llegó a
    **≈1,4–2,5 s** de pedirlo (frente a los 2 s de KPI-33); en el Mac se mide
    con el paso 7.
  - Sin ffmpeg, con `VIDEO_TRANSCODIFICAR=nunca` o con el video servido por el
    Edge: «no reproducible» con los **tres remedios** — (1) Safari, (2) ffmpeg,
    (3) H.264 en el equipo **con autorización del cliente**.
  - La transcodificación lee del **RTSP interno de go2rtc, sólo en
    `127.0.0.1:8554`** (`pnpm sitio:video` lo enciende con `auto`): la clave del
    equipo **no** aparece en los argumentos de ffmpeg (comprobado con `ps`).
    go2rtc deja entrar a ese RTSP sin credencial desde el propio Mac
    (H-15S2-02): por eso nunca escucha en la red.
  - El **paso 7 de `pnpm sitio:ensayo`** dice la vía (directo o
    transcodificado), la SDP y el **primer cuadro a los N ms de pedirlo**, y
    prueba además la vía de Safari.
- Con `GO2RTC_URL` en el `.env`, el **paso 7 de `pnpm sitio:ensayo`** además
  negocia WebRTC de verdad contra go2rtc (PATCH + `POST /api/webrtc`) y mide
  los milisegundos; sin credencial en ninguna línea.

Todo esto está probado contra el binario real (go2rtc 1.9.14): con
`GO2RTC_BIN=<ruta al binario>` las pruebas `servidor-rtsp.go2rtc.test.ts` y
`puente-go2rtc.real.test.ts` lo repiten en el escritorio; sin la variable se
omiten con nombre («OMITIDA: sin GO2RTC_BIN»).

> **Si el paso 3 dice que faltan migraciones**, la API arrancada sin ellas falla
> al leer dispositivos (la 0041 añade el canal de video). Pare la API, haga el
> paso 3 y vuelva a arrancarla. Por eso las comprobaciones van antes que nada más.

## 2 · Comprobaciones

**Primero, el respaldo** — antes de tocar ningún equipo, ni desde la consola ni
desde su panel web:

```
pnpm sitio:ensayo -- --capturar=$HOME/ncr-sitio/respaldo
```

Guarda, por equipo, la configuración que la entrega puede cambiar: quién
controla la barrera, a qué receptor publica la cámara, su disparador y su país;
si la terminal espera el veredicto; los canales de audio del videoportero.
Ficheros `0600`, uno por equipo, con la familia y el número de serie del aparato
en el nombre (15-M). Si dos fichas dan la misma serie —dos entradas con la IP
del mismo equipo—, la segunda no pisa a la primera: se dice y cuenta como
fallo. Un documento que lleve una contraseña se guarda **sin ella** y queda
marcado «se restaura a mano».

**Después, las comprobaciones del Mac**, sin mover nada:

```
pnpm sitio:ensayo -- --solo-lectura
```

Al principio imprime:

| Línea                                       | Qué significa                                                                   | Si falla                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| API en marcha (127.0.0.1)                   | La API contesta en el propio Mac                                                | Arránquela (paso 1)                                                                                         |
| La API contesta por la IP del Mac           | La contestará el iPhone                                                         | Cortafuegos del Mac → permitir conexiones entrantes de `node`                                               |
| ▶ iPhone: … abra `http://<IP>:3000/health` | La comprobación del iPhone                                                      | Si Safari no la abre, es la red: misma Wi-Fi y **datos móviles apagados**                                   |
| Puente de video (go2rtc)                    | go2rtc contesta                                                                 | `pnpm sitio:video`                                                                                          |
| Migraciones                                 | La base tiene las del repositorio                                               | Paso 3                                                                                                      |
| La víspera (15-S1)                          | 0047–0054 una a una; variables nuevas desde la 15-N; consola por el bucle local | Cada ✗ trae su remedio (§0, paso 5)                                                                         |
| pg-boss no usa el host directo de Supabase  | Los trabajos programados arrancan                                               | `PGBOSS_DATABASE_URL` al **pooler en modo sesión (:5432)**, no a `db.<ref>.supabase.co` (sólo IPv6)         |
| Proveedor de equipos                        | Las órdenes llegan a equipos reales                                             | `PROVEEDOR_DE_EQUIPOS=hikvision` y reinicio de la API; con `simulado` la consola lo dice en una franja roja |
| Servidor de alarmas de la cámara            | La cámara publica a la IP de ahora del Mac                                      | En la ficha de la cámara, **«Enviar eventos a este Mac»** (§2 bis)                                          |

**Después, el iPhone** ([`APP_EN_IPHONE.md`](APP_EN_IPHONE.md) §3):

1. En Safari del iPhone, `http://<nombre>.local:3000/health`. Si no resuelve
   el nombre, la red bloquea mDNS: pruebe `http://<IP-del-Mac>:3000/health`.
2. Abra la app **desde el ícono** y entre.
3. Si la app no llega: **«Cambiar servidor»** en la pantalla de acceso (o en la
   pantalla de error) con la dirección que sí abrió Safari. La app pregunta a
   `/health` antes de aceptarla y la guarda; cambiarla cierra la sesión.
4. **Plan B de red:** el Mac con cable Ethernet a la red del conjunto (para
   los equipos) y por Wi-Fi al Punto de acceso personal del iPhone; en la app,
   «Cambiar servidor» con el nombre `.local` o la IP del Mac en esa red.

Y por cada equipo, los pasos que no mueven nada: conexión, hora y **zona**,
configuración, eventos y video. En la última visita la cámara tenía **reloj y
zona mal**: corríjalos en su panel (Configuración → Sistema → Hora, zona
«(GMT-05:00) Bogotá») antes de seguir. Con la zona mal, las vigencias de los
visitantes se corren horas en la terminal.

## 2 bis · Al llegar: la cámara, a la IP de ahora del Mac

La IP del Mac cambia de la oficina al conjunto, y la cámara sigue enviando sus
eventos a la de antes. En la consola, **Dispositivos → la cámara → Ficha**,
escriba el motivo («entrega en sitio») y pulse **«Enviar eventos a este Mac»**:

- la API toma la IP del Mac **en la red de la cámara** (o
  `ALARM_SERVER_IP_ANUNCIADA` si la definió), el puerto de la API y la ruta con
  el secreto de **esa** cámara: el que la API emitió al darla de alta en la
  consola o, para la cámara del 28/09, el de `ALARM_SERVER_EQUIPOS` (15-M, C6);
- la escribe en el servidor de alarmas de la cámara y **la lee de vuelta**: sólo
  dice «aplicada» si la cámara quedó apuntando ahí;
- queda en la auditoría con la dirección anterior y la nueva (nunca el secreto).

Si dice que el Mac no tiene IP en la red de la cámara, conecte el Mac a esa red
(cable o Wi-Fi de los equipos). El ensayo compara también la dirección que la
cámara tiene escrita con la IP actual del Mac y lo marca FALLO si no coinciden.

## 3 · `supabase db push` pendiente

Si la comprobación dijo «faltan N migraciones»:

```
supabase db push
```

y vuelva a arrancar la API (paso 1). Repita `pnpm sitio:ensayo -- --solo-lectura`
hasta que diga «la base tiene todas las migraciones del repositorio».

## 3 bis · Porteros: número, IP y modo pruebas

Desde la 15-L (ADR-031) **el portero entra con su número y su contraseña**, nada
más: ni código ni NIT. El número se lo da el sistema al darlo de alta
(Porteros → Nuevo portero: nombre, documento y contraseña temporal) y se enseña
en pantalla al terminar: **anótelo y dígaselo**. El portero sembrado que ya
existía entra con el número que la migración 0042 le asignó (columna «Portero»
en Porteros).

**El MODO PRUEBAS está ACTIVO al llegar** (franja amarilla arriba de la
consola: «Modo pruebas activo: restricciones de porteros desactivadas»). Con él,
un portero entra desde cualquier IP y cada vez que la regla lo habría frenado
queda anotado «habría sido rechazado» en la auditoría. Así se hacen todas las
pruebas desde el mismo Mac sin quedarse fuera.

Para demostrar la lista blanca, en este orden:

1. Configuración → «IPs permitidas para conexión remota de porteros»: la IP del
   Mac (o su red, p. ej. `192.168.1.0/24`). «IP del computador de portería», si
   hay uno. Guardar: queda en la auditoría.
2. Configuración → Seguridad → «Desactivar modo pruebas» (sólo el
   superadministrador). La franja desaparece al recargar, sin reiniciar nada.
3. El portero, desde el Mac: entra y opera la guardia virtual.
4. Desde otro aparato cuya IP no esté en la lista: «No autorizado para guardia
   remota», y la fila con esa IP en `auditoria_seguridad`.
5. **Con la lista remota vacía**, el portero sólo entra desde la IP de un
   superadministrador con sesión abierta —el mismo Mac, si el superadministrador
   tiene la consola abierta—. En cuanto la lista tiene una entrada, esa regla
   deja de valer.
6. Si algo se atasca en plena demostración: «Activar modo pruebas» y todo vuelve
   a entrar, anotado.

Con el modo pruebas apagado, 5 intentos fallidos del mismo número **desde la
misma IP** bloquean 5 minutos (desde otra IP, no). La consola dice cuánto
esperar.

## 4 · Ensayo

```
pnpm sitio:ensayo -- --foto=$HOME/ncr-sitio/cara.jpg --informe=$HOME/ncr-sitio/ensayo.md
```

Primero, **Comprobaciones de la plataforma**: que la API no esté con
`PROVEEDOR_DE_EQUIPOS=simulado` habiendo equipos reales dados de alta, y que
pg-boss no vaya al host directo de Supabase (sólo IPv6). Cualquiera de las dos
es FALLO, con el remedio.

Después, equipo por equipo, los nueve pasos. Cuando diga **▶**, haga lo que pide y pulse
Enter; cuando pregunte **?**, mire y conteste `s` o `n`:

| Paso                      | Lo que hace usted                                       | OK si…                                                                                                                                           |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Conexión                | nada                                                    | el equipo acepta el Digest                                                                                                                       |
| 2 Hora                    | nada                                                    | desvío ≤ 60 s y zona UTC−05:00                                                                                                                   |
| 3 Configuración           | nada                                                    | la ficha no tiene bloqueos; en terminal y videoportero, «Rostros: admite / no admite / no se pudo leer (motivo)»                                 |
| 4 Eventos                 | pasar el vehículo / acercar la cara / pulsar el timbre  | la cámara apunta a la IP **de ahora** del Mac (si no, FALLO → «Enviar eventos a este Mac», §2 bis) y el evento llega **a la plataforma** en 60 s |
| 5 Apertura                | mirar la talanquera o la puerta                         | usted confirma que se movió, en < 3 s                                                                                                            |
| 6 Rostro                  | nada (usa `--foto`)                                     | alta, búsqueda y baja confirmadas, **también en el videoportero** si admite rostros; y el rostro **sigue ahí a los 60 s**                        |
| 7 Video                   | nada                                                    | H.264 por RTSP en el canal de la ficha                                                                                                           |
| 8 Audio                   | escuchar el videoportero                                | usted oye el pitido                                                                                                                              |
| 9 Verificación (terminal) | presentar a la terminal un rostro dado de alta, 5 veces | p95 del veredicto por debajo de `TERMINAL_PLAZO_DE_VERIFICACION_S` (8 s), con los 5 veredictos aceptados                                         |

Cada FALLO trae su causa y **→ la acción**. Corríjala y repita sólo ese equipo:
`pnpm sitio:ensayo -- --equipo=terminal`. Tres avisos importantes:

- **«rechazó el usuario o la clave»**: NO repita. El equipo bloquea la IP del Mac
  tras unos pocos intentos. Corrija el `.env` y espere si ya falló varias veces.
- **«venció el desafío dos veces»** con la API en marcha: dos procesos del Mac
  comparten el mismo nonce del equipo. Espere 30 s y repita el paso.
- **HikCentral**: si el equipo rechaza la conexión de eventos porque otra
  plataforma la tiene (o agotó las que admite), o si el rostro del paso 6
  desaparece a los 60 s, el FALLO lo dice así y la acción es **deshabilitar el
  equipo en HikCentral durante la prueba**. La ficha del equipo dice lo mismo en
  «eventos del equipo». `--espera-sincronizacion=<s>` cambia los 60 s.
- **Paso 4 sin evento**: con la API en marcha el ensayo NO se suscribe al equipo
  (le quitaría los eventos a la API); mira si el evento quedó en la base. Si no
  llegó, la acción dice dónde mirar (servidor de alarma de la cámara, líneas
  «escucha:» de `api.log`).

Después, la batería de los 16 escenarios de
[`VALIDACION_HIKVISION_EN_SITIO.md`](VALIDACION_HIKVISION_EN_SITIO.md), fila a
fila en la hoja.

## 4 bis · Mañana: el orden de las pruebas

> **15-S1.** Lo que esta visita tiene que dejar medido, en este orden. Los «§V» y
> «§8.4…» son de [`VALIDACION_HIKVISION_EN_SITIO.md`](VALIDACION_HIKVISION_EN_SITIO.md).

1. **Capacidades del videoportero DS-KD9633:** Dispositivos → su ficha → «Probar
   conexión». Anote canal de audio declarado, códec y muestreo (§8.4.1, fila 1).
   `enabled=false` no es un «no» (H-15S1-C07).
2. **TwoWayAudio** (§8.4, 15-S1): no hay nada que habilitar —el firmware rechaza
   escribir `enabled`—. Con el **usuario de servicio**: `GET channels`, `open` y
   `close`; si `open` da `200` con `sessionId`, marque en la ficha «comprobé en
   sitio que el equipo abre el canal de audio (atestación)». Anote el códec y si
   es semiduplex. **Igual con la terminal facial** si declara canal (15-S1 · B).
3. **Los 16 escenarios, en sus 26 filas** escenario × canal, con la hoja delante
   (`node scripts/puesta-en-marcha-equipos.mjs --simulado --hoja=$HOME/ncr-sitio/hoja.md`):
   L1–L5, T1–T5 y V1–V6, y después L6, L7 y T6 (§V.2, paso 11).
4. **Audio < 2 s** (§8.4.1, filas 3 a 6) **desde el navegador del propio Mac**, por
   `http://127.0.0.1:3100`: por la IP del Mac el navegador no da el micrófono. Además
   de colgar, cambiar de equipo y cerrar la pestaña (fila 6), **colgar —o cambiar de
   equipo— y volver enseguida**: la llamada nueva conserva la palabra y el audio (A1).
   La fila 7 es la vuelta atrás si algo falla.
5. **Las salidas del videoportero** (§8.4.2): descubrir, nombrar y abrir cada una, < 3 s.
6. **Puerta libre y bloqueada** (§8.4.3), con el administrador del conjunto delante.
7. **Opcional:** el corte de WAN del Edge, si hay Edge y queda tiempo
   ([`DESPLIEGUE_EDGE.md`](DESPLIEGUE_EDGE.md) §9).

> **15-S2 · lo nuevo de esta visita, antes del punto 2.** Detalle en
> [`VALIDACION_HIKVISION_EN_SITIO.md`](VALIDACION_HIKVISION_EN_SITIO.md) §8.4.4.
>
> - **Video de la cámara (H.265):** ábrala en **Safari** y en **Chrome**; anote la
>   vía y los ms del paso 7 (`pnpm sitio:ensayo -- --equipo=camara`).
> - **Audio medido:** `pnpm sitio:audio -- --equipo=videoportero` y
>   `--equipo=terminal`. Dice formato, volúmenes, si el equipo usa el
>   `sessionId`, los bytes y el nivel de lo que manda, si es **dúplex o
>   semidúplex**, y pregunta si se oyó el tono. Informe en `$HOME/ncr-sitio`,
>   sin IP ni claves, y **sin guardar audio** (la voz es dato personal).
> - **Terminal que no es G.711:** sólo con autorización del cliente,
>   `pnpm sitio:audio -- --equipo=terminal --pasar-a-g711
--respaldo=$HOME/ncr-sitio/respaldo` (respaldo primero, pregunta, relee);
>   se revierte con `pnpm sitio:ensayo -- --equipo=terminal
--restaurar=$HOME/ncr-sitio/respaldo`.
> - **Consola de guardia:** «**Manos libres**» (micrófono abierto hasta colgar)
>   y «Mantener para hablar»; los medidores «Recibiendo del equipo» y
>   «Enviando». Si el equipo resulta semidúplex, la consola lo dice y muestra
>   el turno.

**Lo que no se puede probar en sitio, y por qué:**

| Qué                                  | Por qué no                                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Avisos Web Push al residente         | Exigen HTTPS (contexto seguro y service worker) en el aparato que los recibe; en sitio todo va por `http://`                       |
| TURN (coturn)                        | Sólo sirve para el video desde fuera de la red del conjunto; en sitio todo está en la misma red y coturn no está desplegado (P-29) |
| Consola en Netlify, API en Cloud Run | No están desplegadas (DT-15R-01): en sitio la consola y la API corren en el Mac                                                    |

## 5 · Demostración de los tres hitos del reto

**Hito 1 · Prototipo funcional.** La consola por IP en el Mac (tablero con los
tres equipos **en línea**), la app en el iPhone con la sesión del residente, y
Eventos mostrando en tiempo real lo que hacen los equipos.

**Hito 2 · Prueba LPR real** — _registrar la placa desde la app → detectar →
validar → abrir la talanquera → registrar el evento_:

1. iPhone, residente: Nuevo visitante con autorización vehicular (placa, fecha y
   franja de hoy), o Mis vehículos → agregar.
2. El vehículo pasa por la cámara. La cámara publica al servidor de alarma de la
   API; el motor decide con la autorización recién creada.
3. La talanquera se levanta **por orden de la plataforma**. Requisito: la cámara
   en «reporta, no decide» (quién controla la barrera = plataforma, corregible
   desde su ficha) o atestada por el instalador (D-11). Si la cámara sigue
   decidiendo sola, el evento se registra igual y marcado «la cámara decidió por
   su cuenta» — eso **no** demuestra el hito: vea el plan B.
4. Consola → Eventos: el acceso con placa, vivienda, resultado y motivo.
5. Contraprueba: una placa no autorizada no abre y queda registrada como negada.

**Hito 3 · Prueba facial real** — _foto desde la app → sincronizar la terminal →
reconocer → validar zona → liberar el acceso → registrar el evento_:

1. iPhone, residente: Nuevo visitante con foto (la cámara del teléfono), fecha y
   franja de hoy.
2. Consola → Visitantes / Biometría: el seguimiento por terminal pasa a
   «sincronizada». La terminal guarda al visitante con su vigencia en hora de
   Bogotá (caduca sola aunque la supresión fallara).
3. El visitante se presenta a la terminal: la terminal pregunta a la plataforma
   (verificación remota, modo armado), el motor valida vigencia y zona, y la
   terminal abre con el veredicto.
4. Consola → Eventos: el acceso facial con su resultado.
5. Contraprueba: al vencer o revocar, la plantilla se suprime (RN-11) y la
   terminal ya no abre.

## 6 · Reversión

Al terminar, **sólo si el cliente pide dejar los equipos como estaban**:

```
pnpm sitio:ensayo -- --restaurar=$HOME/ncr-sitio/respaldo
```

Por cada documento: `igual` (no se tocó), `restaurado` (se escribió **y se
releyó igual**), `fallo` (el equipo dijo «OK» pero la lectura no coincide:
hágalo en su panel web) o `no_restaurable` (llevaba contraseña o no se pudo
leer al capturarlo: a mano). Cada equipo busca **su** respaldo por familia y
número de serie; uno de otro equipo —otra serie u otra familia— no se aplica. La hora y la zona **no** se restauran: se dejan bien.

La persona de prueba del paso 6 ya se dio de baja en el ensayo; si el ensayo
dijo lo contrario, bórrela en el panel de la terminal por su número (`ENSAYO…`).

## 7 · Plan B por equipo

Lo que se hace si algo no funciona el día de la entrega. Ninguno exige código.

| Equipo                        | Síntoma                                                           | Plan B                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cámara**                    | Decide sola (no hay atestación ni «plataforma» en quién controla) | Se demuestra detección y registro (cada placa aparece en Eventos, marcada). La apertura por la plataforma se hace desde Portería con motivo (RN-08). El hito 2 queda **pendiente de la atestación**, dicho así en la hoja.                                                                                                                                                                                                                |
| **Cámara**                    | No llegan eventos                                                 | **«Enviar eventos a este Mac»** en su ficha (§2 bis): escribe la IP de ahora y la lee de vuelta. La cámara tiene que estar en `ALARM_SERVER_EQUIPOS` (y **reinicio de la API**: esa lista se lee al arrancar). Si sigue sin llegar: «Cargar en el servidor de alarmas» marcado en su panel.                                                                                                                                               |
| **Terminal**                  | La plataforma no contesta a tiempo (API caída, red lenta)         | Por omisión (`TERMINAL_ABRE_SIN_PLATAFORMA=false`) la terminal **no abre sola**: se abre desde la consola (Portería, con motivo) o con la llave. Sólo si el cliente lo pide: `TERMINAL_ABRE_SIN_PLATAFORMA=true`, reinicio de la API y «Corregir → verificación remota» en su ficha. Mientras tanto el motor NO decide: anótelo.                                                                                                          |
| **Terminal**                  | La verificación tarda y la terminal niega                         | El ensayo da p50/p95 del veredicto frente al plazo. Si el p95 se acerca: **«Verificación remota: desactivar»** en la ficha de la terminal —escribe `AcsCfg`, lo lee de vuelta y queda en la auditoría—; la terminal vuelve a abrir con su propio reconocimiento y la plataforma registra sin decidir: anótelo. «Verificación remota: activar» lo deshace. Subir `TERMINAL_PLAZO_DE_VERIFICACION_S` (1–60) y «Corregir» es la otra salida. |
| **Cualquiera**                | Rechaza la conexión de eventos, o un rostro cargado desaparece    | Otra plataforma —HikCentral— tiene el equipo: **deshabilítelo en HikCentral durante la prueba** y repita el paso. El ensayo y la ficha lo dicen con esas palabras.                                                                                                                                                                                                                                                                        |
| **Terminal**                  | El rostro no se sincroniza                                        | Seguimiento por terminal en la consola: el motivo sale en palabras (foto, persona, biblioteca llena). El visitante entra por Portería con motivo, o por placa.                                                                                                                                                                                                                                                                            |
| **Videoportero / terminal**   | Sin audio                                                         | Si la guardia dice «deshabilitado para la guardia»: compruebe `open`/`close` con el usuario de servicio y marque la **atestación** en la ficha (§8.4 de la validación); no hay nada que habilitar en el panel (H-15S1-C07). Si `open` no abre: la guardia llama al **teléfono de portería** (configurado en Ajustes) y abre desde la consola.                                                                                             |
| **Videoportero / cualquiera** | Video negro o «sin señal»                                         | «Probar conexión» dice el códec y el canal: H.265 → ese flujo a H.264 en el panel **con autorización del cliente**, u otro canal de la lista de la ficha; el hallazgo «canal de video de la ficha» dice cuál se usará. ICE: `VIDEO_IP_ANUNCIADA` y `pnpm sitio:video` de nuevo.                                                                                                                                                           |
| **Cualquiera**                | La consola dice el motivo del video en palabras                   | Cada frase trae su remedio: «go2rtc no está en marcha» → `pnpm sitio:video`; «`streams:` sobrante» → parar y rearrancar `pnpm sitio:video` (regenera el fichero); «el equipo cerró la conexión (backchannel)» → canal de la ficha y permiso de vista en vivo del usuario de servicio; «no tiene ese canal» → otro canal de la lista; «rechazó la credencial por RTSP» → permiso de vista en vivo en el panel del equipo (§1 bis).         |
| **Cualquiera**                | «Rechazó el usuario o la clave»                                   | No reintentar. Corregir el `.env` y la credencial en la ficha (sólo reemplazable). Si el equipo bloqueó la IP del Mac, esperar su tiempo de bloqueo.                                                                                                                                                                                                                                                                                      |
| **El Mac o la red**           | Nada contesta                                                     | Todo el sistema funciona contra los simulados: `PROVEEDOR_DE_EQUIPOS=simulado` y reinicio de la API. La demostración de la plataforma sigue; los hitos con hardware quedan para otra visita, dicho así en la hoja.                                                                                                                                                                                                                        |

## 8 · Lo que sigue valiendo de las visitas archivadas

> **15-R.** Las guías de la visita del 29/09
> ([`archivo/VISITA-29-09.md`](archivo/VISITA-29-09.md), 15-M) y de la siguiente
> a la 15-N ([`archivo/PROXIMA-VISITA-15N.md`](archivo/PROXIMA-VISITA-15N.md))
> quedaron archivadas. Aquí está lo que de ellas sigue vigente y no estaba ya en
> §0–§7, comprobado contra el código en la 15-R; cada bloque dice de dónde viene.
> Lo demás se quedó en el archivo: era de esas visitas o ya está arriba.
>
> **Modo.** Como el resto de esta guía, vale para el **modo directo** (el Mac
> habla con los equipos). Con el **Edge como puente** (15-Q2, ADR-035) los
> ajustes del panel de cada equipo valen igual, pero la cámara publica **sólo**
> al Edge y el video lo sirve el go2rtc del Edge:
> [`DESPLIEGUE_EDGE.md`](DESPLIEGUE_EDGE.md) §10.

### 8.1 · Antes de salir, además de §0

_De `PROXIMA-VISITA-15N.md` §0._

1. **`pnpm entorno:diff`.** Si dice `‼ SECRETO OBSOLETO: bórrelo`, quite esa línea
   del `.env` (y rote la llave si pudo salir del equipo). El guion nunca imprime el
   valor.
2. **La clave de los equipos, si go2rtc corrió en `trace` o `debug`.** Con los
   módulos `api` o `rtsp` a ese nivel, go2rtc escribe en su registro la URL RTSP de
   cada equipo **con su clave**, sólo codificada para URL (ADR-022, enmienda 1;
   pasó el 29/09). Si ocurrió alguna vez y la clave no se ha cambiado desde
   entonces: cámbiela en el panel web de cada equipo, edite cada equipo en la
   consola con la nueva (en modo directo se cifra en la base; con puente viaja al
   Edge, [`DESPLIEGUE_EDGE.md`](DESPLIEGUE_EDGE.md) §10.4) y borre ese registro de
   go2rtc.
   - `pnpm sitio:video` se niega a arrancar con `api` o `rtsp` en esos niveles
     —también si los heredan del nivel general— salvo con `--permitir-traza`, que
     avisa y pide rotar la clave al terminar. Para depurar otra cosa,
     `VIDEO_REGISTRO` (por omisión `info`) sube sólo otros módulos, p. ej.
     `info,webrtc=debug`.
   - El go2rtc del Edge puente se configura a mano
     ([`DESPLIEGUE_EDGE.md`](DESPLIEGUE_EDGE.md) §10.7), registra los flujos de la
     misma manera y nada lo frena: no suba su registro a esos niveles.

### 8.2 · Ajustes en el panel web de cada equipo

_De `VISITA-29-09.md` §1–§3, sin las filas que ya cubren §2 (zona horaria), §2 bis
(«Enviar eventos a este Mac»), §5 y §7 (quién controla la barrera, verificación remota,
permiso de vista en vivo)._

Las rutas de menú **no están verificadas** contra el manual de cada modelo y van
marcadas `[SUPUESTO]`: el nombre puede cambiar con el idioma y el firmware. Lo
verificado es la comprobación: dé un ajuste por bueno sólo cuando la ficha o el
ensayo lo digan.

| Ajuste                         | Equipo                                 | Valor                                                                                                                                                                                                               | Dónde, en su panel web `[SUPUESTO]`                                                              | Cómo lo comprueba la plataforma                                                                                                                                                                                                                                            |
| ------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sincronización de hora         | los tres                               | **NTP** (un servidor de la red del conjunto) o «sincronizar con el PC»                                                                                                                                              | Configuración → Sistema → Hora → modo de sincronización                                          | Ficha, fila «reloj del equipo», con el mismo umbral que las altas (§8.3). Paso 2 del ensayo                                                                                                                                                                                |
| Autenticación RTSP             | los tres                               | **digest** (o «digest/basic»). Si el equipo ofrece MD5 y SHA-256, que MD5 siga entre los ofrecidos: el puente de video no responde a un Digest sólo SHA-256                                                         | Configuración → Sistema → Seguridad → Autenticación → RTSP                                       | Paso 7 del ensayo y «Probar conexión»: la sonda anota qué esquema ofreció el equipo y cuál se envió, sin la clave. Copie esa línea a la hoja                                                                                                                               |
| Imágenes que envía al receptor | cámara                                 | `detectionPicture` (la imagen de la detección); nunca «todas» (`all`), que añade los recortes de rostro del conductor y del acompañante (RN-09, RN-10, Ley 1581)                                                    | Configuración → Red → Configuración avanzada → Notificación HTTP → tipo de imagen                | Ficha: con `all`, aviso «… · qué imágenes envía» y **«Corregirlo en el equipo»**, con motivo                                                                                                                                                                               |
| País del algoritmo             | cámara                                 | **210** (Colombia)                                                                                                                                                                                                  | Configuración → Evento → Detección de vehículo → Parámetros de reconocimiento → País/Región      | Ficha, fila «país del algoritmo», y paso 3 del ensayo. Si el equipo no lista 210, la plataforma lo dice y no escribe nada                                                                                                                                                  |
| Receptores de eventos          | los tres                               | Cámara: **un solo** destino, el de «Enviar eventos a este Mac» (§2 bis) o, con puente, el Edge. Terminal y videoportero: **ninguno**, la plataforma los escucha por su flujo. El 29/09 los tres traían uno huérfano | Configuración → Red → Configuración avanzada → Notificación HTTP / Escucha HTTP (HTTP listening) | Terminal y videoportero: fila «receptor de eventos (servidor de alarmas)» con la dirección del huérfano y **«Desactivar el receptor huérfano»**, con motivo y en la auditoría. Cámara, en modo directo: línea «Servidor de alarmas de la cámara» de §2 y paso 4 del ensayo |
| Audio bidireccional            | videoportero, terminal (si lo declara) | Canal 1 **declarado** (con `enabled=false` también: no es un interruptor, H-15S1-C07), **G.711 µ-law** (la consola entiende también A-law; otro códec no lo reproduce), y la **atestación** marcada en la ficha     | Configuración → Video/Audio → Audio → Tipo de codificación                                       | Paso 3 del ensayo: «canal de audio bidireccional: canal 1 · g711u». Paso 8: el pitido sólo se envía en G.711                                                                                                                                                               |

### 8.3 · Relojes

_De `PROXIMA-VISITA-15N.md` §2 y §4._

El 29/09 el videoportero iba unas 13 h atrasado con la zona correcta: reconocía
la cara y negaba con «permiso vencido». Por eso la plataforma **lee la hora del
equipo antes de dar de alta a alguien con vigencia** y, si se desvía más del
umbral (30 s por omisión), no escribe nada en el equipo —ni la persona— y lo
dice: «el reloj del equipo va …: no se le da de alta a nadie con vigencia hasta
sincronizar su hora». Quién hace esa lectura, y con qué umbral, depende del modo:

| Modo        | Quién da de alta | Umbral del alta                          | Fila «reloj del equipo» de la ficha     |
| ----------- | ---------------- | ---------------------------------------- | --------------------------------------- |
| Directo     | la API           | `EQUIPOS_DESVIO_DE_RELOJ_S` de la API    | el mismo                                |
| Edge puente | el Edge          | `EQUIPOS_DESVIO_DE_RELOJ_S` **del Edge** | el de la API (viaja con el diagnóstico) |

- NTP en los tres equipos (§8.2) y la fila «reloj del equipo» conforme antes de
  dar de alta rostros. NTP sigue siendo la protección de fondo: la lectura previa
  impide escribir en un equipo desviado, no le corrige la hora.
- **Con Edge puente, el mismo `EQUIPOS_DESVIO_DE_RELOJ_S` en los dos `.env`.**
  Hasta la corrección de la 15-R (DT-15R-09) el Edge daba de alta sin esta
  lectura y el NTP del equipo era la única defensa. Si los dos umbrales difieren,
  la ficha puede decir «conforme» y el alta rechazarse, o al revés. Con el del
  Edge juzga cada equipo `pnpm sitio:edge`
  ([`DESPLIEGUE_EDGE.md`](DESPLIEGUE_EDGE.md) §5 y §10.1).
- `--restaurar` no devuelve ni zona ni hora (§6); si el respaldo trae una zona
  distinta de la del conjunto, lo avisa.
- No cambie la hora de un equipo a mano para «probar» el aviso sin que el cliente
  lo autorice; si lo hace, vuelva a poner NTP antes de irse.

### 8.4 · Video desde otro equipo de la red (modo directo)

_De `PROXIMA-VISITA-15N.md` §1. Con puente, el go2rtc es el del Edge:
[`DESPLIEGUE_EDGE.md`](DESPLIEGUE_EDGE.md) §10.7._

La consola negocia el video con la API, pero la imagen viaja **directa** de go2rtc
(en el Mac) al navegador del operador: al candidato que go2rtc anuncia
(`VIDEO_IP_ANUNCIADA` o la IP del Mac) y a su puerto WebRTC
(`VIDEO_PUERTO_WEBRTC`, 8555, TCP y UDP). Desde el propio Mac funciona aunque ese
candidato no se alcance; desde el portátil de la portería, no.

1. Arranque `pnpm sitio:video` y lea lo que dice:
   - `⚠ VIDEO_IP_ANUNCIADA=… no es una dirección de este equipo`: ponga en
     `VIDEO_IP_ANUNCIADA` la IP del Mac **en la red del conjunto** (o déjela
     vacía). Si no aparece, la IP anunciada es del Mac.
   - `✓ el puerto WebRTC contesta en <IP del Mac>:8555 (TCP)`. Si en su lugar
     dice que no contesta, go2rtc no escucha en esa interfaz.
2. **Cortafuegos de macOS**, además del permiso de `node` de §1 `[SUPUESTO]` (el
   nombre del menú cambia entre versiones): Ajustes del Sistema → Red →
   Cortafuegos → Opciones → añada **el binario de go2rtc** (su ruta es la de la
   línea `▶ … -config …` que imprime `pnpm sitio:video`) con «Permitir conexiones
   entrantes». El permiso cubre TCP y UDP. Si macOS pregunta al arrancar go2rtc,
   conteste «Permitir».
3. Desde el portátil de la portería: la consola por la IP del Mac, la ficha de un
   equipo y la vista en vivo. Si la negociación termina y el recuadro dice «Sin
   señal», es el candidato (paso 1) o el cortafuegos (paso 2).

### 8.5 · Durante la visita

_De `VISITA-29-09.md` §0 y §4, y de `PROXIMA-VISITA-15N.md` §3 y §4._

- **Un equipo concreto, por su nombre.** Con más de uno del mismo tipo,
  `pnpm sitio:ensayo -- --equipo="<nombre de la ficha>"`; `--equipo=` admite
  también la familia (§4).
- **Paso 3 del ensayo, en terminal y videoportero:** escribe la forma de alta que
  se usará, p. ej. «forma de alta: persona «normal» con su vigencia (POST
  …/UserInfo/Record) · rostro por POST …/FDLib/FaceDataRecord». Anote esa línea
  de cada equipo en la hoja. Si el FALLO dice que la biblioteca declara sus
  operaciones en `supportFDFunction` sin «setUp», guarde la respuesta del equipo y
  repórtela.
- **La guardia virtual, abierta en un segundo equipo toda la visita.** Lo que
  necesita a una persona y llega en vivo —la llamada, el rostro o la persona no
  autorizada, la placa no autorizada, la lista negra, lo dudoso— entra en la cola
  y, si el operador no atiende ya a otro, pasa solo a «Atención» con el video de
  **ese** equipo. Sale de la cola pasados `GUARDIA_VIGENCIA_EN_COLA_S` (300 s por
  omisión) y queda en Eventos. Qué pasa solo a «Atención» se elige en Configuración →
  «Avisos de la guardia y la portería» (por omisión, todo).
- **Al terminar,** las alertas de las pruebas se archivan desde Eventos, una a una
  o en lote, con motivo: no se borran.
- **Un equipo que se retira** se da de baja desde Dispositivos, con motivo. Sus
  rostros se retiran del equipo antes; los que no se pudieron quitar porque el
  equipo no contestó se dicen, para borrarlos en el propio equipo.
- **En la hoja de resultados, ni direcciones, ni usuarios, ni claves** (§0 ya lo
  dice de las credenciales).

### 8.6 · Mensajes de la consola que no están en §7

_De `VISITA-29-09.md` §5; las filas de go2rtc, del canal y de «rechazó el usuario
o la clave» ya están en §4 y §7._

| Qué ve                                                            | Qué significa                                                                                                                  | Qué hacer                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| «Credencial rechazada por el equipo … hace N min»                 | La plataforma ya sabe que esa clave no vale y no la vuelve a presentar, para que el equipo no bloquee la cuenta                | Corrija la credencial en la ficha, o **«Probar conexión»**, que la presenta una sola vez más |
| «… (el equipo declara la cuenta BLOQUEADA: se desbloquea en N s)» | El propio equipo declaró el bloqueo y cuánto le queda                                                                          | Espere ese tiempo antes de volver a probar                                                   |
| Modelo y firmware con «dato del DD-MM-YYYY»                       | El sondeo de hoy no alcanzó el equipo: son los que se leyeron ese día                                                          | No los dé por actuales; «Probar conexión» cuando el equipo conteste                          |
| «La API no responde»                                              | La consola no alcanza la API: apagada o reiniciándose                                                                          | Mire la terminal de la API; si está arrancando, espere unos segundos                         |
| «Servicio no disponible por ahora»                                | La API contestó que le falta algo, y el mensaje dice qué (p. ej. la base de datos, o «el Edge del conjunto no está conectado») | Siga el mensaje                                                                              |

## 9 · La visita del 09/10: lo medido y lo que falta

_15-S4 (2026-10-10). Detalle, cifras y fuentes en
[`VALIDACION_HIKVISION_EN_SITIO.md`](VALIDACION_HIKVISION_EN_SITIO.md) §10._

**Lo que quedó medido.**

| Qué                           | Resultado del 09/10                                                                                                                                                       | Fuente                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Formato de audio              | **G.711ulaw** en el videoportero y en la terminal, canal 1                                                                                                                | `pnpm sitio:audio`, 20:19:51 y 20:20:47               |
| Bajada (equipo → Mac)         | **7 681 B/s** (videoportero) y **7 852 B/s** (terminal), con nivel de voz (−16 y −28,8 dBFS): la tasa de G.711 a 8 kHz                                                    | Ídem                                                  |
| Guardia, hablar y oír         | 4 sesiones, todas con `sessionId: usado` y `close` 200. Subieron 85 440, 384 320 y 164 640 B en tres de ellas. **La de las 20:33:56 no subió nada y no tuvo ni un tramo** | `api.log`, «sesión de audio terminada», 20:32 a 20:38 |
| Video en vivo                 | Cámara LPR y videoportero, **SÍ**. Navegador **no declarado**                                                                                                             | Declaración del usuario                               |
| Canal de video de la terminal | 101, H.264 1920 × 1080, 25 cuadros/s como máximo                                                                                                                          | `api.log`, 20:30:16                                   |

**Lo que NO quedó medido, y por qué la ETAPA 15 sigue BLOQUEADA.**

- **Los tres hitos del reto no están declarados.** El encargo de la 15-S4 los
  dejó como «[SÍ / NO / NO SE PROBÓ]», sin elegir, y `hoja.md` es la plantilla
  simulada del 07/10, vacía. Sin hitos declarados no hay cierre: cuentan como
  NO SE PROBÓ.
- **KPI-33, KPI-32 y KPI-13 siguen sin cifra.** El «primer byte» de las
  sesiones cuenta desde `open`, no de extremo a extremo.

**Lo que cambia para la próxima visita.**

1. **No dé por buena la línea «sessionId: rechazado» de `pnpm sitio:audio`.**
   El 09/10 salió en los dos equipos por un 400 ajeno al `sessionId` (C-65). Lo
   que vale es la sesión de la guardia. Para el diagnóstico: `--segundos=1` y
   Enter en cuanto pregunte.
2. **En la guardia, pulse antes de hablar** («Mantener para hablar» o «Manos
   libres») y mire que **«Enviando»** se mueva. Sin «pulsar», la API no manda
   nada al equipo (DT-15S4-02).
3. **Anote cada hito como SÍ, NO o NO SE PROBÓ**, con su evidencia: hito 1
   (tablero con los tres equipos en línea, la app con sesión, eventos en tiempo
   real), hito 2 (L1 por la app hasta el evento), hito 3 (T1 por la app hasta el
   evento). Anote también el navegador del video y las tres latencias.
