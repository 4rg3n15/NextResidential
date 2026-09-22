# Manual de usuario · por rol

> **Este manual describe lo construido, no lo previsto.** Donde una función
> todavía no existe, lo dice y nombra la etapa que la trae. Un manual que
> promete pantallas que no están es peor que uno incompleto: hace perder el
> tiempo buscándolas.

**El sistema tiene seis roles.** No son seis niveles de un mismo permiso: son
seis trabajos distintos, y cada uno ve una consola distinta. La interfaz oculta
lo que no le toca a cada uno, pero **quien deniega de verdad es el servidor**:
si un enlace llevara a una pantalla ajena, la API respondería 403 igualmente.

| Rol                    | Superficie             | En una frase                                                     |
| ---------------------- | ---------------------- | ---------------------------------------------------------------- |
| Superadministrador     | Consola web            | Opera la plataforma y ve **todas** las copropiedades             |
| Administrador          | Consola web            | Opera **una** copropiedad: padrón, zonas, dispositivos, informes |
| Portero / Seguridad    | Consola web (Portería) | Atiende **su** puerta                                            |
| Operador de central    | Consola web (Guardia)  | Atiende **varias** copropiedades desde la central                |
| Residente              | App móvil              | Autoriza visitas a **su** vivienda                               |
| Servicio / Integración | Sin interfaz           | Identidad de máquina: Edge Gateway y trabajos programados        |

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

- **Contraseña olvidada:** enlace «¿Olvidó su contraseña?» en la pantalla de
  acceso. Llega un correo con un enlace de un solo uso.
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

Sin conexión la consola muestra una pantalla que lo dice. **No muestra datos
viejos presentados como actuales**: en un sistema de control de acceso, un
aforo de hace dos horas es peor que una pantalla honesta.

---

## 2 · Superadministrador

Es el rol de **plataforma**: no pertenece a ninguna copropiedad y las ve todas.

### Qué puede hacer

| Tarea                                    | Dónde                                   |
| ---------------------------------------- | --------------------------------------- |
| Conmutar entre copropiedades             | Selector de la cabecera                 |
| Todo lo del administrador, en cualquiera | Las mismas pantallas                    |
| Ver la auditoría del sistema             | Informes → Auditoría de sistema         |
| Retirar el segundo factor a un usuario   | Procedimiento documentado, con registro |
| Ver las latencias comprometidas          | **Latencias**                           |

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

### 3.3 · Visitantes y autorizaciones

El residente autoriza desde su app; el administrador ve todas las
autorizaciones de la copropiedad y puede **revocar** cualquiera con motivo.

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

Una sola pantalla, **Portería**, y está pensada para usarse de pie y con prisa.

### El flujo

1. El evento actual aparece arriba, con la evidencia —foto, recorte de placa—,
   la vivienda de destino y la autorización que aplica.
2. Decide: **Abrir** o **Denegar**.
3. **El motivo es obligatorio en los dos casos** (CA-16, CA-17, RN-08). Sin
   motivo, el botón no ejecuta nada. No es burocracia: una apertura manual sin
   motivo es indistinguible de una apertura indebida cuando alguien revise el
   histórico tres semanas después.

### Lo demás de la pantalla

- **Historial inmediato** de lo que ha pasado en su puerta.
- **Alertas activas** y **listas negras** vigentes de su copropiedad.

### Lo que el portero no ve

No ve el padrón completo, ni otras copropiedades, ni los informes. **Y no ve la
guardia virtual**: no es un permiso que le falte, es otra consola. Él atiende su
puerta; el operador de central atiende varias copropiedades que no ve.

---

## 5 · Operador de central

La consola **Guardia virtual**, para atender varias copropiedades desde un solo
puesto.

### El flujo de una llamada (CU-03)

1. La **cola de atención** muestra quién espera y **cuánto lleva esperando**.
2. Al tomar una, aparecen el vídeo en vivo, la ficha de la vivienda y el
   visitante.
3. **Audio bidireccional** con el visitante. El canal es **exclusivo por
   equipo**: si otro operador lo tiene tomado, usted ve que está ocupado y
   espera, en vez de pisarse los dos.
4. Puede **contactar con el residente** antes de decidir.
5. **Abrir** o **denegar**, siempre con motivo, y queda atribuido a usted.
6. **Alerta de emergencia** si hace falta escalar.

Si el residente no responde, o responde que no, o usted está ocupado en otra
copropiedad, el flujo tiene salida para cada caso y la consola la ofrece.

### Conmutar de copropiedad

El selector cambia el ámbito entero. **No verá ni un dato de la copropiedad que
acaba de dejar** (KPI-35): no es solo que la pantalla se limpie; es que el
servidor deja de responderle por ella.

> **Sobre el vídeo y el audio (ETAPA 15).** Hasta que los equipos Hikvision
> estén conectados, la consola opera contra un simulador: el flujo, la
> exclusividad del canal y la atribución de la apertura son reales; la imagen y
> el sonido, no.

---

## 6 · Residente

**App móvil.** El residente **no tiene consola web**: si entra por el navegador,
el sistema se lo dice en vez de dejarlo en una pantalla vacía.

### Las ocho pantallas

| Pantalla        | Para qué                                        |
| --------------- | ----------------------------------------------- |
| Inicio          | Su vivienda, lo que está pasando ahora          |
| Mi familia      | Los residentes de su vivienda                   |
| Mis vehículos   | Sus placas                                      |
| Nuevo visitante | **La pantalla principal**: autorizar una visita |
| Zonas comunes   | Aforo actual y solicitud de acceso              |
| Historial       | Quién entró a su vivienda, con filtros          |
| Notificaciones  | Avisos de llegada y alertas                     |
| Perfil          | Sus datos y sus preferencias de aviso           |

### Autorizar una visita

1. **Nuevo visitante** → nombre y documento. No hace falta ningún identificador
   interno: si la persona ya visitó antes, el sistema la reconoce por su
   documento.
2. **Vigencia**: desde cuándo y hasta cuándo. Fuera de esa ventana no entra.
3. **Acompañantes**, si vienen más personas.
4. **Placa**, si llega en vehículo.
5. **Observaciones** para el portero.

Debería llevarle **menos de un minuto** (KPI-10).

### Lo que conviene saber

- **Usted solo autoriza a su vivienda** (RN-05). No puede autorizar a otra.
- Una persona en **lista negra no entra**, aunque usted la autorice (RN-06). La
  lista negra pesa más que cualquier autorización vigente.
- **La foto del visitante es del visitante.** Si la visita se identifica con
  reconocimiento facial, el consentimiento se le pide **a él, no a usted**
  (RN-10, Ley 1581 de 2012). Si no responde, la autorización sigue vigente pero
  solo por placa.
- **Su plantilla biométrica se borra sola** al vencer, y de inmediato si el
  titular revoca el consentimiento (RN-11).
- **Sin conexión** la app guarda lo que usted hizo y lo reintenta al volver.

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

| Síntoma                                                | Qué es, y qué hacer                                                                                                |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| «La sesión expiró» al escribir el código               | El código temporal caducó. Espere al siguiente y vuelva a escribirlo                                               |
| Un rol no ve una pantalla que cree que le toca         | La ve quien la necesita. Si cree que es un error, un administrador puede revisar sus roles                         |
| Una terminal aparece **caída** y usted la ve encendida | Dejó de latir. Revise red y hora del equipo: un reloj desincronizado produce este síntoma                          |
| Un aforo que no cuadra                                 | Mire la política de reinicio de la zona. Con `manual` o `nunca`, el contador no se reinicia solo                   |
| Una placa que el lector no reconoce                    | Compruebe que está **activa** y en la vivienda correcta. La normalización quita espacios y guiones automáticamente |
| «Demasiadas peticiones» (429)                          | Límite de peticiones (§2.7.5). Espere los segundos que indica la respuesta                                         |
| La consola no ofrece instalarse                        | Casi siempre es que no está entrando por HTTPS. Sin contexto seguro el navegador no la instala                     |

### Cuando reporte un fallo, dé el número de correlación

Toda respuesta del sistema lleva una cabecera `x-request-id`. Ese número
identifica **su** petición en el registro del servidor. Con él, quien lo atienda
encuentra exactamente lo que pasó; sin él, busca a ciegas.

En la consola aparece en el detalle del error. Cópielo tal cual.

---

## Lo que este manual no cubre

- **Instalación y configuración de los equipos Hikvision** — ETAPA 15, con su
  guía propia frente al equipo.
- **Despliegue del sistema** — [`DESPLIEGUE.md`](DESPLIEGUE.md).
- **Conexión con Supabase** — [`CONEXION_SUPABASE.md`](CONEXION_SUPABASE.md).
- **Instalación del Edge Gateway** — [`DESPLIEGUE_EDGE.md`](DESPLIEGUE_EDGE.md).
