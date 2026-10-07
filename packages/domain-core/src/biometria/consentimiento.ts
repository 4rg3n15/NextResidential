import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';
import type {
  CanalConsentimiento,
  DatosConsentimiento,
  DatosDeDeclaracion,
  DatosDeRepresentacion,
  EstadoConsentimiento,
  OrigenDeConsentimiento,
} from './consentimiento-datos';

export * from './consentimiento-datos';

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
 * Tres orígenes, y no se confunden (F4 de la 15-L; el representante legal, 15-X
 * D3): ver `ORIGENES_DE_CONSENTIMIENTO`. El del representante no abre la
 * delegación: es la figura que la ley pone para el dato de un menor, con su
 * nombre, su origen y su autor; nada permite que otro cualquiera consienta.
 */
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
    return ConsentimientoBiometrico.vigenteCon(d, 'declarado_por_quien_registra', d.declaradoPor);
  }

  /**
   * 15-X · D3 · el representante legal de un menor de 15 a 17 años autoriza el
   * tratamiento de su rostro. Nace VIGENTE, con su origen y su autor: no es el
   * menor quien acepta, y el registro lo dice.
   */
  static autorizarComoRepresentanteLegal(
    d: DatosDeRepresentacion,
  ): Resultado<ConsentimientoBiometrico, ErrorDominio> {
    const sinAutor = ConsentimientoBiometrico.sinRepresentante(d.representanteId, d.titularId);
    if (sinAutor !== null) return fallo(sinAutor);
    return ConsentimientoBiometrico.vigenteCon(
      d,
      'autorizado_por_representante_legal',
      d.representanteId,
    );
  }

  /** Nace vigente desde su constancia: la casilla (F4) o el representante (D3). */
  private static vigenteCon(
    d: DatosDeDeclaracion | DatosDeRepresentacion,
    origen: OrigenDeConsentimiento,
    autor: string,
  ): Resultado<ConsentimientoBiometrico, ErrorDominio> {
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
      r.valor.con({ estado: 'vigente', otorgadoEn: d.ahora, origen, declaradoPor: autor }),
    );
  }

  /** RN-10 · un representante tiene autor, y no es el propio titular. */
  private static sinRepresentante(representanteId: string, titularId: string): ErrorDominio | null {
    if (representanteId.trim() !== '' && representanteId !== titularId) return null;
    return errorDominio(
      'DATO_INVALIDO',
      'El representante legal es una cuenta con nombre propio, distinta del titular',
      'RN-10',
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
   * 15-X · D3 · también la autorización de su representante, cuando ya mayor
   * de edad registra su rostro desde su propia cuenta.
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
    if (!this.vigente || this.origen === 'otorgado_por_el_titular') {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'Solo se confirma una declaración o una autorización del representante, vigentes',
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
    return this.cerrar(ahora);
  }

  /**
   * 15-X · D3 · un representante legal retira la autorización que dio un
   * representante, sin condiciones, como el titular la suya. Sólo ésa: el
   * consentimiento PROPIO del titular, o una casilla, no los toca nadie más.
   * Quién es representante lo decide la aplicación —el titular del hogar,
   * ADR-039—, así que el que sucede al que la dio también puede retirarla.
   */
  revocarComoRepresentanteLegal(
    representanteId: string,
    ahora: Date,
  ): Resultado<ConsentimientoBiometrico, ErrorDominio> {
    const sinAutor = ConsentimientoBiometrico.sinRepresentante(representanteId, this.titularId);
    if (sinAutor !== null) return fallo(sinAutor);
    if (this.origen !== 'autorizado_por_representante_legal') {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'Un representante legal solo retira la autorización que dio un representante legal',
          'RN-10',
        ),
      );
    }
    return this.cerrar(ahora);
  }

  /** Lo común a toda revocación: repetirla no es un error, y sólo se cierra lo vigente. */
  private cerrar(ahora: Date): Resultado<ConsentimientoBiometrico, ErrorDominio> {
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
