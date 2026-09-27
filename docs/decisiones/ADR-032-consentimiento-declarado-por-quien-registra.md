# ADR-032 · Consentimiento declarado por quien registra: la casilla del formulario es la única constancia obligatoria

|              |                                                                                                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**   | Aceptada · ETAPA 15-L (2026-09-27) · **decisión del cliente F4**, con el **riesgo legal (Ley 1581 de 2012) aceptado por el cliente** · **enmendada** en la corrección de la 15-L (misma fecha): la casilla nombra al visitante y es la ÚNICA constancia; la confirmación presencial se retira |
| **Deroga**   | **ADR-029 en lo pertinente**: el consentimiento presencial deja de ser el camino para habilitar la plantilla y queda como **opción**. Deroga también el enlace firmado del titular (A3, 15-E) y su página pública, que se retiran del código                                                  |
| **Afecta a** | migración `0043` · `packages/domain-core` (`ConsentimientoBiometrico.declarar`, `confirmarPorElTitular`) · `apps/api/src/visitas` (nuevo) · `biometria` · `residente` · consola (Visitantes) · app del residente (nuevo visitante)                                                            |
| **Registra** | C-41 (titularidad del consentimiento frente a la casilla) · C-42 («sólo fecha, hora y duración» frente a la casilla en todos los flujos) · S-78 a S-86 · E-05                                                                                                                                 |

---

## Contexto

El documento de requisitos y el contrato (§1) exigen para el dato biométrico un
consentimiento **previo, expreso e informado del titular** (RN-10, Ley 1581). La
ETAPA 08 lo llevó al extremo: el esquema no tenía dónde escribir «otro consintió
por él» (D-08) y la plantilla no viajaba a ningún equipo sin la respuesta del
visitante por su propio canal (RN-09). En sitio ese canal falló: el enlace no se
abrió en el teléfono del visitante (H-SITIO-10) y la respuesta presencial (D-10,
ADR-029) exigía entregar la pantalla a una persona que muchas veces no está.

Para la entrega, el cliente decidió (F4, confirmado por escrito el 2026-09-27):

> La casilla es el ÚNICO mecanismo obligatorio en todos los flujos (app, consola
> y portería). El consentimiento presencial D-10 queda disponible como opción,
> NUNCA como paso obligatorio. En el dominio, ConsentimientoBiometrico registra
> el origen «declarado por quien registra» distinto de «otorgado por el
> titular». ADR nuevo que deroga en lo pertinente ADR-029 y deja escrito el
> riesgo legal (Ley 1581) aceptado por el cliente. La supresión al vencer,
> revocar o rechazar (RN-11) se mantiene intacta.

## Decisión

1. **Una casilla en el formulario** de «Generar autorización» —el mismo en la
   app y en la consola—. Sin ella no se genera nada (422). No hay enlace, QR,
   pantalla aparte ni espera. Su texto, desde la enmienda de abajo: «Declaro
   que <nombre del visitante> me autorizó a usar su foto para su ingreso al
   conjunto».
2. **Cada autorización guarda su casilla**: quién la marcó
   (`consentimiento_declarado_por`), cuándo y la **versión del texto**. La
   versión la pone el servidor, no el cliente.
3. **El consentimiento lleva su ORIGEN**: `otorgado_por_el_titular` o
   `declarado_por_quien_registra`, con el autor de la declaración. Una
   declaración nace vigente por `ConsentimientoBiometrico.declarar`, que **no
   pasa por `otorgar()`**: la regla de titularidad de `otorgar`, `rechazar` y
   `revocar` no se toca. La base rechaza una declaración sin autor.
4. **Un consentimiento vigente por titular** (índice de la ETAPA 08): la
   segunda visita de la misma persona lo reutiliza, y su autorización lleva su
   propia casilla.
5. ~~**Confirmación del titular, opcional.**~~ **Retirada por la enmienda de
   abajo.** Si el visitante estaba presente podía escribir su nombre y su
   documento (el formulario de D-10) y el origen pasaba a
   `otorgado_por_el_titular`.
6. **RN-11 intacta.** La plantilla vive lo que la visita (`suprimir_en` = fin
   de la visita); el rechazo anula la autorización y retira **su** plantilla de
   todos los equipos en la misma llamada; la revocación del titular sigue
   suprimiendo en el acto; el barrido programado suprime además las plantillas
   de autorizaciones revocadas por cualquier camino.

## Riesgo legal aceptado por el cliente

**Lo que la casilla NO es:** el consentimiento del titular. Es una
**declaración de quien registra** de que el titular lo dio. Frente a la Ley 1581
(arts. 9 y 12: autorización previa, expresa e informada del titular, y prueba
de ella a cargo del responsable) el registro prueba **quién afirmó** que hubo
consentimiento, cuándo y sobre qué texto; **no prueba** que el titular lo haya
dado. Ante un reclamo del titular, la copropiedad respondería con esa
declaración.

El cliente **acepta ese riesgo** para la entrega. El sistema lo hace visible en
vez de esconderlo: el origen queda en cada consentimiento, la consola muestra
quién marcó la casilla, la confirmación del titular sigue disponible, y ningún
consentimiento declarado se presenta como otorgado por el titular.

**Mitigaciones que siguen en pie:** la plantilla se suprime al terminar la
visita (RN-11); el rechazo y la revocación la retiran de los equipos; el vector
va cifrado y ninguna ruta lo devuelve; la foto de identificación queda en un
bucket privado con URL firmada de vida corta (RN-21).

## Alternativas consideradas

- **Seguir exigiendo la respuesta del titular (enlace o presencial).**
  Rechazada por el cliente: en sitio no funcionó y bloquea el acceso facial.
- **Casilla sin origen en el dominio**, tratando la declaración como un
  `otorgar()` más. Rechazada: diría en la base que el titular consintió cuando
  no consta; es la confusión que el cliente pidió evitar.
- **Casilla sólo en la consola.** Rechazada: F1 pide el mismo formulario en la
  app y en la consola.

## Consecuencias

- Se retiran del código: el enlace firmado y su verificación, la página pública
  `/consentimiento/:token`, la captura suelta de la consola
  (`POST …/biometria/capturas`, pantalla «Rostro del visitante»), la captura
  del residente contra una autorización ya creada, la consulta del estado del
  consentimiento del visitante, el QR y el compartir de la app, y la variable
  `API_URL_PUBLICA`.
- Quedan: la confirmación presencial opcional, la revocación del titular, la
  sincronización y su reintento por equipo, y el barrido.
- `P-21` (validez jurídica del consentimiento presencial) sigue abierta sólo
  para la confirmación opcional; la de la casilla no es una decisión pendiente:
  el cliente la tomó y aceptó el riesgo.

---

## Enmienda · decisión final del cliente (corrección de la 15-L, 2026-09-27)

**Lo que el cliente decidió, antes de la visita final:** la ÚNICA constancia
es la casilla, con el texto «Declaro que <nombre del visitante> me autorizó a
usar su foto para su ingreso al conjunto», en la app y en la consola, con el
nombre tomado del formulario y con una versión nueva del texto guardada. La
confirmación presencial opcional se retira de la interfaz.

**Motivo del cliente:** la foto la envía el propio visitante para su ingreso.
Quien la registra —el residente en la app, el portero o el superadministrador
en la consola— la recibe de él con ese fin; la casilla deja escrito que así
fue y a nombre de quién.

**Qué cambia:**

- **El texto nombra al visitante.** El servidor publica la plantilla con el
  marcador `{visitante}` (`GET …/visitas/casilla` → `plantilla`, `marcador`,
  `version`) y la consola lo sustituye en vivo por el nombre escrito; sin
  nombre todavía dice «el visitante». La app lleva la misma frase, con la
  misma regla, porque el residente no tiene esa ruta (S-99).
- **Versión nueva:** `casilla-v2-2026-09-27`. Las autorizaciones generadas con
  la versión anterior (`casilla-2026-09-27`, sin nombre) la conservan: la
  versión dice qué texto se marcó.
- **Se retira, sin dejar código huérfano:** la confirmación presencial de la
  consola; su ruta (`POST …/biometria/consentimientos/:id/aceptacion-presencial`)
  y su caso de uso; el puerto de identidad del padrón que sólo servía para
  comparar lo que escribía el titular; los casos de uso de la respuesta del
  titular y de la propagación posterior, que ya no tenían quién los llamara;
  y los campos `consentimientoId` y `confirmadoPorElTitular` de la lista de
  visitas. Las suites que necesitan un consentimiento «otorgado por el
  titular» para probar lo que viene después (sincronizar, suprimir, el
  disparador de la 0013) llegan a él con un doble de prueba que usa el
  agregado, no un camino de producción.
- **Lo que NO se toca: el dominio.** `ConsentimientoBiometrico` conserva sus
  dos orígenes (`otorgado_por_el_titular`, `declarado_por_quien_registra`) y
  sus métodos, y `identidadCoincide` sigue en `domain-core`. Ya no los llama
  ningún camino de producción. Retirarlos es tocar el dominio y queda para
  decisión del usuario.

**El riesgo legal no cambia; se estrecha la mitigación.** Sin la confirmación
opcional, ningún consentimiento de visita será ya «otorgado por el titular»:
todos serán declarados, con su autor, su fecha y el texto con el nombre. Lo
que el registro prueba sigue siendo quién afirmó el consentimiento, cuándo y
sobre qué texto. `P-21` queda sin objeto: era la validez de la confirmación
presencial, que ya no existe.
