import type { ContextoDeAcceso } from './contexto';
import type { ResultadoAcceso } from './resultado-acceso';
import { negar, permitir } from './resultado-acceso';

/**
 * Una política es una **función pura** `(contexto) => ResultadoAcceso | null`.
 *
 * `null` significa «no me pronuncio»: esta política no tiene nada que decir
 * sobre este acceso. Distinguirlo de «permito» es lo que hace componible el
 * motor — si una política que no aplica devolviera «permitido», bastaría una
 * sola indiferente para abrir la puerta saltándose a las demás.
 *
 * Son lambdas y no clases porque no tienen estado: nada que inyectar, nada que
 * construir, y se prueban llamándolas.
 */
export type Politica = (contexto: ContextoDeAcceso) => ResultadoAcceso | null;

/**
 * RN-06 · Precedencia ABSOLUTA. Se evalúa primero y por eso un visitante en
 * lista negra **con autorización vigente** produce `LISTA_NEGRA` y no
 * `VIGENCIA_EXPIRADA` (CA-13). El orden no es una optimización: es el motivo
 * de denegación que queda registrado, y de él depende que el informe diga la
 * verdad sobre por qué no entró.
 *
 * Alcanza a los acompañantes por identidad propia (D-01): sin eso, un vetado
 * entraría acompañando a otro y la lista tendría una fuga.
 */
export const politicaListaNegra: Politica = (c) => {
  const vetadaPorIdentidad = c.personaId !== null && c.personasEnListaNegra.has(c.personaId);
  const vetadaPorPlaca = c.placaLeida !== null && c.placasEnListaNegra.has(c.placaLeida);
  const acompananteVetado = c.autorizaciones.some((a) =>
    a.acompanantes.some((ac) => c.personasEnListaNegra.has(ac.personaId)),
  );
  return vetadaPorIdentidad || vetadaPorPlaca || acompananteVetado
    ? negar('LISTA_NEGRA', c.versionDeReglas, 'politica.listaNegra')
    : null;
};

/**
 * RN-21 / CU-01 excepción 3a · Una lectura por debajo del umbral **no se
 * decide automáticamente**. No se niega —negar un vehículo legítimo por una
 * placa sucia es un falso rechazo— sino que se marca para confirmación humana.
 * Solo aplica a métodos que dependen de una lectura.
 */
export const politicaConfianza: Politica = (c) => {
  if (!dependeDeUnaLectura(c)) return null;
  if (c.confianza >= c.umbralDeConfianza) return null;
  // Por debajo de la mitad del umbral la lectura no es dudosa: es inservible.
  return c.confianza < c.umbralDeConfianza / 2
    ? negar('CONFIANZA_INSUFICIENTE', c.versionDeReglas, 'politica.confianza')
    : null;
};

/** Métodos cuya decisión depende de una lectura y no de una identificación cierta. */
export const dependeDeUnaLectura = (c: ContextoDeAcceso): boolean =>
  c.metodo === 'placa' || c.metodo === 'facial';

/**
 * CU-01, excepción 3a · La franja entre la mitad del umbral y el umbral: la
 * lectura sirve para identificar, pero no lo bastante para decidirla sola. No
 * es un motivo de denegación —por eso no es una `Politica`— sino una marca que
 * el motor adjunta a la concesión para que un humano la confirme.
 */
export const lecturaDudosa = (c: ContextoDeAcceso): boolean =>
  dependeDeUnaLectura(c) && c.confianza < c.umbralDeConfianza;

/** RN-09, RN-10 · Sin consentimiento vigente no hay reconocimiento facial. */
export const politicaConsentimiento: Politica = (c) =>
  c.metodo === 'facial' && !c.consentimientoVigente
    ? negar('SIN_CONSENTIMIENTO', c.versionDeReglas, 'politica.consentimiento')
    : null;

/** La placa leída no corresponde a ningún vehículo registrado. */
export const politicaPlacaConocida: Politica = (c) =>
  c.metodo === 'placa' && c.placaLeida !== null && !c.placaConocida
    ? negar('PLACA_DESCONOCIDA', c.versionDeReglas, 'politica.placaConocida')
    : null;

/** RN-01 · Ninguna autorización vigente en este instante. */
export const politicaVigencia: Politica = (c) =>
  c.autorizaciones.some((a) => a.estaVigenteEn(c.ahora))
    ? null
    : negar('VIGENCIA_EXPIRADA', c.versionDeReglas, 'politica.vigencia');

/**
 * RN-22 · Hay vigencia pero ninguna autorización vigente aplica AHORA según su
 * patrón. Se evalúa después de la vigencia porque su motivo solo tiene sentido
 * cuando ya sabemos que la autorización existe y no ha expirado (CA-06).
 */
export const politicaRecurrencia: Politica = (c) => {
  const vigentes = c.autorizaciones.filter((a) => a.estaVigenteEn(c.ahora));
  if (vigentes.length === 0) return null; // lo resuelve `politicaVigencia`
  return vigentes.some((a) => a.aplicaElPatronEn(c.ahora))
    ? null
    : negar('FUERA_DE_PATRON', c.versionDeReglas, 'politica.recurrencia');
};

/**
 * RN-13 · Una vivienda inactiva no genera autorizaciones nuevas, **pero
 * conserva las vigentes**. Por eso esta política no niega por vivienda
 * inactiva: la baja se aplica al crear, no al entrar. Existe para el caso en
 * que no hay vivienda destino identificable.
 */
export const politicaVivienda: Politica = (c) =>
  c.viviendaId === null && c.metodo !== 'manual'
    ? negar('FALLO_TECNICO', c.versionDeReglas, 'politica.vivienda')
    : null;

/**
 * RN-14 · Zona. Tres motivos distintos que el documento separa a propósito, y
 * colapsarlos haría indistinguibles tres criterios: permiso sobre la zona,
 * horario de la zona y aforo.
 */
export const politicaZona: Politica = (c) => {
  const zona = c.zona;
  if (zona === null) return null;

  if (zona.restringida) {
    const vigentes = c.autorizaciones.filter((a) => a.estaVigenteEn(c.ahora));
    if (!vigentes.some((a) => a.alcanzaZona(zona.id))) {
      return negar('ZONA_NO_AUTORIZADA', c.versionDeReglas, 'politica.zona.permiso');
    }
  }
  if (!zona.dentroDeHorario) {
    return negar('FUERA_DE_HORARIO', c.versionDeReglas, 'politica.zona.horario');
  }
  if (zona.aforoCompleto) {
    return negar('AFORO_SUPERADO', c.versionDeReglas, 'politica.zona.aforo');
  }
  return null;
};

/** Combinadores. Componer políticas es escribir lambdas, no heredar clases. */
export const noPronunciarse: Politica = () => null;

export const primeraQueNiega =
  (...politicas: readonly Politica[]): Politica =>
  (c) => {
    for (const politica of politicas) {
      const resultado = politica(c);
      if (resultado !== null && !resultado.permitido) return resultado;
    }
    return null;
  };

export const permitirSi =
  (predicado: (c: ContextoDeAcceso) => boolean, regla: string): Politica =>
  (c) =>
    predicado(c) ? permitir(c.versionDeReglas, regla) : null;
