import { Inject, Injectable } from '@nestjs/common';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { BITACORA_DE_RESIDENTES } from './puertos-hogar';
import type { BitacoraDeResidentes } from './puertos-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL TOPE DE PLAZAS POR OMISIÓN DE UNA COPROPIEDAD · RONDA 15-W (D-W10, D4 bis)
 *
 * 4 por omisión (S-15W-03); sólo el superadministrador lo cambia, desde
 * Configuración. Una ruta propia y no un campo más de la configuración general,
 * cuyos ficheros ya pasan de 300 líneas (§2.3). Si BAJA, las viviendas que ya
 * tienen más plazas reciben un tope propio igual a las que tienen: nadie pierde
 * plazas (`tg_conservar_plazas_al_bajar_el_tope`, 0056).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const TOPE_DE_LA_COPROPIEDAD = Symbol('TOPE_DE_LA_COPROPIEDAD');

export interface TopeDePlazasDeLaCopropiedad {
  leer(copropiedadId: string): Promise<number | null>;
  /** `false` si la copropiedad no existe. */
  cambiar(copropiedadId: string, tope: number, actorId: string): Promise<boolean>;
}

@Injectable()
export class TopeDePlazasPorOmision {
  constructor(
    @Inject(TOPE_DE_LA_COPROPIEDAD) private readonly topes: TopeDePlazasDeLaCopropiedad,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  ver(copropiedadId: string): Promise<number | null> {
    return this.topes.leer(copropiedadId);
  }

  async cambiar(
    ctx: ContextoTenant,
    copropiedadId: string,
    tope: number,
    motivo: string,
  ): Promise<boolean> {
    if (!(await this.topes.cambiar(copropiedadId, tope, ctx.usuarioId))) return false;
    await this.bitacora.anotar({
      copropiedadId,
      tipo: 'tope_de_plazas_cambiado',
      ocurridoEn: this.reloj.ahora(),
      usuarioId: null,
      actorId: ctx.usuarioId,
      detalle: `tope por omisión ${String(tope)} · ${motivo}`.slice(0, 500),
    });
    return true;
  }
}
