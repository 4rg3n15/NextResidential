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
| **Trigger que rechaza `UPDATE`/`DELETE`** | ~~Mejor que nada, pero un trigger puede deshabilitarse (`ALTER TABLE ... DISABLE TRIGGER`) por quien tenga privilegio. El `REVOKE` obliga a un cambio explícito de permisos, que es auditable~~ **Descarte erróneo — ver Enmienda 1.** El argumento es cierto pero incompleto: quien puede deshabilitar el trigger es el dueño, y el dueño también puede reconcederse el `REVOKE`. No eran alternativas excluyentes sino capas complementarias |
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


---

## Enmienda 1 · El `REVOKE` no alcanzaba al dueño de la tabla
**Fecha:** 2026-09-06 · **Origen:** verificación contra el proyecto Supabase real · **Migración:** `0017`

### Qué falló

La decisión decía «para todos los roles **de aplicación**». Esa frase parecía exhaustiva y no lo era: en Supabase el **dueño** de las tablas creadas por migraciones es `postgres`, y `postgres` es **el usuario que trae la cadena de conexión por defecto del proyecto**. Es decir, el rol excluido de la revocación era precisamente aquel con el que la API se conecta.

Verificado sobre el esquema real: `UPDATE public.eventos SET regla_aplicada = 'ALTERADA'` **tuvo éxito**. RN-03, CA-23 y KPI-24 quedaban sin garantía estructural. El `DELETE` sí estaba cubierto, por el trigger `tg_prohibir_delete` de la migración `0013` — que existía por RN-19, no por este ADR.

### Por qué el descarte del trigger fue un error de razonamiento

La tabla de alternativas rechazó el trigger porque «puede deshabilitarse por quien tenga privilegio», y prefirió el `REVOKE` por ser auditable. El argumento es correcto en sí mismo pero se aplicó mal: **quien puede deshabilitar el trigger es el dueño, y el dueño puede igualmente reconcederse el privilegio revocado**. Ambas defensas tienen el mismo actor capaz de burlarlas; ninguna domina a la otra. Tratarlas como alternativas excluyentes fue el error. Son capas, y cada una cubre el modo de fallo de la otra:

| Capa | Cubre | No cubre |
|---|---|---|
| `REVOKE` al dueño | El uso accidental desde el código de la aplicación | Que el dueño se reconceda el privilegio |
| Trigger `BEFORE UPDATE` | Al dueño, y también a un superusuario | `ALTER TABLE … DISABLE TRIGGER` |
| Rol `app_api` dedicado | Que la conexión de la API *sea* el dueño | Nada, si alguien vuelve a poner `postgres` en la cadena |
| Aserción de despliegue | La reversión silenciosa de cualquiera de las tres | Una ventana entre la reversión y el siguiente despliegue |

### Comprobaciones que sustentan la enmienda

Ejecutadas sobre PostgreSQL 16, simulando la condición de Supabase con un dueño **no** superusuario:

| Comprobación | Resultado |
|---|---|
| `REVOKE` a un dueño no-superusuario | **Surte efecto** — `permission denied for table` |
| El dueño se reconcede el privilegio y reintenta | **Tiene éxito** — el `REVOKE` solo no basta |
| Trigger `BEFORE UPDATE` frente al dueño | **Bloquea** |
| `SET session_replication_role = 'replica'` como no-superusuario | **Denegado** — no es vía de evasión |
| `ALTER TABLE … DISABLE TRIGGER` como dueño | **Permitido** — es el riesgo residual |
| El `REVOKE` persiste en el ACL (`postgres=arDxt/postgres`) | Confirmado; `TRUNCATE` (`D`) sobrevivía y también se revoca |

### Decisión enmendada

**La inmutabilidad se implementa con `REVOKE UPDATE, DELETE, TRUNCATE` sobre las tablas append-only para todos los roles *y para el dueño*, MÁS un trigger `BEFORE UPDATE OR DELETE` marcado `ENABLE ALWAYS`, MÁS un rol de conexión dedicado que no es dueño, MÁS una aserción de despliegue que verifica las tres sin excluir a nadie.**

Alcanza a `eventos` y sus particiones —presentes y futuras, porque los triggers del padre particionado se clonan—, `evidencias`, `auditoria_seguridad` y `purgas_retencion`.

### Riesgo residual, declarado

El dueño conserva `ALTER TABLE … DISABLE TRIGGER`. Ya no es un `UPDATE` desde el código sino un acto de DDL deliberado, y la aserción de `0017` lo detecta en el siguiente despliegue porque verifica `tgenabled` y no solo la existencia del trigger. Cerrarlo por completo exigiría que el dueño de las tablas no fuera `postgres`, lo que rompería `supabase db push`; queda registrado como deuda técnica en `docs/ESTADO_ETAPAS.md`.


---

## Enmienda 2 · Lo que la Enmienda 1 daba por supuesto
**Fecha:** 2026-09-06 · **Origen:** la migración `0017` falló al aplicarse en Supabase gestionado

La Enmienda 1 era correcta en el diagnóstico y equivocada en dos supuestos, ambos detectados al construir un entorno local que replica las capacidades reales de Supabase (rol dueño **no** superusuario).

### Supuesto 1 · «Creamos un rol de conexión desde la migración»

Falló, y no por una sentencia sino por cuatro:

| Sentencia | Error | Causa |
|---|---|---|
| `ALTER ROLE … NOSUPERUSER NOBYPASSRLS` | `permission denied to alter role` | PostgreSQL exige superusuario para **tocar** los atributos `superuser` y `bypassrls`, aunque sea para ponerlos en NO. `CREATE ROLE` con esos mismos NO **sí** funciona: allí solo se comprueba el caso afirmativo |
| `GRANT authenticated TO app_api` | `permission denied to grant role` | La documentación de Supabase concede un rol **propio** *a* un rol reservado (`grant mi_rol to authenticator`), que es la dirección contraria |
| `ALTER DEFAULT PRIVILEGES FOR ROLE …` | `permission denied` | Exige pertenencia al rol nombrado |
| `COMMENT ON ROLE …` | `permission denied` | No disponible sin superusuario |

**Resolución:** crear el rol de conexión es una operación de **operador**, no de esquema — necesita una contraseña, que jamás puede estar en el repositorio. Sale de la migración y pasa a `CONEXION_SUPABASE.md` §12. La migración lo **vigila** en su lugar: si el rol existe, sus atributos se verifican contra `pg_roles` en cada despliegue y la migración falla si no son los esperados. No se puede reafirmar por `ALTER ROLE`; sí se puede exigir.

**Y lo esencial:** la garantía de inmutabilidad **no depende de ese rol**. La sostienen el `REVOKE` y el trigger.

### Supuesto 2 · «SECURITY DEFINER evita la RLS»

No la evita. `SECURITY DEFINER` cambia **con qué identidad** corre una función, no **si** se le aplica la RLS. Y como todas las tablas llevan `FORCE ROW LEVEL SECURITY`, las políticas se aplican **también al dueño**. Solo la eluden un superusuario o un rol con `BYPASSRLS`.

Esto tenía una consecuencia grave, invisible mientras la base local corriera como superusuario: `app.es_mi_vivienda()` es `SECURITY DEFINER` y lee `residentes`, cuya política la invoca de vuelta. **Recursión infinita** — `stack depth limit exceeded` — que habría estallado en Supabase en cuanto un residente consultara sus datos. Corregido en la migración `0018`.

### Las capas, corregidas y cada una demostrada por ejecución

La Enmienda 1 contaba dos capas y omitía la que más trabaja. Frente al **dueño** son tres; frente a la **llave secreta**, que omite RLS, quedan dos:

| Capa | Frente al dueño (`postgres`) | Frente a `service_role` (BYPASSRLS) |
|---|---|---|
| RLS: `eventos` no tiene política de `UPDATE`, y `FORCE` alcanza al dueño | **Sí** — la sentencia afecta a cero filas | No — la omite |
| `REVOKE UPDATE, DELETE, TRUNCATE` | **Sí** — `permission denied` | **Sí** |
| Trigger `BEFORE UPDATE` `ENABLE ALWAYS` | Sí, si se reconcede el privilegio | **Sí — es la última barrera** |

Comprobado: con `service_role` y el `UPDATE` deliberadamente reconcedido, **el trigger detiene la alteración**. Ese es el escenario que hace del trigger algo más que redundancia, y es el que prueba la sección 5 de `40_inmutabilidad_frente_al_dueno.sql`.
