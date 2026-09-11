import { describe, expect, it } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { ArchivoInvalido, LIMITES, filasDesdeXlsx, leerHojaXlsx } from './xlsx';

/**
 * El lector de XLSX es el único punto del sistema que analiza un binario que
 * llega de fuera, así que se prueba por lo que RECHAZA antes que por lo que
 * lee. Las primeras pruebas son las que justifican haberlo escrito a mano.
 */

/** Construye un ZIP mínimo, sin dependencias, para no probar contra un doble. */
const zip = (entradas: readonly { nombre: string; contenido: string }[]): Buffer => {
  const locales: Buffer[] = [];
  const centrales: Buffer[] = [];
  let desplazamiento = 0;

  for (const { nombre, contenido } of entradas) {
    const nombreBuf = Buffer.from(nombre, 'utf8');
    const crudo = Buffer.from(contenido, 'utf8');
    const comprimido = deflateRawSync(crudo);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(crudo.length, 22);
    local.writeUInt16LE(nombreBuf.length, 26);
    locales.push(local, nombreBuf, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(crudo.length, 24);
    central.writeUInt16LE(nombreBuf.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, nombreBuf);

    desplazamiento += local.length + nombreBuf.length + comprimido.length;
  }

  const cuerpo = Buffer.concat(locales);
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(cuerpo.length, 16);
  return Buffer.concat([cuerpo, directorio, fin]);
};

const COLUMNAS = 'ABCDEFGH';

const hoja = (filas: readonly (readonly string[])[]): string => {
  const xml = filas
    .map((celdas, i) => {
      const cs = celdas
        .map((v, j) => `<c r="${COLUMNAS[j]}${i + 1}" t="inlineStr"><is><t>${v}</t></is></c>`)
        .join('');
      return `<row r="${i + 1}">${cs}</row>`;
    })
    .join('');
  return `<?xml version="1.0"?><worksheet><sheetData>${xml}</sheetData></worksheet>`;
};

const libro = (filas: readonly (readonly string[])[]): Buffer =>
  zip([{ nombre: 'xl/worksheets/sheet1.xml', contenido: hoja(filas) }]);

const VIVIENDA = '11111111-1111-4111-8111-111111111111';

describe('lo que el lector RECHAZA', () => {
  it('un archivo que no es un ZIP se rechaza por su CONTENIDO, no por su nombre', () => {
    const falso = Buffer.from('MZ ejecutable disfrazado de hoja de calculo');
    expect(() => leerHojaXlsx(falso)).toThrow(ArchivoInvalido);
    expect(() => leerHojaXlsx(falso)).toThrow(/no es un XLSX/);
  });

  it('un archivo vacio no pasa por «hoja sin filas»', () => {
    expect(() => leerHojaXlsx(Buffer.alloc(0))).toThrow(/vacío/);
  });

  it('una hoja con entidades XML se rechaza sin expandirlas (XXE, billion laughs)', () => {
    const conDtd = zip([
      {
        nombre: 'xl/worksheets/sheet1.xml',
        contenido:
          '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa">]><worksheet><sheetData/></worksheet>',
      },
    ]);
    expect(() => leerHojaXlsx(conDtd)).toThrow(/entidades XML/);
  });

  it('una razon de compresion desproporcionada se rechaza ANTES de descomprimir', () => {
    const bomba = Buffer.from(libro([['vivienda_id']]));
    let i = 0;
    while (bomba.readUInt32LE(i) !== 0x02014b50) i += 1;
    bomba.writeUInt32LE(LIMITES.bytesDescomprimidos + 1, i + 24);
    expect(() => leerHojaXlsx(bomba)).toThrow(/desproporcionado/);
  });

  it('un libro sin primera hoja legible se rechaza con su motivo', () => {
    const otro = zip([{ nombre: 'xl/otra-cosa.xml', contenido: '<x/>' }]);
    expect(() => leerHojaXlsx(otro)).toThrow(/primera hoja/);
  });
});

describe('lo que el lector LEE', () => {
  it('lee una hoja real con cabecera y filas', () => {
    const filas = filasDesdeXlsx(
      libro([
        ['vivienda_id', 'placa'],
        [VIVIENDA, 'ABC123'],
      ]),
    );
    expect(filas).toEqual([{ numeroDeFila: 2, viviendaId: VIVIENDA, placa: 'ABC123' }]);
  });

  it('el numero de fila es el que el operador ve en Excel', () => {
    const datos = libro([['vivienda_id'], [VIVIENDA], ['22222222-2222-4222-8222-222222222222']]);
    expect(filasDesdeXlsx(datos).map((f) => f.numeroDeFila)).toEqual([2, 3]);
  });

  it('las filas vacias del final no se convierten en errores', () => {
    expect(filasDesdeXlsx(libro([['vivienda_id'], [VIVIENDA], [''], ['']]))).toHaveLength(1);
  });

  it('sin la columna vivienda_id no se adivina: se dice que falta', () => {
    expect(() => filasDesdeXlsx(libro([['placa'], ['ABC123']]))).toThrow(/vivienda_id/);
  });

  it('una hoja con solo cabecera no es un error: son cero filas', () => {
    expect(filasDesdeXlsx(libro([['vivienda_id']]))).toEqual([]);
  });
});
