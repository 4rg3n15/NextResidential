# ADR-030 · La atestación física del instalador permite operar una cámara que la API no confirma

|                 |                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ETAPA 15-K (2026-09-26) · decisión del cliente **D-11**                                               |
| **Sustituye a** | Nada. Matiza la guarda del principio rector de la cámara (ETAPA 15-C) con una excepción firmada y auditada       |
| **Afecta a**    | Migración `0039`, `equipos` (API), `HikvisionProvider`, consola «Dispositivos», `vigenciaDeAtestacion` (dominio) |

---

## Contexto

La guarda de la cámara (_Next Control decide, el hardware ejecuta_) lee el
`EntranceParam`, las políticas internas y los disparadores, y **no opera** una
cámara que pueda abrir por su cuenta. En sitio, el 26/09/2026:

- las cuatro políticas leían `barrierGateOper = 0`, que la guía declara
  «sin operación»,
- y con «Paso automático» encendido la cámara **abría sola**.

El campo no refleja el interruptor que abre. La API no puede afirmar ni negar
que esa cámara decide (H-SITIO-01), y la guarda la rechaza con razón. Sin una
salida, la prueba LPR real no se puede ejecutar.

## Decisión

Una **atestación del instalador**, registrada por el **superadministrador**:

1. Frente a la cámara, con su firmware actual, pasa un vehículo con una placa
   de la **lista blanca del equipo** y otro con una **placa desconocida**, y
   **ninguno abre**.
2. Se registra: quién (usuario), cuándo, el **firmware** que el equipo declaraba,
   las dos placas (normalizadas por `Placa`) y la evidencia en texto.
3. Tabla `atestaciones_de_equipo`, de **sólo inserción** (ADR-005): REVOKE a
   todos —dueño incluido—, disparadores contra UPDATE y DELETE, RLS forzada.
   Inserta sólo el superadministrador (política de la 0039 y ruta); leen la
   administración de la copropiedad y el servicio.
4. **Vigencia** (`vigenciaDeAtestacion`, pura, en el dominio): la atestación
   más reciente del equipo vale sólo para **el mismo firmware**. Un firmware
   distinto, o uno que no se pudo leer, la deja **sin efecto**; no se modifica
   nada, se compara.
5. Con una atestación vigente, `HikvisionProvider` **opera la cámara** aunque
   el veredicto no sea conforme. Antes lee el firmware **en vivo**
   (`deviceInfo`); cada aprobación así deja una línea `aviso` en la bitácora.
6. La consola la muestra en **ámbar** —«Operada por atestación del instalador
   · firmware X»—, **nunca en verde**; sin efecto, en rojo con el motivo. El
   estado de verificación de la API sigue siendo «Decide solo».

## Alternativas consideradas

- **Catalogar `barrierGateOper = 0` como «no abre».** Rechazada: es lo que la
  guía dice y lo que en sitio resultó falso. Sería un falso verde.
- **Un interruptor «confiar en esta cámara» para el administrador.** Rechazada:
  sin prueba física ni firmware, es desactivar la guarda.
- **Invalidar la atestación con un UPDATE al detectar otro firmware.** Rechazada:
  rompe el sólo-inserción y deja la invalidación a merced de que el sondeo
  corra; la comparación es siempre exacta y no escribe nada.

## Consecuencias

- La cámara atestada se opera **sin que la API confirme el modo evento**.
  Si alguien reactiva «Paso automático» sin cambiar el firmware, la atestación
  sigue vigente: el riesgo lo asume la firma, y por eso queda a nombre de quien
  la registró.
- El proveedor aprueba un equipo **una vez por proceso**: un cambio de firmware
  con la API en marcha se detecta al reiniciarla o en el siguiente sondeo de la
  consola (que muestra la atestación sin efecto).
- Revertir la 0039 elimina las atestaciones: exige confirmación explícita.

## Verificación

- `packages/domain-core/src/dispositivos/atestacion.test.ts` — la vigencia.
- `packages/providers/src/contrato/desenlaces-de-error.test.ts` («D-11») —
  vigente opera y deja aviso; firmware distinto bloquea con el motivo.
- `apps/api/src/equipos/aplicacion/atestacion-del-instalador.test.ts` — rol,
  tipo, baja, firmware desconocido, placas y evidencia.
- `apps/api/test/equipos.e2e.test.ts` («D-11») — administrador 403, «ninguna
  abrió» ≠ `true` 400, misma placa 400, vigente en la fila con la cámara aún
  «rechazada», y sin efecto tras un sondeo con otro firmware.
- `apps/api/test/registro-de-equipos-pg.test.ts` — la RLS con el rol real de
  la API y la atestación en el registro del proveedor.
- `supabase/policies/tests/95_atestacion_del_instalador.sql` — políticas,
  CHECK y sólo-inserción frente al dueño.
- `apps/web/src/app/(consola)/dispositivos/atestacion-dialogo.test.tsx` —
  ámbar/rojo y el cuerpo que envía el diálogo.

## Contingencia

Sin atestaciones (o revertida la 0039), toda cámara cuyo veredicto no sea
conforme vuelve a no operarse: la guarda original sigue intacta debajo.
