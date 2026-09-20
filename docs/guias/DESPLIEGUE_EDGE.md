# Despliegue del Edge Gateway

**ETAPA 12** · Aprovisionamiento, identidad de servicio, rotación de
credenciales, sincronización de reloj y actualización remota.

> **A quién va dirigida.** A quien instala y opera los equipos, no a quien
> escribe el código. Cada paso dice qué hacer, qué tiene que pasar, y qué
> significa si no pasa.

---

## 0 · Qué es el Edge y qué no es

Es un equipo pequeño en la portería que **decide accesos cuando no hay
internet**, con las reglas que la nube le dio la última vez. Cuando vuelve la
conexión, envía todo lo que pasó durante el corte.

Lo que **no** es:

- **No es una copia de la nube.** Guarda una instantánea de reglas, no la base
  de datos del conjunto.
- **No es un sistema distinto.** Ejecuta literalmente el mismo motor de reglas
  (`@ncr/domain-core`), así que decide lo mismo que habría decidido la nube
  (RN-16). Está probado: `apps/edge/test/misma-decision.test.ts`.
- **No decide a medias.** Si no tiene reglas para un caso, **no abre**: aplica
  la política de contingencia, cuyo valor por omisión es denegar.

---

## 1 · Prerrequisitos del equipo

| Requisito         | Valor                          | Por qué                                                                                  |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| Node              | el de `.nvmrc` (22.x)          | `node:sqlite` viene con el runtime; una versión menor no lo trae (ADR-017)                 |
| Disco persistente | ≥ 2 GB libres                  | La bandeja de un corte largo vive ahí. En `tmpfs` se perderían los accesos al reiniciar    |
| Reloj             | NTP activo                     | La firma de cada envío lleva ventana de frescura; un reloj desviado la invalida (§5)       |
| Red               | Salida HTTPS a la API          | No hace falta entrada desde internet: el Edge llama, nadie le llama desde fuera            |
| Alimentación      | SAI recomendado                | SQLite se configura con `synchronous = FULL`, pero un corte a mitad de escritura es real   |

**No hace falta compilar nada en el equipo.** Es deliberado: un módulo nativo
obligaría a `node-gyp` en sitio o a binarios por arquitectura, y cada una de
esas es una forma de que una actualización deje un gateway sin arrancar — es
decir, una puerta que no abre.

---

## 2 · Aprovisionamiento, paso a paso

### 2.1 · Crear la identidad de servicio del equipo

**Una por gateway.** No se comparte entre equipos, y el motivo es doble: cada
evento queda atribuido a quién lo produjo (KPI-05), y **comprometer un equipo no
obliga a rotar los demás**.

Esto vale también para la llave secreta de Supabase: el esquema actual admite
**varias llaves secretas por proyecto, revocables de forma individual**, así que
lo correcto es emitir una por Edge y no repartir la misma a todos. Una llave
compartida convierte el robo de un equipo de portería en la rotación de todo el
parque, de noche y con las puertas sin decidir.

```sql
-- En la consola de administración, o por SQL versionado:
-- 1. un usuario de servicio por equipo
-- 2. su vínculo con la copropiedad que atiende
```

Anote los tres identificadores: `EDGE_GATEWAY_ID`, `EDGE_SERVICE_USER_ID` y
`EDGE_COPROPIEDAD_ID`.

### 2.2 · Generar el secreto de firma

```bash
openssl rand -hex 32
```

**Mínimo 32 caracteres; el gateway no arranca con menos.** Se guarda en dos
sitios y en ninguno más: el `.env` del equipo y el gestor de secretos de la
nube. No va al repositorio, no va a un correo, no va a un chat.

### 2.3 · Preparar el fichero de configuración

```bash
sudo mkdir -p /etc/next-control /var/lib/next-control
sudo cp apps/edge/.env.example /etc/next-control/edge.env
sudo chmod 600 /etc/next-control/edge.env    # solo root lo lee
sudo $EDITOR /etc/next-control/edge.env      # rellene los valores
```

Cada variable está explicada en el propio `.env.example`. Las **obligatorias**
son las cinco primeras; el resto tienen valor por omisión.

### 2.4 · Primer arranque

```bash
sudo -E env $(grep -v '^#' /etc/next-control/edge.env | xargs) node dist/main.js
```

**Lo que tiene que pasar:**

```json
{"nivel":"info","mensaje":"edge escuchando hechos","contexto":{"puerto":8080}}
{"nivel":"aviso","mensaje":"el enlace cambió de modo","contexto":{"modo":"en_linea"}}
```

**Si falta una variable, NO arranca** y dice cuál:

```
El Edge Gateway NO arranca: la configuración está incompleta.
  · EDGE_INGESTA_SECRETO: mínimo 32 caracteres
```

Eso es lo correcto, no un inconveniente: un gateway a medias decide con reglas
incompletas durante un corte y nadie se entera hasta que alguien no puede
entrar — o hasta que entra quien no debía.

**Si el modo se queda en `autonomo`**, el equipo funciona igual pero no habla
con la nube. Revise, en este orden: la URL de la API, la salida a internet, y el
reloj (§5).

### 2.5 · Como servicio del sistema

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
segundos **y la bandeja sigue ahí**, porque está en disco. Un reinicio no pierde
los accesos de un corte.

---

## 3 · Verificación en sitio

Cinco comprobaciones. Hágalas todas la primera vez; la 3.3 es la que de verdad
demuestra que el equipo sirve para lo que se compró.

### 3.1 · Decide

```bash
curl -s -X POST localhost:8080/hechos -H 'content-type: application/json' \
  -d '{"dispositivoId":"camara-01","metodo":"placa","referenciaExterna":"prueba-0001",
       "confianza":0.95,"placaLeida":"ABC123","personaId":null,"zonaId":null}'
```

**Esperado:** `{"permitido":…,"motivo":…,"versionDeReglas":N,"porContingencia":false,…}`.

Si `porContingencia` es `true`, el equipo **no tiene reglas en caché**: no ha
sincronizado nunca. Revise el enlace antes de seguir.

### 3.2 · Reconcilia

Deje pasar un minuto y busque en el registro:

```json
{"nivel":"info","mensaje":"bandeja reconciliada","contexto":{"enviados":1,"creados":1,"duplicados":0}}
```

Y confirme en la nube que el evento está, con la hora en que ocurrió.

### 3.3 · **Sobrevive a un corte** (la prueba que importa)

1. Desconecte el cable de red (o corte la salida a internet en el enrutador).
2. Espere ~45 segundos. En el registro: `{"modo":"autonomo"}`.
3. Genere **20 accesos** con el `curl` de §3.1, cambiando `referenciaExterna`.
   **Los 20 tienen que responder**, y con `porContingencia: false`.
4. Espere 30 minutos con la red caída. El equipo sigue abriendo.
5. Reconecte.
6. En menos de 5 minutos: `{"modo":"en_linea"}` y `bandeja reconciliada`.
7. En la nube: **los 20 eventos, exactamente una vez**, con la hora real de cada
   uno y marcados como decididos por el Edge.

Si aparecen 40, la clave de idempotencia no está funcionando y hay que parar.
Si aparecen con la hora de la reconexión en vez de la del acceso, el histórico
es inservible para auditar y hay que parar también.

### 3.4 · Sobrevive a un reinicio con la bandeja llena

Repita los pasos 1-3 de §3.3, y antes de reconectar:

```bash
sudo systemctl restart next-control-edge
```

Los 20 accesos siguen en la bandeja y se envían igual al reconectar. Si se
perdieron, `SQLITE_PATH` está en un sistema de ficheros volátil.

### 3.5 · Deniega lo que no sabe

```bash
curl -s -X POST localhost:8080/hechos -H 'content-type: application/json' \
  -d '{"dispositivoId":"camara-01","metodo":"placa","referenciaExterna":"prueba-0002",
       "confianza":0.95,"placaLeida":"NOEXISTE","personaId":null,"zonaId":null}'
```

**Esperado: `permitido: false`.** Una placa que la caché no conoce no se
«intenta igual».

---

## 4 · Rotación de credenciales, por equipo

Hay dos credenciales y se rotan distinto.

### 4.1 · El secreto de firma (`EDGE_INGESTA_SECRETO`)

**Orden obligatorio.** Al revés, el equipo firma con un secreto que la nube
todavía no conoce y **la bandeja deja de vaciarse sin que nadie lo note** —los
accesos se siguen decidiendo, así que no hay síntoma visible hasta que alguien
mira el histórico—.

1. Genere el nuevo: `openssl rand -hex 32`.
2. **Primero en la nube:** añádalo al gestor de secretos **sin quitar el viejo**.
   Durante la ventana, la API acepta los dos.
3. Compruebe que la nube acepta los dos (una petición firmada con cada uno).
4. **Después en el equipo:** cambie el `.env` y reinicie el servicio.
5. Confirme una reconciliación correcta en el registro.
6. **Solo entonces**, retire el viejo de la nube.

**Ventana recomendada: 24 horas.** Coincide con KPI-30 a propósito: un gateway
que estuviera incomunicado el día entero debe poder reconciliar con el secreto
que tenía cuando se fue.

### 4.2 · La llave secreta de Supabase

Una por equipo (§2.1). Se revoca la del equipo comprometido y se emite otra;
**los demás no se tocan**. Eso es todo el procedimiento, y es corto porque la
decisión de no compartirla se tomó antes.

### 4.3 · Si se pierde un equipo

1. Revoque su llave secreta de Supabase y su secreto de firma. Deje de aceptar
   su firma.
2. Desactive su usuario de servicio.
3. **No borre sus eventos.** Son un histórico inmutable (RN-03) y lo que
   ocurrió, ocurrió.
4. Aprovisione uno nuevo con identidad nueva. **No reutilice
   `EDGE_GATEWAY_ID`**: dos equipos con el mismo identificador producirían la
   misma clave de idempotencia para hechos distintos, y uno de los dos accesos
   se descartaría como duplicado.

---

## 5 · Sincronización de reloj

**No es un detalle de higiene: es un requisito de funcionamiento.**

Cada envío a la nube va firmado sobre `<marca temporal>.<cuerpo>`, con ventana
de frescura **simétrica** —un reloj adelantado es tan rechazable como uno
atrasado—. Un gateway que pasa 24 horas sin conexión pasa 24 horas sin NTP, y su
deriva puede sacarlo de la ventana **justo cuando intenta reconciliar**.

El síntoma no se parece a la causa: un `401` con una firma que el operador ve
correcta.

```bash
sudo timedatectl set-ntp true
timedatectl status | grep -E 'synchronized|NTP service'
```

**Esperado:** `System clock synchronized: yes` y `NTP service: active`.

Con la red del conjunto aislada, apunte a un servidor NTP interno:

```ini
# /etc/systemd/timesyncd.conf
[Time]
NTP=ntp.interno.del.conjunto
FallbackNTP=
```

**Comprobación mensual:** la deriva no debe superar 60 segundos. Si supera los
300, el equipo ya no puede reconciliar.

---

## 6 · Actualización remota

### 6.1 · Antes de actualizar

```bash
# 1. ¿Hay algo sin enviar? Si lo hay, espere a que la bandeja se vacíe.
sqlite3 /var/lib/next-control/edge.sqlite 'SELECT COUNT(*) FROM bandeja_de_salida;'
```

**Esperado: `0`.** Con la bandeja llena la actualización es segura igualmente
—está en disco y sobrevive—, pero si algo sale mal habrá que diagnosticar dos
cosas a la vez.

### 6.2 · Actualizar

```bash
sudo systemctl stop next-control-edge
sudo cp -r nueva-version/* /opt/next-control/edge/
sudo systemctl start next-control-edge
sudo journalctl -u next-control-edge -n 50 --no-pager
```

**No se toca `/var/lib/next-control/`.** Ahí viven la bandeja y la caché, y
sobreviven a la actualización a propósito.

### 6.3 · Volver atrás

```bash
sudo systemctl stop next-control-edge
sudo cp -r /opt/next-control/edge.anterior/* /opt/next-control/edge/
sudo systemctl start next-control-edge
```

La base de datos local es compatible hacia atrás en el mismo esquema. **Si una
versión cambia el esquema de SQLite, la nota de versión lo dirá y el rollback
exigirá restaurar la base** — por eso se comprueba §6.1 antes.

### 6.4 · Por fases

Nunca todos los equipos a la vez: **uno primero, 24 horas, y el resto**. Las 24
horas no son cautela vaga: es el tiempo que tarda en aparecer un fallo que solo
se manifiesta tras un corte largo, que es justo el que este equipo existe para
resolver.

---

## 7 · Diagnóstico de fallos frecuentes

| Síntoma                                         | Causa probable                             | Qué hacer                                                             |
| ----------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| No arranca y dice qué variable falta             | Configuración incompleta                    | Rellénela. El mensaje da el nombre exacto                              |
| Arranca pero se queda en `autonomo`              | Sin salida a la API, o URL mal              | `curl $NEXT_CONTROL_API_URL/health` desde el equipo                    |
| `porContingencia: true` en todo                  | Nunca sincronizó reglas                     | Revise el enlace; sin caché el gateway **deniega**, y hace bien        |
| La bandeja crece y no baja                       | Firma rechazada                             | §5 (reloj) y §4.1 (¿se rotó al revés?)                                 |
| `401` con la firma «correcta»                    | Reloj fuera de la ventana                   | `timedatectl status`. Es el fallo más frecuente tras un corte largo    |
| Eventos duplicados en la nube                    | Dos equipos con el mismo `EDGE_GATEWAY_ID`  | Identidad por equipo (§2.1). Nunca reutilizar la de uno retirado       |
| Eventos con la hora de la reconexión             | Versión antigua del gateway                 | Actualice: el instante real viaja desde la 12                          |
| Se pierden accesos al reiniciar                  | `SQLITE_PATH` en `tmpfs`                    | Muévalo a disco persistente                                            |
| Modo cambiando sin parar                         | Enlace intermitente                         | Suba `SONDAS_PARA_CAER`. Por omisión son 3, que ya absorbe un paquete perdido |
| Todo marcado `cachePotencialmenteObsoleto`       | Lleva más de `CACHE_OBSOLETA_MINUTOS` solo  | Es informativo, no un fallo: **sigue decidiendo** (KPI-30, KPI-31)     |

---

## 8 · Lista de comprobación del despliegue

- [ ] Node de la versión de `.nvmrc`
- [ ] `SQLITE_PATH` en disco persistente
- [ ] NTP activo y sincronizado
- [ ] Identidad de servicio **propia** del equipo
- [ ] Llave secreta de Supabase **propia** del equipo
- [ ] Secreto de firma de 32+ caracteres, en el gestor de secretos y en el `.env`
- [ ] `.env` con permisos `600`
- [ ] Servicio de systemd con `Restart=always`
- [ ] §3.1 responde
- [ ] §3.2 reconcilia
- [ ] **§3.3 superada: 30 minutos de corte, 20 accesos, los 20 una sola vez**
- [ ] §3.4 superada: reinicio con la bandeja llena
- [ ] §3.5 deniega lo desconocido
- [ ] Procedimiento de rotación probado una vez en pruebas, no la primera vez en producción
