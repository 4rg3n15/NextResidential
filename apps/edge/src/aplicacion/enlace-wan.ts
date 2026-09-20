/**
 * Detección de pérdida de WAN y conmutación a modo autónomo (CU-04, HU-30).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ NO BASTA CON «FALLÓ LA PETICIÓN → ESTOY OFFLINE»
 *
 * Un enlace de una portería no cae limpiamente: pierde un paquete, vuelve,
 * pierde tres, vuelve. Si una sonda fallida bastara para conmutar, el gateway
 * pasaría el día entrando y saliendo del modo autónomo, y cada entrada y salida
 * arrastra trabajo real —vaciar la bandeja, recargar reglas, registrar el
 * cambio—. El resultado sería un equipo ocupado en cambiar de modo en vez de
 * abrir puertas.
 *
 * Por eso hay **histéresis**: hacen falta N sondas fallidas seguidas para caer
 * y M correctas seguidas para volver, y los dos números son configurables y
 * distintos a propósito. Caer cuesta caro —se deja de intentar la nube— así que
 * se exige más evidencia; volver es barato y reversible, así que se exige menos.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ES UNA FUNCIÓN PURA, Y ESO ES LO QUE LA HACE PROBABLE
 *
 * `(estado, sonda) => estado`. Sin temporizadores, sin red y sin reloj leído por
 * dentro. Una secuencia de cien sondas se prueba en un bucle de cien
 * iteraciones, incluidas las de 24 horas de KPI-30, que de otro modo durarían
 * 24 horas.
 */

export type ModoDelEnlace = 'en_linea' | 'autonomo';

export interface EstadoDelEnlace {
  readonly modo: ModoDelEnlace;
  /** Sondas consecutivas en el sentido contrario al modo actual. */
  readonly consecutivas: number;
  /** Última vez que una sonda salió bien. Es lo que mide la autonomía. */
  readonly ultimoContacto: Date | null;
}

export interface UmbralesDelEnlace {
  readonly sondasParaCaer: number;
  readonly sondasParaVolver: number;
}

/**
 * Arranca **en modo autónomo**, no en línea.
 *
 * Es §2.1.4 aplicado al arranque: un gateway que se enciende suponiendo que hay
 * nube intentaría la nube con cada hecho hasta que la primera sonda fallara, y
 * durante ese rato los accesos esperarían a un tiempo de espera de red. Empezar
 * autónomo hace que la primera sonda correcta sea la que conmuta, y hasta
 * entonces se decide localmente, que es lo que el equipo sabe hacer solo.
 */
export const enlaceInicial = (): EstadoDelEnlace => ({
  modo: 'autonomo',
  consecutivas: 0,
  ultimoContacto: null,
});

export const registrarSonda = (
  estado: EstadoDelEnlace,
  sonda: { readonly correcta: boolean; readonly ahora: Date },
  umbrales: UmbralesDelEnlace,
): EstadoDelEnlace => {
  const ultimoContacto = sonda.correcta ? sonda.ahora : estado.ultimoContacto;

  if (estado.modo === 'en_linea') {
    if (sonda.correcta) return { modo: 'en_linea', consecutivas: 0, ultimoContacto };
    const consecutivas = estado.consecutivas + 1;
    return consecutivas >= umbrales.sondasParaCaer
      ? { modo: 'autonomo', consecutivas: 0, ultimoContacto }
      : { modo: 'en_linea', consecutivas, ultimoContacto };
  }

  if (!sonda.correcta) return { modo: 'autonomo', consecutivas: 0, ultimoContacto };
  const consecutivas = estado.consecutivas + 1;
  return consecutivas >= umbrales.sondasParaVolver
    ? { modo: 'en_linea', consecutivas: 0, ultimoContacto }
    : { modo: 'autonomo', consecutivas, ultimoContacto };
};

/**
 * Cuánto lleva sin hablar con la nube. `null` si nunca lo ha conseguido, que no
 * es lo mismo que «cero minutos» y no debe redondearse a cero: un equipo recién
 * instalado que nunca contactó es un problema de despliegue, no un corte.
 */
export const minutosSinContacto = (estado: EstadoDelEnlace, ahora: Date): number | null =>
  estado.ultimoContacto === null
    ? null
    : Math.max(0, (ahora.getTime() - estado.ultimoContacto.getTime()) / 60_000);
