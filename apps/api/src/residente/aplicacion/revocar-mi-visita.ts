import { Inject, Injectable } from '@nestjs/common';
import { RELOJ, errorDominio, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { RevocarAutorizacion } from '../../autorizaciones';
import type { SuprimirRostroDeAutorizacion } from '../../biometria';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import { BITACORA_DE_RESIDENTES } from './puertos-hogar';
import type { BitacoraDeResidentes } from './puertos-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL RESIDENTE REVOCA UNA VISITA QUE AUTORIZÓ · RONDA 15-W (D-W6, D6)
 *
 * La visita se busca por (copropiedad, vivienda DEL ÁMBITO, id): la del vecino
 * no existe para él (404); ya revocada o vencida, 409. Revocar es el caso de uso
 * de siempre (`RevocarAutorizacion`), y en la misma llamada sale el ROSTRO del
 * visitante de las terminales (`SuprimirRostroDeAutorizacion`, RN-11). No hay
 * ninguna ruta que cambie fechas: para otra vigencia se revoca y se autoriza de
 * nuevo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const VISITAS_DE_MI_VIVIENDA = Symbol('VISITAS_DE_MI_VIVIENDA');

export type SituacionDeMiVisita = 'VIGENTE' | 'REVOCADA' | 'VENCIDA';

export interface VisitasDeMiVivienda {
  /** `null` = no es una autorización de ESA vivienda (o no existe). */
  situacion(
    copropiedadId: string,
    viviendaId: string,
    autorizacionId: string,
    ahora: Date,
  ): Promise<SituacionDeMiVisita | null>;
}

export interface VisitaRevocada {
  readonly rostrosSuprimidos: number;
  readonly equiposRetirados: number;
  readonly equiposPendientes: number;
}

/** Sin caracteres de control, NFC y recortado (§2.7.4). */
const sanear = (v: string): string =>
  [...v.normalize('NFC')]
    .filter((c) => {
      const n = c.codePointAt(0) ?? 0;
      return n >= 0x20 && n !== 0x7f;
    })
    .join('')
    .trim()
    .slice(0, 200);

@Injectable()
export class RevocarMiVisita {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(VISITAS_DE_MI_VIVIENDA) private readonly visitas: VisitasDeMiVivienda,
    private readonly revocar: RevocarAutorizacion,
    private readonly suprimirRostro: SuprimirRostroDeAutorizacion,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    autorizacionId: string,
    motivoBruto: string,
  ): Promise<Resultado<VisitaRevocada, ErrorDominio>> {
    const motivo = sanear(motivoBruto);
    if (motivo.length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'El motivo de la revocación es obligatorio'));
    }
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { viviendaId } = r.valor.ambito;
    const situacion = await this.visitas.situacion(
      copropiedadId,
      viviendaId,
      autorizacionId,
      this.reloj.ahora(),
    );
    if (situacion === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Visita no encontrada'));
    }
    if (situacion !== 'VIGENTE') {
      const que = situacion === 'REVOCADA' ? 'ya está revocada' : 'ya venció';
      return fallo(errorDominio('CONFLICTO_DE_CONCURRENCIA', `La visita ${que}`));
    }
    const revocada = await this.revocar.ejecutar(ctx, autorizacionId, motivo);
    if (!revocada.ok) return revocada;
    const rostro = await this.suprimirRostro.ejecutar(ctx, autorizacionId);
    await this.bitacora.anotar({
      copropiedadId,
      tipo: 'visita_revocada_por_residente',
      ocurridoEn: this.reloj.ahora(),
      usuarioId: ctx.usuarioId,
      actorId: ctx.usuarioId,
      viviendaId,
      detalle: `autorización ${autorizacionId} · ${motivo}`,
    });
    return {
      ok: true,
      valor: rostro.ok
        ? {
            rostrosSuprimidos: rostro.valor.suprimidas,
            equiposRetirados: rostro.valor.retiradas,
            equiposPendientes: rostro.valor.retiradasPendientes,
          }
        : { rostrosSuprimidos: 0, equiposRetirados: 0, equiposPendientes: 0 },
    };
  }
}
