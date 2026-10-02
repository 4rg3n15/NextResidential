import { createHmac } from 'node:crypto';
import { coincideEnTiempoConstante } from '../../comun/equipos-de-alarm-server';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA CREDENCIAL DE CADA EDGE · 15-Q (Q1, Q5)
 *
 * Hasta la 15-Q el Edge firmaba con el MISMO secreto de ingesta que la API
 * (`INGESTA_FIRMA_SECRETO`): quien tuviera un gateway tenía el secreto de toda
 * la plataforma y podía firmar eventos de cualquier copropiedad. El `.env` del
 * Edge decía «por equipo»; la API no tenía cómo saberlo.
 *
 * Desde la 15-Q cada gateway registrado en `edge_gateways` (D-16) tiene la
 * suya, DERIVADA:
 *
 *     HMAC-SHA256(INGESTA_FIRMA_SECRETO, "ncr-edge|v1|<copropiedad>|<edge>|<credencial_ref>")
 *
 * · La API no guarda ningún secreto nuevo: lo recalcula al verificar. En la
 *   base sólo queda la REFERENCIA (`credencial_ref`, migración 0009), que es lo
 *   que RN-21 pide.
 * · La copropiedad va DENTRO de la derivación: la credencial de un Edge de EL
 *   ROBLE no produce una firma válida para MIRA aunque alguien cambie la fila.
 * · Rotar es cambiar `credencial_ref` (`…/g2`, `…/g3`): la anterior deja de
 *   valer en el acto y nada más cambia. Rotar el secreto maestro invalida a
 *   todos los Edge a la vez; está escrito en DESPLIEGUE_EDGE.md.
 * · El Edge ya NO tiene el secreto maestro: un gateway robado no firma por
 *   otro, ni por la ingesta de las cámaras.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const CABECERA_EDGE = 'x-ncr-edge';

export interface DatosDeCredencial {
  readonly copropiedadId: string;
  readonly edgeId: string;
  readonly credencialRef: string;
}

export const derivarCredencial = (maestra: string, datos: DatosDeCredencial): string =>
  createHmac('sha256', maestra)
    .update(`ncr-edge|v1|${datos.copropiedadId}|${datos.edgeId}|${datos.credencialRef}`)
    .digest('hex');

/**
 * La petición que se firma: método, ruta (con su consulta) y cuerpo crudo. Con
 * sólo la marca y el cuerpo —el esquema de la ingesta— una firma de un `GET`
 * sin cuerpo valdría para CUALQUIER ruta durante la ventana.
 */
export const solicitudCanonica = (metodo: string, ruta: string, cuerpo: string): string =>
  `${metodo.toUpperCase()} ${ruta}\n${cuerpo}`;

export const firmarSolicitud = (credencial: string, marca: string, solicitud: string): string =>
  createHmac('sha256', credencial).update(`${marca}.${solicitud}`).digest('hex');

export type MotivoDeRechazoDelEdge =
  | 'SIN_IDENTIDAD'
  | 'MARCA_INVALIDA'
  | 'FUERA_DE_VENTANA'
  | 'FIRMA_NO_COINCIDE'
  | 'EDGE_DESCONOCIDO'
  | 'EDGE_INACTIVO';

export interface FirmaPresentada {
  readonly marca: string | undefined;
  readonly firma: string | undefined;
}

/**
 * Comprueba marca y firma. La ventana es simétrica (un reloj adelantado es tan
 * sospechoso como uno atrasado) y la comparación, en tiempo constante.
 */
export const comprobarFirma = (
  credencial: string,
  presentada: FirmaPresentada,
  solicitud: string,
  ahora: Date,
  ventanaSegundos: number,
): MotivoDeRechazoDelEdge | null => {
  const { marca, firma } = presentada;
  if (marca === undefined || firma === undefined || marca === '' || firma === '') {
    return 'SIN_IDENTIDAD';
  }
  const segundos = Number(marca);
  if (!Number.isFinite(segundos)) return 'MARCA_INVALIDA';
  if (Math.abs(ahora.getTime() / 1000 - segundos) > ventanaSegundos) return 'FUERA_DE_VENTANA';
  return coincideEnTiempoConstante(firmarSolicitud(credencial, marca, solicitud), firma)
    ? null
    : 'FIRMA_NO_COINCIDE';
};
