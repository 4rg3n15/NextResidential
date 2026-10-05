# Corrección de la 15-S1 · La recuperación vacía es «sin la línea»: la consola arranca (DT-15S1-02)

**Rama:** `etapa-15s1-recuperacion-vacia` · **Base:** `develop` (`369df17`, merge del PR #45) más la
15-S1 por avance rápido (`acebd40`, [4rg3n15/NextResidential#46](https://github.com/4rg3n15/NextResidential/pull/46), sin fusionar) ·
**PR:** [4rg3n15/NextResidential#47](https://github.com/4rg3n15/NextResidential/pull/47), hacia `develop`, sin fusionar · **Fecha:** 2026-10-05 · **Corrige:** DT-15S1-02 y, de raíz, H-15S1-01 ·
**Abre:** DT-15S1-C01 y H-15S1-C01

> **Esta corrección NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Una línea de producto en la consola, el ensayo de la víspera y su documentación.
> Probada con las suites de la consola y de la víspera y con la consola compilada
> de verdad; nada contra un equipo.

**Lo incómodo primero.**

1. **La rama no sale de `develop` a secas, aunque así se pidió.** `develop`
   (`369df17`) no tiene la 15-S1: su PR (#46) sigue abierto, y
   `vispera-variables.mjs`, su prueba y `ETAPA-15S1.md` —tres de los cuatro sitios
   del encargo— sólo existen en `etapa-15s1-vispera-de-sitio`. La rama se creó
   desde `develop` y se le hizo avance rápido hasta `acebd40` (la 15-S1 sale de
   `369df17`, así que no hay mezcla): contiene `develop` entero y los siete commits
   de la 15-S1. Fusionado antes el #46, un PR de esta rama contra `develop` sólo
   enseña los suyos; fusionada antes ésta, se lleva la 15-S1 consigo. Es lo que
   hizo la corrección de la 15-R con la suya (PR #43).
2. **Se cierra el defecto, no su clase.** `COOKIE_SEGURA`
   (`apps/web/src/lib/configuracion.ts`) es otro enumerado opcional que no admite
   la vacía: con `COOKIE_SEGURA=` la consola tampoco arranca —«COOKIE_SEGURA:
   Invalid enum value. Expected 'true' | 'false', received ''», comprobado—. Hoy
   nadie la copia vacía, porque no está en el `.env.example` ni entre las de
   Netlify; pero es lo mismo que D-91 cerró en la API normalizando el entorno una
   sola vez (`sinCadenasVacias`: «campo a campo, la variable número treinta es la
   que se olvida»). La consola valida campo a campo y ya van dos. Queda anotado
   (DT-15S1-C01), sin corregir: no es del encargo.
3. **La prueba de precedencia de la víspera habría perdido los dientes.**
   Demostraba que `.env.local` manda sobre `.env` poniendo la recuperación vacía
   en `.env`, que era ✗ si se leía mal. Con el arreglo la vacía deja de ser ✗ y la
   prueba habría pasado leyendo al revés. Ahora usa `desactivado`, que sigue sin
   arrancar; invertir el orden de lectura la pone roja (comprobado, §6).
4. **«Vacía» es exactamente la cadena vacía.** Sin comillas, el cargador de Next
   recorta `RECUPERACION_POR_CORREO=   ` a `''` (comprobado con `@next/env`), así
   que esa línea también arranca. Entre comillas, `" "` sigue impidiendo arrancar,
   como en `API_ORIGEN_PUBLICO` y `CONSOLA_IP_FIRMA_SECRETO`.
5. **«Fuera de producción» es `pnpm dev`, no el sitio.** En sitio la consola corre
   con `pnpm start` (`servidor.mjs` sin `--dev`), y Next fija `NODE_ENV=production`
   al prepararla si no viene puesto (`router-server.js`, `initialize`, Next
   15.5.25): vacía o sin la línea, la recuperación queda desactivada. Lo confirmó
   la consola compilada, arrancada sin `NODE_ENV` (§6).
6. **El PR lo abrió la interfaz contra `main`**, con un título y una descripción
   autogenerados («ETAPA 01: Arquitectura hexagonal…», 504 commits), como el PR
   #44, que acabó fusionado por error en `main`. Se redirigió a `develop`
   (§2.5) y se le puso la descripción de esta corrección: enseña los siete commits
   de la 15-S1 y los de aquí.

---

## 1 · Qué se construyó

La consola trata `RECUPERACION_POR_CORREO` vacía como si no estuviera, igual que
a las otras tres variables de Netlify: arranca, y la recuperación por correo queda
desactivada en producción y activa fuera (`NODE_ENV`), que es la regla de AR-04
para la variable sin declarar. `activa` y `desactivada` no cambian; cualquier
otro valor sigue impidiendo arrancar, con el mensaje que enumera los admitidos.

El ensayo de la víspera (`pnpm sitio:ensayo`) deja de marcar la vacía como «la
consola NO arranca»: la recuperación pasa a la clase de las que pueden ir vacías,
y sólo un valor no admitido sigue siendo ✗. El ejemplo de la consola y la guía de
mañana dicen lo mismo. Y el paso 6 del §9 del informe de la 15-R —«vacía en
producción»—, que leído al pie de la letra dejaba sin consola el despliegue de
Netlify, pasa a ser cierto; lo dice una nota en ese paso.

## 2 · Cómo se organizó y por qué

- **La vacía, en el enumerado; `vacioAIndefinido`, al construir.** Es lo que ya
  hacen las tres de Netlify: el esquema admite `''` y `despliegue()` la convierte
  en ausente con la misma función. Las alternativas cambiaban otra cosa:
  `z.union([z.enum(…), z.literal('')])`, la forma de `API_ORIGEN_PUBLICO`, degrada
  el mensaje de un valor inválido a «Invalid input» —la unión no dice qué
  esperaba—; `z.preprocess`, que la quitaría antes de validar, es un idioma que
  este fichero no usa. Con `''` en el enumerado, el mensaje de `desactivado` sigue
  diciendo «Expected 'activa' | 'desactivada' | ''».
- **Campo a campo, no todo el entorno.** Normalizar el entorno entero como la API
  (D-91) cerraría también DT-15S1-C01, pero cambia más que el encargo: hoy
  `API_ORIGEN_PUBLICO` y `CONSOLA_IP_FIRMA_SECRETO` rechazan un valor sólo de
  espacios, y `sinCadenasVacias` los daría por ausentes; además tocaría
  `configuracion.ts`. Se propone en §8.
- **Dos pruebas, en los dos sitios donde se veía el defecto.** La decisión
  (`recuperacion-desactivada.test.tsx`): vacía en producción → desactivada, fuera
  → activa, y `desactivado` sigue sin arrancar —lo que impide que el arreglo
  degenere en «cualquier cosa vale»—. Y el arranque (`instrumentation.test.ts`):
  `register()` con la línea vacía no sale con 78, que es literalmente «la consola
  arranca». Van en los ficheros que ya probaban eso mismo: crecen 10 y 8 líneas y
  quedan en 99 y 109; un fichero nuevo habría duplicado el arnés de `process.exit`.
- **La víspera.** `RECUPERACION_POR_CORREO` pasa a `vacia` —la clase de Web Push y
  TURN—, y la clase `nunca-vacia`, que sólo la tenía a ella, desaparece con su
  texto. Sin la línea, sale como «· pueden ir vacías en sitio y no están … basta la
  línea vacía (entorno:diff la reclama)», que ahora es verdad. El ✗ queda para un
  valor que no sea vacío, `activa` ni `desactivada`, y sigue sin imprimirlo.
- **El ejemplo conserva `desactivada`.** El encargo pedía el comentario; el valor
  explícito, además, se comporta igual en `pnpm dev` y en `pnpm start`. 52 líneas,
  como antes.
- **Los informes viejos se anotan, no se reescriben.** En la 15-R, una nota en el
  paso 6 del §9, como las «Corrección …» de la ETAPA 12 y de la 15-L; en la 15-S1,
  DT-15S1-02 pasa a CERRADO con su enlace, como DT-15R-09 en la 15-R. «Lo
  incómodo» y el §9 de la 15-S1 quedan como se escribieron: «`desactivada` o sin
  la línea» sigue valiendo.

## 3 · Árbol de archivos

| Fichero                                                                 | Para qué                                                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web/src/lib/configuracion-de-despliegue.ts`                       | DT-15S1-02: `''` admitida y tratada como ausente (109 → 109)                            |
| `apps/web/src/instrumentation.test.ts`                                  | La consola arranca con la línea vacía (101 → 109)                                       |
| `apps/web/src/app/acceso/recuperacion-desactivada.test.tsx`             | Vacía: producción desactivada, fuera activa; `desactivado` no arranca (89 → 99)         |
| `scripts/lib/vispera-variables.mjs`                                     | La recuperación, en `vacia`; fuera `nunca-vacia`; ✗ sólo si no es admitida (162 → 158)  |
| `apps/api/test/vispera-variables.test.ts`                               | La vacía no es ✗; la que falta, por su clase; precedencia con `desactivado` (108 → 126) |
| `apps/web/.env.example`                                                 | El comentario: vacía o sin la línea (52 → 52)                                           |
| `docs/guias/ENTREGA_EN_SITIO.md`                                        | §0.3: `desactivada`, vacía o sin la línea (587 → 587)                                   |
| `docs/etapas/ETAPA-15R.md`                                              | Nota en el paso 6 del §9 (388 → 395)                                                    |
| `docs/etapas/ETAPA-15S1.md`                                             | §8: DT-15S1-02 CERRADO, con enlace (287 → 289)                                          |
| `docs/etapas/ETAPA-15S1-recuperacion-vacia.md`, `docs/ESTADO_ETAPAS.md` | Este informe y su ficha                                                                 |

## 4 · Tabla SOLID

| Pieza                      | SRP                                                                      | OCP                                                        | LSP | ISP                                  | DIP                                                                      |
| -------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | --- | ------------------------------------ | ------------------------------------------------------------------------ |
| `despliegue()`             | Validar y resolver el despliegue; la vacía no le da otra razón de cambio | La regla de la vacía es la misma función de las otras tres | —   | Devuelve el mismo `Despliegue`       | Recibe el entorno (por omisión `process.env`); las pruebas pasan el suyo |
| `bloqueos()` de la víspera | Decir qué impide arrancar                                                | Una clase menos; ninguna rama nueva                        | —   | Sólo los nombres y valores que juzga | Juzga lo que `leerEntornos` le da                                        |

## 5 · Trazabilidad

| Elemento                   | Qué toca                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **AR-04 · E8 (15-R) · D4** | La recuperación por correo sigue desactivada en producción con la variable vacía o sin la línea: el restablecimiento lo hace una persona |
| **§2.7.1**                 | La consola sigue sin arrancar con un valor inválido; ya no con uno que significa «sin declarar»                                          |
| **P-20**                   | El despliegue de Netlify puede llevar la variable vacía, como dice el paso 6 del §9 de la 15-R                                           |
| **BE-02**                  | La víspera de mañana deja de dar un ✗ falso                                                                                              |
| **D-91**                   | La regla de la API («`VAR=` es no configurada»), aplicada a esta variable; la clase sigue abierta en la consola (DT-15S1-C01)            |

## 6 · Pruebas

### Qué se probó y cómo

- **Rojas antes, verdes después.** Con el código de `acebd40` y las pruebas nuevas:

  - `instrumentation.test.ts` › «con RECUPERACION_POR_CORREO VACÍA arranca…» →
    `AssertionError: expected [ 78 ] to deeply equal []`;
  - `recuperacion-desactivada.test.tsx` › «VACÍA es como sin declarar…» →
    `ConfiguracionIncompleta … RECUPERACION_POR_CORREO: Invalid enum value. Expected 'activa' | 'desactivada', received ''`;
  - `vispera-variables.test.ts` › «RECUPERACION_POR_CORREO vacía no es un ✗…», con el
    guion de `acebd40` → `expected [ Array(1) ] to deeply equal []` (la línea
    «✗ RECUPERACION_POR_CORREO vacía: la consola NO arranca»).

  Con el arreglo pasan las tres, con el resto de sus ficheros: 24 pruebas de la
  consola entre `instrumentation`, `recuperacion-desactivada` e `ip-firmada`, y 12
  de la víspera entre `vispera-variables` y `vispera-de-sitio`.

- **La precedencia, con dientes.** Con el orden de lectura de los `.env` de la
  consola invertido en `leerEntornos`, «manda el último» falla; restaurado, pasa.
- **La consola de verdad.** `next build` y `node servidor.mjs -p 3199` sin
  `NODE_ENV`, con un `apps/web/.env.local` temporal con las tres de Netlify vacías
  y `RECUPERACION_POR_CORREO=`: registra «consola: configuracion validada» y
  escucha; `/acceso` no lleva el enlace a la recuperación —dice «Contacta al
  administrador»—; `POST /api/sesion/recuperacion` → 403 con el cuerpo de
  «desactivada». El `.env.local` se borró después. Y `@next/env` entrega esa línea
  como `""`, definida —la premisa del defecto—; sólo con espacios y sin comillas,
  también `""`.
- **Lo que sigue sin arrancar** (sonda temporal, no versionada): `" "` →
  «received ' '»; `desactivado` → «Expected 'activa' | 'desactivada' | '', received
  'desactivado'»; `COOKIE_SEGURA=` → «Expected 'true' | 'false', received ''»
  (DT-15S1-C01).
- **Tipos y lint** de la consola, limpios (`pnpm turbo run typecheck --filter=@ncr/web`,
  `pnpm --filter @ncr/web lint`).

Cómo ejecutarlas:
`pnpm --filter @ncr/web exec vitest run src/instrumentation.test.ts src/app/acceso/recuperacion-desactivada.test.tsx`
y `pnpm --filter @ncr/api exec vitest run test/vispera-variables.test.ts`; todo,
con `./scripts/verificar-etapa.sh --con-base`.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Corrida sobre `7c769a4`, desde un árbol limpio de artefactos, con la base
preparada como en CI (`./supabase/verificar.sh --con-pruebas --modo-supabase`),
Flutter 3.47.4 y el Chromium del entorno (`NCR_CHROMIUM`):

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El declarado es **D-112**: las cinco pruebas saltadas del arranque en frío, que
ejerce el paso 12b. **31 de 31 pasos**, a la primera; **5207 pruebas de
TypeScript** (API 2284, proveedores 1231, consola 785, dominio 438, Edge 325,
configuración 144) —tres más que la 15-S1, las de esta corrección— y **367 de
Dart**, tres corridas forzadas idénticas; ninguna omisión por falta de base (44
ficheros con su guardián); el ensayo de sitio contra los equipos simulados, «SIN
FALLOS · 47 OK»; los 34 controles detectan su violación; escaneo de secretos
limpio (6930 blobs del historial).

### Cobertura por capa

Idéntica a la de la 15-S1: esta corrección no toca dominio ni aplicación.

| Capa                                          | Líneas                      | Ramas   | Umbral         |
| --------------------------------------------- | --------------------------- | ------- | -------------- |
| Dominio (`packages/domain-core`)              | 96,20 %                     | 96,91 % | 90 %           |
| Aplicación (`**/aplicacion/**`, 153 ficheros) | 97,14 %                     | 90,77 % | 90 %           |
| Global (952 ficheros)                         | 87,78 %                     | 87,35 % | 70 %           |
| App · dominio / aplicación / global           | 98,05 % / 96,89 % / 89,68 % | —       | 90 / 90 / 70 % |

Y el CI de GitHub sobre `7c769a4` (run 473, por el empuje): los seis entregables y
los controles en Ubuntu y macOS, en verde; el verificador en macOS quedó
**cancelado** —no rojo— al abrirse el PR #47, cuyo run entra en el mismo grupo de
concurrencia. El del cierre vuelve a correr entero.

## 7 · Verificación de seguridad (§2.7)

| §2.7              | Qué hizo esta corrección                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos      | Ninguno nuevo. La víspera sigue sin imprimir valores y sus pruebas lo exigen con un secreto y una IP de mentira                                       |
| 2 · CORS          | Sin cambios                                                                                                                                           |
| 3 · Validación    | La consola sigue validando al arrancar: sólo la vacía deja de ser un error, y significa lo mismo que no declararla. `" "` u otro valor, no            |
| 4 · Inyección     | Sin cambios                                                                                                                                           |
| 5 · Rate limiting | Sin cambios                                                                                                                                           |
| 6 · RLS           | Sin cambios                                                                                                                                           |
| 7 · CSP           | Sin cambios                                                                                                                                           |
| 8 · Transversales | AR-04 se mantiene: en producción, vacía = desactivada. Antes la vacía fallaba cerrada porque no arrancaba; ahora, sin dejar el despliegue sin consola |

## 8 · Deuda técnica, supuestos y pendientes

- **DT-15S1-02 · CERRADO.** La consola rechazaba `RECUPERACION_POR_CORREO` vacía y
  salía con 78; ahora vacía es «sin la línea».
- **H-15S1-01 · resuelto de raíz.** La 15-S1 corrigió el ejemplo; ahora la línea
  vacía que el ejemplo traía antes también arranca.
- **DT-15S1-C01 · `COOKIE_SEGURA` vacía impide arrancar la consola.** El mismo
  patrón en `configuracion.ts` (ver «Lo incómodo», 2). Arreglo propuesto: normalizar una
  vez el entorno de la consola, como `sinCadenasVacias` en la API (D-91), antes de
  `configuracion()` y de `despliegue()`, decidiendo antes si un valor sólo de
  espacios en `API_ORIGEN_PUBLICO` o `CONSOLA_IP_FIRMA_SECRETO` debe seguir
  rechazándose (hoy sí; con esa normalización, no). La alternativa mínima es la de
  aquí: `''` en el enumerado y tratarla como ausente.
- **H-15S1-C01 · previa, menor: el mensaje de un enumerado nombra el valor
  recibido.** Los comentarios de `leer()` (`configuracion.ts`) y de `despliegue()`
  dicen que el mensaje lleva el nombre y nunca el valor; el de Zod para un
  enumerado lleva «received '…'». Pasa con `NODE_ENV`, `COOKIE_SEGURA` y esta
  variable, ninguna secreta, así que no expone nada; pero el comentario promete más
  de lo que hace. Sin tocar.
- **README:** la tabla de rondas no tiene fila de la 15-S1 (la ronda no la añadió);
  esta corrección tampoco la escribe.
- **Supuestos y contradicciones:** ninguno nuevo.

## 9 · Qué debe hacer el usuario manualmente

1. **Fusionar en orden:** primero la 15-S1
   ([4rg3n15/NextResidential#46](https://github.com/4rg3n15/NextResidential/pull/46))
   en `develop`; después ésta
   ([4rg3n15/NextResidential#47](https://github.com/4rg3n15/NextResidential/pull/47)),
   que entonces sólo enseña sus commits. Fusionar el #47 solo también vale: lleva
   la 15-S1 dentro. **Nunca contra `main`** (§2.5): compruebe la base antes de
   fusionar.
2. **Mañana, en sitio:** nada cambia si `apps/web/.env` dice `desactivada`; vacía o
   sin la línea también arranca y la deja desactivada (`pnpm start` es producción).
3. **Netlify:** `RECUPERACION_POR_CORREO` puede ir vacía o faltar; AR-04 sigue
   cerrada mientras no se ponga `activa`.
4. **Decidir DT-15S1-C01:** normalizar el entorno entero de la consola —y con ello
   el criterio para los valores sólo de espacios— o corregir `COOKIE_SEGURA` como
   ésta.

## 10 · Rama y commits

Rama `etapa-15s1-recuperacion-vacia`, desde `develop` (`369df17`) con la 15-S1 por
avance rápido (`acebd40`). El entorno proponía `claude/inspiring-ritchie-nx0j3o`;
desde el primer commit se trabajó en la rama con nombre de etapa (§2.5).

| Commit    | Qué                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------- |
| `9550556` | DT-15S1-02 · la consola trata la vacía como ausente; sus dos pruebas                                  |
| `e1903d7` | La víspera deja de marcarla; su prueba, el ejemplo y la guía de mañana                                |
| `7c769a4` | Este informe, la ficha de `ESTADO_ETAPAS.md` y las notas en la 15-R y la 15-S1, a falta del veredicto |
| _cierre_  | El veredicto del verificador y el PR #47, en el informe y en la ficha                                 |
