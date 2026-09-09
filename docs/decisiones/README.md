# Decisiones de arquitectura (ADR)

Registro de las decisiones de arquitectura del proyecto. Una decisión **aceptada** no se reabre ni se propone alternativa, salvo que aparezca un impedimento técnico duro — en cuyo caso se reporta **antes** de cambiar nada, y la salida es un ADR nuevo que supersede al anterior, nunca una edición silenciosa del original.

| ADR                                                                  | Decisión                                                    | Estado   | Formalizado en |
| -------------------------------------------------------------------- | ----------------------------------------------------------- | -------- | -------------- |
| [ADR-001](ADR-001-intercom-isapi-twowayaudio.md)                     | Intercom sobre **ISAPI TwoWayAudio**                        | Aceptada | ETAPA 00       |
| [ADR-002](ADR-002-empaquetado-escritorio-tauri.md)                   | Empaquetado de escritorio con **Tauri**                     | Aceptada | ETAPA 00       |
| [ADR-003](ADR-003-hardware-al-final.md)                              | El hardware va al final, y eso es una prueba                | Aceptada | ETAPA 00       |
| [ADR-004](ADR-004-integridad-concurrente-en-base-de-datos.md)        | La integridad concurrente se resuelve en la base de datos   | Aceptada | ETAPA 00       |
| [ADR-005](ADR-005-inmutabilidad-por-permisos-de-base-de-datos.md)    | Inmutabilidad de eventos por permisos de base de datos      | Aceptada | ETAPA 00       |
| [ADR-006](ADR-006-datos-y-estado-en-la-consola.md)                   | TanStack Query, y ninguna biblioteca de estado global       | Aceptada | ETAPA 09-A     |
| [ADR-007](ADR-007-cliente-de-api-generado-con-openapi-typescript.md) | Cliente generado con `openapi-typescript` + `openapi-fetch` | Aceptada | ETAPA 09-A     |

**Formato.** Contexto → Decisión → Alternativas consideradas → Consecuencias (asumidas y a asumir) → Verificación → Contingencia.

**Origen.** Los cinco primeros ADR provienen de `CLAUDE.md` §4, donde el cliente los declaró cerrados; la ETAPA 00 los formalizó con su contexto, sus alternativas y —lo que el contrato no incluía— **cómo se verifica mecánicamente que cada decisión se sostiene**.

Los ADR-006 y ADR-007 son decisiones **tomadas en la ETAPA 09-A**, no formalizaciones: `CLAUDE.md` §2.6 fija el stack de la consola pero deja abiertas la capa de datos y el generador del cliente, y el enunciado de la etapa pidió documentar ambas. Ninguno decide el generador de Dart de la ETAPA 11, que es una elección aparte sobre el mismo contrato.
