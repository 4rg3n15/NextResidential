import { Inject, Injectable } from '@nestjs/common';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { TITULARIDAD_DE_VIVIENDAS } from './puertos-de-titularidad';
import type {
  AsignacionDeVivienda,
  TitularidadDeViviendas,
  ViviendaSinTitular,
} from './puertos-de-titularidad';
import { SUSPENSION_DEL_REGISTRO } from './puertos-de-suspension';
import type { EstadoDelRegistro, SuspensionDelRegistro } from './puertos-de-suspension';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE EL SUPERADMINISTRADOR HACE CON TITULARES Y REGISTRO · RONDA 15-W (D1, D2)
 *
 *  · Asignar vivienda a una cuenta ANTIGUA (anterior a la 15-W) que no la tiene:
 *    queda como titular de esa vivienda, con las mismas comprobaciones que el
 *    alta de un titular y con motivo en la bitácora.
 *  · Elegir, al dar de alta un titular, entre viviendas activas SIN titular.
 *  · Ver y reanudar el registro de su copropiedad, suspendido por intentos.
 *
 * La barrera de rol es la guarda del controlador; la de copropiedad,
 * `exigirAlcance`. Aquí sólo se decide qué se hace.
 * ═════════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class TitularesDeViviendas {
  constructor(
    @Inject(TITULARIDAD_DE_VIVIENDAS) private readonly titularidad: TitularidadDeViviendas,
  ) {}

  asignarVivienda(
    ctx: ContextoTenant,
    copropiedadId: string,
    usuarioId: string,
    pedido: { readonly viviendaId: string; readonly motivo: string },
  ): Promise<AsignacionDeVivienda> {
    return this.titularidad.asignarVivienda(
      copropiedadId,
      usuarioId,
      pedido.viviendaId,
      pedido.motivo,
      ctx.usuarioId,
    );
  }

  viviendasSinTitular(
    copropiedadId: string,
    busqueda: string | null,
  ): Promise<readonly ViviendaSinTitular[]> {
    return this.titularidad.viviendasSinTitular(copropiedadId, busqueda);
  }
}

@Injectable()
export class RegistroDeResidentesDelSuperadmin {
  constructor(
    @Inject(SUSPENSION_DEL_REGISTRO) private readonly suspension: SuspensionDelRegistro,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  estado(copropiedadId: string): Promise<EstadoDelRegistro> {
    return this.suspension.estado(copropiedadId, this.reloj.ahora());
  }

  reanudar(ctx: ContextoTenant, copropiedadId: string, motivo: string): Promise<boolean> {
    return this.suspension.reanudar(copropiedadId, motivo, ctx.usuarioId, this.reloj.ahora());
  }
}
