/**
 * Casos de uso de la superficie del residente — HU-05, HU-33, y el sustento de
 * lectura de HU-07 a HU-09.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA ÚNICA DECISIÓN QUE IMPORTA AQUÍ
 *
 * Los cinco casos de uso comparten un paso y lo comparten **de verdad**, no por
 * convención: `ResolverMiAmbito`. Ninguno recibe una vivienda; todos reciben el
 * contexto del tenant —que el interceptor construyó desde el token— y piden el
 * ámbito. Si alguien escribiera un caso de uso nuevo que acepte `viviendaId`
 * por parámetro, tendría que saltarse esta clase para hacerlo, y eso se ve en
 * el diff. Es el mismo razonamiento que `exigirAlcance` devolviendo el contexto
 * de destino (D-71): el dato llega comprobado o no llega.
 *
 * Por qué no vive en el controlador: un controlador por pantalla acabaría
 * repitiendo la resolución, y la repetición número seis es la que se olvida el
 * filtro. Aquí es una dependencia inyectada y las cinco la usan.
 */
import { Inject, Injectable } from '@nestjs/common';
import { ambitoDelResidente, errorDominio } from '@ncr/domain-core';
import type { AmbitoDelResidente, ErrorDominio, Resultado } from '@ncr/domain-core';
import { exito, fallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { DIRECTORIO_DEL_RESIDENTE } from './puertos';
import type {
  AutorizacionDelResidente,
  DirectorioDelResidente,
  EventoDelResidente,
  FiltroDeHistorial,
  MiembroDeFamilia,
  VehiculoDelResidente,
  VinculoDeResidente,
  ViviendaDelResidente,
} from './puertos';

/** Ámbito resuelto, con el vínculo que lo produjo para las pantallas. */
export interface MiAmbito {
  readonly ambito: AmbitoDelResidente;
  readonly vinculo: VinculoDeResidente;
}

@Injectable()
export class ResolverMiAmbito {
  constructor(
    @Inject(DIRECTORIO_DEL_RESIDENTE) private readonly directorio: DirectorioDelResidente,
  ) {}

  /**
   * `copropiedadId` es el de DESTINO —el que `exigirAlcance` ya validó contra
   * el token—, así que aquí no se vuelve a juzgar el primer eje: se juzga el
   * segundo. Que el vínculo sea de otra copropiedad con un token válido de esta
   * sería un dato inconsistente en la base, no una petición ilegítima, y el
   * dominio lo distingue con su propio motivo.
   */
  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<Resultado<MiAmbito, ErrorDominio>> {
    const vinculo = await this.directorio.vinculoDe(ctx.usuarioId);
    const resuelto = ambitoDelResidente(
      copropiedadId,
      vinculo === null
        ? null
        : { copropiedadId: vinculo.copropiedadId, viviendaId: vinculo.viviendaId },
    );
    if (!resuelto.ok) {
      return fallo(
        errorDominio(
          resuelto.motivo === 'sin_vivienda_activa'
            ? 'ENTIDAD_NO_ENCONTRADA'
            : 'OPERACION_NO_PERMITIDA',
          resuelto.motivo === 'sin_vivienda_activa'
            ? 'La identidad no tiene una vivienda activa asignada en esta copropiedad'
            : 'El vínculo de residente pertenece a otra copropiedad',
          'RN-05',
        ),
      );
    }
    // `vinculo` no es nulo aquí: `ambitoDelResidente` devolvió `ok` y solo lo
    // hace con un vínculo. El compilador no lo sabe, así que se estrecha.
    return exito({ ambito: resuelto.ambito, vinculo: vinculo as VinculoDeResidente });
  }
}

/** Base de los cinco: resuelve el ámbito y delega la lectura. */
abstract class LecturaDelResidente<T> {
  constructor(
    protected readonly resolver: ResolverMiAmbito,
    protected readonly directorio: DirectorioDelResidente,
  ) {}

  protected async conAmbito(
    ctx: ContextoTenant,
    copropiedadId: string,
    leer: (a: MiAmbito) => Promise<T>,
  ): Promise<Resultado<T, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    return exito(await leer(r.valor));
  }
}

@Injectable()
export class VerMiVivienda extends LecturaDelResidente<{
  readonly vivienda: ViviendaDelResidente;
  readonly vinculo: VinculoDeResidente;
}> {
  constructor(
    resolver: ResolverMiAmbito,
    @Inject(DIRECTORIO_DEL_RESIDENTE) directorio: DirectorioDelResidente,
  ) {
    super(resolver, directorio);
  }

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<
    Resultado<
      { readonly vivienda: ViviendaDelResidente; readonly vinculo: VinculoDeResidente },
      ErrorDominio
    >
  > {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const vivienda = await this.directorio.vivienda(r.valor.ambito);
    if (vivienda === null) {
      // El vínculo existe y la vivienda no: es incoherencia de datos, y decirlo
      // como «no encontrado» es lo correcto — no se inventa una ficha vacía.
      return fallo(
        errorDominio('ENTIDAD_NO_ENCONTRADA', 'La vivienda del vínculo no existe', 'RN-05'),
      );
    }
    return exito({ vivienda, vinculo: r.valor.vinculo });
  }
}

@Injectable()
export class VerMiFamilia extends LecturaDelResidente<readonly MiembroDeFamilia[]> {
  constructor(
    resolver: ResolverMiAmbito,
    @Inject(DIRECTORIO_DEL_RESIDENTE) directorio: DirectorioDelResidente,
  ) {
    super(resolver, directorio);
  }

  ejecutar(ctx: ContextoTenant, copropiedadId: string) {
    return this.conAmbito(ctx, copropiedadId, ({ ambito }) => this.directorio.familia(ambito));
  }
}

@Injectable()
export class VerMisVehiculos extends LecturaDelResidente<readonly VehiculoDelResidente[]> {
  constructor(
    resolver: ResolverMiAmbito,
    @Inject(DIRECTORIO_DEL_RESIDENTE) directorio: DirectorioDelResidente,
  ) {
    super(resolver, directorio);
  }

  ejecutar(ctx: ContextoTenant, copropiedadId: string) {
    return this.conAmbito(ctx, copropiedadId, ({ ambito }) => this.directorio.vehiculos(ambito));
  }
}

@Injectable()
export class VerMisAutorizaciones extends LecturaDelResidente<readonly AutorizacionDelResidente[]> {
  constructor(
    resolver: ResolverMiAmbito,
    @Inject(DIRECTORIO_DEL_RESIDENTE) directorio: DirectorioDelResidente,
  ) {
    super(resolver, directorio);
  }

  ejecutar(ctx: ContextoTenant, copropiedadId: string) {
    return this.conAmbito(ctx, copropiedadId, ({ ambito }) =>
      this.directorio.autorizaciones(ambito),
    );
  }
}

@Injectable()
export class VerMiHistorial extends LecturaDelResidente<readonly EventoDelResidente[]> {
  constructor(
    resolver: ResolverMiAmbito,
    @Inject(DIRECTORIO_DEL_RESIDENTE) directorio: DirectorioDelResidente,
  ) {
    super(resolver, directorio);
  }

  ejecutar(ctx: ContextoTenant, copropiedadId: string, filtro: FiltroDeHistorial) {
    return this.conAmbito(ctx, copropiedadId, ({ ambito }) =>
      this.directorio.historial(ambito, filtro),
    );
  }
}
