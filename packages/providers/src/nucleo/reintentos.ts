import { ErrorDeEquipo } from './errores';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A5 (ETAPA 15-L) · REINTENTAR LO QUE SE PUEDE REINTENTAR, Y NADA MÁS
 *
 * En la red de sitio un equipo ocupado o un nonce que vence entre dos órdenes
 * son cosas de todos los días; los dos son `reintentable` en su clase neutral
 * (`EquipoOcupado`, `DesafioVencido`). Todo lo demás NO se reintenta aquí:
 *
 *  · `CredencialRechazada` — cada intento es un inicio de sesión fallido y el
 *    equipo bloquea la dirección de origen;
 *  · `EquipoInalcanzable` — una orden que agotó su plazo puede haberse
 *    ejecutado: repetirla abriría dos veces;
 *  · un rechazo de contenido (`PeticionRechazada`, `OrdenSinConfirmar`) — el
 *    defecto es nuestro y repetirlo da lo mismo.
 *
 * La espera crece al doble y lleva DISPERSIÓN completa (0 a la espera): dos
 * consolas que reintentan contra el mismo equipo no chocan cada vez en el
 * mismo milisegundo. Y el total cabe en el presupuesto de KPI-13 (3 s): tres
 * intentos esperan, como mucho, 200 + 400 ms.
 */
export interface PoliticaDeReintentos {
  /** Intentos en total. 1 = sin reintento. */
  readonly intentos: number;
  readonly esperaInicialMs: number;
  readonly esperaMaximaMs: number;
}

export const POLITICA_DE_ORDENES: PoliticaDeReintentos = {
  intentos: 3,
  esperaInicialMs: 200,
  esperaMaximaMs: 1000,
};

export interface MedioDeEspera {
  readonly esperar: (ms: number) => Promise<void>;
  readonly azar: () => number;
}

export const MEDIO_DE_ESPERA_REAL: MedioDeEspera = {
  esperar: (ms) => new Promise((listo) => setTimeout(listo, ms)),
  azar: Math.random,
};

export const esReintentable = (error: unknown): boolean =>
  error instanceof ErrorDeEquipo &&
  (error as ErrorDeEquipo & { readonly reintentable?: boolean }).reintentable === true;

export const conReintentos = async <T>(
  orden: () => Promise<T>,
  politica: PoliticaDeReintentos = POLITICA_DE_ORDENES,
  medio: MedioDeEspera = MEDIO_DE_ESPERA_REAL,
): Promise<T> => {
  let espera = politica.esperaInicialMs;
  for (let intento = 1; ; intento += 1) {
    try {
      return await orden();
    } catch (error) {
      if (!esReintentable(error) || intento >= politica.intentos) throw error;
      await medio.esperar(Math.floor(medio.azar() * espera));
      espera = Math.min(espera * 2, politica.esperaMaximaMs);
    }
  }
};
