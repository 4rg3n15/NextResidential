import { describe, expect, it } from 'vitest';
import { HUECOS_DE_LA_BARRA, repartirNavegacion, rutaActivaDe } from './navegacion-movil';
import { navegacionDe } from './navegacion';
import type { ElementoDeNavegacion } from './navegacion';

/**
 * D-71 · LA NAVEGACIÓN EN UNA PANTALLA DE TELÉFONO
 *
 * Reportado desde el despliegue: en vertical no había menú. La barra lateral
 * se ocultaba con `hidden md:flex` y nada ocupaba su lugar, así que la
 * navegación sólo aparecía al girar el teléfono. El reparto vive en funciones
 * puras —y no dentro del componente— porque lo que hay que garantizar no es
 * cómo se ve, sino que el usuario nunca se quede sin saber dónde está.
 */
const elemento = (
  clave: string,
  ruta: string,
  pendienteDeEtapa: string | null = null,
): ElementoDeNavegacion => ({
  clave,
  etiqueta: clave,
  ruta,
  roles: ['residente'],
  pendienteDeEtapa,
  icono: 'House',
});

describe('rutaActivaDe', () => {
  it('elige la coincidencia más larga: «/mi» es prefijo de «/mi/familia»', () => {
    const elementos = [elemento('mi', '/mi'), elemento('familia', '/mi/familia')];
    expect(rutaActivaDe(elementos, '/mi/familia')).toBe('/mi/familia');
    expect(rutaActivaDe(elementos, '/mi')).toBe('/mi');
  });

  it('una ruta de otra sección no marca nada', () => {
    expect(rutaActivaDe([elemento('mi', '/mi')], '/tablero')).toBeNull();
  });

  it('no confunde un prefijo de cadena con un prefijo de ruta', () => {
    // «/mi-perfil» NO está dentro de «/mi»: la comparación lleva la barra.
    expect(rutaActivaDe([elemento('mi', '/mi')], '/mi-perfil')).toBeNull();
  });
});

describe('repartirNavegacion', () => {
  const ocho = Array.from({ length: 8 }, (_, i) => elemento(`e${String(i)}`, `/r${String(i)}`));

  it('deja los primeros en la barra y el resto en «Más»', () => {
    const r = repartirNavegacion(ocho, null);
    expect(r.enLaBarra).toHaveLength(HUECOS_DE_LA_BARRA);
    expect(r.enMas).toHaveLength(8 - HUECOS_DE_LA_BARRA);
    expect(r.enLaBarra.map((e) => e.clave)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4']);
  });

  it('si la pantalla activa cayó en «Más», es «Más» quien se marca', () => {
    // Sin esto, el residente que está en Perfil no ve ningún elemento activo
    // y pierde la referencia de dónde está.
    const r = repartirNavegacion(ocho, '/r7');
    expect(r.activaEnMas).toBe(true);
  });

  it('si la pantalla activa está en la barra, «Más» no se marca', () => {
    expect(repartirNavegacion(ocho, '/r1').activaEnMas).toBe(false);
  });

  it('cuando todo cabe no hay «Más», y se aprovecha también su hueco', () => {
    const seis = ocho.slice(0, HUECOS_DE_LA_BARRA + 1);
    const r = repartirNavegacion(seis, null);
    expect(r.enMas).toEqual([]);
    expect(r.enLaBarra).toHaveLength(HUECOS_DE_LA_BARRA + 1);
  });

  it('una entrada no construida no gasta un hueco de la barra', () => {
    // En la barra lateral se muestran deshabilitadas con su etapa, que allí es
    // información honesta. En seis huecos sería tirar uno de seis.
    const con = [
      elemento('a', '/a'),
      elemento('pendiente', '/p', '16'),
      ...ocho.slice(0, 5).map((e) => elemento(`${e.clave}x`, `${e.ruta}x`)),
    ];
    const r = repartirNavegacion(con, null);
    expect(r.enLaBarra.some((e) => e.pendienteDeEtapa !== null)).toBe(false);
    expect(r.enMas.some((e) => e.clave === 'pendiente')).toBe(true);
  });

  it('ningún elemento se pierde por el camino, para ningún rol', () => {
    // La garantía que importa: lo que la barra lateral ofrece en escritorio
    // tiene que seguir alcanzable en el teléfono, en la barra o en «Más».
    for (const rol of [
      'residente',
      'administrador',
      'superadministrador',
      'portero',
      'operador_central',
    ] as const) {
      const elementos = navegacionDe(rol);
      const r = repartirNavegacion(elementos, null);
      const repartidos = [...r.enLaBarra, ...r.enMas].map((e) => e.clave).sort();
      expect(repartidos).toEqual(elementos.map((e) => e.clave).sort());
    }
  });
});
