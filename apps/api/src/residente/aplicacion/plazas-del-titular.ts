import { Inject, Injectable } from '@nestjs/common';
import { RELOJ, decidirNuevaPlaza, explicacionDelTope } from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import { BITACORA_DE_RESIDENTES } from './puertos-hogar';
import type { BitacoraDeResidentes } from './puertos-hogar';
import { PLAZAS_DEL_TITULAR } from './puertos-de-plazas';
import type { PlazasDelTitular, TopeCambiado } from './puertos-de-plazas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL TITULAR GESTIONA LAS PLAZAS DE SU VIVIENDA · RONDA 15-W (D-W10, D4 bis)
 *
 * Sólo el titular (`primer_residente_id`): cualquier otro adulto de la vivienda
 * recibe 403. La vivienda sale del ámbito del token, nunca de la petición. El
 * dominio dice si cabe una plaza más (`decidirNuevaPlaza`) para explicar el
 * tope antes de escribir; la base lo vuelve a decidir bajo su bloqueo, y si dos
 * altas simultáneas compiten por la última, gana una.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type ResultadoDePlaza =
  | { readonly hecho: true }
  | { readonly hecho: false; readonly estado: 403 | 404 | 409; readonly explicacion: string };

const NO_ES_TITULAR: ResultadoDePlaza = {
  hecho: false,
  estado: 403,
  explicacion: 'Sólo el titular de la vivienda gestiona sus plazas',
};

@Injectable()
export class PlazasDeMiVivienda {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(PLAZAS_DEL_TITULAR) private readonly plazas: PlazasDelTitular,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async anadir(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<Resultado<ResultadoDePlaza, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { viviendaId } = r.valor.ambito;
    const cupo = await this.plazas.cupo(copropiedadId, viviendaId, ctx.usuarioId);
    if (!cupo.esTitular) return { ok: true, valor: NO_ES_TITULAR };
    const tope = { hecho: false, estado: 409, explicacion: explicacionDelTope(cupo.tope) } as const;
    if (!decidirNuevaPlaza(cupo).ok) return { ok: true, valor: tope };
    if ((await this.plazas.anadir(copropiedadId, viviendaId, ctx.usuarioId)) !== 'ANADIDA') {
      return { ok: true, valor: tope };
    }
    await this.anotar(ctx, copropiedadId, viviendaId, 'plaza_anadida', 'por el titular');
    return { ok: true, valor: { hecho: true } };
  }

  async retirar(
    ctx: ContextoTenant,
    copropiedadId: string,
    plazaId: string,
    motivo: string,
  ): Promise<Resultado<ResultadoDePlaza, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { viviendaId } = r.valor.ambito;
    const cupo = await this.plazas.cupo(copropiedadId, viviendaId, ctx.usuarioId);
    if (!cupo.esTitular) return { ok: true, valor: NO_ES_TITULAR };
    const hecho = await this.plazas.retirar(
      copropiedadId,
      viviendaId,
      plazaId,
      motivo,
      ctx.usuarioId,
    );
    if (hecho === 'NO_ENCONTRADA') {
      return { ok: true, valor: { hecho: false, estado: 404, explicacion: 'Plaza no encontrada' } };
    }
    if (hecho === 'OCUPADA') {
      return {
        ok: true,
        valor: { hecho: false, estado: 409, explicacion: 'Primero dé de baja a la persona' },
      };
    }
    if (hecho === 'ES_LA_DEL_TITULAR') {
      return {
        ok: true,
        valor: { hecho: false, estado: 409, explicacion: 'La plaza del titular no se retira' },
      };
    }
    await this.anotar(ctx, copropiedadId, viviendaId, 'plaza_retirada', motivo);
    return { ok: true, valor: { hecho: true } };
  }

  private anotar(
    ctx: ContextoTenant,
    copropiedadId: string,
    viviendaId: string,
    tipo: 'plaza_anadida' | 'plaza_retirada',
    detalle: string,
  ): Promise<void> {
    return this.bitacora.anotar({
      copropiedadId,
      tipo,
      ocurridoEn: this.reloj.ahora(),
      usuarioId: ctx.usuarioId,
      actorId: ctx.usuarioId,
      viviendaId,
      detalle: detalle.slice(0, 500),
    });
  }
}

/** D4 bis · el superadministrador amplía (o devuelve al de su copropiedad) el tope de UNA vivienda. */
@Injectable()
export class TopeDePlazasDeVivienda {
  constructor(
    @Inject(PLAZAS_DEL_TITULAR) private readonly plazas: PlazasDelTitular,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async cambiar(
    ctx: ContextoTenant,
    copropiedadId: string,
    viviendaId: string,
    pedido: { readonly tope: number | null; readonly motivo: string },
  ): Promise<TopeCambiado> {
    const r = await this.plazas.cambiarTope(copropiedadId, viviendaId, pedido.tope, ctx.usuarioId);
    if (r === 'CAMBIADO') {
      await this.bitacora.anotar({
        copropiedadId,
        tipo: 'tope_de_plazas_cambiado',
        ocurridoEn: this.reloj.ahora(),
        usuarioId: null,
        actorId: ctx.usuarioId,
        viviendaId,
        detalle:
          `tope ${pedido.tope === null ? 'de la copropiedad' : String(pedido.tope)} · ${pedido.motivo}`.slice(
            0,
            500,
          ),
      });
    }
    return r;
  }

  cupo(copropiedadId: string, viviendaId: string, usuarioId: string) {
    return this.plazas.cupo(copropiedadId, viviendaId, usuarioId);
  }
}
