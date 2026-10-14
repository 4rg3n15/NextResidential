# ETAPA 15 · RONDA 15-Z3 — Actividad por vivienda: vehículos en visita activa y visitantes en este momento

**Rama:** `etapa-15z3-actividad-por-vivienda` · **Base:** `etapa-15z2-ux-y-errores` (la contiene) · **Estado:** CERRADA · 2026-10-14 · **PR:** hacia `develop`, sin fusionar; fusionar DESPUÉS del PR de la 15-Z2 con merge commit · cuarta de la cadena 15-S6 → 15-Y3 (encargo del 2026-10-13)

> **Lo incómodo primero.** «Visitantes en este momento» sólo es exacto si los
> equipos **reportan la salida**. Con los datos de hoy, un visitante que entró
> por la barrera y salió por una puerta que no registra salidas sigue contando
> hasta que vence su visita. No se inventa una salida ni se descuenta por
> tiempo: el criterio es el que la pantalla dice al pie, y la decisión de
> negocio queda abierta en **P-41**. La ronda no cambia nada del acceso: es
> una lectura, sin migración (el `EXPLAIN ANALYZE` no pidió índice).

---

## 1 · Qué se construyó

El superadministrador —en el tablero de la copropiedad que tenga elegida—, el
administrador y el portero ven ahora una tabla con cada vivienda activa y dos
cifras: **«N vehículos en visita activa · M visitantes en este momento»**,
escritas como «Torre 3 · 302». Sale ordenada por actividad (más visitantes
primero; a igualdad, más vehículos; luego torre y vivienda), se puede
reordenar por torre y vivienda y filtrar por torre, y se actualiza sola cada
15 segundos mientras la pestaña está a la vista. Sólo cifras: ningún nombre,
documento ni placa sale de la API para esta vista.

Detrás hay un caso de uso de lectura, `ConsultarActividadPorVivienda`, con el
reloj inyectado: «en este momento» es el instante del reloj de la aplicación,
que viaja a la base como parámetro y vuelve en la respuesta junto con el
**criterio** en texto, para que la pantalla lo enseñe tal cual en vez de
reinterpretarlo. El puerto `ActividadPorVivienda` lo resuelve un adaptador SQL
de **una sola sentencia** por copropiedad: 500 viviendas con sus recuentos en
el mismo viaje, y la prueba lo cuenta en vez de confiarlo a un comentario.

La ruta nueva, `GET /copropiedades/:id/tablero/actividad-por-vivienda`, la
alcanzan portero, administrador y superadministrador; el residente y el
operador de central reciben 403; una copropiedad ajena o desconocida, 404. La
ruta entró sola en la suite de aislamiento por la enumeración del enrutador, y
los dos inventarios de rutas del tablero pasaron de tres a cuatro.

## 2 · Cómo se organizó y por qué

### Punto 1 · Un caso de uso de lectura con el reloj inyectado, no una consulta en el controlador

Es un recuento, no una regla: no hay agregado ni invariante. Aun así vive en
la capa de aplicación por lo mismo que las otras lecturas del tablero: hay una
decisión que no es de transporte —**con qué instante se juzga la vigencia**—
y una que no es de SQL —**qué significa «en este momento»**—. La primera la
resuelve el `Reloj` inyectado (§2.4: nunca `new Date()` ni `now()` en la
lógica), y por eso la prueba puede poner el reloj un segundo antes del
vencimiento y luego en el vencimiento exacto. La segunda es la constante
`CRITERIO_DE_ACTIVIDAD`, que viaja en la respuesta: el día que P-41 cambie el
criterio, cambia el texto y la pantalla lo dice sin tocarse.

El orden por actividad es una función pura, `ordenarPorActividad`, con su
prueba de que no muta la entrada.

### Punto 2 · «En este momento» con los datos que hay, y dicho (P-41)

Los eventos distinguen `ingreso` de `salida` (`tipo_evento`), y
`RegistrarAcceso` guarda la `autorizacion_id` del hecho. Con eso, un
visitante está dentro si su **último paso permitido por la portería, dentro
de la vigencia de su visita y no posterior al instante juzgado, fue un
ingreso**. Una salida posterior lo saca; un segundo ingreso lo vuelve a meter.
Los vehículos son esos mismos visitantes cuando la visita tiene placa o el
ingreso fue por placa («visitas con placa», D-Z3).

Lo que esto exige —que los equipos reporten la salida— no está garantizado
en todas las copropiedades, y es lo que abre **P-41**: si un visitante sin
salida reportada debe dejar de contar al cabo de un tiempo, o sólo al vencer
su visita, lo decide el cliente. Mientras tanto rige lo conservador para un
recuento informativo: no se inventa una salida. Es la misma naturaleza
declarada que ya tenía el «dentro ahora» de los indicadores (ETAPA 09-A).

### Punto 3 · Una sentencia por copropiedad, y el plan lo demuestra

El adaptador `ActividadPorViviendaPg` ejecuta UNA sentencia con cuatro
CTE: `cop` (la copropiedad activa; sin fila, `null` y 404), `vigentes` (las
autorizaciones activas cuya vigencia contiene el instante, `@>` sobre el
`tstzrange` con el índice GiST de la 0007), `ultimo` (por autorización, el
último evento permitido de ingreso o salida dentro de la vigencia y no
posterior al instante, `DISTINCT ON`) y `dentro` (por vivienda, visitantes
distintos cuyo último paso fue un ingreso, y cuántos con placa). La
proyección final parte de **las viviendas activas** con `LEFT JOIN`: la que
no tiene actividad sale con ceros, no desaparece.

Dos decisiones de la consulta son de rendimiento y las dice el plan:

- el evento se une también por `vivienda_id`, no sólo por `autorizacion_id`,
  para que sirva el índice `(copropiedad_id, vivienda_id, ocurrido_en)` que
  ya existe por partición;
- hay una **cota inferior global** sobre `ocurrido_en` (`min(lower(vigencia))`
  de las vigentes), que es lo que deja **podar las particiones mensuales**:
  una visita vigente hoy no tiene ingresos del año pasado.

`EXPLAIN (ANALYZE, BUFFERS)` sobre la copropiedad de la semilla (149
viviendas, 54 vigentes, 262 eventos del mes), extracto literal:

```
Sort  (cost=182.14..182.75 rows=244 width=36) (actual time=1.036..1.047 rows=149 loops=1)
  Buffers: shared hit=184
  CTE vigentes
    ->  Seq Scan on autorizaciones a_2  (... rows=54 ...)
          Filter: ((copropiedad_id = '…'::uuid) AND (estado = 'activa') AND (vigencia @> now()))
  ...
    ->  Append  (... rows=262 loops=1)
          Subplans Removed: 5
          ->  Index Scan using eventos_2026_10_copropiedad_id_ocurrido_en_idx on eventos_2026_10 e_7
                Index Cond: ((copropiedad_id = '…'::uuid) AND (ocurrido_en <= now()) AND (ocurrido_en >= $1))
                Filter: ((tipo = ANY ('{ingreso,salida}')) AND (resultado = 'permitido'))
Planning Time: 8.154 ms
Execution Time: 1.359 ms
```

Seis de las siete particiones quedan fuera (`Subplans Removed: 5` más la
que no se enumera), la que queda se lee por índice en el rango del instante,
y 184 bloques en caché resuelven las 149 viviendas. **No hay índice que
pedir, así que no hay migración 0059**: el único recorrido secuencial es
sobre `autorizaciones` (185 filas en la semilla), que el planificador
prefiere al índice por tamaño; con un conjunto real, el índice GiST de la
0007 sobre `vigencia` es el que entra, y ya existe.

### Punto 4 · Los claims de servicio dentro de la transacción, como el resto del tablero

La lectura va en `BEGIN READ ONLY` con `set_config('request.jwt.claims', …,
true)` para la copropiedad de la ruta: la RLS forzada es la segunda barrera;
`exigirAlcance` ya decidió en la aplicación (§2.7.6, el segundo camino). La
prueba con la base monta una vivienda con actividad en la copropiedad B y
comprueba que no aparece al consultar la A, y al revés. El adaptador existente
del tablero (`repositorio-tablero-pg.ts`, 305 líneas) **no crece**: el nuevo
tiene su propia transacción, con la misma forma.

### Punto 5 · La consola: una tarjeta, no una pantalla; en las páginas, no en los ficheros largos

`ActividadPorVivienda` es un componente de 216 líneas con su propia consulta
(`useActividadPorVivienda`, sondeo cada 15 s, sin sondear en segundo plano),
los filtros como subcomponente, y los cinco estados: cargando (la tabla lo
dice), vacío (sin viviendas activas, o sin viviendas en esa torre), error, sin
permiso (el 403 de la API, sin reintento a ciegas) y sin conexión (cuando
`fetch` ni siquiera responde). Se monta en **las páginas** de Portería y del
tablero, que caben de sobra; `porteria/pantalla.tsx` (408 líneas) y
`tablero-operativo.tsx` (305) no crecen. En el tablero no se pinta para el
operador de central: la API se la negaría.

**Sondeo y no tiempo real**, dicho con su razón: es una cifra de ocupación,
no una alarma. La cola de Portería ya sondea cada 4 s lo urgente; abrir un
canal de tiempo real para un recuento que cambia con cada paso por la puerta
costaría una suscripción más por consola sin que nadie la mirase al segundo.

### Punto 6 · RBAC por decorador, y la central fuera (S-15Z3-01)

`@Roles('portero', 'administrador', 'superadministrador')`. D-Z3 nombra al
superadministrador y al portero; el administrador opera la copropiedad y
sería absurdo que no viera lo que ve su portero. El **operador de central**
queda fuera por supuesto conservador: atiende colas de llamadas de varias
copropiedades, no la ocupación de una; abrirlo después es añadir un rol al
decorador y a la página, cerrarlo después sería retirar algo en uso.

## 3 · Árbol de archivos

```
apps/api/src/tablero/
├─ aplicacion/actividad-por-vivienda.ts            (88)  puerto, criterio, orden puro, caso de uso con reloj
├─ aplicacion/actividad-por-vivienda.test.ts       (91)  reloj inyectado, desconocida, orden y pureza
├─ infraestructura/actividad-por-vivienda-pg.ts   (115)  UNA sentencia con cuatro CTE, claims de servicio en la transacción
├─ infraestructura/actividad-por-vivienda-en-memoria.ts (22)  doble declarativo para la suite sin base
├─ presentacion/actividad.controller.ts            (58)  GET …/tablero/actividad-por-vivienda, roles, alcance, 404
├─ presentacion/respuestas.ts                 (163→189)  ActividadDeViviendaDto, ActividadPorViviendaDto
├─ tablero.module.ts                           (98→121)  el puerto sigue el interruptor PERSISTENCIA_DE_EVENTOS
└─ index.ts                                       (9→12)  exporta el puerto para que la suite declare filas
apps/api/test/
├─ actividad-por-vivienda-pg.test.ts              (250)  los límites contra la base y el recuento de sentencias
├─ actividad-por-vivienda.e2e.test.ts             (102)  roles, forma de la respuesta, ajena y desconocida
├─ aislamiento.e2e.test.ts, tablero.e2e.test.ts          los inventarios del tablero: de tres rutas a cuatro
apps/web/src/
├─ componentes/actividad-por-vivienda.tsx         (216)  tarjeta, consulta con sondeo, orden, filtro, cinco estados
├─ componentes/actividad-por-vivienda.test.tsx    (142)  los cinco estados, orden, filtro, funciones puras
├─ app/(consola)/porteria/page.tsx              (49→54)  monta la tarjeta debajo de la pantalla de Portería
└─ app/(consola)/tablero/page.tsx               (45→54)  monta la tarjeta; la central no la ve
packages/contracts/   openapi.json, src/generado/api.ts, src/index.ts (dos alias)
apps/mobile/lib/infraestructura/api/generado/   cliente Dart regenerado (la app no lo usa)
docs/guias/MANUAL_USUARIO.md                     Portería y superadministrador: la tarjeta y su criterio
docs/auditoria/contradicciones-y-supuestos.md    P-41, S-15Z3-01
```

## 4 · Tabla SOLID

| Fichero                                | SRP                                                                | OCP                                                              | LSP                                                                      | ISP                                              | DIP                                                                   |
| -------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------------------------------------- |
| `actividad-por-vivienda.ts`            | Un caso de uso, una lectura; el orden es una función aparte        | Otro criterio es otro texto y otra consulta, no otro caso de uso | —                                                                        | El puerto tiene un método                        | La aplicación declara `ActividadPorVivienda`; nadie importa `pg` aquí |
| `actividad-por-vivienda-pg.ts`         | Una sentencia y su mapeo                                           | La consulta es un texto constante: cambiarla no toca el mapeo    | Intercambiable con el doble en memoria: la e2e usa el doble              | Implementa sólo `consultar`                      | Cumple el puerto; recibe el `Pool` por constructor                    |
| `actividad-por-vivienda-en-memoria.ts` | Declarar y devolver                                                | —                                                                | Mismo contrato que el adaptador Pg, incluido `null`                      | Igual                                            | Igual                                                                 |
| `actividad.controller.ts`              | Traducir la ruta al caso de uso y el resultado al DTO              | Un rol más es un cambio en el decorador                          | —                                                                        | Inyecta el caso de uso y `Aislamiento`, nada más | Depende del caso de uso, no del adaptador                             |
| `respuestas.ts` (+26)                  | DTOs de salida del tablero                                         | Dos clases nuevas, ninguna tocada                                | —                                                                        | —                                                | —                                                                     |
| `tablero.module.ts` (+23)              | Raíz de composición                                                | El puerto nuevo sigue el interruptor que ya existía              | —                                                                        | —                                                | Nest inyecta por `ACTIVIDAD_POR_VIVIENDA`                             |
| `actividad-por-vivienda.tsx`           | Una tarjeta; los filtros, un subcomponente; la consulta, un `hook` | Otra columna es una entrada más en `COLUMNAS`                    | —                                                                        | Recibe sólo `copropiedadId`                      | Usa el cliente generado, nunca una URL escrita a mano                 |
| Pruebas (4 ficheros)                   | Una suite por capa: caso de uso, base, HTTP, consola               | —                                                                | La e2e corre con el doble; la Pg con la base; mismas aserciones de forma | —                                                | —                                                                     |

Ningún fichero nuevo pasa de 300 líneas; ninguna clase nueva tiene más de
cinco métodos públicos; los ficheros que ya pasaban de 300 no crecen.

## 5 · Trazabilidad

| Elemento                      | Cómo lo cubre esta ronda                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| **D-Z3** (encargo 2026-10-13) | La tabla por vivienda en Portería y en el tablero del superadministrador, con los dos recuentos       |
| **HU-21, HU-38**              | Lo que el portero ve antes de atender; una tarjeta más del tablero operativo                          |
| **RN-02, RN-15, CA-24**       | Sólo lectura del histórico; aislamiento por `exigirAlcance` y por RLS; ajena 404; la ruta en la suite |
| **RN-21**                     | Ninguna credencial ni dato de persona en la respuesta (la prueba e2e enumera las claves)              |
| **§2.4 (sin N+1, reloj)**     | Una sentencia por copropiedad, contada; el instante es del reloj inyectado                            |
| **§2.7.4**                    | Todo parametrizado: el instante y la copropiedad son parámetros, nada se concatena                    |
| **Parcial**                   | «Visitante dentro» exacto: **no** sin salida reportada por los equipos (P-41)                         |

## 6 · Pruebas

**Cómo se ejecutan:** `pnpm --filter @ncr/api exec vitest run src/tablero`
(caso de uso, 4 + las 11 del tablero), `pnpm --filter @ncr/api exec vitest run
test/actividad-por-vivienda-pg.test.ts` (6, con `DATABASE_URL_PRUEBAS`),
`pnpm --filter @ncr/api exec vitest run test/actividad-por-vivienda.e2e.test.ts
test/tablero.e2e.test.ts test/aislamiento.e2e.test.ts` (3 + 50), `pnpm
--filter @ncr/web exec vitest run src/componentes/actividad-por-vivienda.test.tsx`
(8).

**Visto fallar antes de corregir:**

- `actividad-por-vivienda.test.ts` (caso de uso) y
  `actividad-por-vivienda.test.tsx` (consola): escritos antes del módulo, la
  primera corrida cae por «no se resuelve el módulo»; luego 4/4 y 8/8.
- `actividad-por-vivienda-pg.test.ts`: la primera corrida cayó **seis de
  seis**, por dos cosas del esquema y no del criterio: el disparador RN-05
  (0013) exige que quien autoriza sea titular de ESA vivienda, y
  `viviendas.estado` es `activo`, no `activa`. La fixture monta persona y
  titular por vivienda; la consulta usa `activo`. Después, 5/6: el código
  corto de la copropiedad de las 500 viviendas no cumplía su formato. 6/6.
- Los dos inventarios de rutas del tablero (`tablero.e2e`, `aislamiento.e2e`)
  cayeron con la cuarta ruta: es su función. Pasan con la lista de cuatro.

**Los límites (contra la base, con el instante inyectado):**

| Caso                           | Resultado                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| Vigencia que vence este minuto | Un segundo antes: 1 visitante, 1 vehículo; en el instante exacto (`[)`): 0; antes del ingreso: 0 |
| Salida registrada              | Entre ingreso y salida: 1; después de la salida: 0; tras un segundo ingreso: 1                   |
| Dos visitantes, uno con placa  | 2 visitantes, 1 vehículo                                                                         |
| Vivienda sin actividad         | Sale con `{0, 0}`, con su identificador y `agrupacion: null`                                     |
| Otra copropiedad               | La vivienda de B no sale al consultar A, ni la de A al consultar B                               |
| Copropiedad inexistente        | `null` (404 en la API), no una lista vacía                                                       |
| 500 viviendas                  | 500 filas y exactamente `['BEGIN', 'SELECT', 'WITH', 'COMMIT']` por el cliente                   |

**Resultado local (antes del verificador):** API `src/tablero` 15/15; Pg
6/6; e2e 53/53 (aislamiento + tablero) y 3/3; consola 8/8; `flutter analyze`
sin avisos con el cliente regenerado; `tsc` y `eslint` limpios.

**Verificador (§2.8.0), la corrida que cierra (sobre `3af2c9b`, 06:16 → 07:06 UTC, base del puerto 55432):** 31 de 31 pasos; 577 de 577 ficheros de prueba recogidos; 5701 pruebas por los dos caminos (turbo y vitest directo) con el mismo resultado; cobertura por capa: dominio 96,46 % de líneas (ramas 96,55 %), aplicación 97,76 % (ramas 91,70 %), global 88,59 % (ramas 87,49 %); 1 paso declarado no ejercido, preexistente y con motivo.

**Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0):**

**Las corridas, todas, en orden:**

1. **Primera** (sobre `8e67ba9`, 03:46 → 04:33 UTC, base del puerto 55432): **`VERIFICACIÓN DE ETAPA: FALLIDA — NO se cierra la etapa`**, 31 de 31 pasos, un solo rojo: el paso 13b («pantallas sin códigos del proyecto») porque el criterio de actividad decía «(P-41)» en el texto que la pantalla enseña. Se corrigió en `3af2c9b` (el criterio sin código; la prueba e2e exige que no lleve ninguno).
2. **Segunda, abortada en el paso 1c** (04:50 UTC): las dos bases de pruebas estaban caídas tras un reinicio del contenedor; se arrancaron y se relanzó. Fallo de entorno, no de la etapa.
3. **Segunda bis, contaminada** (04:53 y 04:54 UTC): por error mío quedaron DOS verificadores corriendo a la vez en el mismo árbol; el paso 7 salió «CORRIDA INTERRUMPIDA» en tres paquetes. Se mataron los dos y se relanzó uno.
4. **Tercera** (sobre `3af2c9b`, 05:22 → 06:15 UTC): **`VERIFICACIÓN DE ETAPA: FALLIDA — NO se cierra la etapa`** por el paso 14: la corrida 1 de 3 cayó en la prueba REAL de go2rtc y ffmpeg (`puente-go2rtc-transcodificado.real.test.ts`: «el puente tiene apagado su RTSP interno»); las corridas 2 y 3, verdes. Mientras corría ese paso yo tenía en paralelo el recorrido de la 15-Y3 compilando la API y la consola y arrancando otra API: carga y puertos ajenos a esta etapa. Fallo de entorno por mi concurrencia; se relanzó con nada más corriendo.
5. **Cuarta, la que cierra** (sobre `3af2c9b`, base del puerto 55432, sin ningún otro proceso en la máquina):

**`VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe`**

## 7 · Verificación de seguridad (§2.7)

| Medida               | Cómo queda                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Secretos             | Ninguno; sin variables nuevas                                                                                       |
| CORS, CSP            | Sin cambio; la tarjeta no carga nada externo                                                                        |
| Validación           | `ParseUUIDPipe` en la ruta; sin cuerpo (GET)                                                                        |
| SQL                  | Una sentencia parametrizada (`$1` copropiedad, `$2` instante); nada concatenado                                     |
| Rate limiting        | El global; es una lectura, no una ruta de escritura                                                                 |
| RLS, los dos caminos | Claims de servicio por copropiedad en la transacción; `exigirAlcance` antes; probado ajena ↔ propia contra la base |
| RBAC                 | Por decorador; residente y central 403 (prueba); IDOR → 404 (ajena y desconocida indistinguibles)                   |
| Datos personales     | Sólo recuentos; la prueba e2e enumera las claves de la fila                                                         |

## 8 · Hallazgos, deuda, supuestos y pendientes

- **P-41 (nueva)** · qué significa «visitante en este momento» cuando los
  equipos no reportan la salida. Conservador: cuenta hasta que vence la visita.
- **S-15Z3-01** · el operador de central no ve la actividad por vivienda.
- Sin deuda de código nueva. El adaptador del tablero (`repositorio-tablero-pg.ts`, 305) sigue por encima de 300 y sin crecer; el nuevo adaptador repite su
  forma de transacción (15 líneas) en vez de tocarlo.
- **Durante esta ronda, en la 15-Z2:** su verificador cayó en el recorrido web
  de la app (la fixture del guardarropa servía vehículos sin `origen`, que
  el DTO generado ya exige); se corrigió en la 15-Z2, no aquí.

## 9 · Qué debe hacer el usuario manualmente

1. Nada en Supabase: no hay migración.
2. Tras fusionar (después de la 15-Z2), abrir **Portería** como portero y el
   **tablero** como superadministrador con una copropiedad elegida: la tarjeta
   «Actividad por vivienda» aparece debajo, con el criterio al pie.
3. Decidir **P-41**: qué equipos reportan salida y si un visitante sin salida
   debe dejar de contar al cabo de un tiempo.

## 10 · Rama y commits

`etapa-15z3-actividad-por-vivienda`, desde `etapa-15z2-ux-y-errores` (la
contiene). PR hacia `develop`, sin fusionar; fusionar DESPUÉS del PR de la
15-Z2, con merge commit. La rama se rebasó sobre el cierre de la 15-Z2 antes
de su primer push (no tenía PR).

| Commit    | Qué                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `c034b7d` | Puerto, caso de uso con reloj, adaptador SQL de una sentencia, doble, ruta, DTOs; pruebas unitarias, Pg y e2e; los dos inventarios |
| `51d4a62` | Tarjeta «Actividad por vivienda» en Portería y en el tablero, con sus pruebas; manual; alias del contrato                          |
| `8e67ba9` | Contrato y clientes TS y Dart regenerados                                                                                          |
| `3af2c9b` | `fix(etapa-15z3/tablero)` — el criterio de actividad no lleva códigos del proyecto en el texto que la pantalla enseña              |
| cierre    | `chore(etapa-15z3): cierre de etapa` — informe, ficha y registro                                                                   |
