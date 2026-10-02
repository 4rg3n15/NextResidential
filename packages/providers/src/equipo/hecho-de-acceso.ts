/**
 * 15-Q · Q3 · Qué HECHO DE ACCESO es un evento de equipo, escrito una sola vez.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTO NO PUEDE VIVIR EN DOS SITIOS
 *
 * Con la decisión P-27 (B), la nube y el Edge escuchan los MISMOS equipos: la
 * nube decide mientras hay WAN y el Edge cuando no la hay. En el borde entre
 * los dos —los segundos en que el enlace se está cayendo, o el reenvío de la
 * bandeja al volver— un mismo paso por la talanquera puede llegar a la nube por
 * los dos caminos. Lo que impide que quede dos veces en una tabla que no admite
 * corrección (RN-03) es la clave de idempotencia (RN-17, CA-22), y la clave se
 * construye con `referenciaExterna` y `metodo`.
 *
 * Si el ingestor de la API y el del Edge calcularan la referencia cada uno a su
 * manera, el mismo hecho produciría dos claves y la reconciliación lo tomaría
 * por un acceso nuevo. Nada fallaría: el histórico mostraría dos entradas por
 * un vehículo. Por eso la regla vive AQUÍ y los dos la importan.
 *
 * Lo que NO hace: decidir. Traduce un evento del fabricante a los campos del
 * hecho; quién entra lo dice el motor del dominio, en la nube o en el Edge.
 */
import type { EventoDeEquipo } from '../hikvision/contratos-de-evento';

/**
 * [SUPUESTO] S-40 · LA CONFIANZA DE UN ROSTRO QUE LA TERMINAL YA RECONOCIÓ.
 *
 * El evento de control de acceso no trae una confianza comparable a la de la
 * placa: la terminal ya comparó contra su biblioteca con su propio umbral y
 * sólo publica cuando reconoció. Se entrega 1 al motor —«identificación
 * cierta»— y se deja escrito: si el firmware publica una similitud, se lee de
 * ahí (`confianza` del evento) y este valor deja de usarse. No es decidir por
 * el equipo: la autorización, la vigencia, la lista negra y el consentimiento
 * siguen siendo del motor. (Vivía en el ingestor de la API hasta la 15-Q.)
 */
export const CONFIANZA_DE_ROSTRO_RECONOCIDO = 1;

export interface HechoDeAccesoDelEquipo {
  readonly metodo: 'placa' | 'facial';
  readonly referenciaExterna: string;
  readonly confianza: number;
  readonly placaLeida: string | null;
  /**
   * El identificador con que la TERMINAL reconoció (`employeeNo`): es la
   * plantilla, no la persona. Quién es la persona lo resuelve quien conoce el
   * padrón —la base en la nube, la instantánea en el Edge—, nunca el equipo.
   */
  readonly plantillaId: string | null;
  /** La terminal en verificación remota está esperando el veredicto. */
  readonly esperaVeredicto: boolean;
}

/** La referencia de una lectura de placa. Sin la del equipo, placa + instante. */
export const referenciaDePlaca = (evento: EventoDeEquipo): string =>
  evento.referenciaDelEquipo ?? `${evento.placa ?? ''}-${String(+evento.ocurridoEn)}`;

/** La referencia de un rostro. Sin la del equipo, plantilla + serie (o instante). */
export const referenciaDeRostro = (evento: EventoDeEquipo): string =>
  evento.referenciaDelEquipo ??
  `${evento.personaId ?? 'desconocida'}-${String(evento.serieDelEquipo ?? +evento.ocurridoEn)}`;

/**
 * El hecho de acceso de un evento, o `null` si el evento no es un acceso.
 *
 * `null` para lo histórico (ya ocurrió y ya se decidió: volver a decidirlo
 * produciría un segundo evento), para el desenlace de una verificación ya
 * contestada (es informativo) y para todo lo que no es placa ni rostro —puerta,
 * botón, sabotaje, llamada—, que va a la consola y nunca al motor.
 */
export const hechoDeAccesoDe = (evento: EventoDeEquipo): HechoDeAccesoDelEquipo | null => {
  if (!evento.enVivo) return null;
  if (evento.clase === 'placa' && evento.placa !== null) {
    return {
      metodo: 'placa',
      referenciaExterna: referenciaDePlaca(evento),
      // Sin confianza declarada, 0 y no 1: el umbral de lectura dudosa (CU-01,
      // excepción 3a) tiene que poder actuar.
      confianza: evento.confianza ?? 0,
      placaLeida: evento.placa,
      plantillaId: null,
      esperaVeredicto: false,
    };
  }
  if (evento.clase === 'rostro' && !evento.esResultadoDeVerificacion) {
    return {
      metodo: 'facial',
      referenciaExterna: referenciaDeRostro(evento),
      confianza: evento.confianza ?? CONFIANZA_DE_ROSTRO_RECONOCIDO,
      placaLeida: null,
      plantillaId: evento.personaId,
      esperaVeredicto: evento.esperaVeredicto,
    };
  }
  return null;
};
