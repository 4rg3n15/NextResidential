# La API en Cloud Run · preparar el proyecto y desplegar

> **D-154 a D-159 · [ADR-040](../decisiones/ADR-040-la-api-en-cloud-run-con-dos-modos.md)
> (2026-11-06).** La API corre en Cloud Run, en **UNA instancia**, con dos
> modos: **prelanzamiento** (facturación por solicitud, mínimo 0) mientras no
> haya conjuntos, y **producción** (por instancia, mínimo 1) desde el primero.
> Esta guía la ejecuta **Argenis en Cloud Shell**, una vez, en orden. El agente
> no tiene ni necesita acceso al proyecto.

**Cómo leer cada paso.** Primero el comando, con marcadores (`$PROYECTO`,
`$REGION`…), y debajo **«Debe ver»**: lo que tiene que salir. Si sale otra cosa,
pare en ese paso: el siguiente da por hecho el anterior.

**Lo que NUNCA va en el repositorio, en el chat ni en el historial del shell:**
valores de secretos, el ID o el número del proyecto, el de la organización, la
cuenta de facturación, correos, IP ni URL reales. En el repositorio sólo hay
nombres y marcadores.

---

## Índice

0. [Marcadores](#0--marcadores)
1. [La región](#1--la-región)
2. [Facturación y políticas de la organización](#2--facturación-y-políticas-de-la-organización)
3. [Las APIs, y sólo ésas](#3--las-apis-y-sólo-ésas)
4. [Artifact Registry y su limpieza](#4--artifact-registry-y-su-limpieza)
5. [Las dos cuentas de servicio](#5--las-dos-cuentas-de-servicio)
6. [Los secretos](#6--los-secretos)
7. [Workload Identity Federation para GitHub](#7--workload-identity-federation-para-github)
8. [GitHub: variables y el environment «nube»](#8--github-variables-y-el-environment-nube)
9. [Alertas de presupuesto: USD 1, 5 y 10](#9--alertas-de-presupuesto-usd-1-5-y-10)
10. [Primer despliegue, en prelanzamiento](#10--primer-despliegue-en-prelanzamiento)
11. [Cambio de modo](#11--cambio-de-modo)
12. [Reversión a la imagen anterior](#12--reversión-a-la-imagen-anterior)
13. [Rotar un secreto y destruir la versión anterior](#13--rotar-un-secreto-y-destruir-la-versión-anterior)
14. [Costos: qué cabe en la capa gratuita](#14--costos-qué-cabe-en-la-capa-gratuita)
15. [El prelanzamiento, medido](#15--el-prelanzamiento-medido)

---

## 0 · Marcadores

Defínalos **en la sesión de Cloud Shell**, no en un fichero del repositorio.
Ninguno es un secreto, pero tampoco se versiona ninguno.

```bash
export PROYECTO="<id-del-proyecto>"              # Panel → selector de proyecto
export REGION="<region-tier-1>"                  # §1
export REPOSITORIO="ncr"                          # Artifact Registry
export SERVICIO="ncr-api"                         # el servicio de Cloud Run
export CUENTA_EJECUCION="ncr-api-ejecucion@$PROYECTO.iam.gserviceaccount.com"
export CUENTA_DESPLIEGUE="ncr-api-despliegue@$PROYECTO.iam.gserviceaccount.com"
export GITHUB_REPO="<propietario>/<repositorio>"  # el de GitHub
gcloud config set project "$PROYECTO"
export NUMERO_DE_PROYECTO="$(gcloud projects describe "$PROYECTO" --format='value(projectNumber)')"
```

**Debe ver:** `Updated property [core/project].` y nada más. `echo "$NUMERO_DE_PROYECTO"`
es un número; no lo copie a ninguna parte salvo a las variables de GitHub (§8).

---

## 1 · La región

**Reglas (D-154):** una región de **Tier 1** y, dentro de ellas, la más cercana a
la región de su proyecto de Supabase (panel de Supabase → Project Settings →
General → Region). **Nunca `southamerica-*`**: son Tier 2 (precio mayor). El
flujo de despliegue se niega a usar una región `southamerica-*`.

Regiones de Tier 1 en América, según la página de precios de Cloud Run
(«Regional price tiers», consultada el 2026-11-06):
`northamerica-south1` (México), `us-central1`, `us-east1`, `us-east4`, `us-east5`,
`us-south1`, `us-west1` y `us-west8`.

[SUPUESTO] S-154-01 · la más cercana a Supabase minimiza la latencia
API ↔ base, que es la que más pesa: cada petición hace varias consultas. La
latencia del navegador o del Edge hasta la API pesa menos, porque es una sola
ida y vuelta por petición.

---

## 2 · Facturación y políticas de la organización

### 2.1 La facturación está vinculada

```bash
gcloud billing projects describe "$PROYECTO"
```

**Debe ver:** `billingEnabled: true` y un `billingAccountName: billingAccounts/…`.
Con `false`, vincule la cuenta corporativa en el panel (Facturación → Mis
proyectos) antes de seguir: sin ella, ninguna API de las del §3 se habilita.

### 2.2 Las políticas que pueden bloquear el despliegue

Las organizaciones nuevas traen políticas **activas por defecto** (documentación
«Organizaciones seguras de forma predeterminada»). Para ver las que afectan a su
proyecto:

```bash
gcloud org-policies list --project="$PROYECTO"
gcloud org-policies describe CONSTRAINT --project="$PROYECTO" --effective
```

Con `CONSTRAINT` igual a cada una de estas:

| Restricción                                                                                          | Qué hace si está activa                                                                                | Qué hace esta guía                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iam.allowedPolicyMemberDomains`                                                                     | Prohíbe dar roles a `allUsers`: un servicio público con `roles/run.invoker` para todos **no se puede** | **No se relaja.** El servicio se publica con `--no-invoker-iam-check`, que la documentación de Cloud Run da como la forma recomendada con esta restricción |
| `run.managed.requireInvokerIam`                                                                      | **Prohíbe desactivar la comprobación IAM del invocador**: con ella, `--no-invoker-iam-check` falla     | No viene activa por defecto. Si su organización la tiene, **pare**: o se exceptúa este proyecto, o la API no puede ser pública sin balanceador             |
| `iam.managed.disableServiceAccountKeyCreation` (y la clásica `iam.disableServiceAccountKeyCreation`) | Prohíbe crear llaves JSON de cuentas de servicio                                                       | **Se queda activa.** El despliegue usa Workload Identity Federation (§7): no hay llave                                                                     |
| `iam.automaticIamGrantsForDefaultServiceAccounts`                                                    | La cuenta por defecto de Compute nace **sin** rol Editor                                               | No se usa: la API corre con su cuenta de ejecución dedicada (§5)                                                                                           |
| `gcp.resourceLocations`                                                                              | Limita las regiones donde se pueden crear recursos                                                     | Compruebe que `$REGION` está permitida **antes** del §4: si no, Artifact Registry y Cloud Run fallan al crear                                              |
| `run.allowedIngress` · `run.allowedVPCEgress` · `run.allowedBinaryAuthorizationPolicies`             | Restringen el ingreso, la salida por VPC o exigen Binary Authorization                                 | El servicio usa `--ingress=all` y no usa VPC ni Binary Authorization: si alguna está activa con otros valores, **pare** y repórtelo                        |

**Debe ver:** para cada una, o `NOT_FOUND`/sin regla (no aplica), o una regla
compatible con la última columna.

---

## 3 · Las APIs, y sólo ésas

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  billingbudgets.googleapis.com
```

**Debe ver:** `Operation "operations/…" finished successfully.` Ninguna otra: ni
Cloud Build (la imagen se construye en GitHub) ni Compute (no hay máquinas).

---

## 4 · Artifact Registry y su limpieza

```bash
gcloud artifacts repositories create "$REPOSITORIO" \
  --repository-format=docker --location="$REGION" \
  --description="Imágenes de la API de Next Control Residencial"
```

**Debe ver:** `Created repository [ncr].`

La política de limpieza (D-154 · 13) **conserva las 2 últimas imágenes**: la que
sirve y la anterior, que es la de la reversión (§12). Está versionada en
`apps/api/cloud-run/limpieza-artifact-registry.json` (un repositorio clonado en
Cloud Shell la tiene en esa ruta). Primero en **prueba**, que no borra nada:

```bash
gcloud artifacts repositories set-cleanup-policies "$REPOSITORIO" \
  --location="$REGION" \
  --policy=apps/api/cloud-run/limpieza-artifact-registry.json --dry-run
```

**Debe ver:** las dos políticas listadas. Cuando haya al menos tres imágenes,
actívela:

```bash
gcloud artifacts repositories set-cleanup-policies "$REPOSITORIO" \
  --location="$REGION" \
  --policy=apps/api/cloud-run/limpieza-artifact-registry.json --no-dry-run
```

Artifact Registry aplica la limpieza «en un trabajo periódico», con efecto en
«aproximadamente un día». Cuando un artefacto cumple las dos políticas, gana la
de conservar.

**Por qué el flujo publica sin atestaciones** (`--provenance=false --sbom=false`):
cada atestación es un artefacto más en el repositorio y competiría con las dos
imágenes por los puestos que se conservan.

---

## 5 · Las dos cuentas de servicio

**Ejecución:** la identidad de la API en Cloud Run. Sólo lee **sus** secretos.
**Despliegue:** la que usa GitHub. Publica imágenes y despliega, y sólo puede
«actuar como» la de ejecución, no como cualquier cuenta.

```bash
gcloud iam service-accounts create ncr-api-ejecucion \
  --display-name="Next Control · API en ejecución"
gcloud iam service-accounts create ncr-api-despliegue \
  --display-name="Next Control · despliegue desde GitHub"

# Despliegue: administrar Cloud Run (incluye desactivar la comprobación IAM del invocador)…
gcloud projects add-iam-policy-binding "$PROYECTO" \
  --member="serviceAccount:$CUENTA_DESPLIEGUE" --role=roles/run.admin
# …publicar SÓLO en este repositorio de imágenes…
gcloud artifacts repositories add-iam-policy-binding "$REPOSITORIO" --location="$REGION" \
  --member="serviceAccount:$CUENTA_DESPLIEGUE" --role=roles/artifactregistry.writer
# …actuar SÓLO como la cuenta de ejecución…
gcloud iam service-accounts add-iam-policy-binding "$CUENTA_EJECUCION" \
  --member="serviceAccount:$CUENTA_DESPLIEGUE" --role=roles/iam.serviceAccountUser
# …y consultar qué APIs están habilitadas, que `gcloud run deploy` comprueba antes de desplegar.
gcloud projects add-iam-policy-binding "$PROYECTO" \
  --member="serviceAccount:$CUENTA_DESPLIEGUE" --role=roles/serviceusage.serviceUsageConsumer
```

**Debe ver:** dos `Created service account` y cuatro `Updated IAM policy`.

[Probable] El cuarto rol no estaba en la lista del encargo. Se añade porque
`gcloud run deploy`, antes de desplegar, consulta Service Usage (comprobado con
el analizador local de `gcloud`: la llamada llega a `serviceusage.googleapis.com`).
Sin el rol, el despliegue puede detenerse ahí. `serviceUsageConsumer` sólo deja
ver y usar las APIs ya habilitadas, no habilitar otras. El rol
de lectura de secretos de la de ejecución se da **por secreto** en el §6, no
sobre el proyecto.

---

## 6 · Los secretos

Los nombres están en `apps/api/cloud-run/secretos.txt`. Son **siete**: los seis
que la API exige para arrancar —seis es lo que Secret Manager da gratis— y,
desde la PR 2 (D-160), el que comparte con la consola en Netlify para firmar la
IP del navegador. El séptimo es la primera versión fuera de la capa gratuita:
**USD 0,06 al mes**.

| Variable de la API      | Secreto                        | De dónde sale el valor                                                                                                                                    |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_SECRET_KEY`   | `ncr-supabase-secret-key`      | Supabase → Settings → API Keys → la **secreta** (`sb_secret_…`)                                                                                           |
| `DATABASE_URL`          | `ncr-database-url-sesion`      | El pooler en modo **sesión**, puerto **5432**, con el usuario `app_api` (`CONEXION_SUPABASE.md` §12). Es la de pg-boss: la directa sólo resuelve por IPv6 |
| `DATABASE_POOLER_URL`   | `ncr-database-url-transaccion` | El pooler en modo **transacción**, puerto **6543**, el mismo usuario                                                                                      |
| `INGESTA_FIRMA_SECRETO` | `ncr-ingesta-firma-secreto`    | Se genera (abajo)                                                                                                                                         |
| `BIOMETRIA_LLAVE`       | `ncr-biometria-llave`          | Se genera, **salvo** lo que dice el aviso de abajo                                                                                                        |
| `EQUIPOS_LLAVE`         | `ncr-equipos-llave`            | Ídem                                                                                                                                                      |
| `API_IP_FIRMA_SECRETO`  | `ncr-api-ip-firma-secreto`     | Se genera **una vez** y el MISMO valor va en Netlify como `CONSOLA_IP_FIRMA_SECRETO` (`DESPLIEGUE_NETLIFY.md` §3)                                         |

> **Aviso · las dos llaves y los datos que ya existen.** `BIOMETRIA_LLAVE` y
> `EQUIPOS_LLAVE` cifran lo que la API guarda en la base. Si este proyecto de
> Supabase **ya** tiene datos cifrados por otra API —el servidor de pruebas—,
> una llave nueva los deja ilegibles: las credenciales de los equipos y las
> plantillas. En ese caso use **el mismo valor** que ese servidor, leyéndolo por
> la entrada estándar como los de Supabase. Si el proyecto no tiene datos que
> conservar, genérelas. **PENDIENTE DE DEFINICIÓN P-45**: si el proyecto de
> Supabase del prelanzamiento es el mismo que el del banco de pruebas.

**Un valor que usted conoce** (Supabase), sin que quede en el historial ni en
pantalla: `read -rs` lo pide sin eco y el valor nunca aparece en la línea de
órdenes, que es lo que el historial guarda.

```bash
crear_secreto_leido() {   # $1 = nombre del secreto
  read -rs -p "Pegue el valor de $1 y pulse Intro: " VALOR; echo
  printf '%s' "$VALOR" | gcloud secrets create "$1" \
    --replication-policy=automatic --data-file=-
  unset VALOR
}
crear_secreto_leido ncr-supabase-secret-key
crear_secreto_leido ncr-database-url-sesion
crear_secreto_leido ncr-database-url-transaccion
```

**Un valor que se genera** y que nadie necesita ver:

```bash
crear_secreto_generado() {   # $1 = nombre del secreto
  openssl rand -base64 48 | tr -d '\n' | gcloud secrets create "$1" \
    --replication-policy=automatic --data-file=-
}
crear_secreto_generado ncr-ingesta-firma-secreto
crear_secreto_generado ncr-biometria-llave     # o crear_secreto_leido, ver el aviso
crear_secreto_generado ncr-equipos-llave       # ídem
crear_secreto_generado ncr-api-ip-firma-secreto
```

El de la firma de la IP es el único que tiene que existir **en dos sitios**:
aquí y en Netlify. Se genera aquí, porque la API no despliega sin sus siete
secretos, y `DESPLIEGUE_NETLIFY.md` §3 lo copia después a Netlify desde Secret
Manager sin que se vea.

Y la cuenta de ejecución lee **sólo esos siete**:

```bash
for s in ncr-supabase-secret-key ncr-database-url-sesion ncr-database-url-transaccion \
         ncr-ingesta-firma-secreto ncr-biometria-llave ncr-equipos-llave \
         ncr-api-ip-firma-secreto; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$CUENTA_EJECUCION" --role=roles/secretmanager.secretAccessor
done
```

**Debe ver:** siete `Created version [1] of the secret [...]` y siete
`Updated IAM policy for secret`. `gcloud secrets list` muestra los siete nombres;
ningún comando de esta guía muestra un valor.

**Replicación automática a propósito:** Secret Manager la factura como **una**
ubicación; la manual cuenta cada réplica como una versión activa más.

---

## 7 · Workload Identity Federation para GitHub

GitHub firma un token OIDC por ejecución; Google lo acepta sólo si cumple la
**condición** del proveedor y lo cambia por un acceso de minutos a la cuenta de
despliegue. Sin llaves.

**Los identificadores numéricos del repositorio** —la documentación de Google y
la de `google-github-actions/auth` advierten que los **nombres** se pueden volver
a registrar si se borran; los números no se reutilizan—:

```bash
gh api "repos/$GITHUB_REPO" --jq '.id, .owner.id'
```

(Con `gh auth login` antes, si Cloud Shell no tiene la sesión de GitHub.
[SUPUESTO] S-154-04 · `gh` está en Cloud Shell; si no, instálelo con su gestor
de paquetes o ejecute la línea en su equipo: los dos números no son secretos.)

```bash
export REPO_ID="<primer número>"
export OWNER_ID="<segundo número>"

gcloud iam workload-identity-pools create github \
  --location=global --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc ncr-github \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com/" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref,attribute.environment=assertion.environment" \
  --attribute-condition="assertion.repository_id=='$REPO_ID' && assertion.repository_owner_id=='$OWNER_ID' && (assertion.ref=='refs/heads/develop' || assertion.ref=='refs/heads/main') && assertion.environment=='nube'"

# La cuenta de despliegue la pueden usar SÓLO los tokens de este repositorio.
gcloud iam service-accounts add-iam-policy-binding "$CUENTA_DESPLIEGUE" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMERO_DE_PROYECTO/locations/global/workloadIdentityPools/github/attribute.repository_id/$REPO_ID"

# El nombre completo del proveedor, para la variable de GitHub del §8:
gcloud iam workload-identity-pools providers describe ncr-github \
  --location=global --workload-identity-pool=github --format='value(name)'
```

**Debe ver:** el pool y el proveedor creados, `Updated IAM policy for
serviceAccount`, y por último una ruta
`projects/<número>/locations/global/workloadIdentityPools/github/providers/ncr-github`.

**Qué deja fuera la condición:** otro repositorio (aunque se llame igual), otra
rama (un PR, una rama de etapa), y cualquier ejecución que no esté en el
environment «nube», que es el que exige aprobación.

---

## 8 · GitHub: variables y el environment «nube»

### 8.1 El environment

GitHub → el repositorio → **Settings → Environments → New environment** → `nube`:

1. **Required reviewers**: usted (y quien Grupo Control designe). Si es el único,
   deje **sin** marcar «Prevent self-review», o no podrá aprobar sus propios
   despliegues.
2. **Deployment branches and tags → Selected branches and tags** → añada
   `develop` y `main`. Ninguna más.

### 8.2 Las variables del repositorio

**Settings → Secrets and variables → Actions → Variables → New repository
variable.** Son **variables**, no secretos: ninguna es secreta, y ningún secreto
pasa por GitHub (viven en Secret Manager).

| Variable                           | Valor                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NCR_GCP_PROYECTO`                 | `$PROYECTO`                                                                                                                                                                                            |
| `NCR_GCP_REGION`                   | `$REGION`                                                                                                                                                                                              |
| `NCR_GCP_REPOSITORIO`              | `$REPOSITORIO`                                                                                                                                                                                         |
| `NCR_GCP_SERVICIO`                 | `$SERVICIO`                                                                                                                                                                                            |
| `NCR_GCP_CUENTA_EJECUCION`         | `$CUENTA_EJECUCION`                                                                                                                                                                                    |
| `NCR_GCP_CUENTA_DESPLIEGUE`        | `$CUENTA_DESPLIEGUE`                                                                                                                                                                                   |
| `NCR_GCP_WIF_PROVEEDOR`            | la ruta que imprimió el último comando del §7                                                                                                                                                          |
| `NCR_SUPABASE_URL`                 | la Project URL de Supabase, sin `/` final                                                                                                                                                              |
| `NCR_SUPABASE_PUBLISHABLE_KEY`     | la llave **publicable** (`sb_publishable_…`), nunca la secreta                                                                                                                                         |
| `NCR_CORS_ALLOWED_ORIGINS`         | el origen de la consola en Netlify, `https://<sitio>.netlify.app`, sin `/` final (`DESPLIEGUE_NETLIFY.md` §2). Si aún no existe el sitio, `https://consola.invalid`, que no es de nadie y no abre nada |
| `NCR_SUPABASE_POOLER_MAX_CLIENTES` | el «Pool Size» del pooler (Database → Settings): 15 en el plan gratuito [SUPUESTO S-170]                                                                                                               |

Con `gh` desde Cloud Shell, si lo prefiere: `gh variable set NOMBRE --repo "$GITHUB_REPO" --body "valor"`.

**Debe ver:** las once en la lista. El flujo comprueba al empezar que estén
todas y se detiene nombrando las que falten.

---

## 9 · Alertas de presupuesto: USD 1, 5 y 10

Un presupuesto de USD 10 con avisos al 10 %, 50 % y 100 %:

```bash
export CUENTA_DE_FACTURACION="$(gcloud billing projects describe "$PROYECTO" --format='value(billingAccountName)' | cut -d/ -f2)"
gcloud billing budgets create \
  --billing-account="$CUENTA_DE_FACTURACION" \
  --display-name="ncr-prelanzamiento" \
  --budget-amount=10USD \
  --filter-projects="projects/$PROYECTO" \
  --threshold-rule=percent=0.1 \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=1.0
```

**Debe ver:** el presupuesto creado. Los avisos llegan por correo a los
administradores de la cuenta de facturación.

**Un presupuesto avisa, no frena.** Si gerencia quiere un **tope duro** para el
prelanzamiento, Cloud Run admite topes de gasto: al alcanzarlo «pausa todas las
cargas de Cloud Run» del proyecto, y el servicio responde 5xx hasta el mes
siguiente o hasta que se suba el tope. Se configura en la página de resumen de
Cloud Run. **PENDIENTE DE DEFINICIÓN P-46**: si se quiere ese tope; en
producción no, porque dejaría a los conjuntos sin API.

---

## 10 · Primer despliegue, en prelanzamiento

1. GitHub → **Actions → desplegar-api → Run workflow**. Rama `develop`, modo
   `prelanzamiento`.
2. El trabajo queda **esperando aprobación** (environment «nube»): apruébelo.
3. Pasos que debe ver en verde, en orden: las variables están cargadas · las
   variables de la API · la autenticación con Google · la construcción · «Node de
   .nvmrc, sin root, sin secretos y por debajo de 250 MB» · la publicación · el
   despliegue · «La API responde /health».

**Debe ver** en el último paso: `/health → 200 · modo prelanzamiento · imagen <commit>`.

Y desde Cloud Shell:

```bash
URL="$(gcloud run services describe "$SERVICIO" --region="$REGION" --format='value(status.url)')"
curl -sS "$URL/health"; echo
gcloud run services describe "$SERVICIO" --region="$REGION" \
  --format='yaml(metadata.annotations,spec.template.metadata.annotations)'
```

**Debe ver:** el cuerpo de `/health` con estado correcto, y entre las anotaciones
`run.googleapis.com/cpu-throttling: 'true'`, `autoscaling.knative.dev/maxScale: '1'`
y la de la comprobación del invocador desactivada,
`run.googleapis.com/invoker-iam-disabled: 'true'`.

**Si el despliegue falla en «Despliegue en Cloud Run»** con el servicio ya
creado, el tráfico sigue en la revisión anterior: Cloud Run sólo lo mueve cuando
la nueva pasa la sonda de arranque (`/ready`). La causa está en los registros:

```bash
gcloud run services logs read "$SERVICIO" --region="$REGION" --limit=50
```

Lo típico: falta un secreto o su acceso (§6), o `/ready` no llega a 200 porque
la base no contesta. Un proyecto de Supabase del plan gratuito **se pausa tras
una semana sin actividad**: reactívelo en su panel.

---

## 11 · Cambio de modo

**Prelanzamiento → producción**, el día que se conecte el primer conjunto:
**Actions → desplegar-api → Run workflow**, modo `produccion`, y aprobar.

**Debe ver:** el despliegue en verde, y en las anotaciones
`run.googleapis.com/cpu-throttling: 'false'` y `autoscaling.knative.dev/minScale: '1'`.
Desde ese momento la instancia factura las 24 horas (§14).

**Producción → prelanzamiento**: lo mismo con `prelanzamiento`. Si el servicio
traía la sonda de vivacidad de producción, el flujo la quita.

El modo NO se cambia con `gcloud run services update` a mano. Funcionaría, pero
la próxima ejecución del flujo lo pisaría sin avisar.

---

## 12 · Reversión a la imagen anterior

Cada despliegue es una **revisión**, con su imagen y su modo. Volver atrás es
llevar el tráfico a la anterior, sin construir nada:

```bash
gcloud run revisions list --service="$SERVICIO" --region="$REGION" --limit=5
gcloud run services update-traffic "$SERVICIO" --region="$REGION" \
  --to-revisions=<revisión-anterior>=100
```

**Debe ver:** `Traffic: 100% <revisión-anterior>`, y `/health` en 200.

Tres cosas que conviene saber:

1. **La limpieza conserva dos imágenes** (§4): la reversión alcanza a la
   anterior, no a la de hace tres despliegues.
2. La revisión anterior vuelve **con su modo**: si era de prelanzamiento, vuelve
   la facturación por solicitud.
3. Para que el siguiente despliegue vuelva a llevarse el tráfico:
   `gcloud run services update-traffic "$SERVICIO" --region="$REGION" --to-latest`.
   Mientras no lo haga, una revisión nueva se crea pero no recibe tráfico.

Antes de revertir, `DESPLIEGUE.md` §12 sigue valiendo: las migraciones no se
revierten en caliente.

---

## 13 · Rotar un secreto y destruir la versión anterior

**Cada versión activa cuenta**, y una deshabilitada también: Secret Manager
cobra las versiones «habilitadas y deshabilitadas»; sólo la **destruida** es
gratis. Con siete secretos ya hay una versión fuera de la capa gratuita; cada
rotación que no destruya la anterior suma otra.

1. Versión nueva (por la entrada estándar, como en el §6):

   ```bash
   read -rs -p "Valor nuevo: " VALOR; echo
   printf '%s' "$VALOR" | gcloud secrets versions add <secreto> --data-file=-
   unset VALOR
   ```

2. Desplegar de nuevo (el flujo, en el modo actual). Los secretos se montan como
   `:latest` y se leen al **arrancar** cada instancia: la revisión nueva ya usa
   el valor nuevo.
3. Comprobar `/health` y que la API trabaja.
4. **Destruir la anterior.** Es irreversible:

   ```bash
   gcloud secrets versions list <secreto>
   gcloud secrets versions destroy <número-anterior> --secret=<secreto>
   ```

**`EQUIPOS_LLAVE` no se rota así:** antes de destruir nada hay que recifrar
(`CONEXION_SUPABASE.md` §13.3). Si destruye la anterior sin recifrar, las
credenciales cifradas con ella dejan de abrirse. **`BIOMETRIA_LLAVE`** es igual
de delicada y **no tiene** herramienta de recifrado: no la rote mientras haya
plantillas cifradas con ella (deuda DT-154-01).

**`API_IP_FIRMA_SECRETO`** vive también en Netlify: tras el paso 1, cópielo con
`DESPLIEGUE_NETLIFY.md` §3 y despliegue **también la consola** antes del paso 4.
Mientras sólo una de las dos tenga el valor nuevo, la lista blanca de porteros
niega a todos.

[SUPUESTO] S-154-02 · `:latest` y no una versión fijada, que es lo que la
documentación de Cloud Run recomienda. Con versiones fijas, cada rotación
obligaría a cambiar `secretos.txt` en el repositorio. Con `:latest`, el orden
de arriba —añadir, desplegar, comprobar, destruir— deja como mucho dos versiones
activas, y sólo durante la rotación.

---

## 14 · Costos: qué cabe en la capa gratuita

Las cifras son de la página de precios de Cloud Run (consultada el 2026-11-06).
La capa gratuita se aplica por **cuenta de facturación**, como descuento a
precio de Tier 1.

**Prelanzamiento (por solicitud).** Capa gratuita mensual: 180 000 vCPU-s,
360 000 GiB-s y 2 millones de peticiones. Con 1 vCPU y 512 MiB:

| Recurso | Capa gratuita  | Consumo por hora activa | Horas activas que caben |
| ------- | -------------- | ----------------------- | ----------------------- |
| CPU     | 180 000 vCPU-s | 3 600 vCPU-s            | **50 h**                |
| Memoria | 360 000 GiB-s  | 1 800 GiB-s             | 200 h                   |

Manda la CPU: **unas 50 horas de instancia activa al mes**. «Activa» es una
instancia con al menos una petición en curso, más su arranque y su apagado.
Cien visitas de un minuto son menos de dos horas.

> **Lo que se come las 50 horas: una conexión que no se cierra.** La
> documentación de Cloud Run es explícita: una instancia con una conexión
> WebSocket abierta «se considera activa» y se factura. Con un SSE pasa lo mismo:
> es una petición que no termina. Una pestaña de la consola olvidada con el
> canal en vivo, o un Edge conectado, mantienen la instancia activa las 24
> horas. Fuera de la capa gratuita, cada hora activa cuesta unos USD 0,09, así
> que un mes entero con un canal abierto saldría por **unos USD 62**. Es **más
> que producción** (abajo), porque el precio por segundo de la facturación por
> solicitud es mayor.

**Cómo verlo:** la métrica `container/billable_instance_time` (Monitoring →
Explorador de métricas → recurso «Cloud Run Revision» → métrica «Billable
instance time»), o desde Cloud Shell:

```bash
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/container/billable_instance_time" AND resource.labels.service_name="'"$SERVICIO"'"' \
  --interval-start-time="$(date -u -d '-1 day' +%Y-%m-%dT%H:%M:%SZ)"
```

[SUPUESTO] S-154-03 · el nombre completo con el prefijo `run.googleapis.com/`.
La página de precios sólo da `container/billable_instance_time`. (`date -d` es
de GNU: funciona en Cloud Shell, no en un Mac.)

**Producción (por instancia).** Capa gratuita: 240 000 vCPU-s y 450 000 GiB-s.
Una instancia encendida todo el mes son unos 2,6 millones de segundos:

- CPU: (2 628 000 − 240 000) × USD 0,000018 ≈ **USD 43**;
- memoria: (1 314 000 − 450 000) × USD 0,000002 ≈ **USD 1,7**.

En total, **unos USD 45 al mes** por la API. [Probable]: a precio de Tier 1 y
sin descuentos por compromiso de uso.

**Lo demás, en prelanzamiento:**

- **Artifact Registry:** 0,5 GB gratis. Dos imágenes de 74 MB comprimidas
  (medidas, §15) caben de sobra.
- **Secret Manager:** 6 versiones activas y 10 000 accesos al mes gratis. Siete
  secretos con una versión cada uno: **USD 0,06 al mes**. Los accesos ocurren al
  arrancar cada instancia: siete por arranque.
- **Peticiones:** 2 millones al mes gratis.

---

## 15 · El prelanzamiento, medido

Medido el 2026-11-06 con la **imagen real** (`docker run`), limitada a 1 vCPU y
512 MiB, contra PostgreSQL local y el doble de GoTrue del repositorio. No es
Cloud Run: la PR 3 lo mide allí.

| Medida                                     | Resultado                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Tamaño                                     | **230 MB** sin comprimir · **74 MB** comprimida (lo que guarda Artifact Registry)       |
| Del arranque del contenedor a `/ready` 200 | **2,0–2,4 s** (8 repeticiones; con y sin pg-boss). La primera, con la caché fría, 7,1 s |
| Memoria en reposo                          | 70–73 MiB de 512                                                                        |
| Cierre ante SIGTERM                        | 0,10–0,14 s, con «API cerrada: escuchas, latidos y pools terminados»                    |

**Arranque en frío.** Con unos 2 s **no hace falta inicialización diferida**. A
Cloud Run hay que sumarle la descarga de la imagen y la planificación de la
instancia, que no se pueden medir aquí. Si la PR 3 midiera más de unos 10 s, lo
primero sería diferir las comprobaciones de recursos externos que ya corren
después de `listen` (`main.ts`). No toca el dominio.

**pg-boss con la CPU parada.** Prueba: el contenedor congelado 11 minutos con
`docker pause`, que es el caso peor de «CPU sólo durante las peticiones», con el
servidor cortando las sesiones ociosas a los 120 s, como haría un pooler.

- **Al despertar:** la primera petición, `/ready`, respondió 200 en 66 ms, sin
  una sola línea de error. El pool descarta las conexiones cortadas
  (`pool.on('error')`, 15-O).
- **Sin duplicados.** pg-boss **no recupera** los disparos perdidos mientras
  dormía: de los 11 de `ncr.revertir-puertas` (cada minuto) no repitió
  ninguno, y siguió con el del minuto en curso (3 ejecuciones en los 2,5 min
  despierto).
- **Consecuencia:** un trabajo programado **se retrasa** hasta el primer
  disparo con la instancia despierta. Y si la instancia se apaga (mínimo 0),
  hasta el siguiente arranque.

[Probable] Cloud Run, al estrangular la CPU, no la congela del todo como
`docker pause`. Si algo cambia, es a mejor.

### 15.1 RN-11 en prelanzamiento · PENDIENTE DE DEFINICIÓN P-44

RN-11 exige suprimir la plantilla biométrica **dentro de las 24 h** de su
vencimiento, y la ejecuta `ncr.barrer-plantillas` cada 6 h. Con la CPU sólo
durante las peticiones, o con la instancia apagada, ese barrido **no corre**: un
fin de semana sin visitas lo deja sin ejecutarse más de 24 h. **En
prelanzamiento, la supresión en 24 h no está garantizada.**

**Regla mientras P-44 siga abierta:** en prelanzamiento **no se cargan datos
biométricos de terceros**. Sólo datos de prueba de personas del equipo que lo
consienten sabiendo esto.

**Propuesta (no construida): disparar el barrido desde Cloud Scheduler con
OIDC.** Un trabajo de Cloud Scheduler cada 6 h haría un `POST` a una ruta
interna de la API, con un token OIDC firmado por una cuenta de servicio propia
del programador. La API validaría el token (emisor de Google, audiencia = la
URL del servicio, `email` = esa cuenta) y ejecutaría el barrido **dentro de la
petición**, que es cuando hay CPU. Exige una ruta nueva en presentación y su
guarda; ni dominio ni aplicación cambian, porque el caso de uso ya existe
(`BarrerPlantillasVencidas`). Coste: 3 trabajos de Cloud Scheduler gratis por
cuenta de facturación. Con eso P-44 podría cerrarse antes de producción, si se
quisiera cargar biometría real en prelanzamiento.

### 15.2 El canal en vivo con la pestaña oculta · propuesta (no implementada)

La consola podría **cerrar el SSE** cuando la pestaña pasa a oculta
(`document.visibilityState === 'hidden'`) o tras N minutos sin actividad, y
reabrirlo al volver: un billete nuevo, como ya hace al reconectar
(`CONSOLA_EN_RED_Y_DESPLIEGUE.md` §7.1). Es un cambio en la consola, que es la
PR 2. Lo que no puede resolver es un **Edge** conectado: su túnel es permanente
por diseño (ADR-035), y por eso un conjunto conectado es precisamente el
momento de pasar a producción (D-157).
