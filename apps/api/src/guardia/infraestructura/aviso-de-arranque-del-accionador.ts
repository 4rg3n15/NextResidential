import type { Bitacora } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ ACCIONADOR ESTÁ ACTIVO SE DICE AL ARRANCAR · ETAPA 15-D (O5)
 *
 * El accionador de puerta se elige por entorno: con `BARRERA_HOST`, usuario y
 * clave hay un control REAL de barrera; sin ellos, todo es simulado. Hasta
 * ahora la elección era muda, y un despliegue en el que faltara una variable
 * —o sobrara: barrera real declarada y `BARRERA_DISPOSITIVO_ID` en blanco—
 * arrancaba igual, abría «con éxito» en la bitácora y no movía ningún brazo.
 *
 * Igual que el proveedor de equipos y el cargador de contexto, se dice en la
 * primera línea del arranque, con su consecuencia. Es una función pura sobre
 * el veredicto de la composición, para que se pueda probar sin arrancar Nest.
 */
export interface EstadoDelAccionador {
  /** Si `crearControlDeBarreraDesdeEntorno` devolvió un control real. */
  readonly hayControlReal: boolean;
  /** `BARRERA_DISPOSITIVO_ID`, ya recortado. */
  readonly dispositivoReal: string;
}

export interface AvisoDeArranque {
  readonly nivel: 'info' | 'aviso';
  readonly mensaje: string;
  readonly contexto: Readonly<Record<string, string | boolean>>;
}

export const avisoDeArranqueDelAccionador = (estado: EstadoDelAccionador): AvisoDeArranque => {
  if (!estado.hayControlReal) {
    return {
      nivel: 'aviso',
      mensaje: 'accionador de puerta activo: SIMULADO',
      contexto: {
        accionador: 'simulado',
        consecuencia:
          'ninguna orden de apertura mueve un brazo real; toda apertura queda registrada como ' +
          'atendida por el proveedor SIMULADO. Declare BARRERA_HOST, BARRERA_USUARIO, ' +
          'BARRERA_CLAVE y BARRERA_DISPOSITIVO_ID para la barrera real',
      },
    };
  }
  if (estado.dispositivoReal === '') {
    return {
      nivel: 'aviso',
      mensaje: 'accionador de puerta: barrera REAL declarada pero SIN dispositivo asignado',
      contexto: {
        accionador: 'simulado',
        consecuencia:
          'BARRERA_HOST está declarada y BARRERA_DISPOSITIVO_ID no: ninguna orden llegará a la ' +
          'barrera real, todas las atenderá el simulado. Declare el identificador del equipo',
      },
    };
  }
  return {
    nivel: 'info',
    mensaje: 'accionador de puerta activo: barrera REAL por entorno',
    contexto: {
      accionador: 'real',
      dispositivoId: estado.dispositivoReal,
      consecuencia:
        'las órdenes de ese dispositivo se emiten al equipo declarado por entorno; el resto, al simulado',
    },
  };
};

/** Escribe el aviso en la bitácora. Separado para que la función de arriba siga pura. */
export const anunciarAccionador = (bitacora: Bitacora, estado: EstadoDelAccionador): void => {
  const aviso = avisoDeArranqueDelAccionador(estado);
  bitacora.registrar(aviso.nivel, aviso.mensaje, { ...aviso.contexto });
};
