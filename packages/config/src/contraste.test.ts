import { describe, expect, it } from 'vitest';
import { UMBRAL_AA, contraste, luminancia } from './contraste';
import { paleta } from './tailwind-preset';

/**
 * ACCESIBILIDAD AA · verificación obligatoria de §5.6, ejecutada y no recordada.
 *
 * Los pares son los REALES de la consola: cada uno corresponde a una
 * combinación que existe en pantalla. Si alguien aclara un color del preset,
 * esta suite dice cuál, contra qué fondo y cuánto le falta.
 */

const par = (primerPlano: string, fondo: string): number =>
  Number(contraste(primerPlano, fondo).toFixed(3));

describe('luminancia', () => {
  it('el blanco es 1 y el negro es 0', () => {
    expect(luminancia('#FFFFFF')).toBeCloseTo(1, 6);
    expect(luminancia('#000000')).toBeCloseTo(0, 6);
  });

  it('rechaza lo que no es un color, en vez de devolver un número sin sentido', () => {
    expect(() => luminancia('rojo')).toThrow();
    expect(() => luminancia('#FFF')).toThrow();
  });
});

describe('contraste', () => {
  it('no depende del orden de los argumentos', () => {
    expect(contraste('#FFFFFF', '#000000')).toBeCloseTo(contraste('#000000', '#FFFFFF'), 9);
  });

  it('blanco sobre negro es 21 : 1, el máximo posible', () => {
    expect(contraste('#FFFFFF', '#000000')).toBeCloseTo(21, 3);
  });
});

describe('el hallazgo que motivó la variante oscurecida', () => {
  it('el rojo de marca sobre blanco NO llega a AA para texto normal', () => {
    // 3,9 : 1 según §5.6; medido aquí, 4,168 : 1. En los dos casos, por debajo
    // de 4,5. Esta prueba fija el hecho para que nadie vuelva a usarlo como
    // color de texto pequeño «porque parece que sí».
    expect(par(paleta.marca.DEFAULT, paleta.tarjeta)).toBeLessThan(UMBRAL_AA.textoNormal);
  });

  it('pero sí cumple como COMPONENTE de interfaz, que es donde se usa', () => {
    expect(par(paleta.marca.DEFAULT, paleta.tarjeta)).toBeGreaterThanOrEqual(UMBRAL_AA.componente);
    expect(par(paleta.marca.DEFAULT, paleta.lienzo)).toBeGreaterThanOrEqual(UMBRAL_AA.componente);
  });

  it('el texto blanco sobre el relleno de marca TAMPOCO llega: por eso hay marca.boton', () => {
    // §5.6 lo estimaba en «≈ 4,4 : 1» y preveía la salida. Medido: 4,168.
    expect(par(paleta.tarjeta, paleta.marca.DEFAULT)).toBeLessThan(UMBRAL_AA.textoNormal);
    expect(par(paleta.tarjeta, paleta.marca.boton)).toBeGreaterThanOrEqual(UMBRAL_AA.textoNormal);
  });

  it('marca.boton sigue siendo el mismo rojo, no otro color', () => {
    // Menos de 1,2 : 1 entre los dos: el ojo los lee como el mismo tono. Si
    // alguien «arreglara» el contraste oscureciendo de más, esto lo delata.
    expect(par(paleta.marca.boton, paleta.marca.DEFAULT)).toBeLessThan(1.2);
  });
});

describe('texto sobre superficie clara', () => {
  const claras = [
    ['tarjeta', paleta.tarjeta],
    ['lienzo', paleta.lienzo],
  ] as const;

  const textos = [
    ['texto principal', paleta.texto.DEFAULT],
    ['texto fuerte', paleta.texto.fuerte],
    ['texto apagado', paleta.texto.apagado],
    ['marca (texto)', paleta.marca.texto],
    ['éxito (texto)', paleta.exito.texto],
    ['aviso (texto)', paleta.aviso.texto],
    ['peligro (texto)', paleta.peligro.texto],
    ['neutro (texto)', paleta.neutro.texto],
  ] as const;

  for (const [nombreFondo, fondo] of claras) {
    for (const [nombreTexto, color] of textos) {
      it(`${nombreTexto} sobre ${nombreFondo} cumple AA para texto normal`, () => {
        expect(par(color, fondo)).toBeGreaterThanOrEqual(UMBRAL_AA.textoNormal);
      });
    }
  }
});

describe('texto sobre superficie oscura (barra lateral y panel de marca)', () => {
  const oscuras = [
    ['oscuro', paleta.oscuro.DEFAULT],
    ['oscuro profundo', paleta.oscuro.profundo],
    ['oscuro elevado', paleta.oscuro.elevado],
    ['oscuro secundario', paleta.oscuro.secundario],
  ] as const;

  for (const [nombre, fondo] of oscuras) {
    it(`el texto invertido cumple AA sobre ${nombre}`, () => {
      expect(par(paleta.texto.invertido, fondo)).toBeGreaterThanOrEqual(UMBRAL_AA.textoNormal);
    });

    it(`el texto invertido apagado cumple AA sobre ${nombre}`, () => {
      // Es el de los subtítulos de la barra lateral: si no cumpliera, la mitad
      // de la navegación sería ilegible para quien tiene baja visión.
      expect(par(paleta.texto.invertidoApagado, fondo)).toBeGreaterThanOrEqual(
        UMBRAL_AA.textoNormal,
      );
    });
  }

  it('el filete rojo del elemento activo se distingue del panel oscuro', () => {
    expect(par(paleta.marca.DEFAULT, paleta.oscuro.elevado)).toBeGreaterThanOrEqual(
      UMBRAL_AA.componente,
    );
  });
});

describe('distintivos de estado: fondo suave con su texto', () => {
  const distintivos = [
    ['permitido / en línea', paleta.exito.texto, paleta.exito.suave],
    ['denegado / falla', paleta.peligro.texto, paleta.peligro.suave],
    ['pendiente / degradado', paleta.aviso.texto, paleta.aviso.suave],
    ['neutro', paleta.neutro.texto, paleta.neutro.suave],
  ] as const;

  for (const [nombre, texto, fondo] of distintivos) {
    it(`«${nombre}» cumple AA`, () => {
      expect(par(texto, fondo)).toBeGreaterThanOrEqual(UMBRAL_AA.textoNormal);
    });
  }
});

describe('bordes y separadores', () => {
  it('el borde de campo con error se distingue del lienzo', () => {
    expect(par(paleta.marca.texto, paleta.lienzo)).toBeGreaterThanOrEqual(UMBRAL_AA.componente);
  });

  it('el anillo de foco se distingue de las dos superficies donde aparece', () => {
    // §5.6.3: filete rojo sobre fondo claro, blanco sobre fondo oscuro.
    expect(par(paleta.marca.texto, paleta.tarjeta)).toBeGreaterThanOrEqual(UMBRAL_AA.componente);
    expect(par(paleta.texto.invertido, paleta.oscuro.DEFAULT)).toBeGreaterThanOrEqual(
      UMBRAL_AA.componente,
    );
  });
});
