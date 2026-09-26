import type { ResultadoAccionamiento } from '@ncr/domain-core';
import type { ClienteDeEquipo } from './cliente';
import { EquipoInalcanzable } from './cliente';
import { CUERPO_DE_APERTURA_REMOTA } from './catalogo-de-rutas';
import type { RutaDeEquipo } from './catalogo-de-rutas';
import { comoErrorNeutral } from './errores-del-fabricante';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * APERTURA REMOTA DE PUERTA · terminal facial y videoportero
 *
 * H-SITIO-13 · en sitio los dos equipos contestaron «OK» y la puerta no se
 * movió. Tres cosas cambian aquí, y NINGUNA afirma que la puerta se abrió:
 *
 *  1. El cuerpo es el de la guía de control de acceso («Remote Door Control»):
 *     declaración XML, espacio de nombres y `version="2.0"`, que la guía marca
 *     como atributo REQUERIDO. Se enviaba `<RemoteControlDoor><cmd>open…` a
 *     secas. Alinearlo es lo demostrable; que baste para mover el relé, no —
 *     queda como hipótesis en el informe 15-K—.
 *  2. La petición y la respuesta van ENTERAS a la bitácora, saneadas, para
 *     compararlas con la guía la próxima visita.
 *  3. El código ISAPI del cuerpo decide en los dos equipos: 0 y 1 son OK
 *     (tabla de `ResponseStatus`); cualquier otro es rechazo con su motivo.
 *     La terminal sólo miraba el HTTP.
 *
 * `aceptado: true` sigue significando «el equipo aceptó la orden» (H-1): sin
 * señal de posición cableada, nadie en este sistema puede decir «abierta».
 * ═════════════════════════════════════════════════════════════════════════════
 */
export { CUERPO_DE_APERTURA_REMOTA };

const NO_SOPORTADO = /notSupport|invalidOperation|notSupported/i;

export class AperturaNoSoportada extends Error {
  constructor(readonly ruta: string) {
    super(
      `El equipo no soporta la apertura remota en ${ruta}. Capture la respuesta con ` +
        '`puesta-en-marcha-equipos.mjs --capturar` y corrija el catálogo',
    );
    this.name = 'AperturaNoSoportada';
  }
}

export const abrirPuertaRemota = async (
  cliente: ClienteDeEquipo,
  ruta: RutaDeEquipo,
  dispositivoId: string,
): Promise<ResultadoAccionamiento> => {
  try {
    const respuesta = await cliente.pedir(
      ruta.metodo,
      ruta.ruta,
      { tipo: 'application/xml', contenido: CUERPO_DE_APERTURA_REMOTA },
      { registrarIntercambio: 'apertura remota de puerta' },
    );
    if (NO_SOPORTADO.test(respuesta.cuerpo)) throw new AperturaNoSoportada(ruta.ruta);
    // Un rechazo del equipo sale con su clase neutral: ocupado se reintenta,
    // credencial no, avería tampoco. «aceptado: false» a secas escondía cuál.
    const codigo = /<statusCode>\s*(\d+)\s*<\/statusCode>|"statusCode"\s*:\s*(\d+)/i.exec(
      respuesta.cuerpo,
    );
    const valor = codigo?.[1] ?? codigo?.[2];
    if (!respuesta.ok || (valor !== undefined && valor !== '0' && valor !== '1')) {
      throw comoErrorNeutral(dispositivoId, respuesta.cuerpo, respuesta.estado, {
        desafioVencido: respuesta.desafioVencido,
      });
    }
    return { aceptado: true, latenciaMs: respuesta.latenciaMs };
  } catch (error) {
    if (error instanceof EquipoInalcanzable) {
      return { aceptado: false, latenciaMs: error.latenciaMs };
    }
    throw error;
  }
};
