# Bloque 4 · Sesiones, restablecimiento sin SMTP y segundo factor

> **Propuesta escrita. No se ha construido nada.** Cuando apruebe, decidimos qué
> entra antes de la ETAPA 10 y qué se difiere.
> Las estimaciones están en **jornadas de trabajo del agente**, no en horas suyas.

---

## 0. Resumen ejecutivo, para leer primero

Lo que pide se puede construir, y la mayor parte es **cableado sobre lo que
Supabase Auth y el navegador ya hacen**. Hay dos excepciones que conviene ver
antes de aprobar nada:

| Lo que pidió                                             | Se apoya en                     | Realidad                                                                                                            |
| -------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Duración por inactividad distinta por rol                | Supabase Auth, **por proyecto** | Supabase tiene **una** política de sesión para todo el proyecto. Lo de por rol hay que construirlo en nuestra capa  |
| «Al expirar, el residente entra con correo y contraseña» | —                               | Eso no es expirar, es cerrar sesión. Ver §1.3: creo que quiso decir otra cosa y propongo la lectura que sí funciona |
| Biométrico junto al TOTP                                 | WebAuthn, nativo del navegador  | **El servidor de WebAuthn hay que construirlo.** Supabase Auth no lo trae. Es la pieza más cara de todo el bloque   |
| «Retomar sesión»                                         | —                               | Construcción propia, pero pequeña si se apoya en el refresco que ya existe                                          |
| Restablecimiento validando con la app de autenticación   | —                               | Construcción propia. Supabase Auth **no** ofrece «recuperar contraseña con TOTP»                                    |
| Los diez códigos como salida                             | Ya construido                   | Confirmado en §5                                                                                                    |

**Mi recomendación, en una línea:** construir ahora el §1 (duraciones por rol),
el §2 (restablecimiento con TOTP y la pantalla de gestión de usuarios) y el §4
(«Retomar sesión»), y **diferir WebAuthn a la ETAPA 14**. El motivo está en §3.4
y no es pereza: es que WebAuthn bien hecho pesa casi tanto como los otros tres
juntos y no desbloquea nada de la ETAPA 10.

---

## 1. Duración de sesión por rol

### 1.1 Lo que hay hoy

La sesión vive en **dos cookies `httpOnly`** que fijó la 09-A: la de acceso, que
caduca con el token, y la de refresco, que vive más y es la que permite renovar.
Con «Recordar sesión» marcado, la de refresco dura **30 días**; sin marcar, es
cookie de sesión del navegador y muere al cerrarlo.

Supabase Auth tiene un ajuste de caducidad por inactividad, pero **es del
proyecto entero**: no distingue roles. Si lo pusiéramos a 1 hora para proteger al
superadministrador, el residente tendría que entrar cada hora.

### 1.2 La propuesta

La duración por rol se decide **en nuestra capa**, no en Supabase.

| Rol                 | Inactividad | Absoluta | «Recordar sesión» |
| ------------------- | ----------- | -------- | ----------------- |
| Superadministrador  | 1 h         | 12 h     | No se ofrece      |
| Administrador       | 2 h         | 12 h     | No se ofrece      |
| Operador de central | 5 h         | 24 h     | No se ofrece      |
| Portero             | 5 h         | 24 h     | No se ofrece      |
| Residente           | 48 h        | 30 días  | Sí                |

Mecanismo: la cookie de refresco lleva, además del token, **el instante de la
última actividad y el de creación**, firmados. El interceptor que ya renueva el
token comprueba las dos cotas antes de renovar y, si alguna venció, responde
`401` con un motivo tipado que la consola traduce a la pantalla correcta.

Los valores viven en el esquema de configuración con Zod, no como constantes
sueltas: son una decisión de operación y tienen que poder ajustarse sin
recompilar.

**Por qué añado la absoluta sin que la pidiera:** una sesión que sólo caduca por
inactividad no caduca nunca si alguien deja la pestaña abierta. Un portátil de
portería abierto toda la semana es exactamente el caso.

**Administrador y operador de central los añado yo** porque su ausencia en su
lista dejaría dos de los seis roles sin regla, y el valor por defecto sería el
más permisivo. Si prefiere otros números, son dos líneas.

### 1.3 El punto donde creo que hay un malentendido

> _«Al expirar: el superadministrador solo repite segundo factor; el residente
> entra con correo y contraseña sin segundo factor»._

Si la sesión expiró, el refresco ya no vale y **no hay nada que reanudar**: pedir
sólo el segundo factor sería reconocer al usuario por algo que ya caducó. Lo que
creo que quiso decir —y lo que propongo— son **dos cosas distintas**:

- **Expiración de verdad** (pasó la cota absoluta, o el usuario cerró sesión):
  contraseña completa + el segundo factor que su rol exija. Sin excepciones.
- **Reanudación** (la cota de inactividad venció pero el dispositivo sigue
  siendo reconocido): eso es «Retomar sesión», y es el §4. Ahí sí basta el
  segundo factor.

La diferencia importa porque la primera lectura debilitaría RN-20: un
superadministrador que entra «sólo con segundo factor» tras una expiración real
es un superadministrador que entra sin contraseña.

Sobre _«el segundo factor vuelve a pedirse al residente tras 72 h sin usar la
aplicación»_: el residente **no tiene segundo factor obligatorio** (RN-20 sólo
alcanza a los tres administrativos). Lo interpreto como: pasadas 72 h, la
reanudación silenciosa deja de ofrecerse y hay que entrar con contraseña. Así lo
propongo.

**Peso: 1,5 jornadas.** Cotas firmadas, motivos tipados, configuración con Zod,
pruebas de los bordes —el segundo exacto de cada cota, el reloj adelantado—.

---

## 2. Restablecimiento sin SMTP

### 2.1 El problema real

Supabase Auth resuelve el restablecimiento **por correo** y sólo por correo
(ADR-008 lo dejó como mecanismo autoritativo). Sin proveedor SMTP, ese camino no
existe, y hoy la única salida es el panel de Supabase.

### 2.2 Residentes y superadministradores: con la app de autenticación

Flujo propuesto, sin un solo correo:

1. El usuario declara su identidad (correo o documento) en la pantalla de
   recuperación.
2. La API responde **siempre lo mismo**, exista o no la cuenta — si respondiera
   distinto, la pantalla sería un enumerador de usuarios.
3. Si la cuenta tiene TOTP inscrito, se pide un código. Si no lo tiene, se
   muestra el mismo mensaje neutro y no pasa nada: quien no tiene segundo factor
   no puede usar esta vía y necesita al superadministrador.
4. Código correcto → se emite un **vale de restablecimiento de un solo uso**,
   guardado en hash, con vida de **10 minutos**, ligado a la identidad y al
   `user-agent`; la pantalla de contraseña nueva lo consume.
5. Rate limiting endurecido por identidad **y** por IP (§2.7.5), con `429` y
   `Retry-After`.

**La cota que hay que decir en voz alta:** esto convierte el TOTP en el único
factor de recuperación. Quien pierde el teléfono **y** sus diez códigos depende
del superadministrador. Es aceptable si esa dependencia es explícita, y por eso
existe §2.3.

### 2.3 Porteros, y la pantalla de gestión de usuarios

Un portero puede restablecer **una vez**; para repetirlo, el superadministrador
lo habilita.

La pantalla nueva —`/usuarios`, sólo superadministrador— muestra porteros y
residentes de la copropiedad activa con: rol, estado, si tiene segundo factor
inscrito, cuántos códigos de recuperación le quedan, fecha del último
restablecimiento y **un botón «Habilitar restablecimiento»** que abre una ventana
de 24 h para esa cuenta.

Cada habilitación y cada restablecimiento consumido escriben en
`auditoria_seguridad` con su tipo propio —dos valores nuevos del enumerado, como
la migración `0028`—, con actor, objetivo, IP y `user-agent`. No se reutiliza
`restablecimiento_contrasena`: mezclarlos inutiliza el filtro durante un
incidente, que es el argumento de la `0023`.

**Peso: 3 jornadas.** 1 de API (vale de un solo uso, ventana de habilitación,
auditoría, migración), 1,5 de consola (recuperación con TOTP y pantalla de
usuarios con sus cinco estados), 0,5 de pruebas de aislamiento — la pantalla
lista usuarios de **una** copropiedad y entra en el barrido automáticamente.

---

## 3. Biométrico junto al TOTP: WebAuthn

### 3.1 Qué es estándar y qué no

| Pieza                                                                                               | Quién la pone                                   |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Lector de huella, Face ID, Windows Hello, llave física                                              | **El navegador y el sistema operativo.** Gratis |
| `navigator.credentials.create()` / `.get()`                                                         | **Estándar del navegador.** Gratis              |
| Formato de las credenciales (CBOR, COSE)                                                            | Estándar                                        |
| **Registro de credenciales, verificación de firma, contador anti-clonado, gestión del `challenge`** | **Nosotros.** No lo trae Supabase Auth          |
| Ligar la credencial al `aal2` de Supabase                                                           | **Nosotros**, y es la parte delicada            |

El malentendido habitual con WebAuthn es creer que «lo hace el navegador». El
navegador hace la mitad bonita; la otra mitad es un servidor de verificación con
estado.

### 3.2 La parte delicada, dicha sin rodeos

Supabase Auth decide `aal1`/`aal2`, y nuestros guards exigen `aal2` a los tres
roles administrativos (RN-20, CA-25). **Supabase no sabe qué es WebAuthn**, así
que una verificación WebAuthn nuestra no eleva el `aal` del token.

Sólo hay dos salidas honestas:

- **(a) WebAuthn como comodidad, no como factor.** Sirve para «Retomar sesión» y
  para el residente, pero **no** satisface RN-20. Los administrativos siguen
  pasando por TOTP.
- **(b) WebAuthn como factor de verdad**, con un `aal` propio en nuestra capa que
  conviva con el de Supabase. Es más potente y es donde aparece el riesgo: dos
  fuentes de verdad sobre el nivel de autenticación, y la primera vez que
  discrepen habrá que decidir cuál manda con alguien dentro.

**Recomiendo (a)** y dejar (b) para después de la auditoría de la ETAPA 13, que
es donde ese tipo de decisión se revisa con método.

### 3.3 Alcance si se construye

Registro de credencial junto al QR, verificación en el acceso, varias
credenciales por usuario, revocación desde la pantalla de usuarios, tabla nueva
con RLS, y —lo que casi siempre falta— el camino de **la credencial que no
responde**: el lector falla y el usuario tiene que poder volver al TOTP sin
quedarse fuera.

### 3.4 Peso y recomendación

**4,5 jornadas** en la variante (a). 2 de servidor de verificación, 1 de consola,
1 de pruebas —incluido un autenticador virtual en el recorrido de navegador, sin
el cual no hay forma de probarlo en CI—, 0,5 de esquema y RLS.

**Recomiendo diferirlo a la ETAPA 14.** Pesa casi tanto como §1, §2 y §4 juntos,
no desbloquea nada de la ETAPA 10, y los tres roles administrativos ya tienen
segundo factor. Es mejora de comodidad, no de seguridad.

---

## 4. «Retomar sesión»

### 4.1 Mecanismo

En el primer acceso completo con «Recordar este dispositivo», el servidor emite
un **token de dispositivo** opaco, aleatorio, que viaja en cookie **`httpOnly`,
`Secure`, `SameSite=Lax`** —condición 3 de su lista— y se guarda **en hash** en
la base, junto al usuario, la fecha de emisión y el `user-agent` recortado.

En la pantalla de acceso, si esa cookie llega y el hash casa con un dispositivo
vigente, se ofrece «Retomar sesión como …» y se pide **sólo el segundo factor**.
Si no llega, la pantalla es la de siempre; nada cambia visualmente para quien
entra desde un equipo nuevo.

**Nada del reconocimiento se apoya en algo que JavaScript pueda leer.** Ni huella
del navegador, ni `localStorage`, ni canvas: sólo una cookie que el propio
JavaScript de la página no puede leer.

### 4.2 Caducidad absoluta — condición 2

| Rol                                | Vida del dispositivo | Renovación                                        |
| ---------------------------------- | -------------------- | ------------------------------------------------- |
| Superadministrador                 | **No se ofrece**     | —                                                 |
| Administrador, operador de central | 7 días               | Se renueva con cada acceso completo, tope 30 días |
| Portero                            | 14 días              | Tope 30 días                                      |
| Residente                          | 90 días              | Tope 180 días                                     |

Dos cotas: la vida del token y un **techo absoluto** que no se renueva. Sin el
techo, un dispositivo que se usa a diario nunca caduca — que es la definición de
«eterna» que usted quiere evitar.

Al superadministrador no se le ofrece a propósito: es la cuenta que puede
habilitar restablecimientos ajenos, y para ella el ahorro de teclear la
contraseña no compensa.

El token se **revoca** al cambiar la contraseña, al retirar el segundo factor, al
cerrar sesión explícitamente, y desde la pantalla de usuarios («cerrar todas las
sesiones»).

### 4.3 Condición 1 · nada debilita RN-20

Retomar exige **segundo factor completo**. Para los tres roles administrativos,
el resultado es una sesión `aal2`; no hay camino que produzca `aal1` con acceso
administrativo. Lo que se ahorra es la contraseña, no el factor. La suite de
aislamiento ya rompe el build si la lista de rutas exentas de segundo factor
crece, y esto no la toca.

**Peso: 1,5 jornadas.**

---

## 5. Condición 4 · los diez códigos de recuperación — **confirmado**

Están construidos desde la ETAPA 03 y sirven exactamente para lo que usted dice.
Los hechos, no la intención:

- **Diez**, generados al inscribir el segundo factor.
- Guardados **en hash**, nunca en claro. Se muestran una vez.
- **De un solo uso**: consumido, no vuelve a servir.
- Sustituyen al TOTP en el paso de segundo factor, así que quien pierde el
  teléfono entra con un código.
- La ruta que los consume está entre las declaradas `@SinSegundoFactor()`, y esa
  lista **es de dos y la suite rompe el build si crece**.

Dos cosas que hay que añadir y que no están:

1. **Regenerarlos.** Hoy se emiten al inscribir y no hay forma de renovarlos: quien
   gaste los diez se queda sin salida. Va en la pantalla de usuarios. **0,5 jornadas.**
2. **Contador visible.** Cuántos quedan, en el perfil y en la pantalla de
   usuarios. Quien no sabe que le quedan dos no los repone. **0,25 jornadas.**

---

## 6. Recomendación final

| Orden | Qué                                                   | Peso   | Cuándo                                                                                  |
| ----- | ----------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| 1     | §2 · restablecimiento con TOTP + pantalla de usuarios | 3 j    | **Ahora.** Es el único punto donde hoy hay que entrar al panel de Supabase              |
| 2     | §5 · regenerar códigos y contador visible             | 0,75 j | **Ahora.** Va en la misma pantalla; hacerlo después es abrirla dos veces                |
| 3     | §1 · duraciones por rol con cota absoluta             | 1,5 j  | **Ahora.** Es la base sobre la que se apoya «Retomar sesión»                            |
| 4     | §4 · «Retomar sesión»                                 | 1,5 j  | **Ahora**, si el presupuesto llega; si no, es lo primero que yo diferiría de los cuatro |
| 5     | §3 · WebAuthn, variante (a)                           | 4,5 j  | **ETAPA 14**                                                                            |

**Total recomendado ahora: 6,75 jornadas**, frente a 11,25 de construirlo todo.

El criterio, que es el suyo: prefiero un subconjunto que funcione. Los cuatro
primeros cierran el agujero operativo real —hoy un administrador que pierde la
contraseña necesita que alguien entre al panel de Supabase— y no dejan a medias
nada de lo que tocan. WebAuthn no cierra ningún agujero: mejora una comodidad.
