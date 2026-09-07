# Estado de las etapas

**Proyecto:** Next Control Residencial · **Contrato:** `CLAUDE.md` v3.0
**Última actualización:** 2026-09-06 · al cierre de la **ETAPA 00**

**Cómo se lee este documento.** Es la única fuente de verdad sobre qué está hecho. `CLAUDE.md` §2.1.2 lo hace vinculante: **una etapa no se ejecuta si la anterior no está cerrada aquí.**

**Estados posibles:** `CERRADA` · `EN CURSO` · `PENDIENTE` · `BLOQUEADA`

---

## Resumen

|                                |                                                                   |
| ------------------------------ | ----------------------------------------------------------------- |
| **Etapas cerradas**            | **2 de 17** (ETAPAS 00 y 01)                                      |
| **Etapa siguiente habilitada** | **ETAPA 03 — Auth, RBAC, MFA y aislamiento multiempresa**         |
| **Bloqueos activos**           | Ninguno                                                           |
| **Contradicciones abiertas**   | Ninguna (14 registradas, 14 resueltas)                            |
| **Decisiones pendientes**      | 10 abiertas (P-11 y P-12 resueltos) — ninguna bloquea la ETAPA 02 |
| **Supuestos vigentes**         | 9 — 7 de la ETAPA 00 más S-08 y S-09                              |
| **Extensiones al contrato**    | 1 — E-01 `FUERA_DE_HORARIO`, aprobada                             |

---

## Mapa de etapas

| Etapa  | Nombre                                                        | Rama                                   | Depende de                       | Estado                           | Informe                        |
| ------ | ------------------------------------------------------------- | -------------------------------------- | -------------------------------- | -------------------------------- | ------------------------------ |
| **00** | Auditoría documental y plan maestro                           | `etapa00` ⚠️                           | —                                | **CERRADA**                      | [ETAPA-00](etapas/ETAPA-00.md) |
| 01     | Modelo de datos y Supabase + guía de conexión                 | `etapa-01-modelo-datos-supabase`       | 00 ✅                            | **CERRADA**                      | [ETAPA-01](etapas/ETAPA-01.md) |
| 02     | Andamiaje del monorepo y núcleo hexagonal                     | `etapa-02-andamiaje-monorepo`          | 01 ✅                            | **PENDIENTE** — habilitada       | —                              |
| 03     | Auth, RBAC, MFA y aislamiento multiempresa                    | `etapa-03-auth-rbac-multiempresa`      | 02                               | PENDIENTE                        | —                              |
| 04     | Padrón: viviendas, residentes, vehículos                      | `etapa-04-padron`                      | 03                               | PENDIENTE                        | —                              |
| 05     | Autorizaciones y motor de reglas + MockProvider               | `etapa-05-autorizaciones-motor-reglas` | 04                               | PENDIENTE                        | —                              |
| 06     | Eventos, auditoría inmutable, alertas, tiempo real            | `etapa-06-eventos-auditoria`           | 05                               | PENDIENTE                        | —                              |
| 07     | Zonas comunes: horario y aforo                                | `etapa-07-zonas-comunes`               | 06                               | PENDIENTE                        | —                              |
| 08     | Biometría: consentimiento, calidad, sincronización, supresión | `etapa-08-biometria-consentimiento`    | 06                               | PENDIENTE                        | —                              |
| 09     | Consola web de administración                                 | `etapa-09-consola-administracion`      | 07, 08                           | PENDIENTE                        | —                              |
| 10     | Consolas de portería y guardia virtual                        | `etapa-10-consolas-operativas`         | 09                               | PENDIENTE                        | —                              |
| 11     | App móvil Flutter del residente                               | `etapa-11-app-flutter-residente`       | 09                               | PENDIENTE                        | —                              |
| 12     | Edge Gateway: offline y reconciliación                        | `etapa-12-edge-gateway-offline`        | 06                               | PENDIENTE                        | —                              |
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

VO `Placa` normalizado al construir, agregado `Vivienda` con métodos de intención, primer adaptador PostgreSQL real y carga transaccional desde CSV. **KPI-03 verificado a través del caso de uso contra base real: 100 intentos concurrentes → 1 aceptado, 99 rechazados, 1 fila activa.** RN-19 sin borrado físico, probado por inspección del adaptador y sometido a mutación. 51 pruebas en la API, 33 en el dominio (99,15 % de cobertura). Informe en `docs/etapas/ETAPA-04.md`. Deudas nuevas: D-20t a D-23t, [SUPUESTO] S-15.

> **Requisito registrado para la ETAPA 14 (CI/CD):** la suite `./supabase/verificar.sh --con-pruebas --modo-supabase` y la prueba de concurrencia KPI-03 deben ejecutarse **en CI**, no en el entorno del usuario. Hoy se omiten sin base local, y esa omisión avisa pero no protege.

## Etapas 05 a 16 — `PENDIENTE`

Sin trabajo iniciado. La ETAPA 02 se habilita cuando la 01 quede cerrada.

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

| ID   | Decisión                                                    | Bloquea a partir de              | Estado                                        |
| ---- | ----------------------------------------------------------- | -------------------------------- | --------------------------------------------- |
| P-01 | Firma de documentos de cesión, confidencialidad y seguridad | _(condición contractual previa)_ | Abierta                                       |
| P-02 | Umbral de confianza de lectura de placa                     | ETAPA 15                         | Abierta — supuesto vigente: 0,85              |
| P-03 | Plazo de respuesta al consentimiento                        | ETAPA 08                         | Abierta — supuesto vigente: 24 h              |
| P-04 | Política de reinicio del contador de aforo                  | ETAPA 07                         | Abierta — supuesto vigente: cierre de horario |
| P-05 | Margen de vigencia del caché de reglas                      | ETAPA 12                         | Abierta — supuesto vigente: 24 h              |
| P-06 | Umbral de latido de dispositivo                             | ETAPA 06                         | Abierta — supuesto vigente: 3 latidos o 5 min |
| P-07 | Definición de «acceso dudoso»                               | ETAPA 06                         | Abierta — supuesto vigente: 2 motivos tipados |
| P-08 | Plataforma de despliegue de la API                          | ETAPA 14                         | Abierta                                       |
| P-09 | ¿Compuerta de aprobación administrativa?                    | ETAPA 05                         | Abierta — no se construye                     |
| P-10 | ¿Reservas de zonas sin cobro?                               | ETAPA 07                         | Abierta — no se construyen                    |
| P-11 | «Nivel de acceso» por residente                             | ETAPA 04                         | Abierta — valor por defecto restrictivo       |

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
