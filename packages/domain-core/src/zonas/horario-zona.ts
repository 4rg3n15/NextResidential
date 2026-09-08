import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';
import type { DiaDeSemana } from '../autorizaciones/patron-recurrencia';

const MINUTOS_DEL_DIA = 24 * 60;

/**
 * Una franja de apertura de la zona en un día de la semana.
 *
 * `continuaDelDiaAnterior` marca la fila que existe **solo** porque el horario
 * cruza la medianoche. La migración 0007 fija el supuesto **S-09**: «viernes de
 * 22:00 a 01:00» se modela como dos franjas —viernes 22:00–24:00 y sábado
 * 00:00–01:00— en vez de admitir `fin < inicio` como marca de cruce, porque el
 * envolvente mete un caso especial en cada comparación que toque el horario.
 *
 * La consecuencia que esta etapa tiene que respetar: **el corte de medianoche
 * es un artificio de representación, no un cierre de jornada.** Ver
 * `politica-reinicio.ts`.
 */
export class FranjaHoraria {
  private constructor(
    readonly dia: DiaDeSemana,
    readonly minutoInicio: number,
    readonly minutoFin: number,
    readonly continuaDelDiaAnterior: boolean,
  ) {
    Object.freeze(this);
  }

  static crear(entrada: {
    dia: number;
    minutoInicio: number;
    minutoFin: number;
    continuaDelDiaAnterior?: boolean;
  }): Resultado<FranjaHoraria, ErrorDominio> {
    const { dia, minutoInicio, minutoFin } = entrada;
    const continua = entrada.continuaDelDiaAnterior ?? false;

    if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
      return fallo(errorDominio('DATO_INVALIDO', 'Día de semana fuera de 0..6', 'RN-14'));
    }
    for (const m of [minutoInicio, minutoFin]) {
      if (!Number.isInteger(m) || m < 0 || m > MINUTOS_DEL_DIA) {
        return fallo(errorDominio('DATO_INVALIDO', 'Minuto fuera del día', 'RN-14'));
      }
    }
    if (minutoFin <= minutoInicio) {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          'La franja debe cerrar después de abrir; un horario que cruza la medianoche se expresa con dos franjas (S-09)',
          'RN-14',
        ),
      );
    }
    if (continua && minutoInicio !== 0) {
      // Espejo del CHECK `zona_horarios_continuacion_empieza_a_medianoche`.
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'Una franja de continuación empieza forzosamente a las 00:00',
          'RN-14',
        ),
      );
    }
    return exito(new FranjaHoraria(dia as DiaDeSemana, minutoInicio, minutoFin, continua));
  }

  /** Cerrado-abierto `[inicio, fin)`, igual que `Vigencia` y por lo mismo. */
  contiene(dia: DiaDeSemana, minuto: number): boolean {
    return dia === this.dia && minuto >= this.minutoInicio && minuto < this.minutoFin;
  }
}

/**
 * Horario semanal de una zona — RN-14, CA-15.
 *
 * **La zona horaria es parte del horario, no del entorno.** «Abre a las 8:00»
 * son las 8:00 de la copropiedad; resolverlo con la hora local del proceso haría
 * que la misma zona abriera a distinta hora en un servidor de Bogotá y en uno de
 * Fráncfort. Mismo criterio que `PatrónRecurrencia`, y por el mismo motivo.
 */
export class HorarioDeZona {
  private constructor(
    readonly franjas: readonly FranjaHoraria[],
    readonly desplazamientoUtcMinutos: number,
  ) {
    Object.freeze(this);
  }

  static crear(
    franjas: readonly FranjaHoraria[],
    desplazamientoUtcMinutos: number,
  ): Resultado<HorarioDeZona, ErrorDominio> {
    if (
      !Number.isInteger(desplazamientoUtcMinutos) ||
      Math.abs(desplazamientoUtcMinutos) > 14 * 60
    ) {
      return fallo(errorDominio('DATO_INVALIDO', 'Desplazamiento horario no válido', 'RN-14'));
    }
    return exito(new HorarioDeZona([...franjas], desplazamientoUtcMinutos));
  }

  /**
   * Hora local de la copropiedad, obtenida desplazando el instante UTC — sin
   * `toLocaleString` ni el reloj del proceso, que dependen del entorno.
   */
  localDe(instante: Date): { dia: DiaDeSemana; minuto: number } {
    const local = new Date(instante.getTime() + this.desplazamientoUtcMinutos * 60_000);
    return {
      dia: local.getUTCDay() as DiaDeSemana,
      minuto: local.getUTCHours() * 60 + local.getUTCMinutes(),
    };
  }

  /**
   * CA-15. Un horario **vacío** significa zona sin restricción horaria: abierta
   * siempre. Es lo contrario del criterio de «denegar por defecto» que rige en
   * el motor, y por eso se declara: aquí «sin franjas» es una configuración
   * legítima —una zona de paso—, no una configuración incompleta. La zona que
   * quiere estar cerrada se cierra con el interruptor `abierta`, que es
   * explícito y aparece en la consola.
   */
  estaAbiertaEn(instante: Date): boolean {
    if (this.franjas.length === 0) return true;
    const { dia, minuto } = this.localDe(instante);
    return this.franjas.some((f) => f.contiene(dia, minuto));
  }

  /** La franja que contiene el instante, o `null` si la zona está cerrada. */
  franjaEn(instante: Date): FranjaHoraria | null {
    const { dia, minuto } = this.localDe(instante);
    return this.franjas.find((f) => f.contiene(dia, minuto)) ?? null;
  }

  /**
   * ¿Termina la JORNADA cuando termina esta franja?
   *
   * Es la pregunta de S-09. Una franja que acaba a las 24:00 y tiene, al día
   * siguiente, una franja de continuación que arranca a las 00:00 **no** cierra
   * la jornada: la zona sigue abierta, solo cambia la fila que la representa.
   */
  cierraJornada(franja: FranjaHoraria): boolean {
    if (franja.minutoFin !== MINUTOS_DEL_DIA) return true;
    const siguiente = ((franja.dia + 1) % 7) as DiaDeSemana;
    return !this.franjas.some((f) => f.dia === siguiente && f.continuaDelDiaAnterior);
  }
}
