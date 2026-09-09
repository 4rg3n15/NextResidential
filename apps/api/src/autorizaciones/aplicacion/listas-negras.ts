import type { ErrorDominio, GeneradorDeId, Reloj, Resultado } from '@ncr/domain-core';
import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ContextoTenant, Rol } from '../../autenticacion';
import { alcanzaCopropiedad } from '../../autenticacion';
import type { RepositorioListaNegra } from './puertos';

/**
 * HU-35 · Gestión de listas negras.
 *
 * RN-07 separa **quién puede crear** de **quién puede levantar**, y no es una
 * sutileza: el portero que ve un incidente necesita poder vetar en el momento,
 * pero si además pudiera levantar el veto, la lista dejaría de proteger de la
 * presión sobre el propio portero. Levantar es un acto de administración, y
 * queda registrado con su autor.
 */
export const ROLES_QUE_PUEDEN_VETAR: readonly Rol[] = [
  'administrador',
  'superadministrador',
  'portero',
  'operador_central',
];

export const ROLES_QUE_PUEDEN_LEVANTAR: readonly Rol[] = ['administrador', 'superadministrador'];

const sinPermiso = (accion: string): ErrorDominio =>
  errorDominio('OPERACION_NO_PERMITIDA', `Su rol no puede ${accion} en la lista negra`, 'RN-07');

const copropiedadDe = (ctx: ContextoTenant): Resultado<string, ErrorDominio> => {
  const id = ctx.copropiedadId;
  if (id === null || !alcanzaCopropiedad(ctx, id)) {
    return fallo(
      errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no alcanza esta copropiedad', 'RN-15'),
    );
  }
  return exito(id);
};

export interface EntradaVetar {
  readonly personaId?: string | null;
  readonly placa?: string | null;
  readonly motivo: string;
}

export class VetarEnListaNegra {
  constructor(
    private readonly repo: RepositorioListaNegra,
    private readonly ids: GeneradorDeId,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: EntradaVetar,
  ): Promise<Resultado<{ id: string }, ErrorDominio>> {
    if (!ROLES_QUE_PUEDEN_VETAR.includes(ctx.rol)) return fallo(sinPermiso('vetar'));
    const copropiedad = copropiedadDe(ctx);
    if (!copropiedad.ok) return copropiedad;

    const personaId = entrada.personaId ?? null;
    const placa = entrada.placa ?? null;
    if (personaId === null && placa === null) {
      return fallo(
        errorDominio('DATO_INVALIDO', 'El veto necesita una persona o una placa', 'RN-06'),
      );
    }
    if (entrada.motivo.trim().length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'El veto exige un motivo', 'RN-07'));
    }

    const id = this.ids.nuevo();
    await this.repo.crear({
      id,
      copropiedadId: copropiedad.valor,
      personaId,
      placa,
      motivo: entrada.motivo.trim(),
      creadaPor: ctx.usuarioId,
    });
    return exito({ id });
  }
}

export class LevantarListaNegra {
  constructor(
    private readonly repo: RepositorioListaNegra,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(ctx: ContextoTenant, id: string): Promise<Resultado<void, ErrorDominio>> {
    if (!ROLES_QUE_PUEDEN_LEVANTAR.includes(ctx.rol)) return fallo(sinPermiso('levantar un veto'));
    const copropiedad = copropiedadDe(ctx);
    if (!copropiedad.ok) return copropiedad;

    const entrada = await this.repo.porId(copropiedad.valor, id);
    if (entrada === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La entrada no existe'));
    }
    if (entrada.levantadaEn !== null) {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'El veto ya fue levantado', 'RN-07'));
    }
    // Sin borrado: levantar es un HECHO nuevo con autor y momento, no la
    // desaparición del veto. El historial tiene que poder responder quién lo
    // levantó y cuándo (RN-19, KPI-04).
    const levantada = await this.repo.levantar(
      copropiedad.valor,
      id,
      ctx.usuarioId,
      this.reloj.ahora(),
    );
    return levantada
      ? exito(undefined)
      : fallo(errorDominio('CONFLICTO_DE_CONCURRENCIA', 'Otro administrador lo levantó antes'));
  }
}
