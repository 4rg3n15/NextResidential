import { Inject, Injectable } from '@nestjs/common';
import { errorDominio } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { REPOSITORIO_CONSENTIMIENTOS } from '../../biometria';
import type { RepositorioConsentimientos } from '../../biometria';
import type { ResolverMiAmbito } from './casos-de-uso';
import { AUTORIZACIONES_DEL_RESIDENTE } from './puertos';
import type { AutorizacionesDelResidente } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ¿YA RESPONDIÓ MI VISITANTE? · ETAPA 15-I (punto 5)
 *
 * El residente captura el rostro y ENTREGA el enlace; quien responde es el
 * visitante, desde su propio teléfono (RN-10, Ley 1581). La app sólo necesita
 * saber en qué quedó para decírselo: pendiente, aceptado o rechazado.
 *
 * Dos comprobaciones y las dos son de ámbito: la autorización tiene que ser de
 * SU vivienda (el titular sale de ella) y el consentimiento tiene que ser de ese
 * titular. Lo que no cumple las dos responde 404: ni el del vecino ni uno
 * inventado confirman que existen.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type EstadoParaElResidente =
  | 'pendiente'
  | 'aceptado'
  | 'rechazado'
  | 'revocado'
  | 'expirado';

const TRADUCCION: Readonly<Record<string, EstadoParaElResidente>> = {
  pendiente: 'pendiente',
  vigente: 'aceptado',
  rechazado: 'rechazado',
  revocado: 'revocado',
  expirado: 'expirado',
};

@Injectable()
export class EstadoDelConsentimientoDeMiVisitante {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(AUTORIZACIONES_DEL_RESIDENTE)
    private readonly autorizaciones: AutorizacionesDelResidente,
    @Inject(REPOSITORIO_CONSENTIMIENTOS)
    private readonly consentimientos: RepositorioConsentimientos,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    autorizacionId: string,
    consentimientoId: string,
  ): Promise<Resultado<{ readonly estado: EstadoParaElResidente }, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const noEsSuyo = {
      ok: false as const,
      error: errorDominio('ENTIDAD_NO_ENCONTRADA', 'El consentimiento', 'RN-10'),
    };
    const titular = await this.autorizaciones.titularDeLaAutorizacion(
      r.valor.ambito,
      autorizacionId,
    );
    if (titular === null) return noEsSuyo;
    const c = await this.consentimientos.porId(copropiedadId, consentimientoId);
    if (c === null || c.titularId !== titular.personaId) return noEsSuyo;
    return { ok: true, valor: { estado: TRADUCCION[c.estado] ?? 'pendiente' } };
  }
}
