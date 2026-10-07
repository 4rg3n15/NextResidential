import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { RostroDeResidente } from '../../biometria';
import type { ResolverMiAmbito } from './casos-de-uso';
import { estadoDelRostro } from './estado-del-rostro';
import type { EstadoDeMiRostro } from './estado-del-rostro';
import { POLITICA_DEL_ROSTRO } from './politica-del-rostro';
import { DIA_MS, rechazo, rechazoAntesDeCapturar } from './puerta-del-rostro';
import type { FotoDeRostro, ResultadoDeMiRostro } from './puerta-del-rostro';
import type { BitacoraDeResidentes } from './puertos-hogar';

export type { FotoDeRostro, ResultadoDeMiRostro } from './puerta-del-rostro';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D2 · «MI ROSTRO» · ADR-039, D-W3, Ley 1581 de 2012
 *
 * Opcional, del adulto con cuenta, y suyo: la persona sale del VÍNCULO de la
 * cuenta (`usuarios.persona_id`), nunca del cuerpo. Aquí se pone la puerta
 * (`puerta-del-rostro.ts`: política vigente, foto por tipo real, tamaño y
 * calidad, tope de 5 capturas en 24 h contado en la base) y la bitácora; lo que toca plantillas, bóveda y
 * equipos lo hace la biometría (`RostroDeResidente`): este módulo no inyecta
 * ninguna de esas piezas. La imagen no sale nunca: ni el estado ni la bitácora
 * tienen dónde ponerla.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type EstadoConPolitica = EstadoDeMiRostro & {
  readonly politica: typeof POLITICA_DEL_ROSTRO;
};

const dar = <T>(valor: T): Resultado<T, ErrorDominio> => ({ ok: true, valor });

export class MiRostro {
  constructor(
    private readonly ambito: Pick<ResolverMiAmbito, 'ejecutar'>,
    private readonly rostro: Pick<
      RostroDeResidente,
      'registrar' | 'retirar' | 'leer' | 'capturasRecientes'
    >,
    private readonly bitacora: BitacoraDeResidentes,
    private readonly reloj: Reloj,
    /** `ROSTRO_RESIDENTE_RETENCION_DIAS`: 365 por omisión (D-W3). */
    private readonly retencionDias: number,
  ) {}

  async estado(
    ctx: ContextoTenant,
    cop: string,
  ): Promise<Resultado<EstadoConPolitica, ErrorDominio>> {
    const r = await this.ambito.ejecutar(ctx, cop);
    if (!r.ok) return r;
    return dar({
      ...(await this.leer(ctx, r.valor.vinculo.personaId)),
      politica: POLITICA_DEL_ROSTRO,
    });
  }

  async registrar(
    ctx: ContextoTenant,
    cop: string,
    foto: FotoDeRostro,
  ): Promise<Resultado<ResultadoDeMiRostro, ErrorDominio>> {
    const r = await this.ambito.ejecutar(ctx, cop);
    if (!r.ok) return r;
    const personaId = r.valor.vinculo.personaId;
    const ahora = this.reloj.ahora();
    const antes = await rechazoAntesDeCapturar(
      foto,
      POLITICA_DEL_ROSTRO.version,
      () => this.rostro.capturasRecientes(cop, ctx.usuarioId, ahora),
      ahora,
    );
    if (antes !== null) return dar<ResultadoDeMiRostro>(antes);

    const hecho = await this.rostro.registrar(ctx, {
      titularId: personaId,
      vector: Buffer.from(foto.contenidoBase64, 'base64'),
      medidas: foto.medidas,
      versionPolitica: foto.versionPolitica,
      suprimirEn: new Date(ahora.getTime() + this.retencionDias * DIA_MS),
    });
    if (!hecho.ok) {
      return dar(rechazo(hecho.error.codigo === 'DATO_INVALIDO' ? 400 : 409, hecho.error.detalle));
    }
    if (!hecho.valor.registrado) {
      return dar(
        'motivos' in hecho.valor
          ? rechazo(400, 'La foto no sirve para reconocer el rostro', {
              motivos: hecho.valor.motivos,
            })
          : rechazo(409, 'Otro registro de su rostro terminó antes: vuelva a intentarlo'),
      );
    }
    await this.anotar(ctx, cop, 'rostro_registrado', ahora);
    return dar({ hecho: true, estado: await this.leer(ctx, personaId) } as ResultadoDeMiRostro);
  }

  async retirar(
    ctx: ContextoTenant,
    cop: string,
  ): Promise<Resultado<ResultadoDeMiRostro, ErrorDominio>> {
    const r = await this.ambito.ejecutar(ctx, cop);
    if (!r.ok) return r;
    const personaId = r.valor.vinculo.personaId;
    const habia = await this.rostro.retirar(ctx, personaId);
    if (!habia.ok) return habia;
    if (!habia.valor) return dar(rechazo(404, 'No tiene un rostro registrado'));
    await this.anotar(ctx, cop, 'rostro_retirado', this.reloj.ahora());
    return dar({ hecho: true, estado: await this.leer(ctx, personaId) } as ResultadoDeMiRostro);
  }

  private async leer(ctx: ContextoTenant, personaId: string): Promise<EstadoDeMiRostro> {
    return estadoDelRostro(await this.rostro.leer(ctx, personaId), this.reloj.ahora());
  }

  private anotar(
    ctx: ContextoTenant,
    copropiedadId: string,
    tipo: 'rostro_registrado' | 'rostro_retirado',
    ahora: Date,
  ) {
    return this.bitacora.anotar({
      copropiedadId,
      tipo,
      ocurridoEn: ahora,
      usuarioId: ctx.usuarioId,
      actorId: ctx.usuarioId,
      // Sin bytes ni documento: a lo sumo la versión de la política aceptada.
      detalle: tipo === 'rostro_registrado' ? `politica:${POLITICA_DEL_ROSTRO.version}` : null,
    });
  }
}
