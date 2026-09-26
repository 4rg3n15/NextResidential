# ADR-026 · El tope de vehículos propios lo impone la BASE, bajo un bloqueo por vivienda

|                 |                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ETAPA 15-I (2026-09-26) · decisión del cliente **D5 a** · aplica ADR-04                                                             |
| **Sustituye a** | Nada                                                                                                                                           |
| **Afecta a**    | migración `0038` (`vehiculos.origen_registro`, `tg_tope_vehiculos_propios`, `copropiedades.tope_vehiculos_propios`), `vehiculos-propios-pg.ts` |

---

## Contexto

D5 a: los ocupantes registran vehículos **propios** activos al instante. Hay un
máximo de **2 por vivienda** (configurable por el superadministrador), sin
límite por ocupante. Del tercero en adelante sólo los registra el
superadministrador, y ésos no cuentan para el cupo. ADR-04 exige que una
invariante concurrente la garantice la base, no un `SELECT` previo: dos
teléfonos de la misma casa pulsando «Registrar» a la vez no pueden dejar tres.

## Decisión

- `vehiculos.origen_registro` (`residente` | `administracion`) guarda quién lo
  registró. Un residente no puede elegirlo: el disparador lo **fuerza** a
  `residente` en su `INSERT` y le prohíbe cambiarlo en un `UPDATE`. La RLS de la
  0014 permite al residente insertar por la REST, y esta regla cierra esa puerta.
- `tg_tope_vehiculos_propios` (`BEFORE INSERT OR UPDATE`) toma
  `pg_advisory_xact_lock(hashtextextended('ncr:tope-vehiculos:'||vivienda, 0))`,
  cuenta los activos de origen `residente` de esa vivienda y, si llegan al tope,
  lanza `check_violation` con la restricción `vehiculos_tope_propios`. El
  bloqueo serializa las altas **de esa vivienda** y de ninguna otra.
- Sin tope legible (NULL) se niega: el disparador falla cerrado.
- La API traduce la violación a `TOPE_ALCANZADO`, con una explicación que dice
  que el siguiente lo registra el superadministrador. El rechazo queda en la
  bitácora (`vehiculo_propio_rechazado_por_tope`).
- La placa única activa sigue siendo el índice único parcial de siempre (RN-04).

## Alternativas consideradas

| Alternativa                                          | Por qué no                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `SELECT count(*)` en el caso de uso y luego `INSERT` | Carrera clásica: dos transacciones leen 1 y las dos insertan. ADR-04 lo prohíbe                                         |
| Nivel de aislamiento `SERIALIZABLE`                  | Obliga a reintentar en la aplicación y afecta a toda la transacción, no sólo a esta invariante                          |
| Columna contador en `viviendas` con `CHECK`          | Duplica un dato que ya existe (los vehículos). Cambiar el tope obligaría a revalidar el contador de todas las viviendas |
| Índice único parcial «posición 1 o 2»                | Un tope configurable por copropiedad no se expresa con un índice                                                        |

## Consecuencias

- Bajar el tope no desactiva vehículos existentes: sólo impide nuevas altas
  hasta que la vivienda baje del nuevo tope. Es lo conservador.
- Desactivar un vehículo propio libera el cupo en el acto.
- El bloqueo consultivo vive lo que la transacción: no hay bloqueos colgados.

## Verificación

`apps/api/test/residentes-y-vehiculos-pg.test.ts`, contra PostgreSQL real:
tope respetado, tercer registro rechazado con su motivo y su rastro, altas
**concurrentes** que no rebasan el tope, el superadministrador por encima del
tope, tope cambiado y respetado, y la baja que libera cupo.
`supabase/policies/tests/90_residentes_y_vehiculos_propios.sql`: el residente
no puede declarar `administracion` ni cambiar el origen.

## Contingencia

Si un día hiciera falta un tope por ocupante (hoy D5 a lo excluye), se añade
otro bloqueo en el mismo disparador con la clave del ocupante. No cambia el
contrato de la API.
