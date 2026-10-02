import type { MedioDeEspera, PoliticaDeReintentos } from './reintentos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · BLOQUE 0.2 · EL BOMBEO NO SE DETIENE PORQUE LA PLATAFORMA TROPIECE
 *
 * La escucha de un equipo entrega eventos y el proveedor los publica hacia la
 * plataforma. Hasta la 15-O, si `publicar` fallaba —la base cortada, el pool
 * agotado— el bucle SALÍA: la escucha seguía conectada al equipo y nadie
 * volvía a leerla. Un fallo momentáneo de la base dejaba al equipo mudo para
 * siempre, y eso es exactamente lo que el sitio no puede permitirse.
 *
 * Ahora cada evento se reintenta con espera creciente y DISPERSIÓN completa
 * (como `conReintentos`: dos equipos no reintentan en el mismo milisegundo) y,
 * si aun así no entra, se registra como perdido y el bombeo SIGUE con el
 * siguiente. No se reintenta sin fin: un evento que la plataforma rechaza
 * siempre —un defecto nuestro— no puede retener a todos los que vienen detrás.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const POLITICA_DE_PUBLICACION: PoliticaDeReintentos = {
  intentos: 5,
  esperaInicialMs: 200,
  esperaMaximaMs: 10_000,
};

export type DesenlaceDePublicacion = 'publicado' | 'perdido' | 'cancelado';

export const publicarConEspera = async (
  publicar: () => Promise<unknown>,
  cancelar: AbortSignal,
  medio: MedioDeEspera,
  alFallar: (intento: number, error: unknown) => void,
  politica: PoliticaDeReintentos = POLITICA_DE_PUBLICACION,
): Promise<DesenlaceDePublicacion> => {
  let espera = politica.esperaInicialMs;
  for (let intento = 1; intento <= politica.intentos; intento += 1) {
    if (cancelar.aborted) return 'cancelado';
    try {
      await publicar();
      return 'publicado';
    } catch (error) {
      alFallar(intento, error);
      if (intento === politica.intentos) break;
      await medio.esperar(Math.floor(medio.azar() * espera));
      espera = Math.min(espera * 2, politica.esperaMaximaMs);
    }
  }
  return cancelar.aborted ? 'cancelado' : 'perdido';
};
