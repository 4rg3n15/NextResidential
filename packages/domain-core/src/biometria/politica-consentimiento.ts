import type { ConsentimientoBiometrico } from './consentimiento';
import type { PlantillaBiometrica } from './plantilla';

/**
 * `PolíticaConsentimiento` — una de las tres políticas que §2.2 declara
 * vinculantes (RN-09, RN-10).
 *
 * Reúne en funciones puras las preguntas que el resto del sistema le hace al
 * consentimiento, para que ningún adaptador las conteste con un `if` suelto. Es
 * el mismo papel que `PolíticaListaNegra` cumple en el motor de reglas: la
 * regla se escribe una vez y se compone, no se reescribe en cada llamador.
 *
 * **Ninguna de estas funciones ES la garantía.** La garantía está en la base
 * —la clave ajena, los dos disparadores y la cota como CHECK (migraciones 0008,
 * 0013, 0016 y 0022)—, porque la llave secreta omite la RLS y porque el Edge
 * escribe por su cuenta. Esto es lo que permite decidir sin ir a la base, y
 * fallar con un motivo tipado en vez de con una violación de CHECK.
 */
export type MotivoBloqueoBiometrico =
  | 'SIN_CONSENTIMIENTO'
  | 'CONSENTIMIENTO_DE_OTRO_TITULAR'
  | 'PLANTILLA_SUPRIMIDA'
  | 'PLAZO_VENCIDO';

export type VeredictoBiometrico =
  | { readonly permitido: true }
  | { readonly permitido: false; readonly motivo: MotivoBloqueoBiometrico };

const permitido: VeredictoBiometrico = Object.freeze({ permitido: true });
const negado = (motivo: MotivoBloqueoBiometrico): VeredictoBiometrico =>
  Object.freeze({ permitido: false, motivo });

/**
 * ¿Se puede propagar esta plantilla a una terminal?
 *
 * El orden importa y no es arbitrario: primero la titularidad, después la
 * vigencia. Un consentimiento de otra persona no es «un consentimiento que no
 * está vigente»; es un consentimiento que no cuenta, y decir lo segundo
 * describiría mal el hecho en el evento de auditoría.
 */
export const puedeSincronizar = (
  plantilla: PlantillaBiometrica,
  consentimiento: ConsentimientoBiometrico | null,
  ahora: Date,
): VeredictoBiometrico => {
  if (consentimiento === null) return negado('SIN_CONSENTIMIENTO');
  if (
    consentimiento.id !== plantilla.consentimientoId ||
    consentimiento.titularId !== plantilla.titularId
  ) {
    return negado('CONSENTIMIENTO_DE_OTRO_TITULAR');
  }
  if (plantilla.suprimida) return negado('PLANTILLA_SUPRIMIDA');
  if (!consentimiento.vigente) return negado('SIN_CONSENTIMIENTO');
  if (plantilla.venceEn(ahora)) return negado('PLAZO_VENCIDO');
  return permitido;
};

/**
 * ¿Se puede reconocer a esta persona por su rostro en este instante?
 *
 * Misma pregunta que la anterior salvo en un punto: aquí la plantilla debe
 * estar `activa`, es decir, ya en la terminal. Se separa porque sincronizar y
 * reconocer ocurren en momentos distintos y el consentimiento puede haberse
 * revocado entre ambos.
 */
export const puedeReconocer = (
  plantilla: PlantillaBiometrica,
  consentimiento: ConsentimientoBiometrico | null,
  ahora: Date,
): VeredictoBiometrico => {
  const base = puedeSincronizar(plantilla, consentimiento, ahora);
  if (!base.permitido) return base;
  return plantilla.estado === 'activa' ? permitido : negado('SIN_CONSENTIMIENTO');
};

/**
 * Plantillas que el barrido debe suprimir ya. Función pura y con reloj
 * inyectado: la prueba fija el instante y no espera a que pase el tiempo.
 */
export const plantillasPorSuprimir = (
  plantillas: readonly PlantillaBiometrica[],
  ahora: Date,
): readonly PlantillaBiometrica[] => plantillas.filter((p) => !p.suprimida && p.venceEn(ahora));

/** Plantillas suprimidas que siguen en alguna terminal: la cola de CA-10. */
export const plantillasPorRetirar = (
  plantillas: readonly PlantillaBiometrica[],
): readonly PlantillaBiometrica[] => plantillas.filter((p) => p.exigeRetirada);
