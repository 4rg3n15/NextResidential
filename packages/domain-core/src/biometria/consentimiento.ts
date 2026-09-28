import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';

/**
 * Agregado raíz `ConsentimientoBiometrico` — RN-09, RN-10, Ley 1581 de 2012.
 *
 * **La invariante que sostiene es de titularidad, y es la razón de que este
 * agregado exista separado de la plantilla:** el consentimiento lo otorga el
 * TITULAR del dato —el visitante—, nunca el residente que lo invita ni el
 * administrador que lo registra (RN-10, art. 9 de la Ley 1581).
 *
 * Esa regla se sostiene aquí igual que en el esquema (decisión D-08): **no hay
 * ningún método ni campo con el que expresar «otro consintió por él»**. No se
 * prohíbe la delegación con una comprobación; se hace inexpresable. Un `if` se
 * puede quitar en un refactor sin que nadie lo note; una API que no ofrece la
 * operación, no.
 *
 * El agregado NO conoce la plantilla: la relación va en el otro sentido —la
 * plantilla apunta a su consentimiento—, porque la vida del consentimiento no
 * depende de que haya plantilla y sí al revés.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ETAPA 15-L (F4) · DOS ORÍGENES, Y NO SE CONFUNDEN — decisión del cliente
 *
 * El cliente decidió que la única constancia obligatoria sea una casilla en el
 * formulario de la autorización: «El visitante autorizó el uso de su foto para
 * el ingreso». Quien la marca es quien REGISTRA (residente, portero,
 * administración), no el titular. Eso no se disfraza de lo que no es: el
 * consentimiento lleva su ORIGEN, y uno `declarado_por_quien_registra` nunca
 * pasa por `otorgar()` ni se confunde con uno `otorgado_por_el_titular`. La
 * regla de titularidad sigue intacta para todo lo demás —otorgar, rechazar y
 * revocar siguen siendo del titular—; lo que se añade es una declaración con
 * autor, momento y versión del texto (ADR-032, riesgo legal aceptado por el
 * cliente). Si el titular está presente, puede CONFIRMARLO él mismo
 * (`confirmarPorElTitular`, D-10): entonces el origen pasa a ser el suyo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const ESTADOS_CONSENTIMIENTO = [
  'pendiente',
  'vigente',
  'rechazado',
  'revocado',
  'expirado',
] as const;
export type EstadoConsentimiento = (typeof ESTADOS_CONSENTIMIENTO)[number];

export const CANALES = ['app', 'sms', 'correo', 'whatsapp', 'presencial'] as const;
export type CanalConsentimiento = (typeof CANALES)[number];

/** F4 (15-L) · quién dejó constancia del consentimiento. */
export const ORIGENES_DE_CONSENTIMIENTO = [
  'otorgado_por_el_titular',
  'declarado_por_quien_registra',
] as const;
export type OrigenDeConsentimiento = (typeof ORIGENES_DE_CONSENTIMIENTO)[number];

/** Lo que se sabe de una declaración: quién marcó la casilla, cuándo y sobre qué texto. */
export interface DatosDeDeclaracion {
  readonly id: string;
  readonly copropiedadId: string;
  readonly titularId: string;
  readonly finalidad: string;
  /** La versión del TEXTO de la casilla que se marcó. */
  readonly versionPolitica: string;
  readonly canal: CanalConsentimiento;
  /** La cuenta que marcó la casilla. Nunca vacía. */
  readonly declaradoPor: string;
  readonly ahora: Date;
}

export interface DatosConsentimiento {
  readonly id: string;
  readonly copropiedadId: string;
  /** El TITULAR. No hay campo para quien lo invita: RN-10, D-08. */
  readonly titularId: string;
  readonly finalidad: string;
  readonly versionPolitica: string;
  readonly canal: CanalConsentimiento;
  readonly solicitadoEn: Date;
  readonly otorgadoEn?: Date | null;
  readonly revocadoEn?: Date | null;
  readonly evidenciaId?: string | null;
  readonly estado?: EstadoConsentimiento;
  /** F4 · por omisión, del titular: es lo que había antes de la 15-L. */
  readonly origen?: OrigenDeConsentimiento;
  /** F4 · quién marcó la casilla, si el origen es la declaración. */
  readonly declaradoPor?: string | null;
}

export class ConsentimientoBiometrico {
  private constructor(
    readonly id: string,
    readonly copropiedadId: string,
    readonly titularId: string,
    readonly finalidad: string,
    readonly versionPolitica: string,
    readonly canal: CanalConsentimiento,
    readonly solicitadoEn: Date,
    readonly otorgadoEn: Date | null,
    readonly revocadoEn: Date | null,
    readonly evidenciaId: string | null,
    readonly estado: EstadoConsentimiento,
    readonly origen: OrigenDeConsentimiento,
    readonly declaradoPor: string | null,
  ) {
    Object.freeze(this);
  }

  static solicitar(datos: DatosConsentimiento): Resultado<ConsentimientoBiometrico, ErrorDominio> {
    if (datos.titularId.trim() === '') {
      return fallo(errorDominio('DATO_INVALIDO', 'El consentimiento necesita un titular', 'RN-10'));
    }
    if (datos.versionPolitica.trim() === '' || datos.versionPolitica.length > 50) {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          'La versión de la política de tratamiento es obligatoria y de hasta 50 caracteres',
          'RN-09',
        ),
      );
    }
    if (datos.finalidad.trim() === '') {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          'La finalidad es obligatoria: sin ella el consentimiento no es informado',
          'RN-09',
        ),
      );
    }
    return exito(
      new ConsentimientoBiometrico(
        datos.id,
        datos.copropiedadId,
        datos.titularId,
        datos.finalidad,
        datos.versionPolitica,
        datos.canal,
        datos.solicitadoEn,
        datos.otorgadoEn ?? null,
        datos.revocadoEn ?? null,
        datos.evidenciaId ?? null,
        datos.estado ?? 'pendiente',
        datos.origen ?? 'otorgado_por_el_titular',
        datos.declaradoPor ?? null,
      ),
    );
  }

  /**
   * F4 (15-L) · la casilla del formulario: nace VIGENTE, con el ORIGEN
   * «declarado por quien registra», su autor y la versión del texto. No pasa
   * por `otorgar()`: no es el titular quien acepta, y el registro lo dice.
   */
  static declarar(d: DatosDeDeclaracion): Resultado<ConsentimientoBiometrico, ErrorDominio> {
    if (d.declaradoPor.trim() === '') {
      return fallo(
        errorDominio('DATO_INVALIDO', 'La declaración necesita saber quién marcó la casilla', 'F4'),
      );
    }
    const r = ConsentimientoBiometrico.solicitar({
      id: d.id,
      copropiedadId: d.copropiedadId,
      titularId: d.titularId,
      finalidad: d.finalidad,
      versionPolitica: d.versionPolitica,
      canal: d.canal,
      solicitadoEn: d.ahora,
    });
    if (!r.ok) return r;
    return exito(
      r.valor.con({
        estado: 'vigente',
        otorgadoEn: d.ahora,
        origen: 'declarado_por_quien_registra',
        declaradoPor: d.declaradoPor,
      }),
    );
  }

  private con(cambios: Partial<DatosConsentimiento>): ConsentimientoBiometrico {
    return new ConsentimientoBiometrico(
      this.id,
      this.copropiedadId,
      this.titularId,
      this.finalidad,
      this.versionPolitica,
      this.canal,
      this.solicitadoEn,
      cambios.otorgadoEn === undefined ? this.otorgadoEn : (cambios.otorgadoEn ?? null),
      cambios.revocadoEn === undefined ? this.revocadoEn : (cambios.revocadoEn ?? null),
      cambios.evidenciaId === undefined ? this.evidenciaId : (cambios.evidenciaId ?? null),
      cambios.estado ?? this.estado,
      cambios.origen ?? this.origen,
      cambios.declaradoPor === undefined ? this.declaradoPor : (cambios.declaradoPor ?? null),
    );
  }

  /**
   * D-10 como OPCIÓN (15-L, F4): el titular, presente, confirma él mismo una
   * declaración vigente. El origen pasa a ser suyo; la vigencia no cambia.
   */
  confirmarPorElTitular(
    quienConfirma: string,
    ahora: Date,
  ): Resultado<ConsentimientoBiometrico, ErrorDominio> {
    if (quienConfirma !== this.titularId) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'Solo el titular del dato biométrico puede confirmar su consentimiento',
          'RN-10',
        ),
      );
    }
    if (!this.vigente || this.origen !== 'declarado_por_quien_registra') {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'Solo se confirma una declaración vigente de quien registró la visita',
          'F4',
        ),
      );
    }
    return exito(this.con({ origen: 'otorgado_por_el_titular', otorgadoEn: ahora }));
  }

  /**
   * Otorgar exige el identificador de quien acepta, y ese identificador **debe
   * ser el del titular**.
   *
   * Podría no pedirse —el agregado ya sabe quién es su titular— y entonces la
   * llamada sería `consentimiento.otorgar(ahora)`, imposible de auditar: nada
   * en la firma obligaría a comprobar quién está al otro lado de la pantalla.
   * Pedirlo convierte RN-10 en una condición que el llamador tiene que
   * satisfacer explícitamente, y que aquí se verifica.
   */
  otorgar(
    quienAcepta: string,
    ahora: Date,
    evidenciaId?: string,
  ): Resultado<ConsentimientoBiometrico, ErrorDominio> {
    if (quienAcepta !== this.titularId) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'Solo el titular del dato biométrico puede otorgar su consentimiento',
          'RN-10',
        ),
      );
    }
    if (this.estado !== 'pendiente') {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          `Un consentimiento en estado ${this.estado} no se puede otorgar`,
          'RN-09',
        ),
      );
    }
    return exito(
      this.con({
        estado: 'vigente',
        otorgadoEn: ahora,
        ...(evidenciaId === undefined ? {} : { evidenciaId }),
      }),
    );
  }

  rechazar(quienRechaza: string, ahora: Date): Resultado<ConsentimientoBiometrico, ErrorDominio> {
    if (quienRechaza !== this.titularId) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'Solo el titular puede rechazar el tratamiento de su dato biométrico',
          'RN-10',
        ),
      );
    }
    if (this.estado !== 'pendiente') {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          `Un consentimiento en estado ${this.estado} no se puede rechazar`,
          'RN-09',
        ),
      );
    }
    return exito(this.con({ estado: 'rechazado', revocadoEn: ahora }));
  }

  /**
   * Revocar es un derecho del titular y **no admite condiciones**: no se le
   * puede exigir motivo, ni que la autorización haya vencido, ni que un
   * administrador lo apruebe. Por eso no hay más comprobación que la de
   * titularidad y la de que quede algo que revocar.
   */
  revocar(quienRevoca: string, ahora: Date): Resultado<ConsentimientoBiometrico, ErrorDominio> {
    if (quienRevoca !== this.titularId) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'Solo el titular puede revocar su consentimiento',
          'RN-10',
        ),
      );
    }
    if (this.estado === 'revocado') return exito(this);
    if (this.estado !== 'vigente') {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          `No hay consentimiento vigente que revocar (estado ${this.estado})`,
          'RN-11',
        ),
      );
    }
    return exito(this.con({ estado: 'revocado', revocadoEn: ahora }));
  }

  /**
   * El plazo de respuesta se agota (CU-02, flujo alterno). No es un rechazo:
   * el titular no dijo que no, no dijo nada. La consecuencia práctica es la
   * misma —no hay plantilla— y la jurídica no, así que el estado es distinto.
   */
  expirar(ahora: Date): Resultado<ConsentimientoBiometrico, ErrorDominio> {
    if (this.estado !== 'pendiente') {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          `Solo expira lo que sigue pendiente (estado ${this.estado})`,
          'RN-09',
        ),
      );
    }
    return exito(this.con({ estado: 'expirado', revocadoEn: ahora }));
  }

  /** La única pregunta que el resto del sistema le hace de verdad. */
  get vigente(): boolean {
    return this.estado === 'vigente' && this.otorgadoEn !== null && this.revocadoEn === null;
  }

  /** Plazo de respuesta agotado, según el margen que fije la copropiedad. */
  venciendo(ahora: Date, plazoHoras: number): boolean {
    if (this.estado !== 'pendiente') return false;
    return ahora.getTime() - this.solicitadoEn.getTime() >= plazoHoras * 3_600_000;
  }
}
