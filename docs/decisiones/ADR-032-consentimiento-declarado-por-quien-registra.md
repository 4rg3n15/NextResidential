# ADR-032 · Consentimiento declarado por quien registra: la casilla del formulario es la única constancia obligatoria

|              |                                                                                                                                                                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Estado**   | Aceptada · ETAPA 15-L (2026-09-27) · **decisión del cliente F4**, con el **riesgo legal (Ley 1581 de 2012) aceptado por el cliente**                                                                                                         |
| **Deroga**   | **ADR-029 en lo pertinente**: el consentimiento presencial deja de ser el camino para habilitar la plantilla y queda como **opción**. Deroga también el enlace firmado del titular (A3, 15-E) y su página pública, que se retiran del código |
| **Afecta a** | migración `0043` · `packages/domain-core` (`ConsentimientoBiometrico.declarar`, `confirmarPorElTitular`) · `apps/api/src/visitas` (nuevo) · `biometria` · `residente` · consola (Visitantes) · app del residente (nuevo visitante)           |
| **Registra** | C-41 (titularidad del consentimiento frente a la casilla) · C-42 («sólo fecha, hora y duración» frente a la casilla en todos los flujos) · S-78 a S-86 · E-05                                                                                |

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
   app y en la consola—: «El visitante autorizó el uso de su foto para el
   ingreso». Sin ella no se genera nada (422). No hay enlace, QR, pantalla
   aparte ni espera.
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
5. **Confirmación del titular, opcional.** Si el visitante está presente puede
   escribir su nombre y su documento (el mismo formulario de D-10); el origen
   pasa a `otorgado_por_el_titular` y se conserva quién había declarado.
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
