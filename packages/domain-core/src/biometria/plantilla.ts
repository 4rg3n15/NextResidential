import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';
import type { CalidadDeCaptura } from './calidad-captura';
import type { ConsentimientoBiometrico } from './consentimiento';

/**
 * Agregado raíz `PlantillaBiometrica` — RN-09, RN-11 · CA-09, CA-10, CA-11.
 *
 * **La plantilla no lleva el vector.** Es la decisión que ordena todo el
 * agregado: aquí viven el estado, la calidad, el plazo de supresión y la
 * referencia a la llave, y el vector cifrado se maneja en la infraestructura,
 * que es la única capa que sabe cifrar. El dominio puede razonar sobre el ciclo
 * de vida del dato biométrico sin tener el dato biométrico delante, y eso
 * además hace que ninguna prueba de dominio manipule un vector real.
 *
 * `suprimir_en` no es decoración: es el compromiso legal. La cota la impone el
 * esquema (migración 0016 para el visitante, 0022 como tope absoluto), y este
 * agregado la respeta al construirse para no proponer lo que la base va a
 * rechazar — que el fallo salga en el dominio, con motivo, y no como una
 * violación de CHECK a mitad de la transacción.
 */
export const ESTADOS_PLANTILLA = [
  'pendiente_consentimiento',
  'pendiente_sincronizacion',
  'activa',
  'pendiente_supresion',
  'suprimida',
] as const;
export type EstadoPlantilla = (typeof ESTADOS_PLANTILLA)[number];

export interface DatosPlantilla {
  readonly id: string;
  readonly copropiedadId: string;
  readonly titularId: string;
  readonly consentimientoId: string;
  readonly autorizacionId?: string | null;
  readonly calidad: CalidadDeCaptura;
  readonly suprimirEn: Date;
  readonly creadoEn: Date;
  readonly sincronizadaEn?: Date | null;
  readonly suprimidaEn?: Date | null;
  readonly estado?: EstadoPlantilla;
}

/** Cota absoluta del punto 3 de la migración 0022, en milisegundos. */
const COTA_ABSOLUTA_MS = 5 * 365 * 24 * 3_600_000;

export class PlantillaBiometrica {
  private constructor(
    readonly id: string,
    readonly copropiedadId: string,
    readonly titularId: string,
    readonly consentimientoId: string,
    readonly autorizacionId: string | null,
    readonly calidad: CalidadDeCaptura,
    readonly suprimirEn: Date,
    readonly creadoEn: Date,
    readonly sincronizadaEn: Date | null,
    readonly suprimidaEn: Date | null,
    readonly estado: EstadoPlantilla,
  ) {
    Object.freeze(this);
  }

  static crear(datos: DatosPlantilla): Resultado<PlantillaBiometrica, ErrorDominio> {
    if (datos.consentimientoId.trim() === '') {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'No existe plantilla sin consentimiento al que responder',
          'RN-09',
        ),
      );
    }
    const plazo = datos.suprimirEn.getTime() - datos.creadoEn.getTime();
    if (plazo <= 0) {
      return fallo(
        errorDominio('DATO_INVALIDO', 'La supresión se programa hacia el futuro', 'RN-11'),
      );
    }
    if (plazo > COTA_ABSOLUTA_MS) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'El plazo de conservación excede la cota legal: un plazo sin tope no es un plazo',
          'RN-11',
        ),
      );
    }
    return exito(
      new PlantillaBiometrica(
        datos.id,
        datos.copropiedadId,
        datos.titularId,
        datos.consentimientoId,
        datos.autorizacionId ?? null,
        datos.calidad,
        datos.suprimirEn,
        datos.creadoEn,
        datos.sincronizadaEn ?? null,
        datos.suprimidaEn ?? null,
        datos.estado ?? 'pendiente_consentimiento',
      ),
    );
  }

  private con(cambios: {
    estado?: EstadoPlantilla;
    sincronizadaEn?: Date | null;
    suprimidaEn?: Date | null;
    suprimirEn?: Date;
  }): PlantillaBiometrica {
    return new PlantillaBiometrica(
      this.id,
      this.copropiedadId,
      this.titularId,
      this.consentimientoId,
      this.autorizacionId,
      this.calidad,
      cambios.suprimirEn ?? this.suprimirEn,
      this.creadoEn,
      cambios.sincronizadaEn === undefined ? this.sincronizadaEn : cambios.sincronizadaEn,
      cambios.suprimidaEn === undefined ? this.suprimidaEn : cambios.suprimidaEn,
      cambios.estado ?? this.estado,
    );
  }

  /**
   * Habilitar la sincronización **recibe el consentimiento entero**, no un
   * booleano.
   *
   * Aceptar `habilitar(true)` dejaría la comprobación en manos del llamador y
   * el agregado no podría hacer nada por RN-09: firmaría lo que le dijeran.
   * Recibiendo el agregado, la regla se comprueba aquí, y de paso se verifica lo
   * que ninguna otra capa comprueba —que el consentimiento sea **de este
   * titular**—: dos personas con permiso vigente cada una no autorizan la
   * plantilla de la otra.
   */
  habilitarSincronizacion(
    consentimiento: ConsentimientoBiometrico,
  ): Resultado<PlantillaBiometrica, ErrorDominio> {
    if (consentimiento.id !== this.consentimientoId) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'El consentimiento presentado no es el de esta plantilla',
          'RN-09',
        ),
      );
    }
    if (consentimiento.titularId !== this.titularId) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'El consentimiento es de otro titular: nadie consiente por otro',
          'RN-10',
        ),
      );
    }
    if (!consentimiento.vigente) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          `Sin consentimiento vigente no hay sincronización (estado ${consentimiento.estado})`,
          'RN-09',
        ),
      );
    }
    if (this.estado === 'suprimida') {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'Una plantilla suprimida no vuelve: se captura de nuevo, con consentimiento nuevo',
          'RN-11',
        ),
      );
    }
    return exito(this.con({ estado: 'pendiente_sincronizacion' }));
  }

  /** La terminal confirmó que la tiene. */
  marcarSincronizada(ahora: Date): Resultado<PlantillaBiometrica, ErrorDominio> {
    if (this.estado !== 'pendiente_sincronizacion') {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          `Solo se sincroniza lo que estaba pendiente de sincronizar (estado ${this.estado})`,
          'RN-09',
        ),
      );
    }
    return exito(this.con({ estado: 'activa', sincronizadaEn: ahora }));
  }

  /**
   * Revocación: la supresión pasa a ser **ahora**, sin condiciones (CA-11).
   * Es idempotente a propósito — revocar dos veces no es un error, y tratarlo
   * como tal complicaría al llamador sin proteger nada.
   */
  suprimirPorRevocacion(ahora: Date): PlantillaBiometrica {
    if (this.estado === 'suprimida') return this;
    return this.con({ estado: 'suprimida', suprimidaEn: ahora, suprimirEn: ahora });
  }

  /** Vencimiento del plazo: RN-11, dentro del margen de la copropiedad. */
  suprimirPorVencimiento(ahora: Date): Resultado<PlantillaBiometrica, ErrorDominio> {
    if (this.estado === 'suprimida') return exito(this);
    if (!this.venceEn(ahora)) {
      return fallo(
        errorDominio(
          'INVARIANTE_VIOLADA',
          'La plantilla no ha alcanzado su plazo de supresión',
          'RN-11',
        ),
      );
    }
    return exito(this.con({ estado: 'suprimida', suprimidaEn: ahora }));
  }

  venceEn(ahora: Date): boolean {
    return ahora.getTime() >= this.suprimirEn.getTime();
  }

  get suprimida(): boolean {
    return this.estado === 'suprimida';
  }

  /** Sigue en alguna terminal y ya no debería: la cola de retirada de CA-10. */
  get exigeRetirada(): boolean {
    return this.suprimida && this.sincronizadaEn !== null;
  }
}
