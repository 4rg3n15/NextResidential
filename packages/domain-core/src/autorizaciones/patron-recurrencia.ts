import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';

/** 0 = domingo … 6 = sábado, como `Date.getUTCDay()`. */
export type DiaDeSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const MINUTOS_DEL_DIA = 24 * 60;

/**
 * Objeto de valor `PatrónRecurrencia` (RN-22, CA-06).
 *
 * Una autorización recurrente vale «los martes de 8:00 a 12:00», y eso es una
 * pregunta distinta de la vigencia: la vigencia dice entre qué fechas existe la
 * autorización; el patrón, en qué momentos DENTRO de ellas aplica. Por eso son
 * dos políticas y dos motivos de denegación distintos —`VIGENCIA_EXPIRADA` y
 * `FUERA_DE_PATRON`—, y el documento los separa a propósito.
 *
 * **La zona horaria es parte del patrón, no del entorno.** «Los martes a las
 * 8:00» significa las 8:00 de la copropiedad. Resolverlo con la hora local del
 * proceso haría que la misma regla decidiera distinto en un servidor de Bogotá
 * y en uno de Fráncfort; por eso el desplazamiento viaja en el objeto de valor.
 */
export class PatronRecurrencia {
  private constructor(
    readonly dias: readonly DiaDeSemana[],
    readonly minutoInicio: number,
    readonly minutoFin: number,
    /** Minutos que hay que sumar a UTC para obtener la hora local (Bogotá: −300). */
    readonly desplazamientoUtcMinutos: number,
  ) {}

  static crear(entrada: {
    dias: readonly number[];
    minutoInicio: number;
    minutoFin: number;
    desplazamientoUtcMinutos: number;
  }): Resultado<PatronRecurrencia, ErrorDominio> {
    const { dias, minutoInicio, minutoFin, desplazamientoUtcMinutos } = entrada;
    if (dias.length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'El patrón exige al menos un día', 'RN-22'));
    }
    if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return fallo(errorDominio('DATO_INVALIDO', 'Día de semana fuera de 0..6', 'RN-22'));
    }
    for (const m of [minutoInicio, minutoFin]) {
      if (!Number.isInteger(m) || m < 0 || m > MINUTOS_DEL_DIA) {
        return fallo(errorDominio('DATO_INVALIDO', 'Minuto fuera del día', 'RN-22'));
      }
    }
    if (minutoFin <= minutoInicio) {
      // Un patrón que cruza la medianoche se expresa con DOS patrones. Admitir
      // el envolvente aquí obligaría a cada consumidor a razonar el caso, y esa
      // es exactamente la clase de detalle que se olvida en una rama.
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          'El patrón debe terminar después de empezar; un patrón que cruza la medianoche se expresa con dos',
          'RN-22',
        ),
      );
    }
    if (
      !Number.isInteger(desplazamientoUtcMinutos) ||
      Math.abs(desplazamientoUtcMinutos) > 14 * 60
    ) {
      return fallo(errorDominio('DATO_INVALIDO', 'Desplazamiento horario no válido', 'RN-22'));
    }
    const unicos = [...new Set(dias)].sort((a, b) => a - b) as DiaDeSemana[];
    return exito(new PatronRecurrencia(unicos, minutoInicio, minutoFin, desplazamientoUtcMinutos));
  }

  /**
   * `true` si el instante cae dentro del patrón. Se calcula sobre la hora
   * LOCAL de la copropiedad, obtenida desplazando el instante UTC — sin tocar
   * el reloj del proceso ni `toLocaleString`, que dependen del entorno.
   */
  aplicaEn(instante: Date): boolean {
    const local = new Date(instante.getTime() + this.desplazamientoUtcMinutos * 60_000);
    const dia = local.getUTCDay() as DiaDeSemana;
    if (!this.dias.includes(dia)) return false;
    const minuto = local.getUTCHours() * 60 + local.getUTCMinutes();
    return minuto >= this.minutoInicio && minuto < this.minutoFin;
  }
}
