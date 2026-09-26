# ETAPA 15-I · Residentes y app, hasta la puerta del sitio

**Rama:** `etapa-15i-residentes-y-app` · **Base:** `develop` (`aa2a764`)
**Contrato:** extensión **E-03**, aprobada por el cliente el 2026-09-26, con las decisiones **D1–D9** (`docs/auditoria/contradicciones-y-supuestos.md` §3 bis, E-03)
**Decisiones:** [`ADR-025`](../decisiones/ADR-025-codigos-de-ocupante-derivados.md) · [`ADR-026`](../decisiones/ADR-026-tope-de-vehiculos-propios-en-la-base.md) · [`ADR-027`](../decisiones/ADR-027-punto-de-extension-de-aprobacion.md) · [`ADR-028`](../decisiones/ADR-028-la-consola-en-netlify-y-la-api-en-un-servidor.md)

Esta ronda **no se fusiona**: abre PR contra `develop` y se detiene. **No cierra
la ETAPA 15**: la deja **BLOQUEADA sólo por `BE-02`**. Fusionada, lo único que
falta de la 15 es ir a sitio, registrar los tres equipos desde la consola y
ejecutar los 16 escenarios desde la consola y la app.

---

## 0 · Los ocho puntos del encargo, y con qué prueba se demuestra cada uno

| #   | Punto                                                             | Estado    | Prueba que lo demuestra                                                                                                                                                                                                                             |
| --- | ----------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Acceso por código corto + usuario + contraseña (D1)               | **Hecho** | `apps/api/test/residentes-y-vehiculos-pg.test.ts` (código normalizado y único; código inexistente y usuario ajeno dan la MISMA respuesta) · `apps/web/src/app/acceso/acceso-por-usuario.test.tsx` (código o NIT, S-58)                              |
| 2   | La app entra con código, usuario y contraseña                     | **Hecho** | `apps/mobile/test/infraestructura/autenticador_por_api_test.dart` · `test/dominio/acceso_test.dart` · recorrido en navegador `apps/mobile/e2e/recorrido-web.mjs` (paso 5e del verificador)                                                          |
| 3   | Alta del residente, primer ingreso, ocupantes y perfil            | **Hecho** | `residentes-y-vehiculos-pg.test.ts` (vinculación con «no lo tengo», código obligatorio con cuenta dentro, ocupantes UNA vez, perfil) · `supabase/policies/tests/90_residentes_y_vehiculos_propios.sql` · `test/presentacion/hogar_15i_test.dart`    |
| 4   | Vehículos propios con tope, de terceros y punto de extensión (D5) | **Hecho** | `residentes-y-vehiculos-pg.test.ts` (tercero rechazado, altas concurrentes que no rebasan el tope, terceros sin límite) · `apps/api/test/aprobacion-de-terceros.test.ts` · `packages/domain-core/src/autorizaciones/politica-de-aprobacion.test.ts` |
| 5   | Consentimiento facial: QR, compartir y estado                     | **Hecho** | `test/presentacion/hogar_15i_test.dart` (entrega del consentimiento) · `test/dominio/hogar_test.dart` · `test/infraestructura/camara_del_telefono_test.dart` (foto real con las medidas de la consola)                                              |
| 6   | Ensayo de los 16 escenarios por canal                             | **Hecho** | `apps/api/test/ensayo-en-sitio-pg.test.ts` contra PostgreSQL real, en SIMULADO · resultado en [`ENSAYO_PREVIO_EN_SITIO.md`](../guias/ENSAYO_PREVIO_EN_SITIO.md)                                                                                     |
| 7   | Documentación de sitio con listas de comprobación                 | **Hecho** | [`VALIDACION_HIKVISION_EN_SITIO.md`](../guias/VALIDACION_HIKVISION_EN_SITIO.md) §V («antes de salir de casa» y «en sitio») · README §6 · `INTEGRACION_HIKVISION.md` §9 con la hoja por canal                                                        |
| 8   | Cierre: verificador, informe y PR                                 | **Hecho** | §6 de este informe (veredicto literal)                                                                                                                                                                                                              |

---

## 1 · Qué se construyó

Hasta esta ronda, un residente creado por el superadministrador no podía entrar
en la app ni vincularse a su vivienda: la app sólo aceptaba correo, y nada le
llevaba de «tengo usuario» a «tengo vivienda». La prueba en sitio desde la app
era imposible por construcción, no por falta de hardware. La 15-I cierra ese
hueco y todo lo que la prueba en sitio necesitaba del lado del residente.

**El acceso** es ahora por código corto de la copropiedad, usuario y contraseña,
en la app y en la consola; la consola acepta también el NIT (D1). El código lo
asigna el superadministrador, se guarda normalizado y es único en la plataforma.
Un código inexistente y un usuario de otra copropiedad producen la misma
respuesta: el acceso no confirma qué conjuntos existen.

**El primer ingreso** del residente obliga a cambiar la contraseña en el
servidor, después a vincular la vivienda —con el código de ocupante si la
vivienda ya tiene cuenta, o «no lo tengo» si es la primera— y, al primer
residente, a declarar los ocupantes. El número es **definitivo** (D6): el aviso
se muestra antes y dentro del diálogo, el servidor exige la confirmación, y
sólo el superadministrador puede cambiarlo después, con rastro.

**Los vehículos propios** se registran desde la app y quedan activos al
instante, con un **tope de 2 por vivienda impuesto por la base** (D5 a,
ADR-026): dos altas simultáneas no dejan tres vehículos. Los vehículos de
terceros entran por autorización con día y franja, sin tope (D5 b). La creación
de toda autorización pasa por una `PoliticaDeAprobacion` (D5 c, ADR-027): hoy es
automática, y si mañana devuelve un estado que la base no sabe guardar, la
creación **falla cerrada**.

**El consentimiento del visitante** —el titular, no el residente (RN-10)— se
entrega desde la app con un QR y el botón «compartir», y la app consulta su
estado. La foto la toma ahora la **cámara real del teléfono**, con las mismas
medidas de calidad que la consola; antes la app enviaba bytes aleatorios y el
hito 3 del reto era imposible.

**El perfil** es editable, muestra la copropiedad y un botón que llama a
portería (D7). **Las listas negras** se crean y levantan desde la consola
(HU-35, RN-07): sin esa pantalla, los escenarios L5 y T5 no se podían montar en
sitio.

**El ensayo de los 16 escenarios** se ejecutó por canal (visita creada desde la
app y desde la consola) contra PostgreSQL real, con el proveedor simulado. Hizo
lo que se le pedía: destapó cuatro defectos que habrían hecho fallar escenarios
**en sitio** (H-15I-07 a H-15I-10) y los tres de la vía de la app contra la base
real (H-15I-01 a H-15I-03). Quedaron corregidos en esta ronda.

---

## 2 · Cómo se organizó y por qué

### 2.1 · El residente, en tres adaptadores y no en uno

La app tenía un único adaptador, `RepositorioApiDelResidente`. Las piezas nuevas
—alta, hogar, cuenta— son tres razones de cambio distintas, así que van en tres
adaptadores (`hogar_api.dart`), y lo que comparten —traducir un `DioException` a
un `Fallo` tipado y sacar la copropiedad de la sesión— se extrajo a
`soporte_de_api.dart`. Copiarlo cuatro veces habría dado cuatro definiciones de
«qué es un 404» que acabarían divergiendo. Ningún DTO generado cruza hacia el
dominio de la app.

### 2.2 · El tope en la base, no en el código (ADR-026, ADR-04)

«Dos vehículos por vivienda» es una invariante concurrente: un `SELECT count(*)`
previo en el código deja pasar el tercero si dos altas llegan a la vez. La 0038
la impone en la base con un bloqueo por vivienda, y la prueba lo demuestra con
altas simultáneas. El superadministrador puede registrar por encima del tope,
porque es quien administra la excepción; queda en la bitácora.

### 2.3 · Los códigos de ocupante se derivan, no se guardan (ADR-025)

Un código guardado es un secreto más en la base. Se derivan bajo demanda con la
llave de la bóveda y el identificador de la plaza: el mismo código cada vez, y
nada que robar de la tabla. Los intentos equivocados se cuentan y bloquean
(S-55).

### 2.4 · La aprobación como política, y que falle cerrada (ADR-027)

D5 c pide un punto de extensión, no una cola. La política vive en el dominio
(`politica-de-aprobacion.ts`) y se inyecta en los **dos** casos de uso que crean
autorizaciones —el de la consola y el de la app—. `estadoPersistible` decide si
el resultado cabe en la base; si no cabe, la creación se niega con
`OPERACION_NO_PERMITIDA`. Así, activar mañana una aprobación manual sin su
tabla no puede producir autorizaciones vigentes por accidente.

### 2.5 · El ensayo pasa por las mismas puertas que el sitio

El ensayo no fabrica autorizaciones en la base: las crea por la ruta de la app
(token de residente) y por la ruta de la consola (token de administración), y
la cámara y la terminal publican en el receptor (`/alarm-server/…`) con el
mismo formato que en sitio. El reloj de la API se fija por escenario, así «hora
fuera» y «día distinto» son instantes reales. Por eso sus fallos fueron fallos
de verdad: la ruta de la foto a una columna UUID, la lectura dudosa que abría
sola, el número de empleado no UUID, la supresión a las 24 h de la captura.

### 2.6 · Lo que no se tocó, y por qué

El encargo prohíbe tocar `packages/providers`, el motor de reglas,
`CargadorDeContextoPg`, la persistencia, la vista en vivo y la portería salvo lo
pedido. Lo que el ensayo destapó **dentro** de esas fronteras se reporta, no se
corrige: **H-15I-05** (la persistencia relee como UTC la franja de un patrón que
guardó en hora local) va con su parche en §8, y mientras tanto la recurrente
desde la app **falla cerrada** (H-15I-06). _Actualización 15-J: H-15I-05
**CERRADO** en [`ETAPA-15-J`](ETAPA-15-J-patron-en-hora-local.md), con otra
corrección que la de §8; H-15I-06 sigue cerrada por otro motivo (H-15J-01)._ T2 registra `FALLO_TECNICO` para un
rostro desconocido: el motivo lo pone el motor, que no se toca.

---

## 3 · Árbol de archivos (selección)

```
supabase/
  migrations/20260926120000_0038_residentes_y_acceso_por_codigo.sql   código corto, portería, tope, ocupantes, plazas, bitácora
  reversion/0038_revert.sql                                             su reversión
  policies/tests/90_residentes_y_vehiculos_propios.sql                  positivas y negativas de la 0038
packages/domain-core/src/
  residente/{vinculacion,ocupantes,perfil,vehiculo-propio}.ts           reglas puras del hogar del residente
  autorizaciones/politica-de-aprobacion.ts                              D5 c, con `estadoPersistible`
apps/api/src/
  cuentas/…                                                             acceso por código o NIT (nulo = ausente, H-15I-04)
  multiempresa/…                                                        ajustes de plataforma (código, portería, tope)
  residente/aplicacion/{alta,ocupantes,perfil,vehiculos-propios,supervision-de-residentes}.ts
  residente/infraestructura/{alta,ocupantes,perfil,vehiculos-propios,bitacora-residentes}-pg.ts, codigos-de-ocupante.ts
  residente/presentacion/{mi-alta,mi-hogar,supervision-de-residentes}.controller.ts
  autorizaciones/infraestructura/consulta-lista-negra-pg.ts            listado y resolución de documento
  autorizaciones/presentacion/listas-negras.controller.ts              vetar y levantar (HU-35, RN-07)
  eventos/{aplicacion,infraestructura}/registro-de-evidencia*.ts        la foto se registra y el evento lleva su id (H-15I-07)
apps/api/test/
  residentes-y-vehiculos-pg.test.ts                                     D1, D5, D6 y el perfil contra la base real
  aprobacion-de-terceros.test.ts                                        la política en los dos casos de uso
  ensayo-en-sitio-pg.test.ts                                            los 16 escenarios por canal, en SIMULADO
apps/web/src/app/
  acceso/…                                                              código o NIT, usuario y contraseña
  (consola)/configuracion/…                                             ajustes de plataforma
  (consola)/residentes/…                                                panel del superadministrador
  (consola)/listas-negras/…                                             vetar y levantar
apps/mobile/lib/
  dominio/{acceso,hogar,medidas_de_imagen}.dart                         reglas de la app, sin Flutter
  infraestructura/api/{soporte_de_api,hogar_api}.dart                   adaptadores al cliente generado
  infraestructura/camara/camara_del_telefono.dart                       foto real, JPEG acotado
  infraestructura/plataforma/telefono_y_compartir.dart                  `tel:` y compartir del sistema
  presentacion/pantallas/{alta,ocupantes,primer_ingreso,cambio_de_contrasena,nuevo_vehiculo,editar_perfil,entrega_del_consentimiento}.dart
docs/
  decisiones/ADR-025 … ADR-028                                          las cuatro decisiones de la ronda
  guias/ENSAYO_PREVIO_EN_SITIO.md                                       el ensayo, fila por fila, SIMULADO
  guias/VALIDACION_HIKVISION_EN_SITIO.md §V                             el procedimiento único de la visita
scripts/lib/hoja-de-resultados.mjs                                      columna «canal», 26 filas + 3 adicionales
```

---

## 4 · Tabla SOLID

| Principio | Cumplimiento en lo creado                                                                                                                                                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SRP**   | Un caso de uso por operación (`alta`, `ocupantes`, `perfil`, `vehiculos-propios`); tres adaptadores en la app en lugar de engordar uno. **Incumplido y declarado:** `alta-pg.ts` nace con 314 líneas, `autorizaciones-pg.ts` pasa de 286 a 303 y `rostro_del_visitante.dart` de 324 a 409 (DT-15I-01, §8) |
| **OCP**   | La aprobación es una política inyectable: otra política no cambia los casos de uso. Los escenarios del ensayo son datos (`hoja-de-resultados.mjs`), no código                                                                                                                                             |
| **LSP**   | El ensayo corre contra el proveedor simulado con los adaptadores PostgreSQL reales; los dobles en memoria (`hogar-en-memoria.ts`) cumplen el mismo puerto que los de base                                                                                                                                 |
| **ISP**   | Puertos del hogar separados (`puertos-hogar.ts`) de los del residente; `ConsultaDeListaNegra` aparte del repositorio de escritura; `RegistroDeEvidencia` con una sola operación                                                                                                                           |
| **DIP**   | El dominio declara `PoliticaDeAprobacion`; la API la inyecta por constructor con valor por omisión. `grep` de `supabase\|axios\|isapi` en `domain/` sigue en 0 (paso 10)                                                                                                                                  |

---

## 5 · Trazabilidad

| Requisito                           | Cubierto                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **OE-01** (padrón)                  | Alta del residente, ocupantes, vehículos propios con tope                                                                |
| **OE-02** (autorización por la app) | Visitas de terceros con día y franja desde la app, por la política de aprobación                                         |
| **OE-04** (biometría)               | Consentimiento del visitante por QR y compartir; foto real; supresión al terminar la visita (H-15I-10)                   |
| **RN-04**, **ADR-04**               | Tope de vehículos por vivienda en la base, con prueba concurrente                                                        |
| **RN-06**, **RN-07**, **HU-35**     | Listas negras desde la consola, con rol administrativo                                                                   |
| **RN-10**, **RN-11**                | El titular es el visitante; se suprime al terminar la visita                                                             |
| **RN-22**                           | La recurrente desde la app falla cerrada (**parcial**, con motivo). _15-J: H-15I-05 cerrado; sigue cerrada por H-15J-01_ |
| **CU-01 exc. 3a**                   | La lectura dudosa ya no abre sola (H-15I-09); L7 lo ensaya                                                               |
| **KPI-36/37**                       | Camino de servicio: la copropiedad ajena no ve ni toca las plazas de ésta                                                |
| **Hitos 2 y 3 del reto**            | Ensayados en SIMULADO por los dos canales; **pendientes en sitio (BE-02)**                                               |
| **KPI-13, 17, 25, 32, 33**          | **No medidos**: son latencias de extremo a extremo con el aparato delante (BE-02)                                        |

---

## 6 · Pruebas

**El ensayo de sitio en SIMULADO.** 16 escenarios en 26 filas escenario × canal:
**24 automáticas, 24 en verde** —app 10 de 10; consola 14 de 16—; las 2 que
faltan (V2 audio, V6 conmutación y emergencia) son procedimiento de sitio. Las
tres adicionales (L6, L7, T6), en verde. Detalle fila por fila en
[`ENSAYO_PREVIO_EN_SITIO.md`](../guias/ENSAYO_PREVIO_EN_SITIO.md).

**Cómo se ejecutan:**

```bash
./scripts/verificar-etapa.sh --con-base   # todo, incluido el ensayo contra la base
pnpm --filter @ncr/api test               # la suite de la API (con DATABASE_URL_PRUEBAS, también las -pg)
cd apps/mobile && flutter test --coverage # la app
```

### Las dos primeras corridas del verificador, FALLIDAS, y lo que destaparon

El verificador se ejecutó una vez al cierre, como pide el encargo, y **salió
FALLIDA**. No se maquilla: cuatro pasos en rojo, tres por defectos de esta
ronda y uno por un defecto del propio control.

| Paso | Qué dijo                                                          | Causa real                                                                                                                                                                                                                                   | Corrección                                                                      |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 4    | `pnpm lint` en rojo                                               | **H-15I-12** · `perfil.ts` y `vehiculo-propio.ts` (dominio) quitaban los controles con una regex de controles literales y la directiva de eslint en la línea equivocada. El `lint-staged` del pre-commit no lo detectó                       | Filtro por punto de código, como `padron/persona.ts`                            |
| 10   | un campo `@IsString()` sin longitud máxima (§2.7.4)               | **H-15I-13** · `fechaNacimiento` del perfil sólo tenía el patrón de fecha                                                                                                                                                                    | `@MaxLength(10)` y `maxLength` en el contrato                                   |
| 9    | el banco de pruebas negativas «no parte de una línea base limpia» | Consecuencia de H-15I-13: el árbol real ya violaba el control que la prueba negativa introduce                                                                                                                                               | Se resolvió con H-15I-13; comprobado aislado                                    |
| 7    | «111 ficheros de prueba que nadie ejecutó» en `@ncr/api`          | **H-15I-11** · `metricas.mjs` corre cada suite con `execFileSync` y su búfer por omisión de 1 MiB. La de la API, en verde, escribe **1 148 522 bytes** de bitácoras: ENOBUFS, sin informe, workers huérfanos. El mensaje culpaba a otra cosa | Búfer de 64 MiB, como `estabilidad.mjs`; el filtro del paso 7 deja ver la causa |
| 12c  | el camino del navegador se colgó 29 minutos                       | Consecuencia de H-15I-11: los workers huérfanos seguían vivos. Aislado, el recorrido pasa entero                                                                                                                                             | Se resolvió con H-15I-11                                                        |

**La segunda corrida**, sobre una base recién sembrada, pasó 4, 7, 9, 10 y
también 12c, 13, 14 y 15 —que la primera no llegó a ejecutar—, y salió FALLIDA
por dos cosas:

| Paso | Qué dijo                                                        | Causa real                                                                                                                                                                                                                                          | Corrección                                                                                                                |
| ---- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 5e   | «el acceso llevó `usuario: "aria"`» tras teclear `maria`        | **H-15I-14** · carrera del recorrido de la app que escribí en esta ronda: con el `<input>` ya enfocado, el motor de Flutter web aún puede aplicarle su estado vacío y borrar la primera pulsación. `escribirEn` leía el campo y descartaba lo leído | Si lo leído no es lo tecleado, se vacía y se reescribe (hasta tres). Tres corridas en verde; el reintento actuó dos veces |
| 9    | «el árbol de trabajo real cambió durante las pruebas negativas» | **Provocado por mí**: edité `recorrido-web.mjs` mientras el paso corría. El control hizo su trabajo                                                                                                                                                 | Ninguna en el código; la corrida definitiva se ejecutó sin tocar el árbol                                                 |

**La tercera corrida** es la definitiva: base recién sembrada, sin procesos
huérfanos y sin tocar el árbol mientras duró. Ése es el veredicto que cuenta:

### El veredicto literal de `./scripts/verificar-etapa.sh --con-base`

| Corrida | Sobre     | Resultado                                                                                                                          |
| ------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1       | `9299685` | **FALLIDA** · pasos 4, 7, 9, 10 y 12c (H-15I-11, H-15I-12, H-15I-13); 13, 14 y 15 no llegaron a correr: la detuve con 12c colgado  |
| 2       | `7fa0cd5` | **FALLIDA** · paso 5e (H-15I-14) y paso 9 (árbol tocado por mí durante la corrida); 4, 7, 9 (ramas), 10, 12c, 13, 14 y 15 en verde |
| 3       | `f01e274` | **correcta** · 26 de 26 pasos, **sin una sola ✗**                                                                                  |

Veredicto literal de la tercera corrida (`./scripts/verificar-etapa.sh --con-base`,
base efímera migrada hasta la 0038 con semillas, Flutter en el PATH, Chromium
del entorno; se omiten los pasos 0 a 4, 5b, 5d, 5e, 8, 10, 10b y 11, todos en
✓, y el detalle de las cinco saltadas declaradas):

```
▸ 5 · suite completa
   @ncr/config:test:       Tests  144 passed (144)
   @ncr/edge:test:       Tests  101 passed (101)
   @ncr/domain-core:test:       Tests  425 passed (425)
   @ncr/providers:test:       Tests  629 passed (629)
   @ncr/web:test:       Tests  486 passed (486)
   @ncr/api:test:       Tests  1246 passed | 5 skipped (1251)
   ⚠ suite sin rojas · las saltadas están DECLARADAS y se ejercen en otro paso
       las 5 están DECLARADAS y se ejercen en otro paso
▸ 5c · app móvil: suite de Dart y cobertura POR CAPA
   00:22 +209: All tests passed!
   ✓ dominio           96.02 % (umbral 90 %, 193/201 líneas)
   ✓ aplicacion        95.06 % (umbral 90 %, 154/162 líneas)
   ✓ configuracion    100.00 % (umbral 70 %, 33/33 líneas)
   ✓ infraestructura   85.35 % (umbral 60 %, 431/505 líneas)
   ✓ presentacion      81.05 % (umbral 50 %, 1625/2005 líneas)
   ✓ resto             26.83 % (umbral 0 %, 11/41 líneas)
   ✓ global            83.03 % (umbral 70 %, sin contar lo generado)
   – 867 líneas generadas, excluidas del cómputo a propósito
   ✓ cobertura de la app dentro de los umbrales por capa
   ✓ la suite de Dart da lo mismo en otro huso (Pacific/Auckland): ninguna prueba depende del reloj del sistema
▸ 6 · ningún fichero de prueba se quedó sin recoger
   ✓ 238 de 238 ficheros de prueba ejecutados
▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 96.05 % · ramas 96.80 % · funciones 95.93 % (umbral 90 %, 39 archivos)
     OK   aplicacion (**/aplicacion/**): lineas 95.80 % · ramas 86.94 % · funciones 98.32 % (umbral 90 %, 75 archivos)
     OK   global: lineas 82.23 % · ramas 84.43 % · funciones 82.29 % (umbral 70 %, 542 archivos)
   ✓ las tres capas cumplen su umbral
▸ 7b · los dos recuentos de la MISMA suite coinciden (D-112)
   ✓ recuentos: 6 paquete(s) con el mismo resultado por los dos caminos (turbo y vitest directo) · 3036 pruebas
▸ 9 · pruebas negativas de los propios controles
   ✓ entorno declarado: 53 variables de 2 esquemas, todas en su .env.example · 21 leídas fuera de Zod, con motivo
   ✓ declaraciones: 1 paso(s) declarado(s) no ejercido(s), 0 de ellos en linux, con motivo y etapa de revisión vigente
   ✓ controles: 35 de 37 con prueba negativa · 2 en deuda declarada (no puede crecer)
   ✓ PRUEBAS NEGATIVAS: los 28 controles detectan su violación y aceptan el caso legítimo, sin tocar el árbol
   ✓ ramas: 36 controles medidos · 234 bloques sin ejercer (no puede subir)
▸ 12 · esquema y aislamiento en --modo-supabase (requiere --con-base)
   ✓ migraciones, semillas y suite SQL
▸ 12b · arranque en frío: base vacía → migraciones → superadministrador (requiere --con-base)
   ✓ una base recién migrada llega a un superadministrador con claims válidos
   ✓ y esa sesión ENTRA: la API la acepta con aal2 y la rechaza con aal1
▸ 12c · el camino del NAVEGADOR: contraseña → factor → QR → aal2 → tablero
   ✓ el camino completo se recorre en el navegador
▸ 13 · KPI-03 y la inmutabilidad de un evento REAL, contra base (requiere --con-base)
   ✓ 100 inserciones concurrentes, 0 duplicados (KPI-03)
   ✓ UPDATE y DELETE rechazados sobre un evento real (RN-03, CA-23)
   ✓ 50 ingresos simultáneos sobre 10 plazas, ni una de más (RN-14, CA-14)
   ✓ una hoja sin un solo UUID crea viviendas, personas y sus vínculos (D-72, RN-06)
   ✓ el superadministrador escribe el padrón en la copropiedad del selector (D-71)
   ✓ las 12 en una sentencia, el mismo número en tres agrupaciones, y una colisión revierte las 12
▸ 14 · estabilidad: la suite da lo mismo tres veces seguidas
   ✓ OK estabilidad: 3 corridas forzadas (sin caché de turbo) con resultado idéntico y ningún error sin manejar
▸ 15 · ningún paso declarado se quedó sin ejecutar
   ✓ OK 26 de 26 pasos ejecutados

VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

Las 5 pruebas saltadas de `@ncr/api` en el paso 5 son las del arranque en frío,
que necesitan los claims que escribe el paso 12b; ese paso las ejecuta y exige
que no se salten. En el paso 14, sin caché, las 1251 corren y pasan. El control
declarado no ejercido es de otra plataforma: «0 de ellos en linux».

---

## 7 · Verificación de seguridad (§2.7)

| Medida                       | En esta ronda                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 · Secretos                 | Ninguno en código, pruebas, semillas ni documentos: las guías listan NOMBRES de variables. La app compila sólo la llave publicable. El escaneo de secretos del pre-commit, limpio en cada commit |
| 2 · CORS                     | Sin cambios: lista blanca                                                                                                                                                                        |
| 3 · Validación en el backend | DTO nuevos con `whitelist` y `forbidNonWhitelisted`; nulo tratado como ausente de forma explícita (H-15I-04); las invariantes (tope, ocupantes definitivos, código) en el dominio y la base      |
| 4 · Inyección SQL            | Sólo consultas parametrizadas; placa y documento normalizados en la base (`app.normalizar_placa`, `app.normalizar_documento`)                                                                    |
| 5 · Rate limiting            | Acceso: por cuenta y por origen (S-60, riesgo residual declarado); vinculación: 5 incorrectos en 15 min por cuenta y 30/min por dirección (S-55)                                                 |
| 6 · RLS                      | Todas las tablas nuevas con RLS forzada y prueba negativa (`90_residentes_y_vehiculos_propios.sql`); el camino de servicio valida la copropiedad en la aplicación (KPI-36/37)                    |
| 7 · CSP                      | Sin cambios; la pantalla nueva no introduce `unsafe-inline`                                                                                                                                      |
| 8 · Transversales            | Bitácora de residentes append-only con las tres capas de ADR-005; el documento no entra en la bitácora; el correo sintético no se muestra en la app (C-36); RBAC por guard en las rutas nuevas   |

**Riesgo abierto:** C-37 / P-20. Si la consola se despliega en Netlify (D8), el
SSE y el audio de portería y guardia se cortarían al límite de la función. No
afecta a la visita: en sitio la consola corre en el portátil.

---

## 8 · Deuda técnica, supuestos y pendientes

**`PENDIENTE DE DEFINICIÓN` generados:**

- **P-19** · viviendas anteriores a la 15-I sin declaración de ocupantes. Conservador: sólo el superadministrador fija sus plazas.
- **P-20** · flujos largos de la consola en Netlify (C-37). Conservador: en sitio, la consola en el portátil; no se despliega en esta ronda (D8).

**`[SUPUESTO]` generados:** S-52 (titular = primer residente que se vincula) ·
S-53 (documento en uso: se reutiliza la persona sólo si está libre) · S-54
(nivel de acceso del ocupante vinculado desde la app) · S-55 (límite de intentos
del código) · S-56 (tipo de documento `otro` para el visitante de la app) · S-57
(visitante sin documento: número técnico `SD` + 12 hexadecimales) · S-58 (código
o NIT en un solo campo) · S-59 (sesión guardada sin red: la puerta del primer
ingreso deja pasar) · S-60 (contador por identificador) · S-61 (Netlify cortaría
los flujos, no verificado).

**Hallazgos de la ronda:** H-15I-01 a H-15I-14. Todos corregidos salvo
H-15I-05, que se reporta con su parche. _Actualización 15-J: H-15I-05 **CERRADO**._

**Defectos reportados sin corregir:**

- ~~**H-15I-05**~~ **CERRADO en la [15-J](ETAPA-15-J-patron-en-hora-local.md)** —sin migración: el desplazamiento se calcula al leer con `copropiedades.zona_horaria`; el parche de abajo se descartó porque exigía columna nueva y dejaba mal las filas existentes—. Texto original: el patrón semanal se evalúa en UTC. Parche propuesto, fuera de lo que este encargo permite tocar (la persistencia):
  1. migración que añade `patrones_recurrencia.desplazamiento_utc_minutos smallint NOT NULL DEFAULT 0`;
  2. en `repositorio-autorizaciones-pg.ts`, escribir `a.patron.desplazamientoUtcMinutos` en el `INSERT` y leerlo en las dos reconstrucciones, que hoy fijan `desplazamientoUtcMinutos: 0`;
  3. una prueba contra la base con una franja de 14:00 a 18:00 en `America/Bogota` que abra a las 15:00 locales y no a las 10:00.
     Tamaño: pequeño (una migración, dos lecturas y una escritura). **No afecta a ninguno de los 16 escenarios**; mientras tanto, la recurrente desde la app falla cerrada.
- **T2 con motivo `FALLO_TECNICO`** para un rostro desconocido: lo decide el motor, que no se toca. Niega, que es lo que importa; el motivo es impreciso.

**Deuda técnica:**

- **DT-15I-01** · tres ficheros por encima de las 300 líneas de §2.3: `alta-pg.ts` (314, nuevo), `autorizaciones-pg.ts` (303) y `rostro_del_visitante.dart` (409). Se suman a los que ya lo estaban (`nuevo_visitante.dart`, `mi.controller.ts`, D-138). Tamaño: pequeño; partición mecánica.
- **DT-15I-02** · la API no acota el `suprimirEn` que manda el residente al final de la visita; la app ya envía el `hasta` (H-15I-10), pero otro cliente podría pedir una fecha posterior.
- **DT-15I-03** · el comentario de cabecera de la migración `0038` remite a «§3 ter» de `contradicciones-y-supuestos.md`; la sección es **§3 bis (E-03)**. No se reescribe una migración ya verificada por un comentario; queda anotado aquí.

**Abierto y no bloqueante para BE-02:** S-38 (por ratificar), AR-01 a AR-04 y el
riesgo residual de H-15B-1 (aceptaciones sin firmar), P-19, P-20 y H-15I-05
(_cerrado en la 15-J_).

---

## 9 · Qué debe hacer el usuario manualmente

1. Revisar y fusionar el PR de esta rama contra `develop`.
2. `supabase db push` contra el proyecto de Grupo Control: aplica la `0038`.
3. Seguir [`VALIDACION_HIKVISION_EN_SITIO.md`](../guias/VALIDACION_HIKVISION_EN_SITIO.md) §V.1 «Antes de salir de casa»: variables por nombre en su `.env` local, go2rtc, la app en el iPhone en Debug, copropiedad con código corto y teléfono de portería, residente y portero de prueba, la hoja impresa.
4. En sitio, §V.2: registrar los tres equipos desde la consola, ejecutar los 16 escenarios por canal y rellenar la hoja con host y usuario elididos.
5. Decidir P-19 y P-20 cuando convenga; ninguna bloquea la visita.

---

## 10 · Rama y commits

**Rama:** `etapa-15i-residentes-y-app`, sacada de `develop` (`aa2a764`). Conventional Commits con el prefijo `etapa-15i/<módulo>`.

| Commit     | Qué trae                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `eedefa9`  | `feat(etapa-15i/base)`: migración 0038 con código corto, tope de vehículos propios, ocupantes y bitácora de residentes  |
| `8222f1b`  | `feat(etapa-15i/api)`: acceso por código corto, ajustes de plataforma y nivel de acceso leído del catálogo              |
| `85339c8`  | `feat(etapa-15i/residente)`: alta en el primer ingreso, ocupantes, vehículos propios, perfil y supervisión              |
| `e127468`  | `chore(etapa-15i/contratos)`: OpenAPI y clientes generados con el acceso por código y el hogar del residente            |
| `95633a7`  | `feat(etapa-15i/consola)`: acceso por código o NIT, ajustes de plataforma y panel de residentes                         |
| `155b2cd`  | `test(etapa-15i/consola)`: la navegación cuenta la entrada «Residentes» del superadministrador                          |
| `8a10f1f`  | `fix(etapa-15i/api)`: el acceso trata un opcional nulo como ausente (H-15I-04)                                          |
| `84210ea`  | `feat(etapa-15i/app)`: acceso por código, primer ingreso, perfil, vehículos propios y entrega del consentimiento        |
| `4fd19a6`  | `feat(etapa-15i/autorizaciones)`: la creación pasa por la política de aprobación (D5 c) y ADR-025 a ADR-028             |
| `efd368f`  | `docs(etapa-15i/auditoria)`: D1–D9 registradas, C-35 a C-37, S-52 a S-61, P-19 y P-20; despliegue según D8              |
| `75c1c19`  | `feat(etapa-15i/app)`: cámara real del teléfono para la foto del visitante (hito 3)                                     |
| `c1c6152`  | `feat(etapa-15i/autorizaciones)`: listas negras desde la consola (HU-35, RN-07) y la recurrente de la app falla cerrada |
| `01ac7b9`  | `fix(etapa-15i/ensayo)`: lo que el ensayo simulado contra base real destapó, corregido, y el ensayo automatizado        |
| `bc5d9d2`  | `docs(etapa-15i/ensayo)`: hoja de resultados con columna «canal» y ENSAYO_PREVIO_EN_SITIO.md (SIMULADO)                 |
| `de5097f`  | `docs(etapa-15i/guias)`: procedimiento único de la visita con listas «antes de salir de casa» y «en sitio»              |
| `d438a03`  | `docs(etapa-15i/guias)`: README e INTEGRACION_HIKVISION coherentes con la hoja por canal y el procedimiento §V          |
| `9299685`  | `docs(etapa-15i/estado)`: la 15 queda BLOQUEADA sólo por BE-02; ficha de la ronda 15-I                                  |
| `3f14c3f`  | `fix(etapa-15i/residente)`: lo que el verificador encontró en el código de la ronda                                     |
| `7fa0cd5`  | `fix(etapa-15i/verificador)`: la medición de cobertura no muere por el búfer de 1 MiB                                   |
| `f01e274`  | `fix(etapa-15i/recorrido)`: se comprueba lo tecleado y se reescribe si el motor se comió una pulsación                  |
| _(cierre)_ | `chore(etapa-15i)`: este informe, el veredicto literal y ESTADO con H-15I-11 a H-15I-14                                 |

**PR** contra `develop`, abierto y **sin fusionar**.

---

## LO ÚNICO QUE FALTA

**La prueba en sitio de los tres equipos y los 16 escenarios** (BE-02): registrar
la cámara LPR, la terminal facial y el videoportero desde la consola, y ejecutar
los 16 escenarios —26 filas escenario × canal— desde la consola y desde la app,
con los tres hitos técnicos y los KPI de latencia medidos con el aparato delante.

Lo demás que queda, con su motivo y su tamaño, **no bloquea la visita**:

| Qué                                      | Motivo                                                                  | Tamaño                                    |
| ---------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| ~~**H-15I-05** · patrón semanal en UTC~~ | **CERRADO en la 15-J**                                                  | —                                         |
| **P-20** / **C-37** · consola en Netlify | Decisión del cliente sobre el despliegue; en sitio no aplica (portátil) | Medio · depende de la opción que se elija |
