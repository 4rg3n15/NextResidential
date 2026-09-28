import { errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { RevocarAutorizacion } from '../../autorizaciones';
import type { SuprimirRostroDeAutorizacion } from '../../biometria';
import type { AvisoDeVisitas } from './aviso-de-visitas';
import type { ConsultaDeVisitas } from './puertos';

export interface VisitaRechazada {
  /** Equipos de los que la foto ya salió. */
  readonly equiposRetirados: number;
  /** Equipos que no respondieron: el barrido programado lo reintenta. */
  readonly equiposPendientes: number;
}

/**
 * `RechazarVisita` — F2 (15-L). El portero o el superadministrador ven una
 * visita autoaprobada y la rechazan con motivo.
 *
 * Rechazar ANULA la autorización (revocación con motivo, sin borrado: RN-19) y
 * se lleva SU foto de todos los equipos EN EL ACTO (RN-11), sin esperar al
 * barrido programado y sin tocar las de otras visitas. Un equipo que no
 * responde queda en la cola de retirada y el barrido de cada seis horas lo
 * reintenta; se dice cuántos, porque «anulada» y «fuera de los equipos» son
 * hechos distintos.
 */
export class RechazarVisita {
  constructor(
    private readonly revocar: RevocarAutorizacion,
    private readonly suprimir: SuprimirRostroDeAutorizacion,
    private readonly consulta: ConsultaDeVisitas,
    private readonly aviso: AvisoDeVisitas,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: { readonly autorizacionId: string; readonly motivo: string },
  ): Promise<Resultado<VisitaRechazada, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'Sin copropiedad', 'RN-15'));
    }
    const motivo = entrada.motivo.trim();
    if (motivo.length < 3) {
      return fallo(errorDominio('DATO_INVALIDO', 'Escriba el motivo del rechazo'));
    }

    const revocada = await this.revocar.ejecutar(ctx, entrada.autorizacionId, motivo);
    if (esFallo(revocada)) return revocada;

    const suprimida = await this.suprimir.ejecutar(ctx, entrada.autorizacionId);
    if (esFallo(suprimida)) return suprimida;

    const equipos = await this.consulta.fotoEnEquipos(copropiedadId, entrada.autorizacionId);
    await this.aviso.anulada(copropiedadId, entrada.autorizacionId);
    return exito({
      equiposRetirados: equipos.filter((e) => e.estado === 'suprimida').length,
      equiposPendientes: equipos.filter((e) => e.estado === 'sincronizada').length,
    });
  }
}
