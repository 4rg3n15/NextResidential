import { describe, expect, it } from 'vitest';
import { UMBRAL_AA, contraste } from './contraste';
import {
  PAREJAS,
  TEMAS,
  TEMA_CLARO,
  TEMA_OSCURO,
  canales,
  colorDeToken,
  coloresDelPreset,
  variablesDeTema,
} from './temas';
import type { NombreDeTema, Pareja } from './temas';

/**
 * ACCESIBILIDAD AA EN LOS DOS TEMAS · el mismo control ejecutable que destapó
 * que `#E63946` no llegaba a 4,5 : 1, aplicado ahora pareja por pareja.
 *
 * La diferencia con la suite anterior no es el número de comprobaciones: es
 * que antes se medían colores contra superficies elegidas a mano, y ahora se
 * mide **la lista de combinaciones que existen en pantalla**. Un fondo sin su
 * texto no es una comprobación; es una media comprobación, y es exactamente la
 * mitad que el modo oscuro rompe.
 */

const UMBRAL: Readonly<Record<Pareja['clase'], number>> = {
  texto: UMBRAL_AA.textoNormal,
  componente: UMBRAL_AA.componente,
};

const temas = Object.keys(TEMAS) as readonly NombreDeTema[];

describe('parejas fondo/texto', () => {
  for (const tema of temas) {
    describe(`tema ${tema}`, () => {
      for (const pareja of PAREJAS) {
        if (pareja.soloEn !== undefined && pareja.soloEn !== tema) continue;
        it(`«${pareja.nombre}» cumple AA`, () => {
          const primerPlano = colorDeToken(TEMAS[tema], pareja.primerPlano);
          const fondo = colorDeToken(TEMAS[tema], pareja.fondo);
          const medido = Number(contraste(primerPlano, fondo).toFixed(3));
          expect(
            medido,
            `${pareja.primerPlano} (${primerPlano}) sobre ${pareja.fondo} (${fondo}) da ${String(medido)} : 1`,
          ).toBeGreaterThanOrEqual(UMBRAL[pareja.clase]);
        });
      }
    });
  }
});

describe('el hallazgo que motivó el token exito.boton', () => {
  it('el verde de marca con etiqueta blanca NO llegaba a AA, y estaba en producción', () => {
    // 2,537 : 1. La suite anterior no lo veía porque ese par no se declaraba
    // en ninguna parte: medía el verde contra el lienzo, no contra su texto.
    expect(contraste('#FFFFFF', TEMA_CLARO.exito.DEFAULT)).toBeLessThan(UMBRAL_AA.textoNormal);
  });

  it('exito.boton sí, y sigue siendo el mismo verde', () => {
    expect(contraste('#FFFFFF', TEMA_CLARO.exito.boton)).toBeGreaterThanOrEqual(
      UMBRAL_AA.textoNormal,
    );
    // Menos de 2 : 1 entre los dos: el ojo los lee como el mismo tono.
    expect(contraste(TEMA_CLARO.exito.boton, TEMA_CLARO.exito.DEFAULT)).toBeLessThan(2);
  });
});

describe('los dos temas describen el mismo sistema', () => {
  it('declaran exactamente los mismos tokens', () => {
    expect(Object.keys(variablesDeTema(TEMA_OSCURO)).sort()).toEqual(
      Object.keys(variablesDeTema(TEMA_CLARO)).sort(),
    );
  });

  it('el preset expone una clase por token, ni una más ni una menos', () => {
    const deVariables = Object.keys(variablesDeTema(TEMA_CLARO)).sort();
    const delPreset: string[] = [];
    const recorrer = (nodo: unknown, ruta: readonly string[]): void => {
      if (typeof nodo === 'string') {
        delPreset.push(`--ncr-${ruta.filter((p) => p !== 'DEFAULT').join('-')}`);
        return;
      }
      for (const [clave, hijo] of Object.entries(nodo as Record<string, unknown>)) {
        recorrer(hijo, [...ruta, clave]);
      }
    };
    recorrer(coloresDelPreset(), []);
    expect(delPreset.sort()).toEqual(deVariables);
  });

  it('cada color del preset apunta a su variable y admite opacidad', () => {
    // `bg-oscuro/50` y `ring-marca/20` ya existen en la consola: si el preset
    // emitiera hexadecimales, esas clases dejarían de pintar en silencio.
    const colores = coloresDelPreset();
    const lienzo = colores['lienzo'];
    expect(lienzo).toBe('rgb(var(--ncr-lienzo) / <alpha-value>)');
  });

  it('las superficies oscuras y su texto NO cambian con el tema', () => {
    // La barra lateral es oscura en los dos modos. Si alguien la «invirtiera»
    // en claro, el panel se volvería blanco con texto casi blanco encima.
    expect(TEMA_OSCURO.texto.invertido).toBe(TEMA_CLARO.texto.invertido);
    expect(TEMA_OSCURO.constante.blanco).toBe('#FFFFFF');
  });

  it('los rellenos con etiqueta blanca valen lo mismo en ambos temas', () => {
    expect(TEMA_OSCURO.marca.boton).toBe(TEMA_CLARO.marca.boton);
    expect(TEMA_OSCURO.peligro.boton).toBe(TEMA_CLARO.peligro.boton);
    expect(TEMA_OSCURO.exito.boton).toBe(TEMA_CLARO.exito.boton);
    expect(TEMA_OSCURO.exito.presionado).toBe(TEMA_CLARO.exito.presionado);
  });
});

describe('conversión a canales', () => {
  it('traduce el rojo de marca', () => {
    expect(canales('#E63946')).toBe('230 57 70');
  });

  it('rechaza lo que no es un color en vez de emitir una variable rota', () => {
    expect(() => canales('rojo')).toThrow();
    expect(() => canales('#FFF')).toThrow();
  });
});

describe('resolución de rutas de token', () => {
  it('resuelve una hoja anidada', () => {
    expect(colorDeToken(TEMA_CLARO, 'marca.texto')).toBe('#A23037');
  });

  it('resuelve una hoja de primer nivel', () => {
    expect(colorDeToken(TEMA_CLARO, 'lienzo')).toBe('#F8F9FA');
  });
});
