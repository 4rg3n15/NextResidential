import {
  MENSAJE_ROSTRO_EDAD_INSUFICIENTE,
  MENSAJE_ROSTRO_YA_ES_MAYOR,
  aptitudDelRostroDeMenor,
  cumpleMayoriaEn,
} from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { RostroDeResidente } from '../../biometria';
import type { ResolverMiAmbito } from './casos-de-uso';
import { estadoDelRostro } from './estado-del-rostro';
import type { EstadoDeMiRostro } from './estado-del-rostro';
import { POLITICA_DEL_ROSTRO_DE_MENOR } from './politica-del-rostro';
import { DIA_MS, rechazo, rechazoAntesDeCapturar } from './puerta-del-rostro';
import type { FotoDeRostro, RechazoDelRostro, ResultadoDeMiRostro } from './puerta-del-rostro';
import type { BitacoraDeResidentes, OcupantesDeLaVivienda } from './puertos-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D3 · EL ROSTRO DE UN MENOR DE 15 A 17 AÑOS · ADR-039, Ley 1581 art. 7
 *
 * Lo registra, lee y retira SÓLO el titular del hogar (`ocupacion_de_viviendas.
 * primer_residente_id`), como su representante legal: otro adulto de la vivienda
 * recibe 403, y un `:residenteId` que no sea un residente activo y sin cuenta de
 * SU vivienda —filtrado en el SQL— es 404. La edad la juzga el dominio con el
 * reloj inyectado: menos de 15 o 18 cumplidos, 400 con su código.
 *
 * Al registrar declara dos cosas, y las dos son obligatorias (el DTO exige
 * `true`): que es su representante legal y que el menor fue informado y está de
 * acuerdo —el derecho del menor a ser oído—. El consentimiento nace con origen
 * `autorizado_por_representante_legal` y la cuenta del titular como autora; la
 * plantilla vence al año o al cumplir 18, lo que ocurra antes. La misma puerta
 * que el rostro propio (política, foto, tope de 24 h de la CUENTA), y la
 * biometría hace el resto. En la bitácora, el hecho y el residente: nunca la
 * imagen ni el documento.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const MENORES_PARA_EL_ROSTRO = Symbol('MENORES_PARA_EL_ROSTRO');

export interface MenorParaElRostro {
  readonly personaId: string;
  readonly fechaNacimiento: string | null;
}

export interface MenoresParaElRostro {
  /** Residente ACTIVO y SIN cuenta de ESA vivienda, filtrado en el SQL; `null` es un 404. */
  delHogar(
    copropiedadId: string,
    viviendaId: string,
    residenteId: string,
  ): Promise<MenorParaElRostro | null>;
}

/** Lo que el titular declara al registrar; el DTO no deja pasar otra cosa que `true`. */
export interface DeclaracionesDelRepresentante {
  readonly declaraRepresentacionLegal: true;
  readonly menorInformadoYDeAcuerdo: true;
}

export type EstadoDelRostroDeMenor =
  | {
      readonly hecho: true;
      readonly estado: EstadoDeMiRostro & {
        readonly politica: typeof POLITICA_DEL_ROSTRO_DE_MENOR;
      };
    }
  | RechazoDelRostro;

interface MenorDelTitular extends MenorParaElRostro {
  readonly viviendaId: string;
}

const dar = <T>(valor: T): Resultado<T, ErrorDominio> => ({ ok: true, valor });

export class RostroDeMisMenores {
  constructor(
    private readonly ambito: Pick<ResolverMiAmbito, 'ejecutar'>,
    private readonly ocupantes: Pick<OcupantesDeLaVivienda, 'declaracion'>,
    private readonly menores: MenoresParaElRostro,
    private readonly rostro: Pick<
      RostroDeResidente,
      'registrar' | 'retirar' | 'leer' | 'capturasRecientes'
    >,
    private readonly bitacora: BitacoraDeResidentes,
    private readonly reloj: Reloj,
    /** `ROSTRO_RESIDENTE_RETENCION_DIAS`: el tope, si cumple 18 después. */
    private readonly retencionDias: number,
  ) {}

  async estado(
    ctx: ContextoTenant,
    cop: string,
    residenteId: string,
  ): Promise<Resultado<EstadoDelRostroDeMenor, ErrorDominio>> {
    const m = await this.delTitular(ctx, cop, residenteId);
    if (!m.ok) return m;
    if (!('personaId' in m.valor)) return dar(m.valor);
    const estado = await this.leer(ctx, m.valor.personaId);
    return dar({ hecho: true, estado: { ...estado, politica: POLITICA_DEL_ROSTRO_DE_MENOR } });
  }

  async registrar(
    ctx: ContextoTenant,
    cop: string,
    residenteId: string,
    foto: FotoDeRostro & DeclaracionesDelRepresentante,
  ): Promise<Resultado<ResultadoDeMiRostro, ErrorDominio>> {
    const m = await this.delTitular(ctx, cop, residenteId);
    if (!m.ok) return m;
    if (!('personaId' in m.valor)) return dar(m.valor);
    const { personaId, fechaNacimiento, viviendaId } = m.valor;
    const ahora = this.reloj.ahora();
    const porEdad = rechazoPorEdad(fechaNacimiento, ahora);
    if (porEdad !== null) return dar(porEdad);
    const antes = await rechazoAntesDeCapturar(
      foto,
      POLITICA_DEL_ROSTRO_DE_MENOR.version,
      () => this.rostro.capturasRecientes(cop, ctx.usuarioId, ahora),
      ahora,
    );
    if (antes !== null) return dar<ResultadoDeMiRostro>(antes);

    const hecho = await this.rostro.registrar(ctx, {
      titularId: personaId,
      vector: Buffer.from(foto.contenidoBase64, 'base64'),
      medidas: foto.medidas,
      versionPolitica: foto.versionPolitica,
      suprimirEn: this.suprimirEn(fechaNacimiento, ahora),
      representanteId: ctx.usuarioId,
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
          : rechazo(409, 'Otro registro de este rostro terminó antes: vuelva a intentarlo'),
      );
    }
    await this.anotar(ctx, cop, viviendaId, 'rostro_de_menor_registrado', residenteId, ahora);
    return dar<ResultadoDeMiRostro>({ hecho: true, estado: await this.leer(ctx, personaId) });
  }

  async retirar(
    ctx: ContextoTenant,
    cop: string,
    residenteId: string,
  ): Promise<Resultado<ResultadoDeMiRostro, ErrorDominio>> {
    const m = await this.delTitular(ctx, cop, residenteId);
    if (!m.ok) return m;
    if (!('personaId' in m.valor)) return dar(m.valor);
    const { personaId, viviendaId } = m.valor;
    const habia = await this.rostro.retirar(ctx, personaId, ctx.usuarioId);
    if (!habia.ok) return habia;
    if (!habia.valor) return dar(rechazo(404, 'Este menor no tiene un rostro registrado'));
    const ahora = this.reloj.ahora();
    await this.anotar(ctx, cop, viviendaId, 'rostro_de_menor_retirado', residenteId, ahora);
    return dar<ResultadoDeMiRostro>({ hecho: true, estado: await this.leer(ctx, personaId) });
  }

  /** Ámbito, titular del hogar (403) y menor de SU vivienda (404), en ese orden. */
  private async delTitular(
    ctx: ContextoTenant,
    cop: string,
    residenteId: string,
  ): Promise<Resultado<MenorDelTitular | RechazoDelRostro, ErrorDominio>> {
    const r = await this.ambito.ejecutar(ctx, cop);
    if (!r.ok) return r;
    const { viviendaId } = r.valor.ambito;
    const d = await this.ocupantes.declaracion(cop, viviendaId, ctx.usuarioId);
    if (!d.esPrimerResidente) {
      return dar(rechazo(403, 'Sólo el titular del hogar gestiona el rostro de un menor'));
    }
    const menor = await this.menores.delHogar(cop, viviendaId, residenteId);
    if (menor === null) return dar(rechazo(404, 'No encontrado en su vivienda'));
    return dar({ ...menor, viviendaId });
  }

  /** Al año, o al cumplir 18 si es antes: el rostro de un menor no pasa a la mayoría de edad. */
  private suprimirEn(fechaNacimiento: string | null, ahora: Date): Date {
    const alAnio = ahora.getTime() + this.retencionDias * DIA_MS;
    const mayoria = fechaNacimiento === null ? null : cumpleMayoriaEn(fechaNacimiento);
    return new Date(mayoria === null ? alAnio : Math.min(alAnio, mayoria.getTime()));
  }

  private async leer(ctx: ContextoTenant, personaId: string): Promise<EstadoDeMiRostro> {
    return estadoDelRostro(await this.rostro.leer(ctx, personaId), this.reloj.ahora());
  }

  private anotar(
    ctx: ContextoTenant,
    copropiedadId: string,
    viviendaId: string,
    tipo: 'rostro_de_menor_registrado' | 'rostro_de_menor_retirado',
    residenteId: string,
    ahora: Date,
  ) {
    return this.bitacora.anotar({
      copropiedadId,
      tipo,
      ocurridoEn: ahora,
      usuarioId: ctx.usuarioId,
      actorId: ctx.usuarioId,
      viviendaId,
      // Sin bytes ni documento: el residente y, al registrar, la versión aceptada.
      detalle:
        tipo === 'rostro_de_menor_registrado'
          ? `residente:${residenteId} politica:${POLITICA_DEL_ROSTRO_DE_MENOR.version}`
          : `residente:${residenteId}`,
    });
  }
}

/** S-15W-01 · de 15 cumplidos a la víspera de los 18, con el día de Bogotá. */
const rechazoPorEdad = (fechaNacimiento: string | null, ahora: Date): RechazoDelRostro | null => {
  const aptitud = aptitudDelRostroDeMenor(fechaNacimiento, ahora);
  if (aptitud === 'APTO') return null;
  if (aptitud === 'SIN_FECHA') {
    return rechazo(400, 'Registre primero su fecha de nacimiento en Mi familia', {
      codigo: 'SIN_FECHA',
    });
  }
  return aptitud === 'EDAD_INSUFICIENTE'
    ? rechazo(400, MENSAJE_ROSTRO_EDAD_INSUFICIENTE, { codigo: 'EDAD_INSUFICIENTE' })
    : rechazo(400, MENSAJE_ROSTRO_YA_ES_MAYOR, { codigo: 'YA_ES_MAYOR' });
};
