# Despliegue de Next Control Residencial

> **Lea esto antes que nada.** La plataforma de despliegue de la API **no está
> decidida**: es `PENDIENTE DE DEFINICIÓN` **P-08**, registrada desde la ETAPA
> 00 y con dueño Grupo Control. El documento de requisitos §13.2 sugería
> _«Railway o Fly.io»_ y `CLAUDE.md` §2.6 fija el stack completo **sin**
> mencionar plataforma, así que aquí no se elige una.
>
> Lo que esta guía hace es separar lo que **no depende** de esa decisión —que es
> casi todo— de lo que sí, y decir exactamente qué párrafos habrá que escribir
> cuando se decida. Inventar una plataforma habría producido una guía que parece
> completa y no se puede seguir.

---

## Índice

1. [Qué se despliega, y qué NO](#1--qué-se-despliega-y-qué-no)
2. [Orden de despliegue, y por qué ese orden](#2--orden-de-despliegue-y-por-qué-ese-orden)
3. [Base de datos: migraciones y semillas](#3--base-de-datos-migraciones-y-semillas)
4. [La API](#4--la-api)
5. [El planificador de trabajos](#5--el-planificador-de-trabajos)
6. [La consola web y la PWA](#6--la-consola-web-y-la-pwa)
7. [La aplicación de escritorio](#7--la-aplicación-de-escritorio)
8. [La app del residente](#8--la-app-del-residente)
9. [El Edge Gateway](#9--el-edge-gateway)
10. [Observabilidad: qué mirar y dónde](#10--observabilidad-qué-mirar-y-dónde)
11. [Verificación posterior al despliegue](#11--verificación-posterior-al-despliegue)
12. [Reversión](#12--reversión)
13. [Lo que falta cuando P-08 se decida](#13--lo-que-falta-cuando-p-08-se-decida)

---

## 1 · Qué se despliega, y qué NO

Del repositorio salen **seis entregables**. El trabajo `entregables` del flujo
de CI los produce todos en cada corrida; si uno no compila, el flujo se pone en
rojo antes de que nadie despliegue nada.

| Entregable            | Artefacto                                | Dónde vive                                    |
| --------------------- | ---------------------------------------- | --------------------------------------------- |
| API (NestJS)          | `apps/api/dist/main.js` + `node_modules` | Servidor o contenedor · **P-08**              |
| Consola web (Next.js) | `apps/web/.next`                         | Servidor Node o plataforma de Next · **P-08** |
| PWA instalable        | La misma consola, con manifiesto y SW    | No se despliega aparte: **es** la consola     |
| Escritorio (Tauri)    | `.deb`, `.msi`, `.dmg`                   | Se distribuye a los puestos, no se despliega  |
| App del residente     | Flutter (iOS/Android)                    | Tiendas · **fuera del alcance** del reto      |
| Edge Gateway          | `apps/edge/dist`                         | Equipo en la copropiedad · guía propia        |

**Lo que NO se despliega desde aquí:** el esquema de Supabase (§3 tiene su
procedimiento y su guía propia), los dispositivos Hikvision (ETAPA 15) y la
publicación en tiendas, que el alcance del reto excluye explícitamente.

---

## 2 · Orden de despliegue, y por qué ese orden

El orden importa y no es arbitrario. Cada paso deja lista una precondición del
siguiente, y saltarse uno produce un fallo que **no apunta a su causa**.

```
1. Migraciones de Supabase        → el esquema que la API espera
2. Variables de entorno           → sin ellas la API no arranca (§2.7.1)
3. API                            → /health y /ready antes de dar tráfico
4. Consola web                    → necesita la API en pie para su contrato
5. Edge Gateway                   → necesita API y credencial de servicio
6. Escritorio y app               → se distribuyen cuando la consola responde
```

**Por qué las migraciones primero y no a la vez.** La API valida su
configuración y comprueba sus recursos externos al arrancar (`comprobarRecursosExternos`).
Si el esquema no está, el fallo aparece en la primera consulta de negocio —un
listado de viviendas— y el mensaje habla de una tabla, no de un despliegue a
medias.

**Por qué la consola después de la API.** El cliente de la consola se **genera**
desde el contrato OpenAPI. Un despliegue en el que la consola es más nueva que
la API le pide rutas que todavía no existen, y el síntoma es un 404 en una
pantalla concreta, no un error de despliegue.

---

## 3 · Base de datos: migraciones y semillas

El procedimiento completo —llaves, JWKS, buckets, MFA, rotación— está en
[`CONEXION_SUPABASE.md`](CONEXION_SUPABASE.md). Aquí solo el orden de un
despliegue:

```bash
# 1 · Migraciones, en orden y de forma idempotente
supabase link --project-ref <ref-del-proyecto>
supabase db push

# 2 · Comprobación de que RLS quedó ACTIVA y FORZADA en todas las tablas
./supabase/verificar.sh --modo-supabase

# 3 · Semillas SOLO en entornos que no sean producción
./supabase/verificar.sh --con-semillas --modo-supabase
```

> **Las semillas no van a producción.** Crean una copropiedad ficticia con
> usuarios de ejemplo. En producción el primer superadministrador se crea con el
> procedimiento de arranque en frío de la migración `0025`, documentado en
> [`RECUPERACION_Y_USUARIOS.md`](RECUPERACION_Y_USUARIOS.md).

**Después de migrar, compruebe la inmutabilidad.** La migración `0031` incluye
una aserción de despliegue que falla si alguien revirtió cualquiera de las
cuatro capas de ADR-005 —revocación al dueño, disparadores, RLS forzada,
ausencia de política de `UPDATE`—. Ejecutarla es parte del despliegue, no una
comprobación opcional: el día que una de las cuatro se caiga, el histórico deja
de ser inmutable y nada más lo avisa.

---

## 4 · La API

### 4.1 · Construcción

```bash
pnpm install --frozen-lockfile
pnpm build                    # compila packages, API, consola y Edge
node apps/api/dist/main.js    # arranque
```

`--frozen-lockfile` no es una preferencia: una dependencia instalada a mano y no
declarada pasa inadvertida sin él, y ese es uno de los falsos verdes que §2.8.0
del contrato enumera.

### 4.2 · Variables de entorno

Están **todas** en `apps/api/.env.example`, con su descripción y sin un solo
valor. La regla de §2.7.1 se cumple literalmente: **si falta una, el proceso no
arranca**, muere con código `78` (`EX_CONFIG`) y un mensaje que nombra la
variable. No hay valores por defecto para secretos ni para orígenes admitidos.

Las que más se equivocan al desplegar:

| Variable                | Error frecuente                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `CORS_ALLOWED_ORIGINS`  | Dejar el `http://localhost:3001` del ejemplo. Con `NODE_ENV=production` el arranque lo **rechaza**    |
| `SUPABASE_SECRET_KEY`   | Ponerla en la consola. **Omite RLS**: solo servidor, nunca en un `NEXT_PUBLIC_*`, nunca en el binario |
| `INGESTA_FIRMA_SECRETO` | Menos de 32 caracteres, o partido por un `.env` sin salto de línea final. El arranque detecta las dos |
| `DATABASE_POOLER_URL`   | Apuntar a la conexión directa. El pooler es lo que sostiene el tope de `PG_POOL_MAX`                  |
| `SENTRY_DSN`            | Dejarla a medias. Vacía es legítimo —no hay agregador—; **mal formada impide arrancar**               |

Compruebe que su `.env` y el ejemplo no han divergido:

```bash
pnpm entorno:diff        # qué variables le faltan o le sobran
pnpm entorno             # las valida con el MISMO esquema que usa el arranque
```

### 4.3 · `/health` y `/ready`, que no son lo mismo

| Ruta      | Responde                 | Para qué sirve                                    |
| --------- | ------------------------ | ------------------------------------------------- |
| `/health` | El proceso está vivo     | Reinicio: si no responde, el proceso está colgado |
| `/ready`  | Además, la base contesta | **Tráfico**: solo entra cuando esto responde 200  |

Configure el comprobante de vivacidad contra `/health` y el de disponibilidad
contra `/ready`. Al revés —vivacidad contra `/ready`— una caída momentánea de la
base reiniciaría la API en bucle, que es exactamente lo contrario de lo que se
quiere.

### 4.4 · Más de una instancia

La API es un monolito modular **sin estado de sesión en memoria**: escalar
horizontalmente es correcto. Dos avisos:

- **`PG_POOL_MAX` se multiplica por instancia.** Tres instancias con `20` son
  sesenta conexiones contra el tope del proyecto Supabase. Divida.
- **El canal de tiempo real es por proceso (D-29).** Un operador conectado a la
  instancia B no ve lo que publica la A. Con más de una instancia hace falta el
  peldaño siguiente de la escalera de contingencia (`LISTEN/NOTIFY`), que está
  registrado y **no construido**. Hasta entonces: una sola instancia, o un
  balanceador con afinidad de sesión para el canal.
- **El tablero de latencias también es por proceso**, y lo dice en su propia
  respuesta (`porProceso: true`). No sume las cifras de dos instancias a ojo.

---

## 5 · El planificador de trabajos

La API ejecuta tres barridos con **pg-boss**, sobre la misma base:

| Trabajo                 | Cada  | Qué hace                                                           |
| ----------------------- | ----- | ------------------------------------------------------------------ |
| `ncr.vigilar-latidos`   | 5 min | Marca caída la terminal que dejó de latir y abre su alerta (CA-26) |
| `ncr.reiniciar-aforos`  | 1 h   | Persiste el reinicio por cierre de jornada (D-36)                  |
| `ncr.barrer-plantillas` | 6 h   | Suprime la plantilla biométrica vencida — **RN-11 da 24 h**        |

**Con varias instancias puede dejarlo encendido en todas.** pg-boss toma el
cerrojo en PostgreSQL y solo una ejecuta cada disparo. `PLANIFICADOR_HABILITADO=false`
existe para dedicar un proceso a servir HTTP y otro a los barridos, que es lo
que se quiere cuando el barrido de plantillas habla con terminales lentas.

> **Si lo apaga en todas partes, RN-11 deja de cumplirse.** El proceso lo
> escribe en el registro al arrancar —«trabajo programado NO se ejecutará», con
> el motivo— precisamente para que eso no pase en silencio. Busque esa línea
> después de cada despliegue.

Comprobación rápida después de desplegar:

```bash
# Los tres trabajos dados de alta, con su cron:
#   {"nivel":"info","mensaje":"trabajo programado dado de alta","contexto":{"trabajo":"ncr.barrer-plantillas",...}}
grep 'trabajo programado dado de alta' <registro-de-la-api>
```

---

## 6 · La consola web y la PWA

```bash
pnpm --filter @ncr/web build
pnpm --filter @ncr/web start      # servidor Node en el puerto 3100
```

La consola es **renderizada en servidor** (`force-dynamic` en las páginas que
leen sesión): no hay exportación estática y no se puede servir desde un bucket.

### La PWA no se despliega aparte

El manifiesto, los iconos y el service worker son ficheros estáticos de
`apps/web/public`. Lo que sí hay que cuidar en el despliegue:

1. **HTTPS obligatorio.** Sin contexto seguro el navegador no registra el
   service worker y no ofrece instalar. `localhost` es la única excepción, y por
   eso una prueba que solo mire el bucle local no ejerce esto
   ([`CONSOLA_EN_RED_Y_DESPLIEGUE.md`](CONSOLA_EN_RED_Y_DESPLIEGUE.md)).
2. **`/sw.js` se sirve desde la raíz**, no desde una subruta: el alcance de un
   service worker no sube de directorio.
3. **No cachee `/sw.js` en el proxy.** Un service worker viejo servido desde una
   caché intermedia sobrevive a los despliegues y sirve una consola anterior.
4. Verifique la instalabilidad **antes** de anunciarla: `pnpm pwa`. El control
   comprueba el manifiesto, los iconos reales y la exclusión de `/api/` de la
   caché. Una PWA no instalable no da ningún error: el navegador simplemente no
   ofrece instalarla.

---

## 7 · La aplicación de escritorio

Tauri (ADR-002). **No se despliega: se distribuye.**

```bash
# Los orígenes admitidos se COMPILAN dentro del binario
NCR_ORIGENES_ESCRITORIO="https://consola.sudominio.co" \
  pnpm --filter @ncr/web exec tauri build
```

- El empaquetado produce `.deb` en Linux, `.msi` en Windows y `.dmg` en macOS, y
  **cada uno hay que construirlo en su sistema**. El CI construye el `.deb`.
- **La política de red va dentro del binario a propósito.** Un fichero de
  configuración junto al ejecutable lo puede editar quien tenga el equipo, y con
  ello redirigir la ventana que lleva la sesión del operador a un servidor suyo.
  Cambiar los orígenes exige recompilar y volver a firmar.
- **Actualizaciones firmadas: el complemento está cableado y la firma está
  APAGADA hasta que exista la clave.** Y no por comodidad: la primera corrida de
  CI lo demostró. Con el actualizador activo, Tauri empaqueta el `.deb`
  correctamente y **después falla**:

  ```
  Bundling Next Control Residencial_0.1.0_amd64.deb … Finished 1 bundle at: …
  Error A public key has been found, but no private key.
        Make sure to set `TAURI_SIGNING_PRIVATE_KEY` environment variable.
  ```

  Es la respuesta correcta del empaquetador: **un artefacto de actualización sin
  firmar no sirve de nada**, y declarar el actualizador sin tener la clave deja
  una promesa que no se puede cumplir. Así que hoy
  `bundle.createUpdaterArtifacts` y `plugins.updater.active` están en `false`, y
  `pubkey` está vacía en vez de llevar un marcador que el actualizador
  rechazaría en ejecución.

  **Para activarlas** (D-122), en este orden:

  1. `pnpm --filter @ncr/web exec tauri signer generate -w ~/.ncr/actualizacion.key`
  2. Publique la **pública** en `tauri.conf.json` → `plugins.updater.pubkey`, y
     ponga `active: true` y `bundle.createUpdaterArtifacts: true`.
  3. Guarde la **privada** en el gestor de secretos de Grupo Control —nunca en
     el repositorio— y expóngala al empaquetado como `TAURI_SIGNING_PRIVATE_KEY`.
  4. Apunte `plugins.updater.endpoints` al servidor de actualizaciones real: hoy
     es `actualizaciones.ejemplo.invalid`, que no existe a propósito.

  Hasta entonces el binario funciona y **no se actualiza solo**, que es el
  comportamiento conservador correcto: nadie instala nada que no venga firmado.

---

## 8 · La app del residente

Fuera del alcance del reto en lo que toca a tiendas. Lo que sí aplica al
desplegar el resto:

- `API_URL` y la **llave publicable** se compilan en el binario. Todo lo
  compilado en Flutter es extraíble: la llave secreta **jamás**. El arranque de
  la app rechaza una llave con forma de secreta, y una prueba lo verifica.
- Cambiar el dominio de la API obliga a **volver a publicar** la app. Tenga eso
  en cuenta antes de elegir el dominio en P-08.
- `API_URL` **no tiene valor por omisión**. Sin ella la app arranca en una
  pantalla que lo dice y que enseña la línea que faltó, en vez de fallar con
  «sin conexión»: en un teléfono físico `localhost` es el propio teléfono.

### 8.1 · Probar en un iPhone físico contra la API que corre en el Mac

```
flutter run -d <id-del-iPhone> \
  --dart-define=API_URL=http://<IP-del-Mac>:3000 \
  --dart-define=SUPABASE_URL=https://<ref>.supabase.co \
  --dart-define=SUPABASE_PUBLISHABLE_KEY=<sb_publishable_…>
```

`<id-del-iPhone>` sale de `flutter devices`; `<IP-del-Mac>` es la dirección del
Mac en la red local (`ipconfig getifaddr en0`). En el emulador Android, en su
lugar, va el alias de la máquina anfitriona que trae `apps/mobile/.env.example`.

- **El Mac y el iPhone en la misma red.** El teléfono alcanza la API por la IP
  privada del Mac; desde datos móviles o desde otra red no hay ruta.
- **La API ya escucha en todas las interfaces.** `app.listen(PORT)` sin host
  (`apps/api/src/main.ts`) enlaza `0.0.0.0` / `::`, no sólo `localhost`; lo
  único que puede estorbar es el cortafuegos de macOS, que pide permiso para
  `node` la primera vez.
- **`CORS_ALLOWED_ORIGINS` no aplica a la app nativa.** CORS lo impone el
  navegador; la app no envía cabecera `Origin` y la API acepta las peticiones
  sin ella (`apps/api/src/seguridad.ts`). No añada la IP del teléfono a esa
  lista: no haría nada.
- **HTTP por IP privada sólo en depuración (iOS).** App Transport Security lo
  bloquea; la excepción `NSAllowsLocalNetworking` —nunca
  `NSAllowsArbitraryLoads`— sólo existe en la configuración Debug, porque
  `Info.plist` se preprocesa y el bloque está bajo `#if NCR_DEPURACION`, que
  define `ios/Flutter/Debug.xcconfig` y no `Release.xcconfig`. Un binario de
  Release no lleva la excepción y sólo habla HTTPS.
- **Ningún secreto va en el binario.** Todo `--dart-define` es extraíble del
  `.ipa` con `strings`; por eso sólo viajan la URL de la API, la de Supabase y
  la llave **publicable**. El paso 5d del verificador
  (`scripts/lib/flutter-sin-secretos.mjs`) falla si el código de la app nombra
  una variable prohibida o contiene una llave con forma de secreta, y la app
  misma rechaza arrancar con una `sb_secret_…`.

---

## 9 · El Edge Gateway

Tiene guía propia y es la que manda:
[`DESPLIEGUE_EDGE.md`](DESPLIEGUE_EDGE.md) —aprovisionamiento, identidad de
servicio, rotación de credenciales, sincronización de reloj y actualización
remota—.

Lo único que este documento añade: el Edge usa la **llave secreta**, no un token
de usuario, así que la expiración de cinco minutos de los tokens de Supabase no
le afecta; y su reintento usa retroceso exponencial con dispersión para no
chocar con el limitador de peticiones de la API (§2.7.5).

---

## 10 · Observabilidad: qué mirar y dónde

### Registros

Una línea JSON por evento, con **el identificador de correlación en todas**:

```json
{
  "nivel": "aviso",
  "mensaje": "peticion fallida",
  "momento": "2026-09-22T16:26:39.315Z",
  "correlacion": "f7e4137f-2031-4986-9312-4f8a5414e51a",
  "peticion": "GET /copropiedades/…/tablero/indicadores",
  "contexto": { "metodo": "GET", "estado": 401, "error": "No autenticado" }
}
```

El mismo identificador viaja en la cabecera `x-request-id` de la respuesta. Un
usuario que reporta un fallo puede darle ese número y usted filtra el registro
entero por él. Si la consola o el Edge envían su propio `x-request-id`, se
respeta y la traza atraviesa las tres piezas.

`LOG_LEVEL` fija el mínimo que se escribe: `debug | info | aviso | error`. En
producción, `info`.

### Errores

Con `SENTRY_DSN`, la API reporta **solo los 5xx**. Un 400 o un 403 no son fallos
del sistema: son el sistema funcionando, y mandarlos al agregador convertiría el
panel en un registro de accesos. El contexto pasa por la misma redacción que los
registros antes de salir: Sentry es un tercero.

### Latencias comprometidas

`GET /observabilidad/latencias`, y la pantalla **Latencias** de la consola, para
roles administrativos y la central. Devuelve p50, p95 y p99 de los cinco
indicadores con umbral del proyecto:

| Indicador | Techo     | Qué mide                                            |
| --------- | --------- | --------------------------------------------------- |
| KPI-09    | 5 000 ms  | Autorización creada → disponible en el motor        |
| KPI-13    | 3 000 ms  | Ingesta de un evento de hardware, tramo de servidor |
| KPI-25    | 10 000 ms | Evento crítico → notificación al operador           |
| KPI-32    | 3 000 ms  | Acción del operador → accionamiento remoto          |
| KPI-33    | 2 000 ms  | Establecimiento del canal de intercom               |

**Cada fila publica el tramo que mide y lo que NO mide, y se leen juntos.** Una
cifra de latencia sin su tramo no demuestra nada. Los dos extremos físicos
—cámara y relé— los mide la ETAPA 15 con el equipo delante.

`cumple: null` significa **sin muestras**, que no es lo mismo que cumplir.

---

## 11 · Verificación posterior al despliegue

En este orden, y ninguno es opcional:

```bash
# 1 · El proceso está vivo y la base contesta
curl -fsS https://api.sudominio.co/health && echo OK
curl -fsS https://api.sudominio.co/ready  && echo OK

# 2 · CORS rechaza un origen ajeno (§2.7.2)
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Origin: https://ajeno.invalid' https://api.sudominio.co/health
#   se espera que NO aparezca Access-Control-Allow-Origin en la respuesta

# 3 · Las cabeceras de seguridad están puestas (§2.7.7)
curl -sI https://api.sudominio.co/health | grep -Ei 'strict-transport|x-content-type|referrer-policy'

# 4 · Ninguna ruta protegida contesta sin token
curl -s -o /dev/null -w '%{http_code}\n' https://api.sudominio.co/copropiedades
#   se espera 401

# 5 · Los tres trabajos programados están dados de alta
grep 'trabajo programado dado de alta' <registro> | wc -l    # se esperan 3

# 6 · La consola instala
pnpm pwa
```

El aislamiento multiempresa **no se comprueba a mano**: lo recorre la suite
`aislamiento.e2e.test.ts` por los dos caminos —token de usuario e identidad de
servicio— sobre **todos** los endpoints del enrutador, y rompe el build ante
cualquier fuga. Si esa suite está verde en la SHA desplegada, está comprobado.

---

## 12 · Reversión

1. **La API y la consola se revierten desplegando la versión anterior.** No
   tienen estado propio.
2. **Las migraciones no se revierten en caliente.** Son idempotentes y
   versionadas, pero `eventos` es append-only y una reversión de esquema por
   debajo de una tabla inmutable no es una operación segura. Si una migración
   rompió algo, la salida es **avanzar** con una migración correctiva.
3. **Antes de revertir la API, apague el planificador** en la versión que se
   retira (`PLANIFICADOR_HABILITADO=false`) o deténgala del todo: dos versiones
   distintas barriendo la misma base a la vez no es un estado que nadie haya
   probado.
4. **El escritorio se revierte publicando el instalador anterior**, no borrando
   el nuevo: los equipos ya actualizados no vuelven solos.

---

## 13 · Lo que falta cuando P-08 se decida

Cuando Grupo Control elija plataforma, esta guía necesita **exactamente** estas
cuatro secciones, y ni una más. Se dejan enumeradas para que la decisión llegue
con su lista de deberes:

| §        | Sección que habrá que escribir | Qué tiene que contener                                                                                           |
| -------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **13.1** | Aprovisionamiento              | Cuenta **corporativa** de Grupo Control —nunca personal, PDF del reto §8—, región, plan y tope de conexiones     |
| **13.2** | Despliegue continuo desde CI   | Qué dispara el despliegue, con qué credencial, y cómo se guarda esa credencial fuera del repositorio             |
| **13.3** | Secretos en la plataforma      | Dónde se cargan las variables de `.env.example`, quién puede leerlas, y el procedimiento de rotación de cada una |
| **13.4** | Dominio, TLS y proxy inverso   | Dominio de API y consola, emisión y renovación del certificado, y las cabeceras que el proxy debe propagar       |

**Lo que la decisión NO cambia:** nada de las secciones 3 a 12. El sistema es un
proceso Node con variables de entorno y una base PostgreSQL gestionada; eso es
cierto en un contenedor, en una máquina y en cualquiera de las dos plataformas
que el documento de requisitos sugería.

**Dos requisitos que valen sea cual sea la elección**, y conviene comprobarlos
al decidir:

- La cuenta y el dominio van bajo **cuentas corporativas de Grupo Control**
  (PDF del reto §8, y §1 del contrato). Nunca personales.
- La plataforma tiene que admitir **un proceso de larga vida**, no solo
  funciones efímeras: el planificador de pg-boss y el canal de tiempo real
  necesitan que el proceso siga en pie entre peticiones.
