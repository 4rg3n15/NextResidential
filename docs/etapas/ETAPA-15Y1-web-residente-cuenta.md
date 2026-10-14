# ETAPA 15 · RONDA 15-Y1 — El residente sin app, en la consola: «Crear cuenta», primer ingreso y contraseña

**Rama:** `etapa-15y1-web-residente-cuenta` · **Base:** `etapa-15z3-actividad-por-vivienda` (la contiene) · **Estado:** CERRADA · 2026-10-14 · **PR:** hacia `develop`, sin fusionar; fusionar DESPUÉS del PR de la 15-Z3 con merge commit · quinta de la cadena 15-S6 → 15-Y3 (encargo del 2026-10-13)

> **Lo incómodo primero.** La consola no tenía NINGUNA de las tres cosas: un
> residente con iPhone (P-23) no podía crear su cuenta, el titular que la
> administración daba de alta entraba y caía en un inicio que no podía
> funcionar porque su persona no existía, y nadie podía cambiar su contraseña
> sin que se la restablecieran. Esta ronda pone las tres con las rutas que la
> app ya usa y las mismas palabras; **no toca la API ni la app**. Lo que sigue
> sólo en la app —plazas, menores, vehículos, revocar, el rostro— es de la
> 15-Y2 y la 15-Y3. Y una verdad del arnés: hasta hoy ningún recorrido podía
> crear una cuenta de punta a punta, porque el doble de GoTrue no administraba
> usuarios; ahora sí, y el recorrido lo demuestra en Chromium a 360 px.

---

## 1 · Qué se construyó

**«Crear cuenta» en la consola** (`/acceso/crear-cuenta`, enlazada desde la
pantalla de acceso): los seis campos de D-W8 —usuario, correo, contraseña,
confirmación, código de invitación y fecha de nacimiento—, la política de
tratamiento de datos tal cual la entrega la API con su versión, y la casilla.
Las reglas de forma y sus textos son los de la app, letra por letra; la verdad
la dice el servidor: un código inválido, usado o ajeno recibe UNA respuesta
genérica que se pinta tal cual; el usuario ocupado va bajo su campo; si la
política cambió mientras se llenaba el formulario, la casilla se desmarca y se
avisa; un 429 dice cuánto esperar; un menor de edad no envía nada, porque la
fecha lo dice antes. Al crearla, la consola entra sola con el prefijo del
código como código de la copropiedad, como la app; si no puede, lo dice con el
código y deja reintentar.

**El primer ingreso en «Mi vivienda»**: la puerta pregunta a `GET …/mi/alta`
si la cuenta ya tiene persona en su vivienda. Si no la tiene y sí tiene
vivienda —el titular que la administración creó, o quien creó su cuenta con
un código de plaza—, completa nombres, apellidos, documento de adulto,
teléfono, fecha de nacimiento y correo opcional (`POST …/mi/alta`), con los
motivos y explicaciones que manda el servidor; si no tiene vivienda, «La
administración debe asignarle su vivienda».

**La contraseña**: el cambio obligado del titular en su primer ingreso ya
existía en el acceso (ADR-023) y el recorrido lo ejercita; desde el Perfil,
«Cambiar contraseña» por la misma ruta de la consola, con las palabras de la
app.

**Un recorrido en navegador de verdad** (`e2e/recorrido-residente-web.mjs`,
paso 13d del verificador) a 360 px contra la API real, PostgreSQL y el doble
de GoTrue, que ahora administra usuarios (`doble-gotrue-admin.mjs`); y el
arnés de los recorridos (`arnes-de-recorrido.mjs`), que sale de
`recorrido-de-consola.mjs` y comparten los dos.

## 2 · Cómo se organizó y por qué

### Punto 1 · Las reglas de la app, repetidas con sus pruebas, y no un paquete nuevo

La consola no depende de `@ncr/domain-core` —sólo del contrato—, y la app
tampoco: cada cliente repite las reglas de FORMA (la cortesía) en su lengua y
el servidor decide. Aquí se hizo lo mismo que hizo la app: `lib/registro/
reglas.ts` y `edad.ts` repiten `registro.dart` y `edad.dart` con las mismas
palabras —«Escriba el código completo, como MIRA-K7PQ-2XWZ», «Las cuentas son
para mayores de edad. Un adulto de su hogar lo registra desde Mi familia»— y
el mismo margen de un día en la edad. Añadir `domain-core` a la consola por
tres funciones habría metido el dominio entero en el navegador. Lo que sí se
exige es la paridad, y la prueba la fija texto a texto.

### Punto 2 · La política se obtiene como la obtiene la app: con el formulario vacío (S-15Y1-02)

La API no tiene una ruta pública para la política (C-60 de la 15-W la
descartó) y la entrega adjunta a cualquier 400 de `POST /auth/registro`. La
app manda el formulario vacío, que el servidor rechaza por forma antes de
juzgar ningún código ni contar un intento contra ningún conjunto; `GET
/api/registro` hace exactamente eso. Añadir una ruta a la API «para que la
consola la tenga más fácil» era ampliar el contrato por comodidad.

### Punto 3 · `/api/registro` y no el proxy: sin sesión no hay proxy, y la IP sí viaja

`/api/ncr/*` exige sesión, y quien crea su cuenta no la tiene. La ruta nueva
reenvía SOLO el formulario (los siete campos, como texto acotado, y la
casilla) y la IP del navegador (`reenvioDeIp`, 15-L H6), para que la API
aplique sus límites por IP y por prefijo del código; y lleva su propio límite
por IP (§2.7.5) como las demás rutas de sesión. La respuesta de la API vuelve
tal cual —estado, `campos`, `codigo`, `politica`, `Retry-After`—: el
formulario decide con ella, igual que la app con `cuerpo_de_error.dart`.

### Punto 4 · El primer ingreso envuelve el inicio, no todas las páginas (S-15Y1-01)

Sin persona en su vivienda, `/mi` no sirve para nada: el inicio consulta la
vivienda del residente y no la hay. La puerta (`puerta-del-primer-ingreso.tsx`)
envuelve sólo esa página, que es donde el residente cae al entrar; las demás
de `/mi/*` responden como hasta ahora. Es lo que hace la app con
`PuertaDePrimerIngreso`, y evita tocar siete páginas para una situación que
dura un minuto. Declarar ocupantes —lo que la app pide al titular en ese mismo
paso— queda para la 15-Y2, que es la ronda del hogar.

### Punto 5 · Nada sensible en el navegador

Ni la contraseña, ni el código de plaza, ni el correo tocan `localStorage`,
`sessionStorage`, la caché de consultas ni los registros: viven en el estado
del formulario mientras está abierto. El recorrido lo comprueba leyendo los
dos almacenes tras cada flujo. (El acceso ya guardaba el código corto de la
copropiedad en `localStorage` desde antes: es un identificador público del
conjunto, no un secreto.)

### Punto 6 · El doble de GoTrue administra usuarios, y el arnés sale a un módulo

`cuentas-supabase.ts` crea identidades con `POST /admin/users`, fija la
contraseña con `PUT` y compensa con `DELETE`; `factores-supabase.ts` lista
factores por administración. El doble sólo atendía el acceso y los factores,
así que «Crear cuenta» y el alta del titular no se podían recorrer. La
administración vive en `doble-gotrue-admin.mjs` (el doble delega antes de su
404 y no pasa de 300 líneas) y reproduce lo que la API espera: `422
email_exists` para el duplicado, que la API traduce a «usuario ocupado».

El arnés —puertos, Chromium, procesos, espera, base de plantilla, API y
consola— estaba dentro de `recorrido-de-consola.mjs`. Sacarlo a
`arnes-de-recorrido.mjs` deja ese guion en 1140 líneas (de 1349) y evita
copiarlo: el recorrido del residente lo importa. El paso 13b del verificador
demuestra que el de la consola sigue siendo el mismo.

### Punto 7 · Lo que el recorrido destapó y corrigió por el camino

- La API exige `INGESTA_FIRMA_SECRETO` al arrancar (§2.7.1): el arnés no lo
  ponía por omisión y el recorrido del residente arrancaba una API que no
  llegaba a escuchar.
- `getByLabel('Contraseña nueva')` casaba también con «Repite la contraseña
  nueva» (Playwright busca por subcadena): etiquetas exactas.
- Next.js pinta un anunciador de rutas con `role="alert"` vacío: el aviso del
  formulario se busca por su elemento, no por su papel.
- El menú repite «Mi vivienda» en un enlace oculto a 360 px: se espera el
  ENCABEZADO, no el texto.

## 3 · Árbol de archivos

```
apps/web/src/
├─ lib/registro/reglas.ts                        (89)  las reglas de forma de la app, con sus palabras; `motivoDeRechazoDeContrasena`
├─ lib/registro/edad.ts                          (69)  fecha civil de Bogotá, edad con margen de un día, mayoría de edad
├─ lib/registro/respuesta.ts                     (49)  la política adjunta al rechazo, la espera del 429
├─ lib/registro/reglas.test.ts                   (76)  paridad texto a texto con la app
├─ app/api/registro/route.ts                    (133)  GET política (formulario vacío) · POST reenvío con IP y límite propio
├─ app/acceso/crear-cuenta/page.tsx              (30)  pública; con sesión, al inicio
├─ app/acceso/crear-cuenta/formulario-crear-cuenta.tsx (282)  estado, envío, respuestas del servidor, entrada automática
├─ app/acceso/crear-cuenta/campos-de-registro.tsx (90)  los seis campos
├─ app/acceso/crear-cuenta/casilla-de-politica.tsx (76)  la política con su versión: cargando, sin ella, con ella
├─ app/acceso/crear-cuenta/formulario-crear-cuenta.test.tsx (205)  nueve casos: estados, código inválido, menor, 409, política cambiada, 429
├─ app/acceso/page.tsx                        (75→88)  el enlace «Crear cuenta…» y el aviso del cambio desde el Perfil
├─ app/(consola)/mi/puerta-del-primer-ingreso.tsx (58)  GET …/mi/alta: pasa, pide el alta o dice «sin vivienda»
├─ app/(consola)/mi/primer-ingreso.tsx          (197)  el formulario del alta con los campos y textos de la app
├─ app/(consola)/mi/primer-ingreso.test.tsx            seis casos: cargando, pasa, sin vivienda, error y sin conexión, menor, rechazo
├─ app/(consola)/mi/page.tsx                           la puerta envuelve el inicio
├─ app/(consola)/mi/perfil/cambiar-contrasena.tsx (137)  el cambio desde el Perfil por /api/sesion/contrasena
├─ app/(consola)/mi/perfil/cambiar-contrasena.test.tsx  cuatro casos
├─ app/(consola)/mi/perfil/pantalla.tsx      (203→225)  la tarjeta «Contraseña»
└─ app/(consola)/formularios-sin-identificadores.test.tsx  el primer ingreso, clasificado en el barrido
e2e/
├─ recorrido-residente-web.mjs                         el recorrido (paso 13d)
├─ residente-web/acciones.mjs                          sus acciones: token aal2, API, entrar, primer ingreso, almacenes
├─ arnes-de-recorrido.mjs                       (279)  el arnés compartido, extraído de recorrido-de-consola.mjs
├─ doble-gotrue-admin.mjs                        (93)  administración de usuarios del doble
├─ doble-gotrue.mjs                          (277→289)  delega la administración
└─ recorrido-de-consola.mjs                 (1349→1140) importa el arnés; mismo recorrido
scripts/verificar-etapa.sh                             paso 13d
scripts/lib/pruebas-negativas.mjs                      la prueba negativa del recorrido (sin base, sin Chromium), en línea
docs/guias/MANUAL_USUARIO.md                           «Desde la consola web (15-Y1)»
```

## 4 · Tabla SOLID

| Fichero                         | SRP                                                             | OCP                                                           | LSP                                             | ISP                                     | DIP                                                           |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `reglas.ts` · `edad.ts`         | Reglas de forma puras, una por campo; la edad aparte            | Otra regla es otra función                                    | —                                               | —                                       | Sin React ni red                                              |
| `respuesta.ts`                  | Leer la respuesta del servidor                                  | —                                                             | —                                               | —                                       | Sin React                                                     |
| `api/registro/route.ts`         | Reenviar el formulario y traer la política; nada más            | —                                                             | —                                               | Reenvía SÓLO los campos del contrato    | Lee `configuracion()`; no conoce la API más allá de la URL    |
| `formulario-crear-cuenta.tsx`   | Estado y envío; los campos y la política son componentes aparte | Un campo más es una línea en `CamposDeRegistro`               | —                                               | Recibe sólo el reloj (inyectable)       | Reglas y respuesta por módulos puros; `fetch` a rutas propias |
| `puerta-del-primer-ingreso.tsx` | Decidir entre pasar, el alta o «sin vivienda»                   | —                                                             | —                                               | Recibe `copropiedadId` y los hijos      | El cliente generado                                           |
| `primer-ingreso.tsx`            | El formulario del alta; `motivosLocales` pura y exportada       | —                                                             | —                                               | —                                       | El cliente generado                                           |
| `cambiar-contrasena.tsx`        | El cambio desde el Perfil                                       | —                                                             | Misma ruta y semántica que `CambioObligatorio`  | Recibe `alCerrar`                       | `fetch` a la ruta de la consola                               |
| `doble-gotrue-admin.mjs`        | La administración de usuarios del doble                         | El doble delega: otra familia de rutas sería otro módulo      | Lo que la API espera de GoTrue, con sus códigos | —                                       | Recibe `usuarios`, `factoresPorUsuario` y `responder`         |
| `arnes-de-recorrido.mjs`        | Arranque y parada de lo que todo recorrido necesita             | `entorno` y `nombrarVolcado` para lo que cada recorrido añade | El recorrido de la consola sigue igual (13b)    | Cada función recibe sólo sus parámetros | —                                                             |
| `recorrido-residente-web.mjs`   | Los seis pasos; las acciones, en `residente-web/acciones.mjs`   | —                                                             | —                                               | —                                       | Importa el arnés y el doble                                   |

Ningún fichero nuevo pasa de 300 líneas; `recorrido-de-consola.mjs` y
`scripts/verificar-etapa.sh` cambian para delegar (el primero encoge 209
líneas; el segundo gana el paso 13d, 12 líneas, como cada ronda que añadió
un paso).

## 5 · Trazabilidad

| Elemento                       | Cómo lo cubre esta ronda                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **D-W1, D-W8** (ADR-037)       | «Crear cuenta» con los seis campos y la política, en la consola                                               |
| **D-W9, ADR-023**              | El titular creado por la administración entra, cambia la contraseña obligada y completa su primer ingreso     |
| **D3** (ADR-037 §5)            | `POST …/mi/alta` desde la consola, con los motivos del servidor                                               |
| **D-W2, ADR-038**              | Un menor no crea cuenta: la fecha lo dice antes y la API lo niega (recorrido: 400 y cero filas)               |
| **P-23, DT-15W-07, DT-15X-01** | El residente con iPhone puede crear su cuenta, entrar y cambiar su contraseña; el hogar y el rostro, 15-Y2/Y3 |
| **Ley 1581 de 2012, P-37**     | La política vigente con su versión, aceptada expresamente; el texto sigue provisional                         |
| **§2.7.5**                     | Límite por IP en `/api/registro`, además de los de la API                                                     |
| **Parcial**                    | Declarar ocupantes en el primer ingreso del titular: **15-Y2**                                                |

## 6 · Pruebas

**Cómo se ejecutan:** `pnpm --filter @ncr/web exec vitest run src/lib/registro
src/app/acceso/crear-cuenta "src/app/(consola)/mi/primer-ingreso.test.tsx"
"src/app/(consola)/mi/perfil/cambiar-contrasena.test.tsx"` (24); el
recorrido: `DATABASE_URL_PRUEBAS=… node e2e/recorrido-residente-web.mjs`
(paso 13d del verificador); la sonda negativa, en el paso 9.

**Visto fallar antes de corregir:**

- `reglas.test.ts`, `formulario-crear-cuenta.test.tsx`,
  `primer-ingreso.test.tsx`, `cambiar-contrasena.test.tsx`: escritos antes o
  con el módulo a medias; cada uno cayó por «no se resuelve el módulo» o por
  la aserción equivocada antes de pasar.
- El barrido `formularios-sin-identificadores` cayó con `mi/primer-ingreso.tsx`
  sin clasificar; se declaró con su motivo.
- El escáner de secretos del gancho de `commit` detuvo tres veces el primer
  commit por `contrasena: '…'` en pruebas y en el aviso del acceso: constantes
  nombradas y la clave del aviso renombrada.
- **El verificador mismo, en su primera corrida sobre la rama rebasada**, cayó
  en el paso 9: `controles-sin-prueba-negativa.mjs` lee SÓLO
  `pruebas-negativas.mjs` para saber qué guiones se han visto fallar, y la
  sonda del recorrido del residente vivía en un módulo importado
  (`sondas/recorrido-residente.mjs`): el control la daba por inexistente y el
  banco de su propia sonda no partía en verde. Las dos faltas van ahora en
  línea en `pruebas-negativas.mjs` (DT-15Y1-02: que el control siga las
  importaciones).
- El recorrido del residente cayó ocho veces antes de pasar (§2, punto 7): la
  API sin secreto de ingesta; la etiqueta que casaba con dos campos; el
  `role="alert"` vacío de Next; el enlace oculto del menú; y las esperas de
  20 s con el verificador de la 15-Z3 compitiendo por la CPU.

**El recorrido, completo (14 ✓, Chromium a 360 px, base del puerto 55433):**
el titular nace asignado a su vivienda; entra; cambia la contraseña obligada;
completa su primer ingreso y ve «Mi vivienda»; sin desplazamiento horizontal;
cambia la contraseña desde el Perfil; nada sensible en los almacenes; entra
por la API con la nueva; declara ocupantes y hay código de plaza; un adulto
crea su cuenta con él, entra solo y completa su primer ingreso; nada sensible
en los almacenes; el código inválido recibe «El código de invitación no es
válido o ya se usó»; con la fecha de un menor la consola no envía nada; contra
la API, 400 y cero filas.

**Verificador (§2.8.0), la corrida que cierra (sobre `18c5c49`, 08:20 → 09:08 UTC, base del puerto 55432):** 32 de 32 pasos; 581 de 581 ficheros de prueba recogidos; 5725 pruebas por los dos caminos (turbo y vitest directo) con el mismo resultado; cobertura por capa: dominio 96,46 % de líneas (ramas 96,55 %), aplicación 97,76 % (ramas 91,69 %), global 88,54 % (ramas 87,47 %); 1 paso declarado no ejercido, preexistente y con motivo.

**Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0):**

**Las corridas, en orden:**

1. **Primera** (sobre `f3e7baf`, la rama rebasada sobre `1b26bef`, 07:22 → 08:11 UTC, base del puerto 55432, sin nada más corriendo): **`VERIFICACIÓN DE ETAPA: FALLIDA — NO se cierra la etapa`**, 32 de 32 pasos y un solo paso en rojo, el 9: la sonda del recorrido del residente vivía en un módulo importado y `controles-sin-prueba-negativa.mjs` no la veía (ver §6, «visto fallar»). Corregido en `18c5c49`.
2. **Segunda, la que cierra** (sobre `18c5c49`, base del puerto 55432, sin nada más corriendo):

**`VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe`**

## 7 · Verificación de seguridad (§2.7)

| Medida               | Cómo queda                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Secretos             | Ninguno; el gancho detuvo tres literales de prueba y se nombraron                                                    |
| CORS, CSP            | Sin cambio; nada externo                                                                                             |
| Validación           | La consola valida forma por cortesía; la API decide (DTO, edad, código en tiempo constante, suspensión por intentos) |
| Rate limiting        | `/api/registro` con límite propio por IP; la IP del navegador viaja a la API para sus límites por IP y por prefijo   |
| RLS, los dos caminos | Sin cambio en la API; las rutas de `/mi` ya exigen alcance                                                           |
| RBAC                 | Sin cambio; `/acceso/crear-cuenta` es pública como `POST /auth/registro`                                             |
| Datos personales     | Nada en `localStorage`/`sessionStorage`/caché; la política se acepta con su versión                                  |

## 8 · Hallazgos, deuda, supuestos y pendientes

- **S-15Y1-01** · la puerta del primer ingreso envuelve sólo `/mi`; declarar ocupantes es de la 15-Y2.
- **S-15Y1-02** · la política se obtiene con el formulario vacío, como la app.
- **DT-15Y1-01** · los guiones de `e2e/` no entran en `pnpm lint` (ningún paquete los cubre); preexistente, esta ronda añade dos.
- **DT-15Y1-02** · `controles-sin-prueba-negativa.mjs` no sigue las importaciones de `pruebas-negativas.mjs`: una sonda en `scripts/lib/sondas/` que ejecute un guion no cuenta como «visto fallar», y por eso `pruebas-negativas.mjs` (3655 líneas) sigue creciendo. Baja; propuesta: que el control recorra también los módulos importados.
- **P-37** sigue abierta: el texto de la política es provisional.

## 9 · Qué debe hacer el usuario manualmente

1. Nada en Supabase: no hay migración.
2. Tras fusionar (después de la 15-Z3), desde Safari en un iPhone: en el acceso,
   «Crear cuenta con el código de tu vivienda», con un código de plaza que el
   titular ve en Ocupantes; o entrar como titular con la contraseña inicial y
   seguir el cambio obligado y el primer ingreso.
3. Nada más hasta la 15-Y2 (el hogar) y la 15-Y3 (el rostro).

## 10 · Rama y commits

`etapa-15y1-web-residente-cuenta`, desde `etapa-15z3-actividad-por-vivienda`
(la contiene). PR hacia `develop`, sin fusionar; fusionar DESPUÉS del PR de
la 15-Z3, con merge commit. La rama se rebasó sobre el cierre de la 15-Z3
antes de su primer push (no tenía PR).

| Commit    | Qué                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `2376ceb` | `feat(etapa-15y1/consola)` — «Crear cuenta» en la consola, con las reglas y los textos de la app y la política con su versión (P-23, DT-15W-07) |
| `eeeae9f` | `feat(etapa-15y1/consola)` — el primer ingreso en «Mi vivienda» y «Cambiar contraseña» desde el Perfil                                          |
| `480025f` | `test(etapa-15y1/e2e)` — el recorrido del residente en la web, el doble de GoTrue con administración de usuarios y el arnés compartido          |
| `f3e7baf` | `refactor(etapa-15y1/e2e)` — las acciones del recorrido del residente en su módulo, y el guion en menos de 300 líneas                           |
| `18c5c49` | `fix(etapa-15y1/verificador)` — la prueba negativa del recorrido del residente vive en `pruebas-negativas.mjs`, donde el control la busca       |
| cierre    | `chore(etapa-15y1): cierre de etapa` — informe, ficha y registro                                                                                |
