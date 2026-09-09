# ADR-007 · El cliente de la consola se genera con `openapi-typescript` + `openapi-fetch`

- **Estado:** Aceptada
- **Fecha:** 2026-09-09 (ETAPA 09-A)
- **Origen:** `CLAUDE.md` §2.6 — «cliente Dart **generado**, nunca escrito a mano»; §6 ETAPA 09 — «cliente de API generado desde OpenAPI, nunca escrito a mano»
- **Afecta a:** ETAPAS 09, 10, 11, 14 · KPI-14
- **No decide** el generador de Dart de la ETAPA 11, que es una elección aparte

## Contexto

El contrato lo genera NestJS desde los controladores (`pnpm contrato`). Falta decidir con qué se convierte en un cliente TypeScript, y sobre todo **cómo se impide que ese cliente se desincronice**.

El problema real no es elegir generador: es que un artefacto generado que alguien regenera a mano acaba describiendo la API de la semana pasada, y **el síntoma no es un error**. El código compila, las pruebas pasan, y el campo que el backend renombró llega como `undefined` en producción.

Al montar esta etapa apareció además el estado de partida: **ningún controlador declaraba el tipo de su respuesta**, así que el contrato describía cada una como un objeto sin esquema y cualquier generador habría producido `unknown`. Un cliente «generado» que devuelve `unknown` no aporta nada sobre uno escrito a mano: sobre `unknown` todo compila.

## Decisión

**`openapi-typescript` genera los TIPOS; `openapi-fetch` los aplica sobre `fetch`.** Cuatro comandos del monorepo y dos controles que rompen la verificación de etapa:

```
pnpm contrato            # openapi.json desde los controladores de NestJS
pnpm contrato:cliente    # packages/contracts/src/generado/api.ts desde ese JSON
pnpm contrato:tipado     # ninguna ruta sin respuesta tipada
pnpm contrato:desfasado  # contrato y cliente al día respecto del código
```

`packages/contracts` es un paquete de **solo tipos**: no declara ninguna dependencia de ejecución. `openapi-fetch` vive en `apps/web`.

## Alternativas consideradas

| Alternativa                                | Por qué se descarta                                                                                                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`openapi-generator` (typescript-axios)** | Genera miles de líneas de clases y modelos que hay que versionar y revisar. Necesita Java para ejecutarse: una dependencia más en el CI y en el equipo de cada desarrollador |
| **`orval`**                                | Genera además los _hooks_ de React Query. Atractivo, pero ata el contrato a la capa de datos: cambiar de biblioteca (ADR-006) obligaría a regenerar todo el cliente          |
| **`swagger-typescript-api`**               | Similar en resultado; menos mantenido y con menos control sobre la forma de los tipos                                                                                        |
| **Tipos escritos a mano**                  | Lo que §2.6 prohíbe expresamente, y con razón: se desincronizan en silencio                                                                                                  |
| **`openapi-fetch` dentro de `contracts`**  | Metería una dependencia de ejecución en un paquete que también consumirá el generador de Dart, y obligaría a este paquete a decidir entre CJS y ESM por sus consumidores     |

## Consecuencias

**Que se aceptan:**

- **Tipos, no código.** El artefacto generado es un único `.ts` de tipos: se lee en un diff, no aporta lógica que revisar y no puede tener defectos propios.
- **El fichero generado no se formatea ni se lintea.** Está en `.prettierignore` y en los `ignores` de ESLint. Se descubrió por las malas: el gancho de pre-commit lo reformateó y `contrato:desfasado` rompió el build en el commit siguiente, que es precisamente lo que el control debe hacer.
- **`contrato:tipado` obliga a que toda ruta declare su respuesta.** Sus exenciones llevan la etapa que las tipará y **caducan solas**: una ruta exenta que ya está tipada, o que dejó de existir, hace fallar el control.
- La verificación **regenera en un temporal fuera del árbol** y compara. No modifica el repositorio, igual que las pruebas negativas.

**A asumir en etapas siguientes:**

- La ETAPA 11 elige su generador de Dart **desde el mismo `openapi.json`**. Esta decisión no lo condiciona; lo que sí hereda es el requisito de reproducibilidad y de control de desfase.
- La ETAPA 14 incorpora los dos controles al flujo de GitHub Actions.

## Verificación

- `scripts/lib/contrato-tipado.mjs` · pasos 10b de `verificar-etapa.sh`. Cuatro reglas: respuesta 2xx con esquema, esquema con forma, propiedad con tipo y `$ref` que resuelve.
- `scripts/lib/contrato-desfasado.mjs` · regenera y compara byte a byte.
- `scripts/lib/pruebas-negativas.mjs` · sondas 9 y 10: una respuesta sin tipo y un cliente editado a mano tienen que romper la verificación.

## Contingencia

Si `openapi-typescript` dejara de mantenerse, se sustituye el paso `contrato:cliente` por otro generador y se regenera. Los dos controles y los comandos siguen siendo los mismos: lo que se ha fijado es **el flujo**, no la herramienta.
