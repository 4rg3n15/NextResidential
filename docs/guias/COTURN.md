# TURN propio con coturn en Compute Engine

> **Ronda 15-R · F3 · P-29 resuelta por el cliente:** el TURN es un **coturn en
> una máquina de Compute Engine**. Esta ronda deja **la configuración y esta
> guía**; **no despliega nada**. Ningún TURN real se probó todavía: la
> verificación de §7 es trabajo de quien lo despliegue, y queda registrada como
> deuda en `docs/etapas/ETAPA-15R.md`.

---

## 1 · Para qué sirve, y para qué NO

La consola ve el video del conjunto por WebRTC: la API negocia la sesión y el
**medio** viaja entre el navegador del operador y el go2rtc que corre junto al
Edge (`DESPLIEGUE_EDGE.md` §10.7). Si los dos extremos están detrás de NAT que
no se dejan atravesar —redes móviles, redes corporativas, NAT simétrico—, hace
falta un tercero con IP pública que **retransmita**: eso es el TURN.

- **Sí sirve para:** que el operador vea y escuche desde fuera del conjunto.
- **No está en el camino de abrir una puerta.** La decisión la toma la nube o
  el Edge y la ejecuta el equipo (_Next Control decide, el hardware ejecuta_).
  Si el TURN cae, se pierde el video desde redes difíciles; **ningún acceso
  deja de decidirse ni de registrarse**.

## 2 · Lo que ya existe en el código

La API entrega a la consola los servidores ICE con una credencial **efímera**
por usuario, por el mecanismo REST de coturn (`use-auth-secret`):

- usuario `<expira>:<usuarioId>` y clave `base64(HMAC-SHA1(secreto, usuario))`
  (`apps/api/src/guardia/infraestructura/servidores-ice-de-configuracion.ts`);
- el secreto **no sale de la API**: lo que recibe el navegador deja de servir
  solo a los `WEBRTC_TURN_TTL_SEGUNDOS` (10 min por omisión);
- un TURN sin secreto, o un secreto sin TURN, **no arranca**
  (`configuracion/esquema-de-ice.ts`).

| Variable de la API         | Valor                                                                            |
| -------------------------- | -------------------------------------------------------------------------------- |
| `WEBRTC_STUN_URLS`         | `stun:turn.<dominio>:3478`                                                       |
| `WEBRTC_TURN_URLS`         | `turn:turn.<dominio>:3478?transport=udp,turns:turn.<dominio>:5349?transport=tcp` |
| `WEBRTC_TURN_SECRETO`      | El `static-auth-secret` de coturn. **Secret Manager**, nunca el repositorio      |
| `WEBRTC_TURN_TTL_SEGUNDOS` | Vacía (600) salvo motivo                                                         |

`turns:` en el 5349/TCP es el que atraviesa los cortafuegos que sólo dejan
salir HTTPS: sin él, una red corporativa estricta sigue sin video.

## 3 · La máquina

Una sola, como la API (P-30): coturn no guarda estado que haya que repartir.

1. **Proyecto y cuenta corporativos** de Grupo Control (§1 del contrato).
2. **Región:** la misma de la API, para que la retransmisión no cruce
   continentes.
3. **Tipo:** `e2-small` con Ubuntu LTS. [Suposición] Basta para las sesiones
   simultáneas de una central pequeña; se mide en sitio (§7) y se sube si hace
   falta. El coste que manda no es la máquina sino el **tráfico de salida** del
   video retransmitido, que sólo pagan las sesiones que no logran ir directas.
4. **IP externa estática** y un registro DNS `turn.<dominio>` apuntándola.
5. **Cuenta de servicio propia** con un único permiso: leer el secreto
   `turn-secreto` en Secret Manager. Nada más.

## 4 · Cortafuegos

| Sentido | Puerto          | Para qué                                                          |
| ------- | --------------- | ----------------------------------------------------------------- |
| Entrada | 3478 UDP y TCP  | STUN y TURN                                                       |
| Entrada | 5349 TCP        | TURN sobre TLS (`turns:`)                                         |
| Entrada | 49160–49200 UDP | Puertos de retransmisión (`min-port`/`max-port`)                  |
| Entrada | 22 TCP          | **Sólo desde el rango de IAP** (`35.235.240.0/20`), nunca abierto |

El rango de retransmisión es deliberadamente corto: 41 puertos dan para unas 20
sesiones con audio y video. Si §7 mide más, se amplía aquí **y** en el fichero.

## 5 · Configuración (`/etc/turnserver.conf`)

Plantilla. Los `<…>` se rellenan en la máquina; **el secreto no se escribe a
mano**: lo inyecta el guion de arranque desde Secret Manager (§6).

```ini
listening-port=3478
tls-listening-port=5349
listening-ip=<IP interna de la VM>
relay-ip=<IP interna de la VM>
external-ip=<IP pública>/<IP interna de la VM>
min-port=49160
max-port=49200
realm=turn.<dominio>

# Credenciales efímeras: las firma la API con el mismo secreto (§2).
use-auth-secret
static-auth-secret=__SECRETO_DESDE_SECRET_MANAGER__
fingerprint
stale-nonce=600
user-quota=12
total-quota=100

# TLS para turns: (certificado de Let's Encrypt para turn.<dominio>).
cert=/etc/letsencrypt/live/turn.<dominio>/fullchain.pem
pkey=/etc/letsencrypt/live/turn.<dominio>/privkey.pem
no-tlsv1
no-tlsv1_1

# EL TURN NO ES UNA PUERTA A LA RED INTERNA. Sin esto, una credencial válida
# retransmite hacia la red de Google (incluido el servidor de metadatos de la
# VM, 169.254.169.254, que entrega tokens de la cuenta de servicio).
no-multicast-peers
no-loopback-peers
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=100.64.0.0-100.127.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=169.254.0.0-169.254.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255

no-cli
simple-log
syslog
```

**Por qué `denied-peer-ip` no es opcional.** Un TURN retransmite hacia la
dirección que le pida el cliente. Sin esas líneas, cualquiera con una
credencial —y la API las reparte a cada operador— puede usar la VM para hablar
con la red interna del proyecto. Es un SSRF con otro nombre.

## 6 · El secreto

1. Generarlo: `openssl rand -base64 48`. Va a **dos** sitios y a ninguno más:
   - Secret Manager `turn-secreto` → la VM lo lee al arrancar;
   - Secret Manager → `WEBRTC_TURN_SECRETO` de la API (Cloud Run lo monta).
2. En la VM, un guion de arranque lo escribe en el fichero con permisos `600`
   del usuario `turnserver`, sustituyendo `__SECRETO_DESDE_SECRET_MANAGER__`
   con `gcloud secrets versions access latest --secret=turn-secreto`. **No** lo
   ponga en los metadatos de la instancia: los lee cualquiera con acceso de
   lectura al proyecto.
3. **Rotación:** secreto nuevo en Secret Manager → reiniciar coturn →
   desplegar la API con la versión nueva, en ese orden y seguidos. Las
   credenciales ya entregadas (vida ≤ 10 min) dejan de servir: la consola pide
   otras al reconectar el video. Hágalo en horario de poco tráfico.

## 7 · Verificación (al desplegarlo; no se hizo en la 15-R)

1. **El TURN responde y autentica.** Genere una credencial como la API, con el
   secreto por la entrada estándar:

   ```bash
   gcloud secrets versions access latest --secret=turn-secreto | node -e '
     const s = require("fs").readFileSync(0, "utf8").trim();
     const u = `${Math.floor(Date.now() / 1000) + 600}:verificacion`;
     const c = require("crypto").createHmac("sha1", s).update(u).digest("base64");
     console.log(`-u ${u} -w ${c}`);'
   turnutils_uclient -t <lo que imprimió el comando anterior> turn.<dominio>
   ```

   Debe terminar sin `401`. Con una credencial caducada (cambie `+ 600` por
   `- 600`), debe fallar: es lo que demuestra que la vida corta se cumple.

2. **La red interna está cerrada.** Desde la consola de la VM, con una
   credencial válida, pida retransmisión hacia `169.254.169.254`:
   `turnutils_uclient -t -u … -w … -e 169.254.169.254 turn.<dominio>` debe fallar
   con `403 Forbidden IP`.
3. **De punta a punta.** Operador en una red **móvil** (no la del conjunto),
   vista en vivo de un equipo, y en `chrome://webrtc-internals` el par
   seleccionado de tipo **`relay`**. Anote en la hoja: tiempo hasta imagen
   (KPI-33: menos de 2 s) y si el audio de la guardia (pulsar para hablar) va
   igual.
4. **El go2rtc del Edge.** [SUPUESTO] S-15R-08: con el operador detrás del
   TURN, al go2rtc del conjunto le basta **STUN** (`webrtc: ice_servers:` con
   sólo `stun:turn.<dominio>:3478`), porque llega a la dirección pública de la
   retransmisión sin pedir una propia. Sólo si el router del conjunto también es
   NAT simétrico hará falta TURN en los dos lados, y entonces el Edge necesitará
   una credencial de vida larga: **decídalo con la medición del punto 3**, no
   antes, porque es un secreto más en una máquina del conjunto.

## 8 · Si algo falla

| Síntoma                                          | Causa probable                                  | Qué hacer                                                                   |
| ------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------- |
| `401 Unauthorized` con credencial recién emitida | Secreto distinto en la API y en coturn          | Compare las **versiones** del secreto en los dos, nunca el valor            |
| `401` sólo a algunos operadores                  | Reloj de la VM desfasado (la caducidad es Unix) | `timedatectl`: NTP activo                                                   |
| Sin candidato `relay` en `webrtc-internals`      | 3478/5349 cerrados, o `WEBRTC_TURN_URLS` vacía  | §4 y `GET /copropiedades/<id>/guardia/video/ice` con la sesión del operador |
| `relay` sí, pero no hay imagen                   | Rango 49160–49200 cerrado                       | §4                                                                          |
| `turns:` falla y `turn:` funciona                | Certificado caducado o de otro nombre           | `certbot renew`; el nombre debe ser `turn.<dominio>`                        |

---

**Referencias:** `DESPLIEGUE_EDGE.md` §10.7 (go2rtc junto al Edge),
`DESPLIEGUE.md` §4.4 (una instancia), `apps/api/.env.example` (bloque 15-Q2).
