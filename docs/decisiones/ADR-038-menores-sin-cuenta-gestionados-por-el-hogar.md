# ADR-038 · Menores en el hogar: sin cuenta, gestionados por los adultos del hogar

|                 |                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ronda 15-W (2026-10-06) · **decisión del cliente D-W2**; las plazas que los menores ocupan y su tope, **D-W10** (extensión al contrato **E-07**)                                                                                                                                 |
| **Sustituye a** | Nada. **Amplía [ADR-025](ADR-025-codigos-de-ocupante-derivados.md)**: una plaza la ocupa una cuenta **o una persona sin cuenta**. Y deja sin efecto la declaración «definitiva» de ocupantes de la 15-I (D6): desde D-W10 el titular añade y retira plazas hasta un tope                    |
| **Afecta a**    | migraciones `0055` (mayoría de edad) y `0056` (menores, plazas y topes) · `packages/domain-core/src/residente/edad.ts` y `ocupantes.ts` · `apps/api/src/residente` (menores, plazas del titular, topes, primer ingreso) · consola (Residentes, Configuración) · app (Mi familia, Ocupantes) |
| **Registra**    | `[CONTRADICCIÓN]` **C-59** y **C-61** · S-15W-03, S-15W-05, S-15W-06, S-15W-12, S-15W-14 · P-36 (cerrada por D-W10)                                                                                                                                                                         |

---

## Contexto

Hasta la 15-W no había ninguna regla de edad, ni en el dominio ni en la base
(problema 5 del encargo). «Mi familia» era de sólo lectura (problema 6), el
enumerado `tipo_documento` no tenía los documentos de un menor colombiano
—tarjeta de identidad y registro civil— (problema 4), y las plazas de ocupante
se declaraban una vez y sólo las cambiaba el superadministrador (problema 7).

El cliente decidió (2026-10-06):

> **D-W2.** Solo los mayores de 18 años tienen cuenta. Los menores son
> `personas` + `residentes` SIN `usuarios`, y los registra y gestiona cualquier
> adulto con cuenta de su vivienda.
>
> **D-W10.** El titular gestiona las plazas de su vivienda hasta un tope de 4 en
> total, contándose a sí mismo. El superadministrador puede ampliar el tope de
> una vivienda concreta.

El tope de 4 contando al titular es `[SUPUESTO]` S-15W-03, tomado del encargo.

## Decisión

### 1 · La mayoría de edad, en el dominio Y en la base, con el día civil de Bogotá

- **En el dominio** (`edad.ts`), con el reloj inyectado (§2.4):
  `edadEn(fecha, ahora)` cuenta los años cumplidos en el **día civil de Bogotá**
  de `ahora`, y `puedeTenerCuenta(edad)` es `edad >= 18`. Una fecha que no existe en el
  calendario, anterior a 1900 o futura no tiene edad: quien llama la trata como
  dato inválido, nunca como «mayor».
- **En la base** (0055), la misma aritmética: `app.es_menor_de_edad(date)`
  (`STABLE`) toma el día de `now() AT TIME ZONE 'America/Bogota'` y le resta 18
  años. Dos disparadores la aplican:

  - `tg_cuenta_solo_mayores` (`BEFORE INSERT OR UPDATE OF persona_id ON usuarios`):
    ninguna cuenta queda atada a una persona menor. Si con los claims de quien
    escribe la persona no se ve, la edad no se puede comprobar y **se niega**.
  - `tg_persona_con_cuenta_solo_mayor`
    (`BEFORE UPDATE OF fecha_nacimiento ON personas`): la fecha de una persona
    CON cuenta no se cambia por la de un menor.

  Los dos lanzan `check_violation` con la restricción `usuarios_solo_mayores`.

- **Por qué el día de Bogotá y no el de UTC:** a las 20:00 del día anterior al
  cumpleaños, en Bogotá, en UTC ya es el cumpleaños; una cuenta abierta a esa
  hora sería la de un menor. Y la base no puede dejar pasar lo que el dominio
  negó.
- **El 29 de febrero** cumple, en los años no bisiestos, el 1 de marzo
  (`[SUPUESTO]` S-15W-06): es lo que da restar el intervalo en PostgreSQL, y el
  dominio dice lo mismo.
- **Dónde se aplica:** en «Crear cuenta», antes de mirar el código
  ([ADR-037](ADR-037-titular-asignado-y-crear-cuenta-con-codigo-de-plaza.md));
  en el primer ingreso, donde una fecha de menor **bloquea la cuenta** —inactiva,
  sin rol, con la plaza liberada y un código nuevo, y sin escribir nada de la
  persona—; y en el registro de menores, que no admite a nadie de 18 o más.
- **En el teléfono, sólo cortesía** (`[SUPUESTO]` S-15W-14): la app repite la
  aritmética para avisar antes de enviar —y, en el primer ingreso, antes de que
  el servidor bloquee una cuenta por una fecha mal tecleada—, con **un día de
  margen a favor** de quien escribe y Bogotá fija en UTC−5. Lo dudoso viaja, y
  decide el servidor.

### 2 · Un menor es persona y residente, sin cuenta

- Rutas del residente (`…/mi/menores`): `GET` y `POST`, `PUT …/:residenteId`,
  `POST …/:residenteId/baja` con motivo y `POST …/:residenteId/codigo-de-traspaso`.
- Las usa **cualquier adulto con cuenta de la vivienda**, no sólo el titular. La
  vivienda sale del ámbito del token: el menor de otra vivienda responde 404.
- El documento es **tarjeta de identidad** o **registro civil** (la 0056 los
  añade a `tipo_documento`); sale siempre enmascarado («••••5678»).
- Una persona de 18 o más → 400 «Una persona mayor de edad crea su propia cuenta
  con un código de plaza». La plaza elegida ya ocupada → 409.
- El menor **ocupa una plaza libre** de su vivienda (`plazas_de_ocupante.persona_id`):
  cuenta para el tope como cualquier ocupante.
- **La baja**, con motivo, deja a la persona en el padrón y al residente
  inactivo, libera la plaza con **otro código** (la generación sube) y suprime
  sus plantillas biométricas (RN-11), como la baja de cualquier residente.
- Esta ronda no añade ninguna captura biométrica ni ningún consentimiento para
  menores: «Mi familia» sólo dice si la persona tiene rostro en los equipos.

### 3 · La base sostiene lo mismo (0056)

- `plazas_de_ocupante.persona_id`, con clave ajena **compuesta**
  `(copropiedad_id, persona_id)` (`plazas_persona_fk`): una plaza de una
  copropiedad no puede apuntar a una persona de otra.
- `CHECK plazas_cuenta_o_persona` = `num_nonnulls(usuario_id, persona_id) <= 1`:
  una plaza la ocupa una cuenta o una persona, **nunca las dos**; libre es la que
  no tiene ninguna.
- `plazas_persona_uk`: una persona ocupa como mucho una plaza viva, como una
  cuenta (`plazas_usuario_uk`).
- `tg_plazas_solo_superadministrador`, ampliado. Sin claims (migraciones,
  semillas) o con el superadministrador, todo; con la API actuando en nombre de
  una cuenta:

  | Cambio                     | Quién, y con qué condición                                                                                                                                                          |
  | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Crear una plaza            | Nace **libre**. Tras la declaración inicial, sólo el **titular** (`ocupacion_de_viviendas.primer_residente_id`) añade                                                               |
  | Vivienda, número, conjunto | Nunca cambian                                                                                                                                                                       |
  | Estado                     | Sólo el titular, sólo de activa a inactiva, sólo una plaza **libre** y nunca la 1, que es la suya                                                                                   |
  | Ocuparla con una persona   | Un adulto con cuenta de esa vivienda, en una plaza libre, con una persona **sin cuenta**, residente de la vivienda y **menor** (`plazas_persona_menor`): fecha desconocida se niega |
  | Liberarla de la persona    | Un adulto de la vivienda dejándola libre, o la propia persona al reclamarla con su cuenta (traspaso)                                                                                |

### 4 · A los 18: el código de traspaso, la misma persona y su historial

`[SUPUESTO]` S-15W-05:

- **Sólo el titular** lo genera (otro adulto: 403), y sólo para quien ya
  cumplió 18 (si no: 409 «El código de traspaso es para quien ya cumplió 18
  años»).
- Es un HMAC con **propósito propio** (`ncr:codigo-de-traspaso:v1`), con el
  prefijo del conjunto, y de **un solo uso**: la generación de la plaza cambia al
  usarse o al liberarse.
- En «Crear cuenta» exige **además la fecha de nacimiento que el hogar
  registró**: el código solo no basta.
- La cuenta queda atada a la **MISMA persona** y a la **MISMA plaza**: la plaza
  pasa de la persona a la cuenta en la misma transacción, el correo de contacto
  se guarda en la persona en el acto (S-15W-04) y la bitácora anota
  `autorregistro` con «traspaso de la plaza N». El historial de la persona se
  conserva entero.

### 5 · Las plazas del hogar y su tope (D-W10)

- **El titular** añade plazas (`POST …/mi/ocupantes/plazas`) hasta el tope: en
  el tope, 409 «Su vivienda tiene el máximo de N plazas. Para más, pídalo a la
  administración». Retira las **libres**, con motivo
  (`POST …/mi/ocupantes/plazas/:plazaId/retiro`): la ocupada responde 409
  «Primero dé de baja a la persona», y la 1 no se retira nunca. Otro adulto
  recibe 403: ve las plazas y comparte los códigos, pero no las cambia.
- **«Compartir» copia, no abre la hoja del sistema** (`[CONTRADICCIÓN]` C-61):
  el mensaje completo —«Descargue la app, pulse Crear cuenta y use este código:
  …»— va al portapapeles, y la app lo dice para que el residente lo pegue en un
  chat o en un mensaje de texto. Abrir la hoja de compartir exigiría una
  dependencia nativa nueva (`share_plus`), que queda como propuesta pendiente
  de que el cliente la apruebe.
- La **declaración inicial** (`POST …/mi/ocupantes`) admite de 1 al tope y ya
  **no es definitiva**.
- **El tope cuenta al titular** y es **4 por omisión**
  (`copropiedades.tope_de_plazas_por_vivienda`, de 1 a 20). Una vivienda puede
  tener **tope propio** (`viviendas.tope_de_plazas`, de 1 a 20; nulo = el de su
  copropiedad). Los dos los cambia sólo el superadministrador, con motivo:
  `GET`/`PUT …/viviendas/:viviendaId/tope-de-plazas` (nunca por debajo de las
  plazas activas: 409) y `GET`/`PUT …/tope-de-plazas` (Configuración). Cuando él
  añade plazas a una vivienda (`POST …/viviendas/:viviendaId/ocupantes`), su tope
  propio sube si hace falta. Cada cambio deja `tope_de_plazas_cambiado` en la
  bitácora.
- **El tope lo impone la base** (ADR-04), con el patrón de ADR-026:
  - `tg_tope_de_plazas` (`BEFORE INSERT OR UPDATE OF estado`): al nacer o al
    revivir una plaza activa, toma
    `pg_advisory_xact_lock(hashtextextended('ncr:tope-plazas:' || vivienda, 0))`,
    cuenta las activas y lanza `plazas_tope`. Sin tope legible, niega. Vale
    también para el superadministrador, cuya ruta sube antes el tope en la misma
    transacción.
  - `tg_tope_de_plazas_de_la_vivienda`: de una vivienda, el superadministrador
    sólo cambia el tope —la política estrecha `viviendas_tope_plataforma` le
    deja hacer ese `UPDATE`—; nadie más lo toca; y bajo el mismo bloqueo, el
    tope **nunca queda por debajo de las plazas activas**
    (`viviendas_tope_bajo_las_plazas`).
  - `tg_tope_de_plazas_de_la_copropiedad`: el tope por omisión, sólo el
    superadministrador.
  - **Nadie pierde plazas:** `app.conservar_plazas_sobre_el_tope` da a toda
    vivienda sin tope propio que tenga más plazas activas que el de su
    copropiedad un tope propio igual a las que tiene. La migración la llama una
    vez al desplegar, **antes** de crear el disparador del tope, y
    `tg_conservar_plazas_al_bajar_el_tope` cada vez que el tope de una
    copropiedad baja.

## Alternativas consideradas

| Alternativa                                                    | Por qué no                                                                                                                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cuentas para menores, con permisos recortados                  | D-W2: sólo los mayores de 18 tienen cuenta                                                                                                                                             |
| Sólo el titular gestiona a los menores                         | D-W2 dice «cualquier adulto con cuenta de su vivienda». El titular conserva lo que es suyo: las plazas y el código de traspaso                                                         |
| La regla de edad sólo en el dominio                            | Una escritura que no pase por el caso de uso —la REST de Supabase con los claims de un administrador— podría atar una cuenta a un menor. La base es la segunda barrera                 |
| La regla de edad como `CHECK`                                  | Una restricción no puede leer la fecha de hoy sin dejar de ser inmutable (el mismo motivo por el que la 0038 deja al dominio el techo de la fecha de nacimiento)                       |
| A los 18, una cuenta nueva con una persona nueva               | Partiría a la misma persona en dos, con el historial en la que ya no se usa. El traspaso conserva la persona y la plaza                                                                |
| `SELECT … FOR UPDATE` sobre la vivienda para contar las plazas | `[CONTRADICCIÓN]` **C-59**: exigiría que la política de edición de `viviendas` dejara pasar a quien inserta plazas, y la API las inserta en nombre del titular, que no edita viviendas |
| Contar las plazas en la API y luego insertar                   | ADR-04: dos «Añadir plaza» simultáneos contarían lo mismo y pasarían los dos. Medido: 20 altas a la vez sobre la cuarta plaza, entra una                                               |

## Consecuencias

- **«Mi familia» deja de ser de sólo lectura en la app.** En la consola web del
  residente (D-12), «Mi familia» y las plazas del perfil siguen en sólo lectura:
  esta ronda no las tocó.
- **Quien cumple 18 sin cuenta sigue ocupando su plaza** hasta que el titular le
  genere el código de traspaso y cree su cuenta. Mientras tanto no se le puede
  asignar otra plaza sin cuenta: la base sólo se lo permite a un menor
  (`plazas_persona_menor`).
- **Bajar un tope nunca quita plazas**: ni el de una vivienda —la base lo niega
  si quedaría por debajo de las activas— ni el de la copropiedad —las viviendas
  que lo superan reciben un tope propio—. Al aplicarse, la migración imprime
  cuántas viviendas lo recibieron; en la base de pruebas, ninguna.
- **La reversión de la 0056** deja libres las plazas que ocupaban los menores
  —el menor sigue siendo residente— y les sube la generación para que ningún
  código anterior reviva; los topes desaparecen y el número de plazas vuelve a
  cambiarlo sólo el superadministrador. Los valores `tarjeta_identidad` y
  `registro_civil` se quedan en el enumerado: PostgreSQL no los borra.
- **Revertir la 0055 sola** deja a la base sin la segunda barrera de la mayoría
  de edad: se revierte junto con el código, nunca sola.

## Verificación

- `packages/domain-core/src/residente/edad.test.ts` · el cumpleaños de hoy, de
  ayer y de mañana; 17 frente a 18; el cambio de día entre UTC y Bogotá; el 29 de
  febrero; una fecha que no es civil, o futura, nunca cuenta como mayor.
- `packages/domain-core/src/residente/ocupantes.test.ts` · el tope por omisión es
  4 contando al titular; el tope propio; la declaración inicial ya no dice
  DEFINITIVO; el código con el prefijo del conjunto.
- `apps/api/src/residente/aplicacion/menores-del-hogar.test.ts` y
  `plazas-del-titular.test.ts` · las reglas de los casos de uso, sin base.
- `apps/api/test/menores-del-hogar-pg.test.ts` · un adulto que no es el titular
  registra, ve, edita y da de baja a un menor; 18 o más, un documento de adulto o
  un campo de más → 400 sin crear nada; plaza ocupada → 409 y dos altas a la vez
  sobre la misma plaza dejan una; un adulto de otra vivienda recibe 404; el
  código de traspaso sólo del titular y sólo con 18 cumplidos, con el historial
  conservado; la baja libera la plaza con otro código.
- `apps/api/test/plazas-del-titular-pg.test.ts` · otro adulto no añade ni retira
  (403); el titular llega a 4 y la quinta da 409; la ocupada y la 1 no se
  retiran; cinco «añadir» simultáneos sobre la cuarta plaza dejan una; con tope 6
  la quinta entra y el tope no baja de las activas; bajar el de la copropiedad no
  le quita plazas a nadie.
- `supabase/policies/tests/99l_autorregistro_y_menores.sql` · lo que la base
  sostiene sola: ninguna cuenta para un menor —ni al enlazarla ni cambiando
  después la fecha—, cuenta o persona y nunca las dos, quién ocupa una plaza con
  una persona sin cuenta, el titular y el tope, el tope propio, nadie pierde
  plazas y el administrador no toca ningún tope.
- `supabase/policies/tests/99l_plazas_concurrentes.sh` · veinte altas
  simultáneas sobre la cuarta plaza: una aceptada, diecinueve rechazadas, cuatro
  vivas.
- `apps/api/test/campos-prohibidos-del-residente.e2e.test.ts` · las rutas de
  menores y de plazas con cuerpo entran solas en el barrido, que sale del
  enrutador: ninguna escritura del residente acepta `viviendaId`, `personaId`,
  `titularId`, `rol`, `estado`, `origen` ni `es_titular`. Las que no llevan
  cuerpo —añadir una plaza, el código de traspaso— están declaradas por nombre.

## Contingencia

El tope por omisión es un dato (Configuración), no código. Si un hogar
necesitara más de 20 plazas, la cota está en dos `CHECK` de la 0056, en el DTO y
en `OCUPANTES_MAXIMO` del dominio: subirla es una migración y un cambio de
contrato, no una excepción por vivienda.
