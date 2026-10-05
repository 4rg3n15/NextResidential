# Corrección de la 15-S1 · Las pruebas de la API, compiladas (DT-15S1-03)

**Rama:** `etapa-15s1-tipos-de-las-pruebas` · **Base:** `develop` (`369df17`, merge del PR #45), no la
rama de la 15-S1: el defecto es previo y vive en `develop` · **PR:** [4rg3n15/NextResidential#48](https://github.com/4rg3n15/NextResidential/pull/48), sin fusionar: la interfaz lo abrió contra `main` y se redirigió a `develop` (§2.5) ·
**Fecha:** 2026-10-05 · **Cierra:** DT-15S1-03 · **Corrige, fuera del encargo:** H-15S1-C02 a
H-15S1-C05 · **Abre:** DT-15S1-C02 a DT-15S1-C04

> **Esta corrección NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Ni una línea de producto: pruebas, su configuración de tipos, una tarea de `turbo.json`, el paso 4
> del verificador y su batería negativa.

**Lo incómodo primero.**

1. **No eran dos errores: eran cincuenta, y dos pruebas no probaban lo que decían.** Compiladas con
   las opciones del proyecto, las pruebas de la API dieron 52 errores en 33 ficheros: 3 eran de
   configuración (cómo corren de verdad: ESM, y un tipo de la consola que llega por `@ncr/contracts`)
   y 49 de código, en 30; al corregirlos salió uno más que el primero tapaba, y dos de portabilidad de
   declaraciones que no aplican a ficheros que nunca emiten. De los 50 de código, **dos eran pruebas
   huecas**, que pasaban por la razón equivocada:

   - **H-15S1-C02 · la verificación de H-13-02 no verificaba nada desde el 2026-09-25.** «Un sobre
     de la copropiedad A no se descifra en la B» llamaba a `poner` con dos argumentos —la clave
     «COP_B/p-1» y el sobre—, la firma de la ETAPA 13. La 15-E (`91fc03e`) la cambió a
     `poner(copropiedad, plantilla, datos)` y la prueba siguió igual: el sobre nunca llegaba a B y el
     empuje fallaba porque **no había sobre**, no por la llave. Comprobado por mutación: con UNA sola
     llave para todas las copropiedades —el hallazgo de la ETAPA 13 exacto—, las tres pruebas de
     H-13-02 seguían en verde. Corregida, la primera cae.
   - **H-15S1-C03 · «el equipo no contesta: sin lectura, con un motivo sin dirección ni clave» (15-P)
     no pudo fallar nunca.** `EquipoInalcanzable` recibe `(detalle, latenciaMs)` desde la ETAPA 15; la
     prueba le pasaba tres argumentos, el mensaje era `'vp'` y «el motivo no contiene
     `portero.invalid`» se cumplía siempre. Con `motivoLegible` devolviendo el mensaje del error —una
     fuga—, la original pasaba; la corregida cae.

   En los dos casos el compilador lo decía y nadie lo leía. Es DT-15S1-03 con consecuencias, no en
   teoría.

2. **El control nuevo tenía su propio falso verde, y lo encontré al probarlo** (H-15S1-C05). turbo
   guarda el resultado de `typecheck` por las entradas del PAQUETE, y las pruebas de la API leen
   también el Edge (`apps/edge/src` y `apps/edge/test`), la navegación de la consola y los
   contratos. Con un error de tipos en `apps/edge/test/banco-de-sitio.ts`, `pnpm typecheck` salía 0
   con «@ncr/api:typecheck: cache hit, replaying logs»; `tsc` directo daba TS2322. El verificador no
   lo sufría —su paso 0 borra `.turbo`— ni el CI, que parte de cero; el `pnpm typecheck` de quien
   trabaja en local, sí. Corregido: `@ncr/api#typecheck` va sin caché, y la sonda 41 lo vigila.
3. **El puerto que nombraba el encargo no es el que el doble incumplía.** `HogarEnMemoria` declara
   `CuentasDeResidentes`, de `apps/api/src/residente/aplicacion/puertos-hogar.ts` (L233-246:
   `darDeBaja(copropiedad, usuario, motivo, actor)` → `CuentaDadaDeBaja | null`), no
   `DirectorioDeCuentas` de `apps/api/src/cuentas/aplicacion/puertos.ts` L205, que devuelve `boolean`
   y es el del portero. Se implementó el primero, con el contrato de su adaptador PostgreSQL.
4. **Ninguna suite llamaba a `darDeBaja` por ese doble.** En la línea base sin base, la ruta de la baja
   sólo se recorrió con 401, 403, 400 y el 404 del aislamiento: ninguna petición llegó al caso de uso
   y ninguna respondió 500. «El comportamiento que esperan las suites» se fijó, por tanto, por el
   contrato del adaptador, y una prueba nueva lo ejerce por HTTP; con el doble de `develop` falla 3 de
   3 con 500.
5. **No estoy de acuerdo con resolver `CryptoKey` con los tipos de WebCrypto en la configuración**,
   porque la `lib` del navegador da a todas las pruebas de Node `window`, `document` y compañía: una
   prueba que los usara compilaría y fallaría al ejecutarse. Lo que hice: tipar la clave con lo que
   `jose` entrega y su verificación acepta (`KeyLike`), sin conversión. El riesgo del otro camino es
   justo el que este control viene a cerrar: un verde del compilador que la ejecución desmiente.
6. **Se tocaron dos aserciones existentes, las dos mal tipadas, y ninguna más** (comprobado sobre el
   diff: son las dos únicas líneas `expect(` que cambian fuera de la prueba nueva). Las dos eran
   correctas en ejecución: `expect(r.requiereConfirmacionHumana).toBe(true)` sobre la unión
   `ResultadoAcceso` sin estrechar (`src/autorizaciones/infraestructura/cargador-pg.test.ts:187` y
   `test/cargador-contexto-pg.test.ts:234`); ahora `r.permitido && r.requiereConfirmacionHumana`, con
   la misma fuerza —la línea anterior ya exige `permitido`—. En las dos huecas no cambia la aserción:
   cambia el montaje —la llamada a `poner`, el constructor del error—, y la aserción de siempre
   vuelve a significar lo que dice.
7. **El mismo agujero está en tres paquetes más, y es más pequeño.** Medido con la misma receta:
   proveedores, 3 errores en 92 pruebas (ninguno hueco, por lectura); dominio, 0 en 36; Edge, 0
   en 32. Queda anotado (DT-15S1-C02), sin tocar: el encargo era la API.
8. **Una prueba contra la base no ejercía el cableado de producción** (H-15S1-C04):
   `test/padron-superadmin.test.ts` construía `RepositorioPadronPg` sin claims desde la 15-R
   (`16c900d`), y cada operación fijaba `request.jwt.claims` a nulo. Pasaba porque la prueba se
   conecta como superusuario, que omite la RLS. Ahora lleva `SERVICIO_POR_COPROPIEDAD`, como
   `padron.module.ts`.

9. **El verificador de macOS del CI salió rojo en dos de las tres corridas de esta rama, y no por
   esta rama**: DT-15M-C03 (el audio de la guardia por WebSocket) en la primera y DT-15M-C01 (la
   instantánea del Edge) en la segunda, las dos intermitentes y registradas en la corrección de la
   15-M. La tercera, sobre el cierre, salió entera en verde. El verificador local que pide §2.8.0
   salió correcto; el del CI no estará en verde de forma fiable hasta que se corrijan esas dos
   deudas.

---

## 1 · Qué se construyó

Una configuración de TypeScript para las pruebas de la API, `apps/api/tsconfig.pruebas.json`, con
las opciones estrictas del proyecto, que alcanza las 131 pruebas de `src/**/*.test.ts` y los 119
ficheros de `test/` (el nuevo incluido). El `typecheck` de `@ncr/api` la compila sin emitir después
de compilar la API, y sin la caché de turbo, así que `pnpm typecheck` —el paso 4 del verificador y
el trabajo `controles` del CI, en Linux y en macOS— la recoge sin un paso nuevo y no puede servir un
verde viejo. Cuando falla, el paso 4 nombra ahora los errores.

Con ella, los 50 errores previos corregidos uno a uno por su causa: dobles que se habían quedado
atrás de su puerto, valores fuera de su enumerado, llamadas con un argumento de más o de menos,
ayudantes mal tipados. `HogarEnMemoria` tiene ya `darDeBaja` con el contrato del adaptador, y
`test/baja-de-residente.e2e.test.ts` lo recorre por HTTP en el banco sin base.

Y la prueba negativa del control, la sonda 41 de `scripts/lib/pruebas-negativas.mjs`: devuelve el
defecto que abrió la deuda y mete un error en una prueba de `src/`, y exige que la compilación caiga
con el fichero nombrado; vigila además que el `typecheck` siga compilando las pruebas, que su
configuración no sea menos estricta que la de la API y que turbo no lo sirva de su caché.

## 2 · Cómo se organizó y por qué

**Una configuración aparte, no quitar la exclusión de `tsconfig.json`.** La de la API es la del
build: emite `dist/` desde `rootDir: "src"` y resuelve los paquetes internos a sus declaraciones
compiladas por referencias de proyecto (D-65). Meter las pruebas allí las emitiría en `dist/` y las
compilaría contra artefactos, justo lo que §2.8.0 prohíbe para las pruebas. Son dos programas con
dos propósitos, y cada uno resuelve como corre.

**Modela cómo corren las pruebas de verdad.** Vitest las ejecuta como ESM con resolución de
empaquetador, así que la configuración usa `module: "ESNext"` y `moduleResolution: "Bundler"`: con
CommonJS, dos pruebas que usan `import.meta.url` —válido donde corren— salían como errores que no
existen. Los paquetes internos van al FUENTE con `paths`, igual que los alias de `vitest.config.ts`:
dominio, proveedores y contratos. Contratos porque `test/roles-de-visitantes.e2e.test.ts` importa la
navegación de la consola, que importa un tipo de `@ncr/contracts`; sin la ruta, el error dependía de
si alguien había compilado ese paquete antes.

**Las mismas opciones estrictas, comprobadas y no supuestas.** Hereda la configuración de la API, y
con ella `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`,
`noUnusedParameters`, `noImplicitOverride` y `noFallthroughCasesInSwitch`. Sólo cambia lo que no es
rigor: `noEmit`; `declaration: false`, porque las pruebas nunca emiten declaraciones y dos ayudantes
del banco del Edge daban TS2742 por la portabilidad de un tipo que nadie publica; el módulo y la
resolución; `rootDir`, porque el programa alcanza `apps/edge`, `apps/web` y los paquetes; y `paths`.
`tsc --showConfig` da las mismas siete opciones en las dos, y la sonda 41 lo vuelve a comprobar en
cada corrida.

**`tsc -p`, sin reabrir D-65.** El `typecheck` es `tsc -b tsconfig.json && tsc -p
tsconfig.pruebas.json`. La primera orden sigue reconstruyendo las dependencias por referencias; la
segunda no lee ningún `dist/` —todo lo interno va al fuente— ni deja un `.tsbuildinfo`, que en este
repositorio ha sido dos veces el artefacto que envejece. `frontera-construccion.mjs` sigue en verde.

**Dentro de `typecheck`, no un paso nuevo.** Una línea en `package.json` alcanza a la vez el paso 4
y el CI de las dos plataformas; un paso aparte habría que cablearlo en dos sitios y declararlo en la
lista de pasos ejecutados. Lo único que cambia en el verificador es que un `typecheck` en rojo ya no
se reduce a «✗ pnpm typecheck»: se imprimen las doce primeras líneas `error TS` (D-100).

**Sin caché de turbo, y no con una lista de entradas.** turbo invalida la caché de una tarea por los
ficheros de su paquete y por sus dependencias; el programa de las pruebas de la API alcanza además
el Edge, la consola y los contratos, que no lo son. Probé las dos salidas con turbo 2.3.3: declarar
esas rutas como `inputs` de `@ncr/api#typecheck` funciona —un cambio en `apps/edge/test` da «cache
miss» y el error sale—, pero es una lista que envejece el día que una prueba alcance otro paquete, y
nada lo diría. `cache: false` no tiene lista que mantener; cuesta unos 20 s por `pnpm typecheck` en
local, y nada en el verificador ni en el CI, que no usan caché.

**`darDeBaja` con el contrato del adaptador, no con lo que cupiera.** Sólo una cuenta ACTIVA de ESA
copropiedad; si no la hay, `null` —el 404 de la ruta—; la cuenta sigue en la lista, «de baja»
(RN-19); y devuelve la persona de R1, la misma de su vínculo en el directorio (`PERSONA_R1`,
exportada de allí para que los dos dobles no puedan discrepar). La cascada que sólo sostiene la base
—rol y vínculos inactivos en una transacción, la constancia, el token que no se emite— no se imita:
la prueba `baja-de-residente-pg.test.ts` la ejerce contra PostgreSQL, y la cabecera del doble ya
advierte que un verde suyo no es uno de la base.

**Cada error, por su causa.** Donde el puerto creció, el doble crece con un valor inerte que no se
ejecuta (`estado: () => ({ fase: 'inerte' })`, el mismo que usa `salud.controller.test.ts`). Donde un
valor salió de su enumerado, se usa el que produce el código real: `'escucha'` es el transporte que
pone `recepcion.ts` al Alarm Server, `'INVARIANTE_VIOLADA'` el único fallo tipado de
`RegistrarAcceso`, `'lectura_de_placa'` el tipo del catálogo. Se retiran tres conversiones que
escondían el error —`as ResultadoOcupacion` sobre un valor que no existe, `as ResultadoDeSondeo`
sobre un `undefined` explícito y `as CryptoKey`—, y la única nueva dice lo que hace: `biometria.e2e`
entra en la lista privada del simulado, que no tiene alta pública.

**La sonda, en un espejo.** El banco de las pruebas negativas no tiene `node_modules`, y con `tsc -b`
harían falta los `dist/`. Como la configuración de las pruebas resuelve lo interno al fuente, basta
copiar el banco y enlazar los `node_modules` del repositorio por paquete. Y se usa el `tsc` del
repositorio, no el del PATH: en este contenedor hay un TypeScript 6 global que rechaza la
configuración por otra razón (`moduleResolution: node10` obsoleta), y la sonda concluiría sobre él.
Corre en el paso 9 y en el CI antes de compilar nada; cuesta unos 20 s.

## 3 · Árbol de archivos

Líneas antes → después.

```
apps/api/
├─ tsconfig.pruebas.json                    nuevo · las pruebas, con las opciones de la API y al fuente (17)
├─ package.json                             `typecheck` compila también las pruebas (49 → 49)
├─ test/
│  ├─ baja-de-residente.e2e.test.ts         nuevo · la baja por HTTP en el banco sin base (66)
│  ├─ dobles/hogar-en-memoria.ts            `darDeBaja` con el contrato del adaptador (261 → 287)
│  ├─ dobles/directorio-del-residente.ts    `PERSONA_R1`, compartida con el hogar (435 → 438)
│  ├─ utilidades.ts                         `KeyLike` en vez de `CryptoKey`; la sonda es `SondaDeEquipo` (636 → 642)
│  ├─ padron-superadmin.test.ts             H-15S1-C04 · el adaptador con los claims de producción (164 → 165)
│  ├─ cargador-contexto-pg.test.ts          la aserción mal tipada, estrechada (260 → 260)
│  ├─ registro-de-equipos-pg.test.ts        un veredicto sin capacidades, declarado como tal (347 → 352)
│  ├─ porteros-por-identificador-pg.test.ts la URL de la base llega ya comprobada (544 → 547)
│  ├─ biometria.e2e.test.ts                 la entrada en la lista privada del simulado, escrita (170 → 175)
│  ├─ tablero.e2e.test.ts                   dos dispositivos completos (180 → 184)
│  └─ equipos.e2e · ingesta.e2e · validacion-dtos.e2e   firmas de ayudantes (sin crecer)
└─ src/
   ├─ biometria/aplicacion/casos-de-uso.test.ts          H-15S1-C02 · el sobre, en la clave de B (665 → 666)
   ├─ equipos/infraestructura/lector-de-salidas-por-proveedor.test.ts   H-15S1-C03 (60 → 62)
   ├─ autorizaciones/infraestructura/cargador-pg.test.ts la aserción estrechada; el doble completo (208 → 210)
   ├─ alarmserver/… (4 ficheros)            evento completo, transporte y código reales, `LlamadaEntrante`, `estado`
   ├─ padron/aplicacion/… (3 ficheros)      el repositorio del padrón completo
   ├─ planificacion · salud · tablero · visitas · zonas · multiempresa · configuracion · guardia · biometria
   │                                        dobles y fixtures al día con su puerto
turbo.json                                  H-15S1-C05 · `@ncr/api#typecheck` sin caché (25 → 26)
scripts/
├─ verificar-etapa.sh                       paso 4: nombra los errores de tipos (1270 → 1280)
└─ lib/pruebas-negativas.mjs                sonda 41; 35 controles (3621 → 3762)
docs/
├─ etapas/ETAPA-15S1-tipos-de-las-pruebas.md   este informe
├─ seguridad/AUDITORIA.md                   H-13-02: su verificación estuvo hueca entre la 15-E y hoy
└─ ESTADO_ETAPAS.md                         cabecera, defectos abiertos y ficha de la corrección
```

**Lo que crece y por qué.** El doble del hogar, 26 líneas: el método que le faltaba y sus cuentas
mutables; sigue por debajo de 300. La batería negativa, 141: la sonda 41, dentro del fichero como
las cuarenta anteriores. El paso 4, 10. Los demás crecen lo que pide su puerto. Ningún fichero de
código de producto cambia.

**La fila de defectos de `ESTADO_ETAPAS.md`, con el mismo ancho.** Es la más ancha de la tabla de la
cabecera: si crece, Prettier rellena las diez filas y la fusión con cualquier rama que toque la
cabecera choca en todas. Para que sólo cambie esa fila, salen seis notas de cierre antiguas
—DT-15Q-03, DT-15M-04 a 06, DT-15L-02 y H-15L-C01, H-15I-05, D-25 y D-130 a 132, D-78 y D-34—, que
no son defectos abiertos y siguen en sus fichas.

## 4 · Tabla SOLID

| Pieza                                | SRP                                            | OCP                                                              | LSP                                                                           | ISP                                                 | DIP                                                                    |
| ------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `tsconfig.pruebas.json`              | Compilar las pruebas como corren; nada más     | Otro paquete puede copiar la receta sin tocar ésta               | —                                                                             | —                                                   | Resuelve los paquetes por su fuente, no por su artefacto               |
| `HogarEnMemoria.darDeBaja`           | La baja de una cuenta de residente, en memoria | El método se añade; los otros cinco puertos del doble no cambian | Sustituye al adaptador PostgreSQL con su contrato: `null` = sin cuenta activa | Implementa el puerto que la aplicación pide, entero | La aplicación sigue dependiendo de `CuentasDeResidentes`, no del doble |
| `baja-de-residente.e2e.test.ts`      | La baja por HTTP en el banco sin base          | —                                                                | Corre el mismo cableado que producción, con el doble en lugar de la base      | —                                                   | Usa `crearApp`; no construye nada a mano                               |
| Sonda 41                             | Ver fallar el control de tipos de las pruebas  | Una violación nueva es una línea más                             | —                                                                             | —                                                   | Recibe el `tsc` del repositorio, no el del entorno                     |
| Paso 4 de `verificar-etapa.sh`       | Lint y tipos; ahora con el motivo del rojo     | —                                                                | —                                                                             | —                                                   | —                                                                      |
| `@ncr/api#typecheck` en `turbo.json` | Una excepción de una tarea, con su motivo      | Las demás tareas siguen con la regla general                     | —                                                                             | —                                                   | —                                                                      |

## 5 · Trazabilidad

No cambia la cobertura de requisitos del producto: lo que cambia es que tres pruebas vuelven a
demostrar lo que su nombre dice.

| Elemento            | Qué toca                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| **§2.4**            | TypeScript estricto también en las pruebas: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| **§2.8.0**          | Un verde que no significa lo que dice; la prueba negativa del control nuevo (sonda 41)                         |
| **RN-15 · H-13-02** | La bóveda deriva una llave por copropiedad, y la prueba vuelve a caer si deja de hacerlo (H-15S1-C02)          |
| **RN-21 · §2.7.8**  | Un motivo de error no lleva la dirección del equipo, y la prueba vuelve a poder decirlo (H-15S1-C03)           |
| **RN-19 · CA-02**   | La baja lógica de un residente, también en el banco sin base                                                   |
| **CU-01 3a**        | La lectura dudosa que queda para confirmación humana: la aserción, estrechada                                  |
| **§2.7.6 · RLS**    | El padrón del superadministrador, con los claims de producción (H-15S1-C04)                                    |

## 6 · Pruebas

### Qué se probó y cómo

- **La compilación de las pruebas:** `pnpm --filter @ncr/api exec tsc -p tsconfig.pruebas.json`
  → 0 errores, unos 10 s. El programa tiene 977 ficheros propios: 131 de 131 pruebas de `src/`, 119 de
  119 ficheros de `test/`, y lo que alcanzan del Edge, la consola y los paquetes.
- **La suite de la API sin base, antes y después:** 2262 pruebas (2171 y 91 saltadas, 0 rojas) →
  2265 (2174 y 91, 0 rojas). Las tres nuevas son las de la baja.
- **Las cinco suites tocadas contra PostgreSQL** (`padron-superadmin`, `porteros-por-identificador-pg`,
  `registro-de-equipos-pg`, `cargador-contexto-pg` y `baja-de-residente-pg`, con
  `NCR_BASE_EXIGIDA=1`): 39 de 39, sin una omitida.
- **Las dos huecas, vistas fallar por mutación y vueltas a su sitio:**
  - con `llaveDe` derivando UNA llave para todas las copropiedades, las tres pruebas de H-13-02 de
    `develop` pasan; con la corrección, «un sobre de la copropiedad A no se descifra en la B» cae;
  - con `motivoLegible` devolviendo el mensaje de `EquipoInalcanzable`, la prueba de `develop` pasa;
    la corregida cae.
- **La baja por HTTP:** 3 de 3 con el doble nuevo; 3 de 3 rojas con el de `develop` («expected 500
  to be 404»).
- **El control, de punta a punta en el árbol real:** sin `darDeBaja` en el doble, `pnpm typecheck`
  sale 2 con `test/dobles/hogar-en-memoria.ts(79,14): error TS2420: Class 'HogarEnMemoria'
incorrectly implements interface 'CuentasDeResidentes'`; devuelto, sale 0.
- **La caché de turbo (H-15S1-C05), antes y después:** con la caché caliente y un error de tipos en
  `apps/edge/test/banco-de-sitio.ts`, `pnpm typecheck` salía 0 («cache hit, replaying logs»); con
  `cache: false`, «cache bypass, force executing» y sale 2 con TS2322 en ese fichero. Con `inputs`
  declarados en vez de `cache: false` también salía 2 («cache miss»); se descartó por la lista.
- **La batería negativa:** 35 de 35 controles, 2 min 31 s (2 min 26 s sin la sonda 41); en la sonda
  41, sus ocho comprobaciones en verde.
- **La fusión con la 15-S1** (PR #46) **y con la corrección DT-15S1-02** (PR #47, apilada sobre la
  #46), calculadas con `git merge-tree` sin tocar el árbol: sin conflictos de código, y sus pruebas
  nuevas —`sesiones-de-audio.test.ts`, `audio-guardia-sesion.e2e.test.ts`, las de la víspera y
  `vispera-variables.test.ts`, que la #47 cambia— compilan con esta configuración: 0 errores en las
  dos. Ninguna de las dos toca el verificador, la batería negativa, `turbo.json` ni la configuración
  de la API.

Cómo ejecutarlas: `pnpm --filter @ncr/api typecheck` (API y pruebas), `node
scripts/lib/pruebas-negativas.mjs` (la sonda 41 entre las demás), y todo con
`./scripts/verificar-etapa.sh --con-base`.

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Corrida sobre `b570091`, la cabeza del código, con la base preparada como en CI
—`supabase/verificar.sh --con-pruebas --modo-supabase`— y desde un árbol limpio de artefactos
(34 min 24 s):

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El declarado es **D-112**: las cinco pruebas saltadas del arranque en frío, que ejerce el paso 12b.
**31 de 31 pasos**, ni un ✗; **5186 pruebas de TypeScript** (API 2265 —2260 y las cinco
declaradas—, proveedores 1231, consola 783, dominio 438, Edge 325, configuración 144), tres más que
`develop`, las de la baja, y **367 de Dart**; 488 de 488 ficheros de prueba recogidos; los dos
recuentos del 7b coinciden; tres corridas forzadas idénticas; ninguna omisión por falta de base (44
ficheros con su guardián). El paso 4 dice «✓ pnpm typecheck (con las pruebas de la API)»; los **35
controles** detectan su violación, la sonda 41 entre ellos, y el trinquete de ramas da «257 bloques
sin ejercer (no puede subir; 1 bajaron)»; el ensayo de sitio contra los equipos simulados, «SIN
FALLOS · 47 OK»; escaneo de secretos limpio (6970 blobs del historial).

La corrida anterior, sobre `de1884d`, dio el mismo veredicto en 35 min; se repitió porque `b570091`
cambia `turbo.json` y la sonda 41 (H-15S1-C05). Después de `b570091` sólo entró este cierre:
documentación y dos comentarios de la sonda 41 con la numeración nueva. Sobre la cabeza final se
repitieron la batería negativa, la coherencia de `ESTADO_ETAPAS.md` (paso 1b) y Prettier.

### Cobertura por capa

| Capa                                          | Líneas                      | Ramas   | Umbral         |
| --------------------------------------------- | --------------------------- | ------- | -------------- |
| Dominio (`packages/domain-core`)              | 96,20 %                     | 96,91 % | 90 %           |
| Aplicación (`**/aplicacion/**`, 152 ficheros) | 97,24 %                     | 90,71 % | 90 %           |
| Global (951 ficheros)                         | 87,78 %                     | 87,32 % | 70 %           |
| App · dominio / aplicación / global           | 98,05 % / 96,89 % / 89,68 % | —       | 90 / 90 / 70 % |

### En CI

- **`de1884d` (corrida 475):** `controles` en Linux y en macOS —con la sonda 41 y el `typecheck`
  con las pruebas— y `los seis entregables`, en verde. El verificador de macOS salió **FALLIDO en
  su paso 5** por `audio-guardia-ws.e2e.test.ts` («…segundo operador: queda en cola, sin billete;
  al colgar el primero, abre el suyo» → «Error: el WebSocket no abrió»), que arrastró al 7b
  (turbo, una roja; directo, ninguna). En el mismo trabajo, los pasos 7 y 14 —cuatro corridas más
  de esa suite— pasaron. Es **DT-15M-C03**, intermitente y anterior, registrada en la corrección
  de la 15-M con su causa probable y su arreglo propuesto. Esta rama no toca esa prueba ni lo que
  ejerce: de `test/utilidades.ts`, que importa, cambian sólo tipos, y SWC los borra.
- **`b570091` (corrida 478):** `controles` en Linux y en macOS y `los seis entregables`, en verde.
  El verificador de macOS, **FALLIDO otra vez, por otra intermitente anterior**: en su paso 7
  cayeron tres pruebas de `edge-instantanea-pg.e2e.test.ts` («"sin cambios" con la versión
  vigente»; «hay versión nueva y lo trae», «expected 8 to be 7»; «la nube anota qué versión tiene
  ese Edge», «expected 8 to be 6»), y con ellas el 7b (turbo, ninguna roja; directo, tres). En el
  mismo trabajo, esa suite pasó en el paso 5 y en las tres corridas del 14. Es una de las once de
  **DT-15M-C01** —la versión es el hash de todas las reglas de COP_A, y otras suites las cambian a
  la vez—, que la 15-Q2 ya había visto fallar así. Esta rama no añade quien escriba reglas de
  COP_A: la prueba nueva de la baja corre sin base, y de las suites contra la base sólo cambia en
  ejecución `padron-superadmin`, que escribe viviendas y residentes —no reglas— igual que antes,
  ahora con los claims de producción.
- **`e4d3262` (corrida 479, el cierre):** todo en verde, el verificador de macOS incluido.

**Tres corridas del CI: dos rojas en macOS, cada una por una intermitente distinta y anterior, y una
entera en verde sobre el cierre, que sólo añade documentación y dos comentarios.** No las llamo ruido: son DT-15M-C03 y DT-15M-C01, con su causa
y su arreglo propuesto en el informe de la 15-M, y mientras no se corrijan cualquier rama puede caer
en ellas. Corregirlas no es de este encargo (§9).

## 7 · Verificación de seguridad (§2.7)

| §2.7              | Qué hizo esta corrección                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos      | Ninguno nuevo; escaneo limpio en cada commit. Las IP de las pruebas siguen en los rangos de documentación                           |
| 2 · CORS          | Sin cambios                                                                                                                         |
| 3 · Validación    | Sin cambios en la API; la baja por el banco sin base pasa por el `ValidationPipe` real (el 400 sin motivo ya lo ejercía el barrido) |
| 4 · Inyección     | Sin cambios                                                                                                                         |
| 5 · Rate limiting | Sin cambios                                                                                                                         |
| 6 · RLS           | El padrón del superadministrador se prueba con los claims de producción (H-15S1-C04)                                                |
| 7 · CSP           | Sin cambios                                                                                                                         |
| 8 · Transversales | Vuelven a probar lo que dicen la bóveda por copropiedad (H-13-02) y el motivo sin dirección del equipo; `AUDITORIA.md` lo anota     |

## 8 · Deuda técnica, supuestos y pendientes

- **DT-15S1-03 · CERRADO.** Las pruebas de la API se compilan con las opciones estrictas del
  proyecto, y `pnpm typecheck` falla si una deja de compilar.
- **H-15S1-C02 · CORREGIDO, fuera del encargo.** La primera prueba de H-13-02 estuvo hueca desde la
  15-E (`91fc03e`, 2026-09-25). Anotado también en `docs/seguridad/AUDITORIA.md`, bajo H-13-02.
- **H-15S1-C03 · CORREGIDO, fuera del encargo.** «El motivo sin dirección ni clave» del lector de
  salidas (15-P, `a469def`) estuvo hueca desde que nació.
- **H-15S1-C04 · CORREGIDO, fuera del encargo.** `padron-superadmin` sin claims desde la 15-R.
- **H-15S1-C05 · CORREGIDO.** El `typecheck` de la API se servía de la caché de turbo aunque
  cambiara un fichero de fuera de su paquete que sus pruebas leen. Ahora va sin caché.
- **DT-15S1-C02 · el mismo agujero en proveedores, dominio y Edge.** Sus `tsconfig.json` excluyen
  `src/**/*.test.ts` y el Edge no alcanza su `test/`. Medido: proveedores, 3 errores en 92 pruebas
  —`apertura-de-verificacion.test.ts:85` (`body: undefined` con `exactOptionalPropertyTypes`),
  `cliente-e1-nonce-cacheado.test.ts:245` (`reintentable` sobre el tipo base `ErrorDeEquipo`) y
  `servidor-rtsp.go2rtc.test.ts:139` (`camara` posiblemente nula)—, los tres correctos en ejecución;
  dominio, 0 en 36; Edge, 0 en 32. Arreglo propuesto: la misma receta por paquete, con su línea en
  `typecheck` (y sin caché si su programa sale del paquete, como el de la API).
- **DT-15S1-C03 · la tercera prueba de H-13-02 no distingue llaves.** «Dos copropiedades cifran el
  MISMO vector en sobres distintos» pasa también con una sola llave, porque el vector de inicio es
  aleatorio: comprobado con la misma mutación. No es de tipos y no se toca; la que guarda H-13-02 es
  la primera, ya corregida. Arreglo propuesto: retirarla o hacer que compare descifrados cruzados.
- **DT-15S1-C04 · `biometria.e2e` entra en la lista privada de `MockProvider`.** Ahora lo dice la
  conversión; quitar el acoplamiento pide una puerta pública en el simulado, que es código de
  `packages/providers`.
- **Supuestos y contradicciones:** ninguno nuevo.
- **Numeración.** Los C01 de la 15-S1 ya los usa la corrección DT-15S1-02 (PR #47):
  DT-15S1-C01 es «`COOKIE_SEGURA` vacía tumba la consola» y H-15S1-C01, «el mensaje de un enumerado
  nombra el valor recibido». Los de esta corrección empiezan en C02. Dos commits ya empujados llevan
  la numeración provisional y no se reescriben: «H-15S1-C01 y C02» de `4e1f916` son H-15S1-C02 y
  C03; «H-15S1-C04» de `b570091` es H-15S1-C05.

## 9 · Qué debe hacer el usuario manualmente

1. **Revisar y fusionar el PR #48 contra `develop`, nunca contra `main`.** La interfaz lo abrió
   contra `main`, con un título y una descripción autogenerados —501 commits y 2829 ficheros—; se
   redirigió a `develop` (7 commits, 40 ficheros) y se reescribió.
2. **Fusionar con la 15-S1 (PR #46) y con la corrección DT-15S1-02 (PR #47) en cualquier orden.**
   El código no choca y sus pruebas compilan con este control. `ESTADO_ETAPAS.md` chocará en la
   cabecera, en la fila de defectos abiertos y en el sitio donde entra cada ficha: se conservan todas
   las fichas, la más reciente primero, y en la fila de defectos DT-15S1-03 queda **cerrado** —la de
   la #47 la da por abierta—. El informe de la 15-S1 dejará DT-15S1-03 como abierta; la ficha de esta
   corrección dice que se cerró aquí.
3. **Decidir DT-15S1-C02 a C04.** La más barata y útil es C02: la misma receta en proveedores, con
   tres arreglos de tipos.
4. **Saber que `pnpm typecheck` tarda unos 20 s más en local:** es el precio de H-15S1-C05, y es
   deliberado.
5. **Saber que el verificador de macOS del CI cayó en dos de las tres corridas de esta rama**, por
   DT-15M-C03 y DT-15M-C01, previas y ajenas; sobre el cierre salió en verde. Si hace falta el CI en
   verde para fusionar, la salida es corregir esas dos deudas en su propia corrección —sus arreglos
   están propuestos en el §8 de la 15-M—, no reintentar hasta que pase.
6. **Nada más para que esto funcione:** ni variables nuevas, ni migraciones, ni dependencias.

## 10 · Rama y commits

Rama `etapa-15s1-tipos-de-las-pruebas`, desde `develop` (`369df17`); PR [4rg3n15/NextResidential#48](https://github.com/4rg3n15/NextResidential/pull/48), contra `develop`. El entorno proponía
`claude/dazzling-shannon-m48v3n`; desde el primer commit se trabajó en la rama con nombre de etapa
(§2.5), como pidió el encargo.

| Commit    | Qué                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c15e906` | `HogarEnMemoria` cumple `CuentasDeResidentes`: `darDeBaja`, y la baja por HTTP sin base                                                             |
| `4e1f916` | H-15S1-C02 y C03 · las dos pruebas huecas                                                                                                           |
| `d3fc54d` | El resto de los errores de tipos de las pruebas, sin cambiar lo que comprueban                                                                      |
| `c59cefd` | `tsconfig.pruebas.json`; `typecheck` compila las pruebas; el paso 4 nombra los errores                                                              |
| `de1884d` | Sonda 41: un error de tipos en una prueba de la API rompe `typecheck`                                                                               |
| `b570091` | H-15S1-C05 · `@ncr/api#typecheck` sin caché de turbo; la sonda 41 lo vigila                                                                         |
| _cierre_  | Este informe, la nota de H-13-02 en `AUDITORIA.md`, la ficha de `ESTADO_ETAPAS.md` con el veredicto, y H-15S1-C05 en dos comentarios de la sonda 41 |

Los mensajes de `4e1f916` y `b570091` usan la numeración provisional; la correspondencia está en §8
(«Numeración»).
