# ADR-023 · Cuentas por nombre de usuario sobre Supabase Auth, con correo sintético no enrutable

|                 |                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Estado**      | Aceptada · ETAPA 15-H (2026-09-25) · extensión al contrato **E-02**                                                                        |
| **Sustituye a** | Nada. Convive con el acceso por correo de la ETAPA 03, que no cambia                                                                       |
| **Afecta a**    | migración `0037`, gancho de claims, `apps/api/src/cuentas`, guard global de cambio de contraseña, `apps/web` (acceso y cambio obligatorio) |

---

## Contexto

Supabase Auth autentica por **correo o teléfono**. El cliente pide cuentas por
**nombre de usuario** —el portero entra con su «ID de portero»—, **únicas por
copropiedad**, y el SMTP está bloqueado (BE-01), así que tampoco hay correo con
el que recuperar una contraseña. Lo que no se puede tocar es lo que sostiene la
seguridad desde la ETAPA 03: verificación asimétrica contra el JWKS, claims del
gancho, MFA por `aal` y RLS forzada.

## Decisión

**Cada cuenta por usuario es una cuenta de Supabase con un correo SINTÉTICO NO
ENRUTABLE bajo `.invalid` (RFC 2606):**

```
<usuario>@<id-de-copropiedad>.usuarios.ncr.invalid
```

- **Lo calcula el servidor, en una sola función** (`cuentas/dominio/correo-sintetico.ts`),
  y sólo vive en `auth.users`. No se guarda en ninguna tabla nuestra, no sale
  en ninguna respuesta, ni en la bitácora, ni en un error, ni en la interfaz.
  `.invalid` garantiza que, si algo intentara enviarle un correo, no llegaría a
  nadie.
- **El inicio de sesión por usuario pasa por la API** (`POST /auth/acceso`): la
  API resuelve la cuenta, hace el `grant_type=password` contra Supabase con el
  correo sintético y devuelve **la sesión de Supabase** a la consola. Los
  tokens son los de Supabase: el JWKS, los claims del gancho, el `aal` y la RLS
  no cambian en nada. La consola guarda la sesión en las mismas cookies
  `httpOnly` de siempre.
- **Las cuentas por correo siguen entrando como hasta ahora**: la consola
  distingue por la presencia de `@` y, con correo, habla con Supabase como en
  la ETAPA 03. `usuarios.correo` sólo admite nulo si la cuenta tiene nombre de
  usuario (restricción en la base).

### El nombre de usuario

- `usuarios.nombre_usuario citext`, **único por copropiedad** (índice único
  parcial), insensible a mayúsculas.
- Juego de caracteres acotado: `a-z`, `0-9`, `.`, `_`, `-`; de 3 a 32; empieza
  por letra o dígito. El servidor lo **sanea antes de validar** (NFC, recorte,
  minúsculas, sin controles) y la base lo vuelve a exigir con un `CHECK`.

### Por qué además se pide el NIT de la copropiedad · desviación declarada

El encargo decía «el usuario escribe sólo su nombre de usuario». Con unicidad
**por copropiedad** eso no es posible sin ambigüedad: `P001` existirá en muchas.
Se consideraron tres salidas y se descartaron dos:

| Alternativa                                                  | Por qué no                                                                                                                                                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nombres únicos en toda la plataforma                         | Contradice el requisito, y un superadministrador con cuarenta copropiedades no puede inventar cuarenta `P001` distintos                                                                                           |
| Probar la contraseña contra cada copropiedad con ese usuario | Cada intento prueba N cuentas a la vez y multiplica las llamadas a Supabase; con muchas copropiedades, un límite de candidatos deja fuera a porteros legítimos                                                    |
| **Pedir también el NIT de la copropiedad** ✅                | El NIT ya es `NOT NULL`, único (`copropiedades_nit_uk`), normalizado por `app.normalizar_nit` y conocido por el personal. No es secreto. **La consola lo recuerda por equipo**: en la portería se escribe una vez |

La traducción la sigue haciendo el servidor, y el correo sintético sigue sin
salir de él.

### Límites de intentos (§2.7.5)

Un nombre de usuario se adivina mejor que un correo. `POST /auth/acceso` lleva
tres límites a la vez: **5/min por cuenta** (NIT + usuario), **10/min por
origen declarado por la consola** y **30/min por dirección que llama a la API**
(la consola misma). El primero es el que no se puede esquivar: rotar el origen
declarado no cambia la cuenta que se ataca. Además, todo fallo responde tras un
**tiempo mínimo uniforme**, para que «el usuario no existe» y «la contraseña no
es esa» no se distingan por el reloj.

### Primer ingreso · impuesto en el servidor

- `usuarios.debe_cambiar_contrasena` → el gancho lo emite como claim
  `debe_cambiar_contrasena` → **un guard global responde 403 en TODA ruta**
  salvo `POST /auth/contrasena` y `POST /auth/cierre`. Esconderlo en la
  interfaz no protege nada: el guard sí.
- El cambio verifica **la contraseña actual contra Supabase**, rechaza una
  nueva **igual a la actual** (que mientras dure el indicador ES la inicial) y
  las que no cumplen la política vigente (8 caracteres, mayúscula, minúscula,
  dígito), la fija con la API de administración y **baja el indicador**. La
  consola refresca el token y el claim desaparece.

### Recuperación sin SMTP · pendiente de BE-01

- **Portero**: la restablece el **superadministrador**.
- **Residente** (y cualquier otra cuenta de su copropiedad salvo roles
  administrativos): la restablece el **administrador**.
- Quien restablece **escribe** una contraseña temporal que cumple la política;
  el servidor no la genera ni la devuelve. La cuenta queda con
  `debe_cambiar_contrasena`, y el restablecimiento queda en la bitácora de solo
  inserción con quién, a quién y cuándo. A un portero, además, se le cierran
  en el acto sus sesiones registradas.
- **Lo que queda pendiente de BE-01**: la recuperación **por el propio
  usuario**. Con correo sintético no la habrá nunca por correo; cuando exista
  un canal real (SMS, correo verdadero de contacto) se decide cuál (P-18).

## Consecuencias

- **Un camino más de inicio de sesión**, y por eso vive en la API y no en la
  consola: la API es la que puede consultar la base, aplicar el turno del
  portero y registrar el origen.
- **Nada del núcleo de seguridad cambia**: el guard de autenticación sigue
  verificando la firma contra el JWKS y el `aal`; el gancho sólo añade un claim.
- **Riesgo residual declarado**: tras un restablecimiento, una cuenta que NO es
  de portero conserva su token vigente hasta 5 minutos; en el siguiente
  refresco el claim de cambio obligatorio la deja sin acceso a nada salvo el
  cambio, que exige la contraseña nueva. Para el portero el cierre es
  inmediato porque su sesión se consulta en cada petición (ADR-024).
- **Contingencia**: si Supabase dejara de admitir el dominio `.invalid`, el
  sufijo cambia en una constante y en una migración de datos de `auth.users`;
  nada fuera de `cuentas` lo nombra.
