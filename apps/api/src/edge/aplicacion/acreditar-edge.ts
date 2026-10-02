import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { RegistroDeAuditoria } from '../../comun/auditoria/registro';
import { comprobarFirma, derivarCredencial, solicitudCanonica } from './credencial-del-edge';
import type { MotivoDeRechazoDelEdge } from './credencial-del-edge';
import type { GatewayRegistrado, RepositorioDeGateways } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * Q1 · LA IDENTIDAD DEL EDGE, VALIDADA EN LA CAPA DE APLICACIÓN
 *
 * Las rutas del Edge no tienen sesión de usuario y leen con la identidad de
 * SERVICIO, que en Supabase es la llave que omite la RLS (§2.7.6, el riesgo
 * número uno). Por eso la frontera no puede ser la base: es este caso de uso,
 * y en este orden —
 *
 *  1. ¿Quién dice ser? (`x-ncr-edge`, un gateway de `edge_gateways`.)
 *  2. ¿Está de alta? Uno dado de baja no descarga ni reconcilia.
 *  3. ¿Lo demuestra? La firma, con SU credencial derivada, sobre el método,
 *     la ruta y el cuerpo, dentro de la ventana.
 *  4. ¿Pide SU copropiedad? Si no, 404 —no 403: no se confirma que la otra
 *     exista— y constancia en `auditoria_seguridad` (RN-15, CA-24).
 *
 * El 4 va DESPUÉS del 3 a propósito: sólo se audita como acceso cruzado lo que
 * hizo un Edge acreditado. Una petición sin firma válida es ruido de la red y
 * va a la bitácora, no a la auditoría de seguridad de un tenant.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface SolicitudDelEdge {
  readonly edgeId: string | undefined;
  readonly marca: string | undefined;
  readonly firma: string | undefined;
  readonly metodo: string;
  readonly ruta: string;
  readonly cuerpo: string;
  readonly copropiedadSolicitada: string;
}

export type Acreditacion =
  | { readonly acreditado: true; readonly gateway: GatewayRegistrado }
  | {
      readonly acreditado: false;
      readonly estado: 401 | 404;
      readonly motivo: MotivoDeRechazoDelEdge | 'OTRA_COPROPIEDAD';
    };

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AjustesDeAcreditacion {
  /** `INGESTA_FIRMA_SECRETO`: la maestra de la que se deriva cada credencial. */
  readonly maestra: string;
  readonly ventanaSegundos: number;
}

export class AcreditarEdge {
  constructor(
    private readonly gateways: RepositorioDeGateways,
    private readonly auditoria: RegistroDeAuditoria,
    private readonly bitacora: Bitacora,
    private readonly reloj: Reloj,
    private readonly ajustes: AjustesDeAcreditacion,
  ) {}

  async acreditar(solicitud: SolicitudDelEdge): Promise<Acreditacion> {
    const { edgeId } = solicitud;
    if (edgeId === undefined || !ES_UUID.test(edgeId))
      return this.negar('SIN_IDENTIDAD', solicitud);

    const gateway = await this.gateways.porId(edgeId);
    if (gateway === null) return this.negar('EDGE_DESCONOCIDO', solicitud);
    if (!gateway.activo) return this.negar('EDGE_INACTIVO', solicitud);

    const credencial = derivarCredencial(this.ajustes.maestra, {
      copropiedadId: gateway.copropiedadId,
      edgeId: gateway.id,
      credencialRef: gateway.credencialRef,
    });
    const motivo = comprobarFirma(
      credencial,
      { marca: solicitud.marca, firma: solicitud.firma },
      solicitudCanonica(solicitud.metodo, solicitud.ruta, solicitud.cuerpo),
      this.reloj.ahora(),
      this.ajustes.ventanaSegundos,
    );
    if (motivo !== null) return this.negar(motivo, solicitud);

    if (solicitud.copropiedadSolicitada !== gateway.copropiedadId) {
      await this.auditoria.registrarAccesoCruzado({
        usuarioId: gateway.usuarioServicioId,
        rol: 'edge',
        copropiedadSolicitada: solicitud.copropiedadSolicitada,
        recurso: solicitud.ruta.split('?')[0] ?? solicitud.ruta,
      });
      this.bitacora.registrar('aviso', 'un Edge pidió datos de otra copropiedad', {
        edgeId: gateway.id,
        copropiedadDelEdge: gateway.copropiedadId,
      });
      return { acreditado: false, estado: 404, motivo: 'OTRA_COPROPIEDAD' };
    }
    return { acreditado: true, gateway };
  }

  /** El motivo va a la bitácora y NUNCA al cliente: decir cuál falló enseña a acercarse. */
  private negar(motivo: MotivoDeRechazoDelEdge, solicitud: SolicitudDelEdge): Acreditacion {
    this.bitacora.registrar('aviso', 'petición del Edge rechazada', {
      motivo,
      metodo: solicitud.metodo,
      ruta: solicitud.ruta.split('?')[0],
    });
    return { acreditado: false, estado: 401, motivo };
  }
}
