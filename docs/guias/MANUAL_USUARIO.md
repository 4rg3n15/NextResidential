# Manual de usuario · por rol

> **Este manual describe lo construido, no lo previsto.** Donde una función
> todavía no existe, lo dice y nombra la etapa que la trae. Un manual que
> promete pantallas que no están es peor que uno incompleto: hace perder el
> tiempo buscándolas.

**El sistema tiene seis roles.** No son seis niveles de un mismo permiso: son
seis trabajos distintos, y cada uno ve una consola distinta. La interfaz oculta
lo que no le toca a cada uno, pero **quien deniega de verdad es el servidor**:
si un enlace llevara a una pantalla ajena, la API respondería 403 igualmente.

| Rol                    | Superficie                      | En una frase                                                     |
| ---------------------- | ------------------------------- | ---------------------------------------------------------------- |
| Superadministrador     | Consola web                     | Opera la plataforma y ve **todas** las copropiedades             |
| Administrador          | Consola web                     | Opera **una** copropiedad: padrón, zonas, dispositivos, informes |
| Portero / Seguridad    | Consola web (Portería)          | Atiende **su** puerta                                            |
| Operador de central    | Consola web (Guardia)           | Atiende **varias** copropiedades desde la central                |
| Residente              | App Android y consola web (PWA) | Autoriza visitas a **su** vivienda                               |
| Servicio / Integración | Sin interfaz                    | Identidad de máquina: Edge Gateway y trabajos programados        |

---

## Índice

1. [Antes de empezar: entrar al sistema](#1--antes-de-empezar-entrar-al-sistema)
2. [Superadministrador](#2--superadministrador)
3. [Administrador](#3--administrador)
4. [Portero / Seguridad](#4--portero--seguridad)
5. [Operador de central](#5--operador-de-central)
6. [Residente](#6--residente)
7. [Servicio / Integración](#7--servicio--integración)
8. [Qué hacer cuando algo va mal](#8--qué-hacer-cuando-algo-va-mal)

---

## 1 · Antes de empezar: entrar al sistema

### El segundo factor no es opcional para tres roles

**Superadministrador, administrador y operador de central entran siempre con
segundo factor** (RN-20). No es una preferencia de seguridad que alguien pueda
desactivar: sin el código de seis dígitos la sesión se queda a medias y ninguna
pantalla de administración responde.

1. Entre con correo y contraseña.
2. La primera vez, el sistema muestra un **código QR**. Escanéelo con una
   aplicación de códigos temporales (Google Authenticator, 1Password, Aegis…).
3. Escriba el código de seis dígitos. A partir de ahí se lo pedirá en cada
   inicio de sesión.
4. **Guarde los códigos de recuperación** que aparecen una sola vez. Son de un
   solo uso y son la única forma de entrar si pierde el teléfono.

El portero y el residente **no** necesitan segundo factor: RN-20 no se lo exige,
y ponérselo en una portería con relevos por turnos convertiría cada cambio de
turno en una incidencia.

### Si pierde el acceso

**Contraseña olvidada: la restablece una persona, no un correo.** En
producción la recuperación por correo está **desactivada** (decisión del
cliente AR-04, ronda 15-R): el correo no se pudo verificar de punta a punta, y
una contraseña nueva la debe dar alguien que sepa a quién se la da. La pantalla
de acceso no ofrece enlace; dice «¿Olvidaste tu contraseña? **Contacta al
administrador** de tu copropiedad: te asigna una temporal.» La app del residente
tampoco tiene enlace: el camino es el mismo.

1. Quien restablece escribe una **contraseña temporal** que cumple la política
   y se la da **en persona**. El sistema no la genera ni la envía por ningún
   canal: una contraseña generada tendría que viajar en alguna respuesta.
2. Usted entra con ella y el sistema **le obliga a cambiarla** en ese mismo
   ingreso.
3. El restablecimiento queda registrado con el nombre de quien lo hizo. Si la
   cuenta es de un portero, su sesión abierta se cierra en el acto.

El aviso dice «administrador», pero quién puede hacerlo depende de la cuenta:

| Cuenta que perdió la contraseña     | Quién la restablece                                   | Dónde, hoy                                                                                           |
| ----------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Residente                           | Superadministrador; el administrador, sólo por API    | **Residentes** → «Restablecer contraseña»                                                            |
| Portero                             | Superadministrador                                    | **Porteros** → «Restablecer contraseña»                                                              |
| Administrador u operador de central | Superadministrador                                    | **Sin pantalla todavía**: por la API, `POST /copropiedades/:id/usuarios/:usuarioId/restablecimiento` |
| Superadministrador                  | Nadie desde la plataforma, ni otro superadministrador | —                                                                                                    |

Nadie restablece su propia contraseña por esta vía: la propia se **cambia**, no
se restablece. Si un despliegue activa expresamente la recuperación por correo
(variable `RECUPERACION_POR_CORREO`), vuelve el enlace «¿Olvidaste tu
contraseña?»; en producción, por omisión, no está.

**Si creó su cuenta con «Crear cuenta»** (§6), es igual: la restablece el
superadministrador. El correo que escribió al crearla es sólo de contacto: no
sirve para entrar ni para recuperar la contraseña.

- **Teléfono perdido y códigos de recuperación a mano:** entre con uno de ellos
  y vuelva a dar de alta el segundo factor.
- **Las dos cosas perdidas:** solo un superadministrador puede retirarle el
  segundo factor, y queda registrado en la auditoría con su nombre. El
  procedimiento está en [`RECUPERACION_Y_USUARIOS.md`](RECUPERACION_Y_USUARIOS.md).

### Instalar la consola

La consola es una **PWA instalable**: en el navegador, el icono de instalar de
la barra de direcciones la deja como una aplicación con su propia ventana. Para
los puestos fijos —portería, central— hay además un **instalador de escritorio**
(`.msi`, `.deb`, `.dmg`) que Grupo Control distribuye.

**El residente también la instala**, y en el teléfono es lo que le trae los
avisos (§6): en Android, Chrome → menú ⋮ → «Instalar aplicación»; en iPhone,
**Safari** → Compartir → «Añadir a pantalla de inicio» → «Añadir», y desde
entonces se abre **desde ese ícono**, no desde Safari.

Sin conexión la consola muestra una pantalla que lo dice. **No muestra datos
viejos presentados como actuales**: en un sistema de control de acceso, un
aforo de hace dos horas es peor que una pantalla honesta.

---

## 2 · Superadministrador

Es el rol de **plataforma**: no pertenece a ninguna copropiedad y las ve todas.

### Qué puede hacer

| Tarea                                              | Dónde                                                         |
| -------------------------------------------------- | ------------------------------------------------------------- |
| Conmutar entre copropiedades                       | Selector de la cabecera                                       |
| Todo lo del administrador, en cualquiera           | Las mismas pantallas                                          |
| Ver la auditoría del sistema                       | Informes → Auditoría de sistema                               |
| Retirar el segundo factor a un usuario             | Procedimiento documentado, con registro                       |
| Restablecer la contraseña de residentes y porteros | **Residentes** / **Porteros** → «Restablecer contraseña» (§1) |
| Ver las latencias comprometidas                    | **Latencias**                                                 |
| Dar de alta al **titular** de cada vivienda        | **Residentes** → «Nuevo residente» (abajo)                    |
| Dar vivienda a una cuenta antigua que no la tiene  | **Residentes** → «Asignar vivienda»                           |
| Ampliar las plazas de una vivienda                 | **Residentes** → «Ocupantes por vivienda» → «Cambiar tope»    |
| Fijar las plazas por vivienda de la copropiedad    | **Configuración** → «Hogares»                                 |
| Reanudar «Crear cuenta» si se suspendió            | **Configuración** → «Reanudar»                                |

### Lo que conviene mirar cada semana

1. **Latencias** — que los cinco indicadores sigan por debajo de su techo. La
   columna «Por encima» cuenta los incumplimientos desde el arranque del
   proceso; si crece, algo se está degradando aunque el p95 aún cumpla.
2. **Dispositivos** — terminales caídas o degradadas. El sistema las marca solo,
   cada cinco minutos, sin que nadie abra la pantalla.
3. **Informes → Auditoría de sistema** — quién cambió qué configuración.

> **Una cosa que no puede hacer, y es a propósito:** borrar. No hay borrado
> físico en ninguna parte donde haya historial (RN-19). Las cosas se
> **desactivan**, conservan su pasado y dejan de operar.

### Residentes: el titular de cada vivienda

Desde la ronda 15-W
([ADR-037](../decisiones/ADR-037-titular-asignado-y-crear-cuenta-con-codigo-de-plaza.md)),
**la primera cuenta de cada vivienda es la de su titular, y la da usted**, ya
asignada a esa vivienda. Los demás del hogar ya no pasan por la administración:
crean su propia cuenta en la app con un código de plaza que el titular les
comparte (§6). Por eso «Nuevo residente» sólo ofrece viviendas que todavía no
tienen titular.

1. **Residentes → «Nuevo residente».** En «Buscar vivienda» escriba el número o
   la agrupación, y elija la vivienda en «Vivienda sin titular»: sólo aparecen
   las activas que aún no lo tienen. La lista trae 50 como mucho; si no está la
   que busca, afine la búsqueda.
2. **Usuario** (de 3 a 32: letras sin tilde, números, punto, guion o guion
   bajo), **contraseña inicial**, **nombre** y, si quiere, teléfono →
   **«Dar de alta»**.
3. Entréguele **en persona** el código de la copropiedad, el usuario y la
   contraseña inicial. Entra en la app con los tres y la cambia en su primer
   ingreso.

Si otra persona dio de alta la misma vivienda mientras tanto, la consola dice
«Esta vivienda ya tiene titular: los demás entran con un código de plaza» y deja
de ofrecerla.

La tabla de cuentas dice de cada una su **Vivienda** y su **Origen**:
«Administración» o «Crear cuenta (app)». Una cuenta anterior a esta ronda que
nunca declaró su vivienda aparece **«Sin vivienda»**, y en ella —sólo si está
activa— el botón **«Asignar vivienda»**: elija la vivienda (también sólo las
activas sin titular), escriba el **motivo** y la cuenta queda como titular de
esa vivienda. Queda en la bitácora con su nombre y el motivo.

Si un titular se da de baja, su vivienda vuelve a quedar sin titular y puede
dar de alta otro… salvo que en ella queden otros adultos con cuenta: entonces
no se ofrece, y el cambio de titular todavía no está decidido (P-38).

### Plazas de los hogares y «Crear cuenta»

**Antes de que los residentes usen «Crear cuenta», cada copropiedad necesita su
código corto.** En la consola es el campo **«Código de acceso de la
copropiedad»**, en **Configuración** (bloque «Copropiedad activa», «Guardar
cambios»), y sólo el superadministrador lo cambia. Sin él, los códigos de plaza
salen sin el prefijo del conjunto (`ABCD-EFGH`) y «Crear cuenta» los rechaza
todos con el mensaje genérico, porque nada dice de qué conjunto son.

**Cada vivienda tiene plazas**, contando la del titular, y cada plaza libre es
un código con el que otra persona crea su cuenta. El titular las gestiona desde
la app hasta el **tope**: **4 por omisión** (ADR-038).

- **El tope de toda la copropiedad:** Configuración → bloque **«Hogares»** →
  «Plazas por vivienda (contando al titular)» → **«Cambiar tope»**, de 1 a 20,
  con motivo. **Bajarlo nunca quita plazas**: las viviendas que ya tienen más
  quedan con un tope propio igual a las que tienen.
- **El de una vivienda**, a petición del hogar: Residentes → «Ocupantes por
  vivienda» → elija la vivienda. Arriba dice **«Plazas: N de M»** y si el tope
  es el de la copropiedad o uno propio. **«Cambiar tope»** → «Plazas de la
  vivienda (contando al titular)», de 1 a 20, con motivo. Si tiene tope propio,
  puede elegir **«Volver al tope de la copropiedad»**. El tope **nunca queda por
  debajo de las plazas activas**: si lo intenta, la consola enseña el rechazo.
- En la misma ficha, **«Añadir ocupantes»** (con motivo) crea plazas —y sube el
  tope de la vivienda si hace falta— y **«Quitar»** retira una: si está libre,
  su código deja de valer; si está ocupada, el vínculo de esa persona se da de
  baja.

**«Crear cuenta» puede suspenderse.** Si en una hora se escriben demasiados
códigos de plaza incorrectos (hoy, 30), el registro de **toda la
copropiedad** se suspende durante una hora: nadie del conjunto puede crear su
cuenta. Configuración lo dice arriba, al entrar: **«Registro suspendido por
intentos»**, hasta qué hora y cuántos códigos fallaron. Al terminar la hora se
reanuda solo; **«Reanudar»** lo hace antes, con motivo, y queda en la bitácora
y en la auditoría de seguridad con su nombre.

---

## 3 · Administrador

Opera **una** copropiedad. Es quien mantiene el padrón, del que depende todo lo
demás.

### 3.1 · Padrón: viviendas, residentes y vehículos

**Viviendas.** Cada una tiene su identificador, su agrupación —la copropiedad
decide si se llaman «Casa/Manzana», «Apartamento/Torre»…— y sus residentes.

- **Alta por lotes:** «Generar padrón» crea un plan de viviendas completo a
  partir de un patrón (número de manzanas, casas por manzana). **Primero
  previsualiza y solo el segundo envío crea**: un plan de trescientas viviendas
  mal parametrizado se deshace a mano, una por una.
- **Carga desde archivo:** CSV o XLSX, validado fila a fila. Si una fila falla,
  **no se carga ninguna** y el informe dice cuál y por qué. Media carga es peor
  que ninguna.

**Vehículos.** Una placa activa por vivienda (RN-04). La placa se normaliza al
guardarla —mayúsculas, sin espacios ni guiones— para que el lector encuentre la
misma que usted escribió. Si intenta registrar una placa que ya está activa en
otra vivienda, el sistema la rechaza y dice dónde está.

**Desactivar.** Una vivienda inactiva **no genera autorizaciones nuevas y
conserva las vigentes** (RN-13). No es un olvido: una visita ya autorizada que
llega esa tarde no puede quedarse en la puerta porque alguien archivó la
vivienda por la mañana.

### 3.2 · Zonas comunes

Cada zona tiene **horario** y **aforo**, y los dos se respetan aunque la persona
tenga permiso (CU-05).

- El **aforo nunca supera el máximo**: lo garantiza la base de datos, no el
  código. Dos personas entrando a la vez no pueden pasarse del tope.
- La **política de reinicio** decide qué pasa con el contador al cerrar la
  jornada: `cierre_horario` lo pone a cero solo, `manual` espera a que alguien
  lo haga, `nunca` no lo toca. Desde la ETAPA 14 el reinicio ocurre **aunque
  nadie entre**: antes, una zona que nadie tocaba conservaba el conteo antiguo
  indefinidamente.

### 3.3 · Visitantes

**Generar autorización** (todos los roles de la consola): nombre y documento
del visitante, fecha y hora, duración, la vivienda que visita, la **foto
frontal** y la casilla «Declaro que <nombre del visitante> me autorizó a usar
su foto para su ingreso al conjunto», que toma el nombre escrito en el
formulario. La visita queda autorizada al guardarla y su foto sale a todos los
equipos con reconocimiento facial; la consola dice en cuántos quedó y cuáles no
la aceptaron, y permite reintentar.

- **Portería** ve sólo las visitas de hoy; la lista empieza de nuevo a
  medianoche y el historial se conserva. **Administración** ve el historial
  completo con filtros por vivienda, fechas, estado, nombre o documento.
- **Portería y superadministración** reciben un aviso en pantalla por cada
  visita nueva y pueden **rechazarla** con motivo: queda anulada y su foto se
  borra de todos los equipos.
- Si el visitante está presente, puede **confirmar en persona** que autoriza su
  foto (opcional): escribe él mismo su nombre y su documento.

- **Listas negras** (RN-06, RN-07): una persona o una placa en lista negra **no
  entra por ningún medio**, aunque tenga autorización vigente. Quien la incluye
  y quien la levanta no pueden ser la misma persona.
- Una autorización revocada **no desaparece**: queda con su motivo y su autor.

### 3.4 · Dispositivos

Alta, estado y sincronización. El estado lo mantiene el sistema:

| Estado    | Qué significa                                           |
| --------- | ------------------------------------------------------- |
| En línea  | Latió dentro del umbral configurado                     |
| Degradado | Lleva sin latir más de lo esperado, aún no es una caída |
| Caído     | Superó el umbral. **Abre alerta sola** (CA-26)          |

> **Las credenciales de los equipos nunca se muestran** (RN-21). La pantalla
> enseña una referencia, no la contraseña. Si necesita la contraseña de una
> cámara, está en el gestor de secretos, no aquí.

**En la ficha de un equipo** (superadministración y administración), con un
motivo escrito que queda en la auditoría:

- **Cámara · «Enviar eventos a este Mac».** Si el Mac cambió de red, la cámara
  sigue enviando a la IP de antes. Esto le escribe la de ahora y lo comprueba
  leyéndolo de vuelta.
- **Terminal · «Verificación remota: activar / desactivar».** Desactivarla es el
  plan B si la terminal no recibe a tiempo la respuesta de la plataforma: vuelve
  a abrir con su propio reconocimiento, y la plataforma registra sin decidir.
- **Rostros**: la ficha dice si el equipo los admite, si no, o si no se pudo
  leer y por qué.
- **Eventos del equipo**: si otra plataforma (HikCentral) tiene la conexión de
  eventos del equipo, la ficha lo dice como bloqueo, con el remedio:
  deshabilitar el equipo en HikCentral mientras se prueba.

**Puertas del videoportero.** Un videoportero puede mandar varias cerraduras, y
la guardia elige entre ellas **por su nombre** (§5). En la ficha de un
videoportero activo, el bloque «Salidas del videoportero»:

1. **«Descubrir salidas»** lee lo que el equipo declara —módulos y salidas— y
   lo alinea con los **«Puntos de acceso para la guardia»**. Mientras no haya
   puntos, la guardia abre la puerta de la ficha.
2. Dé a cada punto un nombre que el operador reconozca sin mirar un plano y
   pulse **«Guardar nombre»**. Es el nombre que verá en el botón de abrir.

**Dejar una puerta libre o bloqueada** (P-25, ronda 15-R). Debajo de los puntos,
el bloque «Dejar una puerta libre o bloqueada». **Sólo administración y
superadministración**: es estado, no un pulso, y deja al conjunto sin control
de acceso —libre— o sin acceso —bloqueada—. La API vuelve a exigir el rol
aunque la pantalla ya no se lo ofrezca a nadie más.

1. Elija el plazo en **«Durante»**: 30 min, 1 h o 2 h, «y vuelve sola a normal.»
2. En la fila de la puerta, **«Dejar libre»** o **«Bloquear»**.
3. Escriba el **motivo**, obligatorio como en toda orden manual (RN-08), y
   confirme.

| Modo      | Qué pasa mientras dura                                                              |
| --------- | ----------------------------------------------------------------------------------- |
| Libre     | «Cualquiera podrá pasar sin control hasta que venza el plazo o se revierta.»        |
| Bloqueada | «Nadie podrá abrirla —ni con autorización— hasta que venza el plazo o se revierta.» |

- **Nunca indefinidamente.** Ninguna orden dura más que la duración máxima de
  la copropiedad (2 h por omisión). Al vencer, el sistema la **devuelve sola a
  normal**: lo revisa cada minuto, sin que nadie abra la consola.
- **Si la reversión no llega al equipo**, se reintenta con espera creciente y se
  abre una **alerta** de severidad alta que se escala (RN-18). Una puerta que
  sigue libre sin que nadie lo sepa es el peor desenlace posible.
- **Mientras alguna puerta esté libre o bloqueada, toda la consola lo dice.**
  Portería, guardia y administración ven arriba, en todas las pantallas, una
  **franja roja fija** que no se puede cerrar: «**Puerta N LIBRE** desde las
  HH:MM, por <quién>: «<motivo>». Vuelve sola a normal a las HH:MM.» Si la
  reversión automática falló, la franja lo añade: «La reversión automática no
  llegó al equipo (N intentos): se reintenta.» Se actualiza sola cada 30 s.
- **«Revertir ahora»**, en la misma franja, la devuelve a normal antes de
  tiempo. Sólo lo ven administración y superadministración.

Si la consola muestra la franja roja **«Equipos simulados: las órdenes no
llegan a ningún equipo real»**, la API está en modo simulado con equipos reales
dados de alta: ninguna apertura mueve nada hasta cambiar
`PROVEEDOR_DE_EQUIPOS` y reiniciarla.

### 3.5 · Eventos e informes

**Todo intento de acceso genera un evento**, permitido o denegado (RN-02), con
quién, dónde, cuándo, con qué resultado y **con qué versión de reglas se
decidió**. Los eventos **no se pueden modificar ni borrar** por nadie, ni
siquiera desde la base de datos (RN-03).

Cuatro informes, exportables: accesos por periodo, visitantes frecuentes, uso de
zonas y auditoría de sistema. **Cada informe dice lo que NO puede afirmar**: si
un dato no se distingue, sale escrito junto al resultado en vez de dejar que
alguien lo cite como si lo supiera.

---

## 4 · Portero / Seguridad

Al entrar aterriza en **Portería**, su pantalla, pensada para usarse de pie y
con prisa. No tiene el tablero de indicadores: esos datos son de administración
y central (15-L).

### El flujo

1. El evento actual aparece arriba, con la evidencia —foto, recorte de placa—,
   la vivienda de destino y la autorización que aplica. Se queda en pantalla
   hasta que se atiende: lo que llega después espera en «En espera».
2. Decide: **«Abrir con motivo»** o **«Negar con motivo»**.
3. **El motivo es obligatorio en los dos casos** (CA-16, CA-17, RN-08). Sin
   motivo, el botón no ejecuta nada. No es burocracia: una apertura manual sin
   motivo es indistinguible de una apertura indebida cuando alguien revise el
   histórico tres semanas después.

La orden va al equipo del evento y abre **la puerta de su ficha**: en Portería
no se elige punto de acceso. Para elegir entre las cerraduras de un
videoportero, use **Guardia virtual** (§5). «Última orden: …» dice lo que
**contestó el equipo**, no lo que se pidió.

### Lo demás de la pantalla

- **«Equipos en vivo»**: el vídeo de cualquier cámara, terminal o videoportero
  activo. El evento en pantalla propone su equipo y usted puede cambiarlo en
  «Equipo». «Abrir este equipo» pide motivo y abre la puerta de su ficha.
- **Historial inmediato** de lo que se abrió o se negó a mano en su portería.
- **Alertas activas** y **listas negras** vigentes de su copropiedad.
- **La franja de puertas.** Si la administración dejó una puerta libre o
  bloqueada, usted lo ve arriba, en todas las pantallas: quién, por qué, desde
  cuándo y a qué hora vuelve sola a normal (§3.4). El portero no puede
  revertirla; si no debería seguir así, avise a la administración.

En Portería **no hay audio**: hablar con el visitante por el videoportero se
hace desde Guardia virtual.

### Lo que el portero no ve

No ve el padrón completo, ni otras copropiedades, ni los informes, ni el
tablero. Desde la 15-L (H4) **sí ve la guardia virtual** para atender de forma
remota —con su audio de pulsar para hablar y su selector de punto (§5)—, y es
la API la que decide en cada petición si su IP está entre las permitidas por el
superadministrador.

---

## 5 · Operador de central

La consola **Guardia virtual**, para atender varias copropiedades desde un solo
puesto. La usan también el portero —desde las IP que permite el
superadministrador— y la administración; lo que sigue vale igual para ellos.

### El flujo de una llamada (CU-03)

1. La **«Cola de atención»** muestra quién espera y **cuánto lleva esperando**,
   en segundos; lo que pasa del umbral sale en rojo. Si usted no atiende a
   nadie, lo primero de la cola pasa solo a **«Atención»** y el vídeo de su
   equipo se abre sin clic. Si ya atiende a alguien, el nuevo espera en la cola
   y no le quita la pantalla.
2. «Atención» dice qué pasa, la vivienda, cuánto lleva esperando, la placa
   leída si la hay y la evidencia. Debajo, **«Equipos en vivo»** muestra el
   vídeo del equipo que se atiende; puede mirar otro en «Equipo» sin perder la
   llamada.
3. **Hable con el visitante**: «Hablar» y, con la palabra, pulsar para hablar
   (abajo).
4. **«Avisar al residente»** le manda un aviso al teléfono (§6) y la consola
   dice a cuántos aparatos llegó. Si responde que **«no le llega a la app del
   residente»**, nadie de esa vivienda activó los avisos: llámelo o use el
   citófono. Sin vivienda identificada el botón se apaga: no hay a quién avisar.
5. **Elija la puerta** si el equipo tiene varias (abajo) y pulse **«Abrir …
   con motivo»** o **«Negar con motivo»**. Queda con su nombre, la hora y la
   copropiedad que atiende. «Última orden: …» dice lo que **contestó el
   equipo**, no lo que se pidió.
6. **«Emergencia»** → «Declarar emergencia»: escala con severidad crítica a
   todos los operadores conectados. También exige decir qué ocurre.

Si el residente no responde, o responde que no, o usted está ocupado en otra
copropiedad, el flujo tiene salida para cada caso y la consola la ofrece.

### Hablar con el visitante: pulsar para hablar

**El canal de audio es exclusivo por equipo** (ADR-01): una conversación a la
vez, para que dos operadores no se pisen.

| La pantalla dice          | Qué significa                        | Botón              |
| ------------------------- | ------------------------------------ | ------------------ |
| «Canal libre»             | Nadie habla con ese equipo           | «Hablar» lo pide   |
| «Tienes la palabra»       | El canal es suyo                     | «Colgar» lo suelta |
| «En cola · N por delante» | Otro operador lo tiene; usted espera | «Salir de la cola» |

El canal se libera solo tras el tiempo sin actividad que indica la pantalla.
Con la palabra aparece el panel de audio:

1. **Escucha desde que abre**: «Escuchando al equipo · <formato>».
2. Para hablar, **mantenga pulsado «Mantener para hablar»** —con el ratón o el
   dedo— o la **barra espaciadora** con el foco en el panel. Mientras lo
   sostiene, el botón dice «Hablando… suelte para escuchar» y el distintivo
   «Usted habla».
3. **Suelte para escuchar.** El micrófono se abre al pulsar y se cierra al
   soltar: el piloto del navegador sólo se enciende mientras tanto.

Debajo va el **turno de palabra**: «Turno de palabra: usted» o «… el
visitante». Hay equipos **semiduplex** que no lo declaran: mientras usted
habla, puede no oírse al visitante. Hable por turnos, como por radio.

- La primera vez, el navegador pide el micrófono. Si se negó: «El navegador no
  dio el micrófono: permítalo para esta página y vuelva a pulsar».
- Si la conversación se corta, la consola dice por qué, en palabras: «El turno
  caducó por inactividad», «La palabra la tiene otro operador», «Demasiado
  audio en poco tiempo: la API cortó la conversación», «El equipo cerró el
  canal de audio», «Se perdió la conexión con la API».
- La consola reproduce G.711. Si el equipo anuncia otro formato, lo dice en vez
  de sonar a ruido.
- «Tienes la palabra y no hay audio: …» significa que ese equipo no tiene
  transporte de audio; el resto de la frase dice por qué.
- **Colgar, cambiar de equipo o cerrar la pestaña cuelga**: nunca queda un canal
  huérfano ocupando el equipo.

### Qué puerta se abre: el selector de punto

Un videoportero puede mandar varias cerraduras. En «Atención», encima de los
botones, el grupo **«Punto de acceso»** las lista con el nombre que les dio la
administración (§3.4):

- **Una sola:** se usa sin preguntar.
- **Varias:** hay que elegir. Hasta entonces la consola dice «Elija qué puerta
  abrir: el equipo tiene N.» y el botón de abrir no responde. Elegida, el botón
  dice «Abrir <nombre> con motivo».
- **Ninguna descubierta:** «Este equipo no tiene puntos de acceso descubiertos:
  se abre la puerta de su ficha.»
- **Sin conexión con la API** no se pueden leer los puntos, y la consola avisa
  de que la orden abriría la puerta de la ficha.

La elección va atada al equipo: si cambia el equipo en atención, se olvida. Así
no se abre la cerradura 2 de otro videoportero porque se eligió aquí. **La
apertura no viaja por el canal de audio**: es una orden aparte, atribuida a
usted y auditada. «Abrir este equipo», en «Equipos en vivo», no tiene selector:
abre la puerta de la ficha.

### El vídeo y el audio son los del equipo

El vídeo llega del equipo real: la consola lo negocia con la API —que comprueba
sesión, rol y copropiedad— y lo recibe por WebRTC desde un go2rtc que traduce el
RTSP del equipo. Cuando el Edge del conjunto es el puente, ese go2rtc corre
junto a él, y el audio y las órdenes también pasan por el Edge: la credencial
del equipo no sale del conjunto y el navegador **nunca** habla con el equipo.

- El micrófono exige **HTTPS**: fuera de un contexto seguro el navegador no lo
  da, y no hay forma de hablar.
- Mientras el servidor TURN no esté desplegado, el vídeo se ve desde la red del
  conjunto y desde redes con NAT sencillo, **no** desde redes que lo bloqueen
  ([`COTURN.md`](COTURN.md)). Abrir y negar no dependen del vídeo.

### Puertas libres o bloqueadas

Si la administración dejó una puerta libre o bloqueada, la **franja roja** de
arriba lo dice en todas las pantallas (§3.4). El operador no puede revertirla:
si no debería seguir así, avise a la administración.

### Conmutar de copropiedad

El selector cambia el ámbito entero. **No verá ni un dato de la copropiedad que
acaba de dejar** (KPI-35): no es solo que la pantalla se limpie; es que el
servidor deja de responderle por ella.

---

## 6 · Residente

**App Android y consola web, con las mismas ocho pantallas.** Desde el
2026-09-29 (C-44) el residente opera también desde el navegador, con las mismas
funciones que la app; antes sólo tenía la app. Las dos hablan con la misma API:
lo que hace en una aparece en la otra.

| Aparato    | Cómo entra                                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Android    | La **app**, un APK firmado por Grupo Control que se descarga de su dominio, sin tienda. La primera vez Android pide permitir instalar desde el navegador. O la consola instalada desde Chrome, que es la que recibe avisos |
| iPhone     | **Sólo la consola**, instalada desde Safari (§1). En producción no hay app de iPhone para el residente (P-23)                                                                                                              |
| Computador | La consola en el navegador                                                                                                                                                                                                 |

**En la consola** aterriza en «Mi vivienda» y su menú tiene **sólo** sus ocho
pantallas, todas bajo `/mi`. No hay ninguna entrada de administración, portería
ni guardia, y si escribiera la dirección de una, la API la rechazaría igual. La
vivienda la resuelve el servidor desde su sesión: nunca viaja en la dirección.

> **Lo de la ronda 15-W está en la app Android.** «Crear cuenta», el primer
> ingreso, las plazas de la vivienda, los menores, editar y eliminar vehículos y
> revocar una visita se hacen en la app. En la consola web, por ahora, «Mi
> familia» y las plazas del «Perfil» se ven pero no se cambian, los vehículos
> sólo se dan de baja y las visitas no se revocan.

### Su cuenta

**Sólo los mayores de 18 años tienen cuenta**
([ADR-038](../decisiones/ADR-038-menores-sin-cuenta-gestionados-por-el-hogar.md)).
A los menores los registra un adulto del hogar en «Mi familia».

**Si usted es el titular de la vivienda**, su cuenta la da la administración.
Le entregan en persona el **código de la copropiedad**, su **usuario** y una
**contraseña inicial**. Entre en la app con los tres; la app le pide cambiar la
contraseña, completar sus datos y decir **cuántos viven en su vivienda**,
usted incluido (de 1 al tope; podrá cambiarlo después en «Ocupantes»).

**Si no es el titular**, cree su cuenta usted mismo:

1. Pídale al titular **el código de su plaza**. Tiene la forma `MIRA-K7PQ-2XWZ`:
   el código del conjunto y ocho letras o cifras.
2. En la pantalla de acceso de la app, **«¿Tiene un código de invitación?» →
   «Crear cuenta»**.
3. Llene los seis campos, todos obligatorios: **Usuario**, **Correo** («Para que
   la administración le contacte. No se usa para entrar.»), **Contraseña** (8 o
   más caracteres, con mayúscula, minúscula, número y símbolo), **Confirme la
   contraseña**, **Código de invitación** y **Fecha de nacimiento**.
4. Lea el texto de **«Tratamiento de sus datos»** y marque **«He leído y acepto
   la política de tratamiento de mis datos»**. Sin la casilla el botón no
   responde.
5. **«Crear cuenta»**. La app entra sola con su cuenta nueva.

**El primer ingreso, después:** «Complete sus datos» pide nombres, apellidos,
documento —cédula, cédula de extranjería o pasaporte—, teléfono y fecha de
nacimiento; el correo es opcional y llega propuesto. **No se escribe la
vivienda ni ningún código**: la cuenta ya trae la suya. Si la fecha resulta de
un menor de edad, la cuenta se bloquea en ese momento («Las cuentas son para
mayores de edad. Un adulto de su hogar lo registra desde Mi familia»): revise la
fecha antes de pulsar «Continuar».

**Cambiar de vivienda** (Perfil → su vivienda) pide siempre el código de una
plaza libre de la nueva. El titular no puede cambiarse desde la app: lo pide a
la administración.

### Las ocho pantallas

| Pantalla (app)  | En la consola                                 | Para qué                                                                                     |
| --------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Inicio          | «Mi vivienda» · `/mi`                         | Su vivienda, lo que está pasando ahora                                                       |
| Mi familia      | «Mi familia» · `/mi/familia`                  | Los residentes de su vivienda; en la app, además, los menores del hogar                      |
| Mis vehículos   | «Mis vehículos» · `/mi/vehiculos`             | Sus placas; en la app, además, editarlas y eliminarlas                                       |
| Nuevo visitante | «Visitas» · `/mi/visitas` → «Nuevo visitante» | **La pantalla principal**: autorizar una visita                                              |
| Zonas comunes   | «Zonas comunes» · `/mi/zonas`                 | Aforo y horario de hoy de cada zona                                                          |
| Historial       | «Historial» · `/mi/historial`                 | Quién entró a su vivienda, con filtros                                                       |
| Notificaciones  | «Notificaciones» · `/mi/notificaciones`       | Visitas rechazadas, con su motivo, e ingresos de sus visitantes; y en la consola, los avisos |
| Perfil          | «Perfil» · `/mi/perfil`                       | Sus datos y, en la app, «Ocupantes»: las plazas de su vivienda y sus códigos                 |

**Solicitar acceso a una zona común no está construido** en ninguna de las dos:
la pantalla de zonas informa, no reserva.

### Ocupantes: las plazas de su vivienda

En la app, **Perfil → «Ocupantes»**. Arriba, el cupo: **«Plazas: 3 de 4»**
—cuántas tiene y cuántas puede tener, contándose usted—. Cada plaza dice quién
la ocupa, o **«Plaza libre»** con su código.

- **«Compartir»**, en una plaza libre, **copia** el mensaje completo —«Descargue
  la app, pulse Crear cuenta y use este código: …»— y la app avisa: «Mensaje con
  el código copiado. Péguelo en un chat o en un mensaje de texto para quien vive
  con usted.» No abre la hoja de compartir del teléfono: el mensaje se pega a
  mano donde quiera mandarlo. Cada código sirve **una vez**, para una persona.
- **«Añadir plaza»** (sólo el titular) crea otra, hasta el tope. En el tope, la
  app dice «Para más plazas, pídalo a la administración»: el superadministrador
  puede ampliar el de su vivienda.
- **«Retirar»** (sólo el titular, con motivo) quita una plaza **libre**: su
  código deja de servir. Una ocupada no se retira —«Primero dé de baja a la
  persona»— y la 1, la del titular, nunca.

Los demás adultos de la vivienda ven las plazas y comparten los códigos, pero
no las añaden ni las retiran: «Sólo el titular de la vivienda añade y retira
plazas.»

### Mi familia: los menores del hogar

**Los menores de edad no tienen cuenta**: cualquier adulto con cuenta de la
vivienda —no sólo el titular— los registra en una plaza libre.

1. **Mi familia → «Añadir menor».** Si no hay plazas libres, la app lo dice:
   el titular añade una en «Ocupantes».
2. Nombres, apellidos, fecha de nacimiento, **parentesco** («hija, sobrino…»),
   tipo de documento —**tarjeta de identidad** o **registro civil**—, número y
   la **plaza libre** que ocupará → **«Registrar»**.

Cada menor sale en «Mi familia» con su edad, su documento abreviado
(«••••5678») y su plaza, y el distintivo «Sin cuenta». **«Editar»** cambia sus
datos; **«Dar de baja»**, con motivo, deja libre su plaza con otro código y, si
su rostro estaba en los equipos del conjunto, lo retira. Una persona de 18 años
o más no se registra como menor: «Una persona mayor de edad crea su propia
cuenta con un código de plaza».

**Al cumplir 18**, la fila dice «Ya cumplió 18 años: puede crear su propia
cuenta con un código que genera el titular». El titular pulsa **«Código para su
cuenta»**: es un código de un solo uso, que «Compartir» copia igual que en
«Ocupantes». Con él, la persona hace «Crear cuenta»
escribiendo **la misma fecha de nacimiento** que el hogar registró, y su cuenta
queda unida a la misma persona y a la misma plaza: **conserva su historial**.

### Autorizar una visita

1. **Nuevo visitante** → nombre y documento. Si la persona ya visitó antes, el
   sistema la reconoce por su documento.
2. **Cuándo**: fecha, hora de llegada y **duración**. Fuera de esa ventana no
   entra.
3. **Foto frontal** del visitante, de frente y con buena luz. En la app,
   **«Tomar foto»** con la cámara o **«Elegir de la galería»** si el visitante
   se la envió; la de la galería se envía sin sus datos ocultos (ubicación,
   teléfono, fecha). En la consola, el campo **«Foto frontal del visitante»**
   (JPEG o PNG; en el teléfono ofrece la cámara). Las dos revisan la foto antes
   de enviarla y dicen si sirve; si el navegador no sabe contar rostros, la
   consola le pide confirmar que se ve uno solo, de frente y bien encuadrado.
4. La casilla **«Declaro que <nombre del visitante> me autorizó a usar su foto
   para su ingreso al conjunto»**, con el nombre que usted escribió. Sin ella
   no se envía.
5. **Placa** si llega en vehículo, y **observaciones** para el portero
   (opcionales).

En la consola se envía con **«Registrar visita»**; mientras falte algo, el
formulario dice qué («Falta: …»).

**Últimos visitantes → Volver a autorizar**: para alguien que ya vino, se
copian sus datos y su foto y sólo se le pide fecha, hora, duración y la casilla.
Sin foto guardada no se puede: se registra como visitante nuevo.

Debería llevarle **menos de un minuto** (KPI-10).

Si la pantalla dice «Hoy sólo el titular de la vivienda puede autorizar
visitantes.», su cuenta no es la del titular. En la consola el botón «Nuevo
visitante» se ve, apagado, para que sepa que existe y por qué no lo puede usar.

### Revocar una visita

En la app, en «Autorizaciones», las visitas que usted autorizó tienen
**«Revocar»**. Pide un **motivo** (hasta 200 caracteres) y avisa de lo que
pasa: «Ya no podrá entrar con esta autorización, y su foto sale de los
equipos.» Al terminar, la app dice de cuántos equipos salió la foto. Una visita
ya revocada o vencida no se revoca: el servidor contesta «La visita ya está
revocada» o «La visita ya venció». Ninguna pantalla cambia las fechas de una
visita: si cambió el plan, revóquela y autorice otra.

### Mis vehículos: editar y eliminar

En la app, cada vehículo tiene **«Editar»** y **«Eliminar»**:

- **Editar** («Editar vehículo» → «Guardar») cambia color, modelo y marca.
  **La placa sólo cambia si el vehículo no tiene historial** en el conjunto; si
  ya lo tiene, la app dice «Dé de baja este vehículo y registre el nuevo»: una
  placa nueva es otro vehículo. Ni el tipo ni quién lo usa se editan.
- **Eliminar** deja de abrir la talanquera y libera un cupo de su vivienda.
  Sin historial, el vehículo **se borra** («Vehículo ABC123 eliminado.»); con
  historial, **queda dado de baja** y su historial se conserva («El vehículo
  ABC123 ya tenía historial en el conjunto: quedó dado de baja y su historial se
  conserva.»). Lo decide el servidor, no usted.

### Avisos al teléfono: Web Push, sin Firebase

Decisión del cliente P-23, ronda 15-R
([ADR-036](../decisiones/ADR-036-avisos-por-web-push-sin-firebase.md)). **Los
avisos con el teléfono en el bolsillo llegan a la consola instalada, no a la
app.**

**Qué llega con la consola cerrada:** el «Avisar al residente» de la guardia
(«Tienes una visita esperando en la portería») y los accesos registrados o
denegados en su vivienda. Al tocar el aviso se abre la consola en
«Notificaciones» o en «Historial», y en ninguna otra pantalla.

**Activarlos, una vez por aparato:**

1. Instale la consola (§1). En iPhone hace falta **iOS 16.4 o posterior** y
   abrirla **desde el ícono** de la pantalla de inicio: en Safari a secas no hay
   avisos.
2. **«Notificaciones» → «Activar avisos en este aparato»** → el navegador
   pregunta → **Permitir**. El permiso sólo se pide al pulsar, nunca al entrar.
3. Queda «Los avisos llegan a este aparato.» y el botón pasa a **«Quitar avisos
   de este aparato»**, que los retira.

Es **por aparato**: si quiere avisos en el teléfono y en el computador,
actívelos en los dos. Cada aparato recibe los avisos de **una sola** cuenta: si
otra persona del conjunto los activa en el mismo navegador, a usted dejan de
llegarle ahí.

| La pantalla dice                                                          | Qué hacer                                                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| «Para recibir avisos en el iPhone (iOS 16.4 o posterior): …»              | La consola no está instalada. Siga los pasos que indica                                                |
| «Los avisos están bloqueados para esta consola en este navegador…»        | Usted negó el permiso. Configuración del sitio → Notificaciones → Permitir, y vuelva                   |
| «Este navegador no admite avisos. Revise esta lista al entrar.»           | Use otro navegador, o revise la lista                                                                  |
| «Este servidor no envía avisos al teléfono: revise esta lista al entrar.» | El servidor no tiene las llaves de avisos. Lo resuelve TI ([`AVISOS_WEB_PUSH.md`](AVISOS_WEB_PUSH.md)) |

La lista de «Notificaciones» sigue siendo la fuente de verdad: un aviso que no
llegó está igual en ella.

«Sin Firebase» no significa «sin Google»: cada navegador entrega sus avisos por
su propio servicio —el de Google en Chrome, el de Apple en Safari—, pero el
contenido va **cifrado** y ese servicio no puede leerlo. No hay cuenta de
Firebase ni nada de Firebase en la app.

**La app Android no recibe avisos con la app cerrada**, y no los recibirá: no
lleva ningún sistema de avisos. Lo dice ella misma: «Los avisos llegan mientras
la app está abierta». Quien quiera avisos con el teléfono en el bolsillo
instala también la consola.

### Lo que conviene saber

- **Usted solo autoriza a su vivienda** (RN-05). No puede autorizar a otra.
- Una persona en **lista negra no entra**, aunque usted la autorice (RN-06). La
  lista negra pesa más que cualquier autorización vigente.
- **La foto del visitante es del visitante.** Al marcar la casilla usted declara
  que él autorizó el uso de su foto para entrar: queda registrado que fue usted
  quien lo declaró, cuándo y sobre qué texto (Ley 1581 de 2012, ADR-032).
- **La plantilla del rostro se borra sola** al terminar la visita, y de
  inmediato si portería la rechaza o si el visitante revoca su autorización
  (RN-11).
- **Sin conexión, en la app**, la visita queda «Pendiente de envío», con su
  foto, y se envía sola al volver la conexión, sin duplicarse. **En la consola**
  no queda nada pendiente: dice «No hay conexión con el servidor.», conserva lo
  escrito y, al reintentar, tampoco duplica.
- **La app y la consola ven lo mismo** (ADR-033): cada visita dice si está
  vigente, vencida o **rechazada, con el motivo** que escribió portería. Con la
  app abierta, la pantalla se recarga sola cada 20 s; también al volver a la
  app y al arrastrar hacia abajo. En la consola, «Visitas», «Zonas comunes» y
  «Notificaciones» se recargan solas cada 15 s mientras la pestaña está a la
  vista, y al volver a ella.
- **«Servidor»**, en la pantalla de acceso de la app, dice a qué servidor se
  conecta y permite cambiarlo si en sitio la app no llega (la dirección la da
  quien instala; ver [`APP_EN_IPHONE.md`](APP_EN_IPHONE.md)). Cambiarlo cierra
  la sesión.

---

## 7 · Servicio / Integración

**No es una persona y no tiene interfaz.** Es la identidad con la que operan el
Edge Gateway y los trabajos programados.

- El **Edge Gateway** la usa para reconciliar los accesos que decidió durante un
  corte de red.
- Los **trabajos programados** —vigilancia de latidos, reinicio de aforos,
  barrido de plantillas— operan bajo el actor de sistema, y las filas que tocan
  quedan con ese autor. Cuando en la auditoría vea ese actor, la respuesta a
  «quién cambió esto» es «el sistema, sin intervención humana».

Esta identidad usa la **llave secreta**, que omite las políticas de la base de
datos. Por eso cada ruta que la admite valida la copropiedad **también** en la
capa de aplicación, y una suite automática lo recorre entero en cada corrida de
CI (§2.7.6).

---

## 8 · Qué hacer cuando algo va mal

| Síntoma                                                                                    | Qué es, y qué hacer                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «La sesión expiró» al escribir el código                                                   | El código temporal caducó. Espere al siguiente y vuelva a escribirlo                                                                                                                                                                                                    |
| Un rol no ve una pantalla que cree que le toca                                             | La ve quien la necesita. Si cree que es un error, un administrador puede revisar sus roles                                                                                                                                                                              |
| Una terminal aparece **caída** y usted la ve encendida                                     | Dejó de latir. Revise red y hora del equipo: un reloj desincronizado produce este síntoma                                                                                                                                                                               |
| Un aforo que no cuadra                                                                     | Mire la política de reinicio de la zona. Con `manual` o `nunca`, el contador no se reinicia solo                                                                                                                                                                        |
| Una placa que el lector no reconoce                                                        | Compruebe que está **activa** y en la vivienda correcta. La normalización quita espacios y guiones automáticamente                                                                                                                                                      |
| «Demasiadas peticiones» (429)                                                              | Límite de peticiones (§2.7.5). Espere los segundos que indica la respuesta                                                                                                                                                                                              |
| La consola no ofrece instalarse                                                            | Casi siempre es que no está entrando por HTTPS. Sin contexto seguro el navegador no la instala                                                                                                                                                                          |
| «La recuperación de contraseña por correo está desactivada…»                               | Es lo previsto en producción. Pida el restablecimiento a quien corresponda según su cuenta (§1)                                                                                                                                                                         |
| En el iPhone no aparece «Activar avisos en este aparato»                                   | La consola no se abrió desde el ícono de la pantalla de inicio, o el iPhone tiene una versión anterior a iOS 16.4                                                                                                                                                       |
| La guardia lee que el aviso «no le llega a la app del residente»                           | Nadie de esa vivienda activó los avisos en un aparato, o el servidor no tiene las llaves de avisos. Avísele por teléfono o por el citófono                                                                                                                              |
| «La palabra la tiene otro operador»                                                        | Otro operador tiene el canal de ese equipo. Espere en la cola o salga de ella con «Salir de la cola»                                                                                                                                                                    |
| «El navegador no dio el micrófono…»                                                        | Permita el micrófono para la página y vuelva a pulsar. Fuera de HTTPS el navegador no lo da                                                                                                                                                                             |
| En la guardia, el botón de abrir no responde                                               | El equipo tiene varias puertas: elija una en «Punto de acceso»                                                                                                                                                                                                          |
| El vídeo no carga desde fuera del conjunto                                                 | Sin TURN desplegado, el vídeo no atraviesa redes que lo bloquean ([`COTURN.md`](COTURN.md)). Abrir no depende de él                                                                                                                                                     |
| La franja dice «La reversión automática no llegó al equipo…»                               | El equipo o el Edge no contestan. El sistema reintenta y abrió una alerta. Administración: revise la conexión del equipo y use «Revertir ahora»                                                                                                                         |
| «El código de invitación no es válido o ya se usó»                                         | El código no es de ninguna plaza libre: mal escrito, ya usado, de una plaza retirada o de otro conjunto. Sale igual mientras «Crear cuenta» esté suspendido. Pida al titular el código que ve hoy en «Ocupantes» y escríbalo entero, con el código del conjunto delante |
| «Las cuentas son para mayores de edad. Un adulto de su hogar lo registra desde Mi familia» | Es lo previsto: los menores no tienen cuenta (§6)                                                                                                                                                                                                                       |
| «Ese usuario no está disponible»                                                           | Ya hay una cuenta con ese usuario en su copropiedad: elija otro. El código sigue sirviendo                                                                                                                                                                              |
| «La administración debe asignarle su vivienda»                                             | Su cuenta es anterior a la ronda 15-W y no tiene vivienda: el superadministrador se la asigna con «Asignar vivienda» (§2)                                                                                                                                               |
| «Su vivienda tiene el máximo de N plazas. Para más, pídalo a la administración»            | La vivienda llegó a su tope. El superadministrador puede ampliarlo (§2)                                                                                                                                                                                                 |
| «Dé de baja este vehículo y registre el nuevo»                                             | La placa de un vehículo con historial no se cambia (§6)                                                                                                                                                                                                                 |
| Configuración dice «Registro suspendido por intentos»                                      | Demasiados códigos incorrectos en una hora. Se reanuda solo al cumplirse la hora, o antes con «Reanudar» (§2)                                                                                                                                                           |

### Cuando reporte un fallo, dé el número de correlación

Toda respuesta del sistema lleva una cabecera `x-request-id`. Ese número
identifica **su** petición en el registro del servidor. Con él, quien lo atienda
encuentra exactamente lo que pasó; sin él, busca a ciegas.

En la consola aparece en el detalle del error. Cópielo tal cual.

---

## Lo que este manual no cubre

- **Instalación y configuración de los equipos Hikvision** —
  [`INTEGRACION_HIKVISION.md`](INTEGRACION_HIKVISION.md), escrita para
  seguirla frente al equipo.
- **Llaves y activación de los avisos por Web Push** —
  [`AVISOS_WEB_PUSH.md`](AVISOS_WEB_PUSH.md).
- **Firma y publicación de la app Android** — [`APK_FIRMADO.md`](APK_FIRMADO.md).
- **Despliegue del sistema** — [`DESPLIEGUE.md`](DESPLIEGUE.md).
- **Conexión con Supabase** — [`CONEXION_SUPABASE.md`](CONEXION_SUPABASE.md).
- **Instalación del Edge Gateway** — [`DESPLIEGUE_EDGE.md`](DESPLIEGUE_EDGE.md).
