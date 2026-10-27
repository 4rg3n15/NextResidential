import { describe, expect, it } from 'vitest';
import type { FilaDelRespaldo } from '../aplicacion/respaldo/puertos';
import { aExcel } from './formatos';
import { COLUMNAS_DEL_RESPALDO, formatoDelRespaldoEnExcel } from './formato-del-respaldo';

/** D-147 · el Excel del respaldo: columnas del buscador, hora de Bogotá, XML escapado. */
const fila = (extra: Partial<FilaDelRespaldo> = {}): FilaDelRespaldo => ({
  ocurridoEn: new Date(Date.UTC(2026, 9, 27, 4, 30)), // 26/10 23:30 en Bogotá
  tipo: 'ingreso',
  resultado: 'negado',
  motivo: 'LISTA_NEGRA',
  metodo: 'facial',
  persona: 'Laura Gómez',
  clasePersona: 'visitante',
  vivienda: 'Casa 12',
  placa: null,
  equipo: 'Talanquera norte',
  operador: null,
  motivoManual: null,
  ...extra,
});

const texto = (filas: readonly FilaDelRespaldo[]): string =>
  new TextDecoder().decode(formatoDelRespaldoEnExcel.serializar(filas));

describe('formato del respaldo', () => {
  it('lleva las columnas del buscador y la hora en Bogotá', () => {
    const xml = texto([fila()]);
    for (const [titulo] of COLUMNAS_DEL_RESPALDO) expect(xml).toContain(titulo);
    expect(xml).toContain('2026-10-26 23:30:00');
    expect(xml).toContain('2026-10-27T04:30:00.000Z');
    expect(xml).toContain('Negado · persona o placa en lista negra');
    expect(xml).toContain('Rostro');
    expect(xml).toContain('Laura Gómez · visitante');
    expect(xml).toContain('Talanquera norte');
  });

  it('sin persona identificada dice «Desconocido»', () => {
    expect(texto([fila({ persona: null, clasePersona: null })])).toContain('Desconocido');
  });

  it('escapa el XML y quita caracteres de control', () => {
    const xml = texto([fila({ motivoManual: '<script>&\u0007' })]);
    expect(xml).toContain('&lt;script&gt;&amp;');
    expect(xml).not.toContain('\u0007');
  });

  it('la exportación de siempre no cambia', () => {
    expect(new TextDecoder().decode(aExcel([]))).toContain('Fecha y hora (UTC)');
  });
});
