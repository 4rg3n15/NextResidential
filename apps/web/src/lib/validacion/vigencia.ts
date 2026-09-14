/**
 * Señalización EN EL FORMULARIO de las restricciones que decide el dominio.
 *
 * **Esto no es la validación; es el aviso.** Quien rechaza una vigencia
 * invertida es `Vigencia.crear` en el dominio, y quien rechaza un patrón que
 * termina antes de empezar es `PatronRecurrencia.crear`. Nada de lo que hay
 * aquí puede relajar aquello: si este módulo dijera que algo está bien, el
 * servidor seguiría diciendo que no.
 *
 * Existe porque el defecto D-73 demostró la otra mitad del problema. El
 * formulario aceptó «desde las 17:45, hasta las 05:45 del mismo día» sin
 * pestañear, y el error que acabó mostrando fue el de OTRO campo —el UUID—, así
 * que la vigencia invertida ni siquiera se llegó a mencionar. Una restricción
 * que solo aparece cuando el servidor la nombra obliga a descubrirla por
 * ensayo y error.
 *
 * Las reglas están escritas para ser **las mismas** que las del dominio, y el
 * precio de duplicarlas se paga en la prueba: `vigencia.test.ts` comprueba los
 * mismos bordes que `vigencia.test.ts` del dominio (`hasta === desde` inválido,
 * `hasta` un milisegundo después válido).
 */

/** RN-01 · Motivo por el que esta vigencia no se puede crear, o `null`. */
export const problemaDeVigencia = (
  desde: string,
  hasta: string,
  ahora: Date = new Date(),
): string | null => {
  // Con un campo sin llenar no hay nada que señalar todavía: el formulario ya
  // impide enviar. Decir «falta la fecha» mientras se escribe es ruido.
  if (desde === '' || hasta === '') return null;

  const inicio = new Date(desde);
  const fin = new Date(hasta);
  if (Number.isNaN(inicio.getTime())) return 'La fecha de inicio no es una fecha válida.';
  if (Number.isNaN(fin.getTime())) return 'La fecha de fin no es una fecha válida.';

  if (fin.getTime() <= inicio.getTime()) {
    return 'La vigencia termina antes de empezar. Revisa a. m. y p. m.: «hasta» debe ser posterior a «desde».';
  }
  if (fin.getTime() <= ahora.getTime()) {
    return 'La vigencia ya estaría expirada al crearse (RN-01): «hasta» tiene que estar en el futuro.';
  }
  return null;
};

/** RN-22 · Motivo por el que este patrón de recurrencia no es válido, o `null`. */
export const problemaDePatron = (
  dias: readonly number[],
  horaInicio: string,
  horaFin: string,
): string | null => {
  if (dias.length === 0) return 'Marca al menos un día de la semana.';
  const inicio = minutosDeHora(horaInicio);
  const fin = minutosDeHora(horaFin);
  if (inicio === null || fin === null) return 'La franja horaria no es válida.';
  if (fin <= inicio) {
    // El dominio lo dice igual, y por el mismo motivo: un patrón que cruza la
    // medianoche se expresa con DOS patrones.
    return 'La franja debe terminar después de empezar; una que cruce la medianoche se registra con dos autorizaciones.';
  }
  return null;
};

/** `'08:30'` → 510. `null` si no es una hora del día. */
export const minutosDeHora = (hora: string): number | null => {
  const m = /^(\d{2}):(\d{2})$/.exec(hora);
  if (m === null) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  if (horas > 23 || minutos > 59) return null;
  return horas * 60 + minutos;
};
