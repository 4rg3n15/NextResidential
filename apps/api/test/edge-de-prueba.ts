import {
  CABECERA_EDGE,
  derivarCredencial,
  firmarSolicitud,
  solicitudCanonica,
} from '../src/edge/aplicacion/credencial-del-edge';
import type { GatewayRegistrado } from '../src/edge/aplicacion/puertos';

/**
 * 15-Q · lo que hace el Edge antes de cada petición, para las suites de la API:
 * derivar SU credencial y firmar método, ruta y cuerpo con la marca de ahora.
 * Es la misma cuenta que `apps/edge` hace en su cliente; si las dos divergieran,
 * la prueba de extremo a extremo (`edge-en-sitio-pg.e2e.test.ts`) lo diría.
 */
export const MAESTRA_DE_PRUEBA = 'secreto-de-ingesta-solo-para-pruebas-32+';

export const cabecerasDelEdge = (
  gateway: Pick<GatewayRegistrado, 'id' | 'copropiedadId' | 'credencialRef'>,
  metodo: 'GET' | 'POST',
  ruta: string,
  cuerpo = '',
  opciones: { readonly credencial?: string; readonly ahora?: Date } = {},
): Record<string, string> => {
  const marca = String(Math.floor((opciones.ahora ?? new Date()).getTime() / 1000));
  const credencial =
    opciones.credencial ??
    derivarCredencial(MAESTRA_DE_PRUEBA, {
      copropiedadId: gateway.copropiedadId,
      edgeId: gateway.id,
      credencialRef: gateway.credencialRef,
    });
  return {
    [CABECERA_EDGE]: gateway.id,
    'x-ncr-marca-temporal': marca,
    'x-ncr-firma': firmarSolicitud(credencial, marca, solicitudCanonica(metodo, ruta, cuerpo)),
  };
};
