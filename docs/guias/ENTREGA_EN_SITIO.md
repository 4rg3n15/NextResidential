# Entrega en sitio · el guion del día

> **ETAPA 15-L (J3).** El orden de la visita de entrega, de principio a fin, en un
> solo documento. Todo se hace desde **el Mac** (consola, superadministrador,
> portero) y **el iPhone** (residente). Ningún paso exige escribir código: lo que
> varía en sitio —IPs, puertos, puerta, canal de video, zona, tiempos— está en
> `apps/api/.env` o en la consola.
>
> Documentos de apoyo: [`INTEGRACION_HIKVISION.md`](INTEGRACION_HIKVISION.md)
> (cada equipo en detalle), [`VALIDACION_HIKVISION_EN_SITIO.md`](VALIDACION_HIKVISION_EN_SITIO.md)
> (la hoja de los 16 escenarios), [`APP_EN_IPHONE.md`](APP_EN_IPHONE.md) (la app
> en el iPhone).

## Índice

- [0 · Antes de salir](#0--antes-de-salir)
- [1 · Arranque de API, consola y go2rtc](#1--arranque-de-api-consola-y-go2rtc)
- [2 · Comprobaciones](#2--comprobaciones)
- [3 · `supabase db push` pendiente](#3--supabase-db-push-pendiente)
- [3 bis · Porteros: número, IP y modo pruebas](#3-bis--porteros-número-ip-y-modo-pruebas)
- [4 · Ensayo](#4--ensayo)
- [5 · Demostración de los tres hitos del reto](#5--demostración-de-los-tres-hitos-del-reto)
- [6 · Reversión](#6--reversión)
- [7 · Plan B por equipo](#7--plan-b-por-equipo)

---

## 0 · Antes de salir

Con Internet, en la oficina:

1. `git pull` de la rama entregada, `pnpm install --frozen-lockfile` y
   `pnpm turbo run build --filter=@ncr/api --filter=@ncr/web --filter=@ncr/providers`.
2. `pnpm sitio:video -- --preparar`: descarga go2rtc para el Mac y deja
   `.sitio/go2rtc.yaml` escrito desde el `.env`. Anote el SHA-256 que imprime.
3. `pnpm sitio:ensayo -- --simulado`: el ensayo entero contra los equipos
   simulados. Tiene que terminar en `VEREDICTO: SIN FALLOS`. Si no, no salga.
4. En `apps/api/.env`, los tres equipos: `BARRERA_*`, `TERMINAL_*`,
   `VIDEOPORTERO_*` (`HOST`, `PUERTO`, `USUARIO`, `CLAVE`, `CANAL`), con el
   usuario de servicio de cada uno. **Sólo en ese fichero**: ni en la hoja, ni en
   un documento, ni en una foto.
5. La app en el iPhone, compilada en Debug desde el Mac ([`APP_EN_IPHONE.md`](APP_EN_IPHONE.md) §2).
6. Una carpeta de sitio **fuera del repositorio**: `mkdir -p $HOME/ncr-sitio`.
   Ahí van el respaldo, los informes y la bitácora. El ensayo se niega a
   escribir dentro del repositorio.
7. Una foto JPEG de **su propia cara** (≤ 200 KB, ≤ 1024 px):
   `$HOME/ncr-sitio/cara.jpg`. Es para el paso 6 del ensayo; se da de alta y de
   baja en la terminal en el acto.

## 1 · Arranque de API, consola y go2rtc

Cada uno en su terminal del Mac, en este orden:

```
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
Ficheros `0600`, uno por equipo. Un documento que lleve una contraseña se guarda
**sin ella** y queda marcado «se restaura a mano».

**Después, las comprobaciones del Mac**, sin mover nada:

```
pnpm sitio:ensayo -- --solo-lectura
```

Al principio imprime:

| Línea                                       | Qué significa                     | Si falla                                                                  |
| ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| API en marcha (127.0.0.1)                   | La API contesta en el propio Mac  | Arránquela (paso 1)                                                       |
| La API contesta por la IP del Mac           | La contestará el iPhone           | Cortafuegos del Mac → permitir conexiones entrantes de `node`             |
| ▶ iPhone: … abra `http://<IP>:3000/health` | La comprobación del iPhone        | Si Safari no la abre, es la red: misma Wi-Fi y **datos móviles apagados** |
| Puente de video (go2rtc)                    | go2rtc contesta                   | `pnpm sitio:video`                                                        |
| Migraciones                                 | La base tiene las del repositorio | Paso 3                                                                    |

Y por cada equipo, los pasos que no mueven nada: conexión, hora y **zona**,
configuración, eventos y video. En la última visita la cámara tenía **reloj y
zona mal**: corríjalos en su panel (Configuración → Sistema → Hora, zona
«(GMT-05:00) Bogotá») antes de seguir. Con la zona mal, las vigencias de los
visitantes se corren horas en la terminal.

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

Equipo por equipo, los ocho pasos. Cuando diga **▶**, haga lo que pide y pulse
Enter; cuando pregunte **?**, mire y conteste `s` o `n`:

| Paso            | Lo que hace usted                                      | OK si…                                                 |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| 1 Conexión      | nada                                                   | el equipo acepta el Digest                             |
| 2 Hora          | nada                                                   | desvío ≤ 60 s y zona UTC−05:00                         |
| 3 Configuración | nada                                                   | la ficha no tiene bloqueos                             |
| 4 Eventos       | pasar el vehículo / acercar la cara / pulsar el timbre | el evento llega **a la plataforma** en el plazo (60 s) |
| 5 Apertura      | mirar la talanquera o la puerta                        | usted confirma que se movió, en < 3 s                  |
| 6 Rostro        | nada (usa `--foto`)                                    | alta de persona y rostro, búsqueda y baja confirmadas  |
| 7 Video         | nada                                                   | H.264 por RTSP en el canal de la ficha                 |
| 8 Audio         | escuchar el videoportero                               | usted oye el pitido                                    |

Cada FALLO trae su causa y **→ la acción**. Corríjala y repita sólo ese equipo:
`pnpm sitio:ensayo -- --equipo=terminal`. Tres avisos importantes:

- **«rechazó el usuario o la clave»**: NO repita. El equipo bloquea la IP del Mac
  tras unos pocos intentos. Corrija el `.env` y espere si ya falló varias veces.
- **«venció el desafío dos veces»** con la API en marcha: dos procesos del Mac
  comparten el mismo nonce del equipo. Espere 30 s y repita el paso.
- **Paso 4 sin evento**: con la API en marcha el ensayo NO se suscribe al equipo
  (le quitaría los eventos a la API); mira si el evento quedó en la base. Si no
  llegó, la acción dice dónde mirar (servidor de alarma de la cámara, líneas
  «escucha:» de `api.log`).

Después, la batería de los 16 escenarios de
[`VALIDACION_HIKVISION_EN_SITIO.md`](VALIDACION_HIKVISION_EN_SITIO.md), fila a
fila en la hoja.

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
leer al capturarlo: a mano). Un respaldo de otro equipo —otra serie— no se
aplica. La hora y la zona **no** se restauran: se dejan bien.

La persona de prueba del paso 6 ya se dio de baja en el ensayo; si el ensayo
dijo lo contrario, bórrela en el panel de la terminal por su número (`ENSAYO…`).

## 7 · Plan B por equipo

Lo que se hace si algo no funciona el día de la entrega. Ninguno exige código.

| Equipo                        | Síntoma                                                           | Plan B                                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cámara**                    | Decide sola (no hay atestación ni «plataforma» en quién controla) | Se demuestra detección y registro (cada placa aparece en Eventos, marcada). La apertura por la plataforma se hace desde Portería con motivo (RN-08). El hito 2 queda **pendiente de la atestación**, dicho así en la hoja.                                                                                                       |
| **Cámara**                    | No llegan eventos                                                 | Servidor de alarma (IP del Mac, puerto 3000, ruta con el secreto) y «Cargar en el servidor de alarmas» marcado. La cámara en `ALARM_SERVER_EQUIPOS` y **reinicio de la API** (esa lista se lee al arrancar).                                                                                                                     |
| **Terminal**                  | La plataforma no contesta a tiempo (API caída, red lenta)         | Por omisión (`TERMINAL_ABRE_SIN_PLATAFORMA=false`) la terminal **no abre sola**: se abre desde la consola (Portería, con motivo) o con la llave. Sólo si el cliente lo pide: `TERMINAL_ABRE_SIN_PLATAFORMA=true`, reinicio de la API y «Corregir → verificación remota» en su ficha. Mientras tanto el motor NO decide: anótelo. |
| **Terminal**                  | La verificación tarda y la terminal niega                         | `TERMINAL_PLAZO_DE_VERIFICACION_S` (1–60) y «Corregir» en la ficha.                                                                                                                                                                                                                                                              |
| **Terminal**                  | El rostro no se sincroniza                                        | Seguimiento por terminal en la consola: el motivo sale en palabras (foto, persona, biblioteca llena). El visitante entra por Portería con motivo, o por placa.                                                                                                                                                                   |
| **Videoportero**              | Sin audio                                                         | Habilitar el audio bidireccional en su panel y «Probar conexión». Si no hay forma: la guardia llama al **teléfono de portería** (configurado en Ajustes) y abre desde la consola.                                                                                                                                                |
| **Videoportero / cualquiera** | Video negro o «sin señal»                                         | «Probar conexión» dice el códec: H.265 → subflujo a H.264 en el panel, o canal `101` en la ficha. ICE: `VIDEO_IP_ANUNCIADA` y `pnpm sitio:video` de nuevo.                                                                                                                                                                       |
| **Cualquiera**                | «Rechazó el usuario o la clave»                                   | No reintentar. Corregir el `.env` y la credencial en la ficha (sólo reemplazable). Si el equipo bloqueó la IP del Mac, esperar su tiempo de bloqueo.                                                                                                                                                                             |
| **El Mac o la red**           | Nada contesta                                                     | Todo el sistema funciona contra los simulados: `PROVEEDOR_DE_EQUIPOS=simulado` y reinicio de la API. La demostración de la plataforma sigue; los hitos con hardware quedan para otra visita, dicho así en la hoja.                                                                                                               |
