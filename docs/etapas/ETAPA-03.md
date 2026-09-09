# ETAPA 03 — Autenticación, RBAC, MFA y aislamiento multiempresa

> **CORRECCIÓN POSTERIOR · 2026-09-09 (ETAPA 09-A) · [ADR-008](../decisiones/ADR-008-supabase-auth-como-mecanismo-autoritativo-de-mfa.md).**
> Las rutas `/auth/mfa/inscripcion` y `/auth/mfa/verificacion` que describe este
> informe, junto con `ServicioMfa` y el módulo de dominio `mfa.ts`, **se han
> retirado**. Eran inalcanzables: el guard de autenticación exige `aal2` antes de
> que actúe el de roles, y las dos exigían rol administrativo. Y verificar allí
> no cambiaba el `aal` del token, que lo emite Supabase.
>
> **Lo que este informe describe sigue vigente en todo lo demás**, incluido lo
> esencial: RN-20 y CA-25 los hace cumplir el guard de autenticación con el
> claim `aal2`, exactamente como aquí se explica. Lo retirado es una segunda
> implementación que no participaba en esa regla.

**Rama `etapa-03-auth-rbac-multiempresa` · desde `develop` actualizado · 2026-09-07**

## 1. Qué se construyó

El cierre del riesgo número uno del proyecto: la fuga de datos entre copropiedades. Verificación asimétrica del JWT contra el JWKS del proyecto, RBAC declarativo para los seis roles, segundo factor TOTP obligatorio para los roles administrativos, y una barrera de aislamiento que actúa **en la capa de aplicación** además de la RLS ya existente.

La pieza central no es ninguna de esas: es la **suite de aislamiento**, que recorre todos los endpoints por los dos caminos y rompe el build ante cualquier fuga. Todo lo demás existe para que esa suite pueda pasar.

Se corrigió además el defecto reportado al cerrar la ETAPA 02: `node dist/main.js` no leía `apps/api/.env`.

## 2. Cómo se organizó y por qué

**La suite enumera las rutas del enrutador de Nest, no una lista escrita a mano.** Es lo que hace que «100 % de endpoints» sea verdad y no una promesa: una lista se queda obsoleta en la primera etapa que añada un controlador, y nadie se entera. Al leer el enrutador, un endpoint nuevo entra en el recorrido el día que se escribe, y si filtra, el build se rompe.

**Las exenciones se declaran en el controlador, no en la prueba.** Algunas rutas —la sesión propia, el alta de MFA— no exponen ningún recurso de una copropiedad. Podrían haberse listado en el test; en su lugar llevan `@SinRecursoDeTenant()`. La diferencia importa: una lista en la prueba se amplía sin que nadie lo note, mientras que el decorador aparece en el diff y hay que justificarlo en la revisión. La suite comprueba además que ambas coincidan.

**Denegar por defecto, en los dos guards.** El de autenticación exime solo con `@Publico()`; el de roles rechaza cualquier ruta **sin política declarada**. Un controlador nuevo que olvide decorarse produce un 403 en desarrollo, no una fuga en producción. Es la inversión de §2.1.4 llevada al enrutador: la lista corta es la de exenciones, no la de rutas protegidas.

**404 y no 403 ante un recurso de otra copropiedad.** Un 403 confirma que el identificador **existe**, y esa confirmación ya es una fuga: permite enumerar viviendas o autorizaciones ajenas contando respuestas. La identidad de servicio sí recibe 403, porque ahí el alcance es una condición de configuración, no un secreto.

**El aislamiento se reimplementa en la aplicación aunque la RLS ya lo haga.** No es duplicación: la llave secreta lleva `BYPASSRLS` y la usan el Edge, los workers y la ingesta. Sin esta capa, esas rutas quedarían sin ninguna barrera. La prueba de base ampliada en `00_aislamiento_multiempresa.sql` fija el hecho midiéndolo: `service_role` ve las dos copropiedades con un claim acotado a una.

**El MFA se comprueba en el guard de autenticación, no en el de roles.** RN-20 no es un permiso sobre una ruta: es una condición de la sesión. Un administrador con `aal1` está autenticado pero no habilitado, y resolverlo en el guard de autenticación evita que la regla dependa de que cada ruta se acuerde de declararla.

**El emisor se deriva de `SUPABASE_URL`.** Dos variables que deben coincidir acaban divergiendo, y una discrepancia aquí significa aceptar tokens de otro proyecto.

**La lista de algoritmos es cerrada y HS256 no está.** Este proyecto no tiene secreto compartido: una biblioteca configurada con «cualquier algoritmo» convertiría una clave **pública** conocida en un secreto de firma válido. Es la confusión de algoritmos de manual, y la prueba la ejercita con un token HS256 real.

**`/ready` sondea el JWKS de verdad.** La primera versión respondía `ok` sin haber contactado nunca el endpoint, porque `createRemoteJWKSet` es perezoso. Ahora fuerza una resolución con un `kid` inexistente: si `jose` responde «no hay clave que coincida», el documento se descargó. Con un JWKS inalcanzable, `/ready` da 503 y `/health` sigue en 200 — el proceso está sano, no está listo.

**El transformador de las pruebas emite metadata de decoradores.** Sin ello Nest inyectaba `undefined` y, peor, `ValidationPipe` no conocía el tipo del DTO y **dejaba pasar cualquier cuerpo**: la suite habría dado por buena la validación de §2.7.3 sin que existiera. Se detectó porque un endpoint aceptó un cuerpo vacío. Es la misma lección de la ETAPA 01, y por eso las inyecciones de los guards son además explícitas por token.

## 3. Árbol de archivos

| Archivo                                                   | Propósito                                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `autenticacion/dominio/claims.ts`                         | Contrato de claims con Zod, `ContextoTenant`, `alcanzaCopropiedad`, roles que exigen MFA |
| `autenticacion/dominio/errores.ts`                        | Motivos de rechazo tipados; ninguno llega al cliente                                     |
| `autenticacion/dominio/mfa.ts`                            | Códigos de recuperación en hash, de un solo uso, comparados en tiempo constante          |
| `autenticacion/infraestructura/jwks.ts`                   | Caché con TTL 600 s y suelo de refresco 60 s; sonda real para `/ready`                   |
| `autenticacion/infraestructura/verificador-jwt.ts`        | Lista cerrada de algoritmos, `iss`/`aud`/`exp`, tolerancia 60 s                          |
| `autenticacion/infraestructura/mfa.servicio.ts`           | Inscripción y verificación TOTP (`window: 1`)                                            |
| `autenticacion/presentacion/`                             | `/auth/sesion`, `/auth/mfa/*` con límite endurecido y DTOs validados                     |
| `comun/decoradores/`                                      | `@Publico`, `@Roles`, `@PermiteServicio`, `@SinRecursoDeTenant`, `@Contexto`             |
| `comun/guardas/autenticacion.guard.ts`                    | Verifica, exige segundo factor, construye el contexto del tenant                         |
| `comun/guardas/roles.guard.ts`                            | RBAC; deniega rutas sin política declarada                                               |
| `multiempresa/aislamiento.ts`                             | Barrera de aplicación; 404 para usuario, 403 para servicio; registra en auditoría        |
| `multiempresa/auditoria-en-memoria.ts`                    | Adaptador transitorio de `auditoria_seguridad` (deuda D-17)                              |
| `multiempresa/copropiedades.controller.ts`                | Recurso mínimo con tenant para ejercitar los dos caminos                                 |
| `test/utilidades.ts`                                      | Firmante local, app de pruebas, **enumeración de rutas**                                 |
| `test/aislamiento.e2e.test.ts`                            | **Suite de aislamiento**: 4 caminos + CA-24                                              |
| `test/autenticacion.e2e.test.ts`                          | Verificación del JWT, MFA por rol, RBAC                                                  |
| `supabase/policies/tests/00_aislamiento_multiempresa.sql` | Ampliada: mide que `service_role` omite la RLS                                           |
| `src/main.ts`                                             | **Carga de `.env` resuelta desde `__dirname`**                                           |

## 4. Cumplimiento SOLID

| Principio | Materialización                                                                                                | Verificación                              |
| --------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **SRP**   | `ProveedorDeJwks` cachea, `VerificadorDeJwt` valida, `Aislamiento` decide alcance; ningún archivo > 300 líneas | `wc -l`                                   |
| **OCP**   | Un rol nuevo se añade a `ROLES` y a los decoradores; los guards no cambian                                     | Compilación                               |
| **LSP**   | `ProveedorDeJwks` se sustituye en la suite por una implementación local sin tocar una aserción                 | La suite corre sin red                    |
| **ISP**   | `RegistroDeAuditoria` expone un solo método, el que el aislamiento necesita                                    | Lectura                                   |
| **DIP**   | Guards y controladores inyectan por token; el adaptador de auditoría se cambia sin tocarlos                    | `AuditoriaEnMemoria` vs. futuro adaptador |

## 5. Trazabilidad

**Cubierto:** OE-08 · RN-15, RN-20 · CA-24, CA-25 · KPI-35, KPI-36, KPI-37, KPI-38 · CP-11 · §2.7.2/3/5/6/8.

**Parcial, con motivo:**

- **CA-24** — el bloqueo y el registro se comprueban; la persistencia en `auditoria_seguridad` espera a que la API conecte a PostgreSQL (D-17).
- **KPI-38** — la suite cubre el 100 % de los endpoints existentes. Su valor crece con cada etapa, y por diseño no puede quedarse atrás: enumera el enrutador.
- **RN-20** — el segundo factor se exige y se verifica; la inscripción persiste en memoria (D-17).

## 6. Pruebas

`pnpm --filter @ncr/api test` — **40 pruebas**.

- **Aislamiento (4 caminos):** sin token → 401 en toda ruta protegida; JWT de otra copropiedad → ningún 2xx; identidad de servicio → 403 fuera de su alcance y en rutas no admitidas; operador de central → solo las copropiedades de su turno. Más CA-24: todo cruce deja rastro.
- **Verificación del JWT:** HS256 rechazado, `alg: none` rechazado, expirado, emisor y audiencia ajenos, claims con forma inesperada, y que el rechazo no revele el motivo.
- **MFA:** los tres roles administrativos con `aal1` no entran; portero y residente sí. Códigos de recuperación: únicos, de un solo uso, insensibles a mayúsculas, y no recuperables desde el hash.

**Mutación:** desactivando `Aislamiento.exigirAlcance`, la suite falla con `FUGA multiempresa: GET /copropiedades/:id → 200`. Una suite que no se ha visto fallar no demuestra nada.

**Base, en `--modo-supabase`:** `./supabase/verificar.sh --con-pruebas --modo-supabase` — 18/18 migraciones, seed y las cuatro pruebas SQL verdes, KPI-03 con 100 conexiones concurrentes.

## 7. Verificación de seguridad (§2.7)

| #   | Medida                                           | Estado                                                            |
| --- | ------------------------------------------------ | ----------------------------------------------------------------- |
| 1   | Secretos solo en entorno                         | ✅ escaneo limpio; `.env` cargado, nunca versionado               |
| 2   | CORS por lista blanca                            | ✅ heredado de la 02, sin cambios                                 |
| 3   | Validación en backend                            | ✅ **corregida**: era inerte bajo la transformación de pruebas    |
| 5   | Rate limiting endurecido en MFA                  | ✅ 5/min frente a 120/min global                                  |
| 6   | Aislamiento por doble camino                     | ✅ **entregable central**; medido que `service_role` omite la RLS |
| 7   | CSP, HSTS                                        | ✅ heredado                                                       |
| 8   | MFA TOTP, RBAC declarativo, sin secretos en logs | ✅ motivos de rechazo solo en bitácora                            |

## 8. Deuda técnica y supuestos

| ID              | Detalle                                                                                                                              | Se salda en                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| D-17            | La API no conecta a PostgreSQL en ejecución. MFA y auditoría usan adaptadores en memoria; la frontera ya es la definitiva            | ETAPA 04                              |
| D-18t           | La revocación de sesión depende de la expiración de 5 min; no hay lista de revocación inmediata                                      | ETAPA 06, con el canal de tiempo real |
| D-19t           | El límite se aplica por IP; falta el límite por identidad que pide §2.7.5                                                            | ETAPA 04                              |
| [SUPUESTO] S-14 | El auth hook emite `aal` en el token. Si no lo hiciera, el segundo factor no sería verificable desde el JWT y habría que consultarlo | Verificar en el panel                 |

## 9. Qué debe hacer el usuario

1. Configurar el **Custom Access Token Hook** para emitir `usuario_id`, `rol`, `copropiedad_id` y `copropiedades` (turno activo, S-10).
2. Confirmar que el token incluye `aal` (S-14): sin ese claim, ningún rol administrativo entrará.
3. Activar MFA TOTP en el panel para los roles administrativos.
4. `pnpm --filter @ncr/api test` y `./supabase/verificar.sh --con-pruebas --modo-supabase`.
5. Rellenar `apps/api/.env` y `pnpm --filter @ncr/api start`; comprobar `/ready` con el JWKS real (debe dar 200) y `/auth/sesion` sin token (401).
6. Pendiente de la ETAPA 01: la prueba de `UPDATE` sobre un evento real, cuando haya eventos.

## 10. Rama y commits

Rama `etapa-03-auth-rbac-multiempresa`, desde `develop` actualizado.
