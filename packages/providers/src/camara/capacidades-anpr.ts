import { booleano, etiqueta } from '../equipo/xml';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ANTES DE CUALQUIERA DE LOS DOS TRANSPORTES · las cuatro preguntas del §9.1.1
 *
 * El fabricante enumera cuatro consultas de capacidad y dice que **basta con
 * que UNA se cumpla** para seguir adelante con el reconocimiento de matrícula.
 * Si no se cumple ninguna, dice que no se siga. Aquí se cumple esa instrucción
 * literalmente: la consola lo dice y el alta **no se completa**.
 *
 * Son cuatro y no una porque el mismo dato vive en sitios distintos según
 * familia y firmware. Preguntar sólo por uno y darlo por definitivo es cómo se
 * rechaza un equipo perfectamente capaz, o —peor— se acepta uno que no lo es
 * porque la consulta que se hizo devolvió algo irrelevante.
 *
 * Lo que este módulo **no** hace: hablar con el equipo. Es una función pura
 * sobre los cuerpos de respuesta, y por eso se prueba con los documentos de la
 * guía. Quien los pide es el diagnóstico.
 */

/** De dónde salió cada señal. Se conserva: el operador tiene que poder mirarlo. */
export type FuenteDeCapacidad = 'sistema' | 'itc' | 'trafico' | 'modo_de_disparo';

export interface SenalDeCapacidad {
  readonly fuente: FuenteDeCapacidad;
  readonly campo: string;
  readonly valor: string;
}

export interface CuerposDeCapacidad {
  readonly sistema?: string;
  readonly itc?: string;
  readonly trafico?: string;
  readonly modoDeDisparo?: string;
}

export interface VeredictoDeCapacidadAnpr {
  /** `true` si al menos una de las cuatro señales lo confirma. */
  readonly admite: boolean;
  readonly senales: readonly SenalDeCapacidad[];
  /** Consultas que no se pudieron hacer o no contestaron. */
  readonly sinRespuesta: readonly FuenteDeCapacidad[];
  readonly detalle: string;
}

/** Campos que confirman reconocimiento de matrícula, por fuente. */
const CAMPOS: Readonly<Record<FuenteDeCapacidad, readonly string[]>> = {
  sistema: ['isSupportVehicleDetection', 'isSupportHVTVehicleDetection'],
  itc: ['isSupportVehicleDetection', 'isSupportHVTVehicleDetection'],
  trafico: ['plateCap'],
  modo_de_disparo: ['TriggerMode'],
};

const senalesDe = (fuente: FuenteDeCapacidad, cuerpo: string): readonly SenalDeCapacidad[] => {
  const encontradas: SenalDeCapacidad[] = [];
  for (const campo of CAMPOS[fuente]) {
    // Un campo de capacidad puede venir como valor booleano o como bloque con
    // opciones. Su mera presencia como bloque ya es la declaración; leer sólo
    // el valor dejaría fuera a `plateCap` y `TriggerMode`, que son bloques.
    const valor = etiqueta(cuerpo, campo);
    const presenteComoBloque = new RegExp(`<(?:\\w+:)?${campo}\\b`, 'i').test(cuerpo);
    if (valor !== null) {
      if (booleano(valor) === false) continue;
      encontradas.push({ fuente, campo, valor });
    } else if (presenteComoBloque) {
      encontradas.push({ fuente, campo, valor: 'declarado' });
    }
  }
  return encontradas;
};

export const juzgarCapacidadesAnpr = (cuerpos: CuerposDeCapacidad): VeredictoDeCapacidadAnpr => {
  const entradas: readonly (readonly [FuenteDeCapacidad, string | undefined])[] = [
    ['sistema', cuerpos.sistema],
    ['itc', cuerpos.itc],
    ['trafico', cuerpos.trafico],
    ['modo_de_disparo', cuerpos.modoDeDisparo],
  ];

  const senales = entradas.flatMap(([fuente, cuerpo]) =>
    cuerpo === undefined || cuerpo.trim() === '' ? [] : senalesDe(fuente, cuerpo),
  );
  const sinRespuesta = entradas
    .filter(([, cuerpo]) => cuerpo === undefined || cuerpo.trim() === '')
    .map(([fuente]) => fuente);

  const admite = senales.length > 0;
  return {
    admite,
    senales,
    sinRespuesta,
    detalle: admite
      ? `El equipo declara reconocimiento de matrícula en ${String(senales.length)} señal(es): ` +
        senales.map((s) => `${s.fuente}·${s.campo}`).join(', ')
      : sinRespuesta.length === entradas.length
        ? 'Ninguna de las cuatro consultas de capacidad contestó: no se puede afirmar que este ' +
          'equipo reconozca matrículas, y el fabricante dice que no se siga adelante'
        : 'Ninguna de las consultas que contestaron declara reconocimiento de matrícula. El ' +
          'fabricante dice que no se siga adelante: este modelo no es una cámara de placa',
  };
};
