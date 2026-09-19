/**
 * Los dos casos de uso que 11-B añade además de crear la visita.
 *
 * Viven en su propio fichero y no en `casos-de-uso.ts` por §2.3: aquel ya tiene
 * las cinco lecturas y su base común, y añadirle dos operaciones de naturaleza
 * distinta lo habría llevado por encima de las 300 líneas con dos razones de
 * cambio dentro. Aquí cada uno tiene la suya.
 */
import { Inject, Injectable } from '@nestjs/common';
import { RELOJ, exito } from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import { NOTIFICACIONES_DEL_RESIDENTE, ZONAS_DEL_RESIDENTE } from './puertos';
import type { NotificacionesDelResidente, ZonaParaResidente, ZonasDelResidente } from './puertos';

/**
 * HU-19 · M-5 · Las zonas comunes con su aforo y su horario.
 *
 * El reloj entra inyectado, como en todo el dominio: «¿está abierta ahora?» es
 * una pregunta sobre un instante, y un `new Date()` dentro del adaptador haría
 * imposible probar el minuto de apertura y el de cierre — que es justo donde
 * viven los errores de horario (DoD de la ETAPA 07).
 *
 * **Lo que la interfaz hace con el aforo es REFLEJARLO, no garantizarlo.** El
 * número que se pinta es el de este instante y puede quedar obsoleto mientras
 * el residente mira la pantalla; quien impide el ingreso número 21 sobre un
 * aforo de 20 es la base, con su restricción, en el momento del ingreso. Pintar
 * «quedan 3 plazas» no es una promesa, y la pantalla lo dice.
 */
@Injectable()
export class VerMisZonas {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(ZONAS_DEL_RESIDENTE) private readonly zonas: ZonasDelResidente,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<Resultado<readonly ZonaParaResidente[], ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    return exito(await this.zonas.zonas(r.valor.ambito, this.reloj.ahora()));
  }
}

/**
 * HU-34 · M-7 · Registrar este aparato para recibir notificaciones.
 *
 * Pasa por `ResolverMiAmbito` aunque el token no tenga nada que ver con la
 * vivienda. No es ceremonia: es lo que impide que una identidad **sin vínculo
 * de residente** en este conjunto registre un aparato y quede suscrita a los
 * avisos de una copropiedad que no es la suya. El ámbito se resuelve y se
 * descarta; lo que se conserva es el haber comprobado que existe.
 */
@Injectable()
export class RegistrarMiAparato {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(NOTIFICACIONES_DEL_RESIDENTE)
    private readonly notificaciones: NotificacionesDelResidente,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    aparato: {
      readonly instalacionId: string;
      readonly token: string;
      readonly plataforma: 'ios' | 'android' | 'web';
    },
  ): Promise<Resultado<{ readonly id: string }, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    return exito(await this.notificaciones.registrarToken(copropiedadId, ctx.usuarioId, aparato));
  }
}
