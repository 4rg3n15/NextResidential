import type { FichaDelEquipo, HallazgoDelEquipo } from '@ncr/providers';
import type { DatosDeEquipo, ResultadoDeSondeo, TipoDeEquipo } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E4 / E5 (ETAPA 15-M) · LO QUE LA FICHA DE UN EQUIPO EN SERVICIO AÑADE
 *
 *  · 7 · «¿Publica en ESTA plataforma?»: el receptor que el equipo tiene
 *    escrito, comparado con la IP del Mac hacia el equipo, el puerto de la API
 *    y la ruta del servidor de alarmas. En sitio los tres equipos apuntaban a
 *    un receptor de otra configuración y nadie lo veía.
 *  · 10 · «dato del DD-MM-YYYY»: cuando el sondeo actual falla, modelo y
 *    firmware no son de hoy; se enseñan con la fecha en que se leyeron.
 *
 * Funciones puras: sin I/O, sin reloj propio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ReceptorEsperado {
  /** `null` cuando no se sabe (el Mac no tiene IP en la red del equipo): con el motivo. */
  readonly ip: string | null;
  readonly motivo?: string;
  readonly puerto: number;
}

export interface ReceptorLeidoDeLaFicha {
  readonly host: string | null;
  readonly puerto: number | null;
  readonly ruta: string;
}

/** El primer tramo de la ruta del servidor de alarmas de la API. */
const PREFIJO = '/alarm-server/';

const esDeLaPlataforma = (r: ReceptorLeidoDeLaFicha, e: ReceptorEsperado): boolean =>
  e.ip !== null &&
  (r.host ?? '').toLowerCase() === e.ip.toLowerCase() &&
  (r.puerto ?? 80) === e.puerto &&
  r.ruta.startsWith(PREFIJO);

const nombrar = (r: ReceptorLeidoDeLaFicha): string =>
  `${r.host ?? '(sin dirección)'}:${String(r.puerto ?? 80)} ${r.ruta}`;

/**
 * El hallazgo «receptor de eventos» de la CÁMARA, que sí necesita publicar.
 * Para la terminal y el videoportero el paquete de proveedores ya deja el
 * hallazgo del receptor huérfano; aquí sólo se añade si además apunta a esta
 * plataforma, para que el operador sepa que tampoco hace falta.
 */
export const hallazgoDelReceptorDeLaPlataforma = (
  receptores: readonly ReceptorLeidoDeLaFicha[],
  esperado: ReceptorEsperado,
  tipo: TipoDeEquipo,
): HallazgoDelEquipo | null => {
  const donde =
    esperado.ip === null
      ? `no se sabe a qué dirección debe publicar: ${esperado.motivo ?? 'sin IP hacia el equipo'}`
      : `esta plataforma: ${esperado.ip}:${String(esperado.puerto)} ${PREFIJO}••••`;
  const leidos = receptores.map(nombrar).join(' · ');
  const alguno = receptores.some((r) => esDeLaPlataforma(r, esperado));
  if (tipo === 'terminal_facial' || tipo === 'intercom') {
    if (!alguno) return null;
    return {
      campo: 'receptor de eventos · destino',
      estado: 'aviso',
      valorLeido: leidos,
      valorCorrecto: 'ninguno: la plataforma escucha a este equipo',
      detalle:
        'Apunta a esta plataforma, pero este equipo no necesita publicar: la API lo escucha por ' +
        'su flujo. Puede apagarlo con «Desactivar el receptor huérfano»',
      correccion: 'desactivar_receptor',
    };
  }
  if (tipo !== 'camara_lpr') return null;
  const base = { campo: 'receptor de eventos (servidor de alarmas)', correccion: null } as const;
  if (receptores.length === 0) {
    return {
      ...base,
      estado: 'bloqueo',
      valorLeido: null,
      valorCorrecto: donde,
      detalle:
        'La cámara no publica a nadie: ninguna lectura llegará a la plataforma. Pulse ' +
        '«Enviar eventos a este Mac»',
    };
  }
  if (alguno) {
    return {
      ...base,
      estado: 'conforme',
      valorLeido: leidos,
      valorCorrecto: donde,
      detalle: 'La cámara publica en esta plataforma: sus lecturas llegan al receptor de la API',
    };
  }
  return {
    ...base,
    estado: esperado.ip === null ? 'no_comprobado' : 'bloqueo',
    valorLeido: leidos,
    valorCorrecto: donde,
    detalle:
      esperado.ip === null
        ? 'No se pudo comparar: el Mac no tiene una dirección en la red de la cámara'
        : 'La cámara publica a OTRA dirección (un resto de otra configuración): sus lecturas no ' +
          'llegan aquí. Pulse «Enviar eventos a este Mac»',
  };
};

/** La ficha con el hallazgo del receptor de la plataforma añadido, si aplica. */
export const conReceptorDeLaPlataforma = (
  ficha: FichaDelEquipo,
  esperado: ReceptorEsperado,
  tipo: TipoDeEquipo,
): FichaDelEquipo => {
  const receptores = ficha.receptores;
  if (receptores === undefined) return ficha;
  const hallazgo = hallazgoDelReceptorDeLaPlataforma(receptores, esperado, tipo);
  return hallazgo === null ? ficha : { ...ficha, hallazgos: [...ficha.hallazgos, hallazgo] };
};

/**
 * 10 · si el sondeo actual NO leyó modelo y firmware, la ficha enseña los
 * guardados con la fecha en que se leyeron («dato del …»), nunca como de hoy.
 */
export const conDatosGuardados = (
  veredicto: ResultadoDeSondeo,
  equipo: Pick<DatosDeEquipo, 'modelo' | 'firmware' | 'identidadLeidaEn'>,
): ResultadoDeSondeo & { readonly identidadDel: string | null } => {
  if (veredicto.modelo !== null) return { ...veredicto, identidadDel: null };
  return {
    ...veredicto,
    modelo: equipo.modelo,
    firmware: veredicto.firmware ?? equipo.firmware,
    identidadDel: equipo.modelo === null ? null : equipo.identidadLeidaEn,
  };
};
