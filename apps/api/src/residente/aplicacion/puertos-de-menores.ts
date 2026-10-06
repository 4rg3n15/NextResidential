/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS MENORES DEL HOGAR · RONDA 15-W (D-W2, D4, ADR-038)
 *
 * Sólo los mayores de 18 años tienen cuenta. Un menor es una PERSONA y un
 * RESIDENTE de la vivienda SIN cuenta, que ocupa una plaza libre de ella. Lo
 * registra, edita y da de baja cualquier adulto con cuenta de ESA vivienda.
 *
 * Todo `residenteId` se busca por (copropiedad, vivienda del ámbito) y SIN
 * cuenta asociada, en el propio SQL: el de otra vivienda —o el de un adulto
 * con cuenta— no existe para esta ruta (404).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const MENORES_DEL_HOGAR = Symbol('MENORES_DEL_HOGAR');

export interface MenorDelHogar {
  readonly residenteId: string;
  readonly nombres: string | null;
  readonly apellidos: string | null;
  readonly nombreCompleto: string;
  readonly fechaNacimiento: string | null;
  readonly tipoDocumento: string;
  /** Sale enmascarado de la aplicación: nunca entero hacia la app. */
  readonly numeroDocumento: string;
  readonly parentesco: string | null;
  readonly plazaId: string | null;
  readonly plazaNumero: number | null;
  readonly tieneRostro: boolean;
}

export interface DatosDelMenor {
  readonly nombres: string;
  readonly apellidos: string;
  readonly fechaNacimiento: string;
  readonly parentesco: string;
}

export interface AltaDeMenor extends DatosDelMenor {
  readonly tipoDocumento: string;
  /** Ya normalizado por el dominio. */
  readonly numeroDocumento: string;
  readonly plazaId: string;
}

export type MenorEscrito =
  | { readonly ok: true; readonly residenteId: string; readonly personaId: string }
  | {
      readonly ok: false;
      readonly motivo: 'NO_ENCONTRADO' | 'PLAZA_OCUPADA' | 'DOCUMENTO_EN_USO';
    };

export interface PlazaParaTraspaso {
  readonly plazaId: string;
  readonly generacion: number;
  readonly fechaNacimiento: string | null;
}

export interface MenoresDelHogar {
  listar(copropiedadId: string, viviendaId: string): Promise<readonly MenorDelHogar[]>;
  /** Persona, residente y plaza LIBRE de la vivienda, en una transacción. */
  registrar(
    copropiedadId: string,
    viviendaId: string,
    actorId: string,
    alta: AltaDeMenor,
  ): Promise<MenorEscrito>;
  editar(
    copropiedadId: string,
    viviendaId: string,
    residenteId: string,
    actorId: string,
    datos: DatosDelMenor,
  ): Promise<MenorEscrito>;
  /** Baja lógica con motivo; su plaza queda libre con otro código (generación + 1). */
  darDeBaja(
    copropiedadId: string,
    viviendaId: string,
    residenteId: string,
    actorId: string,
    motivo: string,
  ): Promise<MenorEscrito>;
  /** La plaza que ocupa esa persona sin cuenta, para derivar su código de traspaso. */
  plazaParaTraspaso(
    copropiedadId: string,
    viviendaId: string,
    residenteId: string,
  ): Promise<PlazaParaTraspaso | null>;
}
