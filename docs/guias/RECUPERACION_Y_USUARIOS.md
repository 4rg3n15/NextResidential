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

### B.6 · Inscribir el segundo factor — lo hace el titular

Los tres roles administrativos **no entran sin `aal2`** (RN-20, CA-25). Es el guard de la API quien lo exige, así que sin este paso el usuario se autentica y no puede hacer nada.

1. Panel → **Authentication → Providers → Multi-Factor Authentication**: active **TOTP**.
2. El titular inscribe su factor desde **su propia sesión**, con su aplicación de autenticación.
3. **Nadie más debería poder inscribir el factor de otra persona**, y por eso la consola no lo ofrece.

> **Pendiente declarado (P-14).** Una pantalla de inscripción de TOTP dentro de la consola no está construida. Hasta entonces, la inscripción es una operación del panel.

### B.7 · Los demás roles, para la ETAPA 10

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

- [ ] Migraciones `0023`, `0024` y `0025` aplicadas.
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
- [ ] TOTP activado en el proyecto y factor inscrito por el titular.
- [ ] `SUPABASE_SECRET_KEY` fuera del entorno al terminar.
