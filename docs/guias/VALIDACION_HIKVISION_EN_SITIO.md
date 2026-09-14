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

## 0.bis · Lo ya MEDIDO contra los equipos · 2026-09-14

Esto deja de ser procedimiento y pasa a ser hecho. Sustituye a cualquier
suposición anterior de esta guía.

**Cámara de entrada — `DS-TCG405-E`, firmware `V5.4.0 build 250425`.**

| Comprobación                     | Resultado medido                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Transporte de ISAPI              | **HTTP con Digest, no HTTPS.** No hay que forzar TLS ni confiar certificado: el adaptador habla HTTP en esta red          |
| Espacio de nombres del XML       | `www.isapi.org`, **no** el dominio del fabricante. Un analizador atado a ese dominio habría leído vacío                   |
| `/ISAPI/System/IO/capabilities`  | `statusCode 4 · notSupport`. **La ruta genérica de capacidades de E/S no existe en este firmware**                        |
| `/ISAPI/System/IO/outputs`       | Responde 200 con **una sola salida**: `id 1`, nombre `F1`, `IOUseType` **`whiteLight`**                                   |
| `barrierGateCtrlType` del evento | **0** — la cámara reporta y **no** acciona por su cuenta. El principio rector se sostiene, medido y no supuesto           |
| Servidor de alarmas              | Funciona. `POST multipart/form-data`, ~170 kB, tres partes: `anpr.xml`, `detectionPicture.jpg`, `licensePlatePicture.jpg` |
| Autenticación del envío          | **Ninguna.** El equipo no firma nada (ver la advertencia de abajo)                                                        |
| Lecturas capturadas              | `HNW094` y `EMM195`, las dos con `confidenceLevel` 100                                                                    |

**Campos del evento, confirmados:** `eventType` `ANPR`, `licensePlate`,
`confidenceLevel`, `plateCharBelieve` —confianza por carácter—, `dateTime` con
desfase horario, `channelID`, `UUID` del evento, `capturePicSecurityCode`, y
`pictureInfoList` con `plateRect` y `vehicelRect` —con la errata del fabricante—.

> **La única salida enumerada es la luz, no la talanquera.** `IOUseType` dice
> `whiteLight`, y la ruta genérica de capacidades de E/S no responde. Así que
> **todavía no sabemos qué relé abre la barrera**: puede estar en otra rama de
> ISAPI propia de la familia de tráfico, en otra salida que esa ruta no
> enumera, o directamente en otro equipo. Es el dato que falta para escribir el
> accionador, y es el que conviene sacar mientras los equipos estén delante.

> **El envío no está autenticado, y eso tiene consecuencias de diseño.**
> Cualquiera que alcance el puerto de escucha puede inventarse un paso de
> vehículo con la matrícula que quiera. Por eso la cámara **no puede** apuntar
> directamente a la ingesta del sistema, que exige firma: hace falta un
> traductor —el servidor de alarmas— con su propia frontera. Está desarrollado
> en `decisiones/propuestas/placa-a-talanquera.md`.

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

`PUT /ISAPI/AccessControl/RemoteControl/door/1` con la envoltura
`RemoteControlDoor` y `cmd` igual a `open`. Es momentáneo. **Nunca
`alwaysOpen`.**

```
printf '%s' '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>' > abrir.xml
curl -sS --digest -u "$USUARIO:$CLAVE" -X PUT \
  -H 'Content-Type: application/xml' --data-binary @abrir.xml \
  -w '\nhttp=%{http_code} tiempo_total=%{time_total}s\n' \
  "http://$FACIAL/ISAPI/AccessControl/RemoteControl/door/1"
```

**Salida esperada:**

```
<ResponseStatus version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <requestURL>/ISAPI/AccessControl/RemoteControl/door/1</requestURL>
  <statusCode>1</statusCode>
  <statusString>OK</statusString>
  <subStatusCode>ok</subStatusCode>
</ResponseStatus>
http=200 tiempo_total=0.08s
```

Repita contra `$PORTERO`. Si allí responde `404`, esa familia usa otra ruta:
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
