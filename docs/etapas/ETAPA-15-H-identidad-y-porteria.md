# ETAPA 15-H · Bloque B, sesión 1: identidad por usuario y portería

**Rama:** `etapa-15h-identidad-y-porteria` · **Base:** `develop` (`80b8d5b`)
**Contrato:** extensión **E-02**, aprobada por el cliente el 2026-09-25 (`docs/auditoria/contradicciones-y-supuestos.md` §3 bis)
**Decisiones:** [`ADR-023`](../decisiones/ADR-023-cuentas-por-nombre-de-usuario.md) · [`ADR-024`](../decisiones/ADR-024-turnos-y-patrullaje-del-portero.md)

| Commit     | Qué trae                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `4768928`  | `docs(etapa-15h)`: extensión E-02, C-32 a C-34, S-48 a S-51, P-16 a P-18, ADR-023, ADR-024 y la migración `0037` con su reversión    |
| `5289efe`  | `feat(etapa-15h/api)`: módulos `cuentas` y `porteria`, guardas globales de cambio pendiente y de turno, bitácora compartida, pruebas |
| `2832cf4`  | `chore(etapa-15h/contratos)`: OpenAPI, cliente TypeScript y cliente Dart regenerados (nada escrito a mano)                           |
| `78f6a1b`  | `feat(etapa-15h/consola)`: acceso por usuario y NIT, cambio obligatorio, patrullaje, «Porteros» y «Mi perfil»                        |
| `d06415c`  | `docs(etapa-15h)`: este informe, ESTADO, README y ADR-023/024 alineados con lo construido                                            |
| `e7bff8f`  | `fix(etapa-15h/verificador)`: hallazgos de la primera corrida con base (SQL 80, `creado_por` NOT NULL, `expires_in`)                 |
| _(cierre)_ | `chore(etapa-15h)`: el veredicto literal del verificador                                                                             |

Esta ronda **no se fusiona**: abre PR contra `develop` y se detiene. **No
empieza la sesión 2 del Bloque B** (residentes). **La ETAPA 15 sigue BLOQUEADA
(`BE-02`)**: nada de lo que aquí se construye toca hardware ni lo sustituye.

---

## 0 · Estado de cada requisito al empezar, y al cerrar

La columna «al empezar» es la que se entregó antes de escribir código, tras
buscar en el repositorio (el repositorio manda). «Al cerrar» dice con qué
prueba se demuestra.

| Requisito                                                         | Al empezar                                                             | Al cerrar                                                                                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| B1 · cuentas por nombre de usuario                                | **FALTANTE**                                                           | Hecho · `cuentas-y-porteria.e2e` (B1) y `-pg` (alta sin correo)                                                             |
| B1 · correo sintético `.invalid`, nunca expuesto                  | **FALTANTE**                                                           | Hecho · la suite revisa TODOS los cuerpos de respuesta; `-pg` cuenta 0 filas con correo sintético                           |
| B1 · límite de intentos por usuario y por IP                      | **INCOMPLETO** (sólo el global por IP; el acceso no pasaba por la API) | Hecho · 5/min por cuenta, 10/min por origen declarado, 30/min por dirección; prueba del 6.º intento → 429 rotando el origen |
| B1 · cuentas por correo siguen funcionando                        | EXISTENTE                                                              | Se conserva, por la MISMA puerta · e2e «una cuenta por correo, anterior a la 15-H, sigue entrando»                          |
| B1 · recuperación sin SMTP                                        | **INCOMPLETO** (sólo por correo, bloqueada por BE-01)                  | Por una persona: superadministrador → portero; administrador → residente · e2e de restablecimiento                          |
| Primer ingreso · cambio obligatorio en el servidor                | **FALTANTE**                                                           | Hecho · barrido de TODAS las rutas con el indicador → 403 salvo cambio y cierre; gancho real en `-pg` y SQL 80              |
| B3 · alta del portero por el superadministrador                   | **FALTANTE** (no había alta de usuarios en la API)                     | Hecho · e2e y `-pg`                                                                                                         |
| B3 · perfil de solo lectura                                       | **FALTANTE**                                                           | Hecho · sin ruta de edición propia; 403 en la de supervisión; disparador `tg_usuario_campos_propios` probado en SQL 80      |
| B3 · ver monitoreo, eventos, vistas en vivo                       | EXISTENTE                                                              | Probado de nuevo con un portero con sesión y turno reales                                                                   |
| B3 · accionar equipos (abrir)                                     | EXISTENTE (`/guardia/ordenes`)                                         | Probado · 201                                                                                                               |
| B3 · llamadas del videoportero por SSE                            | EXISTENTE                                                              | Probado · `text/event-stream` para el portero                                                                               |
| B3 · bloquear y desbloquear accesos                               | **INCOMPLETO** (sólo administración)                                   | Hecho (C-32) · 201 para el portero                                                                                          |
| B3 · bloquear y desbloquear zonas comunes                         | **INCOMPLETO** (sólo la configuración del administrador)               | Hecho (C-32) · ruta `…/zonas/:zonaId/apertura` con motivo                                                                   |
| B3 · NO crea, edita, configura ni da de baja equipos              | EXISTENTE sin prueba del portero                                       | Cinco pruebas negativas contra la API                                                                                       |
| B3 · NO toca la configuración de la copropiedad                   | EXISTENTE sin prueba del portero                                       | Prueba negativa contra la API                                                                                               |
| B3 · NO edita su perfil                                           | **FALTANTE** (la política RLS lo permitía por REST, ver H-15H-01)      | Prueba negativa contra la API y en SQL                                                                                      |
| Turnos impuestos en el servidor, con medianoche y reloj inyectado | **FALTANTE** (C-33: el claim no está acotado por turno)                | Hecho · antes, durante (pasada la medianoche), último milisegundo, minuto de fin y después; e2e y `-pg`                     |
| Turnos extra sólo el superadministrador                           | **FALTANTE**                                                           | Hecho · 403 para administrador y portero; 400 sin motivo                                                                    |
| Solapes permitidos y registrados                                  | **FALTANTE**                                                           | Hecho · e2e                                                                                                                 |
| Patrullaje · bloqueo en el servidor                               | **FALTANTE**                                                           | Hecho · 423 en toda acción, recarga incluida; código correcto, incorrecto, quinto intento; e2e y `-pg`                      |
| Acceso remoto con las mismas restricciones                        | EXISTENTE sin auditoría de origen                                      | Mismas guardas en cualquier origen; origen en la bitácora y en el panel                                                     |
| B4 · panel del superadministrador                                 | **FALTANTE**                                                           | Hecho · API con e2e y pantalla con prueba de componente                                                                     |
| B4 · bitácora de solo inserción como `eventos`                    | **FALTANTE**                                                           | Hecho · REVOKE al dueño, disparadores `ALWAYS`, RLS forzada; probado frente al dueño en SQL 80 y en `-pg`                   |

---

## 1 · Qué se construyó

El personal de portería **entra con su usuario y el NIT de la copropiedad**, no
con un correo: la API guarda la cuenta en Supabase con un correo que no puede
recibir nada —`<usuario>@<copropiedad>.usuarios.ncr.invalid`—, lo calcula sólo
cuando habla con el proveedor y no lo escribe en ninguna tabla, respuesta,
registro ni pantalla. Toda la consola —también las cuentas por correo— entra ya
por la API, porque es ahí donde viven el correo sintético, los tres límites de
intentos y el turno del portero.

Una cuenta nueva o restablecida **no puede hacer nada** hasta cambiar la
contraseña: el indicador viaja en el token desde el gancho de claims y una
guarda global responde 403 en toda ruta salvo el cambio y el cierre.

El portero **sólo opera dentro de su turno**. El turno es día y franja horaria en
la zona de la copropiedad —cruzando la medianoche si hace falta—; la base
calcula la franja y el dominio la calcula igual, con una prueba que exige que
coincidan. En cada petición del portero la API consulta su sesión registrada y
su turno con el reloj inyectado: al llegar la hora de fin la sesión se cierra en
esa misma petición. Al salir a patrullar pulsa «Patrullaje» y la sesión queda
**bloqueada en la base**: toda acción responde 423, recargar no cambia nada, y
vuelve con el código de 4 dígitos que la consola le mostraba arriba a la
derecha. El quinto código equivocado cierra la sesión del todo.

El **superadministrador** tiene «Porteros»: quién está de turno y con sesión
ahora, alta y datos (portería, torres, sectores o fincas), restablecimiento de
contraseña, un calendario semanal por día y hora para asignar, editar y retirar
turnos —los extra con motivo—, y la bitácora de solo inserción con ingresos y
salidas con su origen, patrullajes con su duración, turnos y restablecimientos.

---

## 2 · Cómo se organizó y por qué

### 2.1 · Dos módulos y una fontanería, porque son dos razones de cambio

`cuentas` sabe de identidades: cómo se entra, cómo se cambia y restablece una
contraseña, cómo se crea una cuenta por usuario. `porteria` sabe de turnos,
sesiones y patrullajes. Lo que los une es la **bitácora**, que escriben los dos
y lee el panel: vive en `comun/bitacora-de-identidad` como `auditoria_seguridad`
vive en `comun/auditoria`, con una sola instancia en memoria para la suite y una
sola tabla en la base.

### 2.2 · El gancho de sesión: cuentas no sabe qué es un turno

Portería depende de cuentas —crea las cuentas de sus porteros—, así que cuentas
no puede depender de portería. Cuentas publica un **registro de ganchos por
rol** y portería se inscribe al arrancar como el gancho del rol `portero`. El
inicio de sesión, tras comprobar la contraseña, pregunta al gancho; si niega,
revoca en Supabase la sesión que acababa de abrirse. **Falla cerrado**: si el
gancho del portero no estuviera inscrito, el portero no entra.

### 2.3 · El turno en cada petición, no en el token (C-33)

El claim `copropiedades` del gancho 0024 no está acotado por turno —el propio
comentario de la migración lo afirmaba y no era verdad—. Meter el turno en el
token no serviría: el token dura lo que diga el proveedor y el turno acaba a una
hora exacta. La guarda `GuardaDeTurnoDePorteria`, la última de las globales,
consulta en cada petición la sesión registrada (por el `session_id` del token,
estable entre refrescos) y el turno al que está atada. El relevo es por turno
propio: si al terminar la franja el mismo portero tiene otro turno vigente, la
sesión pasa a él con su código nuevo.

### 2.4 · El patrullaje es un bloqueo de pantalla, no un factor

El código no acredita a nadie: se muestra en la propia consola. Se **deriva**
por HMAC de turno y portero con una llave propia (HKDF de la maestra con su
propósito, S-48) y la sesión sólo guarda su hash scrypt. Lo que el patrullaje
garantiza está en la base —`estado = 'patrullaje'`— y en la guarda: sin el
código, nada de esa sesión se ejecuta.

### 2.5 · El NIT además del usuario (C-34)

Con unicidad por copropiedad, «sólo el usuario» es ambiguo. De las tres salidas
se eligió pedir también el NIT —público, único, normalizado— y recordarlo en el
equipo. La traducción sigue en el servidor.

### 2.6 · Identidades de base, dichas

La lectura de acceso ocurre antes de que exista un token, así que usa la
identidad de lectura de plataforma (el precedente de D5). Las escrituras de
portería usan los claims de **servicio de su copropiedad** con el actor real en
`usuario_id`. En los dos casos la barrera de permiso es la capa de aplicación
—roles por guarda, `exigirAlcance`—, y la suite prueba el aislamiento por los
dos caminos.

---

## 3 · Árbol de archivos (selección)

```
supabase/migrations/20260925140000_0037_identidad_por_usuario_y_porteria.sql  esquema, gancho, disparadores, RLS, aserciones
supabase/reversion/0037_revert.sql                                            reversión explícita con confirmación
supabase/policies/tests/80_identidad_y_porteria.sql                           negativa por política, gancho, franja, bitácora frente al dueño
supabase/seed/seed.sql                                                        perfil de portería del portero de demostración
apps/api/src/cuentas/dominio/                                                 nombre de usuario, NIT, correo sintético, política de contraseña
apps/api/src/cuentas/aplicacion/                                              iniciar sesión, cambiar, restablecer, cerrar, crear cuenta, ganchos
apps/api/src/cuentas/infraestructura/                                         Supabase Auth, lector de token, repositorios PG y memoria
apps/api/src/cuentas/presentacion/                                            /auth/acceso, /auth/contrasena, /auth/cierre, restablecimiento, límites
apps/api/src/porteria/dominio/                                                franja del turno y máquina de estados de la sesión
apps/api/src/porteria/aplicacion/                                             control de sesiones (gancho y guarda), patrullaje, porteros, turnos, panel
apps/api/src/porteria/infraestructura/                                        código de patrullaje, repositorios PG y memoria, zona horaria
apps/api/src/porteria/presentacion/                                           consola del portero, panel del superadministrador, guarda de turno
apps/api/src/comun/bitacora-de-identidad/                                     bitácora compartida: puerto, PG, memoria, módulo global
apps/api/src/comun/guardas/cambio-de-contrasena.guard.ts                      403 con el cambio pendiente
apps/api/src/zonas/presentacion/                                              ruta de apertura y cierre con motivo (C-32)
apps/api/src/guardia/aplicacion/bloqueo-de-acceso.ts                          el portero bloquea (C-32)
apps/api/test/cuentas-y-porteria.e2e.test.ts                                  la cadena por HTTP, con reloj inyectado
apps/api/test/cuentas-y-porteria-pg.test.ts                                   la misma cadena contra base real y el gancho de la base
apps/api/test/dobles/                                                         proveedor de identidad falso y sesión de la suite
apps/web/src/lib/sesion/acceso-por-api.ts · porteria.ts                       acceso por la API, claims visibles, estado del portero
apps/web/src/app/api/sesion/contrasena/route.ts                              cambio obligatorio y renovación de sesión
apps/web/src/app/acceso/                                                      usuario y NIT, cambio obligatorio, avisos
apps/web/src/componentes/bloqueo-de-patrullaje.tsx · cabecera.tsx             pantalla de patrullaje, código y botón
apps/web/src/app/(consola)/porteros/ · mi-perfil/                             panel del superadministrador y perfil del portero
```

---

## 4 · Tabla SOLID

| Principio | Cómo se cumple                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SRP**   | Un caso de uso por operación (`IniciarSesion`, `CambiarContrasena`, `RestablecerContrasena`, `CerrarSesion`, `CrearCuentaPorUsuario`); control de sesión, patrullaje, porteros, turnos y panel separados |
| **OCP**   | El turno del portero entra como **gancho** del rol, sin tocar el inicio de sesión; otro rol con restricciones propias se inscribe igual                                                                  |
| **LSP**   | Repositorios PG y en memoria intercambiables: la misma cadena pasa en `e2e` (memoria) y en `-pg` (base)                                                                                                  |
| **ISP**   | `ProveedorDeIdentidad` (entrar, salir) separado de `AdministradorDeCuentas` (alta, contraseña, baja); perfiles, turnos y sesiones en puertos distintos                                                   |
| **DIP**   | Dominio sin I/O ni framework; los casos de uso dependen de puertos; Nest inyecta por token; la guarda depende del caso de uso, no de un repositorio                                                      |

---

## 5 · Trazabilidad

| Referencia                                         | Cómo queda cubierta                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **RN-03 · CA-23 · ADR-005**                        | La bitácora de portería rechaza UPDATE y DELETE también al dueño; probado en SQL 80 y en `-pg`                        |
| **RN-08**                                          | Bloqueo de acceso y apertura de zona por el portero, siempre con motivo                                               |
| **RN-15 · CA-24 · KPI-36/37**                      | Toda ruta nueva recorre las suites de aislamiento; RLS forzada con negativa por política; camino de servicio en `-pg` |
| **RN-19**                                          | Sin borrado físico en las cuatro tablas nuevas; los turnos se retiran por baja lógica                                 |
| **RN-20 · CA-25**                                  | Sin cambios para los roles administrativos; el cambio de contraseña con `aal1` sólo con el indicador encendido        |
| **KPI-38**                                         | Accesos cruzados siguen yendo a `auditoria_seguridad`; los hechos de portería, a su bitácora append-only              |
| **§2.7.4 · §2.7.5**                                | Usuario saneado y acotado; tres límites en el acceso, 5/min en el cambio y 10/min en el desbloqueo                    |
| **E-02 · C-32 a C-34 · S-48 a S-51 · P-16 a P-18** | Registrados en `contradicciones-y-supuestos.md`                                                                       |

---

## 6 · Pruebas

| Suite                                                                                                       | Qué demuestra                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/cuentas/dominio/dominio.test.ts`                                                              | Normalización y formato del usuario, NIT, correo sintético bajo `.invalid`, política de contraseña del servidor                                                                                                                                                                                                                                                    |
| `apps/api/src/porteria/dominio/dominio.test.ts`                                                             | Franja en Bogotá y con cambio de horario, medianoche, semiabierta, solapes; máquina de estados y quinto intento                                                                                                                                                                                                                                                    |
| `apps/api/test/cuentas-y-porteria.e2e.test.ts`                                                              | Alta, duplicado, formato; cuenta por correo; respuesta idéntica ante NIT, usuario o contraseña malos; 429 al 6.º intento; primer ingreso en todas las rutas; turnos antes, durante, al final y después; extra; solapes; relevo; retiro; patrullaje con 423, recarga, código bueno y malo, quinto intento; cada «no puede» y cada «puede»; restablecimientos; panel |
| `apps/api/test/cuentas-y-porteria-pg.test.ts`                                                               | Lo mismo contra la base: cuenta sin correo; franja de la base igual a la del dominio; el gancho de la base emite y retira el indicador; código sólo en hash; patrullaje en la base; RLS por el camino de servicio; cierre con motivo; bitácora frente al dueño                                                                                                     |
| `supabase/policies/tests/80_identidad_y_porteria.sql`                                                       | Una negativa por política nueva; gancho; unicidad por copropiedad sin mayúsculas; disparador de campos propios; bitácora sin edición ni para el dueño; sesión cerrada que no se reabre                                                                                                                                                                             |
| Aislamiento, escrituras y MFA (`aislamiento*.e2e`, `escrituras-superadministrador.e2e`, `mfa-retirado.e2e`) | Las rutas nuevas entran en los barridos; las exenciones se escriben a mano y se comparan con el código                                                                                                                                                                                                                                                             |
| Consola (`acceso-por-usuario`, `bloqueo-de-patrullaje`, `porteros/pantalla`, `mfa-obligatorio`)             | Usuario y NIT; cambio obligatorio; pantalla de patrullaje; panel; la consola entra por la API                                                                                                                                                                                                                                                                      |

**Cómo ejecutarlas:** `pnpm test` (sin base) y `DATABASE_URL_PRUEBAS=… ./scripts/verificar-etapa.sh --con-base` (con base).

### El veredicto literal de `./scripts/verificar-etapa.sh --con-base`

Dos corridas; la segunda vale. La primera destapó tres defectos que las
comprobaciones dirigidas no veían, porque las tres dependen de cómo se monta el
entorno completo:

| Corrida | Sobre     | Resultado                                                                                                                                                                                                                                                                                                                   |
| ------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `d06415c` | **FALLIDA** · paso 12: la prueba SQL 80 escribía sus datos sin claims, y en `--modo-supabase` la conexión es el dueño NO superusuario con la RLS forzada · paso 12b: `bitacora_de_porteria.creado_por` admitía nulos · paso 12c: el adaptador exigía `expires_at` y el proveedor puede mandar sólo `expires_in` (`e7bff8f`) |
| 2       | `e7bff8f` | **correcta** · 26 de 26 pasos, sin una sola ✗                                                                                                                                                                                                                                                                               |

Veredicto literal de la segunda corrida (`./scripts/verificar-etapa.sh --con-base`, base efímera migrada hasta la 0037 con semillas, Flutter en el PATH, Chromium del entorno; se omiten los pasos 0 a 4, 5b, 5d, 5e, 8, 10, 10b y 11, todos en ✓, y el detalle de las cinco saltadas declaradas):

```
▸ 5 · suite completa
   @ncr/config:test:       Tests  144 passed (144)
   @ncr/edge:test:       Tests  101 passed (101)
   @ncr/domain-core:test:       Tests  402 passed (402)
   @ncr/providers:test:       Tests  629 passed (629)
   @ncr/web:test:       Tests  474 passed (474)
   @ncr/api:test:       Tests  1215 passed | 5 skipped (1220)
   ⚠ suite sin rojas · las saltadas están DECLARADAS y se ejercen en otro paso
       las 5 están DECLARADAS y se ejercen en otro paso (arranque-en-frio.e2e, paso 12b)
▸ 5c · app móvil: suite de Dart y cobertura POR CAPA
   00:14 +163: All tests passed!
   ✓ dominio           95.87 % (umbral 90 %, 116/121 líneas)
   ✓ aplicacion        95.03 % (umbral 90 %, 153/161 líneas)
   ✓ configuracion    100.00 % (umbral 70 %, 33/33 líneas)
   ✓ infraestructura   84.47 % (umbral 60 %, 261/309 líneas)
   ✓ presentacion      83.46 % (umbral 50 %, 1075/1288 líneas)
   ✓ resto             31.43 % (umbral 0 %, 11/35 líneas)
   ✓ global            84.69 % (umbral 70 %, sin contar lo generado)
   – 416 líneas generadas, excluidas del cómputo a propósito
   ✓ cobertura de la app dentro de los umbrales por capa
   ✓ la suite de Dart da lo mismo en otro huso (Pacific/Auckland): ninguna prueba depende del reloj del sistema
▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 230 de 230 ficheros de prueba ejecutados
▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 95.67 % · ramas 96.70 % · funciones 95.92 % (umbral 90 %, 34 archivos)
     OK   aplicacion (**/aplicacion/**): lineas 95.55 % · ramas 87.67 % · funciones 98.38 % (umbral 90 %, 67 archivos)
     OK   global: lineas 81.29 % · ramas 84.38 % · funciones 82.07 % (umbral 70 %, 502 archivos)
   ✓ las tres capas cumplen su umbral
▸ 7b · los dos recuentos de la MISMA suite coinciden (D-112)
   ✓ recuentos: 6 paquete(s) con el mismo resultado por los dos caminos (turbo y vitest directo) · 2970 pruebas
▸ 9 · pruebas negativas de los propios controles
   ✓ entorno declarado: 53 variables de 2 esquemas, todas en su .env.example · 21 leídas fuera de Zod, con motivo
   ✓ declaraciones: 1 paso(s) declarado(s) no ejercido(s), 0 de ellos en linux, con motivo y etapa de revisión vigente
   ✓ controles: 35 de 37 con prueba negativa · 2 en deuda declarada (no puede crecer)
   ✓ PRUEBAS NEGATIVAS: los 28 controles detectan su violación y aceptan el caso legítimo, sin tocar el árbol
   ✓ ramas: 36 controles medidos · 234 bloques sin ejercer (no puede subir)
▸ 12 · esquema y aislamiento en --modo-supabase (requiere --con-base)
   ✓ migraciones, semillas y suite SQL
▸ 12b · arranque en frío: base vacía → migraciones → superadministrador (requiere --con-base)
   ✓ una base recién migrada llega a un superadministrador con claims válidos
   ✓ y esa sesión ENTRA: la API la acepta con aal2 y la rechaza con aal1
▸ 12c · el camino del NAVEGADOR: contraseña → factor → QR → aal2 → tablero
   ✓ el camino completo se recorre en el navegador
▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base (requiere --con-base)
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)
   ✓ 50 ingresos simultáneos sobre 10 plazas, ni una de más (RN-14, CA-14)
   ✓ una hoja sin un solo UUID crea viviendas, personas y sus vínculos (D-72, RN-06)
   ✓ el superadministrador escribe el padrón en la copropiedad del selector (D-71)
   ✓ las 12 en una sentencia, el mismo número en tres agrupaciones, y una colisión revierte las 12
▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
   ✓ OK estabilidad: 3 corridas forzadas (sin caché de turbo) con resultado idéntico y ningún error sin manejar
▸ 15 · ningún paso declarado se quedó sin ejecutar
   ✓ OK 26 de 26 pasos ejecutados

VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

Las 5 pruebas saltadas de `@ncr/api` en el paso 5 son las del arranque en frío,
que necesitan los claims que escribe el paso 12b; ese paso las ejecuta y exige
que no se salten. En el paso 14, sin caché, las 1220 corren y pasan.

---

## 7 · Verificación de seguridad (§2.7)

| Medida                       | Estado en esta ronda                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos                 | Ninguna variable nueva; el código de patrullaje usa una llave derivada de la maestra existente (S-48). Escáner limpio                                    |
| 2 · CORS                     | Sin cambios                                                                                                                                              |
| 3 · Validación en el backend | DTO con cota por campo; el usuario lo valida el objeto de valor y la base con `CHECK`; la contraseña, la política del servidor                           |
| 4 · Inyección SQL            | Todo parametrizado; la única consulta con columnas variables las toma de una lista fija                                                                  |
| 5 · Límites                  | Acceso: por cuenta, por origen declarado y por dirección; tiempo mínimo uniforme en los fallos; cambio 5/min; desbloqueo 10/min; restablecimiento 10/min |
| 6 · RLS                      | Habilitada y FORZADA en las cuatro tablas nuevas, con negativa por política; el camino de servicio filtra además por copropiedad en la aplicación        |
| 7 · CSP                      | Sin estilos en línea (el calendario usa clases fijas); control `frontera-csp` en verde                                                                   |
| 8 · Transversales            | Ningún correo sintético ni contraseña en respuestas, registros ni pantallas; la bitácora es append-only frente a todos, dueño incluido                   |

**Hallazgos de la ronda:**

- **H-15H-01 · una cuenta podía editarse a sí misma por la REST de Supabase.**
  La política `usuarios_edicion` (0014) admite `id = app.usuario_id()`, y la
  tabla se publica con la llave publicable: cualquier cuenta podía cambiarse
  `persona_id`, `copropiedad_id` o `estado`, y desde esta ronda podría haberse
  bajado el indicador de cambio obligatorio. **Corregido en la 0037** con
  `tg_usuario_campos_propios` (el portero no edita nada; el resto no toca su
  identidad ni su estado) y probado en SQL 80.
- **H-15H-02 · el acceso de la consola no pasaba por la API.** Con el turno y los
  límites por cuenta en el servidor, una puerta directa a Supabase los habría
  esquivado. **Corregido**: correo y usuario entran por `POST /auth/acceso`.

---

## 8 · Deuda técnica, supuestos y pendientes

**Decisiones pendientes del cliente (no tomadas):**

- **P-16 · MFA del portero.** Opción A: siempre. Opción B: sólo desde fuera de la
  red de la portería. Mientras tanto, cada ingreso queda con su origen en la
  bitácora y en el panel.
- **P-17 · alcance de los sectores.** Mientras tanto son **informativos**: ocultar
  alarmas a un portero de guardia es un riesgo de seguridad física.
- **P-18 · recuperación sin SMTP.** Mientras tanto la hace una persona
  (superadministrador o administrador) con temporal escrita y cambio obligatorio.

**Supuestos:** S-48 (llave del código de patrullaje), S-49 (el quinto fallo
cierra), S-50 (cifras de los límites), S-51 (temporal escrita por quien
restablece).

**Deuda declarada:**

- **DT-15H-01** · la apertura o cierre manual de una zona deja el actor en la
  fila y el motivo en el registro estructurado, sin tabla de historial propia
  (va con D-140 a la ETAPA 16).
- **DT-15H-02** · no hay baja de portero desde el panel. Retirar sus turnos le
  impide entrar; la baja de la cuenta queda para la sesión 2 del Bloque B.
- **DT-15H-03** · el nombre del superadministrador no se resuelve en la bitácora
  (no pertenece a la copropiedad): aparece como «Superadministrador».
- **Riesgo residual** · tras un restablecimiento, una cuenta que NO es de portero
  conserva su token hasta 5 minutos; al refrescar, el indicador la deja sin
  nada salvo el cambio. El portero se cierra en el acto.
- **Riesgo residual** · el origen declarado lo pone la consola; quien llame a la
  API directamente puede declarar otro. Sólo sirve para el límite por origen y
  como dato informativo: el límite por cuenta no depende de él.

---

## 9 · Qué debe hacer el usuario manualmente

1. Aplicar la migración `0037` en Supabase (`supabase db push`) y comprobar que
   sus aserciones finales pasan.
2. Confirmar en **Authentication → Hooks** que el gancho
   `custom_access_token_hook` sigue activo: la 0037 lo recrea con el mismo nombre.
3. En **Authentication → Sign In / Providers**, dejar **desactivado el alta
   pública** («Allow new users to sign up»): nadie debe poder registrar a mano un
   correo bajo `usuarios.ncr.invalid`.
4. Alinear la política de contraseñas del panel con la del servidor: mínimo 8,
   con minúsculas, mayúsculas, dígitos y símbolos.
5. Entrar como superadministrador en **Porteros**, dar de alta a cada portero
   (usuario y contraseña inicial), asignarle un turno y entregarle en persona el
   usuario, el NIT y la contraseña inicial. El portero de demostración ya tiene
   perfil; le falta el turno.
6. Decidir **P-16**, **P-17** y **P-18**.

---

## 10 · Rama y commits

Rama `etapa-15h-identidad-y-porteria`, base `develop` (`80b8d5b`). Commits en la
tabla del encabezado. PR contra `develop`, **sin fusionar**.
