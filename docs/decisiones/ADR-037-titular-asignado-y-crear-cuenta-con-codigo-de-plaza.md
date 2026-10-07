# ADR-037 · La administración crea al titular de cada vivienda; los demás crean su cuenta con un código de plaza

|               |                                                                                                                                                                                                                                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**    | Aceptada · ronda 15-W (2026-10-06) · **decisiones del cliente D-W1, D-W8 y D-W9** (extensión al contrato **E-07**)                                                                                                                                                                                                                        |
| **Sustituye** | **[ADR-023](ADR-023-cuentas-por-nombre-de-usuario.md) sólo para los residentes**: su cuenta ya no la da siempre la administración. Los porteros siguen como los dejó [ADR-031](ADR-031-porteros-por-numero-lista-blanca-y-modo-pruebas.md). Siguen vigentes, para todos, el correo sintético `.invalid` y la entrada por la API           |
| **Afecta a**  | migración `0055` · `apps/api/src/cuentas` (`POST /auth/registro`) · `apps/api/src/residente` (titulares, invitaciones, primer ingreso, suspensión del registro) · `packages/domain-core/src/residente` (`edad.ts`, `vinculacion.ts`, `ocupantes.ts`) · consola (Residentes, Configuración) · app (acceso, «Crear cuenta», primer ingreso) |
| **Registra**  | `[CONTRADICCIÓN]` **C-57**, **C-58** y **C-60** · S-15W-02, S-15W-04, S-15W-07 a S-15W-11, S-15W-13 y S-15W-17 · P-37 · P-38                                                                                                                                                                                                              |

---

## Lo incómodo primero

- **«Crear cuenta» es la primera ruta pública que crea identidades.** Hasta la
  15-W toda cuenta de la plataforma la daba alguien con sesión (ADR-023).
  Ahora la crea quien tenga el código de una plaza libre. Lo que la sostiene
  no es la interfaz: es que el código sólo existe en una vivienda que ya tiene
  titular, que lo reparte ese titular y que la ruta no deja adivinarlo (ver
  «Seguridad»).
- **El registro público de Supabase Auth sigue DESACTIVADO.** «Crear cuenta»
  no es el `signUp` de Supabase: es la API, que comprueba el código y la edad y
  crea la identidad con la llave secreta. Activar «Allow new users to sign up»
  abriría una segunda puerta sin ninguna de esas comprobaciones
  ([`CONEXION_SUPABASE.md`](../guias/CONEXION_SUPABASE.md) §6.4).
- **El correo que se escribe no se verifica.** Es un dato de contacto: no sirve
  para entrar ni para recuperar la contraseña.
- **La política de tratamiento de datos que se acepta es provisional**
  (`[SUPUESTO]` S-15W-08). El texto definitivo lo redacta el área legal de
  Grupo Control: `PENDIENTE DE DEFINICIÓN` **P-37**.
- **Desde aquí, la única puerta de una cuenta que no es la del titular es
  «Crear cuenta».** «Nuevo residente» sólo ofrece viviendas sin titular: la
  administración ya no da la segunda cuenta de un hogar.

## Contexto

ADR-023 (15-H) fijó las cuentas por nombre de usuario: las crea quien da de
alta, con una contraseña inicial y cambio obligatorio en el primer ingreso. La
15-I (D6, 3.2) añadió el primer ingreso del residente: vincular la vivienda con
el código de una plaza si la vivienda ya tenía cuentas, o marcar **«no lo
tengo»** si era la primera; quien lo marcaba quedaba como primer residente, es
decir, como titular.

Antes de tocar nada, la 15-W verificó en el código el problema que lo hacía
inaceptable (problema 1 del encargo, **CRÍTICO**): `AltaDeCuentaDeResidenteDto`
no llevaba vivienda, y `decidirVinculacion` dejaba que cualquier cuenta marcara
«no lo tengo» y se hiciera primer residente de **cualquier** vivienda vacía.
Con las credenciales que daba la administración —o, con autoservicio, con
cualquiera— se tomaba la vivienda de otro.

El cliente decidió (2026-10-06):

> **D-W1.** La app tiene «Crear cuenta», solo para residentes.
>
> **D-W8.** «Crear cuenta» pide seis campos, todos obligatorios: usuario,
> correo, contraseña, confirmación, código de invitación y fecha de nacimiento.
> Sin un código válido no se crea la cuenta.
>
> **D-W9.** La PRIMERA cuenta de cada vivienda la crea la administración, ya
> asignada a esa vivienda. Esa cuenta es el titular. Los demás crean su cuenta
> con un código de plaza que el titular les comparte.

La fecha de nacimiento es `[SUPUESTO]` S-15W-02: hace falta para cumplir D-W2,
«sólo los mayores de 18 años tienen cuenta» ([ADR-038](ADR-038-menores-sin-cuenta-gestionados-por-el-hogar.md)).

## Decisión

### 1 · La primera cuenta de cada vivienda la da la administración, ya asignada (D-W9)

- `POST /copropiedades/:id/residentes/cuentas`, sólo del superadministrador,
  **exige `viviendaId`**: una vivienda existente, activa, de esa copropiedad y
  **sin titular**. Si no, 404 («Vivienda no encontrada») o 409 («Esta vivienda
  ya tiene titular: los demás entran con un código de plaza»).
- La cuenta nace con contraseña inicial y cambio obligatorio —ADR-023 sigue en
  pie para ella— y, **en la misma transacción**, queda como titular:
  `ocupacion_de_viviendas.primer_residente_id` más la fila
  `titular_asignado_por_administracion` en la bitácora de residentes.
- La titularidad se escribe bajo el bloqueo de la vivienda
  (`ncr:vinculacion:<vivienda>`) con un `INSERT` condicionado a que la vivienda
  siga sin titular. De dos altas simultáneas para la misma vivienda gana una; la
  otra recibe 409 y su identidad en el proveedor **se elimina** (la compensación
  de ADR-023). La comprobación previa sólo sirve para contestar antes de crear
  nada en el proveedor (ADR-04).
- **«Sin titular»** quiere decir que ninguna cuenta **activa** está vinculada a
  la vivienda —como residente, como primer residente o en una plaza—. Un titular
  dado de baja deja la vivienda sin titular si no queda otro adulto con cuenta, y
  la administración puede entregar otra primera cuenta. Si quedan otros adultos,
  la vivienda no se ofrece como «sin titular»: es **P-38**.
- **Cuentas anteriores a esta ronda sin vivienda:** «Asignar vivienda»
  (`POST …/residentes/cuentas/:usuarioId/vivienda`, `{ viviendaId, motivo }`),
  con las mismas comprobaciones; la cuenta queda como titular y la bitácora
  anota `vivienda_asignada_por_administracion`. Sólo a cuentas **activas**
  (`[SUPUESTO]` S-15W-11).
- El buscador de la consola (`GET …/residentes/viviendas-sin-titular?q=`)
  devuelve 50 como mucho y compara con `position`, no con `LIKE`: un `%`
  tecleado no es un comodín.

### 2 · Nadie llega ya a una vivienda declarándola vacía

`decidirVinculacion` pierde la rama `como_primer_residente` («no lo tengo»).
El cambio de vivienda desde el perfil (`POST …/mi/vinculacion`) exige **siempre**
el código de una plaza libre de la vivienda de destino:

| Caso                                              | Respuesta                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Quien pide el cambio es el titular de su vivienda | `TITULAR_NO_SE_MUDA`, antes de mirar nada (S-15W-10, P-38)                       |
| 5 códigos equivocados en 15 minutos               | `DEMASIADOS_INTENTOS`, antes de mirar la vivienda (ADR-025)                      |
| La vivienda de destino no tiene ninguna cuenta    | `VIVIENDA_SIN_TITULAR`, ni con código: la primera cuenta la da la administración |
| La vivienda tiene cuentas y no se trae código     | `CODIGO_REQUERIDO`                                                               |
| La vivienda tiene cuentas y se trae código        | Se compara con sus plazas libres                                                 |

El orden de las reglas está en `vinculacion.ts`, con una prueba por cada pareja
en conflicto. El cambio suelta la plaza vieja **antes** de tomar la nueva, en la
misma transacción, y le regenera el código: las pruebas encontraron que, al
revés, el índice único de una plaza por cuenta convertía un código correcto en
«código incorrecto».

### 3 · Los demás, con «Crear cuenta» en la app (D-W1, D-W8)

`POST /auth/registro`: pública (`@Publico()`), sin sesión por definición y **sin
tokens** en la respuesta. Su cuerpo:

| Campo                      | Qué es                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `usuario`                  | De 3 a 32, con el juego de caracteres de ADR-023                                                         |
| `correo`                   | Contacto **no verificado**, normalizado y no único. No sirve para entrar ni para recuperar la contraseña |
| `contrasena`               | La política de siempre (8, mayúscula, minúscula, dígito y símbolo)                                       |
| `confirmacion`             | Igual a `contrasena`                                                                                     |
| `codigoDeInvitacion`       | `<código corto>-XXXX-XXXX`, con guiones, espacios y minúsculas opcionales                                |
| `fechaNacimiento`          | `AAAA-MM-DD`                                                                                             |
| `aceptaTratamientoDeDatos` | Tiene que ser `true`                                                                                     |
| `versionPolitica`          | La versión de la política que se mostró; si no es la vigente, el registro no sigue                       |

`rol`, `copropiedadId`, `viviendaId`, `plazaId` o `esTitular` dan **400**
(`forbidNonWhitelisted`): quien crea su cuenta no elige su conjunto, ni su
vivienda, ni su papel. Los dice el código.

El caso de uso (`registrar-residente.ts`) sigue este orden, y cada paso tiene su
porqué:

| Paso | Qué se comprueba                                                                              | Por qué ahí                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1    | La **forma**, campo a campo: usuario, contraseña, confirmación, versión de la política, fecha | Antes de tocar la base; no dice nada de ningún conjunto                                                         |
| 2    | La **edad**, con el reloj inyectado y el día de Bogotá (ADR-038)                              | Antes que el prefijo: un menor recibe la misma respuesta exista o no el conjunto, y no crea nada en ningún lado |
| 3    | El **prefijo** del código resuelve la copropiedad por su código corto                         | Sin conjunto, una comparación ficticia del mismo coste                                                          |
| 4    | ¿El registro de esa copropiedad está **suspendido** por intentos?                             | Contesta como un código malo y no cuenta el intento: no se evaluó                                               |
| 5    | El **código**, en tiempo constante, sólo en esa copropiedad                                   | El fallo cuenta para la suspensión de esa copropiedad                                                           |
| 6    | La **cuenta y su plaza**, en una transacción                                                  | Si otra alta se llevó la plaza en el mismo instante: el mismo 400 y la identidad sobrante se elimina            |

El paso 2 es una desviación declarada del orden del encargo, que ponía la edad
después de la suspensión: así la edad no sirve para averiguar qué códigos cortos
existen ni qué registro está suspendido.

El paso 6 ata la cuenta a la plaza con
`UPDATE plazas_de_ocupante SET usuario_id = … WHERE usuario_id IS NULL AND persona_id IS NULL`:
cero filas deshacen el alta entera. La cuenta nace con
`usuarios.origen_de_alta = 'autorregistro'`, rol residente y **sin cambio
obligatorio**, porque la contraseña es suya; nunca como titular. La bitácora
anota `autorregistro` con `plaza N · política <versión>`. La respuesta es
`201 { creada: true }`, y la app entra sola después por `POST /auth/acceso`, con
el prefijo del código como código de la copropiedad. El correo del registro se
queda sólo en la memoria de la app, propone el del primer ingreso y se olvida al
cerrar la sesión (`[SUPUESTO]` S-15W-17).

### 4 · La identidad la crea la API; el registro público de Supabase, apagado

La API crea la identidad con la **llave secreta**, por la API de administración
de Supabase Auth, con el correo sintético `.invalid` de ADR-023, igual que para
el titular y el portero. Ese camino no depende del alta pública, que **queda
desactivada** en el proyecto. El correo de contacto nunca va a
`usuarios.correo`: llega a `personas.correo` cuando la persona existe
(`[SUPUESTO]` S-15W-04).

### 5 · El primer ingreso, sin vivienda ni código

`POST …/mi/alta` pide nombres, apellidos, documento **de adulto** (cédula,
cédula de extranjería o pasaporte), teléfono, fecha de nacimiento —obligatoria—
y correo, opcional (la app propone el de «Crear cuenta»). Crea la persona y el
residente en la vivienda que la cuenta **ya trae**, y lo marca `es_titular` si
es el titular.

| Motivo                      | Qué pasa                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SIN_VIVIENDA`              | «La administración debe asignarle su vivienda»: una cuenta antigua sin vivienda espera a «Asignar vivienda»                                             |
| `YA_VINCULADA`              | La cuenta ya completó su alta                                                                                                                           |
| `DOCUMENTO_EN_USO`          | El documento pertenece a otra cuenta o a otra vivienda                                                                                                  |
| `CUENTA_BLOQUEADA_POR_EDAD` | La fecha es de un menor: cuenta inactiva, sin rol, plaza liberada con código nuevo y bitácora `cuenta_bloqueada_por_edad`; nada de la persona se guarda |

Hasta este paso, `usuarios.nombre` es el nombre de usuario (`[SUPUESTO]`
S-15W-07); después, el nombre completo de la persona.

### 6 · Los códigos llevan el prefijo del conjunto

`MIRA-K7PQ-2XWZ`: el código corto de la copropiedad (0038) más los ocho símbolos
derivados de ADR-025, formateados y normalizados en el dominio
(`formatearCodigoDeOcupante`, `normalizarCodigoDeOcupante`). En «Crear cuenta»
no hay sesión que diga la copropiedad: la dice el prefijo. Un prefijo de otro
conjunto cuenta como código incorrecto.

Por eso **«Crear cuenta» necesita que la copropiedad tenga código corto**, que
es opcional desde la 0038 (`[SUPUESTO]` S-15W-13). Sin él, los códigos de plaza
salen sin prefijo (`ABCD-EFGH`) y el registro los rechaza con el mensaje
genérico: nada dice de qué conjunto son. El superadministrador lo asigna antes
de que los residentes empiecen a usarlo.

## Seguridad

- **Una sola respuesta para todo código malo.** Incorrecto, ya usado, de otro
  conjunto, de un conjunto que no existe o con el registro suspendido: el MISMO
  400 «El código de invitación no es válido o ya se usó», después del MISMO
  tiempo mínimo (500 ms, `TIEMPO_MINIMO_DE_REGISTRO_FALLIDO_MS`), el igualador
  de tiempo de ADR-023. También cuando el código era bueno y otra alta
  simultánea se llevó la plaza en ese instante: para quien llega tarde, el
  código ya está usado, y no cuenta para la suspensión.
- **Comparación en tiempo constante y sólo en la copropiedad del prefijo.** Se
  calculan y comparan los códigos de **todas** las plazas candidatas de esa
  copropiedad —las libres de viviendas activas con titular, y las de personas ya
  mayores de edad sin cuenta (traspaso, ADR-038)—, las dos comparaciones siempre
  y sin salir antes. Con un prefijo que no existe, la comparación se hace contra
  64 plazas ficticias. El tiempo no dice cuántas plazas hay, cuál casi
  coincidía ni qué conjuntos existen.
- **Límites** (§2.7.5), todos con 429 y `Retry-After`:

  | Ámbito                      | Límite                                                     | Qué frena                                                 |
  | --------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
  | Por IP                      | 10 cada 10 min (`default`, en la ruta)                     | El volumen desde una dirección                            |
  | Por IP y prefijo            | 5 cada 15 min (limitador con nombre `registro`)            | Probar códigos de UN conjunto sin gastar el cupo de otros |
  | Por copropiedad, en la base | 30 códigos fallidos en 1 hora suspenden su registro 1 hora | Lo que no se esquiva rotando la IP                        |

  Una petición **sin código** —el formulario vacío con el que la app pide la
  política (C-60)— no entra en el limitador por IP y prefijo: no tiene prefijo
  que contar ni llega a comparar nada. La cuenta el límite por IP. Un código
  **malformado** sí cuenta en los dos. Antes de corregirlo, abrir «Crear cuenta»
  cinco veces en 15 minutos desde una misma red dejaba la sexta sin el texto de
  la política.

  En modo pruebas los limitadores con nombre **suben, nunca se apagan**
  (ADR-031).

- **La suspensión.** Dura una hora o hasta que el superadministrador la
  reanuda, con motivo (`POST …/residentes/registro/reanudacion`; 409 si no está
  suspendido). Deja una fila `rate_limit` en `auditoria_seguridad` (recurso
  `auth/registro`, resultado `429`) y el aviso «Registro suspendido por
  intentos» en Configuración (`[SUPUESTO]` S-15W-09); la reanudación anota
  `registro_reanudado` en la bitácora y `cambio_configuracion` en la auditoría.
  Tras suspender o reanudar, la cuenta de fallos vuelve a cero.
- **Sin enumeración.** El registro no confirma qué conjuntos existen, qué
  códigos casi coinciden ni si el registro está suspendido. El único rechazo
  distinto, «Ese usuario no está disponible» (409), sólo lo lee quien ya
  presentó un código válido: el usuario se comprueba al crear la cuenta, en el
  paso 6.
- **La IP nunca en claro.** Cada fallo se anota en la bitácora antes de que
  exista la cuenta (`usuario_id` nulo) con `ip:<16 hexadecimales>`: un HMAC de la
  IP con la llave de esa copropiedad y el propósito propio
  `ncr:ip-de-registro:v1` (`PROPOSITOS.ipDeRegistro`).
- **Nadie elige su papel, ni se lo cambia después.** Los campos de alcance dan
  400; la cuenta nace atada a su plaza y nunca titular; y una cuenta no se cambia
  a sí misma `origen_de_alta` por la REST (`app.tg_usuario_campos_propios`,
  rehecho en la 0055): si pudiera, un autorregistro se haría pasar por cuenta de
  la administración. Tampoco ninguna escritura del residente con cuerpo acepta
  `viviendaId`, `personaId`, `titularId`, `rol`, `estado`, `origen` ni
  `es_titular`: 400 que nombra el campo. La vivienda, la persona y el rol los
  pone el ámbito que resuelve la API.
- **En la suite de aislamiento**, `POST /auth/registro` está en `PUBLICAS` con
  su justificación escrita: es la única exención nueva de la 15-W (C-60).

## Alternativas descartadas

| Alternativa                                              | Por qué no                                                                                                                                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activar el alta pública de Supabase Auth (`signUp`)      | La identidad nacería fuera de la API: sin código, sin edad, sin límites y sin bitácora, con la llave publicable, que es pública por diseño. Y cualquiera podría registrar a mano un correo bajo `usuarios.ncr.invalid` (lo que la 15-H ya pidió impedir) |
| Todas las cuentas por la administración, como en ADR-023 | El cliente decidió D-W1                                                                                                                                                                                                                                  |
| Conservar «no lo tengo» con más comprobaciones           | Era el problema CRÍTICO: el primero que llegaba se quedaba la vivienda. D-W9 pone la titularidad en manos de quien conoce el padrón                                                                                                                      |
| Una `GET` pública con el texto de la política            | Una segunda ruta sin sesión. El texto viaja en el 400 de la propia ruta (C-60)                                                                                                                                                                           |
| Códigos sin prefijo en «Crear cuenta»                    | Sin sesión no hay copropiedad: cada intento probaría las plazas libres de todas a la vez, y ni el límite por prefijo ni la suspensión por copropiedad tendrían a qué atarse                                                                              |

## Consecuencias

- **Los porteros no cambian** (ADR-031), ni el administrador, el operador de
  central o el superadministrador: «Crear cuenta» es sólo para residentes.
- `usuarios.origen_de_alta` distingue las cuentas: `administracion` (el titular,
  o una cuenta anterior a la 15-W) o `autorregistro`. La consola lo enseña en la
  columna «Origen» de Residentes.
- **Quien creó su cuenta no tiene cambio obligatorio**, pero su recuperación es
  la de cualquier residente: la restablece una persona; el correo de contacto no
  sirve para eso.
- **El titular es el único que no se muda desde la app** (P-38). Mientras no se
  decida, una vivienda cuyo titular se dio de baja y conserva otros adultos con
  cuenta no se ofrece como «sin titular».
- **Rotar `BIOMETRIA_LLAVE`** invalida, además de los códigos libres (ADR-025),
  los códigos de traspaso ya compartidos, y cambia desde ese momento la huella de
  la IP de los fallos: los propósitos son distintos, la llave maestra es la
  misma.
- **Riesgo residual declarado:** quien recibe un código válido crea una cuenta
  en esa plaza. El código lo reparte el titular, que puede retirar la plaza libre
  para anularlo (ADR-038), y la cuenta queda con su origen, su plaza y su
  versión de la política en la bitácora.

## Verificación

- `apps/api/test/titular-por-administracion-pg.test.ts` · la cuenta nace
  asignada (ocupación, bitácora, origen y cambio obligatorio); el titular cambia
  la contraseña antes de nada; vivienda con titular → 409 e inactiva,
  inexistente o ajena → 404, sin dejar nada; tres altas simultáneas para la
  misma vivienda dejan un titular y eliminan las identidades sobrantes; un
  titular que resulta menor queda bloqueado y la vivienda, libre.
- `apps/api/test/asignar-vivienda-pg.test.ts` · «Asignar vivienda» a una cuenta
  antigua, con motivo: queda de titular y entra a su vivienda; un residente en
  las rutas de la administración recibe 403.
- `apps/api/test/autorregistro.e2e.test.ts` · el formulario vacío da 400 con la
  política vigente; forma por campo; los campos de alcance dan 400; un menor no
  crea nada; un código válido ata la cuenta a ESA plaza, nunca de titular, y no
  da tokens; incorrecto, usado, de otro conjunto o inexistente dan la MISMA
  respuesta en el tiempo mínimo; usuario ocupado → 409 y el código sigue
  sirviendo; el mismo código cuatro veces a la vez deja UNA cuenta.
- `apps/api/test/autorregistro-limites.e2e.test.ts` · 30 fallos en una hora
  suspenden el registro de ESA copropiedad y el superadministrador lo reanuda; la
  undécima petición en diez minutos desde una IP da 429 con `Retry-After`.
- `apps/api/test/limitador-de-registro.e2e.test.ts` (sin base) · el limitador
  por IP y prefijo, visto fallar: el sexto intento con el mismo prefijo desde la
  misma IP da 429 con `Retry-After`; otro prefijo desde esa IP, o ese prefijo
  desde otra, siguen; el formulario sin código no gasta ese cupo, y un código
  malformado sí.
- `apps/api/test/campos-prohibidos-del-residente.e2e.test.ts` · toda escritura
  del residente con cuerpo, sacada del enrutador, rechaza cada uno de los siete
  campos prohibidos con un 400 que lo nombra.
- `apps/api/src/cuentas/aplicacion/registrar-residente.test.ts` y
  `crear-cuenta-con-vinculo.test.ts` · el orden de los pasos y la compensación.
- `apps/api/src/residente/aplicacion/titulares-y-topes.test.ts` · el alta del
  titular con su transacción, «Asignar vivienda» y la reanudación del registro.
- `apps/api/src/residente/aplicacion/primer-ingreso.test.ts` y `alta.test.ts` ·
  el primer ingreso (un menor bloquea la cuenta sin escribir nada de la persona)
  y el cambio de vivienda (un prefijo de otro conjunto es un código incorrecto y
  cuenta; el titular no se muda).
- `packages/domain-core/src/residente/vinculacion.test.ts` · una prueba por cada
  pareja de reglas en conflicto, el titular que no se muda incluido.
- `apps/api/test/aislamiento.e2e.test.ts` · `POST /auth/registro` es la única
  ruta pública nueva.
- `supabase/policies/tests/99l_autorregistro_y_menores.sql` · la bitácora acepta
  los hechos nuevos también sin cuenta, y una cuenta no se cambia su origen.

## Contingencia

Si la suspensión frena a residentes legítimos, el superadministrador la reanuda
desde Configuración, con motivo. Si los límites resultaran estrechos en sitio, el
modo pruebas los sube sin apagarlos (ADR-031). Si el cliente pidiera retirar el
autoservicio, la salida es un ADR nuevo, y no un interruptor escondido: hoy
«Nuevo residente» sólo da cuentas de titular.
