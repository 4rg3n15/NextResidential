import { describe, expect, it } from 'vitest';
import { entornoDeSitio } from '../../test/banco-de-sitio';
import { esquemaDeAjustes } from './esquema-de-ajustes';
import { cargarConfiguracionDeSitio } from './esquema-de-sitio';
import { cargarConfiguracionDelPuente } from './esquema-del-puente';

/**
 * DT-15R-09 · los ajustes de equipos entran por los DOS cargadores del Edge —el
 * de sitio (15-Q) y el del puente con túnel (15-Q2), que es donde se da de alta
 * a los rostros— con la regla de D-91: `VAR=` y el blanco valen «sin
 * configurar», y un valor malo impide arrancar nombrando la variable.
 */
const VARIABLES = Object.keys(esquemaDeAjustes.shape);
const CON_TUNEL = {
  EDGE_TUNEL: 'activo',
  EDGE_EQUIPOS_LLAVE: Buffer.alloc(32, 3).toString('base64'),
};
const cargadores = [
  ['sitio', (e: Record<string, string>) => cargarConfiguracionDeSitio(entornoDeSitio(e))],
  [
    'puente',
    (e: Record<string, string>) =>
      cargarConfiguracionDelPuente(entornoDeSitio({ ...CON_TUNEL, ...e })),
  ],
] as const;

describe.each(cargadores)('ajustes de equipos · cargador de %s', (_nombre, cargar) => {
  it('sin declararlas, los valores por omisión de la API', () => {
    expect(cargar({})).toMatchObject({
      EQUIPOS_DESVIO_DE_RELOJ_S: 30,
      EQUIPOS_TIEMPO_LIMITE_MS: 5000,
      EQUIPOS_ZONA_HORARIA: 'America/Bogota',
      TERMINAL_PLAN_DE_HORARIO: '1',
      EQUIPOS_FOTO_KB_MAXIMOS: 200,
      EQUIPOS_FOTO_LADO_MAXIMO: 1024,
      VIDEO_PUERTO_RTSP: 554,
    });
  });

  it('el valor declarado llega a la configuración', () => {
    const c = cargar({ EQUIPOS_DESVIO_DE_RELOJ_S: '90', EQUIPOS_ZONA_HORARIA: 'America/Lima' });
    expect(c.EQUIPOS_DESVIO_DE_RELOJ_S).toBe(90);
    expect(c.EQUIPOS_ZONA_HORARIA).toBe('America/Lima');
  });

  it.each(VARIABLES)('D-91 · %s: vacía o en blanco, su omisión; mal escrita, no arranca', (v) => {
    const valor = (e: Record<string, string>): unknown => (cargar(e) as Record<string, unknown>)[v];
    expect(valor({ [v]: '' })).toEqual(valor({}));
    expect(valor({ [v]: '   ' })).toEqual(valor({}));
    expect(() => cargar({ [v]: 'x\u0000-imposible' })).toThrow(v);
  });

  it('un umbral de reloj fuera de 1 a 3600 s no arranca: 0 sería «nunca en hora»', () => {
    expect(() => cargar({ EQUIPOS_DESVIO_DE_RELOJ_S: '0' })).toThrow('EQUIPOS_DESVIO_DE_RELOJ_S');
    expect(() => cargar({ EQUIPOS_DESVIO_DE_RELOJ_S: '3601' })).toThrow(
      'EQUIPOS_DESVIO_DE_RELOJ_S',
    );
  });
});
