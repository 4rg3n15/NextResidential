/**
 * 15-Y2 · compartir un texto corto —el código de una plaza, el de traspaso—
 * desde el navegador: la hoja de compartir del sistema cuando existe (Web
 * Share API, la de Safari en el iPhone), y si no, el portapapeles. Quien
 * llama pinta el aviso accesible («Copiado») según lo que pasó; aquí no hay
 * interfaz. Nunca lanza: devuelve qué pudo hacer.
 */
export type ResultadoDeCompartir = 'compartido' | 'copiado' | 'cancelado' | 'sin_medio';

export const compartirTexto = async (
  texto: string,
  titulo = 'Next Control Residencial',
): Promise<ResultadoDeCompartir> => {
  const n = globalThis.navigator as Navigator | undefined;
  if (n !== undefined && typeof n.share === 'function') {
    try {
      if (typeof n.canShare !== 'function' || n.canShare({ text: texto })) {
        await n.share({ title: titulo, text: texto });
        return 'compartido';
      }
    } catch (e: unknown) {
      // Cerrar la hoja sin elegir es `AbortError`: no es un fallo, y tampoco se copia a escondidas.
      if (e instanceof Error && e.name === 'AbortError') return 'cancelado';
    }
  }
  if (n?.clipboard !== undefined && typeof n.clipboard.writeText === 'function') {
    try {
      await n.clipboard.writeText(texto);
      return 'copiado';
    } catch {
      return 'sin_medio';
    }
  }
  return 'sin_medio';
};

/** El texto con que se comparte un código de plaza: qué es y para qué sirve, sin más datos. */
export const textoDeCodigoDePlaza = (codigo: string, vivienda: string): string =>
  `Código de invitación para crear su cuenta en Next Control Residencial (${vivienda}): ${codigo}. ` +
  'Entre a la consola, pulse «Crear cuenta» y escríbalo en «Código de invitación».';
