# ADR-029 · Consentimiento presencial: el titular escribe su identidad en la portería

|                 |                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Estado**      | Aceptada · ETAPA 15-K (2026-09-26) · decisión del cliente **D-10** · **validez jurídica PENDIENTE DE DEFINICIÓN** |
| **Sustituye a** | Nada. Complementa el enlace del titular (A3, ETAPA 15-E) como segundo canal de respuesta                          |
| **Afecta a**    | `biometria` (API), `padron` (puerto `IDENTIDAD_DE_PERSONA`), consola «Rostro del visitante», auditoría            |

---

## Contexto

En sitio, el 26/09/2026, el visitante no pudo abrir el enlace de consentimiento:
la URL pública apuntaba a `127.0.0.1` (H-SITIO-10) y, aun corregida, depende de
que el teléfono del visitante alcance la API. Sin respuesta del titular la
plantilla no viaja (RN-09) y el reconocimiento facial no se puede demostrar.

RN-10 no cambia: **responde el titular, nadie por él**. El residente nunca
acepta por su visitante y el operador no marca por el titular.

## Decisión

Un segundo canal, `presencial`, en la propia pantalla de la portería:

1. El operador abre «El titular está aquí: consentimiento presencial» y
   **entrega la pantalla** al titular.
2. El titular lee el texto de la política y su versión, **escribe él mismo su
   nombre y su número de documento** y marca la declaración expresa.
3. La API (`POST …/consentimientos/:id/aceptacion-presencial`) compara lo
   escrito con la persona del padrón a la que pertenece el consentimiento
   (`identidadCoincide`, función pura del dominio) y exige que la versión
   aceptada sea la del consentimiento. Si no coincide: 403, sin revelar cuál
   de los dos datos falló ni qué dice el registro.
4. La aceptación pasa por el **mismo agregado** (`quienAcepta` = titular) y el
   mismo caso de uso que el enlace.
5. Auditoría append-only (`auditoria_seguridad`): respuesta, versión de la
   política, **canal `presencial`**, **operador** que atendía la pantalla
   (`usuario_id`), hora, IP y agente de la consola.
6. Aceptado, la plantilla se empuja **en el acto** a todos los equipos con
   biblioteca de rostros (terminales y videoporteros, ADR-019).

Roles: superadministrador, administrador, portero y operador de central.
**El residente queda fuera**. Límite de 10 intentos por minuto: comparar
contra el padrón no puede volverse un oráculo de documentos.

## Alternativas consideradas

- **Botón «el titular aceptó» para el operador.** Rechazada: es exactamente
  «el operador marca por el titular».
- **Firma manuscrita en pantalla o foto del documento.** Más evidencia, pero
  añade un dato personal más que custodiar. Queda como mejora si el asesor
  jurídico la exige.
- **Código enviado al teléfono del titular.** Depende del mismo alcance de red
  que falló en sitio y de un canal de mensajería que no está contratado.

## Consecuencias

- La consola **nunca recibe** el nombre ni el documento del titular para esta
  pantalla: no hay nada que precargar.
- **Riesgo residual declarado:** un operador que conozca los datos del
  visitante puede teclearlos por él. Ninguna técnica lo impide del todo; la
  auditoría lo atribuye a ese operador.
- **PENDIENTE DE DEFINICIÓN · validación jurídica.** Si este procedimiento
  satisface el consentimiento «previo, expreso e informado» de la Ley 1581 de
  2012 lo decide el asesor jurídico de Grupo Control, no este código. Hasta
  entonces el canal está construido y auditado, y su uso en producción queda a
  criterio del cliente.

## Verificación

- `packages/domain-core/src/padron/identidad.test.ts` — la comparación.
- `apps/api/src/biometria/aplicacion/consentimiento-presencial.test.ts` —
  identidad, versión, estado, auditoría y bitácora sin datos personales.
- `apps/api/test/consentimiento-publico.e2e.test.ts` («D-10») — residente 403,
  declaración ≠ `true` 400, otra identidad 403, y con la suya: vigente,
  auditoría con canal y operador, y plantilla en terminal y videoportero.
- `apps/api/test/persistencia-operativa-pg.test.ts` — la fila real de
  `auditoria_seguridad` con `canal:presencial` y el operador.
- `apps/web/src/app/(consola)/biometria/seguimiento.test.tsx` — campos vacíos,
  envío con la versión mostrada, y el formulario se vacía al aceptar.

## Contingencia

Si el asesor jurídico no lo valida, se retira el botón de la consola y la ruta
responde 403 para todos los roles; el enlace sigue siendo el único canal.
