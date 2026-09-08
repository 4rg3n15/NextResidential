/**
 * Estado de un dispositivo según su latido — **P-06, resuelta el 2026-09-07**.
 *
 * El pendiente arrastraba el supuesto «3 latidos o 5 min». Se cierra con un
 * umbral **configurable por copropiedad** y un valor por defecto conservador,
 * por instrucción del usuario. Conservador significa aquí *avisar de más*: un
 * dispositivo que se marca caído sin estarlo cuesta una mirada del operador; uno
 * que sigue marcado como sano llevando media hora mudo cuesta una puerta sin
 * control y nadie enterado (CA-26, RN-12).
 *
 * Tres estados y no dos, alineados con el enumerado `estado_dispositivo` de la
 * migración 0002. `degradado` es el que hace útil el conjunto: distingue «se
 * saltó un latido» de «lleva cinco minutos sin dar señales», y solo el segundo
 * levanta alerta. Sin ese escalón, o se alerta por cada hipo de la red o se
 * espera tanto que la alerta llega cuando ya no sirve.
 */
export interface UmbralDeLatido {
  /** Cadencia con la que el equipo debe latir. */
  readonly periodoSegundos: number;
  /** Latidos perdidos que se toleran antes de degradar. */
  readonly latidosTolerados: number;
  /** Silencio total, en segundos, tras el cual el dispositivo se da por caído. */
  readonly silencioParaCaidoSegundos: number;
}

/**
 * Valor por defecto: latido cada 60 s, un latido perdido tolerado, caído a los
 * 300 s de silencio. Es el supuesto que el usuario aprobó como conservador y el
 * que aplica cuando una copropiedad no configura el suyo.
 */
export const UMBRAL_DE_LATIDO_POR_DEFECTO: UmbralDeLatido = {
  periodoSegundos: 60,
  latidosTolerados: 1,
  silencioParaCaidoSegundos: 300,
};

export type EstadoDeDispositivo = 'saludable' | 'degradado' | 'caido';

/**
 * Función pura con el reloj inyectado (§2.4). Un dispositivo que nunca latió
 * NO es saludable: se trata como caído, porque «sin noticias» y «todo bien» son
 * lo mismo solo para quien no quiere enterarse.
 */
export const estadoPorLatido = (
  ultimoLatido: Date | null,
  ahora: Date,
  umbral: UmbralDeLatido = UMBRAL_DE_LATIDO_POR_DEFECTO,
): EstadoDeDispositivo => {
  if (ultimoLatido === null) return 'caido';

  const silencioSegundos = (ahora.getTime() - ultimoLatido.getTime()) / 1000;
  if (silencioSegundos >= umbral.silencioParaCaidoSegundos) return 'caido';

  const tolerado = umbral.periodoSegundos * (umbral.latidosTolerados + 1);
  return silencioSegundos > tolerado ? 'degradado' : 'saludable';
};

/**
 * Valida un umbral configurado por una copropiedad. Existe porque un umbral
 * incoherente —caído antes que degradado— haría que el estado `degradado` no se
 * alcanzara nunca y la alerta llegara siempre tarde, sin ningún síntoma visible.
 */
export const umbralCoherente = (u: UmbralDeLatido): boolean =>
  u.periodoSegundos > 0 &&
  u.latidosTolerados >= 0 &&
  u.silencioParaCaidoSegundos > u.periodoSegundos * (u.latidosTolerados + 1);
