# Ronda `etapa-15-consola-netlify` · la consola en Netlify (PR 2 de 3)

**Fecha:** 2026-11-07 · **Rama:** `etapa-15-consola-netlify` desde `develop` (`488cd3f`, con el PR 1 fusionado) ·
**Decisión del cliente:** D-160 (E-12), alcance «propuesta mínima» ·
**ADR:** [ADR-041](../decisiones/ADR-041-la-consola-en-netlify-desplegada-desde-github.md)

## 0 · Antes de empezar: lo que esta PR no puede demostrar

El plan decía que la PR 2 venía **después de fusionar el PR 1 y del primer
despliegue**. El PR 1 está fusionado; el primer despliegue de la API **no se ha
hecho** (respuesta de Argenis: «Todavía no»). Por eso esta PR deja la consola
**lista para publicarse**, empaquetada y comprobada en la CI, pero nada de lo
que depende de una consola viva está medido:

- la CSP que sirve Netlify de verdad;
- que Netlify sustituye `x-nf-client-connection-ip` si la manda el navegador
  (S-160-01);
- el proxy `/api/ncr/*` contra la API en `*.run.app`.

Eso es la PR 3, que no se adelanta.

## 1 · Qué se construyó

La consola ya sabía vivir en Netlify desde la ronda 15-R. El flujo en vivo y el
audio van directos a la API con billete, y la IP del navegador llega firmada.
Faltaba **cómo se construye y cómo se publica**, y esta ronda lo resuelve sin
tocar una línea de la consola.

El sitio de Netlify **no se conecta a Git**. En el plan gratuito, cada
despliegue a producción cuesta 15 de 300 créditos con tope duro: al agotarlos
se pausan todos los sitios de la cuenta. Un despliegue continuo publicaría cada
push sin aprobación y construiría los PR con las variables del sitio. En su
lugar, un flujo de GitHub, `desplegar-consola.yml`, publica **sólo a mano**,
desde `develop` o `main`, en el environment «nube» con aprobación: el mismo
patrón que la API.

Antes de publicar, el flujo comprueba los **nombres** de las variables del
sitio, nunca sus valores. Falla si falta alguna obligatoria, si hay una
`NEXT_PUBLIC_*`, si está la llave secreta de Supabase o si la cabecera de IP de
confianza no es la de Netlify. Después de publicar, pide `/acceso` a la consola
desplegada y juzga sus cabeceras reales: CSP con nonce, sin `unsafe-*`,
`connect-src` hacia la API, `frame-ancestors 'none'` y HSTS.

En cada PR, un trabajo nuevo de la CI, `consola-en-netlify`, empaqueta la
consola con `netlify build --offline`, sin cuenta ni token, y comprueba lo que
sale: la función de Next con `nodejs22.x` y el middleware como función de borde
con su emparejador.

La firma de la IP del navegador exige un secreto que comparten la consola
(`CONSOLA_IP_FIRMA_SECRETO`) y la API (`API_IP_FIRMA_SECRETO`). Se activa como
**séptimo secreto** de Cloud Run. Es la primera versión activa fuera de la capa
gratuita de Secret Manager: USD 0,06 al mes. Se genera con los demás secretos
de la API, y la guía de Netlify lo copia a la consola sin escribirlo en un
fichero ni en la pantalla.

## 2 · Cómo se organizó y por qué

**Sin Git en Netlify.** Es la decisión que más pesa, y la razón es de dinero y
de seguridad a la vez:

- el despliegue continuo gasta 15 créditos por push a la rama de producción;
- publica sin aprobación;
- y en el plan gratuito no se pueden acotar los ámbitos de las variables, así
  que la construcción de un PR ve las del sitio.

El precio de esta decisión es un **token personal de Netlify** en GitHub.
Netlify no ofrece federación de identidad como la de Google, así que no hay
alternativa sin llaves. Se acota así:

- es secreto del environment «nube», no del repositorio;
- sólo lo recibe un trabajo aprobado;
- tiene caducidad;
- y se rota si su titular deja el equipo.

Con el plan Pro (D-158) podría pasar a un miembro con permisos acotados.

**La CLI fijada con `npx`, fuera del lockfile.** Netlify recomienda fijar la
CLI en CI y meterla en el lockfile. Se fija (`netlify-cli@27.14.2`, la última
del 2026-10-22), pero **no** se mete en el lockfile: añadiría cientos de
paquetes al árbol del monorepo que sólo usa el despliegue. A cambio, el árbol
de la CLI no queda bajo `--frozen-lockfile`. Está registrado como alternativa
descartada en ADR-041.

**El adaptador OpenNext sin fijar.** Netlify lo recomienda así: el adaptador
sigue al runtime de la plataforma. Fijarlo se desfasaría en silencio.

**Las variables viven en Netlify, no en el `netlify.toml`.** El fichero sólo se
lee al construir, y la consola lee sus variables en tiempo de ejecución, en la
función y en el middleware. Ninguna es `NEXT_PUBLIC_*`, y el comprobador lo
exige. El fichero dice sólo cómo se construye: base en la raíz del monorepo,
`pnpm --filter @ncr/web build`, `publish = "apps/web/.next"`.

**Un guion puro para lo que se juzga.** `scripts/lib/variables-de-netlify.mjs`
reúne las tres comprobaciones —variables, cabeceras y empaquetado— como
funciones puras que reciben lo leído. Así se prueban con datos sin Netlify. Sus
pruebas usan **la `construirCsp` real** de la consola: si la CSP cambia, la
comprobación del despliegue se entera en la suite, no en producción.

**La longitud del secreto no se comprueba en el flujo.** `env:list` puede
devolver valores enmascarados, y una comprobación de longitud fallaría sobre la
máscara. La longitud ya la exige la consola al arrancar (15-R).

**El secreto compartido no pasa por un fichero.** Se genera con los demás
secretos de la API (`DESPLIEGUE_CLOUD_RUN.md` §6), porque la API no despliega
sin sus siete. Después, en Cloud Shell, la guía de Netlify lo lee de Secret
Manager a una variable de la sesión, lo carga con `env:set` y borra la
variable. Rotarlo obliga a desplegar las dos (`DESPLIEGUE_CLOUD_RUN.md` §13). No se marca como
secreto en Netlify: en el plan gratuito no se puede (S-160-03).

**`netlify serve` no se usó como prueba.** En este contenedor, el proxy de
salida y `NODE_OPTIONS` impiden que arranquen los trabajadores locales de
Netlify. Lo que no se pudo correr aquí se deja para la PR 3, sobre la consola
publicada. No se simula.

## 3 · Árbol de archivos

| Archivo                                                           | Propósito                                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/web/netlify.toml` (nuevo)                                   | Cómo construye Netlify la consola en el monorepo; sin variables                        |
| `.github/workflows/desplegar-consola.yml` (nuevo)                 | Publica la consola a mano, en el environment «nube», y comprueba variables y cabeceras |
| `.github/workflows/verificacion.yml`                              | Trabajo nuevo `consola-en-netlify`: empaqueta sin cuenta y juzga el resultado          |
| `scripts/lib/variables-de-netlify.mjs` + `.d.mts` (nuevos)        | Juicios puros de variables, cabeceras y empaquetado, y su CLI de tres modos            |
| `apps/web/src/lib/variables-de-netlify.test.ts` (nuevo)           | 9 pruebas de los juicios, con la CSP real de la consola                                |
| `apps/api/cloud-run/secretos.txt`                                 | `API_IP_FIRMA_SECRETO` activo como séptimo secreto                                     |
| `apps/api/test/despliegue-cloud-run.test.ts`                      | Siete secretos, y la configuración resultante sigue arrancando la API                  |
| `.gitignore`                                                      | `.netlify/`, lo que deja la CLI al construir                                           |
| `docs/guias/DESPLIEGUE_NETLIFY.md` (nuevo)                        | La guía, con «Debe ver», del sitio al rollback                                         |
| `docs/guias/DESPLIEGUE_CLOUD_RUN.md`                              | §6 con siete secretos, §8.2 el origen de la consola, §13 y §14 el costo                |
| `docs/guias/DESPLIEGUE.md` · `CONSOLA_EN_RED_Y_DESPLIEGUE.md`     | Apuntan a la guía nueva                                                                |
| `docs/decisiones/ADR-041-…` (nuevo) · `docs/decisiones/README.md` | La decisión y su fila                                                                  |
| `docs/auditoria/contradicciones-y-supuestos.md`                   | E-12 y S-160-01 a S-160-03                                                             |
| `docs/ESTADO_ETAPAS.md` · este informe                            | Estado y cierre                                                                        |

## 4 · Tabla SOLID (archivos nuevos)

| Archivo                        | SRP                                              | OCP                                                           | LSP                  | ISP                                  | DIP                                                          |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------- | -------------------- | ------------------------------------ | ------------------------------------------------------------ |
| `variables-de-netlify.mjs`     | Sólo juzga lo que Netlify tiene o produce        | Una variable obligatoria nueva es una línea en `OBLIGATORIAS` | N/A (sin jerarquías) | Tres juicios sueltos; la CLI, aparte | Los juicios no conocen Netlify ni el disco: reciben lo leído |
| `desplegar-consola.yml`        | Sólo publica; los juicios los delega en el guion | Una comprobación nueva va en el guion, no en el flujo         | N/A                  | N/A                                  | Sitio y token llegan por `vars` y `secrets` del environment  |
| `netlify.toml`                 | Sólo la construcción                             | Las variables no están aquí: cambiarlas no lo toca            | N/A                  | N/A                                  | El adaptador lo pone la plataforma                           |
| `variables-de-netlify.test.ts` | Una preocupación por bloque                      | —                                                             | —                    | —                                    | Usa la `construirCsp` real, sin dobles                       |

Los archivos tocados que no son nuevos no ganan responsabilidades: una línea
en `secretos.txt` y la cuenta de secretos en su prueba.

## 5 · Trazabilidad

| Elemento                  | Cobertura                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| §2.6                      | CI/CD con GitHub Actions: despliegue de la consola                                                                        |
| §2.7.1                    | Ningún valor en el repositorio; el flujo comprueba nombres y rechaza `NEXT_PUBLIC_*` y la llave secreta de Supabase       |
| §2.7.7                    | La CSP de la consola desplegada se juzga tras publicar; con la CI, la del código                                          |
| ETAPA 14 (entregabilidad) | La consola, además, empaquetada para su plataforma en cada PR                                                             |
| KPI-36 a KPI-38           | Sin cambio en el código. La lista blanca de porteros por IP depende de S-160-01, que verifica la PR 3                     |
| KPI-32, KPI-33            | Sin cambio: el flujo en vivo y el audio van directos a la API (15-R), no por las funciones de Netlify y su límite de 60 s |

## 6 · Pruebas

**Nuevas o cambiadas** (todas pasan):

- `apps/web/src/lib/variables-de-netlify.test.ts` (9):
  - las variables buenas pasan;
  - falta una, viene vacía, la cabecera de IP es otra, hay una `NEXT_PUBLIC_*`
    o la llave secreta de Supabase, y cada caso se nombra;
  - un secreto enmascarado no falla;
  - las cabeceras de la `construirCsp` real pasan, y sin nonce, con
    `unsafe-inline`, sin HSTS o con otro estado no;
  - el empaquetado con otra versión de Node o sin el emparejador del
    middleware no pasa.
- `apps/api/test/despliegue-cloud-run.test.ts` (8): siete secretos; con ellos,
  la configuración real de la API sigue arrancando.

**El empaquetado, ejecutado.** `npx -y netlify-cli@27.14.2 build --offline
--filter @ncr/web` se corrió en este contenedor. Compila Next, empaqueta la
función `___netlify-server-handler` (`runtimeVersion: nodejs22.x`) y el
middleware de borde `___netlify-edge-handler-node-middleware`. Después,
`node scripts/lib/variables-de-netlify.mjs empaquetado apps/web/.netlify`
responde: «empaquetado para Netlify: la función de Next y el middleware de
borde, con su emparejador».

Para construir aquí hicieron falta ajustes que la CI no necesita: el proxy y su
CA para Node (`NODE_USE_ENV_PROXY`, `NODE_EXTRA_CA_CERTS`) y Deno desde npm.

**No ejecutado aquí:** `netlify serve`, por el proxy del contenedor. Tampoco el
despliegue real. Ambos quedan para la PR 3.

**Veredicto de §2.8.0** (`./scripts/verificar-etapa.sh --con-base`, Linux, Node 22.23.4):

```text
VEREDICTO_PENDIENTE
```

## 7 · Verificación de seguridad (§2.7)

| §2.7              | En esta ronda                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos      | Sólo nombres en el repositorio. El token, secreto del environment «nube» con caducidad. El secreto compartido nunca toca un fichero ni la pantalla. El flujo no imprime valores |
| 2 · CORS          | La API admite el origen de la consola en Netlify por `NCR_CORS_ALLOWED_ORIGINS` (guía §6); nunca `*`                                                                            |
| 6 · RLS           | Sin cambio. El flujo rechaza la llave secreta de Supabase en el sitio: la consola sólo usa la publicable                                                                        |
| 7 · CSP           | Sin cambio en el código; tras publicar se comprueba la real: nonce, sin `unsafe-*`, `frame-ancestors 'none'`, HSTS                                                              |
| 8 · Transversales | HTTPS de `*.netlify.app`; el sitio no construye PR ajenos; el despliegue sólo desde `develop`/`main`, con aprobación                                                            |
| Cadena de CI      | `permissions: {}` en el flujo y `contents: read` en el trabajo; el trabajo de cada PR no recibe ni token ni sitio                                                               |

## 8 · Deuda, supuestos y pendientes

- **[SUPUESTO]**:
  - **S-160-01**: Netlify escribe `x-nf-client-connection-ip` con la IP real y
    sustituye la que mande el navegador. La documentación vigente no describe
    esa cabecera (describe `context.ip`). La lista blanca de porteros depende de
    ella: **la PR 3 debe verificarlo antes de confiar en esa lista**.
  - **S-160-02**: las funciones corren en `nodejs22.x` de AWS, no exactamente
    en el 22.23.4 de `.nvmrc`.
  - **S-160-03**: el secreto compartido no se puede marcar como secreto en
    Netlify en el plan gratuito.
- **E-12** registrada: la decisión D-160.
- **Riesgo aceptado**: el token personal de Netlify alcanza todos los sitios de
  su titular (ADR-041).
- **Sin construir, fuera de la propuesta mínima**: cerrar el canal en vivo con
  la pestaña oculta (`DESPLIEGUE_CLOUD_RUN.md` §15.2).
- **Sin verificar en la nube** (PR 3):
  - la CSP real servida por Netlify;
  - S-160-01;
  - el proxy `/api/ncr/*` hasta `*.run.app`;
  - el arranque en frío de la función.

## 9 · Qué debe hacer Argenis

1. Revisar y fusionar este PR en `develop`.
2. **Primero la API**: seguir `DESPLIEGUE_CLOUD_RUN.md` §0 a §10 y comprobar
   `/health`. La consola sin API no sirve para nada, y el secreto compartido se
   genera allí, en el §6, como séptimo secreto: la API no despliega sin él.
3. Seguir `docs/guias/DESPLIEGUE_NETLIFY.md` §1 a §6 en orden:
   1. crear el sitio con «Deploy manually», sin conectar Git;
   2. copiar el secreto compartido de Secret Manager a Netlify en Cloud Shell (§3);
   3. cargar las variables del sitio (§4);
   4. crear el token con caducidad y guardarlo como secreto del environment
      «nube», `NCR_NETLIFY_AUTH_TOKEN`; el ID del sitio, como variable
      `NCR_NETLIFY_SITIO` (§5);
   5. poner el origen de la consola en `NCR_CORS_ALLOWED_ORIGINS` y volver a
      desplegar la API (§6).
4. Lanzar **desplegar-consola** desde `develop` y aprobarlo (§7).
5. Comprobar en el navegador lo que dice el §8.
6. Avisar para la PR 3 (verificación en la nube).

## 10 · Rama y commits

Rama `etapa-15-consola-netlify` desde `develop` (`488cd3f`); PR hacia
`develop`, sin fusionar. Commits: el de la construcción y el de cierre (este
informe, con el veredicto).
