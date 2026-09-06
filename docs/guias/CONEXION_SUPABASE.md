# Guía de conexión a Supabase

**Para quién.** Para quien ya tiene un proyecto Supabase creado y sus
credenciales a mano. Esta guía no crea el proyecto: lo conecta.

**Regla que gobierna todo lo demás.** Las credenciales se cargan en archivos
`.env` locales, **nunca** se pegan en un chat, en una incidencia, en un commit ni
en un documento. Los `.env.example` de este repositorio se versionan **con los
nombres y las descripciones, jamás con los valores** (`CLAUDE.md` §2.7.1).

**Cuenta.** El proyecto, el dominio, las llaves y los ambientes deben estar bajo
**cuenta corporativa de Grupo Control**, nunca personal (PDF del reto §8).

---

## 1. Qué necesitas del panel, y dónde está

> **Esquema nuevo de llaves.** Los proyectos creados desde **noviembre de 2025**
> ya no traen las llaves heredadas `anon` ni `service_role`, ni un secreto JWT
> compartido. Desde el **1 de octubre de 2025** los proyectos nuevos usan
> **firma asimétrica** por defecto. Esta guía describe ese esquema, que es el
> del proyecto de Grupo Control. Las llaves heredadas siguen existiendo en
> proyectos antiguos y se retiran a finales de 2026.

| Dato | Ruta en el panel de Supabase | Se usa en |
|---|---|---|
| **Project URL** | Project Settings → API | API, web, móvil |
| **Llave publicable** `sb_publishable_…` | **Settings → API Keys** | Web y móvil, y la API cuando actúa en nombre del usuario |
| **Llave secreta** `sb_secret_…` | **Settings → API Keys** | **Solo servidor**: API, workers, Edge |
| **URL del JWKS** | **Project Settings → JWT Keys** | Verificación de tokens en la API |
| **Cadena directa** | Project Settings → Database → Connection string → **URI** | Migraciones y trabajos de mantenimiento |
| **Cadena de *pooler*** | Project Settings → Database → Connection pooling → **Connection string** | La aplicación en ejecución |

**Settings → API Keys** las lista todas, heredadas o no. No hay ya una sección
«API» separada para esto.

### Las llaves nuevas no son JWT

`sb_publishable_…` y `sb_secret_…` **no son tokens firmados**: no dependen del
secreto del proyecto y no lo tocan. Dos consecuencias prácticas:

- Se pueden crear **varias llaves secretas** y **revocar una sola** sin romper
  las demás. Con `service_role` había que rotar el secreto JWT entero y con él
  se caía todo lo conectado.
- No caducan por sí solas ni arrastran una ventana de exposición de diez años,
  que era el problema de las heredadas.

### La URL del JWKS

```
https://<project-ref>.supabase.co/auth/v1/jwks
```

Responde también en `/auth/v1/.well-known/jwks.json`. Devuelve **solo claves
públicas**: no hay nada secreto que proteger en ese endpoint, y por eso la
verificación puede hacerse en cualquier servicio sin repartir secretos.

### Por qué la cadena directa y la de *pooler* no son intercambiables

La de **pooler** multiplexa conexiones en modo transacción. Es lo que quieres
para una API con muchas peticiones cortas, y es lo que **no** quieres para
migraciones: en modo transacción no hay sesión estable, y sentencias como
`CREATE TABLE ... PARTITION OF` o `SET LOCAL ROLE` se comportan de forma
distinta. **Migra por la directa; opera por el pooler.**

---

## 2. Qué llave usa cada superficie, y por qué

| Superficie | Llave | Motivo |
|---|---|---|
| **Consola web** (`apps/web`) | **publicable**, como `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Resuelve al rol `anon`: sujeta a RLS. Es pública por diseño |
| **App Flutter** (`apps/mobile`) | **publicable**, vía `--dart-define` | Ídem |
| **API NestJS** (`apps/api`) | **publicable** para actuar en nombre del usuario; **secreta** **solo** en rutas de servicio | La publicable mantiene activa la segunda barrera de RLS |
| **Edge Gateway** (`apps/edge`) | **secreta**, preferiblemente **una por equipo** | Opera sin usuario humano. Al ser revocables por separado, comprometer un Edge no obliga a rotar el resto |
| **Workers pg-boss** | **secreta** | Ídem |

### Las tres advertencias que hay que interiorizar

1. **La llave secreta OMITE RLS por completo.** Resuelve al rol `service_role`,
   que lleva el atributo `BYPASSRLS`: no la limita ninguna política de este
   esquema. Toda ruta que la use **debe** validar `copropiedad_id` en la capa de
   aplicación (ETAPA 03). `CLAUDE.md` §2.7.6 lo llama el riesgo de seguridad
   número uno del proyecto, y lo sigue siendo: **el cambio de nombre de la llave
   no cambia el riesgo.**
2. **Todo lo que empieza por `NEXT_PUBLIC_` es público por definición.** Se
   compila en el paquete que llega al navegador. Poner ahí la llave **secreta**
   equivale a publicarla.
3. **Todo lo compilado en un binario Flutter es extraíble del binario.** Un
   `strings` sobre el APK basta. En `apps/mobile` no va ningún secreto.

> Lo que **sí** contiene a la llave secreta: los permisos de tabla. `BYPASSRLS`
> omite políticas de **fila**, no privilegios de tabla. Los
> `REVOKE UPDATE, DELETE` sobre `eventos` **no** se eluden con ella. Es
> exactamente la razón por la que ADR-005 usa `REVOKE` y no RLS.
>
> **Nada del esquema de la ETAPA 01 cambia con las llaves nuevas.** Las 16
> migraciones, los `GRANT`/`REVOKE` y las 95 políticas se declaran sobre los
> **roles de PostgreSQL** —`anon`, `authenticated`, `service_role`—, que siguen
> existiendo tal cual. Lo único que cambió es el nombre de las variables de
> entorno y cómo se verifica la firma del token.

---

## 3. Preparar los archivos de entorno

```bash
cp apps/api/.env.example    apps/api/.env
cp apps/web/.env.example    apps/web/.env.local
cp apps/mobile/.env.example apps/mobile/.env
cp apps/edge/.env.example   apps/edge/.env
```

Rellena los valores. `.gitignore` cubre `.env*` con excepción de `.env.example`,
así que los archivos con valores no pueden llegar al repositorio por descuido.

**Verifícalo antes del primer commit:**

```bash
git check-ignore -v apps/api/.env    # debe salir ignorado
git status --porcelain | grep -E '\.env$|\.env\.local$'   # no debe devolver nada
```

---

## 4. CLI de Supabase

### Instalación

```bash
npm install -g supabase        # o: brew install supabase/tap/supabase
supabase --version
```

### Enlazar el proyecto

```bash
supabase login
supabase link --project-ref <ref-del-proyecto>   # el ref esta en la URL del panel
```

### Aplicar las migraciones

```bash
supabase db push
```

Aplica en orden los 16 archivos de `supabase/migrations/`. Son **idempotentes**:
volver a ejecutarlos sobre una base ya migrada no produce error ni cambio. Está
verificado con tres pasadas consecutivas.

**Sobre la reversión.** El CLI de Supabase no tiene *down migrations*. La
reversibilidad que exige `CLAUDE.md` §6 vive en `supabase/reversion/`, con un
guion por migración que se aplica manualmente en orden descendente. Ver
`supabase/reversion/README.md`. El de `eventos` exige confirmación explícita
porque es destructivo sobre un registro que RN-03 declara inmutable.

### Sembrar datos de prueba

```bash
psql "$DATABASE_URL" -f supabase/seed/seed.sql
```

Crea **dos** copropiedades ficticias. La segunda no es decorativa: sin un
segundo tenant, las pruebas negativas de aislamiento no prueban nada.

---

## 5. Verificación

### 5.1 En local, sin credenciales

El esquema no depende de nada específico de Supabase, así que puede verificarse
contra una base PostgreSQL 16 vacía:

```bash
./supabase/verificar.sh --con-pruebas
```

Aplica las migraciones, siembra y ejecuta la suite completa: aislamiento,
invariantes estructurales, inmutabilidad y la prueba de concurrencia de KPI-03.

### 5.2 RLS activa en el 100 % de las tablas

```sql
SELECT count(*) FILTER (WHERE relrowsecurity AND relforcerowsecurity) AS con_rls,
       count(*) AS total
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r','p');
```

`con_rls` debe ser igual a `total`. La migración `0015` ya falla si no lo es,
pero conviene comprobarlo también contra el proyecto real.

### 5.3 Comprobación práctica del aislamiento

**Una consulta cruzada entre copropiedades debe fallar.** Es la comprobación que
`CLAUDE.md` §6 pide expresamente:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims =
  '{"rol":"administrador","copropiedad_id":"<UUID de la copropiedad A>","usuario_id":"<UUID>"}';

-- Debe devolver 0 filas, no las de la copropiedad B:
SELECT count(*) FROM public.viviendas WHERE copropiedad_id = '<UUID de la copropiedad B>';

-- Y esto debe fallar con "new row violates row-level security policy":
INSERT INTO public.viviendas (copropiedad_id, identificador, creado_por, actualizado_por)
VALUES ('<UUID de la copropiedad B>','Intruso','<UUID>','<UUID>');
ROLLBACK;
```

Si la consulta devuelve filas o el `INSERT` tiene éxito, **detén el despliegue**:
es una fuga multiempresa (RN-15, KPI-36).

### 5.4 Inmutabilidad de eventos

```sql
BEGIN;
SET LOCAL ROLE authenticated;
UPDATE public.eventos SET regla_aplicada = 'alterada' WHERE true;  -- permission denied
DELETE FROM public.eventos WHERE true;                             -- permission denied
ROLLBACK;
```

Ambas deben fallar con `permission denied for table eventos` (ADR-005, CA-23).

---

## 6. Autenticación

### 6.1 *Custom claims* de copropiedad y rol

Todo el aislamiento de este esquema depende de que el JWT lleve `copropiedad_id`
y `rol`. Sin ellos, `app.copropiedad_id()` devuelve `NULL` y **ninguna política
concede acceso** — el sistema falla cerrado, que es el comportamiento correcto.

Se configuran con un **Auth Hook** de tipo *Custom Access Token* (Authentication
→ Hooks). El hook debe añadir, leyendo de `public.roles_usuario`:

| Claim | Contenido |
|---|---|
| `usuario_id` | `usuarios.id` |
| `persona_id` | `usuarios.persona_id` — necesario para el predicado V del residente |
| `rol` | El rol activo del usuario |
| `copropiedad_id` | La copropiedad del contexto actual |
| `copropiedades` | **Arreglo** de copropiedades que atiende — solo para el operador de central (HU-25, KPI-35) |

La implementación del hook es de la **ETAPA 03**. Hasta entonces, los claims se
fijan manualmente para las pruebas, como en §5.3.

> **Verificado: los *custom claims* funcionan igual con firma asimétrica.** El
> gancho se ejecuta **antes** de firmar el token y modifica su carga útil; el
> algoritmo se aplica después. Son dos etapas independientes. Del lado de la
> base tampoco cambia nada: PostgREST verifica el token —ahora contra JWKS— y
> rellena `request.jwt.claims`; `auth.jwt()` es exactamente
> `current_setting('request.jwt.claims', true)::jsonb`, que es lo que lee
> nuestro `app.claims()`. **Las 95 políticas RLS siguen siendo válidas sin
> tocar una línea.**

### 6.2 MFA TOTP

Authentication → Providers → **Multi-Factor Authentication** → habilitar TOTP.

RN-20 y CA-25 exigen segundo factor para **roles administrativos**. La
obligatoriedad no la impone Supabase: la impone el guard de la ETAPA 03, que
bloquea el acceso hasta completar el segundo factor. `usuarios.mfa_habilitado`
es una **proyección** para consulta, no la fuente de verdad.

### 6.3 Expiración de tokens y verificación asimétrica

Con firma asimétrica la expiración del token de acceso pasa a **5 minutos**, y
Supabase desaconseja bajar de ahí. El valor efectivo es el que muestre
Project Settings → Auth.

> **Discrepancia en la documentación, dejada por escrito.** La guía general de
> JWT sigue citando 3600 s como valor histórico por defecto, mientras el
> material de llaves de firma describe los 5 minutos del esquema nuevo. **Manda
> el panel del proyecto.** Este diseño asume 5 minutos: diseñar para el plazo
> corto es seguro si resulta ser más largo; al revés, no.

Lo que el plazo corto obliga a hacer bien está detallado en
[`docs/arquitectura/verificacion-jwt-asimetrica.md`](../arquitectura/verificacion-jwt-asimetrica.md) §3.
En una línea: **el Edge y los workers no se ven afectados** —usan la llave
secreta, no un token de usuario—, pero la app Flutter debe refrescar **al volver
a primer plano**, y el canal de tiempo real debe reenviar el token renovado al
socket o la conexión se cae a los 5 minutos.

**Verificación contra JWKS — reglas que no son negociables:**

- El algoritmo se toma de la clave del JWKS seleccionada por `kid`, **nunca del
  encabezado del token**. Aceptar el `alg` del token abre la confusión de
  algoritmos.
- **HS256 no se acepta.** No hay secreto compartido, y una biblioteca permisiva
  convertiría cualquier clave pública conocida en secreto de firma válido.
- Caché local del JWKS con **TTL de 10 minutos**, el mismo que el edge de
  Supabase. Más alto significaría seguir aceptando una clave revocada más tiempo
  del que la propia plataforma lo hace.
- Si la caché caducó y el refresco falla, **se rechaza**. Fallar cerrado.

> **Consecuencia que conviene tener presente:** los claims viajan en el token.
> Si un residente cambia de vivienda, su token sigue diciendo lo anterior hasta
> que se refresque —ahora, como mucho 5 minutos—. Aun así, el predicado V
> (`app.es_mi_vivienda`) **no** usa un claim de vivienda: consulta la tabla
> `residentes` en cada evaluación. Es la única función `SECURITY DEFINER` del
> esquema, y está ahí por este motivo.

---

## 7. Storage: evidencia con URLs firmadas

1. Storage → **New bucket** → nombre `evidencias` → **Private** (nunca público).
2. Sin políticas de acceso anónimo. La API sirve la evidencia generando **URLs
   firmadas de vida corta** (RN-21).
3. Vida sugerida de la firma: **60 segundos**. Suficiente para que el navegador
   cargue la imagen, insuficiente para que la URL sirva como enlace permanente.

**La tabla `evidencias` guarda `bucket`, `ruta` y `hash_sha256`, nunca una URL**
(decisión D-19). Persistir una URL firmada convertiría un permiso temporal en un
dato permanente: una fuga de la tabla sería una fuga de las fotos.

El `hash_sha256` permite verificar que el objeto servido es el mismo que sustentó
la decisión. Sin él, la «trazabilidad fotográfica» que pide el PDF del reto sería
una promesa sin comprobación.

---

## 8. Extensiones y esquemas

Las migraciones crean lo necesario. Solo hay que confirmarlo:

| Extensión | Para qué | La crea |
|---|---|---|
| `pgcrypto` | `gen_random_uuid()` en todas las claves primarias | Migración `0001` |
| `citext` | Correos comparables sin distinguir mayúsculas | Migración `0001` |

**`pg_cron` no se usa.** Los trabajos programados —supresión biométrica (RN-11),
mantenimiento de particiones, reintentos de sincronización— corren sobre
**pg-boss**, que es el stack fijado en `CLAUDE.md` §2.6. Añadir `pg_cron` sería
un segundo planificador con las mismas responsabilidades.

| Esquema | Contenido |
|---|---|
| `public` | Las 31 tablas del modelo, con RLS activa y forzada |
| `app` | Funciones de contexto, disparadores y utilidades. Sin datos |
| `pgboss` | Cola de trabajos. **Sin RLS por diseño**: el `copropiedad_id` viaja en la carga útil y el manejador lo valida en la capa de aplicación |

---

## 9. Mantenimiento de particiones

`eventos` está particionada por mes y **no tiene partición `DEFAULT`** (decisión
D-12): un evento fuera de rango falla ruidosamente en vez de acabar en un cajón
de sastre que no se puede podar.

La contrapartida es que hay que crear particiones por adelantado. La migración
inicial crea una ventana de 6 meses atrás y 3 adelante. Para mantenerla:

```sql
SELECT app.mantener_particiones_eventos(6, 3);
```

Programa esta llamada **mensualmente** con pg-boss, ejecutada por el rol de
mantenimiento. La función aplica el `REVOKE` de ADR-005 a cada partición nueva:
las particiones **no** heredan las revocaciones del padre, y ese es el punto
exacto donde la inmutabilidad podría erosionarse en silencio.

---

## 10. Respaldos, retención y rotación de llaves

### Respaldos

Database → Backups. En el plan gratuito son diarios y de retención corta; para
producción hace falta plan de pago con *Point-in-Time Recovery*.

### Retención — **resuelta**, sujeta a confirmación legal

| Dato | Plazo | Columna configurable |
|---|---|---|
| Eventos | **24 meses** | `copropiedades.retencion_eventos` |
| Evidencia fotográfica | **90 días** | `copropiedades.retencion_evidencia` |
| Plantillas biométricas | **Ligadas a la vigencia de su autorización** | `copropiedades.margen_supresion_plantilla`, acotada a 24 h por RN-11 |

Los tres son columnas, no constantes: la retención puede variar por contrato o
por exigencia de una autoridad, y un plazo escondido en el código no se puede
auditar ni ajustar sin desplegar.

**Cómo se purga cada uno** — los trabajos son de las ETAPAS 06 y 14; aquí queda
el contrato:

- **Eventos:** soltando particiones mensuales enteras con el rol de
  mantenimiento. **No con `DELETE`**, que no está concedido a ningún rol
  (ADR-005). Es un segundo motivo, además del de consulta, para haber
  particionado por mes.
- **Evidencia:** se borra el objeto de Storage y se registra en
  `purgas_retencion`. **La fila de `evidencias` no se toca**: conserva ruta y
  hash, de modo que el evento sigue siendo trazable sin conservar la imagen.
- **Plantillas:** ya lo cubre el barrido de pg-boss sobre `suprimir_en`
  (RN-11); la migración `0016` lo ata además a la vigencia con un disparador.

**Toda purga se acredita** en el libro append-only `purgas_retencion`. Sin él,
pasado el plazo no quedaría ni el dato ni constancia de haberlo suprimido.

> **Pendiente:** visto bueno de la asesoría jurídica de Grupo Control sobre los
> tres plazos, antes de producción.

### Rotación de llaves — qué se rompe y en qué orden

| Llave | Al rotarla se rompe | Orden de rotación |
|---|---|---|
| **Publicable** | Web y móvil dejan de autenticar | 1. Crear la nueva · 2. Desplegar web · 3. Publicar versión móvil · 4. **Esperar a que los clientes actualicen antes de revocar la anterior** |
| **Secreta** | Solo lo que use **esa** llave | Se pueden tener varias y revocar una sola. **Con una llave por Edge, rotar un equipo no toca a los demás** — esa es la mejora frente a `service_role` |
| **Llave de firma JWT** | **Nada, si se respeta el margen** | Rotación sin caída, ver abajo. Ya no invalida todas las sesiones como hacía el secreto JWT |
| **Credenciales de dispositivo** | Solo el equipo afectado | Rotar en la bóveda; `dispositivos.credencial_ref` no cambia. **Ese es el motivo de que la base guarde una referencia y no la credencial** (D-09b) |
| **Llave de cifrado biométrico** | Las plantillas cifradas con la anterior dejan de descifrarse | Cifrado de sobre con `algoritmo` versionado (D-10): descifrar con la vieja, recifrar con la nueva, y solo entonces retirar la vieja |

### Rotación de la llave de firma, sin caída

Supabase maneja cuatro estados —**Activa**, **En espera**, **Usada
anteriormente** y **Revocada**— y no hace falta desplegar de nuevo ningún
backend, porque todos leen el JWKS.

1. Crear la clave nueva **en espera**. **Esperar 20 minutos.**
2. Promoverla a **activa**. Los tokens nuevos se firman con ella; los antiguos
   siguen validando contra la anterior.
3. Esperar a que expiren los tokens en circulación: con 5 minutos de vigencia,
   basta con 5 minutos y un margen.
4. **Esperar 20 minutos desde el paso 2** y solo entonces **revocar** la
   anterior.

**De dónde salen los 20 minutos**, porque el número no es arbitrario:

```
10 min  caché del JWKS en el edge de Supabase
+ 10 min  nuestra caché local
= 20 min  en el peor caso
```

Si nuestra caché local fuese de 30 minutos, el margen seguro pasaría a 40 y la
recomendación oficial dejaría de protegernos. **Por eso el TTL local se fija en
10 minutos y no más.**

**El Edge sigue siendo el caso delicado**, aunque menos que antes: opera sin
conexión. Si revocas la llave secreta de un Edge mientras está en corte de WAN,
al reconectar fallará la reconciliación y sus eventos quedarán en la bandeja
local. No se pierden —para eso está la bandeja—, pero KPI-29 (reconciliación en
menos de 5 minutos) no se cumplirá en esa ventana. **Rota cuando ese Edge esté
en línea.**

La mejora del esquema nuevo es que ahora eso afecta **a un solo equipo**: con
una llave secreta por Edge, revocar la de uno no toca a los demás. Con
`service_role` había una única llave para todos.

---

## 11. Lista de verificación

Marca cada casilla antes de dar la conexión por buena.

**Credenciales y entorno**
- [ ] El proyecto Supabase está bajo cuenta corporativa de Grupo Control
- [ ] `Project URL`, llave **publicable**, llave **secreta**, **URL del JWKS** y ambas cadenas de conexión, copiados del panel
- [ ] Los cuatro `.env` creados a partir de sus `.env.example`
- [ ] `git status` no muestra ningún `.env` ni `.env.local`
- [ ] Ningún `NEXT_PUBLIC_*` contiene la llave **secreta**
- [ ] Ninguna variable contiene ya `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ni `SUPABASE_JWT_SECRET`
- [ ] `apps/mobile/.env` no contiene ningún secreto

**Esquema**
- [ ] `supabase link` enlaza el proyecto correcto
- [ ] `supabase db push` corre limpio sobre la base
- [ ] Volver a ejecutarlo no produce error (idempotencia)
- [ ] Existen las 31 tablas y las particiones de `eventos`
- [ ] Semillas aplicadas, con las **dos** copropiedades

**Seguridad — ninguna de estas es opcional**
- [ ] RLS **activa y forzada** en el 100 % de las tablas (§5.2)
- [ ] La consulta cruzada de §5.3 devuelve **0 filas**
- [ ] El `INSERT` cruzado de §5.3 **falla**
- [ ] `UPDATE` y `DELETE` sobre `eventos` **fallan** con `permission denied` (§5.4)
- [ ] Ninguna fila de `dispositivos.credencial_ref` contiene algo que no empiece por `vault:` o `env:`
- [ ] Bucket `evidencias` creado y **privado**
- [ ] MFA TOTP habilitado en el proyecto
- [ ] El JWKS responde y devuelve al menos una clave
- [ ] La expiración del token confirmada en Project Settings → Auth

**Operación**
- [ ] Auth Hook de *custom claims* configurado (o anotado como tarea de la ETAPA 03)
- [ ] Expiración de tokens revisada
- [ ] `app.mantener_particiones_eventos()` programado mensualmente
- [ ] Respaldos configurados
- [ ] Plazos de retención revisados por la asesoría jurídica de Grupo Control
- [ ] Procedimiento de rotación leído por quien vaya a ejecutarlo

**Verificación final**
- [ ] `./supabase/verificar.sh --con-pruebas` termina sin errores
