# Recuperación de contraseña y aprovisionamiento de usuarios

**Etapa:** 09-A · **Depende de:** migraciones `0023` y `0024` aplicadas · **ADR:** [ADR-008](../decisiones/ADR-008-supabase-auth-como-mecanismo-autoritativo-de-mfa.md)

Esta guía tiene dos partes independientes. La **A** configura la recuperación de contraseña; la **B** crea el primer superadministrador y los demás roles. Las dos se ejecutan **una vez por proyecto** y las dos exigen acceso al panel de Supabase.

> **Ningún paso de esta guía le pide que escriba una credencial en el repositorio.** Los guiones leen lo que necesitan del entorno y se detienen si falta. Si en algún momento le parece que hace falta guardar una contraseña o una llave en un fichero versionado, es que algo está mal explicado: pregunte antes de hacerlo.

---

## Antes de nada · aplicar las migraciones nuevas

```bash
supabase db push          # aplica 0023 y 0024
```

- **0023** añade `restablecimiento_contrasena` al enumerado de eventos de seguridad. Sin ella, el registro de auditoría del restablecimiento falla al escribir.
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
2. Panel → **Authentication → Policies** (o _Password Settings_): fije la longitud mínima en **12** y active los requisitos de complejidad. La consola valida 12 en el cliente y en el servidor; si el panel exigiera más, el usuario vería el mensaje de Supabase y no el nuestro.

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

### B.1 · Crear la identidad — lo hace usted, en el panel

1. Panel → **Authentication → Users → Add user**.
2. Marque **Auto Confirm User** (no habrá nadie para confirmar el primer correo).
3. Escriba el correo corporativo y **una contraseña que elija usted**. No la comparta por chat ni la escriba en ningún fichero del proyecto; lo natural es que el titular la cambie en su primer acceso con el flujo de la parte A.
4. Anote el **User UID** que aparece en la lista. No es secreto: es un identificador.

### B.2 · Asegurar que existe una copropiedad

`roles_usuario.copropiedad_id` es `NOT NULL`, así que **también el superadministrador necesita una fila con una copropiedad**. No lo ata a ella: su alcance real es global y lo resuelve `app.es_superadmin()` en las políticas RLS.

```sql
SELECT id, nombre FROM public.copropiedades WHERE estado = 'activa' ORDER BY creado_en LIMIT 5;
```

Si no hay ninguna, aplique las semillas (`supabase/seed/`) o cree la real. Anote el `id`.

### B.3 · Asignar el rol — con el guion, que lee del entorno

En la sesión de su terminal, **sin escribir esto en ningún fichero**:

```bash
export SUPABASE_URL='https://<referencia>.supabase.co'
export SUPABASE_SECRET_KEY='sb_secret_...'      # llave SECRETA; omite la RLS

node scripts/aprovisionar-rol.mjs \
  --correo 'admin@grupocontrol.co' \
  --rol superadministrador \
  --copropiedad '<uuid-de-la-copropiedad>' \
  --nombre 'Nombre Apellido'
```

El guion es **idempotente** y hace tres cosas: comprueba que la identidad existe en Supabase Auth —si no existe, se detiene y le dice que la cree usted—, crea o reutiliza la fila de `public.usuarios` enlazada por `auth_user_id`, y añade la fila de `roles_usuario`. **No crea usuarios, no genera contraseñas y no inscribe el segundo factor.**

Cuando termine, cierre la sesión de terminal o ejecute `unset SUPABASE_SECRET_KEY`: esa llave omite la RLS y es la credencial más sensible del proyecto.

### B.4 · Activar el gancho de claims — **si esto falta, no entra nadie**

1. Panel → **Authentication → Hooks**.
2. **Customize Access Token (JWT) Claims** → _Enable_.
3. Elija **Postgres** y seleccione la función `public.custom_access_token_hook` (la crea la migración 0024).
4. Guarde.
5. Compruébelo: inicie sesión en la consola y, en `Application → Cookies`, no verá el token —es `httpOnly`, y así debe ser—. La comprobación real es que `/tablero` carga en vez de redirigir. Si redirige a `/acceso`, el token no lleva `rol`: revise que el gancho está activo y que el usuario tiene una fila **activa** en `roles_usuario`.

### B.5 · Inscribir el segundo factor — lo hace el titular

Los tres roles administrativos —superadministrador, administrador, operador de central— **no entran sin `aal2`** (RN-20, CA-25). Es el guard de la API quien lo exige, así que sin este paso el usuario se autentica y no puede hacer nada.

1. Panel → **Authentication → Providers → Multi-Factor Authentication**: active **TOTP**.
2. El titular inscribe su factor desde **su propia sesión**. Hoy eso se hace desde el panel de Supabase (Account → Multi-Factor Authentication) o con la aplicación de autenticación que use la organización.
3. **Nadie más debería poder inscribir el factor de otra persona**, y por eso la consola no lo ofrece: un segundo factor que un tercero puede dar de alta no es un segundo factor.
4. Con el factor inscrito, el acceso a la consola muestra el paso de verificación automáticamente.

> **Pendiente declarado.** Una pantalla de inscripción de TOTP dentro de la consola no está construida: es trabajo de una etapa posterior y queda anotado en el informe. Hasta entonces, la inscripción es una operación del panel.

### B.6 · Los demás roles, para la ETAPA 10

El mismo guion, cambiando `--rol`:

```bash
# Portero de una copropiedad concreta.
node scripts/aprovisionar-rol.mjs --correo 'porteria@...' --rol portero \
  --copropiedad '<uuid>' --nombre 'Portería Principal'

# Operador de central: se ejecuta UNA VEZ POR COPROPIEDAD que atienda.
# El gancho las agrupa en el claim `copropiedades` y deja `copropiedad_id` nulo,
# que es lo que la consola de guardia virtual usará para conmutar (KPI-35).
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

> **Un usuario con varios roles se queda con el más privilegiado.** Lo decide `app.precedencia_de_rol` en la migración 0024, y está declarado ahí en vez de deducirse del orden del enumerado: tomar «cualquiera» haría que la sesión dependiera del orden físico de las filas, que cambia con un `VACUUM`.

---

## Lista de comprobación

- [ ] Migraciones `0023` y `0024` aplicadas.
- [ ] SMTP propio configurado, con SPF y DKIM en el dominio remitente.
- [ ] `Site URL` y las dos `Redirect URLs` de `/acceso/nueva-contrasena`.
- [ ] Plantilla de _Reset Password_ usando `token_hash`, **no** `ConfirmationURL`.
- [ ] Caducidad del enlace y política de contraseña fijadas.
- [ ] Un correo que existe y otro que no dan la **misma** respuesta.
- [ ] El enlace de recuperación **no funciona dos veces**.
- [ ] El restablecimiento aparece en `auditoria_seguridad`.
- [ ] Auth Hook de _custom claims_ activo y apuntando a `public.custom_access_token_hook`.
- [ ] Primer superadministrador con fila activa en `roles_usuario`.
- [ ] TOTP activado en el proyecto y factor inscrito por el titular.
- [ ] `SUPABASE_SECRET_KEY` fuera del entorno al terminar.
