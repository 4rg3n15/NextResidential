import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { sanear, sanearTexto } from './saneamiento';

/**
 * H-13-05 y H-13-06 · el saneador, contra la función y sin dominio de por medio.
 *
 * La prueba e2e demuestra que el pipeline de producción lo aplica; ésta
 * demuestra QUÉ hace exactamente, incluido lo que NO debe tocar. Las dos hacen
 * falta: un saneador que borrase de más pasaría la e2e —donde `motivo` colapsa
 * espacios por su cuenta— y rompería cualquier campo que sí los conserve.
 */
describe('sanearTexto', () => {
  it('quita el byte NUL y los caracteres de control C0/C1', () => {
    expect(sanearTexto('a\u0000b\u0007c\u001bd\u009fe')).toBe('abcde');
  });

  it('pero CONSERVA tabulador, salto de línea y retorno de carro', () => {
    expect(sanearTexto('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });

  it('normaliza a NFC: la forma descompuesta y la compuesta dan lo mismo', () => {
    // «portería» con la í descompuesta (i + U+0301) tiene que quedar idéntica a
    // la compuesta: si no, dos cadenas que se ven iguales no lo son, y una
    // comparación de identidad —una placa, un documento— duplica o falla.
    expect(sanearTexto('porteri\u0301a')).toBe('portería'.normalize('NFC'));
    expect(sanearTexto('e\u0301')).toBe('é');
  });

  it('recorta los extremos', () => {
    expect(sanearTexto('   hola   ')).toBe('hola');
  });

  it('quita los controles bidireccionales y los invisibles (H-13-14)', () => {
    // U+202E hace que lo que sigue se LEA al revés. Sobre un motivo de apertura
    // —registro que RN-03 declara inalterable— es falsificación de lo que verá
    // quien audite, sin tocar un solo byte de la fila.
    expect(sanearTexto('Apertura\u202Eadatuceje')).toBe('Aperturaadatuceje');
    expect(sanearTexto('a\u200Bb\uFEFFc\u2066d\u2069e')).toBe('abcde');
  });

  it('pero NO se come el no-unidor ni el unidor de anchura cero', () => {
    // U+200C y U+200D son ortografía legítima en persa y en hindi, y arman las
    // secuencias de emoji. Un saneador que borra escritura válida es un
    // defecto, no una defensa.
    expect(sanearTexto('a\u200Cb\u200Dc')).toBe('a\u200Cb\u200Dc');
  });

  it('NO RECORTA POR LONGITUD: un base64 de 10 000 caracteres sale entero (H-13-09)', () => {
    // El hallazgo: con techo de 4096 el XLSX del padrón llegaba mutilado con la
    // firma PK intacta, así que la validación de tipo real lo daba por bueno y
    // el DTO no protestaba —4096 cabe en @Length(1, 340_000)—. 2xx sobre un ZIP
    // roto. La cota va en el DTO, que sabe de qué campo se trata.
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(8000, 0x41)]);
    const base64 = zip.toString('base64');
    expect(sanearTexto(base64)).toBe(base64);
    expect(Buffer.from(sanearTexto(base64), 'base64')).toHaveLength(zip.length);
  });

  it('no inventa nada con una cadena que ya está limpia', () => {
    expect(sanearTexto('Apertura autorizada por portería')).toBe(
      'Apertura autorizada por portería',
    );
  });
});

describe('sanear', () => {
  it('recorre objetos y arreglos', () => {
    const r = sanear({ a: 'x\u0000y', b: ['p\u0007q', { c: ' z ' }] }) as Record<string, unknown>;
    expect(r.a).toBe('xy');
    expect((r.b as unknown[])[0]).toBe('pq');
    expect(((r.b as unknown[])[1] as Record<string, string>).c).toBe('z');
  });

  it('rechaza las claves que heredan de Object.prototype', () => {
    for (const clave of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(() => sanear(JSON.parse(`{${JSON.stringify(clave)}:1}`))).toThrow(BadRequestException);
    }
  });

  it('y devuelve objetos SIN prototipo: aunque una clave se colara, no hay qué contaminar', () => {
    const r = sanear({ a: { b: 1 } }) as Record<string, unknown>;
    expect(Object.getPrototypeOf(r)).toBeNull();
    expect(Object.getPrototypeOf(r.a as object)).toBeNull();
  });

  it('corta el anidamiento absurdo con 400, no con un desbordamiento de pila', () => {
    let hondo: Record<string, unknown> = { fin: 1 };
    for (let i = 0; i < 200; i += 1) hondo = { a: hondo };
    expect(() => sanear(hondo)).toThrow(BadRequestException);
  });

  it('deja intactos los valores que no son texto', () => {
    const r = sanear({ n: 42, b: true, z: null, f: 1.5 }) as Record<string, unknown>;
    expect(r).toEqual({ n: 42, b: true, z: null, f: 1.5 });
  });
});
