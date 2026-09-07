# Convenciones de arquitectura y de módulo

**ETAPA 02 · vinculante para las etapas 03-16**

Este documento no describe lo que sería deseable: describe lo que el linter, el compilador y las pruebas **imponen**. Todo lo que aquí se afirma tiene un mecanismo que lo hace cumplir, y ese mecanismo se nombra en cada regla.

---

## 1. Dirección de dependencia

```
presentación → aplicación → dominio ← infraestructura
```

Ninguna flecha sale del dominio. Se impone en `eslint.config.mjs`:

| Regla                                                                | Qué impide                                                                  | Comprobación                      |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| `no-restricted-imports` sobre `packages/domain-core/src/**`          | Que el dominio nombre NestJS, Supabase, `pg`, `axios`, `fs`, `http`, `zod`… | `./scripts/verificar-frontera.sh` |
| `no-restricted-syntax` (`new Date()`, `Math.random()`, `Date.now()`) | Que el dominio obtenga el instante o la aleatoriedad por su cuenta          | ídem                              |
| `no-explicit-any` como **error**                                     | `any` en cualquier paquete                                                  | `pnpm lint`                       |
| `exports` en `package.json`                                          | Importar rutas internas de un paquete                                       | Node lo rechaza en ejecución      |

`Date` **como tipo** está permitido en el dominio (`ocurridoEn: Date`); lo prohibido es **construirlo**. La regla apunta a la obtención del tiempo, no a nombrarlo.

## 2. Cómo se crea un módulo nuevo sin romper la frontera

1. **Empieza por el dominio.** Agregado, objetos de valor e invariantes en `packages/domain-core/src/<contexto>/`. Sin I/O, sin framework. Si necesitas algo de fuera, **declara un puerto**; no importes.
2. **Declara el token.** Un `Symbol.for('ncr.puerto.<Nombre>')` en `src/tokens.ts`. La prueba de unicidad lo verifica.
3. **Exporta por el barril.** Solo `src/index.ts` publica. Nada más es API.
4. **Escribe el caso de uso** en `apps/api/src/<modulo>/aplicacion/`. Orquesta puertos; no conoce adaptadores.
5. **Implementa el adaptador** en `apps/api/src/<modulo>/infraestructura/`. Aquí sí vive Supabase.
6. **Cablea** en el módulo de Nest: `{ provide: TOKEN, useClass: Adaptador }`.
7. **Presenta** en `.../presentacion/`: controlador, DTO y mapeador. El agregado nunca se serializa crudo.

Regla de una línea: _si un archivo del dominio necesita un `import` que el linter rechaza, la respuesta nunca es relajar el linter — es declarar un puerto._

## 3. Nomenclatura

Español para el dominio (`Vivienda`, `Autorizacion`, `Aforo`, `evaluarAcceso`); inglés para lo puramente técnico (`Repository`, `Provider`, `Handler`, `Guard`). Nunca mezclados dentro de un mismo concepto. Archivos en `kebab-case`, clases en `PascalCase`, funciones y variables en `camelCase`.

## 4. Errores

El fallo esperado es un **valor**, no una excepción: `Resultado<T, ErrorDominio>`. Las excepciones quedan para lo imprevisto. Prohibido lanzar strings y prohibido devolver `null` como señal de negocio (§2.4). Al ampliar una unión —como ocurrió con `FUERA_DE_HORARIO`— usa `nuncaOcurre` en los `switch`: convierte el olvido en error de compilación.

## 5. Umbrales que rompen el build

| Umbral                            | Dónde                                      | Efecto                                |
| --------------------------------- | ------------------------------------------ | ------------------------------------- |
| Cobertura ≥ 90 % en `domain-core` | `vitest.config.ts`                         | La ejecución sale con código 1        |
| `--max-warnings=0`                | scripts `lint`                             | Un aviso es un fallo                  |
| Escaneo de secretos               | `scripts/escanear-secretos.sh`, pre-commit | El commit se detiene                  |
| Configuración incompleta          | `cargarConfiguracion` en `main.ts`         | El proceso muere con `EX_CONFIG` (78) |

La cobertura excluye los archivos que solo declaran tipos: no compilan a código ejecutable y su 0 % no diría nada. Todo lo que tiene comportamiento se mide.

## 5 bis. Cierre de etapa: la suite se ejecuta, no se recuerda

`./scripts/verificar-etapa.sh` es obligatorio antes de escribir un informe (§2.8.0 del contrato). Borra `dist/`, `.turbo/` y `coverage/` antes de nada, instala con `--frozen-lockfile`, compila desde cero, corre lint, typecheck, la suite completa, la cobertura, las fronteras y el escaneo de secretos.

**Las pruebas resuelven `@ncr/*` a su código fuente, no a su `dist/`.** Es una regla, no una comodidad: `dist` está en `.gitignore`, así que cada checkout tiene el suyo, y `pnpm --filter <app> test` no dispara `turbo` ni reconstruye nada. Una suite que consume un artefacto puede quedar desincronizada del código sin que nadie lo note — y cuando pasa, no falla con «módulo no encontrado» sino con un `undefined` en el único símbolo que faltaba.

El control de **ficheros ejecutados frente a ficheros en disco** cubre un tercer camino distinto: un fichero que no carga no cuenta como fallo, simplemente desaparece del recuento.

## 6. Configuración

`process.env` se lee **en un solo sitio**: `cargarConfiguracion`, invocada desde `main.ts` **antes** de construir la aplicación. Validarla dentro de una factoría de Nest la deja atrapada en el contenedor de inyección, que envuelve el fallo y hace perder el código de salida. Ningún otro archivo puede leer el entorno.

## 7. Bitácora

Todo pasa por `Bitacora`, y la **redacción ocurre en el punto de salida**, no en cada llamada: confiar en que quien registra se acuerde de omitir la llave es exactamente cómo acaba una llave en un log. El logger de Nest se adapta al mismo canal para que no convivan dos formatos.

## 8. Git

Ramas `etapa-NN-slug`, siempre desde `develop` actualizado —nunca desde la rama de la etapa anterior—. Conventional Commits con prefijo de etapa. Nunca se reescribe historia en ramas compartidas.
