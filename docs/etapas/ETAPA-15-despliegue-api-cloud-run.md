# Ronda `etapa-15-despliegue-api-cloud-run` · la API en Cloud Run con dos modos (PR 1 de 3)

**Fecha:** 2026-11-06 · **Rama:** `etapa-15-despliegue-api-cloud-run` desde `develop` (`ef9c409`) ·
**Decisiones del cliente:** D-154 a D-159 (E-11) ·
**ADR:** [ADR-040](../decisiones/ADR-040-la-api-en-cloud-run-con-dos-modos.md)

## 0 · Antes de empezar: la combinación fusionada

Los seis PR de la tanda anterior (D-148 a D-153) se fusionaron en `develop` el
2026-10-31 sin que nadie verificara la combinación. Antes de escribir una línea:

- `develop` en `ef9c409`, sin commits posteriores;
- `./scripts/verificar-etapa.sh --con-base` sobre `develop`, en Linux, con Node
  22.23.4: **«VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO
  EJERCIDO(S) — se puede escribir el informe»**. El declarado es el de siempre:
  las 5 pruebas de arranque en frío que ejecuta el paso 12b;
- la CI del push a `develop` (corrida 685), en verde.

## 1 · Qué se construyó

La API ya se puede publicar en Cloud Run desde GitHub Actions, en dos modos que
se eligen al lanzar el despliegue. **Prelanzamiento**: facturación por
solicitud y mínimo 0, para que sin clientes cueste casi nada. **Producción**:
por instancia y mínimo 1, para cuando haya un conjunto conectado.

Hay una imagen de contenedor de la API, construida con el Node exacto de
`.nvmrc` y sólo las dependencias de producción del lockfile. Corre sin root y
sin poder reescribir su propio código. Hay un flujo de despliegue que sólo se
lanza a mano, con aprobación y sin llaves guardadas. Y hay una guía para que
Argenis prepare el proyecto de Google Cloud desde Cloud Shell, paso a paso y
con lo que debe ver tras cada comando.

En la API cambian dos cosas del arranque:

- **El cierre ordenado** tiene ahora un plazo de 8 s, por debajo del SIGKILL
  de Cloud Run.
- **`API_PROXIES_DE_CONFIANZA`** admite un número de saltos: detrás del
  frontal de Google, el límite de peticiones ve la IP real y no se deja engañar
  por una `X-Forwarded-For` falseada.

Nada del dominio ni de la capa de aplicación.

## 2 · Cómo se organizó y por qué

**La versión de Node vive en un solo sitio.** El Dockerfile recibe
`NODE_VERSION` sin valor por omisión: sin él, `FROM node:-alpine` no existe y la
construcción falla en la primera línea. Además compara `node -v` con `.nvmrc`
antes de instalar. Una segunda copia del número, aquí, sería la que envejece.

**`pnpm deploy` no, y por una medida.** La primera versión lo usaba, y en pnpm
9 resolvió de nuevo las dependencias en vez de leer el lockfile: pidió
metadatos de versiones que el lockfile no fija. Una imagen que no instala lo
que dice el lockfile no es reproducible. La etapa de producción instala con
`--frozen-lockfile --prod` sobre la misma estructura del monorepo, desde el
almacén ya descargado (`--offline`).

**Alpine, y medido.** La meta de D-154 era menos de 250 MB. Con
`node:22.23.4-alpine` la imagen ocupa 230 MB sin comprimir y 74 MB comprimida,
que es lo que guarda y cobra Artifact Registry. Borrar npm y corepack en la
etapa final no ahorra bytes, porque siguen en la capa base. Se borran por
superficie: en ejecución no existen.

**El código es de root y el proceso es `node`.** La primera imagen copiaba con
`--chown=node:node`, y el control nuevo lo detectó: el proceso podía reescribir
`dist/main.js`. Ahora no puede, y el control lo comprueba en cada PR.

**`.dockerignore` en lista blanca.** Se excluye todo y se deja pasar lo que se
compila. Al final se vuelve a excluir lo que la consigna pide —`.env*`, `*.pem`,
`*.key`, `service-account*.json`, `coverage`, `.git`— aunque esté dentro de lo
permitido. Una lista negra deja entrar por omisión lo que nadie pensó en
excluir.

**`API_PROXIES_DE_CONFIANZA=1`, un número y no una lista.** Cloud Run no
documenta desde qué dirección llega su frontal al contenedor. Lo que sí
documenta Google, para sus balanceadores, es que se AÑADE la IP del cliente a
`X-Forwarded-For`. Una lista de IP o CIDR obligaría a suponer la dirección del
frontal. Un salto no: Express toma la última entrada, y nadie puede escribir a
la derecha de lo que añade el último salto. Con `loopback` —el valor de sitio—
la API no creería la cabecera y todos los clientes caerían en el cubo del
frontal. La prueba negativa demuestra lo contrario: con un salto de más, una IP
inventada escapa del límite.

**El plazo del cierre baja de 10 a 8 s.** Cloud Run manda SIGKILL «10 segundos»
después de SIGTERM (contrato de contenedor). Con 10, el vigilante y el SIGKILL
llegaban a la vez, y la única línea que explica un cierre colgado podía no
escribirse. En 8 sigue cabiendo la parada de pg-boss (6 s), y una prueba ata
las dos cifras.

**La configuración de Cloud Run sale del repositorio, sin valores.**
`apps/api/cloud-run/variables.yaml` tiene los nombres y marcadores `${NCR_…}`
que el flujo sustituye con las variables de GitHub. `secretos.txt` tiene, de
cada variable secreta, el nombre de su secreto en Secret Manager.
`scripts/lib/despliegue-cloud-run.mjs` falla en tres casos:

- un marcador sin valor;
- un nombre que `.env.example` no declara;
- una variable secreta puesta como normal.

Una prueba carga el resultado con el esquema REAL de la API y comprueba que
arranca.

**Seis secretos, y no por casualidad.** Son los que la API exige para arrancar,
y seis es lo que Secret Manager da gratis. Sale así porque `DATABASE_URL` sólo
la usa pg-boss, y en Cloud Run va al pooler en modo sesión. La conexión directa
de Supabase sólo resuelve por IPv6, así que no hace falta una séptima variable
`PGBOSS_DATABASE_URL`. Los siguientes secretos entran con su PR: la firma de la
IP en la PR 2, Web Push con el primer conjunto.

**El flujo, cerrado por cuatro lados.**

- Sólo `workflow_dispatch`, sin `pull_request`.
- Environment «nube», con revisor obligatorio y sólo `develop` y `main`.
- Una condición `if:` en el trabajo que repite la de las ramas.
- Workload Identity Federation, cuyo proveedor acepta sólo tokens de ESTE
  repositorio por `repository_id`, de esas ramas y de ese environment. Los
  nombres se pueden volver a registrar; los números no se reutilizan.

No hay llave JSON, y la política de la organización que las prohíbe se queda
activa.

**Las banderas, contrastadas con la documentación, no supuestas.** Se leyeron
las páginas oficiales de Cloud Run: contrato de contenedor, facturación,
acceso, sondas, WebSockets, tiempos de espera y concurrencia. También las de
IAM, Workload Identity Federation y Artifact Registry. Además, el analizador de
`gcloud` aceptó la orden completa de los dos modos (SDK 570).

- **`--no-invoker-iam-check`** es «la forma recomendada» de un servicio
  público cuando rige la restricción de dominios.
- **`--cpu-throttling` y `--no-cpu-throttling`** son las banderas de la
  facturación por solicitud y por instancia.
- **El modo prelanzamiento no lleva sonda de vivacidad**, porque «todas las
  sondas se facturan».
- **La única restricción que bloquearía el despliegue** es
  `run.managed.requireInvokerIam`, que no viene activa por defecto. La guía
  dice cómo comprobarla y qué hacer si aparece.

**Una comprobación de la imagen, en cada PR y antes de cada publicación.**
`scripts/lib/imagen-de-la-api.mjs` comprueba cuatro cosas sobre la imagen ya
construida:

- el Node es el de `.nvmrc`;
- el proceso no corre como root y no puede reescribir su código;
- no hay `.env`, llaves ni credenciales dentro;
- pesa menos de 250 MB.

Lo usan el trabajo nuevo `imagen-de-la-api` de la verificación y el flujo de
despliegue. Sin él, un Dockerfile roto sólo se descubriría el día de desplegar.

**ADR nuevo, sin reescribir los anteriores.** ADR-040 dice que el «servidor con
procesos permanentes» de ADR-028 es Cloud Run, y que la «API en Cloud Run» de
ADR-035 es una instancia con dos modos. Los dos ADR anteriores quedan como
estaban.

## 3 · Árbol de archivos

| Archivo                                                          | Propósito                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/api/Dockerfile` (nuevo)                                    | La imagen: construcción, producción del lockfile, ejecución sin root            |
| `.dockerignore` (nuevo)                                          | El contexto en lista blanca                                                     |
| `apps/api/cloud-run/variables.yaml` (nuevo)                      | Las variables no secretas, con marcadores `${NCR_…}`                            |
| `apps/api/cloud-run/secretos.txt` (nuevo)                        | Variable → nombre del secreto en Secret Manager                                 |
| `apps/api/cloud-run/limpieza-artifact-registry.json` (nuevo)     | Conservar las 2 últimas imágenes                                                |
| `.github/workflows/desplegar-api.yml` (nuevo)                    | El despliegue, a mano, con WIF y los dos modos                                  |
| `.github/workflows/verificacion.yml`                             | Trabajo `imagen-de-la-api`                                                      |
| `scripts/lib/despliegue-cloud-run.mjs` y `.d.mts` (nuevos)       | Variables y secretos de Cloud Run, comprobados contra `.env.example`            |
| `scripts/lib/imagen-de-la-api.mjs` y `.d.mts` (nuevos)           | Node, usuario, secretos y tamaño de la imagen                                   |
| `apps/api/src/arranque/cierre-ordenado.ts`                       | Plazo 8 s                                                                       |
| `apps/api/src/configuracion/esquema.ts`                          | `API_PROXIES_DE_CONFIANZA` admite 1 a 3 saltos (`SALTOS_DE_PROXY`)              |
| `apps/api/src/seguridad.ts`                                      | `trust proxy` numérico cuando es un número                                      |
| `apps/api/src/planificacion/index.ts`                            | Exporta `PLAZO_DE_PARADA_MS` (lo usa la prueba del plazo)                       |
| `apps/api/.env.example`                                          | El comentario de `API_PROXIES_DE_CONFIANZA`                                     |
| `apps/api/src/arranque/cierre-ordenado.test.ts`                  | El plazo cabe entre SIGTERM y SIGKILL y contiene la parada de pg-boss           |
| `apps/api/test/apagado-con-conexiones-vivas.e2e.test.ts` (nuevo) | SIGTERM con túnel y SSE abiertos                                                |
| `apps/api/test/proxies-de-cloud-run.e2e.test.ts` (nuevo)         | El límite con la IP real, la cabecera falseada, un salto de más y la validación |
| `apps/api/test/despliegue-cloud-run.test.ts` (nuevo)             | Los ficheros de Cloud Run y que lo que resulta arranca la API                   |
| `apps/api/test/imagen-de-la-api.test.ts` (nuevo)                 | Cada juicio de la comprobación de la imagen, y la imagen buena                  |
| `docs/guias/DESPLIEGUE_CLOUD_RUN.md` (nuevo)                     | La guía de Cloud Shell, los costos y lo medido                                  |
| `docs/decisiones/ADR-040-…` (nuevo) y `README.md`                | La decisión                                                                     |
| `docs/guias/DESPLIEGUE.md`                                       | §13 apunta a la guía; §4.4 con el modo; `npx` y `--remote`                      |
| `docs/guias/CONSOLA_EN_RED_Y_DESPLIEGUE.md`                      | §7.4 con el modo; `API_PROXIES_DE_CONFIANZA=1`                                  |
| `docs/guias/CONEXION_SUPABASE.md`                                | `npx supabase` y `--remote` en `migration list` y `db push`                     |
| `docs/auditoria/contradicciones-y-supuestos.md`                  | C-69, E-11, P-43 a P-46, S-154-01 a -04, S-159                                  |
| `docs/ESTADO_ETAPAS.md`                                          | Cabecera, filas y esta ronda                                                    |

## 4 · Tabla SOLID (archivos nuevos)

| Archivo                    | SRP                                                    | OCP                                                      | LSP                                                     | ISP                                          | DIP                                                            |
| -------------------------- | ------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| `despliegue-cloud-run.mjs` | Sólo prepara y comprueba la configuración de Cloud Run | Una variable nueva es una línea en un fichero, no código | N/A (sin jerarquías)                                    | Funciones puras pequeñas, exportadas sueltas | Lee ficheros por ruta; `sustituir` recibe el entorno inyectado |
| `imagen-de-la-api.mjs`     | Sólo juzga la imagen                                   | Un juicio nuevo es una línea en `juzgar`                 | N/A                                                     | `juzgar` es pura; la medición, aparte        | `juzgar` no conoce docker: recibe lo medido                    |
| `Dockerfile`               | Tres etapas, una responsabilidad cada una              | Otra app tendría su Dockerfile; éste no se toca          | N/A                                                     | N/A                                          | La versión de Node llega por argumento, de `.nvmrc`            |
| `desplegar-api.yml`        | Sólo despliega; la verificación de la imagen la delega | Un modo nuevo sería otra rama del `if`                   | N/A                                                     | N/A                                          | Proyecto, región y cuentas llegan por `vars`                   |
| Pruebas nuevas (4)         | Una preocupación por fichero                           | —                                                        | La app real de la suite (`crearApp`), sin dobles nuevos | —                                            | Configuración inyectada por `crearApp`                         |

Los tres archivos de código de la API que se tocan no ganan responsabilidades:
una constante, una rama en la validación y otra en `trust proxy`.

## 5 · Trazabilidad

| Elemento                  | Cobertura                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| §2.7.1                    | Secretos sólo en Secret Manager; ningún valor real en el repositorio; la imagen nunca lee `.env` (`NCR_IGNORAR_ENV_FILE=1`) |
| §2.7.5                    | Rate limiting por IP real detrás del frontal (`proxies-de-cloud-run.e2e.test.ts`)                                           |
| §2.6                      | CI/CD con GitHub Actions: despliegue de la API                                                                              |
| RN-11                     | **Parcial**: garantizada en producción; en prelanzamiento, P-44 con la regla de no cargar biometría de terceros             |
| KPI-28 a KPI-31           | Sin cambio: el Edge sigue siendo el de ADR-035; en prelanzamiento no hay Edge conectado                                     |
| ETAPA 14 (entregabilidad) | La API, además, como imagen construida en cada PR                                                                           |

## 6 · Pruebas

**Nuevas o cambiadas** (todas pasan; ejecución: `pnpm --filter @ncr/api exec vitest run <fichero>`):

- `apagado-con-conexiones-vivas.e2e.test.ts` (1): SIGTERM con un túnel de Edge
  y un SSE abiertos. El túnel cierra con 1001, el SSE termina y la salida es 0
  dentro del plazo. **Prueba negativa**: sin el cierre del túnel, la prueba
  falla, porque el túnel acaba en 1008 cuando vence la espera del «hola».
- `proxies-de-cloud-run.e2e.test.ts` (14):
  - con `1`, el cliente agota su límite aunque invente IPs a la izquierda;
  - otro cliente tiene su cubo;
  - con `2`, la cabecera falsa escapa del límite (negativa);
  - el valor se valida al arrancar.
- `despliegue-cloud-run.test.ts` (8): los ficheros reales cuadran, lo que
  resulta arranca la configuración real de la API, y cada rechazo se nombra.
- `imagen-de-la-api.test.ts` (9): cada juicio, y la imagen buena.
- `cierre-ordenado.test.ts` (+1): el plazo entre la parada de pg-boss (6 s) y
  el SIGKILL de Cloud Run (10 s).

**La imagen, medida** (Docker 29, 1 vCPU y 512 MiB, contra PostgreSQL local y
el doble de GoTrue; detalle en `DESPLIEGUE_CLOUD_RUN.md` §15):

- **Tamaño:** 230 MB sin comprimir, 74 MB comprimida.
- **Arranque hasta `/ready` 200:** 2,0–2,4 s en 8 repeticiones; la primera, con
  la caché fría, 7,1 s.
- **Memoria:** 70–73 MiB.
- **Cierre:** 0,10–0,14 s.
- **pg-boss congelado 11 minutos** (`docker pause`, con el servidor cortando
  las sesiones ociosas a los 120 s): `/ready` 200 a los 66 ms de despertar, sin
  errores. De los disparos perdidos no recupera ninguno, y no duplica.
- `imagen-de-la-api.mjs` rechazó la primera imagen, cuyo código podía
  reescribir el proceso: es la negativa del control. Acepta la actual.

**Construcción local, dicho con exactitud.** Este contenedor de desarrollo
pasa el tráfico por un proxy con su propia CA. Para construir aquí, la CA se
inyectó **sólo en las etapas de construcción y producción** de una copia del
Dockerfile en el directorio temporal; la etapa de ejecución, la que se mide, es
idéntica. El Dockerfile versionado no lleva nada de eso: lo construye limpio
el trabajo `imagen-de-la-api` de la CI.

**Veredicto de §2.8.0** (`./scripts/verificar-etapa.sh --con-base`, Linux, Node 22.23.4):

VEREDICTO_PENDIENTE

## 7 · Verificación de seguridad (§2.7)

| §2.7              | En esta ronda                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos      | Sólo nombres en el repositorio; valores en Secret Manager, cargados por la entrada estándar (`read -rs`, `--data-file=-`); escaneo de secretos limpio                            |
| 2 · CORS          | `CORS_ALLOWED_ORIGINS` por variable de GitHub; nunca `*`. Hasta la PR 2, un origen `.invalid`                                                                                    |
| 5 · Límites       | La IP real detrás del frontal, probada con la cabecera falseada                                                                                                                  |
| 6 · RLS           | Sin cambio. La llave secreta sigue sólo en el servidor (Secret Manager)                                                                                                          |
| 8 · Transversales | HTTPS de `*.run.app`; la imagen sin root, sin poder reescribir su código y sin `.env`; WIF sin llaves; mínimo privilegio en las dos cuentas; acceso a secretos secreto a secreto |
| Cadena de CI      | El despliegue no puede dispararlo un PR; pide aprobación; el proveedor de WIF exige este `repository_id`, `develop`/`main` y el environment «nube»                               |

## 8 · Deuda, supuestos y pendientes

- **[CONTRADICCIÓN] C-69** (resuelta por D-157): «CPU siempre asignada, mínimo
  1» rige en producción; el prelanzamiento la suspende sin conjuntos.
- **[SUPUESTO]**:
  - **S-154-01**: región Tier 1 junto a Supabase.
  - **S-154-02**: secretos en `:latest`, y la rotación destruye la anterior.
  - **S-154-03**: el nombre completo de la métrica.
  - **S-154-04**: `gh` en Cloud Shell.
  - **S-159** actualizado (8 s).
- **PENDIENTE DE DEFINICIÓN**:
  - **P-43**: `PROVEEDOR_DE_EQUIPOS` con el primer conjunto.
  - **P-44**: RN-11 en prelanzamiento, con la propuesta de Cloud Scheduler y
    OIDC sin construir.
  - **P-45**: si el Supabase del prelanzamiento es el del banco de pruebas, y
    con ello qué llaves usar.
  - **P-46**: tope de gasto de Cloud Run.
- **DT-154-01**: `BIOMETRIA_LLAVE` no tiene herramienta de recifrado.
- **DT-154-02**: cinco guías más aún dicen `supabase db push` sin `--remote`
  (lista en `ESTADO_ETAPAS.md`).
- **Sin verificar en la nube** (PR 3):
  - la forma real de `X-Forwarded-For` en `*.run.app`, con la primera petición
    (S-15R-06);
  - el arranque en frío con la descarga de la imagen;
  - que `--liveness-probe=""` quita la sonda al volver de producción.

## 9 · Qué debe hacer Argenis

1. Revisar y fusionar este PR en `develop`.
2. Seguir `docs/guias/DESPLIEGUE_CLOUD_RUN.md` en Cloud Shell, §0 a §9, en
   orden.
3. Decidir **P-45** antes del §6: si el proyecto de Supabase es el del banco de
   pruebas, copie `BIOMETRIA_LLAVE` y `EQUIPOS_LLAVE` de ese servidor.
4. Lanzar **desplegar-api** desde `develop` en modo `prelanzamiento`, aprobarlo
   y comprobar `/health` (§10).
5. Avisar para la PR 2 (consola en Netlify), y después la PR 3 (verificación
   en la nube).

## 10 · Rama y commits

Rama `etapa-15-despliegue-api-cloud-run` desde `develop` (`ef9c409`); PR hacia
`develop`, sin fusionar. Commits: el de la construcción y el de cierre (este
informe, con el veredicto).
