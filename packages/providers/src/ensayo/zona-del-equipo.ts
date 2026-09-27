import { etiqueta } from '../equipo/xml';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 · PASO 2 · LA ZONA DEL EQUIPO, NO SÓLO SU HORA
 *
 * En la última visita la cámara tenía «reloj y zona horaria mal». La hora
 * corrida fecha mal los eventos; la ZONA mal es peor desde A2: la vigencia de
 * cada visitante se escribe en la terminal en hora local SIN desfase
 * (`Valid.beginTime`), y la terminal la interpreta en SU zona. Con la zona
 * equivocada, el visitante entra horas antes o después de lo autorizado, y
 * ningún error lo avisa.
 *
 * El equipo declara la zona al estilo POSIX, con el signo al revés de la
 * costumbre: `CST+5:00:00` es CINCO HORAS AL OESTE, UTC−05:00 (Bogotá).
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Minutos al ESTE de UTC que declara una zona POSIX (`CST+5:00:00` → −300). */
export const desfaseDeZonaPosix = (zona: string): number | null => {
  const m = /^[A-Za-z]{3,}([+-])(\d{1,2})(?::(\d{2}))?(?::\d{2})?/.exec(zona.trim());
  if (m === null) return null;
  const minutos = Number(m[2]) * 60 + Number(m[3] ?? '0');
  if (minutos > 14 * 60) return null;
  return m[1] === '+' ? -minutos : minutos;
};

/** Minutos al este de UTC de una zona IANA en un instante. */
export const desfaseDeZonaIana = (zona: string, instante: Date): number | null => {
  try {
    const nombre = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' })
      .formatToParts(instante)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (nombre === undefined) return null;
    if (nombre === 'GMT') return 0;
    const m = /^GMT([+-])(\d{2}):(\d{2})$/.exec(nombre);
    if (m === null) return null;
    const minutos = Number(m[2]) * 60 + Number(m[3]);
    return m[1] === '+' ? minutos : -minutos;
  } catch {
    return null;
  }
};

/** `-300` → `UTC−05:00`. */
export const rotuloDeDesfase = (minutos: number): string => {
  const signo = minutos < 0 ? '−' : '+';
  const abs = Math.abs(minutos);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${signo}${hh}:${mm}`;
};

export interface JuicioDeZona {
  readonly correcta: boolean | null;
  readonly declarada: string | null;
  readonly detalle: string;
}

/**
 * Compara la zona que el equipo declara con la del conjunto. La hora local
 * con desfase explícito (`…-05:00`) también sirve de prueba, y si las dos
 * fuentes discrepan manda la más desfavorable.
 */
export const juzgarZona = (cuerpo: string, zonaEsperada: string, ahora: Date): JuicioDeZona => {
  const esperado = desfaseDeZonaIana(zonaEsperada, ahora);
  if (esperado === null) {
    return { correcta: null, declarada: null, detalle: `la zona «${zonaEsperada}» no es válida` };
  }
  const zona = etiqueta(cuerpo, 'timeZone');
  const local = etiqueta(cuerpo, 'localTime');
  const desfases: number[] = [];
  const porZona = zona === null ? null : desfaseDeZonaPosix(zona);
  if (porZona !== null) desfases.push(porZona);
  const m = local === null ? null : /([+-])(\d{2}):?(\d{2})$/.exec(local);
  if (m !== null) {
    const minutos = Number(m[2]) * 60 + Number(m[3]);
    desfases.push(m[1] === '+' ? minutos : -minutos);
  }
  if (desfases.length === 0) {
    return {
      correcta: null,
      declarada: zona,
      detalle: 'el equipo no declara su zona horaria en un formato que se pueda leer',
    };
  }
  const distinto = desfases.find((d) => d !== esperado);
  return distinto === undefined
    ? {
        correcta: true,
        declarada: zona,
        detalle: `zona del equipo ${rotuloDeDesfase(esperado)}, la del conjunto`,
      }
    : {
        correcta: false,
        declarada: zona,
        detalle:
          `el equipo está en ${rotuloDeDesfase(distinto)} y el conjunto en ` +
          `${rotuloDeDesfase(esperado)}: las vigencias de los visitantes se correrían ` +
          `${String(Math.abs(distinto - esperado) / 60)} h`,
      };
};
