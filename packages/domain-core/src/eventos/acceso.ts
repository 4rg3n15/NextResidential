import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio, MotivoAcceso } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';
import type { VersionDeReglas } from '../autorizaciones/version-de-reglas';
import type { ResultadoAcceso } from '../reglas/resultado-acceso';
import type { MetodoDeAcceso } from '../reglas/contexto';

/**
 * Tipos de evento del agregado `Acceso`, alineados con el enumerado
 * `tipo_evento` de la migración 0011. Se enumeran aquí y no se derivan de la
 * base porque el dominio no la conoce; la prueba `acceso.test.ts` comprueba que
 * la lista coincide con la del esquema, para que una divergencia se vea.
 */
export const TIPOS_DE_EVENTO = ['ingreso', 'salida', 'denegado', 'alerta', 'manual'] as const;
export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number];

/** Datos del hecho, ya normalizados por la capa que habló con el equipo. */
export interface HechoDeAcceso {
  readonly id: string;
  readonly copropiedadId: string;
  readonly ocurridoEn: Date;
  readonly tipo: TipoDeEvento;
  readonly metodo: MetodoDeAcceso;
  readonly dispositivoId: string;
  readonly claveIdempotencia: string;
  readonly personaId?: string | null;
  readonly viviendaId?: string | null;
  readonly autorizacionId?: string | null;
  readonly zonaId?: string | null;
  readonly placaDetectada?: string | null;
  readonly confianza?: number | null;
  readonly evidenciaId?: string | null;
  /** Apertura o negación manual: quién la ordenó y por qué (RN-08, CA-16). */
  readonly operadorId?: string | null;
  readonly motivoManual?: string | null;
  /** ETAPA 12: la decisión la tomó el Edge, y con qué frescura de caché. */
  readonly decididoPorEdge?: boolean;
  readonly cachePotencialmenteObsoleto?: boolean;
}

const CLAVE_MIN = 8;
const CLAVE_MAX = 200;
const PLACA_NORMALIZADA = /^[A-Z0-9]{5,8}$/;

/**
 * Agregado raíz `Acceso` — **inmutable**. RN-02, RN-03, CA-23, ADR-005.
 *
 * No tiene setters, ni métodos de intención que cambien su estado, ni forma de
 * borrarse: la única operación es nacer. Eso no es una convención de estilo, es
 * la primera de las cuatro capas con las que ADR-005 sostiene RN-03 —el tipo,
 * los permisos, el trigger y la RLS—. Aquí se cierra la primera: un `UPDATE`
 * sobre un evento **no se puede escribir** contra este agregado, así que el
 * defecto tendría que introducirse saltándose el dominio.
 *
 * Todo campo es `readonly` y las fechas se copian al construir: sin la copia,
 * quien pasó el `Date` conserva una referencia y puede mover el instante del
 * evento después de registrarlo, que es una alteración por la puerta de atrás.
 */
export class Acceso {
  private constructor(
    readonly id: string,
    readonly copropiedadId: string,
    readonly ocurridoEn: Date,
    readonly tipo: TipoDeEvento,
    readonly metodo: MetodoDeAcceso,
    readonly dispositivoId: string,
    readonly claveIdempotencia: string,
    readonly permitido: boolean,
    readonly motivo: MotivoAcceso | null,
    readonly reglaAplicada: string,
    readonly versionDeReglas: VersionDeReglas,
    readonly requiereConfirmacionHumana: boolean,
    readonly personaId: string | null,
    readonly viviendaId: string | null,
    readonly autorizacionId: string | null,
    readonly zonaId: string | null,
    readonly placaDetectada: string | null,
    readonly confianza: number | null,
    readonly evidenciaId: string | null,
    readonly operadorId: string | null,
    readonly motivoManual: string | null,
    readonly decididoPorEdge: boolean,
    readonly cachePotencialmenteObsoleto: boolean,
  ) {
    Object.freeze(this);
  }

  /**
   * Construye el evento **a partir de la decisión del motor**, no de campos
   * sueltos. Es lo que impide que el evento diga una cosa y la decisión otra:
   * el motivo, la regla y la versión se copian del `ResultadoAcceso` y no hay
   * parámetro con el que contradecirlos.
   */
  static desdeDecision(
    hecho: HechoDeAcceso,
    decision: ResultadoAcceso,
  ): Resultado<Acceso, ErrorDominio> {
    const invalido = validar(hecho, decision);
    if (invalido !== null) return fallo(invalido);

    return exito(
      new Acceso(
        hecho.id,
        hecho.copropiedadId,
        new Date(hecho.ocurridoEn.getTime()),
        hecho.tipo,
        hecho.metodo,
        hecho.dispositivoId,
        hecho.claveIdempotencia,
        decision.permitido,
        decision.permitido ? null : decision.motivo,
        decision.reglaAplicada,
        decision.versionDeReglas,
        decision.permitido && decision.requiereConfirmacionHumana === true,
        hecho.personaId ?? null,
        hecho.viviendaId ?? null,
        hecho.autorizacionId ?? null,
        hecho.zonaId ?? null,
        hecho.placaDetectada ?? null,
        hecho.confianza ?? null,
        hecho.evidenciaId ?? null,
        hecho.operadorId ?? null,
        hecho.motivoManual ?? null,
        hecho.decididoPorEdge ?? false,
        hecho.cachePotencialmenteObsoleto ?? false,
      ),
    );
  }

  /** `permitido` en el vocabulario del enumerado `resultado_acceso`. */
  get resultado(): 'permitido' | 'negado' {
    return this.permitido ? 'permitido' : 'negado';
  }
}

/**
 * Las invariantes, como función pura y separada del constructor: se leen de
 * corrido y se prueban una a una. Devuelve `null` cuando el hecho es válido.
 */
const validar = (hecho: HechoDeAcceso, decision: ResultadoAcceso): ErrorDominio | null => {
  if (hecho.copropiedadId.length === 0) {
    return errorDominio('DATO_INVALIDO', 'Todo evento pertenece a una copropiedad', 'RN-15');
  }

  // RN-15 · el sello de reglas tiene que ser de ESTA copropiedad. Un evento que
  // cita la versión de otra es un contexto mal armado, y sellarlo así haría
  // inauditables las dos.
  if (decision.versionDeReglas.copropiedadId !== hecho.copropiedadId) {
    return errorDominio(
      'INVARIANTE_VIOLADA',
      'La versión de reglas sellada es de otra copropiedad',
      'RN-15',
    );
  }

  if (Number.isNaN(hecho.ocurridoEn.getTime())) {
    return errorDominio('DATO_INVALIDO', 'El instante del evento no es una fecha válida');
  }

  const largo = hecho.claveIdempotencia.length;
  if (largo < CLAVE_MIN || largo > CLAVE_MAX) {
    return errorDominio(
      'DATO_INVALIDO',
      `La clave de idempotencia debe tener entre ${CLAVE_MIN} y ${CLAVE_MAX} caracteres`,
      'RN-17',
    );
  }

  // CA-16 / RN-08 · «sin motivo escrito el sistema no ejecuta la apertura».
  // El `trim` no es cosmético: un espacio en blanco satisface un `NOT NULL` y
  // dejaría la auditoría con un motivo vacío, que es lo mismo que sin motivo.
  if (hecho.tipo === 'manual') {
    const motivo = (hecho.motivoManual ?? '').trim();
    if (motivo.length === 0 || (hecho.operadorId ?? '').length === 0) {
      return errorDominio(
        'INVARIANTE_VIOLADA',
        'Una apertura o negación manual exige operador y motivo escrito',
        'CA-16',
      );
    }
  }

  const placa = hecho.placaDetectada ?? null;
  if (placa !== null && !PLACA_NORMALIZADA.test(placa)) {
    return errorDominio(
      'DATO_INVALIDO',
      'La placa del evento debe llegar ya normalizada por el objeto de valor `Placa`',
      'RN-04',
    );
  }

  const confianza = hecho.confianza ?? null;
  if (confianza !== null && (confianza < 0 || confianza > 1)) {
    return errorDominio('DATO_INVALIDO', 'La confianza es una fracción entre 0 y 1');
  }

  // Coherencia entre el tipo del evento y la decisión: un `denegado` que dice
  // «permitido» convertiría el histórico en ruido. Se comprueba aquí porque la
  // base solo puede exigir que un negado traiga motivo, no que ambos concuerden.
  if (hecho.tipo === 'denegado' && decision.permitido) {
    return errorDominio(
      'INVARIANTE_VIOLADA',
      'Un evento de tipo `denegado` no puede sellar una decisión permitida',
      'RN-02',
    );
  }
  if ((hecho.tipo === 'ingreso' || hecho.tipo === 'salida') && !decision.permitido) {
    return errorDominio(
      'INVARIANTE_VIOLADA',
      'Un ingreso o una salida no pueden sellar una decisión negada',
      'RN-02',
    );
  }

  return null;
};
