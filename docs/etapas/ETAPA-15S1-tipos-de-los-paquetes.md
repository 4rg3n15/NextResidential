# Corrección de la 15-S1 · las pruebas de dominio, proveedores y Edge, compiladas (DT-15S1-C02)

**Rama:** `etapa-15s1-tipos-de-los-paquetes` · **Base:** `develop` (`f605442`, merge del PR #49) · **Fecha:** 2026-10-06
**Abre:** — · **Cierra:** DT-15S1-C02

> Esta corrección **no** cierra la ETAPA 15, que sigue bloqueada sólo por `BE-02`.

## 1 · Qué se construyó

Nada de producto. DT-15S1-C02 nació en la corrección anterior
([`ETAPA-15S1-tipos-de-las-pruebas.md`](ETAPA-15S1-tipos-de-las-pruebas.md) §8): las
pruebas de la API ya se compilaban con las opciones estrictas, pero las de
`packages/domain-core`, `packages/providers` y `apps/edge` seguían fuera de todo
compilador, porque sus `tsconfig.json` las excluyen y vitest las ejecuta con SWC, que
borra los tipos sin comprobarlos. Un error de tipos en esas pruebas no rompía nada.

Ahora las tres se compilan con la misma receta que la API, dentro de `pnpm typecheck`
(paso 4 del verificador y CI). Salieron **tres errores**, los tres en proveedores y los
tres correctos en ejecución; dominio y Edge compilan con **0**, como anotaba la deuda.

## 2 · Cómo se organizó y por qué

- **La misma receta, no una nueva.** Cada paquete gana un `tsconfig.pruebas.json` que
  extiende su `tsconfig.json` —así hereda `strict`, `noUncheckedIndexedAccess` y
  `exactOptionalPropertyTypes`, las del código que prueba— y sólo cambia lo que una
  prueba necesita: `noEmit`, sin `composite`, resolución `Bundler` (como vitest) y
  `paths` hacia el **fuente** de los paquetes internos, nunca a su `dist/` (§2.8.0).
  `rootDir` sube a la raíz porque las pruebas del Edge importan `apps/api/src` y las de
  proveedores, `scripts/lib/respaldo-en-sitio.mjs`.
- **`tsc -b` y `tsc -p`, los dos.** `typecheck` queda
  `tsc -b tsconfig.json && tsc -p tsconfig.pruebas.json`: el primero es el de siempre
  (D-65 exige la compilación por proyectos); el segundo compila las pruebas, que no son
  un proyecto compuesto.
- **Sin caché de turbo en los tres.** H-15S1-C05 enseñó que turbo calcula la huella con
  los ficheros del paquete: un error en un fichero de FUERA que la prueba importa no
  invalida la caché y `typecheck` repite el verde anterior. Eso pasa en el Edge
  (lee la API) y en proveedores (lee `scripts/`). Dominio sólo lee lo suyo y su caché
  sería segura; va igual sin caché por no tener una regla con excepciones, y cuesta
  segundos.
- **Los tres errores de proveedores** (commit `7a1b140`), ninguno de producto:
  - `apertura-de-verificacion`: `body: undefined` no cabe en `RequestInit` con
    `exactOptionalPropertyTypes`; `body: null` sí, y el simulado trata los dos igual.
    Sigue simulando el cuerpo perdido que da 400 (H-SITIO-15).
  - `cliente-e1-nonce-cacheado`: la aserción leía `reintentable` —de
    `SinDesafioDigest`— sobre el tipo base. Se estrecha con la misma fuerza
    (`error instanceof SinDesafioDigest && error.reintentable`). Es la única aserción
    que cambia.
  - `servidor-rtsp.go2rtc`: el estrechamiento de `camara` no llegaba al cierre de
    `hastaQue`; la cámara no cambia entre medias y se toma en una constante.
- **La sonda 41 vigila los cuatro programas, no sólo la API.** Por cada uno comprueba
  que la base compila, que `typecheck` llama a `tsc -p tsconfig.pruebas.json`, que las
  opciones estrictas de las pruebas son las del paquete (`--showConfig`) y que turbo no
  lo cachea. Y lo ve fallar: relajar `exactOptionalPropertyTypes`, devolver la caché a
  la API o al Edge, quitar `darDeBaja` del doble, volver a `body: undefined` en
  proveedores y una prueba nueva mal tipada en cada programa: cada violación se nombra
  con su fichero.

## 3 · Árbol de archivos

| Fichero                                           | Propósito                                                       |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `packages/domain-core/tsconfig.pruebas.json`      | Compila las pruebas del dominio con sus opciones estrictas      |
| `packages/providers/tsconfig.pruebas.json`        | Ídem proveedores; `@ncr/domain-core` al fuente                  |
| `apps/edge/tsconfig.pruebas.json`                 | Ídem Edge (`src/**/*.test.ts` y `test/`); dominio y proveedores |
| `packages/{domain-core,providers}/package.json`   | `typecheck` compila también las pruebas                         |
| `apps/edge/package.json`                          | Ídem                                                            |
| `turbo.json`                                      | `typecheck` de los tres paquetes, sin caché (H-15S1-C05)        |
| `packages/providers/src/**/*.test.ts` (3)         | Los tres errores de tipos, corregidos                           |
| `scripts/lib/pruebas-negativas.mjs`               | Sonda 41: los cuatro programas, con sus violaciones             |
| `docs/etapas/ETAPA-15S1-tipos-de-los-paquetes.md` | Este informe                                                    |
| `docs/ESTADO_ETAPAS.md`                           | Cabecera y ficha                                                |

## 4 · Tabla SOLID

| Principio | Justificación                                                                   |
| --------- | ------------------------------------------------------------------------------- |
| SRP       | Cada `tsconfig.pruebas.json` hace una cosa: compilar las pruebas de su paquete  |
| OCP       | Se añaden programas a la sonda 41 sin cambiar cómo comprueba cada uno           |
| LSP       | No aplica: no hay sustitución de implementaciones                               |
| ISP       | No aplica: no hay puertos                                                       |
| DIP       | No aplica: configuración y guion de verificación, fuera de dominio y aplicación |

## 5 · Trazabilidad

Ningún OE, RN, HU, CU, CA ni KPI cambia de estado. Refuerza KPI-12 (la suite sin
hardware): las 1231 pruebas de proveedores, que sostienen el contrato de los
adaptadores, ya no pueden quedar mal tipadas en silencio. Cierra DT-15S1-C02.

## 6 · Pruebas

- `pnpm typecheck` → 11 de 11 tareas; las tres nuevas, «cache bypass».
- `node scripts/lib/pruebas-negativas.mjs` → «los 35 controles detectan su violación y
  aceptan el caso legítimo»; la sonda 41, con sus 25 comprobaciones.
- **Veredicto de §2.8.0**, `./scripts/verificar-etapa.sh --con-base` sobre `cb176f6`, con
  la base preparada como en CI (`./supabase/verificar.sh --con-pruebas --modo-supabase`),
  37 min:

  > **VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe**

  31 de 31 pasos; 0 ✗. 5210 pruebas de TypeScript (API 2282 + 5 saltadas declaradas,
  proveedores 1231, consola 785, dominio 438, Edge 325, configuración 144) y 367 de
  Dart, tres corridas idénticas. Cobertura: dominio 96,20 %, aplicación 97,26 %,
  global 87,79 % de líneas; app 98,05 % / 96,89 % / 89,68 %. El control declarado no
  ejercido es el de siempre, sólo de macOS (D-112: «0 de ellos en linux»).

- La CI del PR lo repite en Linux y macOS.

## 7 · Seguridad

Sin cambios en RLS, permisos, secretos ni superficie de la API. Sólo compila más.

## 8 · Deuda, supuestos y pendientes

- **Siguen abiertas DT-15S1-C03** (la tercera prueba de H-13-02 no distingue llaves) y
  **DT-15S1-C04** (`biometria.e2e` entra en la lista privada del simulado): fuera del
  encargo.
- La etiqueta del paso 4 del verificador dice «con las pruebas de la API» y se queda
  corta: también compila las de dominio, proveedores y Edge. No se toca después de la
  verificación, para que el veredicto sea el del árbol entregado.
- Ningún `[SUPUESTO]` ni `PENDIENTE DE DEFINICIÓN` nuevos.

## 9 · Qué debe hacer el usuario

Nada manual: revisar y fusionar el PR hacia `develop`.

## 10 · Rama y commits

`etapa-15s1-tipos-de-los-paquetes`, desde `develop` (`f605442`):

- `7a1b140` `fix(etapa-15s1/proveedores): DT-15S1-C02 — los tres errores de tipos de las pruebas de proveedores`
- `1ba8bd8` `feat(etapa-15s1/verificador): DT-15S1-C02 — typecheck compila también las pruebas de dominio, proveedores y Edge`
- `cb176f6` `test(etapa-15s1/verificador): DT-15S1-C02 — la sonda 41 ve fallar el control en dominio, proveedores y Edge`
- el cierre: `chore(etapa-15s1): cierre de la corrección DT-15S1-C02`
