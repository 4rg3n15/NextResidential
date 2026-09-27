import type { ResultadoAccionamiento } from '@ncr/domain-core';
import type { ClienteDeEquipo } from './cliente';
import { EquipoInalcanzable } from './cliente';
import type { RutaDeEquipo } from './catalogo-de-rutas';
import { exigirConfirmacion } from './confirmacion-isapi';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * APERTURA REMOTA DE PUERTA · terminal facial y videoportero
 *
 * H-SITIO-13 · en sitio los dos equipos contestaron «OK» y la puerta no se
 * movió. **Causa demostrada** (anexo 15-K): el cuerpo sin espacio de nombres ni
 * `version="2.0"` se contesta «OK» y no acciona. Lo que abrió, y lo que se
 * envía desde ahora:
 *
 *  1. El cuerpo y el Content-Type **de la ruta del catálogo**, declarados por
 *     familia tal como abrieron en sitio. Una ruta sin cuerpo declarado no se
 *     envía: no se improvisa uno aquí.
 *  2. El Digest con el cuerpo YA en la primera petición (la que recibe el 401):
 *     lo hace `ClienteDeEquipo`, que nunca sondea con el cuerpo vacío
 *     (H-SITIO-15).
 *  3. «Aceptada» sólo con `statusCode = 1` y su `subStatusCode`
 *     (`confirmacion-isapi.ts`). La petición y la respuesta van enteras a la
 *     bitácora, saneadas.
 *
 * `aceptado: true` sigue significando «el equipo aceptó la orden» (H-1): sin
 * señal de posición cableada, nadie en este sistema puede decir «abierta».
 * ═════════════════════════════════════════════════════════════════════════════
 */
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
    if (ruta.cuerpo === undefined) {
      throw new Error(`la ruta «${ruta.proposito}» no declara el cuerpo de la apertura`);
    }
    const respuesta = await cliente.pedir(ruta.metodo, ruta.ruta, ruta.cuerpo, {
      registrarIntercambio: 'apertura remota de puerta',
    });
    if (NO_SOPORTADO.test(respuesta.cuerpo)) throw new AperturaNoSoportada(ruta.ruta);
    // Un rechazo del equipo sale con su clase neutral: ocupado se reintenta,
    // credencial no, avería tampoco. «aceptado: false» a secas escondía cuál.
    exigirConfirmacion(dispositivoId, respuesta);
    return { aceptado: true, latenciaMs: respuesta.latenciaMs };
  } catch (error) {
    if (error instanceof EquipoInalcanzable) {
      return { aceptado: false, latenciaMs: error.latenciaMs };
    }
    throw error;
  }
};
