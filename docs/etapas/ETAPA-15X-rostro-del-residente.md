# RONDA 15-X · Rostro del residente

**Rama:** `etapa-15x-rostro-del-residente` · **Base:** `develop` (`8ee5cd9`, merge del PR #51) ·
**PR:** hacia `develop`, sin fusionar · **Fecha:** 2026-10-07 ·
**Decisiones del cliente que aplica:** D-W3 y D-W4 (extensión **E-08**, [ADR-039](../decisiones/ADR-039-rostro-del-residente-y-del-menor.md)) ·
**Corrige además:** el «Permiso vencido» de la terminal facial del 06/10 (D0)

> **Esta ronda NO cierra la ETAPA 15, que sigue BLOQUEADA sólo por `BE-02`.**
> La migración 0057 no se ha aplicado al proyecto Supabase real: la aplica usted
> (§9). **Nada de lo nuevo se ha ejercido contra la terminal ni contra un
> teléfono real**: todo lo que este informe da por probado lo está contra
> PostgreSQL, el doble de la terminal y el navegador.

**Lo incómodo primero.**

1. **En producción, un residente con iPhone no puede registrar su rostro.** El
   iPhone sólo tiene la consola instalada (P-23), y la consola del residente no
   tiene nada del rostro hasta la 15-Y (DT-15X-01). El encargo lo pedía en la
   app, y en la app está; el iPhone de sus pruebas lleva una compilación de
   desarrollo, no la de producción.
2. **Que el titular es el representante legal del menor, y la edad del menor,
   los declara el hogar; nadie los verifica.** El sistema exige las dos
   declaraciones, anota quién las hizo, cuándo y sobre qué versión del texto, y
   calcula la edad con la fecha de nacimiento que el hogar registró en la 15-W.
   Es la prueba que pide la Ley 1581, no una comprobación de identidad: una
   fecha falsa deja registrar el rostro de un menor de 14 años.
3. **Las dos políticas del rostro son provisionales** (**P-39**: versiones
   `rostro-2026-10-provisional-1` y `rostro-menor-2026-10-provisional-1`).
   Renovar después de un cambio de versión reutiliza el consentimiento con la
   versión anterior; la versión nueva queda sólo en la bitácora (DT-15X-05).
4. **`ConsentimientoBiometrico` pasa de 9 a 11 métodos públicos** (§2.3 pide 5
   como máximo). Son métodos de intención del agregado —autorizar y revocar como
   representante legal—; partirlo rompería su frontera de consistencia. Queda
   declarado en DT-15X-04, con los demás ficheros que ya pasaban de 300 líneas y
   crecen.
5. **Cinco defectos míos aparecieron después de dar por hechos sus bloques, y
   los cinco están corregidos con una prueba que los ve fallar:**
   - la invitación a registrar el rostro sólo salía justo después del alta, y
     quien ya tenía cuenta no la veía nunca (`673649f`);
   - los textos de la ficha del menor no eran los del encargo (`673649f`);
   - la prueba con base del menor no tenía el nombre ni los casos del encargo:
     15 años cumplidos y la casilla que falta (`825c92b`);
   - **la baja de una cuenta dejaba su rostro seis horas en la terminal**
     (`8aacdcd`): el mismo defecto que D3 cerró para el menor, visto al escribir
     el ciclo de vida biométrico;
   - **con una política nueva, la casilla «Leí y acepto» seguía marcada**, y un
     segundo toque aceptaba un texto que nadie había leído (`b75b652`). Lo
     encontré al escribir en el manual «léala y vuelva a aceptarla».
6. **D0 está probado contra el doble de la terminal, no contra la
   DS-K1T344MBFWX-E1.** El margen de 300 s explica el 5/8 del 06/10 por el
   reloj atrasado del equipo, pero hasta repetir la prueba en sitio es
   [Probable], no [Cierto] (§«Pruebas en sitio»).
7. **Un menor que fue visitante con rostro no puede tener la autorización del
   representante mientras su consentimiento de visita siga vigente** (409,
   DT-15X-06). Y la autorización del representante no caduca sola a los 18: una
   captura de visita podría reutilizarla (DT-15X-08).

---

## 1 · Qué se construyó

**El «Permiso vencido» del 06/10 (D0).** La DS-K1T344MBFWX-E1 contestó 5/8 a
quien llegaba a su hora. La terminal juzga la vigencia con SU reloj antes de
preguntar, y el inicio que se le escribía era el minuto exacto que eligió el
teléfono o el navegador: con el reloj del equipo algo atrasado —la compuerta de
altas lo admite hasta un tope—, el inicio caía en su futuro. Ahora el inicio se
escribe 300 s antes, ajustable por equipo, y el fin no cambia. Con la terminal
en `reporta_y_espera` el margen no abre nada: decide la plataforma con la
vigencia verdadera. La ficha del equipo juzga su reloj con la misma función que
la compuerta de altas; antes, con una hora sin zona, inventaba cinco horas de
desvío en un servidor en UTC.

**El rostro de quien vive en el conjunto decide (D1).** Hasta aquí, un acceso
facial de un residente salía `FALLO_TECNICO` en la nube y en el Edge: el derecho
del residente sólo se derivaba de un vehículo. Ahora, para un acceso facial con
persona, el motor recibe el derecho del residente **por persona** —la misma
autorización sintética que la del vehículo, vigente hasta la baja—. La nube y la
instantánea del Edge lo leen con la misma sentencia y lo componen con la misma
función, así que deciden igual. La precedencia no cambia y, sin consentimiento
vigente, el motivo es `SIN_CONSENTIMIENTO`.

**La base sostiene un rostro vivo por persona (0057).** Índice único parcial
sobre las plantillas de residente vivas; una aserción previa que se niega a
elegir cuál sobra si ya hay dos; el tercer origen del consentimiento, el del
representante legal, con autor obligatorio; y los cuatro hechos del rostro en la
bitácora de residentes.

**«Mi rostro» (D2).** El adulto con cuenta registra, renueva y retira su rostro
desde la app. La persona sale de su cuenta, nunca del cuerpo de la petición;
acepta la política vigente con su versión; la foto se juzga por su tipo real y
por su tamaño antes de decodificarla, y se aceptan cinco capturas en 24 horas
por cuenta, contadas en la base. Vence al año y se avisa 30 días antes. Registrar
de nuevo reemplaza el anterior en una sola transacción y lo saca de los equipos
en el acto; retirarlo revoca y suprime, también en los equipos. El primer
ingreso lo ofrece con «Ahora no», recordado por cuenta en el llavero del
teléfono, y nunca bloquea la entrada.

**El rostro de un menor de 15 a 17 años (D3).** Lo registra sólo el titular del
hogar, como su representante legal, con dos declaraciones: que lo representa y
que el menor está informado y de acuerdo. Otro adulto del hogar recibe 403, y el
menor de otra vivienda o un adulto con cuenta, 404, filtrado en el propio SQL.
Vence al año o al cumplir 18, lo que llegue antes. En la app, la ficha del menor
ofrece «Registrar rostro» al titular y explica a los demás por qué no.

**Y dos correcciones posteriores a sus bloques:** la baja de una cuenta, como la
de un menor, saca su rostro de los equipos en el acto; y una política nueva
desmarca la aceptación y las declaraciones antes de volver a registrar.

## 2 · Cómo se organizó y por qué

- **El residente pone la puerta; la biometría toca plantillas, bóveda y
  equipos.** El módulo del residente decide quién es la persona, qué política
  rige, si la foto sirve y si queda cupo; luego llama a `RostroDeResidente`,
  que sale del barril de la biometría. El residente no inyecta repositorios de
  plantillas ni la bóveda: la frontera de §2.2 sigue cerrada.
- **Una sola preparación para la visita y para el residente.**
  `PreparacionDeCaptura` sale de `CapturarRostro` y la usan los dos caminos:
  calidad → consentimiento → plantilla. El consentimiento cambia de origen —el
  del titular, la casilla de quien registra o el representante—; la calidad y
  la plantilla son las mismas.
- **Un rostro vivo por persona lo decide la base** (ADR-04, D-15X-01). El
  reemplazo es una transacción: el consentimiento, la anterior a
  `pendiente_supresion` con un `UPDATE` optimista y la nueva. De dos registros a
  la vez, uno gana y el otro recibe 409 sin dejar un consentimiento vigente
  huérfano. Primero fallaba con 500: lo vio la prueba de las dos primeras
  capturas antes de comprometer D2.
- **La persona sale del vínculo de la cuenta.** `titularId`, `personaId`,
  `suprimirEn` o `estado` en el cuerpo dan 400. En D3, el `:residenteId` de la
  ruta sólo elige entre los menores de la vivienda del ámbito, y el filtro está
  en el SQL.
- **El derecho por persona, con la misma sentencia y la misma función en la
  nube y en el Edge.** Es lo que hace que la decisión sea igual en los dos
  sitios (RN-16), y la prueba de paridad lo compara con base y sin ella.
- **El margen de D0 va en la terminal, no en la vigencia.** La autorización
  sigue diciendo la hora verdadera y la plataforma decide con ella; sólo lo que
  se escribe en el equipo se adelanta (`[SUPUESTO]` S-15X-01).
- **El representante legal es un origen del consentimiento, no una
  delegación** (C-64, D-15X-02). `revocar()` sigue siendo sólo del titular; el
  representante tiene sus dos métodos con su nombre, y la prueba de nombres
  prohibidos mira ahora también los estáticos.
- **La supresión inmediata es un caso de uso propio** (`SuprimirYRetirarYa`):
  el reemplazo, el retiro sin consentimiento que revocar, la baja de un menor y
  la de una cuenta suprimen y retiran equipo por equipo en el acto. El equipo
  que no responde queda en la cola de CA-10. `SuprimirPlantillasDeTitular`, que
  dejaba la retirada al barrido de 6 h, se borra (C-63).
- **Sin conexión no hay rostro.** La foto no entra en la bandeja de salida de
  la app, y la copia que el selector deja en la carpeta temporal se borra al
  leerla (`[SUPUESTO]` S-15X-03): un rostro esperando en el teléfono es lo que la
  minimización de la Ley 1581 pide no tener.
- **Una pantalla para los dos rostros.** «Mi rostro» recibe sus textos
  (`TextosDelRostro`): el del menor añade el nombre y las dos casillas del
  representante. La lógica no se duplica.
- **Los ficheros vigilados no crecen:** `biometria/aplicacion/casos-de-uso.ts`
  516 → 341; `mi.controller.ts` (283), `puertos-hogar.ts` (273) y
  `padron/aplicacion/casos-de-uso.ts` (577), sin cambios. Lo nuevo va en
  ficheros nuevos y en raíces de composición aparte (`rostro.providers.ts` de la
  biometría y del residente).
- **Sin caché.** Las rutas del rostro contestan `Cache-Control: no-store`, y el
  derecho, el ámbito, la edad y el cupo se leen en cada petición.

## 3 · Árbol de archivos

Entre paréntesis, las líneas de cada fichero al cierre.

**Base de datos.**

- `supabase/migrations/20261008120000_0057_rostro_del_residente.sql` (104) — aserción previa, `plantillas_residente_viva_uk`, el origen del representante con autor y los hechos del rostro.
- `supabase/reversion/0057_revert.sql` (75) — con confirmación; no revierte con autorizaciones de representante vivas, ni borra historia.
- `supabase/policies/tests/99m_rostro_del_residente.sql` (237) — índice, reemplazo, autor, RLS y bitácora, en una transacción que se deshace.
- `supabase/policies/tests/99m_asercion_previa_0057.sh` (91) — aplica el FICHERO de la migración con dos rostros vivos (se detiene) y con uno (entra).
- `supabase/policies/tests/100_consentimiento_declarado.sql` (106) — sólo sus comentarios: el origen admite tres valores desde la 0057.

**Dominio** (`packages/domain-core`).

- `biometria/consentimiento.ts` (351 → 361) — `autorizarComoRepresentanteLegal` y `revocarComoRepresentanteLegal`; `revocar()` sigue siendo del titular.
- `biometria/consentimiento-datos.ts` (104, nuevo) — los datos del agregado, fuera de su fichero.
- `biometria/consentimiento-representante.test.ts` (145, nuevo) — 12 pruebas del representante.
- `residente/edad.ts` (137) y `edad.test.ts` (134) — `EDAD_MINIMA_ROSTRO_MENOR`, `aptitudDelRostroDeMenor` y `cumpleMayoriaEn` (00:00 de Bogotá).

**Terminal (D0)** (`packages/providers`).

- `terminal/persona-en-el-equipo.ts` (180) — `MARGEN_DE_INICIO_S` = 300 s, ajustable por equipo.
- `diagnostico/diagnostico-de-equipo.ts` (491 → 498) — la ficha juzga el reloj con `desvioDelReloj`.
- `terminal/margen-de-inicio-15x.test.ts` (106) y `diagnostico/hora-sin-zona-15x.test.ts` (72), nuevas.

**Motor y Edge (D1).**

- `apps/api/src/autorizaciones/aplicacion/derecho-del-residente.ts` (76) — `derechoDelResidentePorPersona`.
- `…/aplicacion/residentes-por-persona.ts` (32) y `…/infraestructura/residentes-por-persona-pg.ts` (85) — puerto y adaptador, una sentencia para la nube y la instantánea.
- `…/infraestructura/cargador-pg.ts` (217) — lo pide en el mismo `Promise.all` que la versión.
- `apps/api/src/edge/aplicacion/instantanea.ts` (168), `puertos.ts` (110) e `infraestructura/fuente-de-reglas-pg.ts` (186) — `residentesConRostro` en la instantánea.
- `apps/edge/src/aplicacion/contexto-local.ts` (259) — el Edge compone el derecho con la misma función.

**Biometría (API).**

- `aplicacion/preparacion-de-captura.ts` (230) — calidad → consentimiento (tres orígenes) → plantilla; sale de `CapturarRostro`.
- `aplicacion/rostro-de-residente.ts` (195) — registrar, retirar y leer el rostro de un residente.
- `aplicacion/suprimir-y-retirar.ts` (97) — supresión y retirada inmediatas; sustituye a `suprimir-por-titular.ts`, que se borra.
- `aplicacion/revocar-consentimiento.ts` (104) — sale de `casos-de-uso.ts` (516 → 341), con la marca del representante.
- `aplicacion/puertos-del-rostro.ts` (59) — lectura y reemplazo del rostro.
- `infraestructura/reemplazo-de-rostro-pg.ts` (78), `rostros-de-residente-pg.ts` (110), `rostros-en-memoria.ts` (93), `plantilla-sql.ts` (33) y `consentimiento-sql.ts` (48).
- `rostro.providers.ts` (135) — raíz de composición aparte; `biometria.module.ts` baja de 304 a 284 líneas.

**Residente (API).**

- `aplicacion/mi-rostro.ts` (132), `rostro-de-mis-menores.ts` (229), `puerta-del-rostro.ts` (79), `estado-del-rostro.ts` (78) y `politica-del-rostro.ts` (56).
- `infraestructura/menores-para-el-rostro-pg.ts` (34) — el menor, filtrado por copropiedad, vivienda, activo y sin cuenta.
- `presentacion/mi-rostro.controller.ts` (143), `rostro-de-mis-menores.controller.ts` (129), `dtos-rostro.ts` (106) y `limites-del-rostro.ts` (10).
- `aplicacion/supervision-de-residentes.ts` (232) y `menores-del-hogar.ts` (202) — las dos bajas, con `SuprimirYRetirarYa`.
- `rostro.providers.ts` (69), `residente.module.ts` (231), `hogar.providers.ts` (199) y `hogar-15w.providers.ts` (198).
- `configuracion/esquema-de-rostro.ts` (17) — `ROSTRO_RESIDENTE_RETENCION_DIAS`, de 30 a 1825, 365 por omisión.

**Pruebas de la API** (nuevas, salvo indicación).

- Con base: `rostro-del-residente-pg` (251), `rostro-de-menores-pg` (274), `residentes-por-persona-pg` (160) y el banco `terminales-de-rostro-pg.ts` (86).
- Sin base: `forma-del-rostro.e2e` (127), `limite-del-rostro.e2e` (70), `paridad-rostro-del-residente` (167) y `aislamiento-recurso-de-vivienda.e2e` (101), con `rutas-con-recurso-de-vivienda.ts` (52).
- Ampliadas: `aislamiento-residente.e2e` (617 → 626), `campos-prohibidos-del-residente.e2e`, `biometria.e2e` (C-62), `edge-misma-decision-pg.e2e`, `verificacion-remota-armada-pg` (454 → 455, D0) y `utilidades.ts` (642 → 648).
- Unitarias: `rostro-de-residente`, `rostro-de-menor`, `suprimir-y-retirar`, `mi-rostro`, `rostro-de-mis-menores`, `estado-del-rostro`, `derecho-del-residente`, `cargador-pg.residente` e `instantanea-residentes-15x`; en el Edge, `rostro-del-residente-15x`.

**App** (`apps/mobile`).

- `lib/dominio/rostro.dart` (145) y `rostro_de_menor.dart` (63); `lib/aplicacion/oferta_del_rostro.dart` (42).
- `lib/infraestructura/api/rostro_api.dart` (162), sobre el cliente generado; `lib/infraestructura/camara/copia_temporal.dart` (22), `borrado_io.dart` (18) y `borrado_web.dart` (5).
- `lib/presentacion/pantallas/mi_rostro.dart` (289), `ofrecer_rostro.dart` (80) y `primer_ingreso.dart` (231); `textos_del_rostro.dart` (51).
- `lib/presentacion/widgets/captura_de_rostro.dart` (241), `estado_del_rostro.dart` (64), `rostro_del_menor.dart` (63) y `esperas_del_ingreso.dart` (95).
- Cambian: `menor.dart`, `perfil.dart`, `pestanas.dart`, `acciones_de_la_familia.dart`, `dependencias.dart`, `main.dart` y `app.dart` (364 → 371).
- Pruebas nuevas: `oferta_del_rostro_test` (aplicación y presentación), `rostro_test`, `rostro_de_menor_test` (dominio y presentación), `rostro_api_test`, `copia_temporal_test`, `mi_rostro_test` y el doble `rostro_falso.dart`.
- El recorrido en el navegador, `e2e/recorrido-web.mjs` (868 → 889), con «Ahora no».

**Contrato.** `packages/contracts/openapi.json`, su cliente TypeScript y el cliente Dart, **regenerados** (`pnpm contrato && pnpm contrato:cliente`; `swagger_parser` y `build_runner` para Dart), nunca a mano.

**Consola.** `apps/web/vitest.config.ts` (`testTimeout` 20 s) y `src/pruebas/tiempos.test.ts` (22): el `STACK_TRACE_ERROR` del paso 14 en macOS (`a93064d`).

**Documentación.**

- [ADR-039](../decisiones/ADR-039-rostro-del-residente-y-del-menor.md) (nuevo) y `docs/decisiones/README.md`.
- `docs/seguridad/ciclo-vida-biometrico.md`: los dos caminos del rostro y la evidencia de cada garantía.
- `docs/arquitectura/modelo-datos.md`: la 0057, D-08 enmendada, D-15X-01 y D-15X-02, y el desfase de la 0043.
- `docs/guias/MANUAL_USUARIO.md`: §6 «Su rostro» y §3.4 (reloj y margen de la terminal).
- `docs/auditoria/contradicciones-y-supuestos.md`: C-62 a C-64, S-15W-01, S-15X-01 a S-15X-05, P-39 y E-08.
- Este informe y la ficha de `docs/ESTADO_ETAPAS.md`.

## 4 · Tabla SOLID

**Comprobación mecánica (§2.3).**

- **Ficheros nuevos de código y de pruebas: ninguno pasa de 300 líneas.** El
  mayor de código es `mi_rostro.dart` (289); el de la API, `preparacion-de-captura.ts`
  y `rostro-de-mis-menores.ts` (230 y 229); el de pruebas, `rostro-de-menores-pg`
  (274). Una prueba con base llegó a 315 líneas y se partió antes de
  comprometerla: el banco de las dos terminales, `terminales-de-rostro-pg.ts`,
  lo comparten las dos pruebas del rostro.
- **Los cuatro ficheros vigilados por el encargo no crecen**:
  `biometria/aplicacion/casos-de-uso.ts` baja de 516 a 341; `mi.controller.ts`,
  `puertos-hogar.ts` y `padron/aplicacion/casos-de-uso.ts`, sin cambios.
- **Existentes por encima de 300 que crecen: diez, declarados en DT-15X-04.**
  - Listas exhaustivas y arneses: `aislamiento-residente.e2e` (617 → 626),
    `utilidades.ts` (642 → 648) y `recorrido-web.mjs` (868 → 889).
  - Cableado y configuración: `eventos.module.ts` (543 → 546), `app.dart`
    (364 → 371) y `.env.example` (470 → 475).
  - Por D0: `diagnostico-de-equipo.ts` (491 → 498) y
    `verificacion-remota-armada-pg` (454 → 455).
  - `armazon_test.dart` (359 → 362) y `consentimiento.ts` (351 → 361).
- **Bajan:** `biometria/aplicacion/casos-de-uso.ts` (516 → 341),
  `repositorios-pg.ts` (579 → 522) y `biometria.module.ts` (304 → 284).
- **Clases con más de cinco métodos públicos.**
  - Nuevas: ninguna. Los controladores tienen tres rutas cada uno;
    `RostroDeResidente` tiene cuatro métodos, y `RostroDeMisMenores` y `MiRostro`,
    tres.
  - **Crece una que ya pasaba: `ConsentimientoBiometrico`, de 9 a 11**
    (DT-15X-04). Son métodos de intención del agregado —autorizar y revocar como
    representante legal—, con nombre propio para que la prueba de nombres
    prohibidos los distinga de una delegación. Partir el agregado rompería su
    frontera de consistencia.
  - Sigue igual: `RepositorioPlantillasPg` (15).

| Bloque                                                | SRP                                                                                                   | OCP                                                                                           | LSP                                                                                            | ISP                                                            | DIP                                                                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Base (0057)                                           | Una restricción por invariante: un rostro vivo, el autor del representante, los hechos de la bitácora | El origen nuevo es un valor más del `CHECK`; las restricciones de la 0043 no se reescriben    | —                                                                                              | —                                                              | La API no decide lo concurrente: el índice lo decide (ADR-04)                         |
| Dominio (`consentimiento`, `edad`)                    | La edad del rostro, en `edad.ts`; el origen, en el agregado                                           | El representante entra como un origen más, sin tocar `otorgar` ni `declarar`                  | —                                                                                              | Funciones puras pequeñas                                       | Reloj inyectado; cero I/O                                                             |
| Motor y Edge (D1)                                     | El derecho por persona, en su función; la lectura, en su puerto                                       | Un derecho nuevo se antepone en el cargador sin tocar el motor                                | El adaptador PG y la instantánea del Edge dan la misma decisión (paridad, con base y sin ella) | `ResidentesPorPersona`, un método                              | El cargador depende del puerto; Nest inyecta                                          |
| Biometría (`RostroDeResidente`, `SuprimirYRetirarYa`) | Preparar, reemplazar, suprimir y revocar, cada uno en su caso de uso                                  | Visita y residente comparten `PreparacionDeCaptura`; cambia sólo el origen del consentimiento | Los adaptadores PG y en memoria pasan las mismas pruebas                                       | `LecturaDeRostros` y `ReemplazoDeRostro`, separados            | Las dependencias entran por un objeto de puertos (`DependenciasDelRostroDeResidente`) |
| Residente (`MiRostro`, `RostroDeMisMenores`)          | La puerta —ámbito, política, foto, cupo— en `puerta-del-rostro.ts`; cada caso de uso, una operación   | El menor reutiliza la puerta del adulto                                                       | El doble `MenoresParaElRostro` y el adaptador PG, intercambiables en las pruebas               | Puerto `MenoresParaElRostro`, un método                        | El residente usa la biometría por su barril; no inyecta sus repositorios              |
| App                                                   | Dominio, oferta, adaptador y pantalla, cada uno en su fichero                                         | El rostro del menor es la misma pantalla con otros textos (`TextosDelRostro`)                 | `RostroFalso` y `RostroPorApi` cumplen el mismo puerto                                         | `RostroDelResidente`, tres operaciones; `RostroDeMenores`, una | Cliente generado desde OpenAPI; la persona nunca es un parámetro                      |

`grep -rE "supabase|axios|isapi" packages/domain-core/src/` sigue en 0.

## 5 · Trazabilidad

| Referencia                                                     | Cómo queda                                                                                                                                                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D-W3** · el rostro propio                                    | **Construido** en la API y en la app: opcional, anual y retirable; el primer ingreso lo ofrece sin bloquear (ADR-039 §3 y §6)                                                                                                                    |
| **D-W4** · el rostro de un menor                               | **Construido**: de 15 a 17 años, sólo por el titular como representante legal, con dos declaraciones (ADR-039 §4). Con menos de 15, 400 `EDAD_INSUFICIENTE`                                                                                      |
| **OE-04** · **HU-11** · **HU-13** · **CA-08** · **KPI-16**     | La foto del residente pasa por la misma revisión que la de una visita —tipo real, tamaño, calidad—; la que no sirve no crea plantilla y vuelve con sus motivos                                                                                   |
| **HU-12** · **RN-09** · **CA-09**                              | El consentimiento entra con la plantilla en la misma transacción, y la base exige que esté vigente para sincronizar (`tg_plantilla_exige_consentimiento`)                                                                                        |
| **RN-10** · **HU-15** · **CA-11**                              | El titular revoca y su rostro sale de todos los equipos en el acto. El representante legal sólo autoriza y revoca lo de un menor de su hogar (C-64)                                                                                              |
| **RN-11** · **HU-14** · **CA-10**                              | Vence al año, o a los 18 para un menor. El reemplazo, el retiro y las dos bajas lo sacan de los equipos en el acto; el barrido sigue cubriendo al equipo que no responde                                                                         |
| **RN-02** · **RN-16** · **CU-04**                              | Un acceso facial de un residente produce un evento decidido con su derecho, en la nube y en el Edge y con la misma versión de reglas. Antes salía `FALLO_TECNICO`                                                                                |
| **RN-05** · **RN-15** · **KPI-36/37** · **CA-24** · **CP-11**  | La persona sale de la cuenta, y el menor se filtra en el SQL por la vivienda del ámbito. Las seis rutas nuevas están en las suites de aislamiento por los dos caminos, sin exenciones                                                            |
| **RN-20**                                                      | Sin cambio: las rutas nuevas son del residente, y la administración no tiene ninguna                                                                                                                                                             |
| **Ley 1581 de 2012**                                           | Autorización previa, expresa e informada, con la versión del texto aceptado; art. 7 para el menor. Minimización: la imagen no vuelve al teléfono, la foto no espera en él y la bitácora no lleva bytes ni documento. Textos provisionales (P-39) |
| **KPI-17** (FRR) · **KPI-18** (FAR) · **KPI-13** · hitos 2 y 3 | **Sin cifra**: exigen la terminal y muestra real (§«Pruebas en sitio»). El rostro de los residentes es lo que permite medir el FRR con personas registradas                                                                                      |
| **ADR-039** · **E-08** · **C-62 a C-64**                       | Formalizados                                                                                                                                                                                                                                     |
| **P-39**                                                       | Abierta: el texto definitivo de las dos políticas del rostro                                                                                                                                                                                     |

## 6 · Pruebas

### Qué se probó y cómo

**Base de datos.** `./supabase/verificar.sh --con-pruebas --modo-supabase`, sobre
la base reconstruida de 0001 a 0057, en verde.

- `99m_rostro_del_residente.sql`, en una transacción que se deshace:
  - un solo rostro vivo por persona, y el reemplazo que cabe;
  - las suprimidas, las de visitante y las de otra persona no cuentan;
  - el representante deja autor, y un origen inventado no entra;
  - ni un residente por la REST ni el servicio de otra copropiedad escriben rostros;
  - los cuatro hechos del rostro en la bitácora.
- `99m_asercion_previa_0057.sh` aplica el **fichero** de la migración: con dos
  rostros vivos se detiene y nombra a la persona; con uno, entra.
- La reversión se niega sin confirmación, y revertir y aplicar dos veces deja el índice.

**Dominio, sin base.** `consentimiento-representante.test` (12): autor
obligatorio, nunca el propio menor, revocar sólo lo de un representante, la
confirmación a los 18 y ningún método con forma de delegación, tampoco estático.
`edad.test`: los 15 cumplidos, el cumpleaños de los 18 a las 00:00 de Bogotá y
el 29 de febrero.

**Terminal (D0), sin equipo.** `margen-de-inicio-15x.test`: el doble de la
terminal pregunta a las «08:55:00», primer segundo del margen, y niega en local
a las «08:54:59». `hora-sin-zona-15x.test`: la ficha juzga igual que la
compuerta en ocho formas de hora (30 s dentro, 31 s fuera), con el proceso en
UTC y en Bogotá.

**API contra PostgreSQL** (la cadena real con el gancho de claims y la RLS
forzada; sólo el proveedor de identidad y las terminales son dobles):

| Fichero                         | Pruebas | Qué demuestra                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rostro-del-residente-pg`       | 11      | D2: alta en los dos equipos con el consentimiento del titular y 365 días; política vieja 409; reemplazo fuera de los equipos en el acto; **dos registros a la vez y dos primeras capturas a la vez: 201 y 409**; el vecino 404; la sexta captura 429 con `Retry-After`; retiro; **la baja de la cuenta, fuera de los equipos en el acto** |
| `rostro-de-menores-pg`          | 10      | D3: el titular lee; otro adulto 403 en las tres rutas; el menor de otra vivienda y el adulto con cuenta, 404; 14 años 400; sin una casilla 400; 15 cumplidos 201, autorizado por el representante; retiro; vence a los 18 a las 00:00 de Bogotá; la baja, fuera de los equipos en el acto                                                 |
| `residentes-por-persona-pg`     | 6       | D1: el residente activo; sin él, la baja más reciente; nada de otra copropiedad                                                                                                                                                                                                                                                           |
| `edge-misma-decision-pg.e2e`    | —       | D1: la nube y la instantánea del Edge deciden igual el rostro de un residente                                                                                                                                                                                                                                                             |
| `verificacion-remota-armada-pg` | —       | D0: el inicio de la persona entra con el margen                                                                                                                                                                                                                                                                                           |

**API sin base:**

- Forma (`forma-del-rostro.e2e`): sin aceptar la política, un tipo que no es
  JPEG ni PNG o un base64 sobre el tope antes de decodificar, 400.
- Límite por IP (`limite-del-rostro.e2e`) y paridad nube ↔ Edge
  (`paridad-rostro-del-residente`).
- Aislamiento por los dos caminos y sin exenciones: `aislamiento.e2e` recoge
  las rutas del enrutador; `aislamiento-residente.e2e` las clasifica; y
  `aislamiento-recurso-de-vivienda.e2e` prueba el menor del vecino (404), otra
  copropiedad, la identidad de servicio (403) y la línea base.
- Campos prohibidos y el control F4 (`campos-prohibidos-del-residente.e2e`,
  `biometria.e2e`, C-62).
- Unitarias de biometría, residente, motor e instantánea, y en el Edge,
  `rostro-del-residente-15x`.

**App.** `flutter analyze` sin hallazgos y **508 pruebas en verde**: dominio
del rostro y del menor, la oferta del primer ingreso (5 de la clase y 7 de la
puerta, con la app entera), el adaptador sobre el cliente generado, la copia
temporal, «Mi rostro» con sus cinco estados, la política nueva que desmarca, y
la ficha del menor por edad y por rol. El recorrido en el navegador
(`recorrido-web.mjs`), 34 de 34, con «Ahora no».

**Sondas de mutación.** Cada control nuevo se vio fallar: se aplicó la
violación, se corrió su prueba, salió en rojo y se restauró el fichero.
**85 sondas, las 85 en rojo**, más el recorrido de la app sin el estado del
rostro y las pruebas en el límite de D0 (el margen a 0 y un segundo de más):

- D1 (11): el cargador sin el derecho por persona o preguntando con cualquier método; la vivienda del residente fuera del contexto; la baja mal elegida (tres formas); la instantánea y la fuente del Edge sin los residentes; el Edge que da el derecho a cualquier método, no lo busca o no usa su vivienda.
- 0057 (6): sin índice, el origen viejo, el representante sin autor, la bitácora sin los hechos, sin aserción, plantillas sin RLS forzada.
- D2 (17): la política vigente, la retención, el tope y su hueco, la persona del token, el conflicto, el anterior en los equipos, retirar sin revocar, el consentimiento fuera de la transacción, `suprimirEn` en el DTO, la caché, el límite por IP y los estados. Su app (11): sin la oferta, la foto que se queda sin red, registrar sin aceptar o con otra versión, el 409 sin releer, retirar sin confirmar, estados y equipos desconocidos y la copia temporal.
- D3 (20) y su app (9).
- La invitación del primer ingreso (6).
- La baja de una cuenta (3) y la política nueva (2).

Una sonda, **MP-2**, salió en verde la primera vez —faltaba la prueba de las
declaraciones del menor ante una política nueva—: se añadió la prueba y se vio
en rojo.

**Los comandos literales del encargo**, ejecutados en este orden sobre
`afd98e1`:

| Comando                                                               | Resultado                                                                                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                      | Limpio                                                                                                                                                                     |
| `./supabase/verificar.sh --con-pruebas --modo-supabase`               | «verificación completa»; el modo demuestra el `REVOKE` al dueño y la RLS forzada                                                                                           |
| `pnpm contrato && pnpm contrato:cliente`                              | Sin diferencias: el contrato y el cliente ya estaban al día                                                                                                                |
| `node scripts/lib/migraciones-sin-psql.mjs`                           | 57 migraciones, todas aplicables con `supabase db push`                                                                                                                    |
| `pnpm lint && pnpm typecheck && pnpm test`                            | Verde: API 2508 (7 omitidas: go2rtc real y el extremo a extremo de video, sin binario aquí), proveedores 1246 (2 omitidas), consola 806, dominio 483, Edge 331, config 144 |
| `pnpm secretos && node scripts/lib/escanear-secretos.mjs --historial` | Limpio: 3121 ficheros del índice y 7657 blobs del historial                                                                                                                |
| `pnpm audit --prod --audit-level=high`                                | Sin vulnerabilidades                                                                                                                                                       |
| `(cd apps/mobile && flutter analyze && flutter test)`                 | Sin hallazgos; 508 en verde                                                                                                                                                |
| `./scripts/verificar-etapa.sh --con-base`                             | Abajo                                                                                                                                                                      |

### Veredicto literal de `./scripts/verificar-etapa.sh --con-base` (§2.8.0)

Sobre `afd98e1`, desde cero (sin `dist/`, `.turbo/` ni `coverage/`,
instalación con `--frozen-lockfile`), con la base `ncr` reconstruida de 0001 a
0057 por `./supabase/verificar.sh` justo antes, en 44 min 43 s:

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

El control declarado y no ejercido es el de **D-112**: las cinco pruebas del
arranque en frío que el paso 5 salta porque necesitan los claims que escribe el
paso 12b, que es quien las ejecuta.

**Pasos y recuentos.** 31 de 31 pasos, sin ningún ✗.

- **Paso 5, TypeScript.** Ninguna omisión por falta de base: 46 ficheros usan la base, todos con su guardián.

  | Paquete            | Pruebas en verde                    |
  | ------------------ | ----------------------------------- |
  | `@ncr/api`         | **2510**, más 5 saltadas declaradas |
  | `@ncr/providers`   | 1248 (con el go2rtc real)           |
  | `@ncr/web`         | 806                                 |
  | `@ncr/domain-core` | 483                                 |
  | `@ncr/edge`        | 331                                 |
  | `@ncr/config`      | 144                                 |

- **Total de TypeScript: 5527 pruebas.** Coinciden por los dos caminos (paso
  7b) y salen iguales tres veces seguidas sin caché (paso 14: la API, 2515 de
  2515).
- **Dart:** 508 (paso 5c), también en otro huso horario.
- **Ficheros de prueba:** 538 de 538 recogidos.

**Rendimiento y concurrencia.**

- KPI-25 (paso 11): p50 7 ms · p95 27 ms · p99 40 ms, frente a un umbral de 10 s.
- KPI-03: 100 inserciones concurrentes, 0 duplicados.
- 50 ingresos simultáneos sobre 10 plazas de aforo: ni uno de más.

**Controles y entorno.**

- Los 35 controles detectan su violación.
- El trinquete de ramas sin ejercer no sube: 257.
- Ensayo de sitio en simulado: «SIN FALLOS · 47 OK · 0 FALLO».
- El recorrido de la consola (13b) y el de la app (5e) en verde; el de la app
  comprueba ya que «el perfil ofrece «Mi rostro», opcional (15-X)».
- Cliente Dart al día (484 ficheros generados).
- Historial sin secretos (7657 blobs).
- 166 campos de texto con cota.
- 57 migraciones aplicables con `supabase db push`.
- 202 de 208 operaciones con respuesta tipada; las 6 exentas, con etapa declarada.

**Tras fusionar `develop` con el PR #52** (15-S1, audio y video en sitio). La
fusión que está en la rama es la suya, `904ab97`, hecha en GitHub con los mismos
dos padres que la mía, `523d2f4`, que por eso no se subió. El código de las dos
es idéntico: sólo difieren los dos documentos que chocaron, y en ambos la
resolución de GitHub tenía un defecto, que corrige el commit siguiente:

- **El registro se quedó con el lado de la 15-X** y perdió S-15S1-01, S-15S1-02
  y la refutación de S-176. Al fusionar este PR, esas filas habrían salido
  también de `develop`.
- **`ESTADO_ETAPAS.md` conservó los dos lados tal cual**: dos «Última
  actualización» y dos tablas de resumen que se contradecían (55 frente a 52
  contradicciones; 182 frente a 177 supuestos vigentes).
- La corrección restaura la resolución de `523d2f4`: las dos rondas en la
  cabecera, la 15-X delante, y las filas de las dos en el registro, recontadas
  por fila.

El contrato y los clientes, regenerados con `pnpm contrato && pnpm
contrato:cliente` y `swagger_parser` + `build_runner`, salieron idénticos a lo
fusionado.

- **Una primera corrida sobre `523d2f4` salió FALLIDA, y no cuenta:** el
  PostgreSQL de pruebas se había caído entre medias —su registro acaba en un
  checkpoint normal y no había proceso—, y sin base la API dio 292 rojas, las
  mismas en las tres corridas del paso 14.
- **Con la base arrancada de nuevo y rehecha de 0001 a 0057, la segunda, en
  42 min 53 s** —sobre `523d2f4`, cuyo árbol de código es el de esta rama—:

```
VERIFICACIÓN DE ETAPA: correcta CON 1 CONTROL(ES) DECLARADO(S) NO EJERCIDO(S) — se puede escribir el informe
```

- 31 de 31 pasos y 546 de 546 ficheros de prueba.
- 5565 pruebas de TypeScript, 5560 en verde y las 5 saltadas de D-112: API
  2522, proveedores 1265, consola 815, dominio 483, Edge 331, config 144.
  Tres corridas idénticas.
- 508 de Dart.
- Dominio 96,41 %, aplicación 97,74 %, global 88,33 % de líneas.
- KPI-25: p50 6 ms · p95 30 ms · p99 36 ms.

### Cobertura por capa

| Capa                            | Líneas  | Ramas   | Funciones | Umbral |
| ------------------------------- | ------- | ------- | --------- | ------ |
| Dominio (`domain-core`)         | 96,41 % | 96,54 % | 96,33 %   | 90 %   |
| Aplicación (`**/aplicacion/**`) | 97,74 % | 91,74 % | 98,10 %   | 90 %   |
| Global (TypeScript)             | 88,28 % | 87,55 % | 87,15 %   | 70 %   |
| App · dominio                   | 98,65 % | —       | —         | 90 %   |
| App · aplicación                | 96,99 % | —       | —         | 90 %   |
| App · global (sin lo generado)  | 91,71 % | —       | —         | 70 %   |

## 7 · Verificación de seguridad (§2.7)

| §2.7 | Qué se comprobó en esta ronda                                                                                                                                                                                                                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Secretos.** Una variable nueva sin secreto, `ROSTRO_RESIDENTE_RETENCION_DIAS`, validada con Zod (30 a 1825) y documentada en `.env.example` sin valor sensible. El escaneo del índice (gancho de cada commit) y del historial, limpio                                                                                                            |
| 2    | **CORS.** Sin cambio                                                                                                                                                                                                                                                                                                                               |
| 3    | **Validación.** Toda ruta del rostro rechaza con 400 `titularId`, `personaId`, `suprimirEn` o `estado` en el cuerpo (asignación masiva), y la del menor, sus dos declaraciones si no son `true`. La forma vive en el DTO; la verdad —edad, titular, vivienda, política vigente—, en el dominio y en el SQL                                         |
| 4    | **Inyección SQL.** Todo parametrizado. La foto se juzga por sus primeros bytes y no por el tipo declarado: sólo JPEG o PNG, y el tamaño se mira **antes** de decodificar el base64                                                                                                                                                                 |
| 5    | **Límites.** 10 peticiones cada 60 s por IP en las seis rutas, y 5 capturas en 24 h por cuenta contadas en la base. Los dos dan 429 con `Retry-After`, probados                                                                                                                                                                                    |
| 6    | **RLS.** Las tablas tocadas siguen con `FORCE ROW LEVEL SECURITY`. Rostros y consentimientos los escribe la identidad de servicio de la copropiedad (`99m` §3: ni un residente por la REST ni el servicio de otra copropiedad), y la aplicación valida la copropiedad también. Lo ajeno da 404 en el SQL, y las sondas lo ven fallar sin el filtro |
| 7    | **CSP.** Sin cambio: la consola no cambia de orígenes                                                                                                                                                                                                                                                                                              |
| 8    | **Transversales.** Ver abajo                                                                                                                                                                                                                                                                                                                       |

- **RBAC.** `@Roles('residente')` en los dos controladores; el titular se comprueba en el caso de uso (403 a otro adulto).
- **Sin caché.** Las seis rutas contestan `Cache-Control: no-store`.
- **Datos sensibles.** Ninguna ruta devuelve la imagen. El vector se cifra en la aplicación (`BovedaAesGcm`) y sólo sale descifrado hacia la terminal. La bitácora anota la versión aceptada y, para un menor, a quién, sin bytes ni documento. La app no guarda la foto ni deja la copia temporal del selector.
- **Logs.** Esta ronda no añade ninguna línea de registro.
- **Dependencias.** Ninguna nueva. `pnpm audit --prod --audit-level=high`: sin vulnerabilidades.

## 8 · Deuda técnica, supuestos y pendientes

**Deuda técnica.**

- **DT-15X-01 · La consola web del residente no tiene nada del rostro.** Ni
  «Mi rostro», ni la invitación del primer ingreso, ni el rostro de un menor. En
  producción el iPhone sólo tiene la consola (P-23): quien sólo usa iPhone no
  puede registrar su rostro. Es la ronda 15-Y; las rutas existen y son las
  mismas que usa la app.
- **DT-15X-02 · La bóveda se escribe después de la transacción del
  reemplazo.** Si falla justo ahí, el rostro nuevo queda vivo sin vector
  cifrado y ningún equipo lo recibe, y el anterior, ya en
  `pendiente_supresion`, espera al barrido de 6 h para salir de los equipos. Se
  arregla registrando de nuevo o retirándolo. Meter la bóveda en la misma
  transacción exige que el puerto de la bóveda acepte la transacción de otro
  adaptador.
- **DT-15X-03 · `ModificarAutorizacion` no reescribe la vigencia de la persona
  en la terminal.** Si una visita se adelanta, la terminal puede negar con su
  reloj antes de preguntar (5/8); si se acorta, pregunta y la plataforma niega.
  Nunca abre de más, pero D0 no lo cubre.
- **DT-15X-04 · Ficheros por encima de 300 líneas que crecen, y una clase que
  crece por encima de cinco métodos públicos** (§4): `ConsentimientoBiometrico`
  de 9 a 11. Se suman a DT-15W-03 y anteriores.
- **DT-15X-05 · Renovar después de un cambio de versión de la política
  reutiliza el consentimiento vigente**, que conserva la versión anterior. La
  bitácora anota la versión aceptada en cada registro (`politica:<versión>`), y
  la app obliga a leer y marcar la nueva (`b75b652`), pero la fila del
  consentimiento no la refleja.
- **DT-15X-06 · Un menor con un consentimiento vigente de una visita no puede
  tener la autorización del representante** (409) hasta que ése venza o lo
  revoque su titular: la base admite un consentimiento vigente por persona, y
  el representante no revoca lo que no autorizó.
- **DT-15X-07 · `equipos.e2e` cayó una vez en macOS con «socket hang up»**
  («A.3 · … probar sin volver a escribir la clave no inventa un rechazo», CI
  del PR #52 sobre `ab48efa`, paso 7). No se reproduce en Linux ni volvió a
  salir. **Sin causa raíz**: lo digo así en vez de llamarlo intermitente.
- **DT-15X-08 · La autorización del representante no caduca sola a los 18.**
  Su plantilla vence ese día (`suprimirEn`), pero el consentimiento sigue
  vigente: una captura de visita de la misma persona podría reutilizarlo.
- **DT-15X-09 · Los 409 del rostro no llevan código máquina** («la política
  cambió», «otro registro ganó», «lo autorizó otro representante»). La app
  muestra el texto del servidor y relee el estado; no puede distinguirlos.

**[SUPUESTO]** en `docs/auditoria/contradicciones-y-supuestos.md`:

- S-15W-01 · 15 años **cumplidos**, con el día de Bogotá (lo nombraba el encargo y no estaba en el registro).
- S-15X-01 · el inicio de la vigencia, 300 s antes en la terminal.
- S-15X-02 · el aviso de renovación, 30 días antes.
- S-15X-03 · la copia temporal del selector es de la app y se borra al leerla.
- S-15X-04 · el titular que sucede al que autorizó puede retirar el rostro del menor sin declarar de nuevo.
- S-15X-05 · el tope de 5 capturas en 24 h es por cuenta, contando las de sus menores.

**[CONTRADICCIÓN]** registradas y resueltas: C-62 (el control F4 de las rutas
`/rostro` frente a las del encargo), C-63 (la baja que «debía suprimir» frente al
código, que suprimía sin retirar de los equipos) y **C-64** («nadie consiente por
otro» frente al representante legal de D-W4).

**PENDIENTE DE DEFINICIÓN.** **P-39** · el texto definitivo de las dos políticas
del rostro. Siguen abiertas P-37 y P-38, de la 15-W.

## 9 · Qué debe hacer el usuario manualmente

1. **Aplicar la migración 0057:** `supabase db push`, y confirmar con
   `supabase migration list` que aparece aplicada. Si alguna persona tuviera ya
   dos rostros vivos, la 0057 se detiene y la nombra: pase el que sobre a
   `pendiente_supresion` y vuelva a aplicar.
2. **Recompilar e instalar la app en el iPhone**
   ([`APP_EN_IPHONE.md`](../guias/APP_EN_IPHONE.md)): la versión instalada no
   tiene «Mi rostro» ni el rostro de un menor.
3. **En sitio, registrar el rostro de un residente adulto, ver la
   sincronización en la terminal y PERMITIDO en Eventos** (§«Pruebas en sitio»).
4. **Decidir P-39:** pedir al área legal de Grupo Control el texto de las dos
   políticas del rostro. Mientras tanto rigen los provisionales.
5. **Saber que en producción el iPhone no registra rostros** hasta la 15-Y
   (DT-15X-01).

## Pruebas en sitio

Lo que esta ronda no puede demostrar sin la terminal. Antes: la 0057 aplicada,
la app nueva en el iPhone y la DS-K1T344MBFWX-E1 con la biblioteca de rostros y
la verificación remota armada (`reporta_y_espera`).

| #   | Qué                                       | Cómo                                                                                                           | Qué debe pasar                                                                   | Si no pasa                                                                                 |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1   | **El «Permiso vencido» del 06/10 (D0)**   | Una visita que empieza «ahora»; el visitante, a la terminal en el primer minuto                                | Ningún 5/8: PERMITIDO en Eventos. En la ficha del equipo, su reloj               | Anotar el desvío que dice la ficha; con el reloj atrasado más de 300 s, el margen no basta |
| 2   | **«Mi rostro» de un adulto (D2)**         | La app ofrece «Entre con su rostro» → «Registrar mi rostro», o Perfil → «Mi rostro»; foto, aceptar y registrar | La app pasa de «Se está enviando…» a «Activo: … lo reconocen», equipo por equipo | «No lo recibió todavía»: la ficha del equipo dice si admite rostros y por qué no           |
| 3   | **El acceso facial del residente (D1)**   | Ese residente, ante la terminal                                                                                | **PERMITIDO** en Eventos, con su vivienda; la puerta abre                        | `FALLO_TECNICO`: la API no tiene D1 o falta la 0057                                        |
| 4   | **Retirarlo**                             | «Retirar mi rostro» → «Retirar»                                                                                | La terminal deja de reconocerlo en el acto                                       | Sigue reconociéndolo: anotar la hora y mirar la cola de retiradas                          |
| 5   | **El rostro de un menor de 15 a 17 (D3)** | El titular, en Mi familia → «Editar» → «Registrar rostro», con las dos casillas                                | Como 2 y 3, con el menor; otro adulto ve «Lo registra el titular del hogar.»     | 403 al titular: comprobar que es el titular de esa vivienda                                |
| 6   | **La baja**                               | Dar de baja la cuenta del adulto de la prueba, o al menor                                                      | Su rostro sale de la terminal en el acto, sin esperar 6 h                        | Sigue: anotar la hora y el equipo                                                          |

**Lo que se mide allí, porque aquí no se puede:**

- **KPI-17 (FRR < 5 %)** y **KPI-18 (FAR < 0,1 %)**: con residentes registrados
  ya hay población para medirlos, aunque no la muestra de 100 del requisito en
  una visita.
- El tiempo de «Registrar» a «Activo» en la app, que hoy nadie ha medido.
- De la presentación del rostro a la apertura (el análogo facial de KPI-13).

## 10 · Rama y commits

Rama `etapa-15x-rostro-del-residente`, desde `develop` (`8ee5cd9`) · PR hacia
`develop`, **sin fusionar** (lo fusiona usted).

- `7bb3ca0` feat(etapa-15x/terminal): D0 · el inicio de la vigencia con margen y el reloj juzgado igual en la ficha y en las altas
- `0cf390f` fix(etapa-15x/terminal): D0 · la verificación armada contra la base espera el inicio con margen
- `cde6889` feat(etapa-15x/motor): D1 · el rostro de un residente decide con su derecho, igual en la nube y en el Edge
- `8adc97b` feat(etapa-15x/base): 0057 · un rostro vivo de residente por persona, el origen del representante legal y los hechos del rostro
- `47c967b` feat(etapa-15x/residente): D2 · «Mi rostro»: el adulto con cuenta registra, renueva y retira su rostro
- `a83db77` fix(etapa-15x/residente): D2 · la aceptación de la política es un booleano llano: con enum [true] el cliente Dart no compilaba
- `022cd02` feat(etapa-15x/movil): D2 · «Mi rostro» en la app y el primer ingreso que lo ofrece con «Ahora no»
- `a93064d` fix(etapa-15x/consola): el tope de una prueba cubre tres esperas de Testing Library (el STACK_TRACE_ERROR del paso 14 en macOS)
- `8b88a84` feat(etapa-15x/residente): D3 · el rostro de un menor de 15 a 17 años, por el titular del hogar como representante legal
- `66b01d0` feat(etapa-15x/movil): D3 · el rostro de un menor en su ficha, por edad y por rol, con las dos declaraciones del representante
- `673649f` fix(etapa-15x/movil): D2 · «Registrar mi rostro» se ofrece mientras no haya rostro ni «Ahora no», recordado por cuenta; textos de D3 del encargo — lleva también, por error, el `git mv` que renombra la prueba con base del menor (`rostro-del-menor-pg` → `rostro-de-menores-pg`); no se reescribió la historia
- `825c92b` test(etapa-15x/residente): D3 · rostro-de-menores-pg, con el nombre del encargo, 15 años cumplidos y la casilla que falta
- `8aacdcd` fix(etapa-15x/residente): la baja de una cuenta saca su rostro de los equipos en el acto
- `2044fc9` docs(etapa-15x): ADR-039, ciclo de vida biométrico y modelo de datos de la 0057
- `b75b652` fix(etapa-15x/movil): con una política nueva, la aceptación y las declaraciones vuelven sin marcar
- `afd98e1` docs(etapa-15x): manual del residente y registro de la ronda
- `744886c` chore(etapa-15x): cierre de etapa — este informe y la ficha y la cabecera de `docs/ESTADO_ETAPAS.md`
- `904ab97` Merge branch 'develop' into etapa-15x-rostro-del-residente — la fusión del PR #52, hecha por usted en GitHub
- `fix(etapa-15x)`: restaura la resolución completa del registro y de `ESTADO_ETAPAS.md`, con el veredicto tras la fusión

El orden del encargo —D0 → D1 → 0057 → D2 → móvil de D2 → D3 → móvil de D3 →
docs— se respetó en los bloques. Las correcciones posteriores (`673649f`,
`825c92b`, `8aacdcd`, `b75b652`) son defectos de bloques ya cerrados, hallados
después, y van como `fix` y `test` con su prueba; `a93064d` es de la consola,
por la CI del PR #52.
