import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONSEJOS,
  REFERENCIA_DE_VARIANZA,
  UMBRALES,
  fallosDeCalidad,
  iluminacionDe,
  nitidezDe,
  proporcionDeRostro,
} from './medidas';

/** Lienzo RGBA liso. */
const liso = (ancho: number, alto: number, valor: number): Uint8ClampedArray => {
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  for (let i = 0; i < datos.length; i += 4) {
    datos[i] = valor;
    datos[i + 1] = valor;
    datos[i + 2] = valor;
    datos[i + 3] = 255;
  }
  return datos;
};

/** Tablero de ajedrez: bordes duros en todas partes, el caso más nítido. */
const ajedrez = (ancho: number, alto: number): Uint8ClampedArray => {
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      const v = (x + y) % 2 === 0 ? 0 : 255;
      const i = (y * ancho + x) * 4;
      datos[i] = v;
      datos[i + 1] = v;
      datos[i + 2] = v;
      datos[i + 3] = 255;
    }
  }
  return datos;
};

describe('iluminacionDe', () => {
  it('una imagen negra da 0 y una blanca da 1', () => {
    expect(iluminacionDe(liso(8, 8, 0))).toBeCloseTo(0, 5);
    expect(iluminacionDe(liso(8, 8, 255))).toBeCloseTo(1, 5);
  });

  it('un gris medio cae cerca de 0,5, que es «bien expuesta»', () => {
    expect(iluminacionDe(liso(8, 8, 128))).toBeGreaterThan(0.45);
    expect(iluminacionDe(liso(8, 8, 128))).toBeLessThan(0.55);
  });

  it('con datos vacíos devuelve 0 en vez de romper', () => {
    expect(iluminacionDe(new Uint8ClampedArray(0))).toBe(0);
  });
});

describe('nitidezDe', () => {
  it('una superficie lisa es lo menos nítido posible', () => {
    // Sin bordes no hay segunda derivada: una pared gris da 0.
    expect(nitidezDe(liso(16, 16, 128), 16, 16)).toBeCloseTo(0, 4);
  });

  it('un tablero de ajedrez satura en 1', () => {
    expect(nitidezDe(ajedrez(16, 16), 16, 16)).toBe(1);
  });

  it('se satura, no crece sin límite: la medida vive en 0..1', () => {
    // Es lo que permite compararla con un umbral en 0..1 sin que la escala
    // dependa del tamaño de la foto.
    expect(REFERENCIA_DE_VARIANZA).toBeGreaterThan(0);
    expect(nitidezDe(ajedrez(32, 32), 32, 32)).toBeLessThanOrEqual(1);
  });

  it('una imagen minúscula devuelve 0 sin salirse del búfer', () => {
    expect(nitidezDe(liso(2, 2, 100), 2, 2)).toBe(0);
    expect(nitidezDe(new Uint8ClampedArray(4), 1, 1)).toBe(0);
  });
});

describe('proporcionDeRostro', () => {
  it('compara con el lado MENOR del encuadre, no con el área', () => {
    // Con áreas, un rostro correcto en una foto apaisada saldría «lejos».
    const apaisada = proporcionDeRostro({ ancho: 200, alto: 300 }, 1600, 900);
    expect(apaisada).toBeCloseTo(300 / 900, 5);
  });

  it('un rostro que llena el encuadre no pasa de 1', () => {
    expect(proporcionDeRostro({ ancho: 5000, alto: 5000 }, 640, 480)).toBe(1);
  });

  it('un encuadre de tamaño cero da 0 en vez de dividir por cero', () => {
    expect(proporcionDeRostro({ ancho: 10, alto: 10 }, 0, 0)).toBe(0);
  });
});

describe('fallosDeCalidad', () => {
  const buena = {
    rostrosDetectados: 1,
    nitidez: 0.8,
    iluminacion: 0.5,
    proporcionRostro: 0.4,
  };

  it('una captura correcta no tiene ningún fallo', () => {
    expect(fallosDeCalidad(buena)).toEqual([]);
  });

  it('devuelve TODOS los motivos, no sólo el primero', () => {
    // Enseñar uno, corregirlo y que aparezca el siguiente es cómo se pierde a
    // un visitante en la puerta.
    const fallos = fallosDeCalidad({
      rostrosDetectados: 2,
      nitidez: 0.1,
      iluminacion: 0.95,
      proporcionRostro: 0.9,
    });
    expect(fallos).toContain('VARIOS_ROSTROS');
    expect(fallos).toContain('BORROSA');
    expect(fallos).toContain('QUEMADA');
    expect(fallos).toContain('DEMASIADO_CERCA');
  });

  it('sin rostro es SIN_ROSTRO, que es lo que produce un detector ausente', () => {
    expect(fallosDeCalidad({ ...buena, rostrosDetectados: 0 })).toEqual(['SIN_ROSTRO']);
  });

  it('los bordes de cada umbral caen del lado que dice el umbral', () => {
    expect(fallosDeCalidad({ ...buena, nitidez: UMBRALES.nitidezMinima })).toEqual([]);
    expect(fallosDeCalidad({ ...buena, iluminacion: UMBRALES.iluminacionMinima })).toEqual([]);
    expect(fallosDeCalidad({ ...buena, iluminacion: UMBRALES.iluminacionMaxima })).toEqual([]);
    expect(fallosDeCalidad({ ...buena, proporcionRostro: UMBRALES.proporcionMinima })).toEqual([]);
    expect(fallosDeCalidad({ ...buena, proporcionRostro: UMBRALES.proporcionMaxima })).toEqual([]);
  });

  it('todo fallo tiene un consejo en imperativo y sin jerga', () => {
    for (const [fallo, consejo] of Object.entries(CONSEJOS)) {
      expect(consejo.length, fallo).toBeGreaterThan(20);
      // «proporción del rostro insuficiente» no se puede obedecer.
      expect(consejo, fallo).not.toMatch(/proporción|umbral|varianza|laplaciano/i);
    }
  });
});

describe('los umbrales son los MISMOS que los de la app del residente', () => {
  it('se leen del fichero Dart, no de una copia', () => {
    /**
     * Dos superficies que juzgan la misma foto con criterios distintos producen
     * un «sirve aquí y no allí» que nadie sabe explicar.
     *
     * Y la comprobación **lee el fichero Dart**, no una copia de sus números.
     * Una prueba que dijera «coinciden» contra constantes escritas aquí seguiría
     * en verde el día que alguien cambiara el umbral en la app: exactamente el
     * defecto que destapó D-78, donde la prueba del tema leía el `.ts` como
     * texto y daba verde sobre tres divergencias reales.
     */
    const dart = readFileSync(
      join(process.cwd(), '..', 'mobile', 'lib', 'dominio', 'calidad_de_captura.dart'),
      'utf8',
    );
    const leer = (nombre: string): number => {
      const encontrado = new RegExp(`this\\.${nombre}\\s*=\\s*([0-9.]+)`).exec(dart);
      expect(encontrado, `no se encontró ${nombre} en calidad_de_captura.dart`).not.toBeNull();
      return Number(encontrado?.[1]);
    };

    expect(UMBRALES.nitidezMinima).toBe(leer('nitidezMinima'));
    expect(UMBRALES.iluminacionMinima).toBe(leer('iluminacionMinima'));
    expect(UMBRALES.iluminacionMaxima).toBe(leer('iluminacionMaxima'));
    expect(UMBRALES.proporcionMinima).toBe(leer('proporcionMinima'));
    expect(UMBRALES.proporcionMaxima).toBe(leer('proporcionMaxima'));
  });
});
