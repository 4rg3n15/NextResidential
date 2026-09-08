# Estado de las etapas

**Proyecto:** Next Control Residencial · **Contrato:** `CLAUDE.md` v3.0
**Última actualización:** 2026-09-08 · al cierre de la **ETAPA 07**

> **Regla añadida al DoD de toda etapa (usuario, 2026-09-08).** El cierre de una
> etapa actualiza **la cabecera y el mapa de etapas de este documento**, no solo
> su ficha de detalle. La cabecera se quedó congelada en el estado de la ETAPA 00
> durante seis etapas —decía «2 de 17 cerradas» con cuatro fichas más marcadas
> `CERRADA` unos párrafos más abajo— porque nadie la tenía asignada. Ahora está
> asignada: sin este apartado actualizado, la etapa no se cierra.

**Cómo se lee este documento.** Es la única fuente de verdad sobre qué está hecho. `CLAUDE.md` §2.1.2 lo hace vinculante: **una etapa no se ejecuta si la anterior no está cerrada aquí.**

**Estados posibles:** `CERRADA` · `EN CURSO` · `PENDIENTE` · `BLOQUEADA`

---

## Resumen

|                                |                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------- |
| **Etapas cerradas**            | **7 de 17** (ETAPAS 00 a 07)                                                  |
| **Etapa siguiente habilitada** | **ETAPA 08 — Biometría: consentimiento, calidad y supresión**                 |
| **Bloqueos activos**           | Ninguno. Sin contraseña de PostgreSQL en runtime (D-17), declarado            |
| **Contradicciones abiertas**   | Ninguna (14 registradas, 14 resueltas)                                        |
| **Decisiones pendientes**      | 7 abiertas — P-04 resuelta en la ETAPA 07                                     |
| **Supuestos vigentes**         | 10 — S-09 **cerrado por implementación**; nuevo S-17 (zona común restringida) |
| **Extensiones al contrato**    | 1 — E-01 `FUERA_DE_HORARIO`, aprobada                                         |

---

## Mapa de etapas

| Etapa  | Nombre                                                        | Rama                                   | Depende de                       | Estado                           | Informe                        |
| ------ | ------------------------------------------------------------- | -------------------------------------- | -------------------------------- | -------------------------------- | ------------------------------ |
| **00** | Auditoría documental y plan maestro                           | `etapa00` ⚠️                           | —                                | **CERRADA**                      | [ETAPA-00](etapas/ETAPA-00.md) |
| 01     | Modelo de datos y Supabase + guía de conexión                 | `etapa-01-modelo-datos-supabase`       | 00 ✅                            | **CERRADA**                      | [ETAPA-01](etapas/ETAPA-01.md) |
| 02     | Andamiaje del monorepo y núcleo hexagonal                     | `etapa-02-andamiaje-monorepo`          | 01 ✅                            | **CERRADA**                      | [ETAPA-02](etapas/ETAPA-02.md) |
| 03     | Auth, RBAC, MFA y aislamiento multiempresa                    | `etapa-03-auth-rbac-multiempresa`      | 02 ✅                            | **CERRADA**                      | [ETAPA-03](etapas/ETAPA-03.md) |
| 04     | Padrón: viviendas, residentes, vehículos                      | `etapa-04-padron`                      | 03 ✅                            | **CERRADA**                      | [ETAPA-04](etapas/ETAPA-04.md) |
| 05     | Autorizaciones y motor de reglas + MockProvider               | `etapa-05-autorizaciones-motor-reglas` | 04 ✅                            | **CERRADA**                      | [ETAPA-05](etapas/ETAPA-05.md) |
| 06     | Eventos, auditoría inmutable, alertas, tiempo real            | `etapa-06-eventos-auditoria`           | 05 ✅                            | **CERRADA**                      | [ETAPA-06](etapas/ETAPA-06.md) |
| 07     | Zonas comunes: horario y aforo                                | `etapa-07-zonas-comunes`               | 06 ✅                            | **CERRADA**                      | [ETAPA-07](etapas/ETAPA-07.md) |
| 08     | Biometría: consentimiento, calidad, sincronización, supresión | `etapa-08-biometria-consentimiento`    | 06 ✅                            | **PENDIENTE** — habilitada       | —                              |
| 09     | Consola web de administración                                 | `etapa-09-consola-administracion`      | 07, 08                           | PENDIENTE                        | —                              |
| 10     | Consolas de portería y guardia virtual                        | `etapa-10-consolas-operativas`         | 09                               | PENDIENTE                        | —                              |
| 11     | App móvil Flutter del residente                               | `etapa-11-app-flutter-residente`       | 09                               | PENDIENTE                        | —                              |
| 12     | Edge Gateway: offline y reconciliación                        | `etapa-12-edge-gateway-offline`        | 06 ✅                            | **PENDIENTE** — habilitada       | —                              |
| 13     | Auditoría de ciberseguridad y endurecimiento                  | `etapa-13-auditoria-seguridad`         | 12                               | PENDIENTE                        | —                              |
| 14     | Observabilidad, CI/CD, PWA instalable y escritorio            | `etapa-14-cicd-pwa-escritorio`         | 13                               | PENDIENTE                        | —                              |
| 15     | Integración real con hardware Hikvision                       | `etapa-15-integracion-hikvision`       | 14                               | **PENDIENTE — con precondición** | —                              |
| 16     | Documentación técnica final y README                          | `etapa-16-documentacion-final`         | 14 (ejecutable), 15 (definitiva) | PENDIENTE                        | —                              |

> ⚠️ **Desviación de nomenclatura registrada.** `CLAUDE.md` §2.5 exige ramas `etapa-NN-slug`; la ETAPA 00 se ejecutó en **`etapa00`** por indicación expresa del usuario. A partir de la ETAPA 01 se retomó la convención del contrato.
>
> **Regla de ramificación fijada por el usuario el 2026-09-06, vinculante en adelante:** > **cada rama de etapa se saca de `develop` actualizado, nunca de la rama de la etapa anterior.**
> La rama de la ETAPA 01 se creó antes de esta instrucción, desde `etapa00`, y se
> corrigió fusionando `develop` en ella (merge `61e8efd`, sin reescribir historia).
> Procedimiento para la ETAPA 02 en adelante:
>
> ```
> git fetch origin && git checkout develop && git pull --ff-only
> git checkout -b etapa-NN-slug
> ```

**Precondición de la ETAPA 15** (`CLAUDE.md` §6): se ejecuta **solo** cuando el usuario tenga acceso al equipo y entregue un prompt adicional con la documentación ISAPI del modelo concreto, IPs, credenciales y llaves de referencia.

---

## ETAPA 00 — Auditoría documental y plan maestro · **CERRADA**

**Rama:** `etapa00` · **Cierre:** 2026-09-06 · **Informe:** [`etapas/ETAPA-00.md`](etapas/ETAPA-00.md)

### Entregables

| Entregable                               | Ruta                                                | Estado |
| ---------------------------------------- | --------------------------------------------------- | ------ |
| Auditoría de la solicitud                | `docs/auditoria/00-solicitud.md`                    | ✅     |
| Legibilidad e inventario de requisitos   | `docs/auditoria/01-legibilidad-requisitos.md`       | ✅     |
| Auditoría de arquitectura                | `docs/auditoria/02-arquitectura.md`                 | ✅     |
| Auditoría de mockups y sistema de diseño | `docs/auditoria/03-mockups.md`                      | ✅     |
| Requisitos no funcionales                | `docs/auditoria/04-requisitos-no-funcionales.md`    | ✅     |
| Matriz de trazabilidad consolidada       | `docs/auditoria/matriz-trazabilidad-consolidada.md` | ✅     |
| Contradicciones y supuestos              | `docs/auditoria/contradicciones-y-supuestos.md`     | ✅     |
| ADR formalizados (5)                     | `docs/decisiones/`                                  | ✅     |
| Estado de etapas                         | `docs/ESTADO_ETAPAS.md`                             | ✅     |
| Informe de cierre                        | `docs/etapas/ETAPA-00.md`                           | ✅     |

### Definición de Terminado

| Criterio                                         | Resultado                        |
| ------------------------------------------------ | -------------------------------- |
| 38 HU asignadas a etapa concreta                 | ✅ 38/38                         |
| 26 CA asignados a etapa concreta                 | ✅ 26/26                         |
| 37 KPI asignados a etapa concreta                | ✅ 37/37                         |
| Ninguno huérfano                                 | ✅ Verificado por reparto y suma |
| Toda contradicción documentada con su resolución | ✅ 14/14                         |

### Verificación de la línea base de `CLAUDE.md` §1

Inventario contrastado contra el `.docx` original: **coincide punto por punto**.
Confirmado: **`KPI-19` no existe** · la entrada 21 figura como **`KP1-21`** · el total real de indicadores es **37, no 38**.

---

## ETAPA 01 — Modelo de datos y Supabase · **CERRADA**

**Rama:** `etapa-01-modelo-datos-supabase` · **Base:** `develop` · **Cierre:** 2026-09-06
**Ejecutada en dos pasos por indicación del usuario:** 01-A diseño para aprobación, 01-B implementación.

### Entregables

| Entregable                                                | Ruta                                               | Estado |
| --------------------------------------------------------- | -------------------------------------------------- | ------ |
| Diseño del modelo de datos                                | `docs/arquitectura/modelo-datos.md`                | ✅     |
| 16 migraciones versionadas, idempotentes y reversibles    | `supabase/migrations/`                             | ✅     |
| Guiones de reversión, uno por migración                   | `supabase/reversion/`                              | ✅     |
| Matriz RLS y suite de verificación                        | `supabase/policies/`                               | ✅     |
| Semillas de dos copropiedades ficticias                   | `supabase/seed/seed.sql`                           | ✅     |
| Verificador local, sin credenciales                       | `supabase/verificar.sh`                            | ✅     |
| Guía de conexión                                          | `docs/guias/CONEXION_SUPABASE.md`                  | ✅     |
| Diseño de verificación asimétrica (insumo de la ETAPA 03) | `docs/arquitectura/verificacion-jwt-asimetrica.md` | ✅     |
| `.env.example` por aplicación                             | `apps/*/.env.example`                              | ✅     |
| Informe de cierre                                         | `docs/etapas/ETAPA-01.md`                          | ✅     |

### Definición de Terminado

| Criterio                                                         | Resultado                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Las migraciones corren limpias sobre una base vacía              | ✅ Verificado sobre PostgreSQL 16.13                                      |
| RLS activa en el 100 % de las tablas                             | ✅ **42/42** (31 tablas + 11 particiones), activa **y forzada**           |
| Cada RN de integridad tiene contraparte estructural identificada | ✅ 22/22 · `modelo-datos.md` §10                                          |
| _(añadido)_ Idempotencia                                         | ✅ Tres pasadas consecutivas sin error ni cambio                          |
| _(añadido)_ Reversibilidad                                       | ✅ Ciclo completo aplicar → revertir → aplicar, 0 objetos residuales      |
| _(añadido)_ KPI-03                                               | ✅ 100 inserciones concurrentes reales: 1 aceptada, 99 rechazadas, 1 fila |

### Cifras del esquema

31 tablas lógicas · **10 particiones** de `eventos` en un despliegue limpio · 31 enumerados · 95 políticas RLS · **18 migraciones** · 18 guiones de reversión.

> **Precisión sobre el recuento de particiones (2026-09-06).** El informe de cierre decía «11 particiones»: era el número que deja la **suite de pruebas**, que crea una partición adicional a propósito para verificar que nace protegida. Un `supabase db push` limpio deja **10** — la ventana de `app.mantener_particiones_eventos(6, 3)`: seis meses atrás, el actual y tres adelante.
>
> Si al consultar el proyecto real aparecen **80** y **41**, ambos números son correctos y no hay nada que revisar:
>
> | Consulta                                 | Resultado | Por qué                                                                                                                           |
> | ---------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
> | `pg_class WHERE relispartition`          | **80**    | Cuenta particiones de tabla **y de índice**. `eventos` tiene 7 índices, y cada uno se particiona con ella: 10 tablas + 70 índices |
> | `information_schema.tables … BASE TABLE` | **41**    | 31 tablas lógicas + 10 particiones. Una partición es una tabla base a ojos de `information_schema`                                |
> | `pg_class WHERE relkind='p'`             | **1**     | **`eventos` es la única tabla particionada.** Es la comprobación que zanja la duda                                                |
>
> Reproducido localmente con las mismas cifras exactas.

> **Corrección del 2026-09-06 · esquema nuevo de llaves de Supabase.** El proyecto
> no tiene `anon` ni `service_role` como llaves de API, ni secreto JWT compartido:
> usa `sb_publishable_…`, `sb_secret_…` y **firma asimétrica verificada contra
> JWKS**. Se corrigieron los cuatro `.env.example` y la guía de conexión, y se
> escribió `docs/arquitectura/verificacion-jwt-asimetrica.md` como diseño
> vinculante de la ETAPA 03. **Ninguna migración cambió**: las llaves resuelven a
> los mismos roles de PostgreSQL y las políticas leen `request.jwt.claims`, que
> es indiferente al algoritmo de firma.
>
> **SEGUNDA TANDA DE HALLAZGOS del 2026-09-06 · el contenedor mentía.** La migración `0017` falló al aplicarse en Supabase gestionado. Al construir un arnés local que replica sus capacidades reales —rol dueño **no** superusuario: `./supabase/verificar.sh --modo-supabase`— aparecieron **tres defectos que una suite verde había estado ocultando**:
>
> | #   | Defecto                                                   | Por qué era invisible        | Corrección                                                            |
> | --- | --------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------- |
> | 1   | `0017` usaba 4 sentencias que exigen superusuario         | El contenedor lo era         | `0017` reescrita; el rol de conexión pasa a procedimiento de operador |
> | 2   | El **seed** era inaplicable: `FORCE RLS` alcanza al dueño | Un superusuario omite la RLS | El seed fija contexto de claims por tramo                             |
> | 3   | **Recursión infinita** en `app.es_mi_vivienda`            | Ídem: sin RLS no hay ciclo   | Migración `0018`                                                      |
>
> El tercero es el grave: `SECURITY DEFINER` **no** evita la RLS —solo cambia la identidad—, y con `FORCE` las políticas alcanzan al dueño. La política de `residentes` llamaba a una función que lee `residentes`. En Supabase habría estallado con «stack depth limit exceeded» en cuanto un residente consultara sus datos.

> **HALLAZGO CRÍTICO del 2026-09-06 · cerrado por la migración `0017`.** La verificación contra el proyecto real detectó que `eventos` **no estaba protegida**: `REVOKE UPDATE, DELETE` alcanzaba a los roles de aplicación pero no al **dueño** de las tablas, que en Supabase es `postgres` — el usuario de la cadena de conexión por defecto. RN-03, CA-23 y ADR-005 quedaban sin garantía estructural. Peor: la aserción que debía detectarlo llevaba `AND grantee <> 'postgres'`, excluyendo justamente al rol del hallazgo. Cerrado con `REVOKE` al dueño (incluido `TRUNCATE`), trigger `BEFORE UPDATE`, rol de conexión dedicado `app_api` y una aserción que ya no excluye a nadie. Enmienda 1 del ADR-005 · D-22 · guía §12.

> **Actualización del 2026-09-06.** Tras el cierre se incorporó la **política de retención** que el usuario fijó (P-12), como migración `0016`: plazos configurables por copropiedad, RN-11 convertida en cota superior por `CHECK`, y el libro append-only `purgas_retencion`. Los trabajos de purga son de las ETAPAS 06 y 14; aquí queda la política y dónde se acredita.

---

## ETAPA 02 — Andamiaje del monorepo y núcleo hexagonal · **CERRADA**

Monorepo pnpm + Turborepo, API NestJS que no arranca sin configuración completa, núcleo hexagonal con 21 tokens y los puertos de los nueve agregados, y fronteras impuestas por el linter. **DoD verificado por mutación**: seis violaciones introducidas a propósito y rechazadas; arranque sin `.env` abortado con `EX_CONFIG` (78). 27 pruebas, 100 % de cobertura en el dominio (umbral 90 %). Informe en `docs/etapas/ETAPA-02.md`; convenciones en `docs/arquitectura/CONVENCIONES.md`. Deudas nuevas: D-13 a D-16, [SUPUESTO] S-13.

> Verificación de la ETAPA 01 contra el proyecto real (2026-09-06): `pg_has_role(...,'authenticated','MEMBER')` → **true**, así que **D-12 queda cerrada** y el rol `app_api` es viable. `eventos` sin concesiones de UPDATE/DELETE y RLS activa y forzada: cero filas en ambas. La prueba de ejecución del `UPDATE` **quedó pendiente** por tabla de eventos vacía — es la única comprobación del cierre que no está demostrada por ejecución.

## ETAPA 03 — Auth, RBAC, MFA y aislamiento multiempresa · **CERRADA**

Verificación asimétrica del JWT contra JWKS (caché 10 min, suelo de refresco 60 s, HS256 rechazado), RBAC declarativo con denegación por defecto en los dos guards, MFA TOTP obligatorio para los tres roles administrativos, y barrera de aislamiento en la capa de aplicación además de la RLS. **Suite de aislamiento que enumera el enrutador** y recorre los cuatro caminos; rompe el build ante cualquier fuga, comprobado por mutación. 40 pruebas verdes; suite SQL verde en `--modo-supabase`. Corregido el defecto de la 02: `node dist/main.js` no leía `.env`. Informe en `docs/etapas/ETAPA-03.md`. Deudas nuevas: D-17 a D-19t, [SUPUESTO] S-14.

## ETAPA 04 — Padrón · **CERRADA**

VO `Placa` normalizado al construir, agregado `Vivienda` con métodos de intención, primer adaptador PostgreSQL real y carga transaccional desde CSV. **KPI-03 verificado a través del caso de uso contra base real: 100 intentos concurrentes → 1 aceptado, 99 rechazados, 1 fila activa.** RN-19 sin borrado físico, probado por inspección del adaptador y sometido a mutación. **94 pruebas en 15 ficheros** (33 dominio + 61 API), con cobertura medida **por capa**: dominio 97,09 %, aplicación 99,11 %, global 74,91 %. Informe en `docs/etapas/ETAPA-04.md`. Deudas nuevas: D-20t a D-23t, [SUPUESTO] S-15.

> **Corrección del 2026-09-07.** El informe de cierre reportó 51 pruebas verdes y en el entorno del usuario fallaron 3: la suite de la API corría contra un `packages/domain-core/dist` de una etapa anterior, porque `dist` está en `.gitignore` y `pnpm --filter <app> test` no dispara `turbo`. Corregido resolviendo `@ncr/domain-core` al **código fuente** en las pruebas. Se añadió `./scripts/verificar-etapa.sh` como **requisito de DoD de toda etapa** (§2.8.0 del contrato): parte de artefactos limpios, instala con `--frozen-lockfile` y comprueba que **ningún fichero de prueba se quedó sin ejecutar** — un fichero que no carga no cuenta como fallo, desaparece del recuento.

> **Cierre verificado del 2026-09-07 (Adenda 2).** Las cifras del cierre anterior se recalcularon **sin shell**, porque el «8 de 14» venía de un error de conteo y ese mismo shell midió el resto. Hallazgo serio: §2.4 exige 90 % también en **aplicación**, y esa capa **nunca se había medido** — estaba en 79,11 %, con `casos-de-uso.ts` al 48 %. Corregido a 99,11 % con 10 pruebas nuevas; el umbral se comprueba ahora por capa en cada cierre. Además: auditoría de portabilidad ampliada a **cuatro superficies** (`.sh`, `scripts` de `package.json`, `.husky/`, `run:` de workflows), versión de Node declarada en `.nvmrc`/`engines` y comprobada, y **pruebas negativas de los propios controles** automatizadas en el DoD y en CI (Linux y macOS).

> **Requisito registrado para la ETAPA 14 (CI/CD):** la suite `./supabase/verificar.sh --con-pruebas --modo-supabase` y la prueba de concurrencia KPI-03 deben ejecutarse **en CI**, no en el entorno del usuario. Hoy se omiten sin base local, y esa omisión avisa pero no protege.

## ETAPA 05 — Autorizaciones y motor de reglas · **CERRADA**

Motor de reglas como **función pura** `evaluarAcceso(contexto, reglas)`, con reloj inyectado, cero I/O y **100 % de cobertura de ramas** en `packages/domain-core/src/reglas/`. Precedencia vinculante `listaNegra > vigencia > patrón > zona` verificada con dos pruebas de CA-13. Agregado `Autorización` con `Vigencia` cerrado-abierta y `PatrónRecurrencia` con la zona horaria dentro del objeto de valor. Cuatro casos de uso y gestión de listas negras con RN-07 (quién veta ≠ quién levanta). `MockProvider` con los cuatro puertos, latencia, fallos, reintentos, duplicados y baja confianza, todo con generador **con semilla**. **KPI-11 comprobado por ejecución** (`scripts/lib/frontera-hardware.mjs`) en el verificador, en `verificar-frontera.sh` y en CI, con prueba negativa propia. Contrato de firma del Alarm Server (RNF-03.11): sin firma válida, 401. **206 pruebas en 25 ficheros**; cobertura por capa: dominio 99,29 % (ramas 100 %), aplicación 98,38 %, global **81,45 % medido en el contenedor Linux**. La ejecución posterior del usuario en macOS dio **81,78 %**; las dos son válidas y la diferencia no es un error: la cobertura global depende de qué ficheros recorre la corrida y de la máquina que la ejecuta. Se anota el entorno junto a la cifra para que la próxima comparación no parezca una discrepancia. Informe en `docs/etapas/ETAPA-05.md`. [SUPUESTO] S-15 **cerrado**. Deudas nuevas: D-25 a D-28.

> **Defecto de seguridad encontrado y corregido (D-24).** Los controladores de padrón y autenticación importaban sus DTOs con `import type`, lo que borra la clase al compilar y deja el `ValidationPipe` **inerte**: un POST con un tipo equivocado y un campo no declarado llegaba al manejador sin 400. Venía de las ETAPAS 03 y 04. Corregido, con `consistent-type-imports` desactivada en los controladores y una prueba de regresión (`validacion-dtos.e2e.test.ts`) verificada por mutación. Es el tercer caso de la misma familia: **un detalle del compilado que hace inerte un control sin ponerlo en rojo.**

> **Corrección de los dos defectos del verificador reportados desde macOS.** El paso 9 comparaba el contenido en memoria en vez de preguntarle a git, e informaba «package.json quedó alterado» con el árbol limpio; ahora las sondas operan sobre un **clon temporal fuera del árbol** y el estado se compara con `git status --porcelain=v1` antes y después. El paso 10 se colgaba porque la sonda de arranque levantaba la API de verdad en un equipo con `.env` completo; ahora usa `NCR_IGNORAR_ENV_FILE=1` y **todos los pasos tienen límite de tiempo** (`scripts/lib/con-limite.mjs`, portable BSD/GNU).

## ETAPA 06 — Eventos, auditoría inmutable, alertas y tiempo real · **CERRADA**

Agregado `Acceso` **inmutable** —congelado, sin un solo método que cambie su estado, con una prueba que enumera su prototipo y se pone roja si alguien añade uno—. Cierra **D-27**: la ingesta ya no solo acredita la firma, decide y persiste el camino entero (clave → decisión → evento → alerta → escalamiento → aviso). Idempotencia real por el libro `recepciones_evento` (migración **0019**), no particionado: el índice único de `eventos` debe incluir `ocurrido_en`, que **no es estable entre reintentos**, así que no podía deduplicar lo que el Edge reenvía. Histórico con filtro completo (cubre el hueco D-05 del mockup), paginación **por conjunto de claves** y exportación a CSV, Excel y PDF **sin dependencias nuevas**. Evidencia por URL firmada de vida corta (RN-21). **413 pruebas en 40 ficheros**; cobertura por capa medida en el contenedor Linux: dominio 99,58 % (ramas 100 %), aplicación 97,67 %, global 89,29 %. Informe en `docs/etapas/ETAPA-06.md`.

### El pendiente de la ETAPA 01, **cerrado por ejecución**

El cierre de la 01 anotó que la prueba del `UPDATE` sobre `eventos` quedaba sin hacer por tabla vacía. Ahora hay filas: `test/eventos-pg.test.ts` inserta un evento **por el adaptador de la aplicación**, intenta el `UPDATE` y el `DELETE` con el rol de conexión —dueño **no** superusuario, como en Supabase— y exige que ambos sean rechazados y que la fila siga intacta.

**Verificado por mutación:** con el trigger desactivado y el `UPDATE` reconcedido, la prueba se pone roja. El experimento dejó además un dato útil que ADR-005 afirmaba sin demostrar: **la RLS sí es la tercera capa** —el `UPDATE` afectó a 0 filas y la fila sobrevivió intacta—, pero **no lanza**, solo no hace nada. Por eso la prueba exige un error y no solo una fila sin alterar: un no-op silencioso no es «rechazar la operación» (CA-23).

### Hallazgo: una clave ajena hacia una tabla append-only es imposible

`alertas_evento_fk` (migración 0011) apuntaba a `eventos`. La comprobación de integridad referencial bloquea la fila referenciada con `SELECT … FOR KEY SHARE`, y PostgreSQL exige para ese bloqueo el privilegio UPDATE o DELETE **además** del SELECT — que ADR-005 revoca a todos, dueño incluido. Toda inserción en `alertas` con `evento_id` habría fallado con «permission denied for table eventos».

Vivió cinco etapas invisible porque las dos tablas estaban vacías: **una restricción que nunca se ejerce no se distingue de una que funciona.** Es la cuarta de la misma familia. Corregido en la migración **0021**, que también arregla el gemelo `consent_evidencia_fk` → `evidencias` (lo destapó su propia aserción general) y deja `scripts/lib/frontera-append-only.mjs` como **sexto control con prueba negativa**, que lo detecta al escribir la migración y no al aplicarla.

### P-06 y P-07, resueltas

| ID   | Decisión                      | Resolución del usuario (2026-09-07)                                                                                                                                                               |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-06 | Umbral de latido              | Conservador y **configurable por copropiedad** (migración 0020): latido cada 60 s, 1 latido tolerado, caído a los 300 s. Tres estados —`saludable`, `degradado`, `caido`— y solo el último alerta |
| P-07 | Definición de «acceso dudoso» | **Escalar en vez de decidir.** No es un motivo concreto: es toda decisión que el motor no pudo cerrar con certeza (4 casos enumerados en `politica-alertas.ts`), y su consecuencia es un humano   |

### KPI-25 medido bajo carga, no supuesto

200 eventos en ráfaga con 25 consolas SSE conectadas: **200/200 entregadas**, p50 2 ms, p95 5 ms, p99 9 ms, máximo 15 ms, contra un umbral de 10 000 ms. Detalle, escalera de contingencia y procedimiento para medir Supabase Realtime cuando haya credenciales: `docs/arquitectura/tiempo-real-y-contingencia.md`.

> **La prueba de carga encontró un defecto que no era la latencia.** La primera ejecución entregó **120 de 200** —exactamente el límite del `throttler` por IP— con 200 dispositivos distintos saliendo por una sola IP. El `@Throttle({ default: … })` de la ruta reconfigura el limitador `default` para **todos** los guards, incluido el global, que cuenta por IP. Era el defecto que el propio comentario del código decía evitar. En un conjunto real todas las cámaras comparten enrutador: el tope las habría sumado a todas y habría empezado a rechazar eventos en silencio. Corregido con dos limitadores **con nombre** (`default` por IP, `dispositivo` por equipo firmante), cerrando D-28.

> **Tres correcciones al propio verificador.** (1) `supabase/verificar.sh` concedía la pertenencia a `authenticated` **antes** de aplicar las migraciones; en PostgreSQL 16 un rol con `CREATEROLE` que crea otro recibe sobre él una pertenencia implícita con `set_option = false` que **sustituye** a la anterior, así que en un clúster limpio la suite SQL no podía ni arrancar (`permission denied to set role`). Solo se veía en una máquina nueva: los roles son de ámbito de clúster y `DROP DATABASE` no los borra. (2) El paso de base real daba **verde con el servidor caído**, porque esas pruebas se omiten solas y el guion leía la omisión como éxito. Ahora comprueba la marca `OMITIDA`: una omisión no es un verde. (3) `metricas.mjs` imprimía «(sin resumen de cobertura)» y **seguía**: una ejecución informó «las tres capas cumplen su umbral» midiendo 21 archivos en vez de 83, con la capa de aplicación desaparecida. Ahora una capa sin medir es fallo.

## ETAPA 07 — Zonas comunes: horario y aforo · **CERRADA**

Agregado `Zona` con `Aforo`, `HorarioDeZona` y política de reinicio; casos de uso `ConfigurarZona`, `AutorizarZonaAVisitante`, `ValidarAforo` y `LiberarAforo`; adaptadores PostgreSQL y en memoria; superficie HTTP bajo `/copropiedades/:id/zonas`. La zona entra al contexto del motor **ya resuelta** por el puerto `ResolutorDeZona`: el motor no consulta nada, sigue siendo la función pura de la ETAPA 05. **538 pruebas en 47 ficheros**; cobertura por capa medida en el contenedor Linux: dominio 99,67 % (ramas 99,21 %), aplicación 97,82 %, global 88,30 %, y el paso 14 exige que tres corridas den lo mismo. Informe en `docs/etapas/ETAPA-07.md`.

### El aforo lo garantiza la base, y la mutación demuestra por qué

El adaptador ocupa una plaza con una sola sentencia:

```
UPDATE public.zona_aforo SET conteo_actual = conteo_actual + 1
 WHERE copropiedad_id = $1 AND zona_id = $2 AND conteo_actual < aforo_maximo
RETURNING conteo_actual
```

**Cero filas devueltas ES el aforo superado.** No hay `SELECT` previo, así que no hay ventana entre comprobar y ocupar. `test/aforo-concurrencia.test.ts` lanza **50 ingresos simultáneos por 50 conexiones distintas** sobre una zona de 10 plazas: entran 10, y los conteos devueltos son 1..10 sin repetirse.

> **Lo que enseñó la mutación.** Sustituido el incremento atómico por una lectura seguida de una escritura, **los 50 entraron y los 50 recibieron `conteo = 1`**. Y el `CHECK (conteo_actual <= aforo_maximo)` **no lo detectó**: cada escritura fijaba un valor absoluto —1— que nunca supera el máximo. El `CHECK` impide la fila inválida; el incremento atómico impide la carrera. No son redundantes: son las dos mitades de la misma garantía, y solo una prueba con concurrencia real las distingue.

La prueba está cableada en el **paso 13** de `verificar-etapa.sh`, junto a KPI-03 y la inmutabilidad de eventos, con la misma comprobación de `OMITIDA`. En memoria pasaría con cualquier implementación: JavaScript tiene un hilo y dos peticiones nunca coinciden.

### S-09 cerrado: la medianoche no reinicia el contador

Una jornada que cruza el día se modela con **dos franjas** enlazadas por `continua_del_dia_anterior` (migración `0007`, ETAPA 01). `HorarioDeZona.cierraJornada` solo reconoce cierre de jornada cuando una franja termina a las 24:00 **y no hay continuación al día siguiente**; si la hay, el corte es artificio de representación y `debeReiniciarAforo` devuelve `false`. Una fiesta de las 22:00 del sábado a la 01:00 del domingo no vacía el salón a medianoche.

### P-04 resuelta y S-17 nuevo

| ID   | Asunto                                                     | Resolución                                                                                                                                                                                                                                     |
| ---- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-04 | Reinicio del contador de aforo                             | **RESUELTA** — tres políticas por zona (`cierre_horario` por defecto, `manual`, `nunca`), columna `zonas.politica_reinicio_aforo`. Cubre CU-05 excepción 6a: salida no registrada por fallo de sensor no deja el contador inflado para siempre |
| S-17 | Toda zona común exige permiso explícito de la autorización | Es lo que separa CA-15 (`FUERA_DE_HORARIO`) de `ZONA_NO_AUTORIZADA` (CU-05 alterno 2a). Las zonas de paso se modelan sin `zonaId` en la solicitud. Conservador: sin permiso, se deniega                                                        |

### La prueba intermitente, resuelta antes de cerrar

La primera ejecución del usuario falló con `socket hang up` en la primera prueba HTTP de zonas y la segunda pasó sin tocar nada. No se cerró la etapa hasta hacerla determinista, porque **una intermitente enseña a reejecutar hasta el verde**.

**Causa, medida:** `crearApp` hacía `app.init()` y nunca `listen()`. `supertest`, si el servidor no escucha, lo levanta él en su constructor y lo **cierra** al terminar la petición. Instrumentado: **300 peticiones producían 300 `listen()` y 300 `close()`**, y el servidor terminaba sin escuchar; con `await app.listen(0)`, **un `listen()` y ningún `close()`**. La URL se fija en el constructor y la conexión se abre después: basta con que otra petición cierre el servidor en medio. Se descartó por ejecución la carrera de `keepAlive` —superagent manda `Connection: close`— y no hay temporizadores en `src/`. **No se reprodujo el fallo exacto en el contenedor** (ocho corridas completas y 120 ciclos de app nueva + primer golpe, todas verdes); lo que está medido es el mecanismo.

**Lo que destapó el arreglo:** con el servidor vivo afloró un `Unhandled Error` (ECONNRESET tras el `abort()` de la prueba SSE) que el cierre de `supertest` venía ocultando. Reescrita con `fetch` + `AbortController`.

**Revisión del resto de la suite:** el `sleep` de 200 ms de la medición KPI-25 pasa a espera por condición (`event: listo`); la placa de KPI-03 se generaba con los cuatro últimos dígitos del reloj —se repiten cada diez segundos, y en `vehiculos` no hay borrado— y las claves de `eventos-pg` con `Date.now()`: ambas con entropía real. Ese defecto **solo se ve ejecutando la suite dos veces**.

### Paso 14 · control genérico contra intermitencias

`scripts/lib/estabilidad.mjs` corre la suite **tres veces** y exige resultado idéntico: recuentos por paquete, ficheros, títulos en rojo y **errores no manejados**, que cuentan como fallo aunque las pruebas salgan verdes. Séptimo control con prueba negativa.

> **Dos trampas del propio control, encontradas antes de confiar en él.** Sin `TURBO_FORCE` la segunda corrida es `cache hit, replaying logs`: reimprime los números sin ejecutar nada — el falso verde más redondo posible. Y los códigos de color de Vitest impedían reconocer una sola línea de recuento: comparar dos firmas vacías daba «idéntico». Ahora fuerza la ejecución y falla si no reconoce ningún recuento.

### Hallazgo: `apps/api` lintaba solo `src`

`"lint": "eslint src"` dejaba **`apps/api/test/` —diez ficheros— fuera de ESLint en CI**. Solo lo veía el gancho de pre-commit, que es local y se puede saltar con `--no-verify`. Se destapó al intentar el commit de esta etapa: dos errores que `pnpm lint` había dado por buenos. Corregido a `eslint src test`. Misma familia que los anteriores: **un control que existe y no alcanza lo que cree alcanzar.**

## Etapas 08 a 16 — `PENDIENTE`

Sin trabajo iniciado. Cada etapa se habilita cuando la anterior queda cerrada.

### Insumos que la ETAPA 01 hereda de la 00

| Insumo                                                         | Dónde está                                               |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| Los **nueve** agregados raíz con sus invariantes y campos      | `02-arquitectura.md` §2.1                                |
| Mínimo de tablas y requisitos no negociables del esquema       | `CLAUDE.md` §6 ETAPA 01                                  |
| Invariantes que exigen contraparte estructural                 | `matriz-trazabilidad-consolidada.md` §2                  |
| ADR-004 (índices únicos parciales) y ADR-005 (`REVOKE`)        | `docs/decisiones/`                                       |
| Requisitos no funcionales de seguridad, auditoría e integridad | `04-requisitos-no-funcionales.md` RNF-03, RNF-04, RNF-08 |
| C-02 (nueve agregados) y C-22 (lectura correcta de KPI-01)     | `contradicciones-y-supuestos.md`                         |

---

## Registro de decisiones pendientes

Detalle completo en [`auditoria/contradicciones-y-supuestos.md`](auditoria/contradicciones-y-supuestos.md) §3.

| ID   | Decisión                                                    | Bloquea a partir de              | Estado                                                                          |
| ---- | ----------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------- |
| P-01 | Firma de documentos de cesión, confidencialidad y seguridad | _(condición contractual previa)_ | Abierta                                                                         |
| P-02 | Umbral de confianza de lectura de placa                     | ETAPA 15                         | Abierta — supuesto vigente: 0,85                                                |
| P-03 | Plazo de respuesta al consentimiento                        | ETAPA 08                         | Abierta — supuesto vigente: 24 h                                                |
| P-04 | Política de reinicio del contador de aforo                  | ETAPA 07                         | **RESUELTA** (ETAPA 07) — tres políticas por zona; `cierre_horario` por defecto |
| P-05 | Margen de vigencia del caché de reglas                      | ETAPA 12                         | Abierta — supuesto vigente: 24 h                                                |
| P-06 | Umbral de latido de dispositivo                             | ETAPA 06                         | **RESUELTA** (ETAPA 06) — 60 s / 1 tolerado / 300 s, por copropiedad            |
| P-07 | Definición de «acceso dudoso»                               | ETAPA 06                         | **RESUELTA** (ETAPA 06) — ante la duda, escalar a un humano                     |
| P-08 | Plataforma de despliegue de la API                          | ETAPA 14                         | Abierta                                                                         |
| P-09 | ¿Compuerta de aprobación administrativa?                    | ETAPA 05                         | Abierta — no se construye                                                       |
| P-10 | ¿Reservas de zonas sin cobro?                               | ETAPA 07                         | Abierta — no se construyen                                                      |
| P-11 | «Nivel de acceso» por residente                             | ETAPA 04                         | Abierta — valor por defecto restrictivo                                         |

---

## Deuda técnica acumulada

| ID   | Deuda                                                                                                                                                                                                                                             | Origen                  | Se salda en                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 | `CLAUDE.md` §2.2 declara 6 agregados raíz donde el diagrama declara 9                                                                                                                                                                             | C-02                    | Corrección del contrato, a decisión del usuario                                                                                        |
| D-02 | Dos pantallas no existen en los mockups: captura de rostro y consentimiento del visitante                                                                                                                                                         | M-02, M-03              | ETAPA 08 (diseño) · 11 (implementación)                                                                                                |
| D-03 | Los 5 estados obligatorios (vacío, cargando, error, sin permiso, offline) no están diseñados en ninguna de las 18 pantallas                                                                                                                       | `03-mockups.md` §4      | ETAPAS 09, 10, 11                                                                                                                      |
| D-04 | HU-03 (carga de padrón por archivo) sin punto de entrada en la interfaz                                                                                                                                                                           | M-04                    | ETAPA 09                                                                                                                               |
| D-05 | El filtro de eventos del mockup no cubre HU-32 (falta fecha y vivienda; solo XLS)                                                                                                                                                                 | M-08                    | ETAPA 09                                                                                                                               |
| D-06 | La consola operativa del mockup fusiona portería y guardia virtual y omite 4 exigencias                                                                                                                                                           | C-12                    | ETAPA 10                                                                                                                               |
| D-07 | 9 indicadores solo verificables con hardware; hasta entonces se reportan como «pendiente de hardware»                                                                                                                                             | ADR-003                 | ETAPA 15                                                                                                                               |
| D-08 | El dueño de las tablas (`postgres`) conserva `ALTER TABLE … DISABLE TRIGGER` sobre las append-only. Cerrarlo exigiría que el dueño no fuera `postgres`, lo que rompería `supabase db push`                                                        | ADR-005 Enmienda 1      | Mitigado por la aserción de `0017`; se reevalúa en la ETAPA 13                                                                         |
| D-09 | La base local corre con un dueño **superusuario** y Supabase no. Un `REVOKE` al dueño no se puede demostrar por ejecución en el contenedor, solo leyendo el ACL                                                                                   | Hallazgo del 2026-09-06 | `verificar.sh` lo declara en cada ejecución; verificación real contra el proyecto antes de cerrar cada etapa                           |
| D-10 | Las aserciones de las migraciones ya aplicadas (`0015`, `0016`) no se reejecutan: `supabase db push` solo aplica migraciones nuevas. Una corrección de aserción solo protege despliegues limpios                                                  | Hallazgo del 2026-09-06 | Toda corrección de garantía va en una migración **nueva**, nunca editando una aplicada                                                 |
| D-11 | `tg_usuario_tenant` evalúa una invariante (D-02) consultando `roles_usuario` **bajo RLS**: su veredicto depende de la visibilidad del llamante. Es `DEFERRABLE INITIALLY DEFERRED`, así que corre en el `COMMIT` con el contexto que quede activo | Arnés `--modo-supabase` | ETAPA 03, al definir el contexto de sesión de la API. Mitigado en el seed restaurando el contexto antes del `COMMIT` ([SUPUESTO] S-11) |
| D-12 | Que `postgres` pueda `GRANT authenticated TO app_api` es un supuesto sin verificar contra el proyecto real ([SUPUESTO] S-12). La documentación de Supabase concede en la dirección contraria                                                      | Enmienda 2 del ADR-005  | Sonda de `CONEXION_SUPABASE.md` §12.1, antes de crear el rol                                                                           |

---

## Deuda de la ETAPA 07

| ID   | Deuda                                                                                                                                                                                      | Se salda en                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| D-34 | El control de fronteras no exige que un módulo importe a otro **por su barril**: `multiempresa` y `salud` alcanzan el interior de `autenticacion` con rutas profundas, y nada se pone rojo | ETAPA 13. La violación de esta etapa (`zonas` → interior de `autorizaciones`) ya está corregida a mano; falta el control que la impida |
| D-35 | `RepositorioZonasPg` existe y se prueba contra base real, pero lo cableado en runtime es el doble en memoria                                                                               | Misma raíz que D-25: sin contraseña de PostgreSQL (D-17). La frontera es definitiva; cambia la fábrica y nada más                      |
| D-36 | El reinicio por `cierre_horario` se **proyecta al leer** y se persiste al ocupar: una zona que nadie toca en un mes conserva su fila con el conteo antiguo hasta el siguiente ingreso      | ETAPA 14, con pg-boss: un trabajo programado que lo aplique sin depender de que alguien entre                                          |
| D-37 | `LiberarAforo` no exige identificar a quién sale: el contador baja pero no consta qué plaza se liberó                                                                                      | ETAPA 10, cuando la portería registre la salida contra el evento de entrada                                                            |
| D-38 | El paso 14 ejecuta la suite tres veces: el cierre de etapa pasa de ~40 s de pruebas a ~2 min                                                                                               | Precio aceptado. ETAPA 14: en CI puede repartirse entre trabajos en paralelo                                                           |
| P-10 | «¿Reservas de zonas sin cobro?» sigue abierta: esta etapa construye **aforo y horario**, no reservas, aunque el mockup muestre «Reservas del día»                                          | Decisión del usuario. Fuera de alcance mientras no se resuelva                                                                         |

## Deuda de la ETAPA 06

| ID    | Deuda                                                                                                                                                                                               | Estado / se salda en                                                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-25  | Autorizaciones y listas negras sin adaptador PostgreSQL                                                                                                                                             | **Sigue abierta.** Sin contraseña (D-17). La FRONTERA quedó definitiva: `RepositorioEventosPg` cumple el mismo puerto que el doble y se prueba contra base real |
| D-27  | La ingesta aceptaba el evento sin persistirlo ni decidirlo                                                                                                                                          | **CERRADA** en la ETAPA 06                                                                                                                                      |
| D-28  | Rate limiting por dispositivo en la ingesta                                                                                                                                                         | **CERRADA** en la ETAPA 06, con el defecto del limitador `default` corregido                                                                                    |
| D-21t | Claims por petición al repositorio                                                                                                                                                                  | **CERRADA de facto**: `RepositorioEventosPg` recibe los claims por constructor y fija `request.jwt.claims` en la misma conexión que ejecuta la sentencia        |
| D-29  | `CanalEnProceso` reparte solo entre los suscriptores de SU proceso: con más de una instancia de API, un operador conectado a la B no ve lo publicado por la A                                       | ETAPA 14 — peldaño 1 de la escalera de contingencia (`LISTEN/NOTIFY`)                                                                                           |
| D-30  | El notificador push deja constancia y encola, pero no envía: FCM exige el registro de tokens del dispositivo del residente                                                                          | ETAPA 11                                                                                                                                                        |
| D-31  | `VigilarLatidos` es una operación idempotente sin planificador: nadie la invoca todavía                                                                                                             | ETAPA 14 (pg-boss)                                                                                                                                              |
| D-32  | El trigger que sustituye a las claves ajenas retiradas comprueba existencia **sin bloqueo de fila**: no protege de una referencia a una fila insertada en una transacción concurrente sin confirmar | Riesgo residual declarado. Consecuencia nula mientras no se borren eventos; se reevalúa en la ETAPA 13                                                          |
| D-33  | La exportación tiene tope de 10 000 filas y declara el truncado por cabecera; la consola debe mostrarlo                                                                                             | ETAPA 09                                                                                                                                                        |
