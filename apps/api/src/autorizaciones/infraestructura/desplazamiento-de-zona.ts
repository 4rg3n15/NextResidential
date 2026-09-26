/**
 * H-15I-05 · el desplazamiento UTC de una zona IANA en un instante dado.
 *
 * `patrones_recurrencia` guarda la franja en hora LOCAL de la copropiedad
 * (COMMENT de la 0006), y el objeto de valor necesita saber cuántos minutos
 * sumar a UTC para llegar a ella. Ese número no lo decide quien creó la
 * autorización —el navegador manda el suyo y aquí no cuenta—: lo decide
 * `copropiedades.zona_horaria`, y depende de la FECHA en las zonas con horario
 * de verano. Por eso se calcula con el instante del `Reloj` inyectado y nunca
 * con el del proceso.
 *
 * Devuelve `null` si la zona no se puede resolver: quien llama trata ese patrón
 * como ilegible y niega, en vez de reconstruirlo con un desplazamiento
 * inventado (§2.1.4).
 */
const formatos = new Map<string, Intl.DateTimeFormat>();

const formatoDe = (zona: string): Intl.DateTimeFormat | null => {
  const guardado = formatos.get(zona);
  if (guardado !== undefined) return guardado;
  try {
    const formato = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatos.set(zona, formato);
    return formato;
  } catch {
    return null;
  }
};

/** Minutos que hay que sumar a UTC para obtener la hora de `zona` (Bogotá: −300). */
export const desplazamientoDeZona = (zona: string, instante: Date): number | null => {
  const formato = formatoDe(zona);
  if (formato === null || Number.isNaN(instante.getTime())) return null;
  const partes = new Map(formato.formatToParts(instante).map((p) => [p.type, Number(p.value)]));
  const local = Date.UTC(
    partes.get('year') ?? Number.NaN,
    (partes.get('month') ?? Number.NaN) - 1,
    partes.get('day') ?? Number.NaN,
    partes.get('hour') ?? Number.NaN,
    partes.get('minute') ?? Number.NaN,
  );
  const utcAlMinuto = Math.floor(instante.getTime() / 60_000) * 60_000;
  const desplazamiento = Math.round((local - utcAlMinuto) / 60_000);
  return Number.isFinite(desplazamiento) ? desplazamiento : null;
};
