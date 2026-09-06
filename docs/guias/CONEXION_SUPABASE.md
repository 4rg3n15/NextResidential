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

| Dato | Ruta en el panel de Supabase | Se usa en |
|---|---|---|
| **Project URL** | Project Settings → API → Project URL | API, web, móvil |
| **anon key** | Project Settings → API → Project API keys → `anon` `public` | Web y móvil, y la API cuando actúa en nombre del usuario |
| **service_role key** | Project Settings → API → Project API keys → `service_role` `secret` | **Solo servidor**: API, workers, Edge |
| **JWT Secret** | Project Settings → API → JWT Settings → JWT Secret | Verificación de tokens en la API |
| **Cadena directa** | Project Settings → Database → Connection string → **URI** | Migraciones y trabajos de mantenimiento |
| **Cadena de *pooler*** | Project Settings → Database → Connection pooling → **Connection string** | La aplicación en ejecución |

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
| **Consola web** (`apps/web`) | `anon`, como `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sujeta a RLS. Es pública por diseño |
| **App Flutter** (`apps/mobile`) | `anon`, vía `--dart-define` | Ídem |
| **API NestJS** (`apps/api`) | `anon` para actuar en nombre del usuario; `service_role` **solo** en rutas de servicio | La `anon` mantiene la segunda barrera de RLS activa |
| **Edge Gateway** (`apps/edge`) | `service_role` | Opera sin usuario humano |
| **Workers pg-boss** | `service_role` | Ídem |

### Las tres advertencias que hay que interiorizar

1. **`service_role` OMITE RLS por completo.** No la limita ninguna política de
   este esquema. Toda ruta que la use **debe** validar `copropiedad_id` en la
   capa de aplicación (ETAPA 03). `CLAUDE.md` §2.7.6 lo llama el riesgo de
   seguridad número uno del proyecto, y lo es.
2. **Todo lo que empieza por `NEXT_PUBLIC_` es público por definición.** Se
   compila en el paquete que llega al navegador. Poner ahí la `service_role`
   equivale a publicarla.
3. **Todo lo compilado en un binario Flutter es extraíble del binario.** Un
   `strings` sobre el APK basta. En `apps/mobile` no va ningún secreto.

> Lo que **sí** protege a `service_role`: los permisos de tabla. Los
> `REVOKE UPDATE, DELETE` sobre `eventos` **no** se eluden con esa clave, porque
> no son políticas de fila. Es exactamente la razón por la que ADR-005 usa
> `REVOKE` y no RLS.

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

Aplica en orden los 15 archivos de `supabase/migrations/`. Son **idempotentes**:
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

### 6.2 MFA TOTP

Authentication → Providers → **Multi-Factor Authentication** → habilitar TOTP.

RN-20 y CA-25 exigen segundo factor para **roles administrativos**. La
obligatoriedad no la impone Supabase: la impone el guard de la ETAPA 03, que
bloquea el acceso hasta completar el segundo factor. `usuarios.mfa_habilitado`
es una **proyección** para consulta, no la fuente de verdad.

### 6.3 Expiración de tokens

Authentication → Settings. Recomendado: **access token 1 hora**, refresh token
con rotación activada.

> **Consecuencia que conviene tener presente:** los claims viajan en el token.
> Si un residente cambia de vivienda, su token sigue diciendo lo anterior hasta
> que se refresque. Por eso el predicado V (`app.es_mi_vivienda`) **no** usa un
> claim de vivienda: consulta la tabla `residentes` en cada evaluación. Es la
> única función `SECURITY DEFINER` del esquema, y está ahí por este motivo.

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
| `public` | Las 30 tablas del modelo, con RLS activa y forzada |
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

`PENDIENTE DE DEFINICIÓN`: la **política de retención de eventos y evidencia** no
está definida en ningún insumo. Conviene fijarla antes de producción, porque
afecta al principio de finalidad de la Ley 1581 y al coste de almacenamiento.
Propuesta a validar: eventos 24 meses en línea y archivo posterior; evidencia
fotográfica 12 meses; plantillas biométricas, lo que dure la vigencia más 24 h
(eso sí está fijado, por RN-11).

### Rotación de llaves — qué se rompe y en qué orden

| Llave | Al rotarla se rompe | Orden de rotación |
|---|---|---|
| **`anon`** | Web y móvil dejan de autenticar | 1. Rotar en el panel · 2. Desplegar web con la nueva · 3. Publicar versión móvil · 4. **Esperar a que los clientes actualicen antes de revocar la anterior** |
| **`service_role`** | API, workers y **todos los Edge** pierden acceso | 1. Rotar · 2. Desplegar API y workers · 3. Actualizar cada Edge **uno a uno**, verificando que reconcilia antes de pasar al siguiente |
| **JWT Secret** | **Todas** las sesiones activas se invalidan | Ventana de mantenimiento anunciada. No es una rotación en caliente |
| **Credenciales de dispositivo** | Solo el equipo afectado | Rotar en la bóveda; `dispositivos.credencial_ref` no cambia. **Ese es el motivo de que la base guarde una referencia y no la credencial** (D-09b) |
| **Llave de cifrado biométrico** | Las plantillas cifradas con la anterior dejan de descifrarse | Cifrado de sobre con `algoritmo` versionado (D-10): descifrar con la vieja, recifrar con la nueva, y solo entonces retirar la vieja |

**El Edge es el caso delicado**: opera sin conexión. Si rotas `service_role`
mientras un Edge está en corte de WAN, al reconectar fallará la reconciliación y
sus eventos quedarán en la bandeja local. No se pierden —para eso está la
bandeja—, pero KPI-29 (reconciliación en menos de 5 minutos) no se cumplirá en
esa ventana. **Rota cuando todos los Edge estén en línea.**

---

## 11. Lista de verificación

Marca cada casilla antes de dar la conexión por buena.

**Credenciales y entorno**
- [ ] El proyecto Supabase está bajo cuenta corporativa de Grupo Control
- [ ] `Project URL`, `anon`, `service_role`, `JWT Secret` y ambas cadenas de conexión, copiados del panel
- [ ] Los cuatro `.env` creados a partir de sus `.env.example`
- [ ] `git status` no muestra ningún `.env` ni `.env.local`
- [ ] Ningún `NEXT_PUBLIC_*` contiene la `service_role`
- [ ] `apps/mobile/.env` no contiene ningún secreto

**Esquema**
- [ ] `supabase link` enlaza el proyecto correcto
- [ ] `supabase db push` corre limpio sobre la base
- [ ] Volver a ejecutarlo no produce error (idempotencia)
- [ ] Existen las 30 tablas y las particiones de `eventos`
- [ ] Semillas aplicadas, con las **dos** copropiedades

**Seguridad — ninguna de estas es opcional**
- [ ] RLS **activa y forzada** en el 100 % de las tablas (§5.2)
- [ ] La consulta cruzada de §5.3 devuelve **0 filas**
- [ ] El `INSERT` cruzado de §5.3 **falla**
- [ ] `UPDATE` y `DELETE` sobre `eventos` **fallan** con `permission denied` (§5.4)
- [ ] Ninguna fila de `dispositivos.credencial_ref` contiene algo que no empiece por `vault:` o `env:`
- [ ] Bucket `evidencias` creado y **privado**
- [ ] MFA TOTP habilitado en el proyecto

**Operación**
- [ ] Auth Hook de *custom claims* configurado (o anotado como tarea de la ETAPA 03)
- [ ] Expiración de tokens revisada
- [ ] `app.mantener_particiones_eventos()` programado mensualmente
- [ ] Respaldos configurados y política de retención acordada
- [ ] Procedimiento de rotación leído por quien vaya a ejecutarlo

**Verificación final**
- [ ] `./supabase/verificar.sh --con-pruebas` termina sin errores
