import type { CajaDeRostro, MedidasDeCaptura } from './medidas';
import { iluminacionDe, nitidezDe, proporcionDeRostro } from './medidas';

/**
 * DETECTAR EL ROSTRO, O ADMITIR QUE NO SE PUEDE.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA DECISIÓN QUE IMPORTA: NO SE INVENTA UN ROSTRO
 *
 * El navegador **puede** no saber detectar caras: `FaceDetector` no está en
 * todos, y en los que está puede exigir permiso o fallar. La tentación es
 * enviar `rostrosDetectados: 1` y seguir, y eso sería falsificar una medida de
 * calidad que CA-08 exige — la clase de falso verde que este proyecto persigue,
 * con el agravante de que aquí produce una plantilla inservible en una terminal
 * a la que después se culpa.
 *
 * Lo que se hace en su lugar: se devuelve `detectorDisponible: false`, la
 * pantalla lo dice con esas palabras, y **quien opera confirma el encuadre**.
 * La medida sigue existiendo y sigue siendo cierta; lo que cambia es de dónde
 * viene, y eso queda anotado en el propio envío. Un operador que mira a la
 * persona es mejor medidor que un cero inventado.
 *
 * Nitidez e iluminación se miden SIEMPRE: no dependen de detectar nada.
 */

interface RostroDetectado {
  readonly boundingBox: { readonly width: number; readonly height: number };
}

interface DetectorDeRostros {
  detect(fuente: CanvasImageSource): Promise<readonly RostroDetectado[]>;
}

type ConstructorDeDetector = new (opciones?: { maxDetectedFaces?: number }) => DetectorDeRostros;

/** `null` cuando el navegador no lo trae. No se sustituye por nada. */
export const detectorDelNavegador = (): DetectorDeRostros | null => {
  const global = globalThis as unknown as { FaceDetector?: ConstructorDeDetector };
  if (typeof global.FaceDetector !== 'function') return null;
  try {
    return new global.FaceDetector({ maxDetectedFaces: 5 });
  } catch {
    // Existe pero no se puede construir: cuenta como no disponible.
    return null;
  }
};

export interface LecturaDeCaptura {
  readonly medidas: MedidasDeCaptura;
  /**
   * `false` significa que `rostrosDetectados` y `proporcionRostro` **no salen
   * de una medición**, y quien los use tiene que saberlo.
   */
  readonly detectorDisponible: boolean;
}

/**
 * Mide lo que se puede medir.
 *
 * `cajaDeclarada` es la que aporta quien opera cuando no hay detector. Si no
 * hay detector y tampoco caja declarada, `rostrosDetectados` queda en **0** —la
 * dirección segura— y la pantalla lo traduce a «no se pudo comprobar», que es
 * lo que evita que la captura salga.
 */
export const medirCaptura = async (
  fuente: CanvasImageSource,
  pixeles: Uint8ClampedArray,
  ancho: number,
  alto: number,
  cajaDeclarada?: CajaDeRostro,
): Promise<LecturaDeCaptura> => {
  const nitidez = nitidezDe(pixeles, ancho, alto);
  const iluminacion = iluminacionDe(pixeles);
  const detector = detectorDelNavegador();

  if (detector !== null) {
    try {
      const rostros = await detector.detect(fuente);
      const mayor = rostros
        .map((r) => ({ ancho: r.boundingBox.width, alto: r.boundingBox.height }))
        .sort((a, b) => Math.max(b.ancho, b.alto) - Math.max(a.ancho, a.alto))[0];
      return {
        detectorDisponible: true,
        medidas: {
          nitidez,
          iluminacion,
          rostrosDetectados: rostros.length,
          proporcionRostro: mayor === undefined ? 0 : proporcionDeRostro(mayor, ancho, alto),
        },
      };
    } catch {
      // Falló al detectar: NO se degrada a «hay un rostro». Se degrada a «no
      // se pudo comprobar», que es lo contrario.
    }
  }

  return {
    detectorDisponible: false,
    medidas: {
      nitidez,
      iluminacion,
      rostrosDetectados: cajaDeclarada === undefined ? 0 : 1,
      proporcionRostro:
        cajaDeclarada === undefined ? 0 : proporcionDeRostro(cajaDeclarada, ancho, alto),
    },
  };
};
