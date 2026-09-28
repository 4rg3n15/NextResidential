import { errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, MotivoRechazoCaptura, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { CrearAutorizacion, RevocarAutorizacion } from '../../autorizaciones';
import type { AvisoDeVisitas } from './aviso-de-visitas';
import type { DatosDeVisitante, PersonasDeVisita } from './puertos';
import { revisarFoto } from './rostro-de-visita';
import type { FotoDeVisita, RegistrarRostroDeVisita, RostroRegistrado } from './rostro-de-visita';

/** F1 · la duración de una visita, en minutos. [SUPUESTO] de 15 minutos a 24 horas. */
export const DURACION_MINIMA_MINUTOS = 15;
export const DURACION_MAXIMA_MINUTOS = 24 * 60;

export interface EntradaDeVisita {
  readonly visitante: DatosDeVisitante;
  readonly viviendaId: string;
  readonly inicio: Date;
  readonly duracionMinutos: number;
  readonly placa: string | null;
  readonly observaciones: string | null;
  readonly foto: FotoDeVisita;
  /** F4 · la casilla. Sin ella no se genera nada. */
  readonly casillaMarcada: boolean;
}

export type ResultadoDeVisita =
  | ({ readonly generada: true; readonly autorizacionId: string } & RostroRegistrado)
  | { readonly generada: false; readonly motivosDeFoto: readonly MotivoRechazoCaptura[] };

export const hastaDe = (inicio: Date, duracionMinutos: number): Date =>
  new Date(inicio.getTime() + duracionMinutos * 60_000);

/** La forma común a la consola y a la app: casilla y duración. */
export const revisarForma = (
  casillaMarcada: boolean,
  duracionMinutos: number,
): Resultado<true, ErrorDominio> => {
  if (!casillaMarcada) {
    return fallo(
      errorDominio(
        'DATO_INVALIDO',
        'Falta confirmar que el visitante autorizó el uso de su foto',
        'ADR-032',
      ),
    );
  }
  if (
    !Number.isInteger(duracionMinutos) ||
    duracionMinutos < DURACION_MINIMA_MINUTOS ||
    duracionMinutos > DURACION_MAXIMA_MINUTOS
  ) {
    return fallo(
      errorDominio('DATO_INVALIDO', 'La duración debe estar entre 15 minutos y 24 horas'),
    );
  }
  return exito(true);
};

/**
 * `GenerarVisita` — F1 y F2 (15-L), desde la consola: todos los roles.
 *
 * El orden es la regla:
 *   1. forma: casilla marcada, duración acotada, foto válida y con calidad —
 *      antes de crear NADA—;
 *   2. la persona por su documento;
 *   3. la autorización, que nace VIGENTE (autoaprobación, ADR-027);
 *   4. la foto, la plantilla y los equipos;
 *   5. el aviso en vivo a portería y superadministración.
 *
 * Si el paso 4 falla después de crear la autorización —un almacén caído—, la
 * autorización se ANULA con el motivo, en vez de quedar viva sin foto: una
 * visita sin rostro no abre por reconocimiento facial y engañaría al que la
 * generó.
 */
export class GenerarVisita {
  constructor(
    private readonly personas: PersonasDeVisita,
    private readonly crear: CrearAutorizacion,
    private readonly revocar: RevocarAutorizacion,
    private readonly rostro: RegistrarRostroDeVisita,
    private readonly aviso: AvisoDeVisitas,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: EntradaDeVisita,
  ): Promise<Resultado<ResultadoDeVisita, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'Sin copropiedad', 'RN-15'));
    }
    const forma = revisarForma(entrada.casillaMarcada, entrada.duracionMinutos);
    if (esFallo(forma)) return forma;
    const foto = revisarFoto(entrada.foto);
    if (esFallo(foto)) return foto;
    if (!foto.valor.aceptada) return exito({ generada: false, motivosDeFoto: foto.valor.motivos });

    const personaId = await this.personas.resolver(copropiedadId, entrada.visitante, ctx.usuarioId);
    const hasta = hastaDe(entrada.inicio, entrada.duracionMinutos);
    const creada = await this.crear.ejecutar(ctx, {
      viviendaId: entrada.viviendaId,
      personaId,
      desde: entrada.inicio.toISOString(),
      hasta: hasta.toISOString(),
      placa: entrada.placa,
      observaciones: entrada.observaciones,
    });
    if (esFallo(creada)) return creada;
    const autorizacionId = creada.valor.id;

    const rostro = await this.registrarOAnular(ctx, {
      autorizacionId,
      titularId: personaId,
      hasta,
      foto: entrada.foto,
    });
    if (esFallo(rostro)) return rostro;

    await this.aviso.nueva(copropiedadId, autorizacionId);
    return exito({ generada: true, autorizacionId, ...rostro.valor });
  }

  private async registrarOAnular(
    ctx: ContextoTenant,
    entrada: Parameters<RegistrarRostroDeVisita['ejecutar']>[1],
  ): Promise<Resultado<RostroRegistrado, ErrorDominio>> {
    try {
      const r = await this.rostro.ejecutar(ctx, entrada);
      if (esFallo(r)) {
        await this.revocar.ejecutar(
          ctx,
          entrada.autorizacionId,
          `No se registró la foto: ${r.error.detalle}`,
        );
      }
      return r;
    } catch (causa) {
      await this.revocar.ejecutar(ctx, entrada.autorizacionId, 'No se pudo guardar la foto');
      throw causa;
    }
  }
}
