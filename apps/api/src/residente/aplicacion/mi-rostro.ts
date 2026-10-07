import type {
  ErrorDominio,
  MedidasDeCaptura,
  MotivoRechazoCaptura,
  Reloj,
  Resultado,
} from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { RostroDeResidente } from '../../biometria';
import { revisarFoto } from '../../visitas';
import type { ResolverMiAmbito } from './casos-de-uso';
import { estadoDelRostro } from './estado-del-rostro';
import type { EstadoDeMiRostro } from './estado-del-rostro';
import { CAPTURAS_DE_ROSTRO_POR_DIA, POLITICA_DEL_ROSTRO } from './politica-del-rostro';
import type { BitacoraDeResidentes } from './puertos-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D2 · «MI ROSTRO» · ADR-039, D-W3, Ley 1581 de 2012
 *
 * Opcional, del adulto con cuenta, y suyo: la persona sale del VÍNCULO de la
 * cuenta (`usuarios.persona_id`), nunca del cuerpo. Aquí se pone la puerta
 * —política vigente, foto (tipo real, tamaño, calidad), tope de 5 capturas en
 * 24 h contado en la base— y la bitácora; lo que toca plantillas, bóveda y
 * equipos lo hace la biometría (`RostroDeResidente`): este módulo no inyecta
 * ninguna de esas piezas. La imagen no sale nunca: ni el estado ni la bitácora
 * tienen dónde ponerla.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface FotoDeRostro {
  readonly contenidoBase64: string;
  readonly tipoMime: string;
  readonly medidas: MedidasDeCaptura;
  readonly versionPolitica: string;
}

export type ResultadoDeMiRostro =
  | { readonly hecho: true; readonly estado: EstadoDeMiRostro }
  | {
      readonly hecho: false;
      readonly estado: 400 | 404 | 409 | 429;
      readonly explicacion: string;
      readonly motivos?: readonly MotivoRechazoCaptura[];
      readonly reintentarEnS?: number;
    };

export type EstadoConPolitica = EstadoDeMiRostro & {
  readonly politica: typeof POLITICA_DEL_ROSTRO;
};

const DIA_MS = 24 * 3600 * 1000;
const no = (
  estado: 400 | 404 | 409 | 429,
  explicacion: string,
  extra: { motivos?: readonly MotivoRechazoCaptura[]; reintentarEnS?: number } = {},
): ResultadoDeMiRostro => ({ hecho: false, estado, explicacion, ...extra });
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
    const rechazo = await this.rechazoPrevio(ctx, cop, foto);
    if (rechazo !== null) return dar(rechazo);

    const ahora = this.reloj.ahora();
    const hecho = await this.rostro.registrar(ctx, {
      titularId: personaId,
      vector: Buffer.from(foto.contenidoBase64, 'base64'),
      medidas: foto.medidas,
      versionPolitica: foto.versionPolitica,
      suprimirEn: new Date(ahora.getTime() + this.retencionDias * DIA_MS),
    });
    if (!hecho.ok) {
      return dar(no(hecho.error.codigo === 'DATO_INVALIDO' ? 400 : 409, hecho.error.detalle));
    }
    if (!hecho.valor.registrado) {
      return dar(
        'motivos' in hecho.valor
          ? no(400, 'La foto no sirve para reconocerle', { motivos: hecho.valor.motivos })
          : no(409, 'Otro registro de su rostro terminó antes: vuelva a intentarlo'),
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
    if (!habia.valor) return dar(no(404, 'No tiene un rostro registrado'));
    await this.anotar(ctx, cop, 'rostro_retirado', this.reloj.ahora());
    return dar({ hecho: true, estado: await this.leer(ctx, personaId) } as ResultadoDeMiRostro);
  }

  /** Política vigente, foto admisible y tope de 24 h: antes de crear nada. */
  private async rechazoPrevio(
    ctx: ContextoTenant,
    cop: string,
    foto: FotoDeRostro,
  ): Promise<ResultadoDeMiRostro | null> {
    if (foto.versionPolitica !== POLITICA_DEL_ROSTRO.version) {
      return no(409, 'La política del rostro cambió: léala y acéptela de nuevo');
    }
    const revisada = revisarFoto({
      contenidoBase64: foto.contenidoBase64,
      tipoMime: foto.tipoMime,
      medidas: foto.medidas,
    });
    if (!revisada.ok) return no(400, revisada.error.detalle);
    if (!revisada.valor.aceptada) {
      return no(400, 'La foto no sirve para reconocerle', { motivos: revisada.valor.motivos });
    }
    const ahora = this.reloj.ahora();
    const capturas = await this.rostro.capturasRecientes(cop, ctx.usuarioId, ahora);
    if (capturas.length < CAPTURAS_DE_ROSTRO_POR_DIA) return null;
    // Se libera un hueco cuando la quinta más reciente cumple 24 h.
    const libera = capturas[capturas.length - CAPTURAS_DE_ROSTRO_POR_DIA] ?? ahora;
    return no(
      429,
      `Ya registró un rostro ${String(CAPTURAS_DE_ROSTRO_POR_DIA)} veces en 24 horas`,
      {
        reintentarEnS: Math.max(1, Math.ceil((libera.getTime() + DIA_MS - ahora.getTime()) / 1000)),
      },
    );
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
