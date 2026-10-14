# RONDA 15-Z2 · UX y errores: códigos máquina, 400 en español, origen del vehículo, nombres de equipo

**Rama:** `etapa-15z2-ux-y-errores` · **Base:** `etapa-15z1-topes` (cadena 15-S6 → 15-Y3: contiene la 15-S6 y la 15-Z1; se fusiona en `develop` DESPUÉS de ellas, con merge commit) ·
**PR:** hacia `develop`, sin fusionar · **Fecha:** 2026-10-14 ·
**Cierra:** DT-15W-01 · DT-15W-02 · DT-15W-04 · DT-15W-05 · DT-15X-09 · DT-15R-07 (la parte del nombre) · DT-15R-08 · DT-15S1-C01 ·
**Sin migración.** Ninguna funcionalidad nueva: sólo cómo se explica lo que ya existe.

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Todo lo nuevo está probado contra PostgreSQL local, los dobles y el navegador
> de pruebas; nada contra un teléfono real ni contra los equipos.

**Lo incómodo primero.**

1. **Treinta y seis sitios de la API construían el 409 a mano, y ahora ninguno
   puede.** Para que «todo 409 de negocio lleve `codigo`» no bastó añadirlo
   donde las DT lo pedían: hay un único constructor (`conflicto(codigo,
mensaje)`) y una prueba que recorre `apps/api/src` y falla si alguien vuelve
   a escribir `new ConflictException(`. Es un control, no una convención. Los
   códigos de los 409 que no nombraba ninguna DT (`PADRON`, `ZONA`, `VISITA`…)
   son genéricos por módulo: nombran el conflicto, no lo explican. Afinarlos es
   trabajo de quien construya una pantalla que los distinga.
2. **La unidad de «origen» no es la del encargo.** El encargo escribe
   «`origen` (propio/visita)»; en la lista de `GET …/mi/vehiculos` no hay
   vehículos de visita —son autorizaciones, otra tabla y otra ruta—, sino los
   de la vivienda, registrados por el hogar o por la administración (DT-15W-02
   lo dice así). Los valores son **`propio` | `administracion`**. Prevalece el
   registro, como pide el §A.
3. **Los textos de los 400 de forma son genéricos a propósito.** «debe ser
   texto», «no se admite este campo», «es demasiado largo»: se traduce la
   restricción, no el caso. No sale el valor recibido, ni el nombre de la
   restricción, ni la clase del DTO. Lo que sí sale es el nombre del campo
   (`placa`, `ocupantes.1.documento`), porque sin él la pantalla no sabe dónde
   pintarlo. Dos pruebas de la API que esperaban el inglés de Nest cambiaron
   su aserción: no son de la suite con `MockProvider`.
4. **DT-15R-07 se cierra sólo en lo que el encargo pide:** la franja dice el
   nombre del equipo. Lo demás que esa DT anotaba —el tope por copropiedad sin
   pantalla y la opción «2 h» rechazada bajo 120 min— sigue abierto, con el
   mismo identificador.
5. **La app Flutter cambia, y poco:** `Fallo` lleva el `codigo` del 409, «Crear
   cuenta» pinta el usuario ocupado bajo su campo, «Mi rostro» desmarca la
   casilla ante `POLITICA_CAMBIADA` sin esperar a releer, y «Mis vehículos» no
   ofrece editar ni eliminar en los de la administración. Las pruebas nuevas
   de Flutter se vieron fallar **por compilación** (el campo y el enumerado no
   existían), no por aserción: es lo que hay cuando el control es un tipo.
6. **Los módulos de más de 300 líneas no crecieron, y uno encogió:** la
   composición de `RegistrarAcceso` salió de `eventos.module.ts` (546 → 509) a
   un proveedor propio, y `registrar-acceso.ts` sigue en 334 porque el texto
   del aviso y sus opciones viven en `aviso-al-residente.ts`. `hogar-en-memoria`
   y `eventos.module` ya estaban en la deuda de ficheros largos; no se abre
   deuda nueva por ellos.
7. **El verificador de la 15-Z1 se lanzó tres veces** (§6 de su informe): esta
   ronda nació sobre su tercera corrida y hereda la corrección del ocupante de
   «puerto ocupado» de la 15-S6 (roja en la CI de macOS del PR #57).

---

## 1 · Qué se construyó

Seis cosas que no añaden una función y cambian cómo se entiende lo que ya
había:

- **Un código máquina en todo 409 de negocio** (`CODIGOS_DE_CONFLICTO`, en el
  dominio, 38 valores). La consola lo lee como `ErrorDeApi.causa` y la app
  como `Fallo.codigo`, y deciden por él: el diálogo de alta de residente quita
  del selector la vivienda que otro acaba de tomar (`VIVIENDA_CON_TITULAR`),
  «Crear cuenta» pinta `USUARIO_NO_DISPONIBLE` bajo «Usuario», y «Mi rostro»
  desmarca la casilla ante `POLITICA_CAMBIADA` y sólo relee ante
  `OTRO_REGISTRO_GANO`.
- **Los 400 de forma del `ValidationPipe`, en español y por campo**
  (`campos: [{ campo, motivo }]`, la misma forma que los 400 de regla del alta
  de la 15-W). La consola los pinta bajo su campo por el mismo lector que los
  422 (`rechazosPorCampo`).
- **`origen` en `GET …/mi/vehiculos`** (`propio` | `administracion`): la
  consola y la app sólo ofrecen dar de baja, editar o eliminar en los propios,
  y dicen «Lo registró la administración» en los otros.
- **La ficha de plazas de la consola distingue al menor sin cuenta**
  («Sin cuenta (menor)»).
- **El nombre del equipo** en la franja de puertas (`dispositivoNombre`,
  aditivo) y en el aviso de acceso al residente («Ingreso por placa en
  Portería de A.»; sin nombre, «en un equipo sin nombre»; nunca el
  identificador).
- **`COOKIE_SEGURA=` vacía ya no tumba la consola:** vale «sin la línea»
  (manda `NODE_ENV`), como las variables de Netlify y
  `RECUPERACION_POR_CORREO`.

Contrato y clientes regenerados (TS con `openapi-typescript`; Dart con
`swagger_parser` + `build_runner`): todo aditivo, ningún campo cambia de
tipo ni desaparece.

## 2 · Cómo se organizó y por qué

### Punto 1 · El 409 con código: un constructor y un control, no una convención

`packages/domain-core/src/compartido/conflictos.ts` declara los códigos, al
lado de `MOTIVOS_ACCESO` y por la misma razón: es vocabulario de negocio, se
documenta en OpenAPI (`DetalleDeErrorDto.codigo`, enumerado) y el cliente Dart
lo recibe tipado. `apps/api/src/comun/conflicto.ts` es el único sitio que
construye `ConflictException`, con `{ message, codigo }`; el filtro global lo
envuelve en `mensaje`, que es donde la consola (`causaDelError`) y la app
(`codigoDelRechazo`) ya miraban desde la 15-O.

Los casos de uso del residente que terminan en 409 (`plazas-del-titular`,
`menores-del-hogar`, `vehiculos-propios-edicion`, `puerta-del-rostro`,
`mi-rostro`, `rostro-de-mis-menores`) ponen el código en su resultado: la
aplicación sabe por qué dijo que no, y la presentación sólo lo traduce. Donde
el 409 nace de un `ErrorDominio` genérico (padrón, zonas, autorizaciones,
visitas, alertas), el código es el del módulo. En la edición de vehículos, el
padrón ya marcaba el historial con la regla `RN-19`: ésa es la señal para
`PLACA_CON_HISTORIAL`, no el texto.

`conflicto.test.ts` recorre `apps/api/src` y exige cero `new
ConflictException(` fuera del constructor. Visto fallar con 36 sitios.

### Punto 2 · Los 400 de forma: traducir la restricción, no el caso

`validacion-en-espanol.ts` es la `exceptionFactory` del `ValidationPipe`:
aplana el árbol de `ValidationError` con profundidad acotada (§2.4), toma la
primera restricción de cada campo y la traduce por su clave
(`isString` → «debe ser texto», `whitelistValidation` → «no se admite este
campo»…; desconocida → «no es válido»). No lee `target` ni `value`. El
resumen `message` conserva un texto para quien sólo lee texto. La prueba
e2e de campos prohibidos (15-W) pasó a esperar `{ "campo": …, "motivo": "no
se admite este campo" }` y se vio fallar en inglés antes del cambio.

### Punto 3 · `origen`: un campo del puerto, no una consulta más

`VehiculoDelResidente.origen` sale de `vehiculos.origen_registro` (0038) en
la misma consulta del directorio: `'residente'` en la base es «propio» para el
hogar. La consola y la app no deciden por `activo` ni por el 404 que antes
recibían al intentar editar uno de la administración: deciden por `origen`.
Un valor desconocido en la app se trata como de la administración (sin
acciones): falla cerrado.

### Punto 4 · Nombres de equipo sin tocar lo congelado

La franja: el controlador de modos (guardia, presentación, no congelado)
resuelve los nombres por el puerto `REPOSITORIO_DE_EQUIPOS` del módulo de
equipos, una consulta por respuesta y sólo si hay modos vigentes; el registro
de modos (infraestructura de la guardia, congelado) no cambia. El aviso:
`RegistrarAcceso` recibe un puerto `NombreDeEquipo` en sus opciones, cuyo
adaptador (`NombreDeEquipoPorActivos`) usa el puerto `EQUIPOS_ACTIVOS` que el
módulo de equipos ya exporta (R1, 15-L): sin consultar su tabla desde eventos
(§2.2). Un equipo dado de baja no está entre los activos y el aviso lo dice
en palabras. La composición vive en `proveedor-de-registrar-acceso.ts`, que es
lo que dejó `eventos.module.ts` 37 líneas más corto.

### Punto 5 · `COOKIE_SEGURA` vacía

El esquema admite `''` y lo transforma en `undefined`, exactamente como
`PUENTE_VIDEO_URL`; la regla «`false` sólo contra una API de bucle local» no
cambia. La prueba se vio fallar: con `COOKIE_SEGURA: ''` la consola no
arrancaba.

### Punto 6 · Lo que no se tocó

Ninguna ruta nueva, ningún campo retirado, ninguna zona congelada
(`guardia/infraestructura`, `alarmserver`, `proveedores`, los adaptadores de
`packages/providers`). Ninguna aserción de la suite con `MockProvider`.

## 3 · Árbol de archivos

| Fichero                                                                                                                                          | Propósito                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `packages/domain-core/src/compartido/conflictos.ts` (N, 77) · `.test.ts`                                                                         | `CODIGOS_DE_CONFLICTO`, `CodigoDeConflicto`, `esCodigoDeConflicto`                         |
| `apps/api/src/comun/conflicto.ts` (N, 15) · `conflicto.test.ts` (N)                                                                              | El único 409; el control que recorre `apps/api/src`                                        |
| `apps/api/src/comun/validacion-en-espanol.ts` (N, 100) · `.test.ts`                                                                              | La `exceptionFactory` en español y por campo                                               |
| `apps/api/src/comun/respuestas.ts` (M)                                                                                                           | `DetalleDeErrorDto.codigo` (enum) y `.campos` documentados                                 |
| `apps/api/src/seguridad.ts` (M)                                                                                                                  | `exceptionFactory: rechazoDeForma`                                                         |
| 26 controladores y ayudantes de presentación (M)                                                                                                 | `new ConflictException(` → `conflicto('CÓDIGO', …)`                                        |
| `residente/aplicacion/{plazas-del-titular,menores-del-hogar,vehiculos-propios-edicion,puerta-del-rostro,mi-rostro,rostro-de-mis-menores}.ts` (M) | El código en cada resultado 409                                                            |
| `residente/aplicacion/puertos.ts` · `infraestructura/directorio-pg.ts` · `presentacion/respuestas.ts` (M)                                        | `origen` del vehículo                                                                      |
| `apps/api/src/eventos/aplicacion/aviso-al-residente.ts` (N, 46) · `.test.ts`                                                                     | El texto del aviso con el nombre del equipo; `NombreDeEquipo`; `OpcionesDeRegistrarAcceso` |
| `apps/api/src/eventos/infraestructura/nombre-de-equipo-por-activos.ts` (N) · `.test.ts`                                                          | El nombre por `EQUIPOS_ACTIVOS`                                                            |
| `apps/api/src/eventos/infraestructura/proveedor-de-registrar-acceso.ts` (N, 63)                                                                  | La composición de `RegistrarAcceso`, fuera del módulo                                      |
| `apps/api/src/eventos/aplicacion/registrar-acceso.ts` (M, 334 → 334) · `eventos.module.ts` (M, 546 → 509)                                        | Sin crecer                                                                                 |
| `apps/api/src/guardia/presentacion/dtos-modos.ts` · `modos-de-puerta.controller.ts` (M)                                                          | `dispositivoNombre`                                                                        |
| `apps/api/test/{campos-prohibidos-del-residente.e2e,modo-de-puerta.e2e,vehiculos-propios-pg}.test.ts` · `dobles/directorio-del-residente.ts` (M) | Las aserciones nuevas (vistas fallar)                                                      |
| `apps/api/src/residente/aplicacion/{plazas-del-titular,vehiculos-propios-edicion}.test.ts` (M)                                                   | Esperan el `codigo`                                                                        |
| `apps/web/src/lib/configuracion.ts` · `.test.ts` (M)                                                                                             | `COOKIE_SEGURA` vacía (DT-15S1-C01)                                                        |
| `apps/web/src/lib/api/cliente.ts` · `.test.ts` (M)                                                                                               | `rechazosPorCampo` lee también `campos`                                                    |
| `apps/web/src/componentes/franja-de-puertas.tsx` · `.test.tsx` (M)                                                                               | «<equipo> · puerta N LIBRE»                                                                |
| `apps/web/src/app/(consola)/mi/vehiculos/pantalla.tsx` · `mi/pruebas.tsx` · `mi/formularios.test.tsx` (M)                                        | Dar de baja sólo en los propios                                                            |
| `apps/web/src/app/(consola)/residentes/ocupantes.tsx` · `pantalla.test.tsx` (M)                                                                  | «Sin cuenta (menor)»                                                                       |
| `apps/web/src/app/(consola)/residentes/dialogos.tsx` (M)                                                                                         | Decide por `causa === 'VIVIENDA_CON_TITULAR'`                                              |
| `apps/mobile/lib/dominio/{puertos,entidades}.dart` (M)                                                                                           | `Fallo.codigo`; `OrigenDeVehiculo`, `Vehiculo.origen`, `esPropio`                          |
| `apps/mobile/lib/infraestructura/api/{cuerpo_de_error,soporte_de_api,registro_api,repositorio_api}.dart` (M)                                     | `codigoDelRechazo`; el 409 con código; el usuario ocupado bajo su campo; `origen`          |
| `apps/mobile/lib/presentacion/pantallas/{mi_rostro,vehiculos}.dart` (M)                                                                          | Por el código; sin acciones en los de la administración                                    |
| `apps/mobile/test/infraestructura/rechazo_del_registro_test.dart` (N) · `test/presentacion/vehiculos_15w_test.dart` (M)                          | Las pruebas nuevas                                                                         |
| `packages/contracts/openapi.json` · `src/generado/api.ts` · `apps/mobile/lib/infraestructura/api/generado/**`                                    | Regenerados                                                                                |
| `docs/guias/MANUAL_USUARIO.md` (M)                                                                                                               | La franja con el nombre del equipo                                                         |
| `docs/etapas/ETAPA-15Z2-ux-y-errores.md` (N) · `docs/ESTADO_ETAPAS.md` (M)                                                                       | Este informe y la ficha                                                                    |

## 4 · Tabla SOLID

| Fichero                               | SRP                                           | OCP                                               | LSP                                           | ISP                              | DIP                                                   |
| ------------------------------------- | --------------------------------------------- | ------------------------------------------------- | --------------------------------------------- | -------------------------------- | ----------------------------------------------------- |
| `conflictos.ts` (dominio)             | Sólo el vocabulario de los conflictos         | Un código nuevo es una entrada más                | —                                             | —                                | Dominio puro                                          |
| `conflicto.ts` (API)                  | Construir el 409, nada más                    | —                                                 | Devuelve una `ConflictException` corriente    | Dos parámetros                   | Importa el tipo del dominio                           |
| `validacion-en-espanol.ts`            | Traducir el árbol de `ValidationError`        | Una restricción nueva es una entrada en `MOTIVOS` | Es una `exceptionFactory` corriente           | Recibe sólo los errores          | Sin dependencias de infraestructura                   |
| `aviso-al-residente.ts`               | El texto del aviso y las opciones de registro | —                                                 | —                                             | `NombreDeEquipo` tiene un método | Declara el puerto; no sabe quién lo cumple            |
| `nombre-de-equipo-por-activos.ts`     | Un nombre por el puerto de equipos activos    | —                                                 | Intercambiable con cualquier `NombreDeEquipo` | Depende sólo de `activos()`      | Cumple el puerto; usa el puerto exportado por equipos |
| `proveedor-de-registrar-acceso.ts`    | La composición de un caso de uso              | —                                                 | —                                             | —                                | Inyecta tokens; no construye adaptadores de base      |
| `modos-de-puerta.controller.ts` (169) | Traduce HTTP; resuelve nombres por un puerto  | —                                                 | —                                             | Usa `listar` del repositorio     | Puerto del módulo de equipos, no su tabla             |

## 5 · Trazabilidad

| Elemento                           | Cómo lo cubre esta ronda                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **DT-15W-01 · DT-15X-09**          | `codigo` en todo 409; la consola y la app deciden por él                                                 |
| **DT-15W-05**                      | Los 400 de forma en español, con `campos`, sin internos                                                  |
| **DT-15W-02**                      | `origen` aditivo; acciones sólo en los propios, en app y consola                                         |
| **DT-15W-04**                      | «Sin cuenta (menor)» en la ficha de plazas                                                               |
| **DT-15R-07 (nombre) · DT-15R-08** | Nombre del equipo en la franja y en el aviso; nunca «Puerta N» a secas ni el identificador               |
| **DT-15S1-C01**                    | `COOKIE_SEGURA` vacía = sin la línea                                                                     |
| **§2.4 errores tipados · §2.7.3**  | Motivo enumerado en el 409; el DTO valida forma y lo dice en español; el agregado sigue validando verdad |
| **HU-34**                          | El aviso al residente, legible                                                                           |
| **Parcial**                        | DT-15R-07: el tope sin pantalla y la opción «2 h» siguen abiertos                                        |

## 6 · Pruebas

**Cómo se ejecutan:** `pnpm --filter @ncr/domain-core test`, `pnpm --filter
@ncr/api test` (con `DATABASE_URL_PRUEBAS`), `pnpm --filter @ncr/web test`,
`cd apps/mobile && flutter analyze && flutter test`.

**Visto fallar antes de corregir:**

- `conflicto.test.ts`: 36 ficheros con `new ConflictException(` → 0.
- `campos-prohibidos-del-residente.e2e`: esperaba `{"campo":…,"motivo":"no se
admite este campo"}` y llegaba `property x should not exist`.
- `modo-de-puerta.e2e`: `dispositivoNombre: 'Portería de A'` ausente.
- `configuracion.test.ts` (web): `COOKIE_SEGURA: ''` tumbaba la consola.
- `residentes/pantalla.test.tsx`: sin «Sin cuenta (menor)».
- `franja-de-puertas.test.tsx`: sin el nombre (corrida con el componente
  anterior guardado aparte).
- Flutter: `rechazo_del_registro_test.dart` y el caso nuevo de
  `vehiculos_15w_test.dart` no compilaban sin `Fallo.codigo` ni
  `OrigenDeVehiculo`.
- `plazas-del-titular.test.ts`, `vehiculos-propios-edicion.test.ts`: tres
  aserciones esperaban el resultado sin `codigo`; ahora lo exigen.

**Resultados (segunda corrida del verificador, sobre `2148ea9`):** 573 de 573
ficheros de prueba recogidos; 5680 pruebas por los dos caminos (turbo y vitest
directo) con el mismo resultado; cobertura por capa: dominio 96,46 % de líneas
(ramas 96,55 %), aplicación 97,76 % (ramas 91,74 %), global 88,59 %; app
Flutter: dominio 98,43 %, aplicación 96,99 %, global 91,64 %, `flutter
analyze` sin hallazgos, el cliente Dart al día (487 ficheros sin diferencias) y
el recorrido entero en Chromium sin un error de JavaScript; 47 ficheros usan la
base, ninguna omisión. El control declarado no ejercido es el mismo que
arrastran las rondas anteriores (idéntico desde la 15-S5).

**Verificador (§2.8.0):**

- **Primera corrida** (sobre `af77dc6`, 02:11 → 02:57 UTC, base dedicada en el
  puerto 55433): **`VERIFICACIÓN DE ETAPA: FALLIDA — NO se cierra la etapa`**,
  31 de 31 pasos, un solo rojo: paso 5e, «el recorrido de la app falló · no se
  ve la placa». Causa: el DTO generado `MiVehiculoDto` exige `origen` desde esta
  ronda y la fixture del guardarropa del recorrido servía el vehículo sin él, de
  modo que la lista no parseaba. Es la fixture, no la app ni el entorno. Se
  reprodujo y se corrigió fuera del árbol del verificador (`origen: 'propio'`,
  «RECORRIDO DE LA APP: completo») y entró como `2148ea9`.
- **Segunda corrida** (sobre `2148ea9`, 02:58 → 03:43 UTC, misma base):
  **`VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe`**,
  31 de 31 pasos, ningún rojo.

## 7 · Verificación de seguridad (§2.7)

| Medida                      | Esta ronda                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos                | Ninguno; identificadores de prueba sintéticos                                                                                                        |
| 3 · Validación en backend   | El `ValidationPipe` sigue con `whitelist`, `forbidNonWhitelisted`, `transform`; sólo cambia cómo se explica el rechazo. Nada del valor recibido sale |
| 6 · RLS                     | Sin rutas nuevas; `origen` sale de la misma consulta del directorio, en el ámbito del residente                                                      |
| 7 · CSP                     | Intacta; ningún `unsafe-inline`                                                                                                                      |
| 8 · Cookies                 | `COOKIE_SEGURA` vacía manda `NODE_ENV` (seguras en producción); `false` fuera de bucle local sigue parando la consola                                |
| Fugas por mensajes de error | Los 400 de forma no llevan restricción, valor ni clase; los 409 llevan un código enumerado y el mismo texto de antes                                 |

## 8 · Hallazgos, deuda, supuestos y pendientes

- **Cerradas:** DT-15W-01 · DT-15W-02 · DT-15W-04 · DT-15W-05 · DT-15X-09 ·
  DT-15R-08 · DT-15S1-C01 · **DT-15R-07 en parte** (el nombre).
- **Siguen abiertas de DT-15R-07:** el tope por copropiedad sin pantalla y la
  opción «2 h» rechazada bajo 120 min.
- **`[SUPUESTO]` S-15Z2-01** · los códigos de los 409 que ninguna DT nombraba
  son genéricos por módulo (`PADRON`, `ZONA`, `VISITA`, `AUTORIZACION`,
  `LISTA_NEGRA`, `ALERTA_YA_ATENDIDA`, `CONFIGURACION_EN_SITIO`, `VEHICULO`,
  `ROSTRO`): nombran el conflicto, no lo distinguen. Verificable cuando una
  pantalla necesite distinguirlos.
- **Deuda nueva:** ninguna.

## 9 · Qué debe hacer el usuario manualmente

1. Fusionar DESPUÉS de la 15-Z1 (PR de la 15-Z1), con merge commit.
2. Nada que aplicar en Supabase: sin migración.
3. En el Mac, tras `git pull`: `pnpm install --frozen-lockfile` y, para la app,
   `cd apps/mobile && flutter pub get` (el cliente Dart regenerado va en el
   repositorio; no hay que regenerarlo).

## 10 · Rama y commits

`etapa-15z2-ux-y-errores`, desde `etapa-15z1-topes` (`982b05f`; la contiene).
PR hacia `develop`, sin fusionar; fusionar DESPUÉS del PR #58, con merge
commit. La rama se rebasó sobre el cierre de la 15-Z1 antes de su primer push
(no tenía PR).

| Commit    | Qué                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------- |
| `d394d4b` | `CODIGOS_DE_CONFLICTO`, `conflicto()` como único 409 con su prueba de barrido, y los 400 de forma en español por campo |
| `ba49cfd` | `origen` del vehículo en `GET …/mi/vehiculos`; «Sin cuenta (menor)» en la ficha de plazas                              |
| `4ebe060` | La franja de puertas y el aviso al residente nombran el equipo (DT-15R-07, DT-15R-08)                                  |
| `3dcfa68` | La consola decide por `ErrorDeApi.causa` y la app por `Fallo.codigo`; los campos del 400 en cada cliente               |
| `be8501d` | `COOKIE_SEGURA=` vacía vale «sin la línea» (DT-15S1-C01)                                                               |
| `f66b13f` | Contrato y clientes TS y Dart regenerados                                                                              |
| `af77dc6` | La prueba del mapeador de vehículos de la app, con el `origen` que el contrato exige                                   |
| `2148ea9` | La fixture del recorrido web sirve `origen` (la primera corrida del verificador)                                       |
| cierre    | `chore(etapa-15z2): cierre de etapa` — informe, ficha y registro                                                       |
