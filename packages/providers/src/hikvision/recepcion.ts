import { abrirSobreDeAlarmServer } from './publicacion-alarm-server';
import { desdeAlarmServerJson, desdeAlarmServerXml } from './contratos-de-evento';
import type { PublicacionDeEquipo } from '../equipo/fuente-de-placas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA ENTRADA ÚNICA DEL TRANSPORTE DE ESCUCHA
 *
 * El equipo publica en nuestro receptor y el receptor vive en la capa de
 * presentación de la API, que es donde debe estar: lo que llega es un protocolo
 * HTTP con su sobre. Lo que **no** debe estar allí es el vocabulario del
 * fabricante — y hasta la 15-C la capa de presentación abría el sobre, leía el
 * XML, miraba `alarmDataType` y decidía qué contestar.
 *
 * Aquí se hace todo eso, y lo que cruza la frontera es un desenlace en
 * lenguaje del dominio. La API ya no nombra ni una etiqueta del fabricante.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NO LANZA NUNCA, Y ESO LO IMPONE EL PROTOCOLO
 *
 * La guía del fabricante dice que si el integrador no responde, el equipo da la
 * notificación por perdida y **la sube otra vez**. Un sobre roto que produjera
 * una excepción acabaría en un `500`, el equipo lo leería como «no te he
 * recibido» y lo reenviaría en bucle con el mismo resultado.
 *
 * Por eso cada desenlace es un valor y no una excepción: quien recibe puede
 * contestar `200 OK` siempre —que es lo que el protocolo exige— y registrar el
 * rechazo donde alguien pueda verlo.
 */

export type DesenlaceDeRecepcion =
  /** El sobre no se pudo abrir. Se responde 200 igual y se registra. */
  | 'ilegible'
  /** El equipo marcó el evento como histórico: no ocurre ahora. */
  | 'historico'
  /** Llegó, pero no traía lectura de placa. */
  | 'sin_placa'
  /** Una lectura utilizable. Es lo único que sigue adelante. */
  | 'lectura';

export interface RecepcionDeEquipo {
  readonly desenlace: DesenlaceDeRecepcion;
  /** La publicación, cuando el desenlace es `lectura`. */
  readonly publicacion: PublicacionDeEquipo | null;
  /** Cuántos recortes de ROSTRO venían y se rechazaron (H-16-1). */
  readonly partesBiometricasRechazadas: number;
  /** Partes que llegaron y no se supieron clasificar. Se cuentan. */
  readonly partesNoClasificadas: number;
  /**
   * `true` cuando el equipo emitió una hora sin desplazamiento horario. No es
   * un detalle de formato: interpretarla en la zona del proceso corre el evento
   * las horas que separen al servidor del conjunto.
   */
  readonly horaSinDesplazamiento: boolean;
  /** Para el registro, en lenguaje del operador. */
  readonly motivo: string;
}

const sinPublicacion = (
  desenlace: DesenlaceDeRecepcion,
  motivo: string,
  extras: Partial<RecepcionDeEquipo> = {},
): RecepcionDeEquipo => ({
  desenlace,
  publicacion: null,
  partesBiometricasRechazadas: 0,
  partesNoClasificadas: 0,
  horaSinDesplazamiento: false,
  motivo,
  ...extras,
});

/**
 * Abre lo que el equipo publicó y devuelve qué es.
 *
 * `ahora` es el reloj **inyectado**: la hora de recepción es la única cierta
 * cuando el equipo emite una marca inutilizable, y usar `new Date()` aquí
 * dentro haría la normalización imposible de probar.
 */
export const recibirPublicacionDeEquipo = (
  cuerpo: Buffer,
  tipoDeContenido: string | null | undefined,
  dispositivoId: string,
  ahora: Date,
): RecepcionDeEquipo => {
  let sobre;
  try {
    sobre = abrirSobreDeAlarmServer(cuerpo, tipoDeContenido);
  } catch (error) {
    // Nada del cuerpo recibido sale: sólo por qué no se pudo abrir.
    return sinPublicacion('ilegible', error instanceof Error ? error.message : 'envío ilegible');
  }

  // Mismo `EventoDeEquipo` venga en XML o en JSON (6.7a): el resto del sistema
  // no sabe en qué idioma habló la cámara.
  const evento =
    sobre.formato === 'json'
      ? desdeAlarmServerJson(sobre.documento, dispositivoId, ahora)
      : desdeAlarmServerXml(sobre.documento, dispositivoId, ahora);
  const comunes = {
    partesBiometricasRechazadas: sobre.partesBiometricasRechazadas,
    partesNoClasificadas: sobre.partesNoClasificadas,
  };

  if (evento === null) {
    return sinPublicacion('ilegible', 'el sobre no traía un evento reconocible', comunes);
  }
  if (!evento.enVivo) {
    return sinPublicacion('historico', 'el equipo lo marcó histórico', {
      ...comunes,
      horaSinDesplazamiento: evento.horaSinDesplazamiento,
    });
  }
  if (evento.clase !== 'placa' || evento.placa === null) {
    return sinPublicacion('sin_placa', 'sin lectura de placa', {
      ...comunes,
      horaSinDesplazamiento: evento.horaSinDesplazamiento,
    });
  }

  return {
    desenlace: 'lectura',
    publicacion: {
      evento,
      foto: sobre.foto,
      recorte: sobre.recorte,
      transporte: 'escucha',
    },
    ...comunes,
    horaSinDesplazamiento: evento.horaSinDesplazamiento,
    motivo: 'lectura de placa',
  };
};
