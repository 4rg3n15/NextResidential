import { describe, expect, it } from 'vitest';
import { COLUMNAS, aCsv, aExcel, aPdf } from './formatos';
import type { EventoRegistrado } from '../aplicacion/puertos';

const fila = (extra: Partial<EventoRegistrado> = {}): EventoRegistrado => ({
  id: 'evt-1',
  copropiedadId: 'cop-1',
  ocurridoEn: new Date('2026-09-08T14:00:00.000Z'),
  tipo: 'ingreso',
  resultado: 'permitido',
  motivo: null,
  metodo: 'placa',
  personaId: 'per-1',
  viviendaId: 'viv-1',
  zonaId: null,
  dispositivoId: 'disp-1',
  placaDetectada: 'ABC123',
  confianza: 0.97,
  reglaAplicada: 'motor.ningunaRegulaNiega',
  versionReglas: 1,
  operadorId: null,
  motivoManual: null,
  evidenciaId: null,
  decididoPorEdge: false,
  ...extra,
});

const texto = (b: Buffer): string => b.toString('utf8');

describe('aCsv · RFC 4180', () => {
  it('empieza por el BOM, para que Excel no rompa los acentos', () => {
    expect(texto(aCsv([]))[0]).toBe('\uFEFF');
  });

  it('la cabecera lleva todas las columnas y termina en CRLF', () => {
    const salida = texto(aCsv([]));
    expect(salida).toContain('"Fecha y hora (UTC)"');
    expect(salida.endsWith('\r\n')).toBe(true);
  });

  it('emite una línea por fila', () => {
    const salida = texto(aCsv([fila(), fila({ id: 'evt-2' })]));
    expect(salida.trimEnd().split('\r\n').length).toBe(3);
  });

  it('duplica las comillas internas', () => {
    const salida = texto(aCsv([fila({ motivoManual: 'dijo "adelante"' })]));
    expect(salida).toContain('"dijo ""adelante"""');
  });

  it('neutraliza la inyección de fórmulas', () => {
    // Sin esto, Excel ejecutaría la celda al abrir el informe.
    const salida = texto(aCsv([fila({ motivoManual: '=HYPERLINK("http://x")' })]));
    expect(salida).toContain(`"'=HYPERLINK`);
  });

  it.each(['+34', '-1', '@dominio'])('neutraliza también el prefijo %s', (valor) => {
    expect(texto(aCsv([fila({ motivoManual: valor })]))).toContain(`"'${valor}"`);
  });

  it('un valor legítimo no se toca', () => {
    expect(texto(aCsv([fila({ motivoManual: 'proveedor esperado' })]))).toContain(
      '"proveedor esperado"',
    );
  });

  it('los nulos salen como celda vacía, no como "null"', () => {
    const salida = texto(aCsv([fila({ motivo: null, zonaId: null })]));
    expect(salida).not.toContain('null');
  });
});

describe('aExcel · SpreadsheetML', () => {
  it('es un libro con una hoja y la fila de encabezado', () => {
    const salida = texto(aExcel([fila()]));
    expect(salida).toContain('<?mso-application progid="Excel.Sheet"?>');
    expect(salida).toContain('ss:Name="Eventos"');
    expect(salida.match(/<Row>/g)?.length).toBe(2);
  });

  it('escapa los caracteres que romperían el XML', () => {
    const salida = texto(aExcel([fila({ motivoManual: 'a & b < c > d "e"' })]));
    expect(salida).toContain('a &amp; b &lt; c &gt; d &quot;e&quot;');
    expect(salida).not.toContain('a & b');
  });

  it('quita los caracteres de control: uno solo invalidaría el libro entero', () => {
    const salida = texto(aExcel([fila({ motivoManual: 'antes\u0007\u0000despues' })]));
    expect(salida).toContain('antesdespues');
  });

  it('emite tantas celdas por fila como columnas', () => {
    const salida = texto(aExcel([fila()]));
    expect(salida.match(/<Cell>/g)?.length).toBe(COLUMNAS.length * 2);
  });
});

describe('aPdf · escrito a mano, con xref correcto', () => {
  const leer = (b: Buffer): string => b.toString('latin1');

  it('tiene cabecera y marca de fin', () => {
    const pdf = leer(aPdf([fila()], 'Historial'));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('el desplazamiento de cada objeto en el xref apunta a su "N 0 obj"', () => {
    // Es la comprobación que importa: un xref desfasado produce un fichero que
    // unos lectores abren y otros rechazan.
    const buffer = aPdf([fila(), fila({ id: 'evt-2' })], 'Historial');
    const pdf = leer(buffer);
    const inicioXref = Number(pdf.slice(pdf.lastIndexOf('startxref')).split('\n')[1]);
    expect(pdf.slice(inicioXref, inicioXref + 4)).toBe('xref');

    const lineas = pdf
      .slice(inicioXref)
      .split('\n')
      .filter((l) => /^\d{10} \d{5} n\s*$/.test(l));
    expect(lineas.length).toBeGreaterThan(0);
    lineas.forEach((linea, i) => {
      const desplazamiento = Number(linea.slice(0, 10));
      expect(pdf.slice(desplazamiento, desplazamiento + 20)).toContain(`${i + 1} 0 obj`);
    });
  });

  it('declara tantas páginas como objetos de página', () => {
    const pdf = leer(aPdf([fila()], 'Historial'));
    expect(pdf).toContain('/Count 1');
    expect(pdf.match(/\/Type \/Page[^s]/g)?.length).toBe(1);
  });

  it('parte en varias páginas cuando hay muchas filas', () => {
    const muchas = Array.from({ length: 70 }, (_, i) => fila({ id: `evt-${i}` }));
    const pdf = leer(aPdf(muchas, 'Historial'));
    expect(pdf).toContain('/Count 3');
  });

  it('un informe vacío sigue siendo un PDF de una página', () => {
    const pdf = leer(aPdf([], 'Sin resultados'));
    expect(pdf).toContain('/Count 1');
    expect(pdf).toContain('Sin resultados');
  });

  it('el título aparece en el contenido', () => {
    expect(leer(aPdf([fila()], 'Historial de eventos'))).toContain('(Historial de eventos) Tj');
  });

  it('escapa los paréntesis, que en PDF delimitan la cadena', () => {
    const pdf = leer(aPdf([fila()], 'Informe (parcial)'));
    expect(pdf).toContain('Informe \\(parcial\\)');
  });

  it('el /Length declarado coincide con el flujo real', () => {
    const pdf = leer(aPdf([fila()], 'Historial'));
    const coincidencia = /\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(pdf);
    expect(coincidencia).not.toBeNull();
    expect(Buffer.byteLength(coincidencia?.[2] ?? '', 'latin1')).toBe(
      Number(coincidencia?.[1] ?? -1),
    );
  });
});
