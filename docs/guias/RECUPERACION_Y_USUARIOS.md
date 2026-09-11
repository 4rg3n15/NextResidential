# Recuperación de contraseña y aprovisionamiento de usuarios

**Etapa:** 09-A · **Depende de:** migraciones `0023` y `0024` aplicadas · **ADR:** [ADR-008](../decisiones/ADR-008-supabase-auth-como-mecanismo-autoritativo-de-mfa.md)

Esta guía tiene dos partes independientes. La **A** configura la recuperación de contraseña; la **B** crea el primer superadministrador y los demás roles. Las dos se ejecutan **una vez por proyecto** y las dos exigen acceso al panel de Supabase.

> **Ningún paso de esta guía le pide que escriba una credencial en el repositorio.** Los guiones leen lo que necesitan del entorno y se detienen si falta. Si en algún momento le parece que hace falta guardar una contraseña o una llave en un fichero versionado, es que algo está mal explicado: pregunte antes de hacerlo.

---

## Antes de nada · aplicar las migraciones nuevas

```bash
supabase db push          # aplica 0023, 0024 y 0025
```

- **0023** añade `restablecimiento_contrasena` al enumerado de eventos de seguridad. Sin ella, el registro de auditoría del restablecimiento falla al escribir.
- **0025** crea el **actor de sistema** y las funciones de arranque. Sin ella no se puede crear la primera copropiedad ni el primer usuario: ver la explicación del ciclo en la parte B.
- **0024** crea el **Auth Hook de _custom claims_**. Sin ella **nadie puede entrar a la consola**: el token no lleva `rol` ni `copropiedad_id`, `app.copropiedad_id()` devuelve `NULL`, ninguna política RLS concede acceso y el guard de la API rechaza. El sistema falla cerrado, que es correcto, y también completamente inutilizable.

Las dos traen aserciones: si algo no quedó aplicado, `db push` falla en vez de dejarlo a medias.

---

# A · Recuperación de contraseña

El flujo ya está construido en la consola (`/acceso/recuperacion` y `/acceso/nueva-contrasena`). Lo que falta es configurar el proveedor de correo y la plantilla.

### A.1 · Remitente

1. Panel de Supabase → **Project Settings → Authentication → SMTP Settings**.
2. Active **Enable Custom SMTP**. El SMTP integrado de Supabase tiene un límite muy bajo —del orden de unos pocos correos por hora— y **no sirve para producción**: con él, el tercer residente que recupere su contraseña ese día no recibe nada.
3. Rellene el servidor de correo corporativo de Grupo Control. Los campos son: _Host_, _Port_, _Username_, _Password_, _Sender email_ y _Sender name_.
   - **_Sender email_ debe estar en un dominio de Grupo Control** con SPF y DKIM configurados. Un remitente sin autenticar acaba en la carpeta de correo no deseado, y el usuario concluye que la recuperación está rota.
   - Sugerencia de _Sender name_: `Next Control Residencial`.
4. La contraseña del SMTP se escribe **solo en ese formulario del panel**. No va al repositorio ni a ningún `.env` de la aplicación: la consola nunca envía correo, lo envía Supabase.

### A.2 · URL de redirección

1. Panel → **Authentication → URL Configuration**.
2. En **Site URL**, la de la consola. En desarrollo: `http://localhost:3100`.
3. En **Redirect URLs**, añada **exactamente** estas dos entradas:

   ```
   http://localhost:3100/acceso/nueva-contrasena
   https://<dominio-de-la-consola>/acceso/nueva-contrasena
   ```

   Supabase rechaza cualquier `redirectTo` que no esté en esa lista. Es una lista blanca y conviene que siga siéndolo: un comodín permitiría que un enlace de recuperación llevara a un sitio ajeno con el token dentro.

### A.3 · Plantilla del correo — **el paso que hay que hacer con cuidado**

1. Panel → **Authentication → Email Templates → Reset Password**.
2. Sustituya el enlace de la plantilla por este, respetando los parámetros:

   ```html
   <a href="{{ .SiteURL }}/acceso/nueva-contrasena?token_hash={{ .TokenHash }}&type=recovery">
     Establecer una contraseña nueva
   </a>
   ```

3. **Por qué así y no con `{{ .ConfirmationURL }}`.** El enlace por defecto devuelve el token en el **fragmento** de la URL (`#access_token=…`). El fragmento **nunca se envía al servidor**: se queda en el navegador, y la consola tendría que manipularlo en JavaScript — exactamente lo que el patrón BFF de esta etapa evita, porque un token que pasa por JavaScript es un token que un XSS puede leer. Con `token_hash` como parámetro de consulta, el canje ocurre en el servidor y la sesión va directa a una cookie `httpOnly`.
4. Escriba el cuerpo en español y sin prometer nada que el sistema no cumpla. Dos frases que conviene incluir, porque describen el comportamiento real: **el enlace caduca** y **solo se puede usar una vez**.

### A.4 · Caducidad y política de contraseña

1. Panel → **Authentication → Providers → Email**: ponga **Email OTP Expiration** en `3600` (una hora). Es el plazo del enlace de recuperación.
2. Panel → **Authentication → Policies** → _Password Settings_, y déjelo **exactamente así**:

   - **Minimum password length:** `8`
   - **Password Requirements:** `Lowercase, uppercase letters, digits and symbols`

   Esos dos valores son la misma política que `apps/web/src/lib/politica-contrasena.ts`
   aplica en el cliente y en el servidor: mínimo 8, con mayúscula, minúscula,
   número y carácter especial.

   > **Por qué hay que alinearlos y no basta con el nuestro.** Supabase valida
   > por su cuenta al cambiar la contraseña. Si su umbral fuera distinto, el
   > usuario vería nuestra pantalla aceptando y la respuesta de Supabase
   > rechazando, con dos textos distintos y sin saber a cuál hacer caso. Es el
   > modo de fallo más desesperante posible: la interfaz le dice que está bien
   > y el sistema le dice que no.

   > **Nota de criterio.** La política anterior eran 12 caracteres sin reglas de
   > composición. La actual la fijó el cliente el 2026-09-11. Queda dicho que la
   > longitud aporta más entropía que la composición —ocho con símbolo son más
   > débiles que doce sin él— y que por eso el formulario sigue mostrando los
   > cinco requisitos en vivo en vez de dar por buena cualquiera que pase el
   > umbral.

### A.5 · Comprobación

1. En la consola, `/acceso` → «¿Olvidaste tu contraseña?».
2. Escriba un correo **que exista** y otro **que no**. Las dos respuestas deben ser **idénticas**: mismo texto, mismo tiempo. Si difieren, el formulario permite enumerar usuarios y hay que reportarlo.
3. Con el correo que existe, abra el enlace, fije una contraseña nueva y confirme que **al volver a abrir el mismo enlace ya no funciona**.
4. Compruebe que el restablecimiento quedó en `auditoria_seguridad`:

   ```sql
   SELECT ocurrido_en, tipo, usuario_id, ip
     FROM public.auditoria_seguridad
    WHERE tipo = 'restablecimiento_contrasena'
    ORDER BY ocurrido_en DESC
    LIMIT 5;
   ```

---

# B · Primer superadministrador, y los demás roles

> **Reescrito el 2026-09-09.** La versión anterior de esta parte daba por hecho que ya existía una copropiedad y que el guion podía escribir en `public.usuarios`. Ninguna de las dos cosas es cierta sobre una base recién migrada, y el despliegue real falló en las dos. Lo que sigue está **verificado por ejecución** contra una base vacía, y hay una prueba automatizada que lo recorre entero: `./supabase/arranque-en-frio.sh`.

### Por qué hacía falta arreglarlo — el ciclo de auditoría

El contrato exige `creado_por` y `actualizado_por` en toda tabla operativa (KPI-05), y ambas son `NOT NULL` y claves ajenas a `usuarios`:

```
copropiedades.creado_por  →  usuarios
usuarios.creado_por       →  usuarios      (a sí misma)
roles_usuario.creado_por  →  usuarios
```

Es un ciclo: sobre una base vacía no hay copropiedad, no hay usuario, y el primer usuario no puede existir porque su creador tendría que existir antes. La migración **0025** lo rompe con un **actor de sistema**: una fila de `usuarios` con identificador fijo cuyo `creado_por` se apunta a sí misma. **No se ha relajado ninguna restricción** — las columnas siguen siendo `NOT NULL`, y las filas de arranque quedan atribuidas a ese actor, que es trazable.

Hay una segunda razón por la que el guion antiguo no podía funcionar: `tg_usuario_tenant` es un disparador de restricción `DEFERRABLE INITIALLY DEFERRED`, o sea que se comprueba **al commit**. El usuario y su rol tienen que escribirse en la misma transacción, y cada petición REST es una transacción distinta. Por eso la escritura vive en funciones SQL versionadas y los guiones solo las llaman.

### B.1 · Crear la identidad — lo hace usted, en el panel

1. Panel → **Authentication → Users → Add user**.
2. Marque **Auto Confirm User** (no habrá nadie para confirmar el primer correo).
3. Escriba el correo corporativo y **una contraseña que elija usted**. No la comparta por chat ni la escriba en ningún fichero del proyecto; lo natural es que el titular la cambie en su primer acceso con el flujo de la parte A.

### B.2 · Exportar las credenciales, solo en su terminal

```bash
export SUPABASE_URL='https://<referencia>.supabase.co'
export SUPABASE_SECRET_KEY='sb_secret_...'      # llave SECRETA; omite la RLS
```

Al terminar todo, `unset SUPABASE_SECRET_KEY`: es la credencial más sensible del proyecto.

### B.3 · La primera copropiedad

Sobre una base recién migrada **no hay ninguna**, y ese fue el primer fallo del despliegue: no había ningún identificador que pasarle al guion.

```bash
node scripts/registrar-copropiedad.mjs \
  --nombre 'Urbanizacion Mira' \
  --nit '900123456' \
  --zona-horaria 'America/Bogota'
```

Imprime el `id` que necesita el paso siguiente. Es **idempotente por NIT**: repetirlo no crea una segunda.

> La zona horaria no es decorativa: es la que decide qué significa «hoy» en el tablero (`ventanaDelDia`). Con la del servidor, un conjunto en Colombia perdería las cinco últimas horas de cada día.

### B.4 · El superadministrador

```bash
node scripts/aprovisionar-rol.mjs \
  --correo 'admin@grupocontrol.co' \
  --rol superadministrador \
  --copropiedad '<id-del-paso-anterior>' \
  --nombre 'Nombre Apellido'
```

El guion **valida antes de escribir**: si el UUID no existe, se detiene y le enseña las copropiedades activas que sí hay; si no existe la identidad en Supabase Auth, le dice que la cree usted. No crea usuarios, no genera contraseñas y no inscribe segundos factores.

`--copropiedad` es obligatoria también para el superadministrador, porque `roles_usuario.copropiedad_id` es `NOT NULL`. **No lo ata a ella**: su `usuarios.copropiedad_id` queda nulo y su alcance real lo resuelve `app.es_superadmin()`.

### B.5 · Activar el gancho de claims — **si esto falta, no entra nadie**

1. Panel → **Authentication → Hooks**.
2. **Customize Access Token (JWT) Claims** → _Enable_.
3. Elija **Postgres** y la función `public.custom_access_token_hook` (migración 0024).
4. Guarde.

Comprobación: inicie sesión en la consola. No verá el token en las cookies —es `httpOnly`, y así debe ser—; la comprobación real es que `/tablero` carga en vez de redirigir a `/acceso`. Si redirige, el token no lleva `rol`.

### B.6 · Inscribir el segundo factor — lo hace el titular, desde la consola

Los tres roles administrativos **no entran sin `aal2`** (RN-20, CA-25). Lo exige el guard de la API, así que sin este paso el usuario se autentica y no puede hacer nada.

> **Corrección (2026-09-10).** Esta guía afirmaba que «la inscripción de TOTP funciona con la sesión `aal1` del propio titular». Es cierto **solo para el primer factor**: en cuanto hay uno verificado, Supabase exige `aal2` para añadir otro y responde `403 insufficient_aal`. La consola ya lo detecta y lleva a **verificar** en vez de a inscribir. Si necesita empezar de cero, en el panel → **Authentication → Users → Remove MFA factors**, y vuelva al paso 2.

**El panel de Supabase no sirve para esto**, y no es un descuido suyo: en `Authentication → Users` solo ofrece _Remove MFA factors_, y `Account → Security` es su propia cuenta de Supabase, no la del usuario de la aplicación. Un factor que otra persona inscribe no es un segundo factor —el secreto habría pasado por sus manos—, así que la plataforma no lo permite y hace bien.

1. Panel → **Authentication → Providers → Multi-Factor Authentication**: active **TOTP**. Una vez por proyecto.
2. Entre a la consola en `/acceso` con su correo y contraseña.
3. La consola detecta que no tiene ningún factor verificado y **muestra la pantalla de inscripción**: código QR, la clave en texto para quien no puede escanear, y el campo del código de verificación.
4. Escanee con su aplicación de autenticación, escriba el código de seis dígitos y confirme.
5. La consola le entrega **diez códigos de recuperación, una sola vez**. Guárdelos: son la única vía si pierde el teléfono. No dan acceso —sirven para retirar el factor perdido y configurar otro—; cada uno funciona una vez.
6. Entra a la consola con la sesión ya elevada a `aal2`.

Nadie inscribe el factor de otra persona: la petición de alta no lleva ningún identificador de usuario, y el servidor toma la identidad de la cookie `httpOnly`. No es una comprobación que se pueda olvidar; es que no existe el dato con el que equivocarse.

#### Si prefiere hacerlo por API

Existe, y es la vía de Supabase Auth directamente. La consola hace exactamente estas tres llamadas. Sirve para desbloquearse sin depender del navegador:

```bash
# 1 · Contraseña → token aal1
TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | jq -r .access_token)

# 2 · Alta del factor: devuelve el `id`, el QR y el secreto
curl -s "$SUPABASE_URL/auth/v1/factors" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"factor_type":"totp","friendly_name":"Next Control Residencial"}'

# 3 · Desafío y verificación con el código de la aplicación de autenticación
curl -s "$SUPABASE_URL/auth/v1/factors/<factor-id>/challenge" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $TOKEN" -X POST
curl -s "$SUPABASE_URL/auth/v1/factors/<factor-id>/verify" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"challenge_id":"<challenge-id>","code":"123456"}'
```

La respuesta del paso 3 trae ya un token con `aal2`. La llave que aparece aquí es la **publicable**: no hay ninguna secreta en este camino, y no debe haberla — es el titular autenticándose, no un administrador actuando por él.

> **Si la pantalla no muestra el QR.** Pulse «Volver a intentarlo»: la inscripción se rehace entera y descarta la anterior. Si vuelve a fallar, el registro del servidor de la consola nombra ya la causa —`estadoDelProveedor` y `codigoDelProveedor`— en vez de un `503` a secas.

> **`SUPABASE_SECRET_KEY` y este paso.** La inscripción **no** la necesita: viaja con el token del titular y la llave publicable. La necesita solo el canje de un código de recuperación, porque retirar un factor es una operación de administración. La API ya la exige para arrancar desde la ETAPA 03, así que si no está definida el problema aparece antes, al levantar el servicio.

> **P-14, redefinido y cerrado.** Se declaró como «no hay pantalla de inscripción en la consola» y se resolvió diciendo que era una operación del panel. **No lo era**: el panel no inscribe factores, así que el pendiente no describía una comodidad ausente sino un sistema inaccesible. La pantalla existe desde esta versión y el pendiente queda cerrado.

### B.6.bis · El interruptor del segundo factor, RETIRADO

> **Ya no existe.** Esta sección explicaba cómo poner `MFA_OBLIGATORIO=false` para entrar solo con contraseña. La variable se retiró del código el **2026-09-10**, entera: no queda ni con valor por defecto.

**Por qué se puso y por qué se fue.** Se introdujo para desbloquearle mientras se cerraba el camino del segundo factor. El bloqueo era **otro**: la URL del JWKS estaba mal (`/auth/v1/jwks`, que devuelve 404), la API no obtenía ninguna clave pública y rechazaba **todos** los tokens. Corregida la URL, el ciclo completo funciona —inscripción desde cero, QR, códigos de recuperación, sesión `aal2`, tablero— y el interruptor dejó de tener motivo.

**Si la tiene puesta en su `.env`, quítela.** No hace nada: la configuración ya no la conoce. Pero `pnpm entorno:diff` se la señalará como variable que no está en el `.example`, y conviene que su fichero no acumule líneas muertas.

**Si alguien la reintroduce, tres controles la cazan**: la suite de la API, la de la consola y el paso 5 del camino del navegador levantan los procesos **con** la variable puesta y exigen que el segundo factor se siga pidiendo.

### B.6.ter · «Meto el código de seis dígitos y vuelvo al login»

Dos hechos distintos, y solo uno es un defecto:

1. **No sale el QR y le piden el código directamente.** Es lo correcto: esa cuenta **ya tiene un factor TOTP verificado**, así que toca _verificar_, no _inscribir_. Para volver a ver el QR, retire el factor: panel → **Authentication → Users** → su usuario → **Remove MFA factors**.
2. **El código correcto le devuelve al login.** Eso es que la API rechaza el token nuevo. La consola ya no se lo calla: en su registro aparece

   ```
   la API rechazó la sesión: la consola volverá al acceso
     estado: 401   claims: aal,aud,email,exp,iat,sub
   ```

   Los **nombres** de los claims son el diagnóstico —nunca sus valores, nunca el token—. Si en esa lista **no aparece `rol`**, el gancho de claims no está activo: vuelva a **B.5**. Es, con diferencia, la causa más frecuente. Si `rol` está y el estado sigue siendo 401, mire la bitácora de la API: dirá `SEGUNDO_FACTOR_REQUERIDO` (nivel `aal1`) o `FIRMA_INVALIDA` (JWKS mal apuntado).

### B.7 · Las tres cuentas de prueba del bloque 2 · ETAPA 09-B

Lo que sigue es el procedimiento exacto para las tres cuentas con las que
recorrer el sistema. **Usted crea las identidades y las contraseñas en el panel;
los guiones solo les dan rol.** Ni aquí ni en el repositorio hay credenciales.

#### Paso 1 · Crear las identidades — en el panel, usted

Panel → **Authentication → Users → Add user → Create new user**. Marque
**Auto Confirm User** para no depender del correo, que todavía no hay SMTP.

| Cuenta             | Correo             | Contraseña                     |
| ------------------ | ------------------ | ------------------------------ |
| Superadministrador | el suyo, ya existe | la que ya tiene                |
| Portero            | el que decida      | la que decida, cumpliendo §A.4 |
| Residente          | el que decida      | la que decida, cumpliendo §A.4 |

Recuerde la política: **mínimo 8, con mayúscula, minúscula, número y carácter
especial** — la misma que valida la consola y la que el panel debe tener
configurada (§A.4). Si el panel rechaza una contraseña que la consola aceptaría,
los dos valores no están alineados.

#### Paso 2 · Averiguar el identificador de la copropiedad

```bash
node scripts/listar-copropiedades.mjs
```

Imprime las activas con su nombre y su `id`. Si no hay ninguna, cree la primera
con §B.3.

#### Paso 3 · Dar rol a cada identidad

```bash
# Portero. Sin segundo factor obligatorio: entra con aal1 y le basta.
node scripts/aprovisionar-rol.mjs --correo '<correo-del-portero>' --rol portero \
  --copropiedad '<uuid>' --nombre 'Portería Principal'

# Residente. No tiene consola web todavía: su superficie es la app de la ETAPA 11.
node scripts/aprovisionar-rol.mjs --correo '<correo-del-residente>' --rol residente \
  --copropiedad '<uuid>' --nombre 'Residente de prueba'
```

El guion **valida antes de escribir**: si la identidad no existe en Supabase
Auth, se detiene y le dice que la cree usted; si el UUID de copropiedad no
existe, le enseña las que sí. No crea usuarios, no genera contraseñas y no
inscribe segundos factores.

#### Paso 4 · Comprobar que quedó bien

Entre con cada cuenta y confirme, exactamente, esto:

| Cuenta             | Qué debe pasar                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Superadministrador | Pide segundo factor · selector con **todas** las copropiedades · alcanza las nueve pantallas         |
| Portero            | **No** pide segundo factor · entra · el menú le muestra solo lo suyo, sin Viviendas ni Configuración |
| Residente          | **No** pide segundo factor · aterriza en `/sin-consola`, que le explica que su app llega en la 11    |

Si el portero viera Viviendas o Configuración en el menú, la tabla de
navegación y el guard de la API habrían discrepado — dígamelo, porque eso es un
defecto y no una configuración.

#### Paso 5 · Verificar el aislamiento, sin fiarse de la interfaz

La interfaz oculta; no protege. El aislamiento real se comprueba contra la API:

```bash
# Con la sesión del PORTERO abierta en el navegador, en la consola del navegador:
await fetch('/api/ncr/copropiedades').then((r) => r.json())
```

**Salida esperada:** un objeto con **una sola** copropiedad —la suya— y
`alcanceGlobal: false`. Si trajera dos, es una fuga y hay que pararlo todo.

```bash
# Y pidiendo explícitamente la ajena, con su UUID:
await fetch('/api/ncr/copropiedades/<uuid-de-la-otra>').then((r) => r.status)
```

**Salida esperada: `404`.** No 403: un 403 confirmaría que el identificador
existe, y contando respuestas se podría enumerar lo ajeno.

Con la sesión del **residente**, lo mismo, y además:

```bash
await fetch('/api/ncr/copropiedades/<la-suya>/padron/viviendas').then((r) => r.status)
```

**Salida esperada: `403`.** Hoy el padrón es exclusivo de administración, así
que un residente no ve **ninguna** vivienda, ni la suya. El filtrado por
vivienda propia se construye en la ETAPA 11, cuando su app lo necesite; hay una
prueba en la suite de aislamiento que se pondrá roja el día que alguien abra
esas rutas sin añadir el filtro.

---

### B.7.bis · Los demás roles, para la ETAPA 10

```bash
node scripts/aprovisionar-rol.mjs --correo 'porteria@...' --rol portero \
  --copropiedad '<uuid>' --nombre 'Portería Principal'

# Operador de central: UNA VEZ POR COPROPIEDAD que atienda. El gancho las agrupa
# en el claim `copropiedades` y deja `copropiedad_id` nulo, que es lo que la
# consola de guardia virtual usará para conmutar (KPI-35).
node scripts/aprovisionar-rol.mjs --correo 'central@...' --rol operador_central \
  --copropiedad '<uuid-copropiedad-A>' --nombre 'Central 1'
node scripts/aprovisionar-rol.mjs --correo 'central@...' --rol operador_central \
  --copropiedad '<uuid-copropiedad-B>' --nombre 'Central 1'
```

| Rol                  | Segundo factor  | `copropiedad_id` en el token | Superficie                            |
| -------------------- | --------------- | ---------------------------- | ------------------------------------- |
| `superadministrador` | **obligatorio** | `null` (alcance global)      | Consola de administración             |
| `administrador`      | **obligatorio** | su copropiedad               | Consola de administración             |
| `operador_central`   | **obligatorio** | `null` + `copropiedades[]`   | Guardia virtual (ETAPA 10)            |
| `portero`            | no              | su copropiedad               | Consola de portería (ETAPA 10)        |
| `residente`          | no              | su copropiedad               | App Flutter (ETAPA 11)                |
| `servicio`           | no              | su copropiedad               | Edge e ingesta; no entra a la consola |

> **Un usuario con varios roles se queda con el más privilegiado.** Lo decide `app.precedencia_de_rol` (migración 0024), declarado ahí en vez de deducirse del orden del enumerado: tomar «cualquiera» haría que la sesión dependiera del orden físico de las filas, que cambia con un `VACUUM`.

### B.8 · Comprobarlo sin desplegar

Contra una base PostgreSQL local, el camino entero se verifica solo:

```bash
./supabase/arranque-en-frio.sh
```

Crea una base vacía, aplica las migraciones **sin semillas**, ejecuta el aprovisionamiento y comprueba que el gancho emite `rol`, `usuario_id` y `copropiedad_id`. También comprueba que un identificador de copropiedad inexistente se rechaza con un mensaje claro, que repetir el aprovisionamiento no duplica nada y que **ninguna columna de auditoría ha perdido su `NOT NULL`**.

---

## Lista de comprobación

- [ ] Migraciones `0023`, `0024`, `0025` y `0026` aplicadas.
- [ ] SMTP propio configurado, con SPF y DKIM en el dominio remitente.
- [ ] `Site URL` y las dos `Redirect URLs` de `/acceso/nueva-contrasena`.
- [ ] Plantilla de _Reset Password_ usando `token_hash`, **no** `ConfirmationURL`.
- [ ] Caducidad del enlace y política de contraseña fijadas.
- [ ] Un correo que existe y otro que no dan la **misma** respuesta.
- [ ] El enlace de recuperación **no funciona dos veces**.
- [ ] El restablecimiento aparece en `auditoria_seguridad`.
- [ ] Primera copropiedad registrada con `registrar-copropiedad.mjs`.
- [ ] Auth Hook de _custom claims_ activo y apuntando a `public.custom_access_token_hook`.
- [ ] Primer superadministrador aprovisionado y capaz de cargar `/tablero`.
- [ ] TOTP activado en el proyecto y factor inscrito por el titular **desde la consola** (§B.6).
- [ ] Códigos de recuperación entregados y guardados; se muestran una sola vez.
- [ ] `./supabase/arranque-en-frio.sh` en verde contra una base local: es el camino entero, hasta «la API le abre».
- [ ] `SUPABASE_SECRET_KEY` fuera del entorno al terminar.
- [ ] La consola arranca sin quejarse: con el entorno incompleto se detiene con código 78 y dice qué falta.
