# ETAPA 15-J · El patrón recurrente en la hora de la copropiedad

**Rama:** `etapa-15j-patron-en-hora-local` · **Base:** `develop` (`a7b7dc0`, con el PR #31)
**Alcance:** corrección acotada de **H-15I-05**, verificado. No cambia el estado
de la ETAPA 15, que sigue **BLOQUEADA sólo por `BE-02`**.

Esta corrección **no se fusiona**: abre PR contra `develop` y se detiene.

---

## 1 · Qué se corrigió

`patrones_recurrencia.hora_inicio` y `hora_fin` guardan la franja en **hora
local** de la copropiedad; lo dice el COMMENT de la migración 0006. Las dos
lecturas de `repositorio-autorizaciones-pg.ts` reconstruían el patrón con
`desplazamientoUtcMinutos: 0`, y el motor lo consume por `CargadorDeContextoPg`.
Consecuencia: **toda** recurrente creada desde la consola se evaluaba
desplazada. En Bogotá, una franja de 14:00 a 18:00 abría de 09:00 a 13:00, y
desde las 19:00 locales el día de la semana ya era el siguiente.

Ahora las dos lecturas traen `copropiedades.zona_horaria` en su misma consulta,
y el desplazamiento se calcula en infraestructura con `Intl`, para el instante
del `Reloj` inyectado. Las filas ya escritas se evalúan bien tal como están,
sin migración.

## 2 · Cómo se organizó y por qué

**El desplazamiento se calcula al leer, no se guarda.** El parche que proponía
el informe 15-I (§8) añadía una columna con el desplazamiento del navegador.
Tenía dos defectos:

- dejaba mal todas las filas existentes, con 0 por omisión;
- congelaba un número que, en las zonas con horario de verano, depende de la
  fecha.

La franja ya está en hora local. Lo único que faltaba era saber de **qué** zona,
y ese dato vive en `copropiedades.zona_horaria`.

**Con el `Reloj` inyectado, nunca con el del proceso.** El repositorio recibe
el mismo `RELOJ` que usa el motor (`autorizaciones.module.ts`). El
desplazamiento de Bogotá es −300 todo el año, pero el de Nueva York o Madrid
cambia con la fecha. Calcularlo con `new Date()` o con el `now()` de SQL haría
que una prueba con reloj fijo, o una decisión cerca del cambio de hora,
evaluara con un desplazamiento distinto del instante que decide.

**En la misma consulta: sin N+1.** Las dos consultas ganan un
`JOIN public.copropiedades` y devuelven `zona_horaria`. `activasParaLectura`,
que es la que usa el motor en cada lectura de placa, sigue siendo **una sola
sentencia**.

**El desplazamiento del cliente no decide nada.** La escritura sigue guardando
hora local, y el desplazamiento que mandan el navegador o el teléfono se valida
y se descarta. Queda documentado en los dos DTO y en el contrato. Las pruebas
mandan a propósito un desplazamiento absurdo (+120): si decidiera algo, se
vería. Ningún ADR de 025 a 028 mencionaba el desplazamiento, así que no hubo
nada que corregir allí.

**Un patrón ilegible niega.** Antes, si la reconstrucción del patrón fallaba,
quedaba `patron = null`, que es una autorización **sin restricción horaria**:
un fallo abierto, latente porque con desplazamiento 0 no podía ocurrir. Con
desplazamiento real hay un modo de fallo nuevo: una zona que el ICU de Node no
resuelva. En ese caso, o si la franja no es válida, la autorización **no se
entrega** y el motor niega (§2.1.4).

**H-15I-06 sigue cerrada, y por qué.** El encargo pedía quitar la guarda si era
lo único que impedía la recurrente desde la app. No lo es:
`residente/infraestructura/autorizaciones-pg.ts` inserta la autorización como
`recurrente` y **no escribe sus filas de `patrones_recurrencia`**. El disparador
diferido `tg_recurrente_con_patron` (0013) la rechazaría al confirmar, así que
sin la guarda la app recibiría un 500 en lugar de un rechazo tipado. Se reporta
como **H-15J-01** y la guarda se queda, con su comentario actualizado. No hace
falta tocar pantallas: la app ya envía el patrón.

**Lo que no se tocó:** `packages/domain-core`, el motor y
`CargadorDeContextoPg`, con cero cambios. Tampoco las migraciones.

## 3 · Árbol de archivos

```
apps/api/src/autorizaciones/
  infraestructura/desplazamiento-de-zona.ts        NUEVO · desplazamiento de una zona IANA en un instante (Intl), null si no se resuelve
  infraestructura/desplazamiento-de-zona.test.ts   NUEVO · Bogotá, horario de verano, media hora, zona inexistente
  infraestructura/repositorio-autorizaciones-pg.ts las dos lecturas con zona_horaria y Reloj; patrón ilegible → no se entrega
  autorizaciones.module.ts                          inyecta RELOJ en el repositorio
  presentacion/dtos-autorizacion.ts                 el desplazamiento del cliente, documentado como informativo
apps/api/src/residente/
  presentacion/dtos.ts                              ídem para la app
  aplicacion/crear-mi-autorizacion.ts               sólo el comentario de la guarda H-15I-06 (sigue cerrada)
apps/api/test/
  patron-en-hora-local-pg.test.ts                   NUEVO · los tres casos pedidos contra PostgreSQL real
  autorizaciones-pg.test.ts, cargador-contexto-pg.test.ts, padron-edicion-pg.test.ts   pasan el reloj al repositorio
packages/contracts/, apps/mobile/lib/infraestructura/api/generado/   regenerados (sólo descripciones)
docs/   ESTADO_ETAPAS.md, ETAPA-15-I, ENSAYO_PREVIO_EN_SITIO.md y este informe
```

## 4 · Tabla SOLID

| Principio | Cumplimiento                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SRP**   | La traducción zona → desplazamiento es una función aparte, con su prueba; el repositorio sólo la usa. `patronDesde` concentra la reconstrucción que antes estaba repetida dos veces |
| **OCP**   | El dominio no cambia: `PatronRecurrencia` ya recibía el desplazamiento; sólo cambia quién lo calcula                                                                                |
| **LSP**   | El repositorio sigue cumpliendo el mismo puerto; el cargador y el motor no notan la diferencia                                                                                      |
| **ISP**   | Sin puertos nuevos: el repositorio depende de `Reloj`, que ya existía                                                                                                               |
| **DIP**   | El reloj se inyecta por token (`RELOJ`); ni el dominio ni el cargador saben de `Intl` ni de zonas IANA                                                                              |

**Ficheros por encima de 300 líneas.** `repositorio-autorizaciones-pg.ts` ya
los superaba (638) y ahora tiene 671: son las 33 líneas netas de `patronDesde` y su
explicación. Se declara como deuda en §8.

## 5 · Trazabilidad

| Requisito            | Cubierto                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **RN-22**, **CA-06** | La recurrente se evalúa en la hora de la copropiedad: `FUERA_DE_PATRON` fuera de la franja local y `PERMITIDO` dentro        |
| **HU-08**, **HU-09** | Recurrentes creadas desde la consola; **parcial** desde la app: sigue cerrada por H-15J-01                                   |
| **RN-15**            | La zona se lee por `a.copropiedad_id`, la de la propia autorización: no hay forma de evaluar con la zona de otra copropiedad |

## 6 · Pruebas

**El rojo, sin la corrección.** Es la suite nueva contra el repositorio de
`develop` (`a7b7dc0`). Para reproducirlo:
`git checkout a7b7dc0 -- apps/api/src/autorizaciones/infraestructura/repositorio-autorizaciones-pg.ts`
y después `pnpm --filter @ncr/api exec vitest run test/patron-en-hora-local-pg.test.ts`.

```
✓ la base de pruebas contesta y la copropiedad está en America/Bogota
✓ recurrente L-V de 14:00 a 18:00, creada desde la consola > se guarda en HORA LOCAL: ni el desplazamiento del navegador ni UTC tocan la fila
× recurrente L-V de 14:00 a 18:00, creada desde la consola > lunes 15:00 en Bogotá → PERMITIDO
→ expected 'FUERA_DE_PATRON' to be 'PERMITIDO' // Object.is equality
× recurrente L-V de 14:00 a 18:00, creada desde la consola > lunes 10:00 en Bogotá → FUERA_DE_PATRON (antes de la corrección, abría: son las 15:00 UTC)
→ expected 'PERMITIDO' to be 'FUERA_DE_PATRON' // Object.is equality
✓ recurrente L-V de 14:00 a 18:00, creada desde la consola > lunes 18:01 en Bogotá → FUERA_DE_PATRON
× recurrente L-V de 14:00 a 18:00, creada desde la consola > la otra lectura (`porId`) rehidrata con el desplazamiento de la ZONA, no con el del navegador
→ expected +0 to be -300 // Object.is equality
× sólo lunes, de 19:00 a 21:00: a las 20:00 locales ya es MARTES en UTC > lunes 20:00 en Bogotá → PERMITIDO
→ expected 'FUERA_DE_PATRON' to be 'PERMITIDO' // Object.is equality
✓ sólo lunes, de 19:00 a 21:00: a las 20:00 locales ya es MARTES en UTC > martes 20:00 en Bogotá → FUERA_DE_PATRON
× una fila escrita ANTES de la corrección se evalúa bien sin migración > se inserta como la escribía el adaptador —hora local, sin columna nueva— y decide en hora local
→ expected 'FUERA_DE_PATRON' to be 'PERMITIDO' // Object.is equality
Tests  5 failed | 4 passed (9)
```

**El verde, con la corrección:**

```
✓ la base de pruebas contesta y la copropiedad está en America/Bogota
✓ recurrente L-V de 14:00 a 18:00, creada desde la consola > se guarda en HORA LOCAL: ni el desplazamiento del navegador ni UTC tocan la fila
✓ recurrente L-V de 14:00 a 18:00, creada desde la consola > lunes 15:00 en Bogotá → PERMITIDO
✓ recurrente L-V de 14:00 a 18:00, creada desde la consola > lunes 10:00 en Bogotá → FUERA_DE_PATRON (antes de la corrección, abría: son las 15:00 UTC)
✓ recurrente L-V de 14:00 a 18:00, creada desde la consola > lunes 18:01 en Bogotá → FUERA_DE_PATRON
✓ recurrente L-V de 14:00 a 18:00, creada desde la consola > la otra lectura (`porId`) rehidrata con el desplazamiento de la ZONA, no con el del navegador
✓ sólo lunes, de 19:00 a 21:00: a las 20:00 locales ya es MARTES en UTC > lunes 20:00 en Bogotá → PERMITIDO
✓ sólo lunes, de 19:00 a 21:00: a las 20:00 locales ya es MARTES en UTC > martes 20:00 en Bogotá → FUERA_DE_PATRON
✓ una fila escrita ANTES de la corrección se evalúa bien sin migración > se inserta como la escribía el adaptador —hora local, sin columna nueva— y decide en hora local
Tests  9 passed (9)
```

Además, la prueba unitaria `desplazamiento-de-zona.test.ts` cubre Bogotá, los
dos lados del horario de verano (Nueva York, Madrid), media hora (Kolkata),
UTC, el filo de la medianoche y una zona inexistente. Las tres suites `-pg` que
construyen el repositorio siguen en verde.

### El veredicto literal de `./scripts/verificar-etapa.sh --con-base`

Una sola corrida, sobre `0fe32c5`, con la base efímera migrada hasta la 0038 y
sembrada, Flutter en el PATH y el Chromium del entorno. **26 de 26 pasos, sin
una sola ✗.** Se omiten los pasos 0 a 4, 5b, 5d, 5e, 8, 10, 10b y 11, todos en
✓, y el detalle de las cinco pruebas saltadas declaradas:

```
▸ 5 · suite completa
   @ncr/config:test:       Tests  144 passed (144)
   @ncr/edge:test:       Tests  101 passed (101)
   @ncr/domain-core:test:       Tests  425 passed (425)
   @ncr/providers:test:       Tests  629 passed (629)
   @ncr/web:test:       Tests  486 passed (486)
   @ncr/api:test:       Tests  1260 passed | 5 skipped (1265)
   ⚠ suite sin rojas · las saltadas están DECLARADAS y se ejercen en otro paso
       las 5 están DECLARADAS y se ejercen en otro paso
▸ 5c · app móvil: suite de Dart y cobertura POR CAPA
   00:26 +209: All tests passed!
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
   ✓ 240 de 240 ficheros de prueba ejecutados
▸ 7 · umbrales de cobertura por capa (§2.4)
     OK   dominio (packages/domain-core/src): lineas 96.05 % · ramas 96.80 % · funciones 95.93 % (umbral 90 %, 39 archivos)
     OK   aplicacion (**/aplicacion/**): lineas 95.80 % · ramas 86.94 % · funciones 98.32 % (umbral 90 %, 75 archivos)
     OK   global: lineas 82.33 % · ramas 84.36 % · funciones 82.39 % (umbral 70 %, 543 archivos)
   ✓ las tres capas cumplen su umbral
▸ 7b · los dos recuentos de la MISMA suite coinciden (D-112)
   ✓ recuentos: 6 paquete(s) con el mismo resultado por los dos caminos (turbo y vitest directo) · 3050 pruebas
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

Las 5 saltadas de `@ncr/api` en el paso 5 son las del arranque en frío: el paso
12b las ejecuta y exige que no se salten. En el paso 14, sin caché, corren las 1265. El control declarado no ejercido es de otra plataforma: el propio
verificador dice «0 de ellos en linux».

## 7 · Verificación de seguridad (§2.7)

| Medida            | En esta corrección                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3 · Validación    | El DTO sigue acotando el desplazamiento del cliente (±840) aunque ya no decida; la verdad la pone la base                                              |
| 4 · Inyección SQL | El JOIN nuevo no añade parámetros; todo sigue parametrizado                                                                                            |
| 6 · RLS           | Misma conexión y mismos claims que ya leían `autorizaciones`; la zona sale de la copropiedad de la propia fila                                         |
| §2.1.4            | Zona irresoluble o franja inválida → la autorización no se entrega y el motor niega. Antes, un patrón no reconstruible quedaba sin restricción horaria |

## 8 · Deuda técnica, supuestos y pendientes

- **H-15J-01** · el adaptador del residente crea la recurrente sin escribir
  sus filas de patrón, así que la guarda H-15I-06 sigue siendo necesaria.
  Arreglo: escribir en `residente/infraestructura/autorizaciones-pg.ts` las
  filas de `patrones_recurrencia` en hora local, dentro de la misma
  transacción, como hace el repositorio de la consola; retirar la guarda; y
  añadir una prueba `-pg` desde la ruta de la app. Tamaño: **pequeño**. Sin
  pantallas. **No se corrige aquí:** está fuera de lo encargado.
- **H-15J-02** · observación, no defecto: `repositorio-zonas-pg.ts` resuelve el
  desplazamiento del horario de zona con el `now()` de SQL, no con el `Reloj`
  inyectado. En Bogotá, que no tiene horario de verano, no hay efecto. En una
  zona con horario de verano, una evaluación cerca del cambio de hora podría
  usar el desplazamiento anterior. No se toca.
- **DT-15J-01** · `repositorio-autorizaciones-pg.ts` sigue por encima de las
  300 líneas de §2.3: tenía 638 y ahora tiene 671. La partición (lecturas por
  un lado, escritura por otro) es pequeña y mecánica.
- **Rama ILEGIBLE sin prueba contra base.** La base sólo admite zonas que
  PostgreSQL conoce, así que no hay forma de sembrar una zona que el ICU de
  Node no resuelva. El caso `null` está cubierto en la prueba unitaria del
  helper; la rama del repositorio que lo consume, no.
- **`[SUPUESTO]`:** ninguno nuevo. **`PENDIENTE DE DEFINICIÓN`:** ninguno nuevo.

## 9 · Qué debe hacer el usuario manualmente

1. Revisar y fusionar el PR contra `develop`. **No hay migración.**
2. Nada más: las recurrentes ya guardadas se evalúan bien desde el primer
   arranque de la API corregida.

## 10 · Rama y commits

**Rama:** `etapa-15j-patron-en-hora-local`, sacada de `origin/develop` (`a7b7dc0`). PR contra `develop`, abierto y **sin fusionar**.

| Commit     | Qué trae                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `d97d5dc`  | `fix(etapa-15j/autorizaciones)`: el patrón guardado en hora local se evalúa con la zona de la copropiedad (H-15I-05) |
| `6113f3a`  | `chore(etapa-15j/contratos)`: OpenAPI y clientes con el desplazamiento del cliente documentado como informativo      |
| `0fe32c5`  | `docs(etapa-15j/estado)`: H-15I-05 cerrado en ESTADO, el informe 15-I y el ensayo; H-15J-01 reportado                |
| _(cierre)_ | `chore(etapa-15j)`: este informe con el veredicto literal                                                            |
