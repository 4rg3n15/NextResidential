# ADR-004 · La integridad concurrente se resuelve en la base de datos

- **Estado:** Aceptada
- **Fecha:** 2026-09-06 (formalización en la ETAPA 00)
- **Origen:** `CLAUDE.md` §4, ADR-04
- **Afecta a:** ETAPAS 01, 04, 07, 12 · RN-04 · RN-17 · KPI-02 · KPI-03 · CA-03

## Contexto

RN-04 establece que *«una placa solo puede estar asociada a una vivienda activa a la vez»*. CA-03 lo verifica. Y KPI-03 fija el listón de forma que no admite interpretación: **0 duplicados en 100 inserciones simultáneas**.

La implementación intuitiva —consultar si la placa existe y, si no, insertarla— **no puede** cumplir ese indicador. Entre el `SELECT` y el `INSERT` hay una ventana en la que otra transacción hace lo mismo. Bajo carga concurrente, esa ventana se abre.

## Decisión

**Las invariantes que pueden violarse por carrera se garantizan con restricciones de la base de datos, no con comprobaciones previas en el código de aplicación.**

Para RN-04, concretamente: **índice único parcial** sobre `(copropiedad_id, placa)` filtrado por `activo = true`.

## Alternativas consideradas

| Alternativa | Por qué se descarta |
|---|---|
| **`SELECT` previo en el caso de uso** | No es atómico. Es exactamente lo que KPI-03 está diseñado para detectar |
| **Bloqueo pesimista sobre la tabla** | Serializa las inserciones de todo el padrón. Inaceptable para una carga masiva de padrón inicial (HU-03) |
| **Índice único total, sin filtro `activo`** | Impediría reasignar una placa tras desactivar el vehículo anterior, que es un caso de negocio legítimo y frecuente |

## Consecuencias

**Que se aceptan:**

- **Solo la base puede garantizarlo**, y por tanto es donde vive la garantía.
- El caso de uso **traduce la violación de restricción en un error tipado de dominio** —no propaga un error de PostgreSQL hacia arriba—. CA-03 exige *«rechaza la operación indicando el conflicto»*: hay que decir **cuál** es el conflicto, con qué vivienda.
- El agregado `Vivienda` **sigue expresando la invariante** en su método de intención. La base es la garantía de última instancia bajo concurrencia; el agregado es donde la regla se lee y se entiende. No es duplicación: son dos barreras con propósitos distintos.

**Que hay que asumir:**

- La lógica de negocio queda **repartida entre código y esquema**. Se compensa exigiendo que cada restricción de base tenga su contraparte explícita en el agregado y su prueba de concurrencia.
- Las migraciones se vuelven parte del contrato de dominio: cambiar un índice único es cambiar una regla de negocio.

## Ámbito de aplicación

| Invariante | Mecanismo | Respaldo |
|---|---|---|
| Una placa activa por vivienda | Índice único parcial sobre `(copropiedad_id, placa) WHERE activo` | RN-04, KPI-02, KPI-03, CA-03 |
| Clave de idempotencia única por copropiedad | Índice único sobre `(copropiedad_id, clave_idempotencia)` en `eventos` | RN-17, CA-22 |
| Aforo nunca por encima del máximo | Restricción `CHECK` + actualización condicional atómica | RN-14, CA-14 |
| Sin borrado físico con historial | Trigger que impide `DELETE` | RN-19, CA-02, KPI-04 |

## Verificación

**DoD de la ETAPA 04:** prueba de concurrencia real — **100 inserciones simultáneas, 0 duplicados** (KPI-03). No es una prueba unitaria con mocks: se ejecuta contra la base, con transacciones concurrentes de verdad.
