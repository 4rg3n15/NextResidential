import { errorDominio } from '../compartido/errores';
import type { ErrorDominio } from '../compartido/errores';
import { exito, fallo } from '../compartido/resultado';
import type { Resultado } from '../compartido/resultado';

/**
 * Exclusividad del canal de audio del intercomunicador — consecuencia de ADR-01.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO ES DOMINIO Y NO UN DETALLE DEL ADAPTADOR
 *
 * El canal de audio del equipo **suele ser exclusivo**: admite una conversación
 * a la vez. Eso parece un detalle del fabricante, y no lo es:
 * de él se derivan decisiones que el operador ve y que quedan auditadas —quién
 * tiene la palabra, quién espera, a quién se le cortó y por qué—. Si viviera en
 * el adaptador del fabricante, la ETAPA 15 tendría que reimplementarla y la
 * consola no podría demostrarse sin hardware, que es lo que ADR-03 prohíbe.
 *
 * (El dominio no nombra fabricante ni protocolo a propósito, ni siquiera en un
 * comentario: KPI-11 lo prohíbe fuera de `packages/providers`, y lo encontró
 * aquí.)
 *
 * Vive aquí, pura y con reloj inyectado, así que la misma máquina de estados
 * gobierna el proveedor simulado de esta etapa y el real de la 15.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LAS TRES DECISIONES
 *
 * 1. **Un titular por dispositivo, y el segundo espera.** No se le rechaza: se
 *    le encola. Rechazar obligaría al operador a reintentar a ciegas contra un
 *    canal que no sabe cuándo se libera, que es la peor interfaz posible en una
 *    portería con un visitante delante.
 * 2. **La liberación por inactividad la decide el RELOJ, no un temporizador.**
 *    Un `setTimeout` vive en el proceso: si el proceso se reinicia, el canal
 *    queda tomado para siempre y nadie puede hablar con esa puerta. Aquí el
 *    vencimiento es un instante comparable, así que cualquier proceso que mire
 *    el estado llega a la misma conclusión.
 * 3. **Ceder no es cerrar.** Al soltar el canal entra el primero de la cola en
 *    el mismo acto y con el mismo reloj: dejarlo libre y esperar a que alguien
 *    lo pida otra vez abre una ventana en la que un tercero se cuela por delante
 *    de quien llevaba esperando.
 */

/** Segundos sin actividad tras los que el canal se considera abandonado. */
export const TIMEOUT_DE_CANAL_SEGUNDOS = 90;

export interface TitularDelCanal {
  readonly operadorId: string;
  readonly desde: Date;
  /** Última señal de vida: cada fragmento de audio la renueva. */
  readonly ultimaActividad: Date;
}

export interface EsperaEnCola {
  readonly operadorId: string;
  readonly desde: Date;
}

export interface EstadoDelCanal {
  readonly dispositivoId: string;
  readonly titular: TitularDelCanal | null;
  readonly cola: readonly EsperaEnCola[];
}

export type MotivoDeCierre = 'colgado' | 'timeout' | 'relevo' | 'error_del_equipo';

export const canalLibre = (dispositivoId: string): EstadoDelCanal => ({
  dispositivoId,
  titular: null,
  cola: [],
});

const segundos = (a: Date, b: Date): number => (a.getTime() - b.getTime()) / 1000;

/** `true` si el titular lleva más del margen sin dar señales de vida. */
export const titularAbandonado = (
  estado: EstadoDelCanal,
  ahora: Date,
  margenSegundos: number = TIMEOUT_DE_CANAL_SEGUNDOS,
): boolean =>
  estado.titular !== null && segundos(ahora, estado.titular.ultimaActividad) >= margenSegundos;

/**
 * Retira al titular abandonado y entrega el canal al primero de la cola.
 *
 * Se aplica **antes de cualquier otra operación**: quien pregunta por el estado
 * tiene que ver el que corresponde a este instante, no el que quedó guardado.
 * Es lo que hace que la caducidad no dependa de que alguien la dispare.
 */
export const conVencimientosAplicados = (
  estado: EstadoDelCanal,
  ahora: Date,
  margenSegundos: number = TIMEOUT_DE_CANAL_SEGUNDOS,
): EstadoDelCanal => {
  if (!titularAbandonado(estado, ahora, margenSegundos)) return estado;
  const [siguiente, ...resto] = estado.cola;
  if (siguiente === undefined) return { ...estado, titular: null, cola: [] };
  return {
    ...estado,
    titular: { operadorId: siguiente.operadorId, desde: ahora, ultimaActividad: ahora },
    cola: resto,
  };
};

export interface ResultadoDeSolicitud {
  readonly estado: EstadoDelCanal;
  /** `abierta` si tiene la palabra; `en_espera` si quedó en la cola. */
  readonly resultado: 'abierta' | 'en_espera';
  /** Cuántos van delante. `0` cuando tiene la palabra. */
  readonly porDelante: number;
}

export const solicitarCanal = (
  estado: EstadoDelCanal,
  operadorId: string,
  ahora: Date,
  margenSegundos: number = TIMEOUT_DE_CANAL_SEGUNDOS,
): ResultadoDeSolicitud => {
  const vigente = conVencimientosAplicados(estado, ahora, margenSegundos);

  if (vigente.titular === null) {
    return {
      estado: {
        ...vigente,
        titular: { operadorId, desde: ahora, ultimaActividad: ahora },
      },
      resultado: 'abierta',
      porDelante: 0,
    };
  }

  // Pedirlo dos veces no encola dos veces ni roba el turno: el operador que ya
  // tiene la palabra la conserva, y el que ya espera conserva su puesto.
  if (vigente.titular.operadorId === operadorId) {
    return {
      estado: { ...vigente, titular: { ...vigente.titular, ultimaActividad: ahora } },
      resultado: 'abierta',
      porDelante: 0,
    };
  }
  const yaEnCola = vigente.cola.findIndex((e) => e.operadorId === operadorId);
  if (yaEnCola >= 0) {
    return { estado: vigente, resultado: 'en_espera', porDelante: yaEnCola + 1 };
  }

  return {
    estado: { ...vigente, cola: [...vigente.cola, { operadorId, desde: ahora }] },
    resultado: 'en_espera',
    porDelante: vigente.cola.length + 1,
  };
};

/** Renueva la señal de vida. Falla si quien la manda no tiene la palabra. */
export const renovarActividad = (
  estado: EstadoDelCanal,
  operadorId: string,
  ahora: Date,
  margenSegundos: number = TIMEOUT_DE_CANAL_SEGUNDOS,
): Resultado<EstadoDelCanal, ErrorDominio> => {
  const vigente = conVencimientosAplicados(estado, ahora, margenSegundos);
  if (vigente.titular === null || vigente.titular.operadorId !== operadorId) {
    return fallo(
      errorDominio(
        'OPERACION_NO_PERMITIDA',
        'El canal de audio ya no es tuyo: se liberó por inactividad o lo tomó otro operador',
        'ADR-01',
      ),
    );
  }
  return exito({ ...vigente, titular: { ...vigente.titular, ultimaActividad: ahora } });
};

export interface ResultadoDeCierre {
  readonly estado: EstadoDelCanal;
  /** A quién le toca ahora, si había alguien esperando. */
  readonly nuevoTitular: string | null;
}

/**
 * Suelta el canal. Quien está en la cola puede salirse de ella con la misma
 * operación: no hace falta una segunda, y tener dos formas de «ya no quiero»
 * garantiza que alguna se olvide en la interfaz.
 */
export const soltarCanal = (
  estado: EstadoDelCanal,
  operadorId: string,
  ahora: Date,
  margenSegundos: number = TIMEOUT_DE_CANAL_SEGUNDOS,
): ResultadoDeCierre => {
  const vigente = conVencimientosAplicados(estado, ahora, margenSegundos);

  if (vigente.titular?.operadorId !== operadorId) {
    return {
      estado: { ...vigente, cola: vigente.cola.filter((e) => e.operadorId !== operadorId) },
      nuevoTitular: null,
    };
  }

  const [siguiente, ...resto] = vigente.cola;
  if (siguiente === undefined) return { estado: { ...vigente, titular: null }, nuevoTitular: null };
  return {
    estado: {
      ...vigente,
      titular: { operadorId: siguiente.operadorId, desde: ahora, ultimaActividad: ahora },
      cola: resto,
    },
    nuevoTitular: siguiente.operadorId,
  };
};

/** Segundos que lleva esperando quien está en la cola, para pintarlo. */
export const esperaDe = (
  estado: EstadoDelCanal,
  operadorId: string,
  ahora: Date,
): number | null => {
  const entrada = estado.cola.find((e) => e.operadorId === operadorId);
  return entrada === undefined ? null : Math.max(0, Math.floor(segundos(ahora, entrada.desde)));
};
