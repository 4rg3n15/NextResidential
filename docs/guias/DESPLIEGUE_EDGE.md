# Despliegue del Edge Gateway

**ETAPA 12 · al día con la 15-Q2 (el Edge como puente).** Aprovisionamiento,
identidad de servicio, equipos, rotación de credenciales, reloj, actualización
remota, la prueba de corte de WAN con los equipos de verdad y, en §10, el Edge
como **puente permanente** entre la nube y los equipos.

> **A quién va dirigida.** A quien instala y opera los equipos, no a quien
> escribe el código. Cada paso dice qué hacer, qué tiene que pasar, y qué
> significa si no pasa.

> **15-Q2 · P-27 = A (ADR-035).** El cliente decidió que el Edge es el **puente
> local permanente**: los equipos hablan **sólo** con el Edge y la nube les llega
> a través de él, por un túnel que el Edge abre hacia la API. Es el modo de una
> copropiedad cuyo Edge está **marcado como puente** (§10). Una copropiedad sin
> Edge puente sigue como antes: la API habla directo con los equipos (el modo del
> portátil en sitio, §0–§9). **Con puente, la cámara publica sólo al Edge**:
> nunca configure dos destinos (§10.3).

> **Regla de oro de esta guía.** IPs, usuarios y claves de los equipos van
> **solo** en el `.env` del gateway (RN-21, KPI-11). Nunca en un documento, un
> ticket, un chat ni una captura. Donde esta guía escribe `<…>`, es un marcador.

---

## 0 · Qué es el Edge y qué no es

Es un equipo pequeño en la portería que **decide y abre cuando la nube no
puede**: sin internet, o con la API caída o sin base. Escucha a los mismos
equipos que la nube, en paralelo, y por cada acceso pregunta primero «¿la nube
puede decidir?». Si puede, **no hace nada**: la nube decide y acciona, como
siempre. Si no puede, decide con las reglas que la nube le dio la última vez,
**acciona la barrera o contesta a la terminal**, y guarda el acceso. Cuando
vuelve la conexión, envía todo lo que pasó, exactamente una vez.

Así funciona el Edge **sin** marca de puente (P-27 = B, ADR-034, sustituida en
parte por ADR-035): contingencia, y con WAN la instalación funciona igual que si
el Edge no existiera. **Con la marca de puente** (§10) la nube no alcanza los
equipos más que a través de él: con WAN decide la nube y **ejecuta el Edge**;
sin WAN, o si la nube no contesta a tiempo, decide el Edge con su caché, como
aquí.

Lo que **no** es:

- **No es una copia de la nube.** Guarda una instantánea de reglas (placas,
  autorizaciones, lista negra, zonas e identificadores de plantillas), nunca la
  plantilla biométrica ni la base del conjunto.
- **No es un sistema distinto.** Ejecuta el mismo motor de reglas
  (`@ncr/domain-core`) y habla con los equipos con el mismo paquete que la nube
  (`@ncr/providers`), así que decide lo mismo que habría decidido la nube
  (RN-16). Está probado contra PostgreSQL:
  `apps/api/test/edge-misma-decision-pg.e2e.test.ts`.
- **No decide a medias.** Si no tiene reglas para un caso, **no abre**.
  `CONTINGENCIA_SIN_REGLA=escalar` sin WAN **también niega** (P-28, PENDIENTE
  DE DEFINICIÓN qué significa «escalar» sin nube).

---

## 1 · Prerrequisitos del equipo

| Requisito             | Valor                                         | Por qué                                                                                     |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Node                  | el de `.nvmrc` (22.x)                         | `node:sqlite` viene con el runtime; una versión menor no lo trae (ADR-017)                  |
| Disco persistente     | ≥ 2 GB libres                                 | La bandeja de un corte largo vive ahí. En `tmpfs` se perderían los accesos al reiniciar     |
| Reloj                 | NTP activo                                    | Cada petición a la nube y cada entrada local llevan marca temporal con ventana (§5)         |
| IP fija en la LAN     | la de la VLAN de los equipos                  | Las cámaras publican a esa IP (`EDGE_ESCUCHA_HOST`); si cambia, dejan de llegar los eventos |
| Red hacia los equipos | TCP al puerto HTTP de cada equipo             | El Edge abre la barrera y contesta a la terminal él mismo durante un corte                  |
| Red desde las cámaras | TCP a `EDGE_ESCUCHA_HOST:EDGE_ESCUCHA_PUERTO` | El Alarm Server de la cámara publica al Edge además de a la nube (§2.2)                     |
| Salida a la API       | HTTPS y WSS (el túnel del puente, §10)        | No hace falta entrada desde internet: el Edge llama, nadie le llama desde fuera             |
| Alimentación          | SAI recomendado                               | SQLite se configura con `synchronous = FULL`, pero un corte a mitad de escritura es real    |

**No hace falta compilar nada en el equipo.** Se compila en la máquina de
construcción y al equipo llega `dist/` con sus dependencias. Un módulo nativo
obligaría a `node-gyp` en sitio, y cada forma de que una actualización deje un
gateway sin arrancar es una puerta que no abre.

---

## 2 · Aprovisionamiento, paso a paso

### 2.1 · Dar de alta el Edge en la API (identidad y credencial)

**Uno por gateway**, nunca compartido: cada evento queda atribuido al Edge que
lo produjo (KPI-05) y comprometer un equipo no obliga a rotar los demás (D-16).

La API tiene que tener `INGESTA_FIRMA_SECRETO` (32+ caracteres) en su `.env`:
es la maestra de la que se **derivan** las credenciales de cada Edge.

Con una sesión de **superadministrador** (con MFA):

```bash
curl -sS -X POST "<URL de la API>/copropiedades/<copropiedad>/edge-gateways" \
  -H "Authorization: Bearer <token del superadministrador>" \
  -H 'content-type: application/json' \
  -d '{"nombre":"Edge portería principal"}'
```

**Respuesta (201):** `edgeId`, `copropiedadId`, `nombre`, `credencialRef`
(`env:INGESTA_FIRMA_SECRETO/g1`) y `secreto`.

| De la respuesta | Va a                   |
| --------------- | ---------------------- |
| `edgeId`        | `EDGE_GATEWAY_ID`      |
| `copropiedadId` | `EDGE_COPROPIEDAD_ID`  |
| `secreto`       | `EDGE_INGESTA_SECRETO` |

**El `secreto` se enseña UNA vez.** La nube no lo guarda: lo deriva cuando lo
necesita. Si se pierde, no se recupera: se rota (§4.1). Va al `.env` del equipo
y a ningún otro sitio — ni correo, ni chat, ni el repositorio.

`EDGE_SERVICE_USER_ID` es el usuario de servicio con el que la nube atribuye lo
que el Edge hace. Se lee de la fila recién creada:

```sql
SELECT usuario_servicio_id FROM public.edge_gateways WHERE id = '<edgeId>';
```

> **El Edge ya no usa ninguna llave de Supabase** (desde la 15-Q habla solo con
> la API). Si un `.env` antiguo conserva `SUPABASE_SECRET_KEY`, bórrela del
> equipo y **revóquela** en el panel de Supabase: es una llave que omite la RLS
> guardada en un equipo de portería. `pnpm entorno:diff` la señala.

### 2.2 · Los equipos que el Edge escucha y acciona (`EDGE_EQUIPOS`)

Una lista JSON, **en una sola línea y entre comillas simples** en el `.env`
(así ni el `#` ni las comillas dobles de una clave rompen la línea). Por cada
equipo:

| Campo                | Qué es                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `dispositivoId`      | El UUID del equipo en Next Control (consola → Dispositivos). Tiene que ser el mismo      |
| `tipo`               | `camara_lpr`, `terminal_facial` o `intercom`                                             |
| `host`, `puerto`     | Dónde contesta el equipo en la LAN (`puerto` 80 por omisión; `protocolo` `http`/`https`) |
| `usuario`, `clave`   | Usuario de servicio **del equipo** (§2.2.1)                                              |
| `canalBarrera`       | Cámara: la salida que abre la barrera                                                    |
| `numeroDePuerta`     | Terminal / videoportero: la puerta que abre                                              |
| `secretoAlarmServer` | Solo cámaras, 32+ caracteres (`openssl rand -hex 24`): lo que la cámara pone en la URL   |

#### 2.2.1 · Un usuario propio del Edge en cada equipo

Recomendado: no reutilice el de la API. Un usuario bloqueado por intentos
fallidos deja sin servicio a quien lo usa, y con uno por cliente el bloqueo de
uno no tumba al otro; además la bitácora del equipo dice quién pidió qué.

#### 2.2.2 · La cámara publica a los dos (sólo SIN puente)

> **Con el Edge como puente esta sección NO aplica**: la cámara publica sólo al
> Edge (§10.3), y [SUPUESTO] S-184 queda retirado.

En la configuración del Alarm Server (escucha HTTP) de la cámara, **deje el
destino de la API como está** y añada un segundo destino:

```
http://<EDGE_ESCUCHA_HOST>:<EDGE_ESCUCHA_PUERTO>/alarm-server/<secretoAlarmServer>
```

El Edge exige el secreto de **esa** cámara **y** que la publicación venga del
`host` declarado para ella. La cámara no sabe firmar HMAC, así que secreto y
origen son la credencial ([CONTRADICCIÓN] C-50).

> **[SUPUESTO] S-184 · verificar en sitio.** Se asume que el modelo admite dos
> destinos de Alarm Server. Si solo admite uno, **el Edge no oirá a la cámara**
> y durante un corte la barrera vehicular quedará sin decidir (la terminal
> facial no se ve afectada: el Edge la escucha por su propio flujo de eventos).
> Repórtelo antes de seguir: la alternativa es una decisión de diseño.

#### 2.2.3 · Terminal y videoportero

No hay nada que configurar en ellos: el Edge abre su **propia** suscripción al
flujo de eventos, en paralelo a la de la nube, y la rearma cada
`ESCUCHAS_REARME_SEGUNDOS` si se corta. Algunos modelos limitan las
suscripciones simultáneas: §2.5 dice cómo comprobar que la del Edge entró.

### 2.3 · Preparar el fichero de configuración

```bash
sudo mkdir -p /etc/next-control /var/lib/next-control
sudo cp apps/edge/.env.example /etc/next-control/edge.env
sudo chmod 600 /etc/next-control/edge.env    # solo root lo lee
sudo $EDITOR /etc/next-control/edge.env      # rellene los valores
```

Cada variable está explicada en el propio `.env.example`. Obligatorias: las de
identidad y nube (§2.1), `EDGE_EQUIPOS`, `EDGE_ESCUCHA_HOST` (la IP de **una**
interfaz; `0.0.0.0` y `::` se rechazan) y `EDGE_LOCAL_SECRETO` (32+
caracteres, distinto de `EDGE_INGESTA_SECRETO`). El resto tiene valor por
omisión.

### 2.4 · Diagnóstico antes (y después) de arrancar: `pnpm sitio:edge`

Desde el repositorio, con el `.env` del gateway:

```bash
pnpm sitio:edge -- --env=/etc/next-control/edge.env
```

En el propio equipo, ya compilado y sin pnpm:

```bash
node --env-file=/etc/next-control/edge.env /opt/next-control/edge/dist/diagnostico-de-sitio.js
```

Usa el **mismo código** que el gateway (validador, cliente firmado, diagnóstico
de equipos de `providers`, SQLite). **Solo lee**: no guarda la descarga ni
acciona ningún equipo. **No imprime IPs, usuarios ni claves.** Salida: `0` sin
fallos, `1` algún FALLO, `2` configuración incompleta.

| Línea              | OK significa                                           | Si no                                                                                                              |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| configuración      | el esquema del gateway la acepta                       | Dice qué variable falta, por su nombre                                                                             |
| escucha local      | `EDGE_ESCUCHA_HOST` es una IP de este equipo           | FALLO: las cámaras no podrán publicar al Edge                                                                      |
| nube               | `/ready` contesta y el reloj se desvía ≤ 60 s          | AVISO sin enlace; FALLO si el reloj se desvía más (§5)                                                             |
| identidad y reglas | credencial aceptada, reglas íntegras de SU copropiedad | 401 → identidad/credencial/reloj (§4.1, §5); 404 → otra copropiedad                                                |
| `<tipo> <uuid>`    | el equipo contesta, con su clave, y en hora            | «no hay un equipo», «credencial rechazada» (**no reintente**: bloquea la cuenta), «la cámara decide por su cuenta» |
| gateway en marcha  | el proceso contesta `/estado` firmado                  | AVISO si no está en marcha; FALLO si `EDGE_LOCAL_SECRETO` no es el suyo                                            |
| base local         | reglas en caché, recientes, nada sin reconciliar       | AVISO sin reglas (en un corte se negaría todo); FALLO si la caché va por delante de la nube (§4.4)                 |

### 2.5 · Primer arranque

```bash
node --env-file=/etc/next-control/edge.env /opt/next-control/edge/dist/main.js
```

**Lo que tiene que pasar** (registro JSON, una línea por suceso):

```json
{"nivel":"info","mensaje":"edge escuchando en la red del conjunto","contexto":{"puerto":8080,"equipos":3}}
{"nivel":"info","mensaje":"escuchas de equipos","contexto":{"activas":2}}
{"nivel":"info","mensaje":"reglas","contexto":{"estado":"nueva","version":12}}
```

- `activas` tiene que ser el número de terminales y videoporteros de
  `EDGE_EQUIPOS`. Menos significa que un equipo rechazó la suscripción del Edge
  (credencial, o el límite de suscripciones del modelo).
- `reglas · nueva` es la primera descarga. Sin ella, el Edge **no tiene con qué
  decidir** en un corte.

**Si falta una variable, NO arranca** y dice cuál. Es lo correcto: un gateway a
medias decide con reglas incompletas durante un corte y nadie se entera hasta
que alguien no puede entrar — o hasta que entra quien no debía.

### 2.6 · Como servicio del sistema

```ini
# /etc/systemd/system/next-control-edge.service
[Unit]
Description=Next Control · Edge Gateway
After=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/next-control/edge.env
ExecStart=/usr/bin/node /opt/next-control/edge/dist/main.js
Restart=always
RestartSec=5
# El gateway no necesita ser root para abrir el 8080 ni para escribir su base.
User=next-control
StateDirectory=next-control

[Install]
WantedBy=multi-user.target
```

`Restart=always` con `RestartSec=5`: si el proceso muere, vuelve en cinco
segundos **y la bandeja sigue ahí**, porque está en disco.

---

## 3 · Verificación en sitio

Hágalas todas la primera vez. La §9 —el corte de verdad— es la que demuestra que
el equipo sirve para lo que se compró.

### 3.1 · Con WAN, el Edge no actúa

Pase un vehículo registrado por la cámara. Tiene que abrir **la nube**, como
antes de instalar el Edge. En `pnpm sitio:edge`: `0 accesos sin reconciliar`, y
en la nube el evento con `decidido_por_edge = false`. Si el Edge también
accionó, la sonda contra la nube está fallando (revise `NEXT_CONTROL_API_URL`).

### 3.2 · Decide (entrada local firmada)

`POST /hechos` decide un hecho ya normalizado con la caché local. **No acciona
ningún equipo**, pero **sí deja un acceso** que se reconcilia: use un
`dispositivoId` de pruebas. La entrada exige firma, marca temporal y nonce
(Q5); este comando los calcula con el código del propio gateway:

```bash
cd /opt/next-control/edge
CUERPO='{"dispositivoId":"<uuid de la cámara>","metodo":"placa","referenciaExterna":"prueba-0001","confianza":0.95,"placaLeida":"ABC123"}'
node --env-file=/etc/next-control/edge.env -e '
const { firmaLocal } = require("./dist/infraestructura/http/proteccion-local.js");
const cuerpo = process.argv[1];
const marca = String(Math.floor(Date.now() / 1000));
const nonce = require("node:crypto").randomBytes(12).toString("hex");
const firma = firmaLocal(process.env.EDGE_LOCAL_SECRETO, marca, nonce, "POST", "/hechos", cuerpo);
const destino = `http://${process.env.EDGE_ESCUCHA_HOST}:${process.env.EDGE_ESCUCHA_PUERTO ?? 8080}/hechos`;
fetch(destino, { method: "POST", body: cuerpo, headers: {
  "x-ncr-marca-temporal": marca, "x-ncr-nonce": nonce, "x-ncr-firma": firma } })
  .then((r) => r.text()).then(console.log);' "$CUERPO"
```

**Esperado:** `{"permitido":…,"motivo":…,"versionDeReglas":N,"porContingencia":false,…}`.
Sin firma, con la marca fuera de 60 s o con un nonce repetido: `401`.

### 3.3 · Reconcilia

Deje pasar un minuto y busque en el registro
`{"mensaje":"bandeja reconciliada","contexto":{"enviados":1,…}}`. En la nube,
el evento está con la hora en que ocurrió y `decidido_por_edge = true`.

### 3.4 · Sobrevive a un reinicio con la bandeja llena

Durante el corte de la §9, antes de reconectar:
`sudo systemctl restart next-control-edge`. Los accesos siguen en la bandeja y
se envían igual. Si se perdieron, `SQLITE_PATH` está en un sistema volátil.

### 3.5 · Deniega lo que no sabe

El mismo comando de §3.2 con `"placaLeida":"NOEXISTE"` y otra
`referenciaExterna`. **Esperado: `permitido: false`.**

---

## 4 · Credenciales y caché

### 4.1 · Rotar la credencial de un Edge

```bash
curl -sS -X POST "<URL de la API>/copropiedades/<copropiedad>/edge-gateways/<edgeId>/credencial" \
  -H "Authorization: Bearer <token del superadministrador>"
```

Devuelve un `secreto` nuevo (`credencialRef` pasa a `…/g<N+1>`). **La
credencial anterior deja de valer en ese instante**: no hay ventana con las
dos. Por eso, **inmediatamente**:

1. Cambie `EDGE_INGESTA_SECRETO` en `/etc/next-control/edge.env`.
2. `sudo systemctl restart next-control-edge`.
3. `pnpm sitio:edge`: `identidad y reglas · OK`.

Entre la rotación y el paso 2 el Edge sigue decidiendo con su caché; lo que reconcilie
recibe `401`, **se queda en la bandeja** y se reintenta con retroceso. No se
pierde nada; solo se retrasa.

### 4.2 · La maestra de la API (`INGESTA_FIRMA_SECRETO`)

Todas las credenciales de los Edge se derivan de ella: **cambiarla invalida
todas a la vez**. Hágalo en una ventana de mantenimiento: cambie la maestra en
la API y reiníciela; después, por cada Edge, §4.1 (rotar devuelve la credencial
derivada de la maestra nueva). Mientras tanto, los Edge acumulan en la bandeja.

### 4.3 · Los secretos locales

- **`EDGE_LOCAL_SECRETO`**: cámbielo en el `.env` y reinicie. Quien llame a
  `/hechos` o `/estado` tiene que usar el nuevo.
- **`secretoAlarmServer` de una cámara**: cámbielo en `EDGE_EQUIPOS` **y** en la
  URL del destino Edge de la cámara (§2.2.2). Hasta que coincidan, las
  publicaciones de esa cámara al Edge reciben `401`; las de la nube no cambian.

### 4.4 · Reiniciar la caché de reglas

La versión de reglas del Edge **solo avanza** (Q2). Si la base de la nube se
restauró de una copia, la nube puede ir por detrás: el Edge rechaza lo que le
baja y se queda con reglas que ya no existen. Síntomas: `pnpm sitio:edge` dice
«la caché va por delante de la nube», o el registro muestra `reglas` con
`la nube respondió 409`.

**Con WAN** (sin ella se quedaría sin reglas y negaría todo):

```bash
sudo systemctl stop next-control-edge
sudo sqlite3 /var/lib/next-control/edge.sqlite 'DELETE FROM reglas_en_cache;'
sudo systemctl start next-control-edge
```

Esperado: `reglas · nueva` en el registro. La bandeja es otra tabla: **no se
toca**.

### 4.5 · Si se pierde un equipo

1. **Rote su credencial** (§4.1) y no la instale en ningún sitio: la robada
   deja de valer.
2. Desactívelo en la nube:

   ```sql
   UPDATE public.edge_gateways
      SET estado = 'inactivo', desactivado_en = now(),
          desactivado_por = '<su usuario>', motivo_desactivacion = 'equipo perdido'
    WHERE id = '<edgeId>';
   ```

3. **Cambie las claves de los usuarios de servicio de los equipos** que tenía
   en `EDGE_EQUIPOS`, y los `secretoAlarmServer` de las cámaras: viajaban en su
   `.env`.
4. **No borre sus eventos.** Son un histórico inmutable (RN-03).
5. Aprovisione uno nuevo con identidad nueva (§2.1). **No reutilice
   `EDGE_GATEWAY_ID`.**

---

## 5 · Sincronización de reloj

**No es higiene: es un requisito de funcionamiento.**

- Hacia la nube, cada petición va firmada sobre
  `<marca>.<MÉTODO> <ruta>\n<cuerpo>`, con ventana **simétrica** de
  `INGESTA_VENTANA_SEGUNDOS` en la API (300 s por omisión).
- Las entradas locales (`/hechos`, `/estado`) admiten **60 s**.
- Las vigencias se juzgan con la hora del Edge: un reloj desviado abre o niega
  fuera de horario.

Un gateway que pasa 24 horas sin WAN pasa 24 horas sin NTP, y su deriva puede
sacarlo de la ventana **justo cuando intenta reconciliar**. El síntoma no se
parece a la causa: un `401` con una credencial correcta.

```bash
sudo timedatectl set-ntp true
timedatectl status | grep -E 'synchronized|NTP service'
```

**Esperado:** `System clock synchronized: yes` y `NTP service: active`. Con la
red del conjunto aislada, use un NTP interno (`/etc/systemd/timesyncd.conf`,
`NTP=<servidor interno>`). `pnpm sitio:edge` mide el desvío frente a la nube
(FALLO a partir de 60 s) y el de cada equipo.

---

## 6 · Actualización remota

### 6.1 · Antes de actualizar

`pnpm sitio:edge`: **`0 accesos sin reconciliar`**. Con la bandeja llena la
actualización es segura igualmente —está en disco—, pero si algo sale mal habrá
que diagnosticar dos cosas a la vez.

### 6.2 · Actualizar

```bash
sudo systemctl stop next-control-edge
sudo cp -r /opt/next-control/edge /opt/next-control/edge.anterior
sudo cp -r nueva-version/* /opt/next-control/edge/
sudo systemctl start next-control-edge
sudo journalctl -u next-control-edge -n 50 --no-pager
```

**No se toca `/var/lib/next-control/`.** Ahí viven la bandeja y la caché.

### 6.3 · Volver atrás

```bash
sudo systemctl stop next-control-edge
sudo cp -r /opt/next-control/edge.anterior/* /opt/next-control/edge/
sudo systemctl start next-control-edge
```

Si una versión cambia el esquema de SQLite, la nota de versión lo dirá y el
rollback exigirá restaurar la base — por eso §6.1 antes.

### 6.4 · Por fases

Nunca todos los equipos a la vez: **uno primero, 24 horas, y el resto**. Es el
tiempo que tarda en aparecer un fallo que solo se manifiesta tras un corte.

---

## 7 · Diagnóstico de fallos frecuentes

Lo primero, siempre: `pnpm sitio:edge`.

| Síntoma                                     | Causa probable                              | Qué hacer                                                            |
| ------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| No arranca y dice qué variable falta        | Configuración incompleta                    | Rellénela. El mensaje da el nombre exacto                            |
| `identidad y reglas · FALLO` con 401        | Credencial rotada, Edge desactivado o reloj | §4.1 y §5                                                            |
| `identidad y reglas · FALLO` con 404        | `EDGE_COPROPIEDAD_ID` no es la del Edge     | Corríjala; queda registrado como acceso cruzado (RN-15)              |
| La bandeja crece y no baja con WAN          | Firma rechazada                             | §5 (reloj) y §4.1                                                    |
| Sin WAN, la barrera no abre a nadie         | La cámara no publica al Edge                | §2.2.2 (segundo destino y su secreto); `escucha local` en sitio:edge |
| Sin WAN, la barrera no abre a quien debería | Sin reglas en caché o reglas viejas         | `base local` en sitio:edge; con WAN, espere `reglas · nueva`         |
| `activas` menor que las terminales          | La terminal rechazó la suscripción del Edge | Credencial del usuario del Edge en el equipo; límite del modelo      |
| Con WAN, abren nube **y** Edge              | La sonda contra la nube falla               | `NEXT_CONTROL_API_URL`; `nube` en sitio:edge                         |
| `la caché va por delante de la nube`        | La base de la nube se restauró              | §4.4                                                                 |
| Se pierden accesos al reiniciar             | `SQLITE_PATH` en `tmpfs`                    | Muévalo a disco persistente                                          |
| Modo cambiando sin parar                    | Enlace intermitente                         | Suba `SONDAS_PARA_CAER` (3 por omisión)                              |
| Todo marcado `cachePotencialmenteObsoleto`  | Lleva más de `CACHE_OBSOLETA_MINUTOS` solo  | Informativo: **sigue decidiendo** (KPI-30, KPI-31)                   |

---

## 8 · Lista de comprobación del despliegue

- [ ] Node de la versión de `.nvmrc`; `SQLITE_PATH` en disco persistente
- [ ] NTP activo y sincronizado; IP fija en la VLAN de equipos
- [ ] Edge dado de alta en la API (§2.1); credencial solo en el `.env`
- [ ] Sin `SUPABASE_SECRET_KEY` en el equipo (y revocada si la hubo)
- [ ] `EDGE_EQUIPOS` con un usuario propio del Edge en cada equipo
- [ ] Cada cámara con el segundo destino de Alarm Server hacia el Edge
- [ ] `.env` con permisos `600`; servicio de systemd con `Restart=always`
- [ ] `pnpm sitio:edge` sin FALLO, con el gateway en marcha
- [ ] Registro: `escuchas de equipos` con todas las terminales; `reglas · nueva`
- [ ] §3.1 con WAN no actúa · §3.2 decide · §3.3 reconcilia · §3.5 deniega
- [ ] **§9 superada: 30 minutos de corte, 20 accesos, los 20 una sola vez en < 5 min**
- [ ] §3.4 superada durante el corte
- [ ] Rotación (§4.1) probada una vez en pruebas, no la primera vez en producción

---

## 9 · El corte de WAN de verdad, con los equipos (DoD de la ETAPA 12 en sitio)

La misma prueba que corre en CI contra los equipos simulados
(`apps/api/test/edge-en-sitio-pg.e2e.test.ts`), repetida cortando el WAN de
verdad. Necesita dos personas: una en la portería y otra con la consola.

### 9.1 · Antes de cortar

1. `pnpm sitio:edge` sin FALLO, con el gateway en marcha y `0 accesos sin
reconciliar`.
2. Registro del gateway abierto: `journalctl -u next-control-edge -f`.
3. Prepare **20 accesos** que cubran: vehículos de residentes, una visita
   vigente con placa, una placa en lista negra, una placa desconocida y, si hay
   terminal, rostros con plantilla sincronizada. Anote la hora de inicio.

### 9.2 · Cortar

Desconecte la salida a internet en el enrutador (no el cable del Edge: tiene que
seguir viendo a los equipos). **Si la API corre en un equipo de la propia red
del conjunto**, el corte que cuenta es entre el Edge y la API: detenga la API o
desconecte su equipo.

**Esperado en ~45 s:** `el enlace cambió de modo` con `"modo":"autonomo"`.

### 9.3 · Durante 30 minutos

Haga los 20 accesos, repartidos. Por cada uno, en el registro:
`acceso resuelto por el Edge sin nube` con `permitido` y `accionamiento`.

- Permitidos: **la barrera abre** (`accionamiento: "aceptada"`).
- Lista negra y desconocida: **no abre** y la terminal recibe «negar».
- Con `accionamiento: "inalcanzable"`, el Edge decidió pero no llegó al equipo:
  anótelo; el acceso igual queda en la bandeja.

Hacia el minuto 20, haga §3.4 (reinicio con la bandeja llena). Al final,
`pnpm sitio:edge`: `20 accesos sin reconciliar`.

### 9.4 · Reconectar

Restablezca el WAN. **En menos de 5 minutos:** `"modo":"en_linea"` y
`bandeja reconciliada`; `pnpm sitio:edge`: `0 accesos sin reconciliar`.

### 9.5 · Comprobar en la nube: exactamente una vez

```sql
SELECT count(*)                           AS accesos,
       count(DISTINCT clave_idempotencia) AS distintos,
       bool_and(decidido_por_edge)        AS todos_del_edge,
       min(ocurrido_en), max(ocurrido_en)
  FROM public.eventos
 WHERE copropiedad_id = '<copropiedad>'
   AND decidido_por_edge
   AND ocurrido_en BETWEEN '<inicio del corte>' AND '<fin del corte>';
```

**Esperado:** `accesos = distintos = 20`, `todos_del_edge = true`, y las horas
de los accesos, **no** la de la reconexión. Y las aperturas, atribuidas al Edge:

```sql
SELECT count(*) FROM public.eventos_de_equipo
 WHERE copropiedad_id = '<copropiedad>' AND tipo = 'apertura_ordenada'
   AND carga->>'edgeId' = '<edgeId>' AND ocurrido_en >= '<inicio del corte>';
```

**Esperado:** tantas como accesos permitidos.

**Si aparecen 40, pare**: la clave de idempotencia no funciona. **Si aparecen con
la hora de la reconexión, pare también**: el histórico sería inservible para
auditar.

### 9.6 · Hoja de resultados

| Comprobación                                      | Esperado       | Obtenido | OK  |
| ------------------------------------------------- | -------------- | -------- | --- |
| Paso a `autonomo` tras cortar                     | ≤ 60 s         |          |     |
| Accesos resueltos sin WAN                         | 20             |          |     |
| Barrera abierta a los permitidos                  | todos          |          |     |
| Barrera cerrada a lista negra y desconocida       | todos          |          |     |
| Reinicio durante el corte sin pérdida             | 20 en bandeja  |          |     |
| Paso a `en_linea` y bandeja vacía tras reconectar | < 5 min        |          |     |
| Eventos en la nube                                | 20, una vez    |          |     |
| Horas de los eventos                              | las del acceso |          |     |
| Aperturas atribuidas al Edge                      | = permitidos   |          |     |

---

## 10 · El Edge como PUENTE (15-Q2, ADR-035)

La API va en la nube (Cloud Run) y **no tiene ruta** hacia la red privada del
conjunto. El único camino lo abre el Edge, **hacia fuera**: un WebSocket
persistente a `wss://<API>/edge/tunel`, autenticado con su propia credencial
(la de §2.1: HMAC con marca temporal y nonce de un solo uso). Por ese túnel van
las órdenes de la consola (abrir por punto con motivo, plantillas de rostro,
«Probar conexión», diagnóstico, salidas, reloj), las credenciales de los
equipos, el audio de la guardia y la negociación del video. Los eventos de los
equipos llegan **sólo** al Edge, que los reenvía.

**Un solo actor por acceso.** Con la nube viva, la nube DECIDE y el Edge
EJECUTA y confirma. Si la nube no contesta en `EDGE_PLAZO_NUBE_MS`, decide el
Edge con su caché, acciona, sella la versión de reglas y lo guarda para
reconciliar (§9). Nunca los dos.

### 10.1 · Variables del Edge puente

| Variable             | Valor                                          | Notas                                                        |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| `EDGE_TUNEL`         | `activo`                                       | `inactivo` (o vacía) = el Edge de §0–§9, sin túnel           |
| `EDGE_EQUIPOS_LLAVE` | 32 bytes en base64 (`openssl rand -base64 32`) | Cifra las credenciales en el SQLite. **Fuera** de su carpeta |
| `EDGE_PLAZO_NUBE_MS` | vacía = `2500`                                 | Cuánto espera la decisión de la nube por cada acceso         |
| `EDGE_GO2RTC_URL`    | vacía = `http://127.0.0.1:1984`                | El go2rtc que corre **junto** al Edge (§10.7)                |
| `EDGE_EQUIPOS`       | puede ir **vacía**                             | Con puente, los equipos llegan desde la consola por el túnel |

`EDGE_EQUIPOS_LLAVE` va en el almacén de secretos del sistema o en el `.env`
de la máquina, **nunca** en la misma carpeta que `SQLITE_PATH` ni en una copia
de respaldo del SQLite. Si se pierde, las credenciales cifradas no se leen: el
Edge no arranca y lo dice («no se abre con EDGE_EQUIPOS_LLAVE»). Restaure la
llave o, con una nueva y un SQLite vacío, vuelva a dar las claves desde la
consola (§10.5).

### 10.2 · Registrar el Edge y marcarlo como puente

1. Alta del Edge en la API: igual que §2.1 (superadministrador con MFA).
2. Arranque el Edge con `EDGE_TUNEL=activo` (§2.5–§2.6). En su registro:
   `túnel con la nube abierto`. **Si no aparece**, el registro dice por qué:
   código `4401` (credencial), `4403` (no es el puente de la copropiedad),
   `4404` (otra copropiedad), `4409` (ya hay otro Edge conectado).
3. Consola → **Dispositivos** → panel **Edge del conjunto** → **Usar como
   puente** (sólo superadministrador). Desde ese momento, todo lo que la consola
   pida a un equipo de esta copropiedad va por el túnel.
4. Compruebe: el panel dice **«Conectado desde …»** y **«Puente de los
   equipos»**; `GET /ready` de la API dice `edge: 1 conectado(s)`.

Un solo Edge puente por copropiedad (lo impone la base) y un solo túnel
conectado: un segundo Edge que intente abrir túnel para la misma copropiedad se
rechaza (`4409`) y queda en `auditoria_seguridad`.

Si el túnel se cae más de 30 s, cada equipo del conjunto recibe una alerta
«dispositivo caído» (RN-18). Es **persistente**: una por equipo mientras siga
abierta, y **no se cierra sola** al volver el túnel; la resuelve o archiva un
operador (el panel ya dirá «Conectado desde …»).

### 10.3 · La cámara publica SÓLO al Edge

En el Alarm Server (escucha HTTP) de la cámara, **un único destino**:

```
http://<EDGE_ESCUCHA_HOST>:<EDGE_ESCUCHA_PUERTO>/alarm-server/<secreto de la cámara>
```

El secreto de la cámara lo emite la consola al darla de alta y el Edge lo
recibe por el túnel: **no** hace falta escribirlo en `EDGE_EQUIPOS`. Borre el
destino de la API si existía: con puente, la API ya no se suscribe a los
equipos de esta copropiedad (B3), y un segundo destino sólo produciría
publicaciones que nadie atiende.

Terminal y videoportero: el Edge se suscribe a su flujo de eventos; la API no.

### 10.4 · Un usuario de servicio por equipo

Cree en cada equipo un usuario propio del Edge, con el **mínimo privilegio**
que su función exige (abrir puerta / relé, gestionar plantillas, audio), y dé
de alta el equipo **desde la consola** con ese usuario y su clave. La clave:

- viaja consola → API → túnel → Edge, **sin** guardarse en la nube ni aparecer
  en registros, respuestas o errores;
- el Edge la cifra con `EDGE_EQUIPOS_LLAVE` (AES-256-GCM) y contesta si, con
  ella, el equipo autentica;
- en la nube queda `edge:<gateway>` y una **huella** (HMAC) que dice si cambió,
  nunca cuál es.

Con el túnel caído, el alta falla **antes** de escribir nada («el Edge del
conjunto no está conectado»); si el túnel cae **a mitad**, el alta se deshace
con una baja lógica y se puede reintentar.

### 10.5 · Mudar al Edge las credenciales que ya estaban en la nube

Para un conjunto que funcionaba en modo directo (las claves estaban cifradas en
la nube, H-15B-1 · `docs/seguridad/ACEPTACIONES_DE_RIESGO.md`):

1. Edge conectado y marcado como puente (§10.2).
2. Panel **Edge del conjunto** → **Mudar credenciales al Edge**
   (superadministrador).
3. Por cada equipo, la API entrega la clave al Edge; el Edge la guarda y prueba
   que el equipo autentica con ella; **sólo entonces** la nube borra sus bytes
   (la fila queda, sin bytes, como historial: RN-19).
4. El panel dice cuántas se mudaron y, de las que siguen en la nube, **por
   qué** (equipo apagado, credencial rechazada…). Corrija y repita: lo ya mudado
   no se toca.

Comprobación en la base (no debe quedar ninguna con bytes):

```sql
SELECT d.nombre, c.trasladada_al_edge IS NOT NULL AS en_el_edge,
       c.iv IS NULL AND c.cuerpo IS NULL AND c.etiqueta IS NULL AS sin_bytes
  FROM public.credenciales_de_equipo c JOIN public.dispositivos d ON d.id = c.dispositivo_id
 WHERE c.copropiedad_id = '<copropiedad>' AND c.trasladada_en IS NOT NULL;
```

### 10.6 · Volver al modo directo (reversión)

1. Panel **Edge del conjunto** → **Quitar puente**. La API vuelve a hablar
   directo con los equipos **de esta copropiedad** (sólo si tiene ruta hacia
   ellos: el portátil en sitio, no Cloud Run).
2. Edite **cada** equipo desde la consola y vuelva a escribir su clave. Se
   cifra en la nube y su referencia vuelve a la bóveda (`vault:equipos/<id>`),
   sin huella. Hasta que lo haga, ese equipo **no tiene credencial en la nube**:
   la base no puede inventarla.
3. Vuelva a configurar la cámara para publicar a la API (§2.2.2).

`supabase/reversion/0050_revert.sql` revierte el **esquema**, no esto: se niega
mientras quede una referencia `edge:`, y también si hubo algún traslado, porque
las filas trasladadas se conservan sin bytes como historial. Sin puentes, la
0050 aplicada ya se comporta como el modo directo.

### 10.7 · go2rtc junto al Edge, y STUN/TURN

El video de los equipos lo sirve un **go2rtc en la misma máquina que el Edge**
(`EDGE_GO2RTC_URL`): la URL RTSP lleva la credencial del equipo y no sale del
conjunto. La consola negocia contra la API (sesión, rol y copropiedad
validados) y la oferta viaja por el túnel al go2rtc local, que contesta el SDP.
El **medio** va entre el navegador y ese go2rtc por ICE:

- En el `go2rtc.yaml` del Edge: `api: listen: "127.0.0.1:1984"` (sólo local) y
  `webrtc: listen: ":8555"` con los mismos STUN/TURN que la API entrega a la
  consola (`webrtc: ice_servers:`).
- En la API: `WEBRTC_STUN_URLS`, `WEBRTC_TURN_URLS`, `WEBRTC_TURN_SECRETO`
  (el `static-auth-secret` del TURN) y `WEBRTC_TURN_TTL_SEGUNDOS`. La consola
  recibe una credencial TURN **efímera** por usuario; el secreto no sale de la
  API.

> **P-29 resuelta (15-R):** el TURN es un **coturn en Compute Engine**, con
> credenciales efímeras que firma la API. Configuración, cortafuegos, secreto y
> verificación: [`COTURN.md`](COTURN.md). Sin desplegar todavía: hasta que se
> despliegue, el video funciona en la red del conjunto (y por STUN en NAT
> sencillos) y **no** desde redes que lo bloqueen. Para el go2rtc de esta
> máquina basta, en principio, **STUN** (S-15R-08, `COTURN.md` §7.4).

### 10.8 · El corte de WAN con puente

La prueba de §9 vale igual, con una diferencia en lo que se ve:

- **Con WAN:** cada acceso lo decide la nube: en el registro del Edge **no**
  aparece `acceso resuelto por el Edge sin nube`, y la barrera abre por la
  orden de la nube (una sola apertura por acceso).
- **Al cortar:** el túnel se cierra; el panel de la consola pasa a
  **«Desconectado desde …»**; las órdenes desde la consola fallan con «el Edge
  del conjunto no está conectado» (503), y el Edge decide solo.
- **Al volver:** el túnel se reabre solo (retroceso con dispersión) y la bandeja
  se reconcilia exactamente una vez (§9.5).

> **Antes de cortar, compruebe que el Edge tiene reglas.** Un Edge sin
> instantánea niega todo por `FALLO_TECNICO`, como debe. **Deuda DT-15Q2-02:** > `pnpm sitio:edge` todavía no conoce el modo puente (exige `EDGE_EQUIPOS` y no
> lee el registro cifrado); hasta que lo haga, compruebe las reglas en el
> registro del Edge (la línea `reglas` con `estado: nueva` y su versión) y los equipos en el
> panel de la consola.

### 10.9 · Lista de comprobación del puente

- [ ] `EDGE_TUNEL=activo` y `EDGE_EQUIPOS_LLAVE` fuera de la carpeta del SQLite.
- [ ] `túnel con la nube abierto` en el registro; panel «Conectado desde …».
- [ ] Marcado como puente; `/ready` de la API: `edge: 1 conectado(s)`.
- [ ] Cámara con **un solo** destino: el Edge.
- [ ] Cada equipo con su usuario de servicio, dado de alta desde la consola.
- [ ] Credenciales heredadas mudadas; la consulta de §10.5 sin filas con bytes.
- [ ] go2rtc local escuchando sólo en `127.0.0.1:1984`; STUN/TURN iguales en
      go2rtc y en la API.
- [ ] Corte de WAN de §9 / §10.8 superado.
