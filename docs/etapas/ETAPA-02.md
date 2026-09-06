# ETAPA 02 — Andamiaje del monorepo y núcleo hexagonal

**Rama `etapa-02-andamiaje-monorepo` · sacada de `develop` actualizado · 2026-09-06**

## 1. Qué se construyó

Un monorepo pnpm + Turborepo con la estructura de §2.9, una API NestJS que **no arranca sin configuración completa**, un núcleo hexagonal real —vacío de negocio pero completo de fronteras— y un linter que rompe el build cuando alguien cruza una capa.

El objetivo de la etapa no era producir funcionalidad: era hacer que la arquitectura sea **imposible de violar por accidente**. Todo lo que este informe afirma está comprobado por ejecución, no por lectura: `./scripts/verificar-frontera.sh` introduce las violaciones a propósito, exige que el mecanismo las rechace, y restaura. Una regla de frontera que nadie ha visto fallar no está demostrada — es la lección que dejó la ETAPA 01.

## 2. Cómo se organizó y por qué

**El dominio es un paquete, no una carpeta.** `@ncr/domain-core` se publica con `exports` en su `package.json`, así que solo `src/index.ts` es API. La frontera no depende de la disciplina de quien escribe un `import`: la impone Node en ejecución. Esto es lo que permitirá a la ETAPA 12 reutilizar el dominio en el Edge **sin modificarlo**, que es la condición de RN-16.

**El error esperado es un valor, no una excepción.** `Resultado<T, E>` está en el dominio porque una excepción es un salto invisible en la firma: `evaluarAcceso(...): Decision` no dice que pueda fallar. Con `Resultado`, el compilador obliga a tratar el fallo antes de leer el valor. `plegar` es la única salida, y por eso fuerza a decidir qué se hace con la rama de error en vez de permitir un `.valor` a secas.

**Los tokens son `symbol`, no strings ni clases.** Un `Symbol.for` no es un import de NestJS, así que el dominio puede declarar la etiqueta con la que se pide su puerto sin conocer el framework. Como `Symbol.for` va a un registro **global**, dos claves iguales devolverían el mismo symbol y una dependencia se inyectaría en el sitio de otra **sin error de compilación**; por eso la unicidad de los 21 tokens es una prueba y no un supuesto.

**`EventoRepo` no tiene `guardar`.** Los ocho repositorios restantes lo tienen; el de eventos solo ofrece `anexar`. `guardar` sugiere «crea o actualiza», y un evento no se actualiza jamás. La inmutabilidad de RN-03 se lee así en el **tipo**, antes de llegar a los permisos de la base que la garantizan (ADR-005).

**La clave de idempotencia la construye el dominio y no lleva la hora.** Es la decisión D-11 hecha código: el Edge puede recalcular `ocurridoEn` al reconciliar, y si el instante entrara en la clave, el mismo hecho produciría dos claves y dos filas. El descriptor no admite fecha **por construcción**, y una prueba fija esa ausencia para que nadie la añada sin darse cuenta.

**La configuración se valida antes de construir la aplicación.** Primero se hizo dentro de una factoría de Nest y el resultado fue que el contenedor de inyección envolvía el fallo: el proceso moría con un código 1 genérico y un volcado del framework. Ahora `main.ts` llama a `cargarConfiguracion` **antes** de `NestFactory.create` y sale con `EX_CONFIG` (78) y un motivo legible. §2.7.1 pide que la aplicación no arranque; para que eso sea diagnosticable, tiene que fallar antes de que haya framework que lo envuelva.

**La redacción de la bitácora vive en el punto de salida.** No en cada llamada. Confiar en que quien registra se acuerde de omitir la llave es exactamente cómo acaba una llave en un log. Y el logger de Nest se adapta al mismo canal: sin eso el proceso emitiría dos formatos, y los mensajes del framework —los que más falta hacen en una caída— quedarían fuera de la observabilidad de la ETAPA 14.

**`/health` y `/ready` son dos rutas porque son dos preguntas.** «El proceso vive» pide reinicio si falla; «puede atender tráfico» pide salir del balanceador pero **no** reiniciar. Confundirlas provoca reinicios en cadena cuando una dependencia parpadea. En la ETAPA 03 `/ready` incorpora el JWKS: sin él la API no puede verificar tokens y debe declararse no lista, no muerta.

**Un origen CORS no permitido no produce un error de servidor.** La primera versión devolvía 500. Se corrigió a no emitir cabeceras: el navegador bloquea, que es el mecanismo real, y un rechazo correcto deja de contaminar los incidentes.

## 3. Árbol de archivos

| Archivo                                                                   | Propósito                                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json` | Monorepo §2.9; TS estricto con `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`   |
| `eslint.config.mjs`                                                       | **Fronteras de arquitectura ejecutables**                                                  |
| `scripts/escanear-secretos.sh`                                            | Escaneo por VALOR, no por nombre; pre-commit y `pnpm verificar`                            |
| `scripts/verificar-frontera.sh`                                           | **Prueba de mutación del DoD**                                                             |
| `.husky/pre-commit`, `.prettierrc`                                        | lint-staged + escaneo antes de cada commit                                                 |
| `packages/domain-core/src/compartido/resultado.ts`                        | `Resultado<T,E>` y combinadores                                                            |
| `…/compartido/errores.ts`                                                 | 10 motivos tipados (incluye `FUERA_DE_HORARIO`, D-18), `nuncaOcurre`                       |
| `…/puertos/soporte.ts`                                                    | `Reloj`, `GeneradorDeId`, `Bitacora`, `UnidadDeTrabajo`, `Notificador`, `AlmacenEvidencia` |
| `…/puertos/repositorios.ts`                                               | Un puerto por agregado raíz; `EventoRepo` sin `guardar`                                    |
| `…/puertos/proveedores.ts`                                                | 4 puertos de hardware, sin rastro de protocolo (ADR-01)                                    |
| `…/eventos/bus-en-memoria.ts`                                             | Bus de dominio; un manejador que falla no tumba a los demás                                |
| `…/politicas/idempotencia.ts`                                             | Clave de idempotencia sin marca de tiempo (D-11)                                           |
| `…/tokens.ts`                                                             | 21 tokens de inyección                                                                     |
| `apps/api/src/configuracion/esquema.ts`                                   | Zod; sin defectos para secretos ni orígenes                                                |
| `apps/api/src/seguridad.ts`                                               | Helmet + CSP, CORS por lista blanca, `ValidationPipe` estricto                             |
| `apps/api/src/comun/bitacora/`                                            | Bitácora estructurada con redacción + adaptador de Nest                                    |
| `apps/api/src/comun/filtros/filtro-global.ts`                             | 5xx no filtra el mensaje original                                                          |
| `apps/api/src/comun/interceptores/correlacion.ts`                         | `x-request-id` en log y respuesta                                                          |
| `apps/api/src/nucleo/nucleo.module.ts`                                    | Cableado DIP; único lugar con `new Date()` y `randomUUID()`                                |
| `apps/api/src/salud/salud.controller.ts`                                  | `/health` y `/ready`                                                                       |
| `apps/api/src/openapi.ts`                                                 | Genera `packages/contracts/openapi.json` sin necesitar `.env` real                         |
| `packages/config/src/tailwind-preset.ts`                                  | Preset compartido derivado de la ETAPA 00                                                  |
| `docs/arquitectura/CONVENCIONES.md`                                       | Procedimiento para crear un módulo sin romper fronteras                                    |

## 4. Cumplimiento SOLID

| Principio | Materialización                                                                                                     | Verificación                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **SRP**   | Ningún archivo supera 300 líneas; `seguridad.ts` concentra la postura HTTP para que una auditoría la lea de una vez | `wc -l` sobre `src/`                                            |
| **OCP**   | Añadir un motivo de acceso no toca ningún consumidor: `nuncaOcurre` señala los `switch` incompletos en compilación  | `pnpm typecheck`                                                |
| **LSP**   | Los puertos de proveedor no exponen protocolo, así que Mock e Hikvision son intercambiables por contrato            | ETAPA 05/15 (KPI-12)                                            |
| **ISP**   | `RepositorioPorId` y `RepositorioGuardable` se componen por agregado; `EventoRepo` omite deliberadamente `guardar`  | Lectura de `repositorios.ts`                                    |
| **DIP**   | El dominio declara interfaces y tokens; `NucleoModule` inyecta implementaciones                                     | `grep -r "supabase\|axios\|isapi" packages/domain-core/src` → 0 |

## 5. Trazabilidad

Etapa de infraestructura: no implementa HU ni CA. Habilita:

- **§2.2** (cinco capas, nueve agregados, puertos y políticas) → estructura de `domain-core`.
- **§2.3 DIP** → tokens + `NucleoModule`; verificación mecánica en `verificar-frontera.sh`.
- **§2.4** → TS estricto, prohibición de `any` y de `new Date()` en el dominio, errores tipados, cobertura 90 %.
- **§2.7.1/2/3/5/7/8** → configuración validada, CORS por lista blanca, `ValidationPipe` estricto, throttler global, CSP+HSTS, límite de payload, redacción en logs.
- **D-11 / RN-17 / CA-22** → política de idempotencia.
- **D-18 / RN-03 / ADR-005** → motivos tipados y `EventoRepo` sin `guardar`.
- **KPI-11** habilitado (análisis estático de frontera); su comprobación específica de `ISAPI` llega en la ETAPA 05, cuando exista `packages/providers` con contenido.

## 6. Pruebas

`pnpm test` — **27 pruebas**: 19 en el dominio (100 % de cobertura, umbral 90 % que rompe la ejecución) y 8 en la API.

- `resultado.test.ts` — los seis combinadores, incluidas las ramas de fallo.
- `errores.test.ts` — la enumeración es la del contrato, sin duplicados, con `FUERA_DE_HORARIO`.
- `idempotencia.test.ts` — estabilidad, ausencia de fecha por construcción, rechazo de componentes que romperían el separador.
- `bus-en-memoria.test.ts` — un manejador que falla no impide a los demás y se informa.
- `tokens.test.ts` — 21 tokens, sin colisiones en el registro global, todos bajo el prefijo del proyecto.
- `esquema.test.ts` — **falla si falta cualquiera** de las siete variables obligatorias; rechaza `*` en CORS; el mensaje de error no incluye el valor de la llave.
- `bitacora-estructurada.test.ts` — redacción a cualquier profundidad, datos personales incluidos, corte de recursión, una línea JSON por registro.

`./scripts/verificar-frontera.sh` — DoD por mutación: seis violaciones introducidas a propósito, seis rechazadas; arranque sin `.env` abortado con código 78 y sin filtrar valores.

## 7. Verificación de seguridad (§2.7)

| #   | Medida                                                                  | Estado                                                                      |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Secretos solo en entorno; validación Zod al arranque                    | ✅ verificado por prueba y por ejecución                                    |
| 2   | CORS por lista blanca, sin `*` ni reflejo del origen                    | ✅ comprobado con origen permitido y no permitido                           |
| 3   | `ValidationPipe` con `whitelist` + `forbidNonWhitelisted` + `transform` | ✅                                                                          |
| 4   | Anti-inyección                                                          | n/a en esta etapa (sin acceso a datos); las reglas quedan en CONVENCIONES   |
| 5   | Rate limiting global                                                    | ✅ `ThrottlerGuard` como `APP_GUARD`; endurecimiento por ruta en ETAPA 03   |
| 6   | RLS                                                                     | Aplicada en la ETAPA 01; la validación en capa de aplicación llega en la 03 |
| 7   | CSP sin `unsafe-inline`/`unsafe-eval`, HSTS, `nosniff`, Referrer-Policy | ✅ cabeceras comprobadas en ejecución                                       |
| 8   | Contraseñas y tokens jamás en logs                                      | ✅ redacción probada; 5xx no filtra el mensaje original                     |

`./scripts/escanear-secretos.sh`: limpio. `.gitignore` cubre `.env*`, `dist`, `coverage`, `node_modules`.

## 8. Deuda técnica y supuestos

| ID              | Detalle                                                                                                                                                            | Se salda en                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| D-13            | `UnidadDeTrabajo` no abre transacción real; ejecuta la operación y avisa una vez por proceso. La frontera existe para que los casos de uso se escriban contra ella | ETAPA 04, con el adaptador de persistencia |
| D-14            | `/ready` declara `jwks: pendiente-etapa-03`. Hoy solo comprueba la configuración                                                                                   | ETAPA 03                                   |
| D-15            | `packages/providers` y `packages/contracts` están vacíos por diseño. Que puedan estarlo sin romper nada es la prueba de que la frontera está bien puesta           | ETAPAS 05 y 15                             |
| D-16            | La comprobación de KPI-11 (`ISAPI` o IP fuera de `packages/providers`) no se puede escribir aún: no hay proveedores                                                | ETAPA 05                                   |
| [SUPUESTO] S-13 | El preset Tailwind fija la paleta derivada en la ETAPA 00 sin validación visual con el cliente                                                                     | ETAPA 09                                   |

## 9. Qué debe hacer el usuario

1. `corepack enable && corepack prepare pnpm@9.15.0 --activate`
2. `pnpm install`
3. `cp apps/api/.env.example apps/api/.env` y rellenarlo. **`DATABASE_URL` y `DATABASE_POOLER_URL` deben usar `app_api`, no `postgres`** (guía §12).
4. `pnpm verificar` — lint, typecheck, pruebas y escaneo de secretos.
5. `./scripts/verificar-frontera.sh` — el DoD de esta etapa.
6. `pnpm --filter @ncr/api build && pnpm --filter @ncr/api start`, y comprobar `/health` y `/ready`.
7. Prueba opcional del DoD: borra una variable del `.env` y confirma que el proceso muere con código 78.

## 10. Rama y commits

Rama `etapa-02-andamiaje-monorepo`, sacada de `develop` actualizado conforme a la regla fijada tras la ETAPA 01.
