/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A2 (ETAPA 15-L) · LA FOTO SE MIRA ANTES DE SUBIRLA
 *
 * La terminal construye su plantilla a partir de una imagen, y cuando la
 * imagen no le sirve contesta un `400` que no dice por qué. Es una de las
 * causas candidatas del `400` observado en sitio. Así que, antes de enviar:
 *
 *  · que SEA una imagen (JPEG o PNG, por sus primeros bytes: la guía declara
 *    `facePicFormat` jpg/png/bmp y los dos clientes envían JPEG);
 *  · que no pase del peso ni del lado mayor configurados.
 *
 * **Los límites no son del fabricante.** El extracto de la guía de la serie no
 * fija tamaño ni resolución (decisión 8 del usuario): son el valor prudente de
 * la práctica —≤ 200 KB, ≤ 1024 px— y se configuran en el `.env`
 * (`EQUIPOS_FOTO_KB_MAXIMOS`, `EQUIPOS_FOTO_LADO_MAXIMO`). El ensayo de sitio
 * lee las capacidades de la biblioteca del equipo real y las informa.
 *
 * **Aquí no se recomprime.** La foto ya sale reducida de la consola y de la
 * app (640 px, 180 KB, `lib/biometria/imagen.ts` y `camara_del_telefono.dart`).
 * El servidor no la vuelve a codificar —haría falta una biblioteca nativa de
 * imagen para un caso que los dos clientes ya cubren—: la COMPRUEBA, y si no
 * cabe lo dice con palabras, en vez de mandarla y recibir el `400` opaco.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface LimitesDeFoto {
  readonly bytesMaximos: number;
  readonly ladoMaximo: number;
}

export const LIMITES_DE_FOTO_POR_OMISION: LimitesDeFoto = {
  bytesMaximos: 200 * 1024,
  ladoMaximo: 1024,
};

export interface FotoInspeccionada {
  readonly formato: 'jpeg' | 'png' | null;
  readonly ancho: number | null;
  readonly alto: number | null;
}

/** Marcadores SOF de JPEG: C0–CF salvo C4 (Huffman), C8 (reservado) y CC (aritmética). */
const esInicioDeCuadro = (marcador: number): boolean =>
  marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);

/** Marcadores sin longitud: RST0–RST7, SOI, EOI y TEM. */
const sinLongitud = (marcador: number): boolean =>
  (marcador >= 0xd0 && marcador <= 0xd9) || marcador === 0x01;

const dimensionesJpeg = (b: Uint8Array): { ancho: number; alto: number } | null => {
  let i = 2;
  // Acotado por la longitud: cada vuelta avanza al menos dos bytes.
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marcador = b[i + 1] ?? 0;
    if (marcador === 0xff) {
      i += 1; // relleno
      continue;
    }
    if (sinLongitud(marcador)) {
      i += 2;
      continue;
    }
    const longitud = ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0);
    if (esInicioDeCuadro(marcador)) {
      if (i + 8 >= b.length) return null;
      const alto = ((b[i + 5] ?? 0) << 8) | (b[i + 6] ?? 0);
      const ancho = ((b[i + 7] ?? 0) << 8) | (b[i + 8] ?? 0);
      return { ancho, alto };
    }
    if (marcador === 0xda || longitud < 2) return null; // datos de imagen o cabecera rota
    i += 2 + longitud;
  }
  return null;
};

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const uint32 = (b: Uint8Array, i: number): number =>
  (((b[i] ?? 0) << 24) >>> 0) + ((b[i + 1] ?? 0) << 16) + ((b[i + 2] ?? 0) << 8) + (b[i + 3] ?? 0);

export const inspeccionarFoto = (b: Uint8Array): FotoInspeccionada => {
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    const d = dimensionesJpeg(b);
    return { formato: 'jpeg', ancho: d?.ancho ?? null, alto: d?.alto ?? null };
  }
  if (b.length >= 24 && FIRMA_PNG.every((v, i) => b[i] === v)) {
    return { formato: 'png', ancho: uint32(b, 16), alto: uint32(b, 20) };
  }
  return { formato: null, ancho: null, alto: null };
};

export class FotoNoAdmitida extends Error {
  constructor(
    /** Lo que lee el operador: qué pasa con la foto y qué hacer. */
    readonly legible: string,
  ) {
    super(`La foto no se envía al equipo: ${legible}`);
    this.name = 'FotoNoAdmitida';
  }
}

/** Lanza `FotoNoAdmitida` si la foto no es una imagen o no cabe en los límites. */
export const exigirFotoAdmisible = (
  foto: Uint8Array,
  limites: LimitesDeFoto = LIMITES_DE_FOTO_POR_OMISION,
): FotoInspeccionada => {
  const inspeccion = inspeccionarFoto(foto);
  if (inspeccion.formato === null) {
    throw new FotoNoAdmitida('no es una imagen JPEG ni PNG; vuelva a tomar la foto');
  }
  if (foto.byteLength > limites.bytesMaximos) {
    throw new FotoNoAdmitida(
      `pesa ${String(Math.ceil(foto.byteLength / 1024))} KB y el máximo es ` +
        `${String(Math.floor(limites.bytesMaximos / 1024))} KB; vuelva a tomarla`,
    );
  }
  if (inspeccion.ancho === null || inspeccion.alto === null) {
    throw new FotoNoAdmitida('no se le pueden leer las medidas; vuelva a tomarla');
  }
  const mayor = Math.max(inspeccion.ancho, inspeccion.alto);
  if (mayor > limites.ladoMaximo) {
    throw new FotoNoAdmitida(
      `mide ${String(inspeccion.ancho)}×${String(inspeccion.alto)} px y el lado mayor admitido ` +
        `es ${String(limites.ladoMaximo)} px; vuelva a tomarla`,
    );
  }
  return inspeccion;
};
