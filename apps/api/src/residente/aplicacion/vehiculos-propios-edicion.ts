import { Inject, Injectable } from '@nestjs/common';
import { Placa, RELOJ } from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import { borrarVehiculoSinHistorial, editarVehiculoCon } from '../../padron';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import { BITACORA_DE_RESIDENTES, VEHICULOS_PROPIOS } from './puertos-hogar';
import type { BitacoraDeResidentes, VehiculosPropios } from './puertos-hogar';
import { EDICION_DE_VEHICULOS_PROPIOS } from './puertos-de-vehiculos-propios';
import type { EdicionDeVehiculosPropios } from './puertos-de-vehiculos-propios';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL RESIDENTE EDITA Y ELIMINA SUS VEHÍCULOS · RONDA 15-W (D-W5, D5, ADR-026)
 *
 * Editar: color, modelo, marca y ocupantes. La PLACA sólo cambia si el vehículo
 * no tiene historial —la misma comprobación que el borrado definitivo—: con
 * historial, una placa nueva es otro vehículo, y se da de baja éste. El tipo no
 * se edita. Eliminar: sin historial se borra de verdad; con historial, baja
 * lógica (RN-19). Todo con la lógica del padrón y el repositorio acotado a la
 * vivienda del ámbito.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface CambiosDeVehiculoPropio {
  readonly color: string;
  readonly modelo: string;
  readonly marca?: string | null;
  readonly ocupantes?: readonly string[];
  readonly placa?: string;
}

export type ResultadoDeVehiculoEditado =
  | { readonly hecho: true }
  | { readonly hecho: false; readonly estado: 400 | 404 | 409; readonly explicacion: string };

export const MENSAJE_PLACA_CON_HISTORIAL = 'Dé de baja este vehículo y registre el nuevo';
const NO_ENCONTRADO = { hecho: false, estado: 404, explicacion: 'Vehículo no encontrado' } as const;

@Injectable()
export class EditarYEliminarMiVehiculo {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(EDICION_DE_VEHICULOS_PROPIOS) private readonly edicion: EdicionDeVehiculosPropios,
    @Inject(VEHICULOS_PROPIOS) private readonly vehiculos: VehiculosPropios,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async editar(
    ctx: ContextoTenant,
    copropiedadId: string,
    vehiculoId: string,
    cambios: CambiosDeVehiculoPropio,
  ): Promise<Resultado<ResultadoDeVehiculoEditado, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { ambito } = r.valor;
    const repo = this.edicion.deLaVivienda(ambito, ctx.usuarioId);
    const historial = await repo.historialDeVehiculo(copropiedadId, vehiculoId);
    if (historial === null) return { ok: true, valor: NO_ENCONTRADO };

    const placa = cambios.placa === undefined ? undefined : Placa.crear(cambios.placa);
    if (placa !== undefined && !placa.ok) {
      return { ok: true, valor: { hecho: false, estado: 400, explicacion: placa.error.detalle } };
    }
    const cambiaPlaca = placa !== undefined && placa.valor.valor !== historial.placa;
    if (cambiaPlaca && historial.eventos + historial.autorizaciones > 0) {
      return {
        ok: true,
        valor: { hecho: false, estado: 409, explicacion: MENSAJE_PLACA_CON_HISTORIAL },
      };
    }
    if (cambios.ocupantes !== undefined) {
      const de = new Set(await this.vehiculos.ocupantes(ambito));
      if (cambios.ocupantes.length === 0 || cambios.ocupantes.some((o) => !de.has(o))) {
        return {
          ok: true,
          valor: {
            hecho: false,
            estado: 400,
            explicacion: 'Los ocupantes son residentes de su vivienda',
          },
        };
      }
    }
    const editado = await editarVehiculoCon(
      repo,
      copropiedadId,
      vehiculoId,
      {
        ...(cambiaPlaca && placa?.ok ? { placa: placa.valor.valor } : {}),
        color: cambios.color,
        modelo: cambios.modelo,
        ...(cambios.marca === undefined ? {} : { marca: cambios.marca }),
      },
      ctx.usuarioId,
    );
    if (!editado.ok) {
      const estado = editado.error.codigo === 'ENTIDAD_NO_ENCONTRADA' ? 404 : 409;
      return { ok: true, valor: { hecho: false, estado, explicacion: editado.error.detalle } };
    }
    if (cambios.ocupantes !== undefined) {
      await this.edicion.reemplazarOcupantes(ambito, vehiculoId, cambios.ocupantes, ctx.usuarioId);
    }
    await this.anotar(
      ctx,
      copropiedadId,
      ambito.viviendaId,
      vehiculoId,
      'vehiculo_propio_editado',
      historial.placa,
    );
    return { ok: true, valor: { hecho: true } };
  }

  /** Sin historial, borrado; con historial, baja lógica. `null` = no es suyo (404). */
  async eliminar(
    ctx: ContextoTenant,
    copropiedadId: string,
    vehiculoId: string,
  ): Promise<Resultado<'borrado' | 'dado_de_baja' | null, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { ambito } = r.valor;
    const repo = this.edicion.deLaVivienda(ambito, ctx.usuarioId);
    const borrado = await borrarVehiculoSinHistorial(
      repo,
      copropiedadId,
      vehiculoId,
      ctx.usuarioId,
    );
    if (borrado.ok) {
      await this.anotar(
        ctx,
        copropiedadId,
        ambito.viviendaId,
        vehiculoId,
        'vehiculo_propio_borrado',
        borrado.valor.placa,
      );
      return { ok: true, valor: 'borrado' };
    }
    if (borrado.error.codigo === 'ENTIDAD_NO_ENCONTRADA') return { ok: true, valor: null };
    // Con historial: baja lógica, que deja su propia fila en la bitácora.
    const baja = await this.vehiculos.desactivar(ambito, vehiculoId, ctx.usuarioId);
    return { ok: true, valor: baja ? 'dado_de_baja' : null };
  }

  private anotar(
    ctx: ContextoTenant,
    copropiedadId: string,
    viviendaId: string,
    vehiculoId: string,
    tipo: 'vehiculo_propio_editado' | 'vehiculo_propio_borrado',
    placa: string,
  ): Promise<void> {
    return this.bitacora.anotar({
      copropiedadId,
      tipo,
      ocurridoEn: this.reloj.ahora(),
      usuarioId: ctx.usuarioId,
      actorId: ctx.usuarioId,
      viviendaId,
      vehiculoId,
      detalle: `placa ${placa}`,
    });
  }
}
