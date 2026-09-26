# ADR-027 · La aprobación de una autorización es una POLÍTICA del dominio; hoy sólo «automática»

|                 |                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ETAPA 15-I (2026-09-26) · decisión del cliente **D5 b / D5 c** · resuelve **P-09**                                                       |
| **Sustituye a** | Nada                                                                                                                                                |
| **Afecta a**    | `packages/domain-core/src/autorizaciones/politica-de-aprobacion.ts`, `copropiedades.aprobacion_de_terceros` (0038), ajustes de plataforma (consola) |

---

## Contexto

D5 b: el vehículo de un tercero entra por la autorización de visitante de
siempre, con día y franja. Se aprueba **al instante** y **sin límite** de
autorizaciones. D5 c: más adelante el cliente quiere que el **portero** dé la
aprobación final antes del acceso, y sin reescribir nada. P-09 («¿existe
compuerta de aprobación administrativa?») llevaba abierta desde la ETAPA 00, con
«no se construye» como comportamiento conservador.

## Decisión

«¿Con qué estado nace una autorización?» no está escrito en el caso de uso. Lo
contesta una **política componible** del dominio:

```ts
type PoliticaDeAprobacion = (s: SolicitudDeAutorizacion) => 'activa' | 'pendiente_de_aprobacion';
aprobacionAutomatica; // hoy: todo nace 'activa'
aprobacionDelPortero(especificacion); // futuro: lo que cumple la especificación queda pendiente
politicaDeAprobacionPara(modo); // la configuración de la copropiedad elige
```

Las especificaciones se combinan con `y`, `o` y `no` (§2.4), p. ej.
`esVehiculoDeTercero`. La configuración por copropiedad es
`copropiedades.aprobacion_de_terceros`, cuyo `CHECK` sólo admite
`'automatica'`. La consola la muestra como solo lectura, con su motivo.

## Cómo se activaría «requiere aprobación del portero»

Cuatro piezas, en este orden. Ninguna toca el motor de reglas ni `CargadorDeContextoPg`:

1. **Estado.** Migración que añade `pendiente_de_aprobacion` al enumerado de
   estado de `autorizaciones` y `'portero'` al `CHECK` de
   `aprobacion_de_terceros`. El motor sólo carga autorizaciones `activa`, así
   que una pendiente se deniega sin que el motor sepa que existe.
2. **Cola en la consola de portería.** Una lista de pendientes de la
   copropiedad (RLS por copropiedad y turno, ADR-024) con dos acciones:
   aprobar y rechazar, esta última con motivo obligatorio.
3. **Evento auditado.** Aprobar o rechazar es un caso de uso que pasa la
   autorización a `activa` o `revocada` y deja el hecho en la bitácora de solo
   inserción, con el portero, el instante y el motivo.

**Lo que ya está cableado hoy.** Los DOS casos de uso de creación —la consola
(`CrearAutorizacion`) y la app (`CrearMiAutorizacion`)— reciben la política
por constructor (por omisión `aprobacionAutomatica`) y la consultan antes de
escribir. Si la política pide un estado que la base todavía no puede guardar,
`estadoPersistible` lo detecta y la creación **falla cerrada**
(`OPERACION_NO_PERMITIDA`, §2.1.4). Nunca se guarda como activa una autorización
que tenía que esperar al portero.

4. **Composición.** En los dos módulos, la fábrica del caso de uso pasa
   `politicaDeAprobacionPara(copropiedad.aprobacionDeTerceros)` en vez de la
   omisión, y la guarda `estadoPersistible` pasa a escribir el estado pendiente.
   Es un cambio de composición: ni el motor ni las reglas se editan.

## Alternativas consideradas

| Alternativa                                     | Por qué no                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Construir hoy la cola y el estado, desactivados | El encargo lo excluye expresamente. Sería código muerto con superficie de ataque (rutas, permisos, RLS) sin uso         |
| Un `if (modo === 'portero')` en el caso de uso  | Viola OCP (§2.3). Cada modo nuevo editaría el caso de uso                                                               |
| Resolverlo en el motor de reglas                | El motor decide **accesos**, no el ciclo de vida de una autorización. Mezclarlos rompería la precedencia fijada en §2.2 |

## Verificación

`packages/domain-core/src/autorizaciones/politica-de-aprobacion.test.ts`: la
política automática deja todo `activa`; la del portero deja un vehículo de
tercero en `pendiente_de_aprobacion` y un visitante a pie en `activa`; los
combinadores componen; la configuración elige.
`apps/api/src/autorizaciones/aplicacion/casos-de-uso.test.ts` y
`apps/api/test/aprobacion-de-terceros.test.ts`: con la política del portero, los
dos casos de uso fallan cerrados y no escriben; con la automática, cinco
terceros con placa se aceptan. `residentes-y-vehiculos-pg.test.ts`
(D5 b): una vivienda con sus 2 vehículos propios crea varias autorizaciones de
terceros y todas se aceptan.

## Contingencia

Si el cliente quisiera aprobación para OTRO tipo de autorización (p. ej. las
recurrentes), es otra especificación compuesta (`o(esVehiculoDeTercero,
esRecurrente)`). No cambia ninguna de las tres piezas.
