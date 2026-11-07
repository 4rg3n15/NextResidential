# La consola en Netlify · preparar el sitio y desplegar

> **D-160 · [ADR-041](../decisiones/ADR-041-la-consola-en-netlify-desplegada-desde-github.md)
> (PR 2 de 3).** La consola (Next.js) se publica en **Netlify, plan gratuito**
> (D-158), en `https://<sitio>.netlify.app` (D-156). Se construye en GitHub y
> se publica con la CLI de Netlify, a mano y con aprobación, igual que la API.
> Esta guía la ejecuta **Argenis**, una vez y en orden, **después** de
> `DESPLIEGUE_CLOUD_RUN.md`: la consola necesita la URL de la API.

**Cómo leer cada paso.** Igual que la guía de Cloud Run: el comando con
marcadores (`$SITIO`, `$URL_API`…) y debajo **«Debe ver»**. Si sale otra cosa,
pare en ese paso.

**Lo que no va en el repositorio, en el chat ni en el historial del shell:** el
token de Netlify, el secreto de la firma, el ID del sitio y cualquier URL real.

---

## Índice

0. [Lo que la consola hace distinto en Netlify](#0--lo-que-la-consola-hace-distinto-en-netlify)
1. [El plan gratuito: 300 créditos con tope duro](#1--el-plan-gratuito-300-créditos-con-tope-duro)
2. [Crear el sitio, sin conectarlo a Git](#2--crear-el-sitio-sin-conectarlo-a-git)
3. [El secreto que comparten la consola y la API](#3--el-secreto-que-comparten-la-consola-y-la-api)
4. [Las variables del sitio](#4--las-variables-del-sitio)
5. [GitHub: el token y el sitio](#5--github-el-token-y-el-sitio)
6. [La API: el origen de la consola](#6--la-api-el-origen-de-la-consola)
7. [Primer despliegue](#7--primer-despliegue)
8. [Comprobarlo en el navegador](#8--comprobarlo-en-el-navegador)
9. [Reversión](#9--reversión)
10. [Límites de Netlify que tocan a la consola](#10--límites-de-netlify-que-tocan-a-la-consola)

---

## 0 · Lo que la consola hace distinto en Netlify

Todo esto ya existe desde la ronda 15-R
(`CONSOLA_EN_RED_Y_DESPLIEGUE.md` §7). Esta guía sólo lo activa:

- **El flujo en vivo (SSE) y el audio de la guardia van directos** del
  navegador a la API, con un billete de un solo uso. Una función de Netlify los
  cortaría a los 60 s (§10).
- **La IP del navegador** sale **sólo** de la cabecera que escribe Netlify
  (`x-nf-client-connection-ip`) y viaja a la API **firmada** con un secreto
  compartido (§3).
- **`servidor.mjs` no se usa**: en Netlify la consola la sirven las funciones y
  el middleware que genera el adaptador OpenNext. Lo que `servidor.mjs` hacía
  —sustituir `X-Forwarded-For` y reenviar el audio— lo hacen la cabecera de
  Netlify y el audio directo.

---

## 1 · El plan gratuito: 300 créditos con tope duro

Documentación de Netlify, «Credit-based pricing plans», consultada el
2026-11-07. Vale para las cuentas creadas desde el 4 de septiembre de 2025:

| Concepto                              | Créditos                          |
| ------------------------------------- | --------------------------------- |
| Plan gratuito, al mes                 | **300**, con **tope duro**        |
| Cada despliegue a producción          | **15**                            |
| Cómputo de funciones                  | 10 por GB-hora (1 GB por omisión) |
| Peticiones                            | 2 por cada 10 000                 |
| Ancho de banda                        | 20 por GB                         |
| Despliegues fallidos y vistas previas | gratis                            |

> **El tope duro apaga TODO.** «Una vez agotado el saldo de créditos, todos sus
> proyectos se pausan y los visitantes ven una página "Site not available"». Es
> un freno de gasto —en el plan gratuito Netlify nunca cobra—, pero también es
> la consola caída hasta el mes siguiente.

**Lo que más gasta, en prelanzamiento, son los despliegues:** 20 a producción
se comen el mes entero. [Probable] El resto es poco: mil cargas de la consola
de unos 2 MB son unos 40 créditos de ancho de banda, y cada llamada a la API
pasa por una función unos cientos de milisegundos. Una llamada que despierte la
API en frío (unos 2 s, `DESPLIEGUE_CLOUD_RUN.md` §15) tiene la función
esperando ese tiempo.

**Dónde verlo:** Netlify → Team → Usage & billing.

---

## 2 · Crear el sitio, sin conectarlo a Git

En el panel de Netlify, con la cuenta **corporativa**:

1. **Add new project → Deploy manually**. Arrastre cualquier carpeta vacía: es
   sólo para crear el sitio. El primer despliegue de verdad lo hace el flujo
   (§7).
2. **Project configuration → General → Project details → Change project name**:
   el nombre define la URL, `https://<sitio>.netlify.app`.
3. Anote el **Project ID**: lo pide el §5. Es lo que la CLI llama `NETLIFY_SITE_ID`.

**No conecte el repositorio de GitHub al sitio.** Conectado, Netlify
construiría solo cada push a la rama de producción, sin aprobación y gastando
15 créditos cada vez, y cada PR construiría con las variables del sitio. Si ya
lo conectó: **Project configuration → Build & deploy → Continuous deployment →
Stop builds**.

**Debe ver:** el sitio con su URL `*.netlify.app`, y en **Deploys** sólo el
despliegue manual del paso 1.

---

## 3 · El secreto que comparten la consola y la API

Es el **mismo valor** en dos sitios: `API_IP_FIRMA_SECRETO` en Secret Manager
y `CONSOLA_IP_FIRMA_SECRETO` en Netlify. Ya existe: lo generó
`DESPLIEGUE_CLOUD_RUN.md` §6, el séptimo secreto, porque la API no despliega
sin él. Aquí se copia de Secret Manager a Netlify **sin que aparezca en
pantalla ni en el historial**: el historial guarda `"$VALOR"`, no lo que
contiene. En Cloud Shell, con el proyecto de Google ya configurado:

```bash
export SITIO="<project-id-de-netlify>"
npx -y netlify-cli@27.14.2 login            # abre el navegador; una vez

VALOR="$(gcloud secrets versions access latest --secret=ncr-api-ip-firma-secreto)"
npx -y netlify-cli@27.14.2 env:set CONSOLA_IP_FIRMA_SECRETO "$VALOR" \
  --context production --site "$SITIO" >/dev/null
unset VALOR
```

**Debe ver:** nada. Las dos líneas no imprimen: la primera guarda el valor en
la variable y la de Netlify descarta su salida. En el panel de Netlify (§4)
debe aparecer `CONSOLA_IP_FIRMA_SECRETO`.

**Si rota el secreto** (`DESPLIEGUE_CLOUD_RUN.md` §13), repita este bloque y
vuelva a desplegar **las dos**: la API y la consola. Mientras sólo una tenga el
valor nuevo, la API no cree la IP que declara la consola y la lista blanca de
porteros niega a todos.

[SUPUESTO] S-160-03 · en el plan gratuito la variable **no** se puede marcar
como secreta. Netlify exige ámbitos explícitos para las secretas, y los ámbitos
son del plan Pro. Mientras tanto, cualquier miembro del equipo de Netlify puede
leer el valor. Con el plan Pro (D-158) se marca con `--secret` y ámbito
`functions`.

---

## 4 · Las variables del sitio

Netlify → el sitio → **Project configuration → Environment variables → Add a
variable**, contexto **Production**. En el plan gratuito todas valen para todos
los ámbitos: construcción, funciones y middleware.

| Variable                           | Valor                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `API_URL`                          | la URL de la API en Cloud Run (`DESPLIEGUE_CLOUD_RUN.md` §10), sin `/` final                                                             |
| `API_ORIGEN_PUBLICO`               | la **misma** URL: es el origen al que el navegador abre el flujo y el audio, y entra en la CSP                                           |
| `SUPABASE_URL`                     | la Project URL de Supabase                                                                                                               |
| `SUPABASE_PUBLISHABLE_KEY`         | la **publicable** (`sb_publishable_…`). **Nunca** la secreta: con ella la consola no arranca                                             |
| `CONSOLA_CABECERA_IP_DE_CONFIANZA` | `x-nf-client-connection-ip`                                                                                                              |
| `CONSOLA_IP_FIRMA_SECRETO`         | ya puesta en el §3                                                                                                                       |
| `RECUPERACION_POR_CORREO`          | `desactivada` (lo de siempre en producción, AR-04)                                                                                       |
| `NETLIFY_NEXT_SKEW_PROTECTION`     | `true`: quien tenga la consola abierta durante un despliegue sigue hablando con su versión (documentación de Netlify, «Skew protection») |

**Ninguna** lleva `NEXT_PUBLIC_`. El flujo de despliegue lo comprueba, y
comprueba también que estén las seis primeras (§7).

[SUPUESTO] S-160-01 · Netlify escribe `x-nf-client-connection-ip` con la IP
real y **sustituye** la que mande el navegador. La documentación vigente de
Netlify describe la IP del cliente como `context.ip` de sus funciones, no esta
cabecera, y el adaptador de Next no expone `context`. **La PR 3 debe
comprobarlo** antes de confiar en la lista blanca de porteros: una petición con
una `x-nf-client-connection-ip` inventada tiene que llegar a la API con la IP
real.

---

## 5 · GitHub: el token y el sitio

**El token** (Netlify no tiene federación de identidad como Google):

1. Netlify → **User settings → Applications → Personal access tokens → New
   access token**, con **fecha de caducidad** (90 días, por ejemplo).
2. GitHub → **Settings → Environments → nube → Environment secrets → Add
   secret** → `NCR_NETLIFY_AUTH_TOKEN`. En el **environment** «nube», no en el
   repositorio: sólo lo recibe un trabajo que alguien ya aprobó.

**El sitio:** **Settings → Secrets and variables → Actions → Variables** →
`NCR_NETLIFY_SITIO` = el Project ID del §2.

**Debe ver:** el secreto en el environment «nube», no en «Repository secrets»,
y la variable en la lista.

**Rotación:** cree el token nuevo, sustitúyalo en GitHub y **borre el
anterior** en Netlify. El token es de una persona y alcanza **todos** sus
sitios: si esa persona deja el equipo, se rota ese día (ADR-041).

---

## 6 · La API: el origen de la consola

La API sólo acepta el origen de la consola (CORS y el `Origin` del WebSocket
del audio):

1. GitHub → variable `NCR_CORS_ALLOWED_ORIGINS` = `https://<sitio>.netlify.app`
   (sin `/` final).
2. **Actions → desplegar-api → Run workflow**, en el modo de siempre
   (prelanzamiento). Este despliegue ya lleva el séptimo secreto (§3).

**Debe ver:** el despliegue de la API en verde y `/health` en 200.

**Supabase**, sólo si algún día se activa la recuperación por correo
(`RECUPERACION_POR_CORREO=activa`): Authentication → URL Configuration → _Site
URL_ y _Redirect URLs_ con la URL de Netlify (`CONSOLA_EN_RED_Y_DESPLIEGUE.md`
§5.4).

---

## 7 · Primer despliegue

1. GitHub → **Actions → desplegar-consola → Run workflow**, rama `develop`.
2. Apruebe el trabajo (environment «nube»).
3. Pasos en verde, en orden:
   - el token y el sitio están cargados;
   - la instalación;
   - «las variables del sitio en Netlify están declaradas» (por nombre);
   - «la API pública configurada responde»: el `/health` de
     `API_ORIGEN_PUBLICO`, **antes** de publicar;
   - la construcción y publicación;
   - «la consola responde con su CSP».

**Debe ver** en el paso de la API:
`la API pública configurada responde /health: es la nuestra`. Si dice «apunta
a otro servicio» o «respondió 0», `API_ORIGEN_PUBLICO` no es la URL de Cloud
Run (`DESPLIEGUE_CLOUD_RUN.md` §10) o la API no está desplegada.

**Debe ver** en el último paso:
`la consola responde 200, con su CSP de nonce y la API configurada en connect-src`.
Si dice «connect-src no tiene la API configurada», la consola publicada no está
usando ese origen: compruebe que la variable está en el contexto de producción.

**Cada ejecución en verde gasta 15 créditos.** Si falla antes de publicar, no
gasta nada: por eso la API se comprueba antes.

---

## 8 · Comprobarlo en el navegador

Abra `https://<sitio>.netlify.app` y siga `CONSOLA_EN_RED_Y_DESPLIEGUE.md` §7.6.
Lo esencial:

1. La pantalla de acceso carga, sin errores de CSP en la consola del navegador.
2. Con sesión de portero, en Eventos, la pestaña «Red» muestra
   `POST /api/ncr/…/eventos/billete` (201) y después
   `GET https://<api>/flujo-directo/eventos?billete=…` (200, `text/event-stream`).
3. El registro de la API (`gcloud run services logs read`) no dice «billete … de
   otra IP» (S-15R-05: el navegador llega a Netlify y a Cloud Run con la misma
   IP).

---

## 9 · Reversión

Netlify → el sitio → **Deploys** → el despliegue anterior → **Publish deploy**.
Según la documentación es instantáneo y no construye nada. El siguiente
despliegue del flujo vuelve a publicar la versión nueva.

[Probable] Publicar un despliegue anterior cuenta como despliegue a producción,
15 créditos: la documentación cobra «los despliegues de producción publicados».

La consola y la API se revierten **por separado**. Si la versión anterior de la
consola necesitaba una API anterior, revierta las dos
(`DESPLIEGUE_CLOUD_RUN.md` §12).

---

## 10 · Límites de Netlify que tocan a la consola

Documentación de Netlify («Functions configuration», consultada el 2026-11-07):

| Límite                                    | Valor                                          | Qué significa aquí                                                                                                                           |
| ----------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Ejecución síncrona de una función         | **60 s**                                       | Toda petición de la consola a la API por el proxy `/api/ncr` tiene que terminar en 60 s. El SSE y el audio, que duran más, van directos (§0) |
| Cuerpo de petición o respuesta, sin flujo | **6 MB**                                       | El proxy ya acota los envíos a 3 MiB (D-149) y la foto más grande es de 2200 kB: cabe                                                        |
| Respuesta en flujo                        | 20 MB                                          | Las exportaciones grandes del historial: el tope de 10 000 filas (`TOPE_DE_EXPORTACION`) cabe holgado [Probable]                             |
| Región de las funciones                   | `cmh` (Ohio) por omisión                       | Cerca de las regiones de Tier 1 del este de EE. UU. Si la API va en otra, cada llamada suma ese trayecto                                     |
| Versión de Node de las funciones          | la de la construcción, si AWS Lambda la ofrece | Se construye con la de `.nvmrc` (22.23.4) y Lambda la ejecuta con su `nodejs22.x`, que AWS parchea por su cuenta                             |

[Cierto] El manifiesto que deja `netlify build` declara la función con
`runtimeVersion: nodejs22.x`. El trabajo `consola empaquetada para Netlify` de
la CI lo exige en cada PR.

[SUPUESTO] S-160-02 · `nodejs22.x` es el Node 22 que mantiene AWS, con los
parches que AWS decida, no exactamente el 22.23.4 de `.nvmrc`. El suelo de
seguridad de D-149 no se puede imponer en Netlify: se confía en los parches de
AWS al runtime administrado.
