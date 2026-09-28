import { describe, expect, it } from 'vitest';
import { BUCLE_LOCAL, direccionComparable, normalizarOrigen, redComparable } from './direccion-ip';

/**
 * La normalización ÚNICA de direcciones (ítem 9 de la corrección de la 15-L).
 * Lo que la regla de porteros compara y lo que el Alarm Server ya comparaba,
 * desde un solo sitio. Todas las direcciones son de bucle local o de
 * documentación (RFC 5737 y RFC 3849): ninguna identifica un equipo.
 */
describe('normalizarOrigen · la de siempre, ahora en un solo sitio', () => {
  it('quita el `::ffff:` de los sockets, los espacios y las mayúsculas', () => {
    expect(normalizarOrigen('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizarOrigen('::FFFF:192.0.2.9')).toBe('192.0.2.9');
    expect(normalizarOrigen('  192.0.2.9 ')).toBe('192.0.2.9');
    expect(normalizarOrigen('2001:DB8::1')).toBe('2001:db8::1');
    expect(normalizarOrigen(undefined)).toBe('');
    expect(normalizarOrigen(null)).toBe('');
  });

  it('NO junta el bucle local: el Alarm Server compara como antes', () => {
    expect(normalizarOrigen('::1')).toBe('::1');
  });
});

describe('direccionComparable · el bucle local es UNO', () => {
  it('`::1`, `127.0.0.1` y `::ffff:127.0.0.1` dan la misma dirección', () => {
    for (const grafia of ['::1', '127.0.0.1', '::ffff:127.0.0.1', '0:0:0:0:0:0:0:1', ' ::1 ']) {
      expect(direccionComparable(grafia), grafia).toBe(BUCLE_LOCAL);
    }
  });

  it('otra dirección sigue siendo otra', () => {
    expect(direccionComparable('127.0.0.2')).toBe('127.0.0.2'); // kpi-11-exento: bucle local
    expect(direccionComparable('::2')).toBe('::2');
    expect(direccionComparable('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(direccionComparable('2001:db8::1')).toBe('2001:db8::1');
    expect(direccionComparable('no-es-ip')).toBe('no-es-ip');
  });
});

describe('redComparable · una entrada de la lista, con su prefijo traducido', () => {
  it('una dirección o una red de su misma familia quedan como estaban', () => {
    expect(redComparable('192.0.2.0/24')).toEqual({
      direccion: '192.0.2.0',
      familia: 'ipv4',
      prefijo: 24,
    });
    expect(redComparable('2001:DB8::/32')).toEqual({
      direccion: '2001:db8::',
      familia: 'ipv6',
      prefijo: 32,
    });
    expect(redComparable(' 127.0.0.1 ')).toEqual({
      direccion: '127.0.0.1',
      familia: 'ipv4',
      prefijo: null,
    });
  });

  it('de IPv6 a IPv4 el prefijo pierde los 96 bits de delante', () => {
    expect(redComparable('::1')).toEqual({
      direccion: '127.0.0.1',
      familia: 'ipv4',
      prefijo: null,
    });
    expect(redComparable('::1/128')).toEqual({
      direccion: '127.0.0.1',
      familia: 'ipv4',
      prefijo: 32,
    });
    expect(redComparable('::ffff:192.0.2.0/120')).toEqual({
      direccion: '192.0.2.0',
      familia: 'ipv4',
      prefijo: 24,
    });
  });

  it('una red que no cabe en la traducción se queda en IPv6, sin agrandarse', () => {
    expect(redComparable('::1/100')).toEqual({ direccion: '::1', familia: 'ipv6', prefijo: 100 });
    expect(redComparable('::ffff:192.0.2.0/64')).toEqual({
      direccion: '::ffff:192.0.2.0',
      familia: 'ipv6',
      prefijo: 64,
    });
  });

  it('lo ilegible no es una red', () => {
    for (const mala of [
      'basura',
      '192.0.2.0/33',
      '::1/129',
      '192.0.2.0/',
      '192.0.2.0/a',
      '1/2/3',
    ]) {
      expect(redComparable(mala), mala).toBeNull();
    }
    // Una IPv6 que empieza por `::ffff:` sin ser IPv4 mapeada: ilegible
    // después de quitar el prefijo, como lo era para la regla anterior.
    expect(redComparable('::ffff:abcd')).toBeNull();
  });
});
