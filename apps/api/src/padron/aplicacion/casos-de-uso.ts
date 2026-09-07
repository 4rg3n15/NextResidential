import { Placa } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion/dominio/claims';
import type { RepositorioPadron } from './puertos';

/**
 * Casos de uso del padrón. Orquestan: validan forma con el VO, delegan la
 * garantía a la base y traducen el resultado. **No deciden**: la decisión de
 * si una placa puede existir la toma el índice único, no este código.
 */
export interface EntradaRegistrarVehiculo {
  readonly viviendaId: string;
  readonly placa: string;
  readonly personaId?: string | null;
  readonly marca?: string | null;
  readonly modelo?: string | null;
  readonly color?: string | null;
}

export class RegistrarVehiculo {
  constructor(private readonly repo: RepositorioPadron) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: EntradaRegistrarVehiculo,
  ): Promise<Resultado<{ id: string }, ErrorDominio>> {
    if (!ctx.copropiedadId) {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no tiene copropiedad', 'RN-15'),
      );
    }
    // La placa se normaliza AQUÍ, antes de tocar la base. Si se normalizara
    // después, el índice único compararía formas distintas del mismo dato.
    // No se usa `encadenar`: es síncrono a propósito —el dominio no hace I/O—
    // y forzarlo a envolver una promesa mentiría sobre su contrato.
    const placaValidada = Placa.crear(entrada.placa);
    if (!placaValidada.ok) return placaValidada;
    const placa = placaValidada.valor;

    const r = await this.repo.registrarVehiculo({
      copropiedadId: ctx.copropiedadId,
      viviendaId: entrada.viviendaId,
      personaId: entrada.personaId ?? null,
      placa,
      marca: entrada.marca ?? null,
      modelo: entrada.modelo ?? null,
      color: entrada.color ?? null,
      actorId: ctx.usuarioId,
    });

    // El rechazo lo produjo el índice único de la base, no este código: es la
    // materialización de ADR-04 y el motivo de que KPI-03 se pueda cumplir.
    return r.tipo === 'registrado'
      ? exito({ id: r.id })
      : fallo(
          errorDominio(
            'CONFLICTO_DE_CONCURRENCIA',
            `La placa ${placa} ya está activa en esta copropiedad`,
            'RN-04',
          ),
        );
  }
}

export class DesactivarVehiculo {
  constructor(private readonly repo: RepositorioPadron) {}
  async ejecutar(
    ctx: ContextoTenant,
    vehiculoId: string,
    motivo: string,
  ): Promise<Resultado<void, ErrorDominio>> {
    if (motivo.trim().length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'La desactivación exige un motivo', 'RN-19'));
    }
    if (!ctx.copropiedadId) {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no tiene copropiedad', 'RN-15'),
      );
    }
    const hecho = await this.repo.desactivarVehiculo(
      ctx.copropiedadId,
      vehiculoId,
      motivo,
      ctx.usuarioId,
    );
    return hecho
      ? exito(undefined)
      : fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Vehículo activo no encontrado'));
  }
}

export class DesactivarVivienda {
  constructor(private readonly repo: RepositorioPadron) {}
  async ejecutar(
    ctx: ContextoTenant,
    viviendaId: string,
    motivo: string,
  ): Promise<Resultado<void, ErrorDominio>> {
    if (motivo.trim().length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'La desactivación exige un motivo', 'RN-19'));
    }
    if (!ctx.copropiedadId) {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no tiene copropiedad', 'RN-15'),
      );
    }
    const hecho = await this.repo.desactivarVivienda(
      ctx.copropiedadId,
      viviendaId,
      motivo,
      ctx.usuarioId,
    );
    return hecho
      ? exito(undefined)
      : fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Vivienda activa no encontrada'));
  }
}
