import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';
import { Vigencia } from './vigencia';
import type { PatronRecurrencia } from './patron-recurrencia';
import type { Placa } from '../padron/placa';

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
const MAX_OBSERVACIONES = 1000;

const observacionesValidas = (texto: string | null): Resultado<string | null, ErrorDominio> => {
  if (texto === null) return exito(null);
  const limpio = texto.trim();
  if (limpio.length === 0) return exito(null);
  if (limpio.length > MAX_OBSERVACIONES) {
    return fallo(
      errorDominio(
        'DATO_INVALIDO',
        `Las observaciones tienen como máximo ${MAX_OBSERVACIONES} caracteres`,
      ),
    );
  }
  return exito(limpio);
};

export class Autorizacion {
  private constructor(
    readonly id: string,
    readonly copropiedadId: string,
    readonly viviendaId: string,
    readonly personaId: string,
    private _vigencia: Vigencia,
    private _estado: EstadoAutorizacion,
    private readonly _acompanantes: Acompanante[],
    private readonly _zonasPermitidas: Set<string>,
    readonly patron: PatronRecurrencia | null,
    readonly maximoAcompanantes: number,
    private _revocadaEn: Date | null,
    private _motivoRevocacion: string | null,
    /**
     * ETAPA 15-D (O3, [SUPUESTO] S-37) · la placa con la que el visitante entra
     * en vehículo y las observaciones del residente. La columna existía desde
     * la 0006 y la app del residente la escribía; el agregado no la conocía y
     * la consola no podía crear una autorización vehicular.
     */
    private _placa: Placa | null,
    private _observaciones: string | null,
  ) {}

  get vigencia(): Vigencia {
    return this._vigencia;
  }
  get placa(): Placa | null {
    return this._placa;
  }
  get observaciones(): string | null {
    return this._observaciones;
  }

  static crear(datos: {
    id: string;
    copropiedadId: string;
    viviendaId: string;
    personaId: string;
    vigencia: Vigencia;
    zonasPermitidas?: readonly string[];
    patron?: PatronRecurrencia | null;
    maximoAcompanantes?: number;
    placa?: Placa | null;
    observaciones?: string | null;
  }): Resultado<Autorizacion, ErrorDominio> {
    const maximo = datos.maximoAcompanantes ?? 5;
    if (!Number.isInteger(maximo) || maximo < 0 || maximo > 50) {
      return fallo(errorDominio('DATO_INVALIDO', 'Máximo de acompañantes fuera de rango', 'RN-05'));
    }
    const observaciones = observacionesValidas(datos.observaciones ?? null);
    if (!observaciones.ok) return observaciones;
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
        datos.placa ?? null,
        observaciones.valor,
      ),
    );
  }

  /**
   * **Rehidratación desde persistencia.** `crear` aplica las reglas de un alta
   * —nace vigente, sin acompañantes, con el máximo por defecto— y por eso no
   * sirve para reconstruir algo que ya existe: una autorización revocada
   * volvería del repositorio como vigente.
   *
   * No valida las invariantes de alta a propósito. Lo que entra por aquí ya
   * ocurrió y ya fue validado cuando ocurrió; volver a exigirlo haría que un
   * cambio de regla dejara ilegibles las filas escritas antes del cambio, que
   * es como un sistema pierde su propio historial. La barrera de escritura
   * sigue siendo `crear` y los métodos de intención.
   *
   * Es `internal` por convención de uso, no por lenguaje: la llama el
   * adaptador de persistencia, nunca un caso de uso.
   */
  static rehidratar(datos: {
    id: string;
    copropiedadId: string;
    viviendaId: string;
    personaId: string;
    vigencia: Vigencia;
    estado: EstadoAutorizacion;
    acompanantes: readonly Acompanante[];
    zonasPermitidas: readonly string[];
    patron: PatronRecurrencia | null;
    maximoAcompanantes: number;
    revocadaEn: Date | null;
    motivoRevocacion: string | null;
    placa?: Placa | null;
    observaciones?: string | null;
  }): Autorizacion {
    return new Autorizacion(
      datos.id,
      datos.copropiedadId,
      datos.viviendaId,
      datos.personaId,
      datos.vigencia,
      datos.estado,
      [...datos.acompanantes],
      new Set(datos.zonasPermitidas),
      datos.patron,
      datos.maximoAcompanantes,
      datos.revocadaEn,
      datos.motivoRevocacion,
      datos.placa ?? null,
      datos.observaciones ?? null,
    );
  }

  /**
   * ETAPA 15-D (O3) · lo que la consola puede CAMBIAR de una autorización viva:
   * hasta cuándo vale, con qué placa entra y las observaciones. No se cambia ni
   * la vivienda ni el visitante: eso es otra autorización, con su propia traza.
   *
   * Extender la vigencia de una revocada la resucitaría por la puerta de
   * atrás; y acortarla por debajo de «ahora» sería una revocación sin motivo.
   */
  modificar(
    cambios: {
      readonly hasta?: Date;
      readonly placa?: Placa | null;
      readonly observaciones?: string | null;
    },
    ahora: Date,
  ): Resultado<void, ErrorDominio> {
    if (this._estado === 'revocada') {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'La autorización está revocada'));
    }
    if (cambios.hasta !== undefined) {
      const vigencia = Vigencia.crear(this._vigencia.desde, cambios.hasta);
      if (!vigencia.ok) return vigencia;
      if (vigencia.valor.expiradaEn(ahora)) {
        return fallo(
          errorDominio(
            'DATO_INVALIDO',
            'La nueva vigencia ya estaría expirada: revoque con motivo en vez de acortarla',
            'RN-01',
          ),
        );
      }
      this._vigencia = vigencia.valor;
    }
    if (cambios.observaciones !== undefined) {
      const observaciones = observacionesValidas(cambios.observaciones);
      if (!observaciones.ok) return observaciones;
      this._observaciones = observaciones.valor;
    }
    if (cambios.placa !== undefined) this._placa = cambios.placa;
    return exito(undefined);
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
