/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-04 · EL IDENTIFICADOR DE LA PLANTILLA, COMO LO ADMITE LA TERMINAL
 *
 * La guía de la terminal:
 *
 *  · «The person ID (EmployeeNo) … Generally, devices support up to 32 bytes»
 *    (Person and Credential Management);
 *  · el `FPID` «should be the unique ID with the combination of letters and
 *    digits» (Add a face record…), y la persona y el rostro se enlazan porque
 *    `FPID` = `employeeNo`.
 *
 * El identificador de una plantilla es un UUID: 36 bytes, con guiones. Pasa
 * de 32 y no es sólo letras y dígitos: es la hipótesis más fuerte del `400`
 * con que la terminal rechazó la carga en sitio. Sin guiones son 32 cifras
 * hexadecimales —justo el máximo, sólo letras y dígitos— y la vuelta es
 * exacta, así que el evento que la terminal emite se reconoce igual.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPACTO = /^[0-9a-f]{32}$/i;
export const LONGITUD_MAXIMA_EN_EL_EQUIPO = 32;

export const identificadorEnElEquipo = (plantillaId: string): string =>
  UUID.test(plantillaId)
    ? plantillaId.replace(/-/g, '').toLowerCase()
    : plantillaId.replace(/[^A-Za-z0-9]/g, '').slice(0, LONGITUD_MAXIMA_EN_EL_EQUIPO);

/** La vuelta: 32 cifras hexadecimales vuelven a ser el UUID de la plantilla. */
export const plantillaDesdeElEquipo = (identificador: string): string =>
  COMPACTO.test(identificador)
    ? [
        identificador.slice(0, 8),
        identificador.slice(8, 12),
        identificador.slice(12, 16),
        identificador.slice(16, 20),
        identificador.slice(20),
      ]
        .join('-')
        .toLowerCase()
    : identificador;
