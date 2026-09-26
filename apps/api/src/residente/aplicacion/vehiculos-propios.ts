import { Inject, Injectable } from '@nestjs/common';
import { RELOJ, explicacionDeVehiculo, validarVehiculoPropio } from '@ncr/domain-core';
import type {
  ErrorDominio,
  MotivoDeNoRegistrarVehiculo,
  Reloj,
  Resultado,
  SolicitudDeVehiculoPropio,
} from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import { BITACORA_DE_RESIDENTES, VEHICULOS_PROPIOS } from './puertos-hogar';
import type { BitacoraDeResidentes, VehiculosPropios } from './puertos-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * VEHÍCULOS PROPIOS DEL RESIDENTE · ETAPA 15-I (D5 a, 3.4, ADR-026)
 *
 * Activos al instante. El tope por vivienda lo impone la BASE: aquí no hay un
 * SELECT previo que cuente, porque dos altas simultáneas contarían lo mismo.
 * Si la base rechaza por tope, el caso de uso lee el cupo SÓLO para explicarlo
 * y deja el rechazo en la bitácora, que es uno de los contrapesos de D5 a: la
 * propiedad la declara el residente y el sistema no puede comprobarla.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export type ResultadoDeVehiculoPropio =
  | { readonly registrado: true; readonly id: string }
  | {
      readonly registrado: false;
      readonly motivo: MotivoDeNoRegistrarVehiculo;
      readonly explicacion: string;
    };

@Injectable()
export class RegistrarMiVehiculo {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(VEHICULOS_PROPIOS) private readonly vehiculos: VehiculosPropios,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    solicitud: SolicitudDeVehiculoPropio,
  ): Promise<Resultado<ResultadoDeVehiculoPropio, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { ambito } = r.valor;
    const valido = validarVehiculoPropio(solicitud, await this.vehiculos.ocupantes(ambito));
    if (!valido.ok) {
      return {
        ok: true,
        valor: {
          registrado: false,
          motivo: valido.error.motivo,
          explicacion: valido.error.detalle,
        },
      };
    }
    const escrito = await this.vehiculos.registrar(ambito, ctx.usuarioId, valido.valor);
    if (escrito.ok) return { ok: true, valor: { registrado: true, id: escrito.id } };

    let tope: number | undefined;
    if (escrito.motivo === 'TOPE_ALCANZADO') {
      tope = (await this.vehiculos.cupo(ambito)).tope;
      await this.bitacora.anotar({
        copropiedadId,
        tipo: 'vehiculo_propio_rechazado_por_tope',
        ocurridoEn: this.reloj.ahora(),
        usuarioId: ctx.usuarioId,
        actorId: ctx.usuarioId,
        viviendaId: ambito.viviendaId,
        detalle: `placa ${valido.valor.placa} · tope ${String(tope)}`,
      });
    }
    return {
      ok: true,
      valor: {
        registrado: false,
        motivo: escrito.motivo,
        explicacion: explicacionDeVehiculo(escrito.motivo, tope),
      },
    };
  }
}

@Injectable()
export class DesactivarMiVehiculo {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(VEHICULOS_PROPIOS) private readonly vehiculos: VehiculosPropios,
  ) {}

  /** `false` si no es un vehículo propio (registrado por residentes) de SU vivienda. */
  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    vehiculoId: string,
  ): Promise<Resultado<boolean, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    return {
      ok: true,
      valor: await this.vehiculos.desactivar(r.valor.ambito, vehiculoId, ctx.usuarioId),
    };
  }
}
