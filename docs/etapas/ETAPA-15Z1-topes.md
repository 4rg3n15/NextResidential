# RONDA 15-Z1 · Topes por omisión: 5 vehículos propios y 10 plazas por vivienda

**Rama:** `etapa-15z1-topes` · **Base:** `etapa-15s6-herramientas-de-sitio` (cadena 15-S6 → 15-Y3: contiene la 15-S6; se fusiona en `develop` DESPUÉS de ella, con merge commit) ·
**PR:** hacia `develop`, sin fusionar · **Fecha:** 2026-10-13 ·
**Decisiones del cliente que aplica:** D-Z1 y D-Z2 (extensión **E-10**) ·
**Migración:** **0058**, la aplica usted con `supabase db push` tras la fusión (§9)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> Nada de lo nuevo se ha ejercido contra el proyecto Supabase real: la 0058
> está probada contra PostgreSQL local (aplicada, revertida, reaplicada y
> repetida), no contra la base de Grupo Control.

**Lo incómodo primero.**

1. **La unidad del tope de vehículos no es la que usted dijo, y no la cambié.**
   El encargo anota que el cliente lo dijo «por residente»; la base lo cuenta
   **por vivienda** desde la 0038 (`app.tg_tope_vehiculos_propios` compara los
   vehículos propios activos de la misma `vivienda_id` con el tope de la
   copropiedad; la consola lo etiqueta «Vehículos propios por vivienda»). Es
   `[CONTRADICCIÓN]` **C-67**. Cambiar la unidad es otra invariante —y la
   pregunta de qué pasa con cuatro adultos y un vehículo cada uno—, no otro
   número: queda en **P-40** para que el cliente decida. Lo que esta ronda
   entrega es **5 por vivienda**, el valor conservador (por residente serían
   hasta 50 por vivienda con las 10 plazas de D-Z2). Si el cliente quería «5
   por residente», esta ronda **no** lo da.
2. **Una copropiedad que había fijado 2 o 4 a propósito pierde esa decisión
   con la 0058.** Es `[SUPUESTO]` **S-15Z1-01**: «estar exactamente en el
   valor por omisión anterior no era una decisión». La migración no puede
   distinguir un 2 heredado de un 2 elegido; lo que sí hace es dejar una fila
   de `auditoria_seguridad` por cada cambio («migración 0058 · …»), para que
   usted vea cuáles tocó y devuelva la que haga falta desde Configuración.
3. **La reversión no devuelve a 2 y 4 lo que la 0058 no cambió.** En una base
   nueva, la copropiedad de la semilla nace con 5 y 10 (es el DEFAULT); si se
   revierte la 0058, los DEFAULT vuelven a 2 y 4 y esa copropiedad **se queda
   en 5 y 10**, porque no hay fila de auditoría que diga que la 0058 la
   subió. Es lo correcto —la reversión deshace lo que la migración hizo, no lo
   que no hizo— y es lo que vi al probarla (§6).
4. **Las pruebas que asumían «4» no se borraron: se les fijó el 4.** La 99l y
   la prueba con base «D6 · el superadministrador añade ocupantes» daban por
   hecho el tope por omisión de la 15-W; ahora fijan `tope = 4` explícito y
   prueban lo mismo con ese valor, y el 10 por omisión lo prueba la 99n. La
   concurrencia de plazas (`99l_plazas_concurrentes.sh`) pasa de la cuarta a
   la **décima** plaza. **Ninguna aserción de la suite con `MockProvider`
   cambió** (KPI-12).
5. **La app Flutter no cambia ni una línea, y eso está comprobado, no
   supuesto:** los textos de las plazas y del tope los manda la API
   (`avisoDeOcupantes(tope)`, «Plazas: N de M» con el `tope` de la respuesta),
   y no hay un «2» ni un «4» escrito en `apps/mobile/lib` (buscado). Sus
   pruebas de dominio usan `tope: 4` como dato de la prueba, no como valor por
   omisión: se quedan. **El cliente Dart generado sí cambió, y lo descubrió
   el verificador, no yo:** la primera versión de este informe decía que no
   cambiaba porque regeneré el contrato y el cliente TS y no el Dart; el paso
   5d de la tercera corrida lo vio desfasado (un comentario de documentación
   en `configuracion_de_copropiedad_dto.dart`). Regenerado en `dcd4a73`.
6. **Lancé el verificador sin haber corrido toda la suite de la API con base,
   y una prueba más dependía del 4:** `plazas-del-titular-pg.test.ts` (siete
   casos, en una copropiedad propia que ahora nace con 10). La corrida del
   verificador se detuvo al verla caer, la prueba fija el 4 por la ruta del
   superadministrador (`93a33f4`, §10) y el verificador se volvió a lanzar
   desde cero. Es el mismo defecto de método que la 15-S6 ya pagó: medir
   antes de verificar.
7. **Numeración del encargo frente al registro:** el encargo decía «abrir
   P-40» en la 15-Z3; el registro iba por P-39, así que P-40 es la unidad del
   tope (esta ronda) y la de «visitante dentro» será **P-41** en la 15-Z3.
   Prevalece el registro, como pide el §A del encargo.

---

## 1 · Qué se construyó

Dos valores por omisión suben y nada deja de ser configurable. El tope de
**vehículos propios** que los ocupantes registran sin pedir permiso pasa de 2
a **5 por vivienda** (D-Z1); el de **plazas** de ocupante —las que el titular
añade y retira, contándose— pasa de 4 a **10** (D-Z2). Los dos siguen siendo
ajustes de plataforma del superadministrador, de 0 a 20 y de 1 a 20, y el tope
propio de cada vivienda sigue mandando sobre el de su copropiedad.

El cambio vive en tres sitios, cada uno con su prueba vista fallar:

- **El dominio y la API dicen el valor nuevo.** `PLAZAS_POR_DEFECTO` (dominio,
  compartido con el Edge) y `TOPE_VEHICULOS_POR_OMISION` (ajustes de
  plataforma de la API), con el contrato OpenAPI regenerado.
- **La base lo impone.** La migración **0058** cambia los dos `DEFAULT`,
  lleva al valor nuevo a las copropiedades que estaban exactamente en el
  anterior —con una fila de auditoría por cambio, que la hace idempotente y a
  la reversión exacta—, y se revierte con `supabase/reversion/0058_revert.sql`.
- **Las pruebas contra la base lo demuestran en el límite.** La 99n: el quinto
  vehículo entra y el sexto no; la décima plaza entra y la undécima no; una
  vivienda con tope propio 3 sigue en 3; y la 0058 sobre una copropiedad en 2 y
  4 (sube, audita, no se repite) y sobre una en 3 y 6 (no la toca). Y dos
  carreras reales (ADR-04): 20 altas simultáneas sobre el quinto vehículo
  propio, entra una; 20 sobre la décima plaza, entra una.

Y todo texto que decía «2» o «4» como valor por omisión —manual, guía de
validación en sitio, README, ADR-026, ADR-038, modelo de datos— dice ahora 5 y
10 con la fecha del cambio, buscado y no supuesto (§2, punto 5).

## 2 · Cómo se organizó y por qué

### Punto 1 · La unidad del tope de vehículos: por vivienda, y se dice

Antes de tocar el número leí el disparador. `app.tg_tope_vehiculos_propios`
(0038) toma un bloqueo consultivo por **vivienda**, cuenta los vehículos con
`origen_registro = 'residente'` y `estado = 'activo'` **de esa vivienda** y
los compara con `copropiedades.tope_vehiculos_propios`. No hay cupo por
residente en ninguna tabla, y la prueba 90 lo verifica con dos residentes de
la misma vivienda. El cliente lo dijo «por residente»: C-67, resuelta por el
código en esta ronda, con la decisión de la unidad devuelta al cliente (P-40).
El comentario de `TOPE_VEHICULOS_POR_OMISION` lo dice para que nadie vuelva a
leerlo como «por residente».

### Punto 2 · Dos constantes y un contrato, nada más en el código

`PLAZAS_POR_DEFECTO` sólo se usa para **explicar**: el aviso de ocupantes y la
respuesta del alta cuando la vivienda aún no tiene tope leído; la verdad del
tope la impone la base (`tg_tope_de_plazas`, 0056). Por eso el cambio del
dominio es una constante y una línea de comentario, y la prueba de dominio que
decía «el tope por omisión es 4» pasa a decir 10 y añade el límite 9 → 10 y
10 → no. `TOPE_VEHICULOS_POR_OMISION` es, igualmente, el valor que la API
documenta; el DEFAULT real es el de la 0058. El contrato cambia sólo en la
descripción y el ejemplo de `topeVehiculosPropios` (aditivo: ningún campo
nuevo, ningún cliente lo nota).

Los dobles de prueba de la API (`hogar-en-memoria.ts`) tomaban 2 y 4 como
literales: ahora toman las constantes, para que el doble diga lo mismo que la
plataforma. El fichero estaba exactamente en 300 líneas y las dos
importaciones lo pasaban a 302: se recuperaron dos líneas en blanco para no
crecer (§2.3).

### Punto 3 · La migración 0058: una función con auditoría, no un `UPDATE` ciego

Un `UPDATE copropiedades SET tope = 5 WHERE tope = 2` habría cumplido el
encargo y roto tres cosas: no sería idempotente (una copropiedad que después
eligiera 2 volvería a subir si la migración se repitiera), no sería reversible
con exactitud (¿cuáles estaban en 2 por omisión y cuáles por decisión?) y no
dejaría rastro. La 0058 hace tres cosas distintas:

1. **Cambia los `DEFAULT`** de las dos columnas y sus comentarios, y lo
   asevera al final (`pg_attrdef`).
2. **`app.aplicar_topes_por_omision_0058(p_copropiedad)`**, una función y no un
   bloque anónimo para que la 99n la ejerza sobre datos propios: recorre las
   copropiedades con `tope_vehiculos_propios = 2` o
   `tope_de_plazas_por_vivienda = 4`, y por cada ajuste que cambia inserta una
   fila en `auditoria_seguridad` (`cambio_configuracion`, el mismo recurso que
   usa la consola, `identificador_solicitado` = «migración 0058 · campo: antes
   → después (D-Zn) · [SUPUESTO] S-15Z1-01 …»). **Esa fila es la guarda**:
   antes de cambiar, comprueba que no exista una fila de la 0058 para esa
   copropiedad y ese campo. Repetir la migración cambia 0 (probado tres
   veces). El actor es la identidad de plataforma (`app.actor_de_sistema()`),
   con los claims de superadministrador en la sesión, como la 0056: la RLS
   forzada alcanza al dueño y los disparadores de los dos topes exigen
   superadministrador cuando hay usuario en los claims.
3. **La reversión** (`0058_revert.sql`) devuelve los `DEFAULT`, y por cada fila
   «migración 0058 · …» cuya copropiedad **sigue** en el valor nuevo la vuelve
   al anterior, con su propia fila «reversión 0058 · …»; una copropiedad que
   alguien cambió después (a 8, por ejemplo) se conserva. Bajar el tope de
   plazas dispara `tg_conservar_plazas_al_bajar_el_tope` (0056): nadie pierde
   una plaza. La reversión exige `\set ON_ERROR_STOP on` como las anteriores;
   la migración no lleva órdenes de `psql` (control `migraciones-sin-psql`).

No hay ningún `psql` en la migración, el número es 0058 y la marca de tiempo
(`20261013120000`) es posterior a la 0057, como pide el encargo.

### Punto 4 · Pruebas en el límite y en carrera, contra la base

La 99n corre dentro de una transacción que se deshace, con las identidades que
las políticas admiten: las viviendas las crea el **administrador** (la RLS
forzada de `viviendas` es suya, como la semilla: lo descubrí al primer intento,
que insertaba como superadministrador y la RLS lo rechazó), el tope propio y
las plazas los pone la **plataforma** (D-W10), y los vehículos los registra la
administración en nombre del hogar declarados `origen = 'residente'`, que son
los que cuentan. La carrera de vehículos
(`99n_vehiculos_concurrentes.sh`) es hermana de la de plazas: una vivienda
propia con 4 vehículos vivos, 20 conexiones reales que insertan el quinto a
la vez con placa distinta cada una, `pg_sleep(0.2)` dentro de la transacción
para que coincidan, y al final exactamente uno aceptado y 5 vivos; se limpia
desactivando, porque los vehículos no se borran (`tg_vehiculos_prohibir_delete`).

### Punto 5 · Los textos, buscados

`grep` sobre `apps/mobile/lib`, `apps/web/src`, `docs/guias`, `docs/decisiones`
y el README por «hasta 4», «tope de 4», «4 plazas», «3 de 4», «2 vehículos»,
«tope de 2», «dos vehículos», «cuatro plazas». Salieron: el manual (§«Plazas
de los hogares», «Plazas: 3 de 4»), la guía de validación en sitio (dos
líneas), el README (la fila de la 15-I), ADR-026, ADR-038, el modelo de datos
(dos filas y el párrafo de la concurrencia) y un comentario de la consola. No
salió nada en Flutter ni en el código de la consola: los textos vienen de la
API. Los ADR no se reescriben: llevan una **enmienda** fechada, y la 15-I del
README sigue diciendo 2 porque eso fue lo que esa etapa construyó, con la nota
de que desde la 15-Z1 son 5.

### Punto 6 · Lo que no se tocó

`OCUPANTES_MAXIMO = 20` y los `CHECK` de 0 a 20 y de 1 a 20; los topes propios
de cada vivienda (`viviendas.tope_de_plazas`); la ruta y la pantalla con que
el superadministrador los cambia; la app Flutter; y la unidad del tope de
vehículos (P-40).

## 3 · Árbol de archivos

| Fichero                                                                                                                                                     | Propósito                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain-core/src/residente/ocupantes.ts` (M)                                                                                                       | `PLAZAS_POR_DEFECTO = 10` (D-Z2) y el comentario del tope                                                                         |
| `packages/domain-core/src/residente/ocupantes.test.ts` (M)                                                                                                  | El tope por omisión es 10; 9 → 10 cabe, la undécima no                                                                            |
| `apps/api/src/multiempresa/ajustes-de-plataforma.ts` (M)                                                                                                    | `TOPE_VEHICULOS_POR_OMISION = 5` (D-Z1), con la unidad por vivienda escrita (C-67)                                                |
| `apps/api/src/multiempresa/respuestas.ts` (M)                                                                                                               | Descripción y ejemplo de `topeVehiculosPropios` en OpenAPI                                                                        |
| `packages/contracts/openapi.json` · `src/generado/api.ts` · `apps/mobile/lib/infraestructura/api/generado/models/configuracion_de_copropiedad_dto.dart` (M) | Contrato y clientes TS y Dart regenerados (`pnpm contrato && pnpm contrato:cliente`; `swagger_parser` + `build_runner`)           |
| `apps/api/test/dobles/hogar-en-memoria.ts` (M)                                                                                                              | El doble toma las constantes en vez de 2 y 4 literales (sigue en 300 líneas)                                                      |
| `apps/api/test/plazas-del-titular-pg.test.ts` (M)                                                                                                           | Fija el tope 4 en su copropiedad propia por la ruta del superadministrador; prueba lo mismo que en la 15-W                        |
| `apps/api/test/residentes-y-vehiculos-pg.test.ts` (M)                                                                                                       | La declaración: 11 → 409 «máximo de 10 plazas», `tope: 10`; D6 fija `tope_de_plazas = 4` para seguir probando que la ruta lo sube |
| `apps/web/src/app/(consola)/residentes/tope-de-plazas.tsx` (M)                                                                                              | Un comentario («Plazas: 3 de 10»); la consola lee el tope de la API                                                               |
| `supabase/migrations/20261013120000_0058_topes_por_omision_5_y_10.sql` (N, 124)                                                                             | `DEFAULT` 5 y 10, `app.aplicar_topes_por_omision_0058`, su llamada con la identidad de plataforma, aserciones de despliegue       |
| `supabase/reversion/0058_revert.sql` (N, 71)                                                                                                                | `DEFAULT` 2 y 4; vuelta exacta por las filas de auditoría; retira la función                                                      |
| `supabase/policies/tests/99n_topes_por_omision_5_y_10.sql` (N, 168)                                                                                         | Los cinco bloques de §1, en una transacción que se deshace                                                                        |
| `supabase/policies/tests/99n_vehiculos_concurrentes.sh` (N, 101)                                                                                            | 20 altas simultáneas sobre el quinto vehículo propio: entra una (ADR-04)                                                          |
| `supabase/policies/tests/99l_autorregistro_y_menores.sql` (M)                                                                                               | Fija 4 explícito al principio (lo cambia la plataforma) y lo dice en su cabecera                                                  |
| `supabase/policies/tests/99l_plazas_concurrentes.sh` (M)                                                                                                    | 9 plazas vivas y la carrera sobre la décima                                                                                       |
| `docs/guias/MANUAL_USUARIO.md` · `docs/guias/VALIDACION_HIKVISION_EN_SITIO.md` (M)                                                                          | «10 por omisión», «Plazas: 3 de 10», «tope de vehículos propios (5 por vivienda desde la 15-Z1)», «de 1 a 10 plazas»              |
| `README.md` (M)                                                                                                                                             | La fila de la 15-I: 2 en esa etapa, 5 desde la 15-Z1                                                                              |
| `docs/decisiones/ADR-026-…` · `ADR-038-…` (M)                                                                                                               | Enmiendas fechadas de la 15-Z1                                                                                                    |
| `docs/arquitectura/modelo-datos.md` (M)                                                                                                                     | Las dos columnas con sus `DEFAULT` nuevos, el párrafo de la 0058 y la concurrencia medida                                         |
| `docs/auditoria/contradicciones-y-supuestos.md` (M)                                                                                                         | C-67 · S-15W-03 actualizado · S-15Z1-01 · P-40 · E-10 · recuentos                                                                 |
| `docs/etapas/ETAPA-15Z1-topes.md` (N) · `docs/ESTADO_ETAPAS.md` (M)                                                                                         | Este informe y la ficha                                                                                                           |

## 4 · Tabla SOLID

| Fichero                                        | SRP                                                                               | OCP                                                                   | LSP                                                        | ISP                                              | DIP                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| `ocupantes.ts`                                 | Sigue decidiendo sólo la forma y el aviso de las plazas; cambia una constante     | Ninguna función nueva: el tope real sigue siendo dato de la base      | —                                                          | —                                                | Dominio puro: cero I/O (138 líneas)                                         |
| `ajustes-de-plataforma.ts`                     | Los tres ajustes de plataforma y nada más                                         | El valor por omisión es dato; la validación 0–20 no cambia            | —                                                          | —                                                | Sin dependencias de infraestructura (84 líneas)                             |
| `0058_…sql` · `aplicar_topes_por_omision_0058` | Una función, una responsabilidad: llevar al nuevo valor lo que estaba en el viejo | Ampliar a otro ajuste sería otra rama con su propia fila de auditoría | —                                                          | Recibe sólo la copropiedad (o `NULL` para todas) | Usa `app.actor_de_sistema()` y la auditoría existentes; no define contratos |
| `99n_….sql` · `99n_vehiculos_concurrentes.sh`  | Cada bloque prueba un límite; el `.sh` sólo la carrera                            | Hermanos de la 99l: la misma forma para un cupo distinto              | El `.sh` es intercambiable con el de plazas salvo la tabla | —                                                | Sólo `psql` y la base                                                       |
| `hogar-en-memoria.ts` (doble)                  | Sigue en 300 líneas; toma las constantes de la plataforma                         | —                                                                     | Mismo contrato que los adaptadores Pg                      | —                                                | Importa las constantes, no la base                                          |

## 5 · Trazabilidad

| Elemento                    | Cómo lo cubre esta ronda                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **D-Z1 · D-Z2** (E-10)      | Valores 5 y 10 en dominio, API, contrato, base y textos; migración 0058 con auditoría                                               |
| **RN-04 · KPI-03 · ADR-04** | El tope de vehículos sigue en la base, bajo bloqueo por vivienda: 20 altas simultáneas, entra una (`99n_vehiculos_concurrentes.sh`) |
| **D-W10 · ADR-038**         | El titular gestiona hasta 10; el superadministrador amplía; el tope propio manda (99n bloque 5)                                     |
| **D5 a · ADR-026**          | Enmienda fechada; la unidad por vivienda, C-67 y P-40                                                                               |
| **HU-05, HU-06**            | Vehículos del residente: el valor por omisión del cupo                                                                              |
| **RN-19 · KPI-05**          | Cada cambio de la migración, auditado con actor, objetivo y texto; la reversión también                                             |
| **Parcial**                 | La unidad «por residente» del encargo: **no** (P-40, decisión del cliente)                                                          |

## 6 · Pruebas

**Cómo se ejecutan:** `pnpm --filter @ncr/domain-core exec vitest run
src/residente` (71), `pnpm --filter @ncr/api exec vitest run src/multiempresa
src/residente` (114), `./supabase/verificar.sh --con-pruebas --modo-supabase`
(migraciones, semillas, 99a–99n y los dos `.sh` de concurrencia), `pnpm
--filter @ncr/api exec vitest run test/residentes-y-vehiculos-pg.test.ts`
(14, con `DATABASE_URL_PRUEBAS`).

**Visto fallar antes de corregir:**

- `ocupantes.test.ts`: «el tope por omisión es 10» y «9 de 10» fallan con
  `PLAZAS_POR_DEFECTO = 4` (2 rojas), pasan con 10.
- `99n_topes_por_omision_5_y_10.sql`: sobre la base con la **reversión 0058
  aplicada** falla en el primer bloque («tope_vehiculos_propios: DEFAULT 2, no
  5»); con la 0058 reaplicada, los cinco bloques en verde; la 0058 repetida
  una tercera vez cambia 0 ajustes.
- `99n_vehiculos_concurrentes.sh`: con el tope de la copropiedad en 2 no
  monta el escenario (el cuarto vehículo propio choca con el tope: «NO
  VERIFICADO»); con 5, «entra una, el tope se sostiene».
- `residentes-y-vehiculos-pg.test.ts` D6: con 10 por omisión y 4 plazas la
  ruta ya no subía el tope (`expected null to be 5`); fijado el tope propio 4,
  vuelve a probar que lo sube.
- `plazas-del-titular-pg.test.ts`: con 10 por omisión, siete casos rojos
  («expected 10 to be 4», cinco altas sobre la cuarta plaza aceptadas…); con
  el tope 4 fijado en su copropiedad, 8 de 8.
- Paso 5d del verificador (tercera corrida): «el cliente Dart no coincide
  con el contrato OpenAPI · difiere: models/configuracion_de_copropiedad_dto.dart».
  Regenerado; la cuarta corrida es la del veredicto.
- La reversión, probada de verdad: `DEFAULT` a 2 y 4, 0 copropiedades
  devueltas en una base nueva (ninguna fila de la 0058: lo incómodo n.º 3),
  y la 0058 reaplicada encima sin error.

**Resultados en el segundo PostgreSQL local (puerto 55433, sembrado desde
cero con la 0058):** `supabase/verificar.sh --con-pruebas --modo-supabase` en
verde, 99l y 99n incluidas; `99l_plazas_concurrentes.sh` «20 altas simultáneas
sobre la décima plaza: entra una»; `99n_vehiculos_concurrentes.sh` «20 altas
simultáneas sobre el quinto cupo: entra una»; `residentes-y-vehiculos-pg` 14
de 14; `ensayo-en-sitio-pg` 10 de 10.

**Verificador (§2.8.0):** cuatro corridas de `./scripts/verificar-etapa.sh --con-base`.

- Primera (sobre `b36af13` antes del arreglo de `plazas-del-titular-pg`):
  detenida al ver caer esa prueba en el paso 5; no llegó a veredicto.
- Segunda (sobre el arreglo): detenida para traer la corrección del ocupante
  de «puerto ocupado» de la 15-S6 (`879c28f`), sobre la que esta rama se
  rebasó; no llegó a veredicto.
- Tercera (sobre `b36af13` rebasado): `✗ el cliente Dart no coincide con el
contrato OpenAPI · difiere: models/configuracion_de_copropiedad_dto.dart`
  en el paso 5d; detenida y el cliente regenerado (`dcd4a73`).
- Cuarta, sobre `dcd4a73` (01:19 → 02:09 UTC), veredicto literal:

  `VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe`

  31 de 31 pasos; estabilidad 3/3 idéntica (api 2559 · config 144 ·
  domain-core 484 · edge 331 · providers 1321 · web 826; 568 ficheros
  recogidos y 568 ejecutados en las tres pasadas); el control declarado no
  ejercido es el mismo de la 15-S5 y la 15-S6 (0 en Linux, con motivo y
  etapa de revisión vigente). Segunda base de pruebas (puerto 55433), para
  no compartirla con la corrida de la 15-S6.

## 7 · Verificación de seguridad (§2.7)

| Medida                    | Esta ronda                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Secretos              | Ninguno; identificadores de prueba sintéticos (`9e…`, `00…`), ninguna IP                                                                                                                                       |
| 3 · Validación en backend | Sin DTO nuevo; `validarTopeVehiculos` sigue en 0–20                                                                                                                                                            |
| 4 · SQL                   | La función de la 0058 usa sólo sentencias parametrizadas sobre `record`; sin concatenación de entrada de usuario (`c.id` es un `uuid` de la propia tabla)                                                      |
| 6 · RLS                   | La 0058 corre con los claims de superadministrador como la 0056; la 99n ejerce las políticas con `sb_postgres_sim` (no dueño): el primer intento, como superadministrador sobre `viviendas`, lo rechazó la RLS |
| 8 · Auditoría append-only | Cada cambio de la migración y de la reversión deja su fila en `auditoria_seguridad`, que sigue sin `UPDATE`/`DELETE`                                                                                           |
| RBAC                      | Nadie nuevo cambia topes: los disparadores de la 0038, 0042 y 0056 siguen exigiendo superadministrador                                                                                                         |

## 8 · Hallazgos, deuda, supuestos y pendientes

- **`[CONTRADICCIÓN]` C-67** · el tope «por residente» del encargo frente a la
  base, que cuenta por vivienda. Resuelta por el código en esta ronda; la
  unidad, al cliente.
- **`PENDIENTE DE DEFINICIÓN` P-40** · la unidad del tope de vehículos
  propios. Conservador vigente: 5 por vivienda.
- **`[SUPUESTO]` S-15Z1-01** · una copropiedad exactamente en 2 o 4 no lo
  había decidido. Verificable con las filas «migración 0058 · …» tras el
  `db push`.
- **S-15W-03** deja de ser supuesto: D-Z2 lo decide (10).
- **Deuda nueva:** ninguna. Las DT abiertas de rondas anteriores no cambian.

## 9 · Qué debe hacer el usuario manualmente

1. Fusionar **después** de la 15-S6, con merge commit (la rama la contiene).
2. `supabase db push` para aplicar la **0058**. Salida esperada: `NOTICE:
0058: N ajuste(s) de copropiedad pasaron del valor por omisión anterior al
nuevo`, con N = cuántos ajustes estaban en 2 o en 4.
3. En la consola, Configuración → Ajustes de plataforma de cada copropiedad:
   «Vehículos propios por vivienda» debe decir 5 y «Plazas por vivienda» 10,
   salvo en las que tenían otro valor.
4. Revisar en la auditoría de seguridad las filas «migración 0058 · …». Si
   alguna copropiedad había fijado 2 o 4 **a propósito**, devolver el valor
   desde esa misma pantalla (queda auditado como cualquier cambio).
5. Decidir **P-40**: si el tope de vehículos debe ser por residente, es una
   ronda nueva (índice o disparador por residente y qué pasa con la vivienda
   de cuatro adultos).

## 10 · Rama y commits

`etapa-15z1-topes`, desde `etapa-15s6-herramientas-de-sitio` (`879c28f`); la
contiene. PR hacia `develop`, sin fusionar; fusionar DESPUÉS del PR #57, con
merge commit. La rama se rebasó una vez sobre la 15-S6 corregida antes de su
primer push (no tenía PR).

| Commit    | Qué                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| `f51b201` | `PLAZAS_POR_DEFECTO = 10` y `TOPE_VEHICULOS_POR_OMISION = 5`; dobles y pruebas con base; contrato y cliente TS     |
| `2c3af30` | Migración 0058, reversión, 99n y `99n_vehiculos_concurrentes.sh`; la 99l fija 4 y su concurrencia pasa a la décima |
| `fe4a4af` | Textos (manual, guías, README, ADR-026, ADR-038, modelo de datos) y registro (C-67, S-15Z1-01, P-40, E-10)         |
| `b36af13` | `plazas-del-titular-pg` fija el tope 4 de su copropiedad (la primera corrida del verificador)                      |
| `dcd4a73` | Cliente Dart regenerado (la tercera corrida del verificador)                                                       |
| cierre    | `chore(etapa-15z1): cierre de etapa` — informe y ficha                                                             |
