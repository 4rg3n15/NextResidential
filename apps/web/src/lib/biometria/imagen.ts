/**
 * DE LA FOTO AL ENVÍO: REDUCIR, RECORTAR Y ACOTAR.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE VIAJA ES LA IMAGEN, Y HAY QUE DECIR POR QUÉ
 *
 * El campo se llama `vector` y el DTO advierte «no es la fotografía». Con la
 * terminal de esta etapa **sí lo es**: el equipo construye la plantilla a
 * partir de un JPEG y no acepta un vector nuestro. Lo que el sistema guarda
 * sigue sin ser legible —entra cifrado a la bóveda y ninguna ruta lo devuelve—,
 * pero llamarlo «vector» y mandar una foto sin decirlo sería la peor de las dos
 * opciones. Queda escrito aquí, en la pantalla y en el informe.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * MINIMIZACIÓN, Y NO ES UNA FRASE
 *
 * Ley 1581 art. 4: se trata el dato mínimo necesario para la finalidad. La
 * finalidad es que una terminal reconozca un rostro, y para eso no hacen falta
 * doce megapíxeles. Se reduce al lado máximo declarado antes de salir del
 * navegador, así que **la foto original nunca se sube**.
 */

/** Lado mayor de lo que se envía. Suficiente para la terminal, y acotado. */
export const LADO_MAXIMO = 640;

/** Techo duro del envío, en bytes del JPEG. */
export const BYTES_MAXIMOS = 180 * 1024;

/** Calidades que se prueban, de mejor a peor, hasta caber en el techo. */
const CALIDADES = [0.82, 0.7, 0.6, 0.5] as const;

export interface ImagenPreparada {
  readonly base64: string;
  readonly bytes: number;
  readonly ancho: number;
  readonly alto: number;
  readonly calidad: number;
}

export class ImagenDemasiadoGrande extends Error {
  constructor(readonly bytes: number) {
    super(
      `Ni con la menor calidad cabe en ${String(BYTES_MAXIMOS)} bytes (quedaron ` +
        `${String(bytes)}). Recorte el encuadre al rostro y repita.`,
    );
    this.name = 'ImagenDemasiadoGrande';
  }
}

export const dimensionesReducidas = (
  ancho: number,
  alto: number,
  ladoMaximo: number = LADO_MAXIMO,
): { readonly ancho: number; readonly alto: number } => {
  const mayor = Math.max(ancho, alto);
  // Una imagen ya pequeña NO se agranda: interpolar no añade información y sí
  // añade bytes.
  if (mayor <= ladoMaximo || mayor === 0) return { ancho, alto };
  const factor = ladoMaximo / mayor;
  return { ancho: Math.round(ancho * factor), alto: Math.round(alto * factor) };
};

/** Cuenta los bytes reales que representa un base64, sin decodificarlo. */
export const bytesDeBase64 = (base64: string): number => {
  const relleno = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - relleno);
};

const aBase64 = (url: string): string => {
  const coma = url.indexOf(',');
  return coma === -1 ? '' : url.slice(coma + 1);
};

/**
 * Reduce al lado máximo y baja la calidad hasta caber. Si no cabe ni con la
 * peor, **lanza**: enviar una imagen que el servidor rechazará por tamaño deja
 * al operador con un error de validación que no explica qué hacer.
 */
export const prepararImagen = (
  lienzo: HTMLCanvasElement,
  bytesMaximos: number = BYTES_MAXIMOS,
): ImagenPreparada => {
  let ultimo = '';
  for (const calidad of CALIDADES) {
    const base64 = aBase64(lienzo.toDataURL('image/jpeg', calidad));
    const bytes = bytesDeBase64(base64);
    if (bytes <= bytesMaximos) {
      return { base64, bytes, ancho: lienzo.width, alto: lienzo.height, calidad };
    }
    ultimo = base64;
  }
  throw new ImagenDemasiadoGrande(bytesDeBase64(ultimo));
};
