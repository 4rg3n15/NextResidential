import type { Bitacora } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ ACCIONADOR ATIENDE A CADA DISPOSITIVO SE DICE AL ARRANCAR · O5, 15-E
 *
 * Desde la 15-E hay una regla y no un `if`: **todo dispositivo** va por el
 * proveedor de equipos (`PROVEEDOR_DE_EQUIPOS`, resuelto por registro y por
 * capacidad), salvo el que `BARRERA_DISPOSITIVO_ID` nombre, que va por el
 * control de barrera del entorno mientras esa compatibilidad exista. El aviso
 * enuncia la regla completa para que quien lea el arranque sepa, sin abrir el
 * código, por dónde saldrá cada orden.
 *
 * Es una función pura sobre el veredicto de la composición: se prueba sin Nest.
 */
export interface EstadoDelAccionador {
  /** La clase del proveedor de equipos activa: `simulado` o el adaptador real. */
  readonly clase: string;
  /** Si `crearControlDeBarreraDesdeEntorno` devolvió un control real. */
  readonly hayControlDeEntorno: boolean;
  /** `BARRERA_DISPOSITIVO_ID`, ya recortado. */
  readonly dispositivoDeEntorno: string;
}

export interface AvisoDeArranque {
  readonly nivel: 'info' | 'aviso';
  readonly mensaje: string;
  readonly contexto: Readonly<Record<string, string | boolean>>;
}

export const avisoDeArranqueDelAccionador = (estado: EstadoDelAccionador): AvisoDeArranque => {
  const simulado = estado.clase === 'simulado';
  const reglaDelProveedor = simulado
    ? 'todo dispositivo lo atiende el proveedor SIMULADO: ninguna orden mueve un brazo real'
    : `todo dispositivo dado de alta en la consola lo atiende el proveedor ${estado.clase}, ` +
      'resuelto por registro de equipos y decidido por capacidades';

  if (!estado.hayControlDeEntorno) {
    return {
      nivel: simulado ? 'aviso' : 'info',
      mensaje: `accionador de puertas: proveedor ${estado.clase} para todos los dispositivos`,
      contexto: {
        accionador: simulado ? 'simulado' : 'proveedor',
        clase: estado.clase,
        compatibilidadBarrera: false,
        consecuencia: `${reglaDelProveedor}. BARRERA_* no está declarada`,
      },
    };
  }
  if (estado.dispositivoDeEntorno === '') {
    return {
      nivel: 'aviso',
      mensaje: 'accionador de puertas: BARRERA_* declarada pero SIN dispositivo asignado',
      contexto: {
        accionador: simulado ? 'simulado' : 'proveedor',
        clase: estado.clase,
        compatibilidadBarrera: true,
        consecuencia:
          'BARRERA_HOST está declarada y BARRERA_DISPOSITIVO_ID no: ninguna orden irá por el ' +
          `control de barrera del entorno. ${reglaDelProveedor}`,
      },
    };
  }
  return {
    nivel: 'info',
    mensaje: `accionador de puertas: barrera por entorno para ${estado.dispositivoDeEntorno}; proveedor ${estado.clase} para el resto`,
    contexto: {
      accionador: 'mixto',
      clase: estado.clase,
      compatibilidadBarrera: true,
      dispositivoId: estado.dispositivoDeEntorno,
      consecuencia:
        'las órdenes de ese dispositivo van por el control de barrera VERIFICADO del entorno ' +
        `(compatibilidad declarada); ${reglaDelProveedor}`,
    },
  };
};

/** Escribe el aviso en la bitácora. Separado para que la función de arriba siga pura. */
export const anunciarAccionador = (bitacora: Bitacora, estado: EstadoDelAccionador): void => {
  const aviso = avisoDeArranqueDelAccionador(estado);
  bitacora.registrar(aviso.nivel, aviso.mensaje, { ...aviso.contexto });
};
