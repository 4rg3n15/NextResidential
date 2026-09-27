import { OrdenSinConfirmar } from '../nucleo/errores';
import { comoErrorNeutral, resumenIsapi } from './errores-del-fabricante';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ANEXO 15-K (c) · UNA ESCRITURA SÓLO ESTÁ ACEPTADA CON `statusCode = 1`
 *
 * Toda respuesta de una escritura ISAPI trae su `ResponseStatus` —XML o JSON—
 * con `statusCode` y `subStatusCode`, que la guía marca como requeridos. Se
 * aceptaba un `200` a secas, o con `statusCode 0`: en sitio, una apertura mal
 * formada contestó «OK» y la puerta no se movió. Desde aquí, «aceptada» exige
 * HTTP 2xx, `statusCode = 1` y un `subStatusCode`; lo demás es un error neutral
 * con los cuatro campos del cuerpo (H-SITIO-04), nunca un «aceptada».
 *
 * «Aceptada» sigue sin ser «hecha» (H-1): lo que confirma es la ORDEN.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface RespuestaConfirmable {
  readonly estado: number;
  readonly ok: boolean;
  readonly cuerpo: string;
  readonly desafioVencido?: boolean;
}

export const confirmada = (respuesta: RespuestaConfirmable): boolean => {
  if (!respuesta.ok) return false;
  const r = resumenIsapi(respuesta.cuerpo);
  return r.statusCode === 1 && r.subStatusCode !== null;
};

export const exigirConfirmacion = (
  dispositivoId: string,
  respuesta: RespuestaConfirmable,
): void => {
  if (confirmada(respuesta)) return;
  const r = resumenIsapi(respuesta.cuerpo);
  // Un error del equipo, con su clase neutral: ocupado, avería, credencial…
  if (!respuesta.ok || (r.statusCode !== null && r.statusCode !== 1)) {
    throw comoErrorNeutral(dispositivoId, respuesta.cuerpo, respuesta.estado, {
      desafioVencido: respuesta.desafioVencido,
    });
  }
  throw new OrdenSinConfirmar(
    dispositivoId,
    r.statusCode === null
      ? `HTTP ${String(respuesta.estado)} sin statusCode en el cuerpo`
      : 'statusCode 1 sin subStatusCode',
  );
};
