# ADR-024 · Turnos del portero impuestos en cada petición, y el patrullaje como bloqueo de pantalla en el servidor

|                 |                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ETAPA 15-H (2026-09-25) · extensión al contrato **E-02**                                                                                     |
| **Sustituye a** | Nada. Precisa S-10 (el alcance «por turno» del operador de central) para el portero: ver C-33                                                           |
| **Afecta a**    | migración `0037`, `apps/api/src/porteria`, guard global de turno, `apps/web` (esquina del código, pantalla de patrullaje, panel del superadministrador) |

---

## Contexto

El portero sólo puede trabajar **dentro de su turno**, y su sesión tiene que
quedar bloqueada **al terminar el turno**. El token de Supabase caduca a los 5
minutos, pero se renueva solo: un turno que acaba a las 18:00 no puede depender
de que nadie refresque nada. Y el encargo pedía reutilizar «el claim
`copropiedades` acotado por turno (S-10)». Leído el gancho (`0024`), **ese
acotamiento no existe**: el gancho emite todas las asignaciones activas del
operador y no hay tabla de turnos (C-33). Un claim, además, vive lo que vive el
token; no puede cerrar una sesión a la hora exacta.

## Decisión

### Turnos · en la base, y consultados en CADA petición

- `turnos_de_porteria`: portero + **día** + **hora de inicio y fin** en la zona
  horaria de la copropiedad (`copropiedades.zona_horaria`). Un disparador
  calcula la **franja** (`tstzrange`) con esa zona; si la hora de fin es menor o
  igual que la de inicio, el turno **cruza la medianoche** y la franja acaba al
  día siguiente. La lógica pura equivalente vive en `porteria/dominio/turno.ts`
  y una prueba contra base comprueba que las dos calculan lo mismo.
- `sesiones_de_porteria`: una fila por **sesión de Supabase** (`session_id` del
  token), creada al iniciar sesión por la API con su turno, su origen y el hash
  del código de patrullaje.
- **Guard global** (`GuardaDeTurnoDePorteria`, el último: después del de roles
  y del de cambio de contraseña): para el rol `portero`, en cada petición,
  busca la sesión registrada y comprueba con el **reloj inyectado** que su
  turno sigue vigente. Sin sesión registrada o con la sesión cerrada, **401**
  —eso cierra el atajo de pedir un token a Supabase por otro camino—; fuera de
  turno, **403** y la sesión queda cerrada con motivo `fin_de_turno`; en
  patrullaje, **423**. `GET /porteria/sesion` y `POST /auth/cierre` son las
  únicas rutas que se admiten fuera de turno, para que la consola pueda decir
  por qué y cerrar.
- **La sesión se registra desde cuentas**: el inicio de sesión invoca el
  **gancho de sesión** del rol, que portería inscribe al arrancar en un
  registro que publica cuentas (portería depende de cuentas para crear las de
  sus porteros, así que no puede ser a la vez dependencia suya). Si el gancho
  del portero no estuviera inscrito, cuentas **niega** el inicio de sesión:
  falla cerrado.
- **Inicio de sesión**: fuera de turno, `POST /auth/acceso` rechaza **después**
  de comprobar la contraseña y revoca la sesión que Supabase acaba de abrir.
- **Relevo**: nadie libera a nadie. Cada portero entra cuando empieza SU turno.
  Si al terminar la franja **el mismo portero** tiene otro turno vigente —uno
  extra a continuación—, la sesión pasa a ese turno con su código nuevo en vez
  de cerrarse.
- **Turnos extra**: sólo el superadministrador, con motivo obligatorio; quedan
  en la bitácora.
- **Solapes**: dos porteros en la misma portería a la vez se admiten; al
  asignar o editar el turno se registra el solape en la bitácora y la respuesta
  lo devuelve para que el panel lo enseñe.
- **Un turno terminado no se edita ni se retira** (409): es historia, y las
  sesiones de la bitácora lo citan.

### Patrullaje · es un BLOQUEO DE PANTALLA, no un factor de autenticación

Se escribe así a propósito. El código de 4 dígitos **no acredita a nadie**: lo
ve cualquiera que mire la pantalla durante el turno. Lo que hace es impedir que
quien se siente en la silla mientras el portero patrulla use su sesión.

- Al registrar la sesión, el servidor fija el código del turno: se **deriva**
  con HMAC-SHA256 (llave derivada por HKDF de `BIOMETRIA_LLAVE` con el propósito
  `ncr:codigo-de-patrullaje:v1`, `[SUPUESTO]` S-48) de turno y portero, y en la
  fila se guarda **sólo su hash** (scrypt con sal). Cambia en cada turno porque
  cambia el turno.
- `GET /porteria/sesion` lo devuelve **sólo mientras la sesión está activa**:
  así la consola lo pinta en la esquina superior derecha durante todo el turno y
  lo recupera tras recargar, y nadie lo obtiene durante el patrullaje.
- `POST /porteria/sesion/patrullaje` pone la sesión **EN PATRULLAJE EN LA
  BASE**. Desde ese momento el guard rechaza **toda** ruta de esa sesión salvo
  consultar su estado, desbloquear y cerrar. Recargar la página no cambia el
  estado de la base.
- `POST /porteria/sesion/desbloqueo`: código correcto → la sesión sigue.
  Incorrecto → suma un intento. **Al quinto intento fallido la sesión se cierra
  del todo**, se revoca en Supabase y hace falta la contraseña. Con 10 000
  combinaciones, el límite es lo que da sentido al código.
- Inicio y fin de cada patrullaje, con su duración, y cada intento fallido,
  quedan en la bitácora de solo inserción.

### Permisos del portero · por `@Roles`, nunca por un `if`

- **Puede**: monitoreo, vistas en vivo, eventos, accionar equipos, recibir las
  llamadas del videoportero y **bloquear y desbloquear accesos y zonas
  comunes** (C-32: el cliente amplía lo que la 15-B reservaba a la
  administración).
- **No puede**: crear, editar, configurar ni dar de baja equipos; tocar la
  configuración de la copropiedad; editar su perfil (lo **ve**, no lo edita).
  Cada «no puede» tiene su prueba negativa contra la API.
- Sectores asignados: **informativos** mientras P-17 no se decida. Ocultarle
  alarmas a un portero de guardia es un riesgo de seguridad física.

### Rutas

| Quién                    | Ruta                                                                                               | Qué                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Portero                  | `GET /porteria/sesion`                                                                             | Estado: activa (con el código), patrullaje, cerrada o fuera de turno |
| Portero                  | `POST /porteria/sesion/patrullaje` · `POST /porteria/sesion/desbloqueo`                            | Patrullaje y desbloqueo                                              |
| Portero                  | `GET /porteria/perfil`                                                                             | Su perfil, de solo lectura                                           |
| Portero y administración | `POST /copropiedades/:id/zonas/:zonaId/apertura`                                                   | Abrir o cerrar la zona con motivo (C-32)                             |
| Superadministrador       | `GET`/`POST /copropiedades/:id/porteros` · `PUT …/porteros/:usuarioId`                             | Porteros: lista con turno y sesión, alta, datos                      |
| Superadministrador       | `GET`/`POST /copropiedades/:id/turnos` · `PUT …/turnos/:turnoId` · `POST …/turnos/:turnoId/retiro` | Calendario                                                           |
| Superadministrador       | `GET /copropiedades/:id/porteria/bitacora`                                                         | Bitácora                                                             |

### La bitácora

La escriben DOS módulos —cuentas (cambios y restablecimientos de contraseña) y
portería (sesiones, patrullajes, turnos, altas)— y la lee el panel, así que es
fontanería compartida (`comun/bitacora-de-identidad`) con una sola instancia en
memoria para la suite y una sola tabla en la base.

`bitacora_de_porteria` es de **solo inserción** con las mismas tres capas que
`eventos` (ADR-005): `REVOKE UPDATE, DELETE, TRUNCATE` también al dueño,
disparadores que bloquean `UPDATE` y `DELETE` activados con `ENABLE ALWAYS`, y
RLS forzada sin política de edición. De ahí sale el panel del
superadministrador: sesiones con su origen, patrullajes con su duración,
turnos asignados, extra y retirados, restablecimientos y rechazos.

## Consecuencias

- **Una consulta más por petición de portero** (la sesión con su turno, por
  clave primaria). Es el precio de cerrar a la hora exacta.
- **El portero sólo entra por la consola**: su sesión se registra en el inicio
  de sesión por usuario; la app móvil no tiene ese camino y el guard rechaza
  cualquier sesión no registrada.
- **MFA del portero**: hoy no lo exige RN-20 y puede accionar puertas en remoto.
  Queda como decisión del cliente (P-16) con dos opciones; mientras tanto cada
  inicio de sesión queda con su origen en la bitácora y en el panel.
- **Riesgo residual**: el código de patrullaje se deriva de una llave de la
  API. Quien tenga esa llave y los identificadores del turno puede calcularlo;
  quien tiene esa llave ya tiene la biometría, que es un activo mayor.
