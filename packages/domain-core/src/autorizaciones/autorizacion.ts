import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';
import type { Vigencia } from './vigencia';
import type { PatronRecurrencia } from './patron-recurrencia';

export type EstadoAutorizacion = 'vigente' | 'revocada';

export interface Acompanante {
  readonly personaId: string;
  readonly nombre: string;
}

/**
 * Agregado raíz `Autorización` (§2.2). Su frontera de consistencia son la
 * vigencia, el patrón, los acompañantes y las zonas permitidas.
 *
 * Cambia por métodos de intención: `revocar(motivo, ahora)` exige motivo y
 * momento, y ninguno de los dos puede olvidarse porque están en la firma. Una
 * asignación externa —`autorizacion.estado = 'revocada'`— no podría exigirlos.
 *
 * **No decide accesos.** Responde preguntas sobre sí misma; quien decide es el
 * motor de reglas, que compone esas respuestas con las de otras políticas
 * según la precedencia vinculante del diagrama.
 */
export class Autorizacion {
  private constructor(
    readonly id: string,
    readonly copropiedadId: string,
    readonly viviendaId: string,
    readonly personaId: string,
    readonly vigencia: Vigencia,
    private _estado: EstadoAutorizacion,
    private readonly _acompanantes: Acompanante[],
    private readonly _zonasPermitidas: Set<string>,
    readonly patron: PatronRecurrencia | null,
    readonly maximoAcompanantes: number,
    private _revocadaEn: Date | null,
    private _motivoRevocacion: string | null,
  ) {}

  static crear(datos: {
    id: string;
    copropiedadId: string;
    viviendaId: string;
    personaId: string;
    vigencia: Vigencia;
    zonasPermitidas?: readonly string[];
    patron?: PatronRecurrencia | null;
    maximoAcompanantes?: number;
  }): Resultado<Autorizacion, ErrorDominio> {
    const maximo = datos.maximoAcompanantes ?? 5;
    if (!Number.isInteger(maximo) || maximo < 0 || maximo > 50) {
      return fallo(errorDominio('DATO_INVALIDO', 'Máximo de acompañantes fuera de rango', 'RN-05'));
    }
    return exito(
      new Autorizacion(
        datos.id,
        datos.copropiedadId,
        datos.viviendaId,
        datos.personaId,
        datos.vigencia,
        'vigente',
        [],
        new Set(datos.zonasPermitidas ?? []),
        datos.patron ?? null,
        maximo,
        null,
        null,
      ),
    );
  }

  get estado(): EstadoAutorizacion {
    return this._estado;
  }
  get acompanantes(): readonly Acompanante[] {
    return this._acompanantes;
  }
  get zonasPermitidas(): readonly string[] {
    return [...this._zonasPermitidas];
  }
  get revocadaEn(): Date | null {
    return this._revocadaEn;
  }
  get motivoRevocacion(): string | null {
    return this._motivoRevocacion;
  }
  get esRecurrente(): boolean {
    return this.patron !== null;
  }

  /** RN-01. Revocada es revocada aunque la vigencia siga corriendo. */
  estaVigenteEn(ahora: Date): boolean {
    return this._estado === 'vigente' && this.vigencia.contiene(ahora);
  }

  /** RN-22. Una autorización sin patrón aplica siempre dentro de su vigencia. */
  aplicaElPatronEn(ahora: Date): boolean {
    return this.patron === null || this.patron.aplicaEn(ahora);
  }

  /** RN-14. Sin zonas declaradas, no alcanza ninguna zona restringida. */
  alcanzaZona(zonaId: string): boolean {
    return this._zonasPermitidas.has(zonaId);
  }

  revocar(motivo: string, ahora: Date): Resultado<void, ErrorDominio> {
    if (this._estado === 'revocada') {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'La autorización ya está revocada'));
    }
    if (motivo.trim().length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'La revocación exige un motivo', 'RN-19'));
    }
    this._estado = 'revocada';
    this._revocadaEn = new Date(ahora.getTime());
    this._motivoRevocacion = motivo.trim();
    return exito(undefined);
  }

  /**
   * RN-05. Los acompañantes se añaden a una autorización VIGENTE: sumar
   * personas a una revocada las dejaría con un permiso que su titular ya retiró.
   */
  agregarAcompanante(acompanante: Acompanante, ahora: Date): Resultado<void, ErrorDominio> {
    if (this._estado === 'revocada') {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'La autorización está revocada', 'RN-05'),
      );
    }
    if (this.vigencia.expiradaEn(ahora)) {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'La vigencia ya expiró', 'RN-01'));
    }
    if (this._acompanantes.length >= this.maximoAcompanantes) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          `No se admiten más de ${this.maximoAcompanantes} acompañantes`,
          'RN-05',
        ),
      );
    }
    if (this._acompanantes.some((a) => a.personaId === acompanante.personaId)) {
      return fallo(errorDominio('INVARIANTE_VIOLADA', 'La persona ya es acompañante', 'RN-05'));
    }
    if (acompanante.personaId === this.personaId) {
      return fallo(
        errorDominio('DATO_INVALIDO', 'El titular no es acompañante de sí mismo', 'RN-05'),
      );
    }
    this._acompanantes.push(acompanante);
    return exito(undefined);
  }

  /**
   * D-01: el acompañante entra **por su propia identidad**, no como un anexo
   * sin nombre. Es lo que permite que la lista negra lo alcance (RN-06): si los
   * acompañantes no tuvieran `personaId`, un vetado entraría acompañando a otro.
   */
  cubreAPersona(personaId: string): boolean {
    return (
      this.personaId === personaId || this._acompanantes.some((a) => a.personaId === personaId)
    );
  }
}
