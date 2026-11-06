# ADR-040 · La API en Cloud Run: una instancia, y dos modos de facturación (prelanzamiento y producción)

|               |                                                                                                                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**    | Aceptada · 2026-11-06 · **decisiones del cliente D-154 a D-159** (gerencia, «Opción A»)                                                                                                                                                                                                            |
| **Precisa**   | [ADR-028](ADR-028-la-consola-en-netlify-y-la-api-en-un-servidor.md): el «servidor con procesos permanentes» que dejaba sin elegir es **Cloud Run**. [ADR-035](ADR-035-el-edge-es-el-puente-local-permanente.md): «la API irá en Cloud Run» queda decidido, con una instancia. **No los reescribe** |
| **Sustituye** | Nada                                                                                                                                                                                                                                                                                               |
| **Afecta a**  | `apps/api/Dockerfile` · `.dockerignore` · `apps/api/cloud-run/` · `.github/workflows/desplegar-api.yml` · `docs/guias/DESPLIEGUE_CLOUD_RUN.md` · `DESPLIEGUE.md` §4.4 y §13 · `CONSOLA_EN_RED_Y_DESPLIEGUE.md` §7.4                                                                                |

---

## Contexto

ADR-028 fijó el reparto —la consola en Netlify, la API en un servidor con
procesos permanentes— y dejó el proveedor abierto. Antes de elegirlo se evaluó,
y se **descartó**, alojar la API en **Supabase Edge Functions**: tope de reloj
de 150 s (400 s en planes de pago), 2 s de CPU por petición y runtime Deno. No
caben los túneles de los Edge (ADR-035), el audio de la guardia, el SSE ni
pg-boss.

El 2026-11-06 no hay ningún conjunto conectado. Pagar una instancia encendida
las 24 horas para nadie es el gasto que gerencia quiere evitar.

## Decisión (del cliente)

| D         | Decisión                                                                                                                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-154** | **Opción A:** Supabase (datos, autenticación, storage) + **API en Cloud Run, UNA instancia** + consola en Netlify + un Edge puente por conjunto                                                       |
| **D-155** | **El Edge de cada conjunto lo paga el conjunto**, no Next Control                                                                                                                                     |
| **D-156** | **Sin dominio propio** por ahora: `*.run.app` y `*.netlify.app`                                                                                                                                       |
| **D-157** | **Dos modos.** **Prelanzamiento** (hoy, sin clientes): facturación por solicitud, mínimo 0 instancias, objetivo ≈ USD 0/mes. **Producción** (al conectar el primer conjunto): por instancia, mínimo 1 |
| **D-158** | Supabase y Netlify en **plan gratuito** durante el prelanzamiento; **plan Pro** al primer cliente, con el costo trasladado a los clientes                                                             |
| **D-159** | **Aplazados hasta el primer cliente:** coturn (video remoto, `COTURN.md`) y el Edge piloto                                                                                                            |

Cómo se materializa:

- **Una imagen** (`apps/api/Dockerfile`), multi-etapa: Node exacto de `.nvmrc`,
  instalación con `--frozen-lockfile`, sólo dependencias de producción, y el
  proceso como `node` sin poder reescribir su propio código.
- **Un flujo** (`desplegar-api.yml`), sólo a mano, con aprobación en el
  environment «nube» y credencial de **Workload Identity Federation**, sin
  llaves JSON. El modo se elige al lanzarlo.
- **La configuración sale del repositorio sin valores**: los nombres de las
  variables (`cloud-run/variables.yaml`) y los de los secretos
  (`cloud-run/secretos.txt`). Los valores los carga Argenis en GitHub y en
  Secret Manager.

## Lo que es igual en los dos modos

`--max-instances=1` (los túneles viven en memoria, `DESPLIEGUE.md` §4.4),
`--cpu=1 --memory=512Mi`, `--timeout=3600` y `--concurrency=1000`, que son los
máximos de Cloud Run, el servicio público por `--no-invoker-iam-check` y la
sonda de arranque contra `/ready`.

## Lo que cambia entre los dos modos

| Banderas y efectos       | Prelanzamiento                                                         | Producción                            |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------- |
| Facturación              | por solicitud (`--cpu-throttling`)                                     | por instancia (`--no-cpu-throttling`) |
| Mínimo de instancias     | 0                                                                      | 1                                     |
| Sonda de vivacidad       | ninguna: Cloud Run factura la CPU de cada sonda                        | `/health` cada 30 s                   |
| pg-boss y temporizadores | **congelados entre peticiones**; retoman al despertar (medido, §C10)   | corren siempre                        |
| Túneles de Edge          | no hay conjuntos; uno abierto mantendría la instancia facturando       | permanentes                           |
| RN-11 (supresión ≤ 24 h) | **no garantizada**: P-44, y no se cargan datos biométricos de terceros | garantizada por el barrido de pg-boss |

## Consecuencias

1. **[CONTRADICCIÓN] C-69**, resuelta por D-157: `DESPLIEGUE.md` §4.4 y
   `CONSOLA_EN_RED_Y_DESPLIEGUE.md` §7.4 exigen «CPU siempre asignada» y
   mínimo 1. Esas exigencias **siguen valiendo para producción** y no se
   relajan. El prelanzamiento las incumple a sabiendas, sólo mientras no haya
   un conjunto conectado.
2. **El paso a producción es un cambio de modo, no de código**: se relanza el
   flujo con `modo=produccion`. La guía tiene el procedimiento y su reverso.
3. **`API_PROXIES_DE_CONFIANZA=1`.** Cloud Run no documenta desde qué
   dirección llega su frontal al contenedor. Una lista de IP o CIDR obligaría a
   suponerla, así que se cuenta un salto: la última entrada de
   `X-Forwarded-For`, que es la que añade Google.
4. **El plazo del cierre ordenado baja de 10 a 8 s**, por debajo de los 10 s
   que Cloud Run da entre SIGTERM y SIGKILL.

## Alternativas descartadas

- **Supabase Edge Functions**, por los motivos del contexto.
- **Mínimo 1 desde hoy.** Es lo correcto en cuanto haya un conjunto, pero sin
  clientes es una instancia encendida para nadie (D-157).
- **Relajar la restricción de dominios de la organización** para dar
  `roles/run.invoker` a `allUsers`. Cloud Run documenta el camino contrario:
  desactivar la comprobación IAM del invocador es «la forma recomendada» de un
  servicio público, «cuando el proyecto está sujeto a la restricción de
  dominios».
- **Llaves JSON de cuenta de servicio en GitHub.** La organización las
  bloquea, y Workload Identity Federation no deja una credencial que se pueda
  filtrar.
