import { errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, MotivoRechazoCaptura, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { CrearAutorizacion, RevocarAutorizacion } from '../../autorizaciones';
import type { AvisoDeVisitas } from './aviso-de-visitas';
import { confirmacionDePlaca } from './confirmacion-de-placa';
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
  /** D-143 · opcional: la visita puede llegar en carro sin registrar rostro. */
  readonly foto: FotoDeVisita | null;
  /** F4 · la casilla. Sólo se exige si viene foto (RN-10). */
  readonly casillaMarcada: boolean;
}

export type ResultadoDeVisita =
  | ({
      readonly generada: true;
      readonly autorizacionId: string;
      /** C9 (15-M) · la frase de la placa, o `null` si la visita no lleva. */
      readonly confirmacionDePlaca: string | null;
    } & Partial<RostroRegistrado>)
  | { readonly generada: false; readonly motivosDeFoto: readonly MotivoRechazoCaptura[] };

export const hastaDe = (inicio: Date, duracionMinutos: number): Date =>
  new Date(inicio.getTime() + duracionMinutos * 60_000);

/**
 * D-143 · decisión del cliente (pruebas en sitio, 23/10): una visita puede
 * llegar en carro sin registrar rostro. Es obligatorio AL MENOS UNO de los
 * dos, placa o foto, y quien la genera elige.
 */
export const MENSAJE_PLACA_O_FOTO = 'Indique la placa del vehículo o la foto del visitante';

/** Una placa en blanco es «sin placa», igual que en `CrearAutorizacion`. */
const tienePlaca = (placa: string | null): boolean => placa !== null && placa.trim() !== '';

export interface FormaDeVisita {
  readonly casillaMarcada: boolean;
  readonly duracionMinutos: number;
  readonly placa: string | null;
  readonly conFoto: boolean;
}

/**
 * La forma común a la consola y a la app: placa o foto, casilla y duración.
 *
 * Es la regla, no la forma del cuerpo: el DTO sólo dice que los dos campos son
 * opcionales, y es aquí donde se exige uno (§2.7.3). La casilla es el
 * consentimiento del dato BIOMÉTRICO (RN-10): sin foto no hay nada que
 * consentir, así que ni se pide ni se guarda constancia.
 */
export const revisarForma = ({
  casillaMarcada,
  duracionMinutos,
  placa,
  conFoto,
}: FormaDeVisita): Resultado<true, ErrorDominio> => {
  if (!conFoto && !tienePlaca(placa)) {
    return fallo(errorDominio('DATO_INVALIDO', MENSAJE_PLACA_O_FOTO));
  }
  if (conFoto && !casillaMarcada) {
    return fallo(
      errorDominio(
        'DATO_INVALIDO',
        'Falta confirmar que el visitante autorizó el uso de su foto',
        'ADR-032',
      ),
    );
  }
  // C9 (15-M) · una visita de 0 minutos —«de 02:33 a 02:33»— no autoriza a
  // nadie y se rechaza con palabras, antes que el resto de la cota.
  if (!Number.isInteger(duracionMinutos) || duracionMinutos <= 0) {
    return fallo(
      errorDominio(
        'DATO_INVALIDO',
        'La visita debe durar más de cero minutos: la hora de fin tiene que ser posterior a la de inicio',
      ),
    );
  }
  if (duracionMinutos < DURACION_MINIMA_MINUTOS || duracionMinutos > DURACION_MAXIMA_MINUTOS) {
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
 *   1. forma: placa o foto, casilla si hay foto, duración acotada, foto válida
 *      y con calidad —antes de crear NADA—;
 *   2. la persona por su documento;
 *   3. la autorización, que nace VIGENTE (autoaprobación, ADR-027);
 *   4. si hay foto, la foto, la plantilla y los equipos; sin foto (D-143) la
 *      autorización vale por placa y no se toca nada biométrico;
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
    const forma = revisarForma({
      casillaMarcada: entrada.casillaMarcada,
      duracionMinutos: entrada.duracionMinutos,
      placa: entrada.placa,
      conFoto: entrada.foto !== null,
    });
    if (esFallo(forma)) return forma;
    if (entrada.foto !== null) {
      const foto = revisarFoto(entrada.foto);
      if (esFallo(foto)) return foto;
      if (!foto.valor.aceptada) {
        return exito({ generada: false, motivosDeFoto: foto.valor.motivos });
      }
    }

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

    const rostro =
      entrada.foto === null
        ? exito({})
        : await this.registrarOAnular(ctx, {
            autorizacionId,
            titularId: personaId,
            hasta,
            foto: entrada.foto,
          });
    if (esFallo(rostro)) return rostro;

    await this.aviso.nueva(copropiedadId, autorizacionId);
    return exito({
      generada: true,
      autorizacionId,
      confirmacionDePlaca: confirmacionDePlaca({
        placa: entrada.placa,
        visitante: entrada.visitante.nombre,
        desde: entrada.inicio,
        hasta,
      }),
      ...rostro.valor,
    });
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
