# Decisiones de arquitectura (ADR)

Registro de las decisiones de arquitectura del proyecto. Una decisión **aceptada** no se reabre ni se propone alternativa, salvo que aparezca un impedimento técnico duro — en cuyo caso se reporta **antes** de cambiar nada, y la salida es un ADR nuevo que supersede al anterior, nunca una edición silenciosa del original.

| ADR                                                                     | Decisión                                                                                            | Estado   | Formalizado en |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- | -------------- |
| [ADR-001](ADR-001-intercom-isapi-twowayaudio.md)                        | Intercom sobre **ISAPI TwoWayAudio**                                                                | Aceptada | ETAPA 00       |
| [ADR-002](ADR-002-empaquetado-escritorio-tauri.md)                      | Empaquetado de escritorio con **Tauri**                                                             | Aceptada | ETAPA 00       |
| [ADR-003](ADR-003-hardware-al-final.md)                                 | El hardware va al final, y eso es una prueba                                                        | Aceptada | ETAPA 00       |
| [ADR-004](ADR-004-integridad-concurrente-en-base-de-datos.md)           | La integridad concurrente se resuelve en la base de datos                                           | Aceptada | ETAPA 00       |
| [ADR-005](ADR-005-inmutabilidad-por-permisos-de-base-de-datos.md)       | Inmutabilidad de eventos por permisos de base de datos                                              | Aceptada | ETAPA 00       |
| [ADR-006](ADR-006-datos-y-estado-en-la-consola.md)                      | TanStack Query, y ninguna biblioteca de estado global                                               | Aceptada | ETAPA 09-A     |
| [ADR-007](ADR-007-cliente-de-api-generado-con-openapi-typescript.md)    | Cliente generado con `openapi-typescript` + `openapi-fetch`                                         | Aceptada | ETAPA 09-A     |
| [ADR-008](ADR-008-supabase-auth-como-mecanismo-autoritativo-de-mfa.md)  | Supabase Auth es el único mecanismo de segundo factor                                               | Aceptada | ETAPA 09-A     |
| [ADR-012](ADR-012-artefactos-de-turbo.md)                               | Cada tarea declara sus artefactos, también las que no producen ninguno                              | Aceptada | ETAPA 09-B     |
| [ADR-013](ADR-013-iconografia.md)                                       | Iconografía con Lucide, bajo licencia ISC                                                           | Aceptada | ETAPA 09-B     |
| [ADR-014](ADR-014-modo-oscuro-por-parejas-de-tokens.md)                 | El tema se declara como parejas de fondo y texto                                                    | Aceptada | ETAPA 09-B     |
| [ADR-015](ADR-015-cliente-dart-generado-con-swagger-parser.md)          | Cliente Dart con `swagger_parser` + `retrofit`, sin JVM                                             | Aceptada | ETAPA 11-A     |
| [ADR-016](ADR-016-captura-biometrica-desde-la-app-del-residente.md)     | La captura del residente comparte el **caso de uso**, no el controlador (RN-10)                     | Aceptada | ETAPA 11-C     |
| [ADR-017](ADR-017-sqlite-del-edge-con-node-sqlite.md)                   | SQLite del Edge con `node:sqlite`, sin módulos nativos                                              | Aceptada | ETAPA 12       |
| [ADR-018](ADR-018-punto-de-composicion-de-proveedores.md)               | Un único punto de composición decide qué proveedor de hardware se inyecta                           | Aceptada | ETAPA 15-C     |
| [ADR-019](ADR-019-el-hardware-se-elige-por-capacidades.md)              | El hardware se elige por **capacidades** declaradas o descubiertas, nunca por marca ni modelo       | Aceptada | ETAPA 15-D     |
| [ADR-020](ADR-020-el-autorizante-desde-la-consola-es-el-titular.md)     | Una autorización creada desde la consola se registra a nombre del **titular** (S-38, por ratificar) | Aceptada | ETAPA 15-D     |
| [ADR-021](ADR-021-la-fotografia-del-visitante-no-es-dato-biometrico.md) | La fotografía del visitante **no es dato biométrico** y sigue el camino de la evidencia             | Aceptada | ETAPA 15-D     |
| [ADR-022](ADR-022-el-navegador-negocia-el-video-con-la-api.md)          | La vista en vivo se negocia con la **API** (WHEP); el navegador nunca ve RTSP ni el puente          | Aceptada | ETAPA 15-E     |

**Los números 009, 010 y 011 no existen** y no es un error de numeración que
haya que corregir: se reservaron para decisiones de la 09-A que acabaron siendo
consecuencias de ADR-006 y ADR-007, no decisiones propias. Renumerar los
posteriores rompería las referencias que ya existen en el código y en los
informes.

**Formato.** Contexto → Decisión → Alternativas consideradas → Consecuencias (asumidas y a asumir) → Verificación → Contingencia.

**Origen.** Los cinco primeros ADR provienen de `CLAUDE.md` §4, donde el cliente los declaró cerrados; la ETAPA 00 los formalizó con su contexto, sus alternativas y —lo que el contrato no incluía— **cómo se verifica mecánicamente que cada decisión se sostiene**.

Los ADR-006 y ADR-007 son decisiones **tomadas en la ETAPA 09-A**, no formalizaciones: `CLAUDE.md` §2.6 fija el stack de la consola pero deja abiertas la capa de datos y el generador del cliente, y el enunciado de la etapa pidió documentar ambas. Ninguno decide el generador de Dart de la ETAPA 11, que es una elección aparte sobre el mismo contrato.
