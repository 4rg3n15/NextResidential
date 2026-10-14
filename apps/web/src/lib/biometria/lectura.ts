import { medirCaptura } from './deteccion';
import { dimensionesReducidas, prepararImagen } from './imagen';
import type { MedidasDeCaptura } from './medidas';

/** Lo que sale de leer una captura: medidas, si hubo detector, y el JPEG reducido. Sólo en memoria. */
export interface CapturaLeida {
  readonly medidas: MedidasDeCaptura;
  readonly detectorDisponible: boolean;
  readonly base64: string;
}

/**
 * 15-Y3 · leer una captura —un fichero o el fotograma de un `<video>`— EN EL
 * NAVEGADOR: se reduce, se mide (nitidez, iluminación, rostros si el navegador
 * sabe) y se prepara el JPEG que viaja. La imagen original no sale de aquí y
 * nada se guarda: lo que se devuelve vive en la memoria de quien lo pidió.
 */
export const leerCaptura = async (fuente: ImageBitmapSource): Promise<CapturaLeida> => {
  const mapa = await createImageBitmap(fuente);
  try {
    const { ancho, alto } = dimensionesReducidas(mapa.width, mapa.height);
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const pincel = lienzo.getContext('2d');
    if (pincel === null) throw new Error('El navegador no permitió preparar la imagen');
    pincel.drawImage(mapa, 0, 0, ancho, alto);
    const { data } = pincel.getImageData(0, 0, ancho, alto);
    const lectura = await medirCaptura(mapa, data, ancho, alto);
    const imagen = prepararImagen(lienzo);
    return {
      medidas: lectura.medidas,
      detectorDisponible: lectura.detectorDisponible,
      base64: imagen.base64,
    };
  } finally {
    mapa.close();
  }
};
