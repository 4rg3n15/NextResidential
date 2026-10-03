import type { EnvioPendiente } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E6 · P-31 · LO QUE LA NUBE NUNCA ACEPTARÁ NO BLOQUEA LA BANDEJA
 *
 * Un evento que la nube RECHAZA (contestó, y dijo que no: una placa ilegible,
 * una decisión sin motivo) se reintentaba para siempre y, como la bandeja se
 * vacía EN ORDEN, todo lo que venía detrás esperaba con él. Ahora:
 *
 *  · tras `RECONCILIACION_INTENTOS` rechazos, el envío pasa a la CUARENTENA:
 *    persistida, con su cuerpo, su clave, sus intentos y el MOTIVO de la nube;
 *  · la bandeja sigue con el siguiente;
 *  · nada se descarta en silencio (RN-02): el acceso ocurrió y su constancia
 *    sigue en el Edge, a la vista en el diagnóstico local, y la nube abrió una
 *    alerta persistente al rechazarlo (`edge/aplicacion/alerta-de-rechazo.ts`).
 *
 * Un fallo de TRANSPORTE (sin WAN, 5xx, tiempo agotado) no cuenta: eso no es
 * «nunca», es «ahora no», y apartar un acceso por un corte largo sería perderlo
 * de la vista justo cuando más importa. [SUPUESTO] S-15R-07.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface EnvioEnCuarentena {
  readonly claveIdempotencia: string;
  readonly secuencia: number;
  readonly cuerpo: string;
  readonly encoladoEn: string;
  readonly intentos: number;
  readonly motivo: string;
  readonly apartadoEn: string;
}

export interface Cuarentena {
  /** Saca el envío de la bandeja y lo deja aquí, en UNA operación. */
  apartar(envio: EnvioPendiente, motivo: string, en: Date): void;
  listar(): readonly EnvioEnCuarentena[];
}

/** ¿Este rechazo es el que agota los intentos? Cuenta el que acaba de ocurrir. */
export const agotaLosIntentos = (envio: EnvioPendiente, intentosMaximos: number): boolean =>
  envio.intentos + 1 >= intentosMaximos;

/** La cuarentena con constancia en el registro del Edge: cada apartado, con su motivo. */
export const conConstancia = (
  cuarentena: Cuarentena,
  registrar: (nivel: 'error', mensaje: string, contexto: unknown) => void,
): Cuarentena => ({
  apartar: (envio, motivo, en) => {
    cuarentena.apartar(envio, motivo, en);
    registrar('error', 'acceso apartado a la cuarentena: la nube lo rechaza (P-31)', {
      claveIdempotencia: envio.claveIdempotencia,
      intentos: envio.intentos + 1,
      motivo,
    });
  },
  listar: () => cuarentena.listar(),
});
