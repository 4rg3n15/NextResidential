import { exito, fallo } from '@ncr/domain-core';
import type { Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { DirectorioDeCuentas } from '../../cuentas';
import type { EventoDeSeguridad } from '../../plataforma';
import type { PoolDePorteros, RepositorioDePerfiles, RepositorioDePools } from './puertos';

/**
 * H1 · H2 (15-L, ADR-031) · el pool de números de la copropiedad y el CUPO de
 * porteros activos, que fija el superadministrador (0 a 999: el tamaño del
 * pool). El cupo se hace cumplir en la base al asignar cada número; aquí sólo
 * se enseña y se cambia, con su rastro en `auditoria_seguridad`.
 */
export interface EstadoDelPool extends PoolDePorteros {
  readonly activos: number;
}

export class CupoDePorteros {
  constructor(
    private readonly pools: RepositorioDePools,
    private readonly perfiles: RepositorioDePerfiles,
    private readonly cuentas: DirectorioDeCuentas,
    private readonly seguridad: { registrar(e: EventoDeSeguridad): Promise<void> },
    private readonly reloj: Reloj,
  ) {}

  async estado(copropiedadId: string): Promise<EstadoDelPool | null> {
    const pool = await this.pools.de(copropiedadId);
    if (pool === null) return null;
    const perfiles = await this.perfiles.perfiles(copropiedadId);
    const cuentas = await this.cuentas.resumenes(
      copropiedadId,
      perfiles.map((p) => p.usuarioId),
    );
    return { ...pool, activos: cuentas.filter((c) => c.activa).length };
  }

  async fijar(
    ctx: ContextoTenant,
    copropiedadId: string,
    cupo: number,
  ): Promise<Resultado<void, 'NO_ENCONTRADO'>> {
    const antes = await this.pools.de(copropiedadId);
    if (antes === null || !(await this.pools.fijarCupo(copropiedadId, cupo, ctx.usuarioId))) {
      return fallo('NO_ENCONTRADO');
    }
    await this.seguridad.registrar({
      tipo: 'cambio_configuracion',
      copropiedadId,
      usuarioId: ctx.usuarioId,
      recurso: `porteria/cupo: ${String(antes.cupo)} → ${String(cupo)}`,
      identificador: 'cupo_de_porteros',
      ip: null,
      agente: null,
      resultado: 'permitido',
      ocurridoEn: this.reloj.ahora(),
    });
    return exito(undefined);
  }
}
