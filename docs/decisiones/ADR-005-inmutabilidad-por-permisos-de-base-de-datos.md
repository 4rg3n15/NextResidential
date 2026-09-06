# ADR-005 · Inmutabilidad de eventos por permisos de base de datos

- **Estado:** Aceptada
- **Fecha:** 2026-09-06 (formalización en la ETAPA 00)
- **Origen:** `CLAUDE.md` §4, ADR-05
- **Afecta a:** ETAPAS 01, 06, 13 · RN-03 · CA-23 · KPI-24

## Contexto

RN-03 establece que *«los eventos son inmutables: ningún rol puede editarlos ni eliminarlos desde la aplicación»*. CA-23 lo verifica *«para todos los roles»*. KPI-24 fija la meta en **0 eventos editables o eliminables desde la aplicación**.

OE-05 depende por completo de esto: la trazabilidad no vale nada si el registro puede alterarse después. Y el diagrama arquitectónico anota la invariante en el propio agregado: `Acceso` es *«INMUTABLE. Sin setters»*.

Un agregado sin setters impide la mutación **por la vía prevista**. No impide un `UPDATE` directo, una migración descuidada, un script de mantenimiento o un caso de uso futuro escrito por alguien que no leyó la regla.

## Decisión

**La inmutabilidad se implementa con `REVOKE UPDATE, DELETE` sobre la tabla `eventos` para todos los roles de aplicación.**

**La inmutabilidad no puede depender de que el código «no lo haga».**

## Alternativas consideradas

| Alternativa | Por qué se descarta |
|---|---|
| **Solo agregado sin setters** | Protege la vía prevista. No protege del SQL directo, de una migración ni de un caso de uso futuro |
| **Trigger que rechaza `UPDATE`/`DELETE`** | Mejor que nada, pero un trigger puede deshabilitarse (`ALTER TABLE ... DISABLE TRIGGER`) por quien tenga privilegio. El `REVOKE` obliga a un cambio explícito de permisos, que es auditable |
| **Registro de auditoría paralelo** | Duplica el dato y traslada el problema: ¿quién garantiza la inmutabilidad del registro paralelo? |

## Consecuencias

**Que se aceptan:**

- **Defensa en profundidad, tres capas:** agregado sin setters (expresa la regla) · permisos de base (la garantizan) · prueba automatizada con **cada rol de aplicación** (la demuestra).
- **La corrección de un evento erróneo es un evento nuevo**, no una edición. Si hiciera falta anular un registro, se emite un evento de corrección que referencia al original. El original permanece.

**Que hay que asumir:**

- **La tabla `eventos` está particionada por mes** (§6, ETAPA 01). La gestión de particiones —creación y retención— requiere un rol distinto del de aplicación, con privilegio de DDL, usado solo por migraciones y trabajos administrativos. Ese rol queda **fuera** del alcance del `REVOKE` y debe documentarse y auditarse.
- Cualquier corrección de datos en producción exige un procedimiento explícito y registrado. Es el precio de la garantía, y es el precio correcto.
- La clave de idempotencia hace que un reenvío no produzca duplicado; con `INSERT` como única operación permitida, la reconciliación del Edge (RN-17) debe apoyarse en `ON CONFLICT DO NOTHING`, nunca en un `UPDATE` de reconciliación.

## Verificación

**DoD de la ETAPA 06:**
> Un intento de `UPDATE` o `DELETE` sobre `eventos` falla a nivel de base de datos **con cualquier rol de aplicación**.

La prueba recorre los seis roles y la clave `service_role` —que omite RLS pero **no** omite los permisos de tabla—, y verifica que las dos operaciones son rechazadas en los siete casos.

Se reejecuta en la ETAPA 13 como parte de la auditoría formal (KPI-24, CA-23).
