/**
 * MEDIR LA CALIDAD DE UNA CAPTURA EN EL NAVEGADOR · CA-08, HU-13, KPI-16.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ AQUÍ TAMBIÉN, SI EL SERVIDOR YA VALIDA
 *
 * Porque quien opera está **delante de la persona** y puede repetir la foto en
 * ese momento. Una validación que sólo ocurre en el servidor llega cuando el
 * visitante ya se fue, y entonces la autorización queda sin plantilla y nadie
 * se entera hasta que no puede entrar. El servidor valida igual (KPI-16) y debe:
 * esto se salta con un cliente modificado. Lo de aquí es para la persona; lo de
 * allí, para el sistema.
 *
 * Es el mismo reparto que ya hace la app del residente
 * (`apps/mobile/lib/dominio/calidad_de_captura.dart`), y los umbrales son los
 * mismos a propósito: dos superficies que juzgan la misma foto con criterios
 * distintos producen un «sirve aquí y no allí» que nadie sabe explicar.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ESTAS FUNCIONES SON PURAS, Y ESA ES LA CONDICIÓN
 *
 * Toman píxeles y devuelven números. No tocan el DOM, no abren la cámara y no
 * conocen React, así que cada rama se prueba sin navegador y sin fotografía —el
 * mismo motivo por el que el motor de reglas recibe el contexto en vez de
 * consultarlo—.
 */

/** Lo medido. Todo en 0..1 salvo el conteo de rostros. */
export interface MedidasDeCaptura {
  readonly rostrosDetectados: number;
  readonly nitidez: number;
  readonly iluminacion: number;
  readonly proporcionRostro: number;
}

/** Los mismos umbrales que la app del residente. Un solo sitio, con nombre. */
export const UMBRALES = {
  nitidezMinima: 0.45,
  iluminacionMinima: 0.25,
  iluminacionMaxima: 0.85,
  proporcionMinima: 0.15,
  proporcionMaxima: 0.75,
} as const;

export type FalloDeCalidad =
  | 'BORROSA'
  | 'OSCURA'
  | 'QUEMADA'
  | 'SIN_ROSTRO'
  | 'VARIOS_ROSTROS'
  | 'DEMASIADO_LEJOS'
  | 'DEMASIADO_CERCA';

/** En imperativo y sin jerga: «acérquese» se obedece; «proporción insuficiente», no. */
export const CONSEJOS: Record<FalloDeCalidad, string> = {
  BORROSA: 'La foto salió movida. Sujete la cámara quieta y repita.',
  OSCURA: 'Hay poca luz. Busque un sitio más iluminado.',
  QUEMADA: 'Hay demasiada luz de frente. Evite el sol o la lámpara detrás de la persona.',
  SIN_ROSTRO: 'No se ve ningún rostro. Encuadre a la persona de frente.',
  VARIOS_ROSTROS: 'Hay más de una persona en el encuadre. Debe salir sólo el titular.',
  DEMASIADO_LEJOS: 'La persona está lejos. Acérquese.',
  DEMASIADO_CERCA: 'La persona está demasiado cerca. Sepárese un poco.',
};

/** Juzga; no mide. Devuelve TODOS los motivos, no el primero. */
export const fallosDeCalidad = (m: MedidasDeCaptura): readonly FalloDeCalidad[] => {
  const fallos: FalloDeCalidad[] = [];
  if (m.rostrosDetectados === 0) fallos.push('SIN_ROSTRO');
  else if (m.rostrosDetectados > 1) fallos.push('VARIOS_ROSTROS');
  if (m.nitidez < UMBRALES.nitidezMinima) fallos.push('BORROSA');
  if (m.iluminacion < UMBRALES.iluminacionMinima) fallos.push('OSCURA');
  if (m.iluminacion > UMBRALES.iluminacionMaxima) fallos.push('QUEMADA');
  if (m.proporcionRostro < UMBRALES.proporcionMinima) fallos.push('DEMASIADO_LEJOS');
  if (m.proporcionRostro > UMBRALES.proporcionMaxima) fallos.push('DEMASIADO_CERCA');
  return fallos;
};

/** Luminancia perceptual, 0..1. Rec. 601, que es la que usa el vídeo. */
const luminancia = (r: number, g: number, b: number): number =>
  (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/**
 * Iluminación = luminancia MEDIA. 0 negra · 0,5 bien expuesta · 1 quemada.
 *
 * Se muestrea uno de cada cuatro píxeles: el resultado no cambia de forma
 * apreciable y una foto de 4000×3000 deja de tardar lo que se nota.
 */
export const iluminacionDe = (pixeles: Uint8ClampedArray): number => {
  if (pixeles.length < 4) return 0;
  let suma = 0;
  let cuenta = 0;
  for (let i = 0; i < pixeles.length; i += 16) {
    suma += luminancia(pixeles[i] ?? 0, pixeles[i + 1] ?? 0, pixeles[i + 2] ?? 0);
    cuenta += 1;
  }
  return cuenta === 0 ? 0 : suma / cuenta;
};

/**
 * Nitidez = varianza del laplaciano, normalizada.
 *
 * Es la medida estándar de enfoque: una foto movida tiene bordes suaves y por
 * tanto poca varianza en la segunda derivada. `REFERENCIA_DE_VARIANZA` es la
 * varianza a partir de la cual se considera nítida del todo; por encima se
 * satura en 1, que es lo que permite comparar con un umbral en 0..1.
 */
export const REFERENCIA_DE_VARIANZA = 600;

export const nitidezDe = (pixeles: Uint8ClampedArray, ancho: number, alto: number): number => {
  if (ancho < 3 || alto < 3) return 0;
  const gris = new Float32Array(ancho * alto);
  for (let i = 0, p = 0; p < gris.length; i += 4, p += 1) {
    gris[p] = luminancia(pixeles[i] ?? 0, pixeles[i + 1] ?? 0, pixeles[i + 2] ?? 0) * 255;
  }

  let suma = 0;
  let sumaCuadrados = 0;
  let cuenta = 0;
  for (let y = 1; y < alto - 1; y += 1) {
    for (let x = 1; x < ancho - 1; x += 1) {
      const c = y * ancho + x;
      const valor =
        4 * (gris[c] ?? 0) -
        (gris[c - 1] ?? 0) -
        (gris[c + 1] ?? 0) -
        (gris[c - ancho] ?? 0) -
        (gris[c + ancho] ?? 0);
      suma += valor;
      sumaCuadrados += valor * valor;
      cuenta += 1;
    }
  }
  if (cuenta === 0) return 0;
  const media = suma / cuenta;
  const varianza = sumaCuadrados / cuenta - media * media;
  return Math.min(1, Math.max(0, varianza / REFERENCIA_DE_VARIANZA));
};

export interface CajaDeRostro {
  readonly ancho: number;
  readonly alto: number;
}

/**
 * Cuánto del encuadre ocupa el rostro.
 *
 * Se compara el **lado mayor** del rostro con el lado menor del encuadre, y no
 * áreas: el área castiga los rostros estrechos de una foto apaisada y haría que
 * un encuadre correcto en horizontal saliera «demasiado lejos».
 */
export const proporcionDeRostro = (
  caja: CajaDeRostro,
  anchoDeImagen: number,
  altoDeImagen: number,
): number => {
  const menorDelEncuadre = Math.min(anchoDeImagen, altoDeImagen);
  if (menorDelEncuadre <= 0) return 0;
  return Math.min(1, Math.max(caja.ancho, caja.alto) / menorDelEncuadre);
};
