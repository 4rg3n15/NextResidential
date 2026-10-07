# ADR-039 · El rostro del residente: el propio, opcional y anual; el de un menor, por el titular como representante legal

|                 |                                                                                                                                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ronda 15-X (2026-10-07) · **decisiones del cliente D-W3 y D-W4** (extensión al contrato **E-08**)                                                                                                                                                                                                                                          |
| **Sustituye a** | Nada. **Amplía [ADR-032](ADR-032-consentimiento-declarado-por-quien-registra.md)** con un tercer origen del consentimiento —el representante legal de un menor— y **[ADR-038](ADR-038-menores-sin-cuenta-gestionados-por-el-hogar.md)**, que no daba rostro a los menores                                                                             |
| **Afecta a**    | migración `0057` · `packages/domain-core` (`consentimiento.ts`, `edad.ts`) · `apps/api/src/autorizaciones` (derecho por persona) y el Edge · `apps/api/src/biometria` (preparación, reemplazo, revocación, supresión inmediata) · `apps/api/src/residente` («Mi rostro», el rostro de los menores) · la app (perfil, primer ingreso, ficha del menor) |
| **Registra**    | `[CONTRADICCIÓN]` **C-62** a **C-64** · `[SUPUESTO]` **S-15W-01** y **S-15X-01** a **S-15X-05** · `PENDIENTE DE DEFINICIÓN` **P-39** · **DT-15X-01** a **DT-15X-09**                                                                                                                                                                                  |

---

## Contexto

Hasta la 15-X el rostro sólo entraba con una visita: la captura de CU-02 y la
casilla de F4 ([ADR-032](ADR-032-consentimiento-declarado-por-quien-registra.md)).
Al verificar el código antes de tocar nada:

- **El motor no conocía el rostro de quien vive en el conjunto.** El derecho del
  residente sólo se derivaba de un vehículo (`cargador-pg.ts`, `instantanea.ts`
  del Edge): un acceso facial de un residente salía `FALLO_TECNICO` en la nube
  y en el Edge.
- No había ninguna ruta para el rostro propio, y el origen de un consentimiento
  sólo admitía dos valores (0043).
- La baja de un menor (15-W, D4) suprimía su plantilla en la base, pero la
  retirada de la terminal esperaba al barrido de 6 h (`[CONTRADICCIÓN]` C-63).

Las decisiones del cliente que rigen la ronda, D-W3 y D-W4, las trae su encargo;
el registro de la 15-W anotó que no existían en aquel. Su texto literal no está
en el repositorio: se resumen aquí por lo que mandan construir.

- **El rostro propio:** opcional, del adulto con cuenta, renovado cada año.
- **El de un menor de 15 a 17 años:** sólo lo registra el **titular del hogar**,
  declarando que es su representante legal y que el menor está informado y de
  acuerdo. Por debajo de los 15, imposible.

Rige además la **Ley 1581 de 2012**:

- el rostro es un dato **sensible**: su tratamiento es facultativo y exige
  autorización previa, expresa e informada, con prueba de qué se aceptó;
- el de un menor lo autoriza su **representante legal**, oído el menor (art. 7).

## Decisión

### 1 · El derecho facial del residente, igual en la nube y en el Edge (D1)

- `derechoDelResidentePorPersona`
  (`apps/api/src/autorizaciones/aplicacion/derecho-del-residente.ts`) es la
  misma autorización sintética que la del vehículo:
  - con prefijo propio, `residente:persona:<residenteId>`;
  - vigente hasta la baja.
- Una sola sentencia sirve a la nube y a la instantánea del Edge
  (`residentesDePersonasEn`): con S-08, el residente activo; si no hay, la baja
  más reciente.
- El cargador lo pide en el **mismo `Promise.all`** que la versión de reglas, y
  sólo para un acceso facial con persona.
- El Edge compone el derecho con **la misma función** (`contenidoDe`) y lo usa
  sólo para un hecho facial de esa persona.
- La precedencia no cambia: `listaNegra > vigencia > patrón > zona`. Sin
  consentimiento vigente, `SIN_CONSENTIMIENTO`.

### 2 · A lo sumo un rostro vivo de residente por persona (0057)

- `plantillas_residente_viva_uk`: único sobre `(copropiedad_id, persona_id)`
  para las plantillas sin autorización en `pendiente_consentimiento`,
  `pendiente_sincronizacion` o `activa`. Las de visitante no cambian.
- **Reemplazar es una transacción**, en este orden:

  1. el consentimiento;
  2. la plantilla anterior pasa a `pendiente_supresion`, con un `UPDATE`
     optimista;
  3. entra la nueva.

  De dos registros a la vez, uno gana y el otro recibe 409 (ADR-04), sin dejar
  un consentimiento vigente huérfano.

- La migración se detiene si una persona ya tiene dos rostros vivos, y la
  nombra: cuál sobra lo decide quien opera.

### 3 · «Mi rostro»: el del adulto con cuenta (D2)

- **Rutas del residente:**
  - `GET …/mi/rostro`: el estado, los equipos y la política con su versión;
  - `POST …/mi/rostro`: registra o renueva;
  - `POST …/mi/rostro/retiro`: retira.
- La persona sale del **vínculo de la cuenta** (`usuarios.persona_id`), nunca
  del cuerpo. `titularId`, `personaId`, `suprimirEn` o `estado` en el cuerpo
  dan 400 (asignación masiva).
- **El consentimiento lo otorga el propio titular**, con la versión de la
  política que la app mostró. Si no es la vigente, 409 y se vuelve a leer.
- **Vence a los 365 días** (`ROSTRO_RESIDENTE_RETENCION_DIAS`, de 30 a 1825) y
  se renueva con otra foto. Se avisa 30 días antes (`[SUPUESTO]` S-15X-02).
- **Retirar revoca y suprime en el acto, también en los equipos.** Reemplazar
  saca el anterior de los equipos en el acto (`SuprimirYRetirarYa`).
- **Límites:**
  - 10 peticiones cada 60 s por IP;
  - 5 capturas en 24 h por **cuenta** —las propias y las de sus menores—,
    contadas en la base (`[SUPUESTO]` S-15X-05). La sexta recibe 429 con
    `Retry-After`.
- Nunca sale la imagen: ni el estado ni la bitácora tienen dónde ponerla.

### 4 · El rostro de un menor, por el titular del hogar (D3)

- **Rutas:**
  - `GET` y `POST …/mi/menores/:residenteId/rostro`;
  - `POST …/mi/menores/:residenteId/rostro/retiro`.
- **Sólo el titular** (`ocupacion_de_viviendas.primer_residente_id`): otro
  adulto del hogar recibe 403.
- El `:residenteId` se filtra en el SQL: residente activo, sin cuenta y de la
  vivienda del ámbito. Lo de otra vivienda o de otra copropiedad, o un adulto
  con cuenta, responde 404.
- **Edad**, con el día de Bogotá (`edad.ts`):
  - desde los 15 años cumplidos (`[SUPUESTO]` S-15W-01);
  - con menos, 400 `EDAD_INSUFICIENTE`;
  - con 18 cumplidos, 400 `YA_ES_MAYOR`: crea su propia cuenta.
- **Dos declaraciones obligatorias**, las dos `true` (si no, 400):
  - `declaraRepresentacionLegal`;
  - `menorInformadoYDeAcuerdo`, el derecho del menor a ser oído.
- **Su política tiene versión propia** (`rostro-menor-…`): es otro texto y otra
  la persona que lo acepta (P-39).
- **El consentimiento nace con un tercer origen,**
  `autorizado_por_representante_legal`, y con la cuenta del titular como
  autora (`declarado_por`, obligatoria en la base:
  `consent_representante_con_autor`).
- **Vence al año o al cumplir 18, lo que llegue antes:** las 00:00 de Bogotá
  del cumpleaños (`cumpleMayoriaEn`; quien nació un 29 de febrero, el 1 de
  marzo, S-15W-06).
- **Retirar revoca la autorización del representante y lo saca de los equipos
  en el acto.** Puede retirarla el titular que la dio **o el que lo sucede**
  (`[SUPUESTO]` S-15X-04): retirarla siempre se puede.
- **El consentimiento PROPIO del menor, o la casilla de una visita, no los toca
  ningún representante.** Mientras uno así siga vigente, el titular no registra
  otro (409, DT-15X-06).
- **A los 18,** el ya mayor registra el suyo desde su cuenta y **confirma** la
  autorización: su origen pasa a ser el suyo (D-10).
- **La baja del menor** lo saca de los equipos en el acto
  (`SuprimirYRetirarYa.deTitular`), sin esperar al barrido.
- **La bitácora** anota `rostro_de_menor_registrado` y
  `rostro_de_menor_retirado` con el residente y la versión de la política:
  nunca bytes ni documento.

### 5 · D-08 sigue en pie: no hay delegación

El agregado `ConsentimientoBiometrico` hacía inexpresable que «otro consintiera
por el titular». El representante legal **no abre esa puerta**: es la figura
que la ley pone para el dato de un menor, y se nombra como tal.

- `autorizarComoRepresentanteLegal` exige un autor, que no sea el propio menor.
- `revocarComoRepresentanteLegal` sólo retira lo que autorizó un representante.
- `revocar()` sigue siendo **sólo del titular**.
- La prueba de nombres prohibidos (`delegar`, `enNombreDe`, `porTercero`) ahora
  mira también los métodos estáticos.

`[CONTRADICCIÓN]` C-64.

### 6 · La app

- **«Mi perfil → Mi rostro»:**
  - el estado, cada equipo y la política que mandó el servidor;
  - registrar o renovar con la versión que se **mostró**;
  - retirar con confirmación.
- **El primer ingreso ofrece «Registrar mi rostro»** mientras la cuenta no lo
  tenga y no haya dicho «Ahora no».
  - La respuesta se guarda **por cuenta** en Keychain o Keystore.
  - Sin red no se ofrece: **nunca bloquea**.
- **Sin conexión no hay rostro.** La foto no entra en la bandeja de salida: se
  descarta y se dice. La cámara borra en el acto la copia temporal del selector
  (`[SUPUESTO]` S-15X-03).
- **La ficha de un menor:**
  - con 15 a 17 años y mirando el titular: «Registrar rostro», que abre la
    **misma** pantalla con sus textos y las dos casillas del representante;
  - a otro adulto: «Lo registra el titular del hogar.»;
  - con menos de 15: «No se registra el rostro de menores de 15 años.»;
  - con 18: nada (su ficha ofrece el código de traspaso).

## Alternativas consideradas

| Alternativa                                                                             | Por qué no                                                                                                                                                                                |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Que el representante revoque por `revocar()`, comparando con el autor                   | `revocar()` es del titular (RN-10) y no debe mezclar figuras. Y atada al autor, el titular que sucede al que la dio no podría retirar nunca el rostro del menor                           |
| Que un representante revoque cualquier consentimiento del menor                         | El consentimiento propio del titular —el de una visita en CU-02— o la casilla de quien registró una visita quedarían a merced de un tercero. Se limita a lo que autorizó un representante |
| Registrar el rostro del menor con el consentimiento de una visita ya vigente            | Disfrazaría la autorización del representante de otra cosa. La ley pide la del representante, con su autor y su texto                                                                     |
| Guardar el consentimiento fuera de la transacción del reemplazo (primera versión de D2) | Dos PRIMERAS capturas a la vez daban 500 (`consent_vigente_uk`) en vez de 409. Hallado al revisar, con su prueba de carrera                                                               |
| Dejar la baja del menor con `SuprimirPlantillasDeTitular`                               | Seis horas con el rostro de quien ya no vive allí en la terminal de la portería                                                                                                           |
| Una pantalla aparte para el rostro del menor en la app                                  | La misma lógica dos veces. La pantalla de «Mi rostro» recibe sus textos y las casillas del representante                                                                                  |
| Ofrecer el rostro sólo justo después del alta (primera versión del móvil de D2)         | El encargo pedía ofrecerlo mientras no haya rostro ni «Ahora no», recordado en el almacén seguro; así, quien ya estaba dado de alta no lo veía nunca. Corregido antes del cierre          |

## Consecuencias

- **Quien ya estaba dado de alta verá la invitación en su próximo ingreso,**
  hasta que registre su rostro o diga «Ahora no».
- **La consola web del residente (D-12) no tiene nada del rostro** (DT-15X-01).
  Un residente que sólo use el iPhone por la consola no puede registrarlo;
  necesita la app.
- **Renovar tras un cambio de versión de la política reutiliza el
  consentimiento** con la versión anterior. La bitácora anota la versión
  aceptada en cada registro (DT-15X-05).
- **Las rutas no funcionan en el proyecto Supabase real hasta aplicar la
  0057:** el índice, el origen nuevo y los hechos de la bitácora son suyos. La
  aplica el usuario (`supabase db push`).
- El texto de las dos políticas es provisional y conservador hasta que el área
  legal de Grupo Control lo redacte (P-39).
