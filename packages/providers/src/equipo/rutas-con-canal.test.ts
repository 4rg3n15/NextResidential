import { describe, expect, it } from 'vitest';
import { MARCADOR_DE_CANAL, RUTAS, RutaSinCanal, exigeCanal, rutaPara } from './catalogo-de-rutas';

/**
 * D4 · el catálogo ya no escribe ningún número de canal. Lo que se fija aquí
 * es que no vuelva a aparecer uno, y que pedir una ruta con canal sin decir
 * cuál LANCE en vez de suponer 1.
 */
describe('rutas con {canal} · D4', () => {
  it('NINGUNA ruta lleva un número de canal escrito: todas usan el marcador', () => {
    for (const r of RUTAS) {
      expect(r.ruta, r.proposito).not.toMatch(
        /channels\/\d+|door\/\d+|vehicledetection-\d+|channelID=\d+/,
      );
    }
  });

  it('pedir una ruta con canal SIN canal lanza, y el error dice qué faltó', () => {
    expect(() => rutaPara('abrir el canal de audio bidireccional', 'videoportero')).toThrow(
      RutaSinCanal,
    );
    expect(() => rutaPara('abrir el canal de audio bidireccional', 'videoportero', 0)).toThrow(
      /nunca se supone 1/,
    );
    expect(() => rutaPara('abrir la puerta del videoportero', 'videoportero', 1.5)).toThrow(
      RutaSinCanal,
    );
  });

  it('con canal, el marcador se sustituye y no queda rastro de él', () => {
    const r = rutaPara('abrir el canal de audio bidireccional', 'videoportero', 3);
    expect(r.ruta).toBe('/ISAPI/System/TwoWayAudio/channels/3/open');
    expect(r.ruta.includes(MARCADOR_DE_CANAL)).toBe(false);
  });

  it('una ruta sin marcador ignora el canal que se le pase', () => {
    const r = rutaPara('leer la identidad del equipo (modelo, firmware, serie)', 'comun', 7);
    expect(r.ruta).toBe('/ISAPI/System/deviceInfo');
    expect(exigeCanal(r)).toBe(false);
  });

  it('las rutas de audio, puerta y carril exigen canal; se puede preguntar antes de pedir', () => {
    const conCanal = RUTAS.filter(exigeCanal).map((r) => r.proposito);
    expect(conCanal).toContain('abrir el canal de audio bidireccional');
    expect(conCanal).toContain('abrir la puerta del videoportero');
    expect(conCanal).toContain('abrir la puerta desde la plataforma');
    expect(conCanal).toContain('enviar audio al equipo');
  });

  it('D3 · la carga de la plantilla facial va por PUT', () => {
    expect(rutaPara('cargar la plantilla facial', 'terminal').metodo).toBe('PUT');
  });

  it('toda ruta respaldada por la guía nombra la GUÍA, no sólo la sección (6.11)', () => {
    for (const r of RUTAS.filter((x) => x.procedencia === 'guia_oficial')) {
      expect(r.capitulo, r.proposito).toMatch(/^Guía ISAPI integral del fabricante · §/);
    }
  });
});
