import type { Bitacora, Reloj } from '@ncr/domain-core';
import { RUTA_DEL_TUNEL } from '@ncr/providers';
import type { Hola, SesionDeTunel } from '@ncr/providers';
import type { TunelesDeEdge, TunelVivo } from '../../proveedores';
import type { AcreditarEdge } from './acreditar-edge';
import type { RepositorioDePuentes } from './puentes';
import type { GatewayRegistrado } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · A1 · QUIÉN PUEDE ABRIR EL TÚNEL DE UNA COPROPIEDAD
 *
 * El `hola` es el primer y único mensaje antes de que haya sesión. Se valida
 * en la capa de aplicación —la ruta no tiene sesión de usuario y la API lee con
 * la identidad de servicio (§2.7.6)—, y en este orden:
 *
 *  1. La identidad de la 15-Q, la MISMA (`AcreditarEdge`): Edge de alta, firma
 *     HMAC con SU credencial derivada —que lleva dentro la copropiedad y la
 *     generación—, marca dentro de la ventana, y la copropiedad que dice servir
 *     es la suya (si no, 404 y `auditoria_seguridad`, RN-15).
 *  2. El nonce no se ha visto: un `hola` capturado no abre un segundo túnel.
 *     Se gasta DESPUÉS de la firma, para que nadie queme nonces ajenos.
 *  3. Es el PUENTE de su copropiedad (`edge_gateways.puente`, 0050).
 *  4. No hay otro túnel abierto para esa copropiedad (`TunelesDeEdge.ocupar`).
 *
 * El 3 y el 4 dejan constancia en `auditoria_seguridad`: quien llega hasta ahí
 * ya demostró ser un Edge acreditado, y un segundo Edge en el mismo conjunto es
 * un hecho de seguridad, no ruido de la red.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface AuditoriaDelTunel {
  registrarRechazo(rechazo: {
    readonly copropiedadId: string;
    readonly edgeId: string;
    readonly usuarioServicioId: string;
    readonly motivo: 'NO_ES_PUENTE' | 'YA_CONECTADO';
  }): Promise<void>;
}

export const AUDITORIA_DEL_TUNEL = Symbol.for('ncr.edge.AuditoriaDelTunel');

/** Códigos de cierre del WebSocket. 44xx: privados de la aplicación (RFC 6455 §7.4.2). */
export const CIERRE = {
  NO_ACREDITADO: 4401,
  NO_ES_PUENTE: 4403,
  NO_ENCONTRADO: 4404,
  YA_CONECTADO: 4409,
} as const;

export type AperturaDeTunel =
  | { readonly abierto: true; readonly tunel: TunelVivo; readonly gateway: GatewayRegistrado }
  | { readonly abierto: false; readonly codigo: number; readonly motivo: string };

export class AbrirTunel {
  private readonly nonces = new Map<string, number>();

  constructor(
    private readonly acreditar: AcreditarEdge,
    private readonly puentes: RepositorioDePuentes,
    private readonly auditoria: AuditoriaDelTunel,
    private readonly tuneles: TunelesDeEdge,
    private readonly reloj: Reloj,
    private readonly bitacora: Bitacora,
    private readonly ventanaSegundos: number,
  ) {}

  async abrir(hola: Hola, crearSesion: () => SesionDeTunel): Promise<AperturaDeTunel> {
    const acreditacion = await this.acreditar.acreditar({
      edgeId: hola.edgeId,
      marca: hola.marca,
      firma: hola.firma,
      metodo: 'GET',
      ruta: RUTA_DEL_TUNEL,
      cuerpo: hola.nonce,
      copropiedadSolicitada: hola.copropiedadId,
    });
    if (!acreditacion.acreditado) {
      return acreditacion.estado === 404
        ? { abierto: false, codigo: CIERRE.NO_ENCONTRADO, motivo: 'recurso no encontrado' }
        : { abierto: false, codigo: CIERRE.NO_ACREDITADO, motivo: 'Edge no acreditado' };
    }
    const { gateway } = acreditacion;
    if (!this.gastarNonce(hola.nonce)) {
      this.bitacora.registrar('aviso', 'túnel del Edge: nonce repetido', { edgeId: gateway.id });
      return { abierto: false, codigo: CIERRE.NO_ACREDITADO, motivo: 'Edge no acreditado' };
    }
    if (!(await this.puentes.esPuente(gateway.id))) {
      await this.rechazar(gateway, 'NO_ES_PUENTE');
      return { abierto: false, codigo: CIERRE.NO_ES_PUENTE, motivo: 'este Edge no es el puente' };
    }
    const tunel: TunelVivo = {
      copropiedadId: gateway.copropiedadId,
      edgeId: gateway.id,
      sesion: crearSesion(),
      desde: this.reloj.ahora(),
    };
    const ocupado = this.tuneles.ocupar(tunel);
    if (ocupado !== null) {
      tunel.sesion.cerrar(CIERRE.YA_CONECTADO, 'ya hay un Edge conectado');
      await this.rechazar(gateway, 'YA_CONECTADO', ocupado.edgeId);
      return { abierto: false, codigo: CIERRE.YA_CONECTADO, motivo: 'ya hay un Edge conectado' };
    }
    this.bitacora.registrar('info', 'túnel del Edge abierto', {
      edgeId: gateway.id,
      copropiedadId: gateway.copropiedadId,
    });
    return { abierto: true, tunel, gateway };
  }

  private gastarNonce(nonce: string): boolean {
    const ahora = this.reloj.ahora().getTime();
    const vida = this.ventanaSegundos * 2000;
    for (const [n, cuando] of this.nonces) if (ahora - cuando > vida) this.nonces.delete(n);
    if (this.nonces.has(nonce)) return false;
    this.nonces.set(nonce, ahora);
    return true;
  }

  private async rechazar(
    gateway: GatewayRegistrado,
    motivo: 'NO_ES_PUENTE' | 'YA_CONECTADO',
    conectado?: string,
  ): Promise<void> {
    this.bitacora.registrar('aviso', 'túnel del Edge rechazado', {
      motivo,
      edgeId: gateway.id,
      copropiedadId: gateway.copropiedadId,
      ...(conectado === undefined ? {} : { edgeConectado: conectado }),
    });
    await this.auditoria.registrarRechazo({
      copropiedadId: gateway.copropiedadId,
      edgeId: gateway.id,
      usuarioServicioId: gateway.usuarioServicioId,
      motivo,
    });
  }
}
