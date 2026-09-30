import { describe, expect, it } from 'vitest';
import { OFERTA_SDP_DE_NAVEGADOR } from '@ncr/providers';
import { motivoDeOfertaInvalida } from './oferta-sdp';

describe('V1 (15-N) · la validación propia de la oferta SDP', () => {
  it('la oferta de un navegador, con su CRLF final, es aceptable', () => {
    expect(motivoDeOfertaInvalida(OFERTA_SDP_DE_NAVEGADOR)).toBeNull();
  });

  it('lo que no es una cadena, o no empieza por v=0, se rechaza', () => {
    expect(motivoDeOfertaInvalida(undefined)).toMatch(/v=0/);
    expect(motivoDeOfertaInvalida({ sdp: 'v=0' })).toMatch(/v=0/);
    expect(motivoDeOfertaInvalida('o=- 0 0 IN IP4 127.0.0.1\r\n')).toMatch(/v=0/);
  });

  it('un NUL o un escape dentro de la oferta la rechazan: no se «limpian»', () => {
    expect(motivoDeOfertaInvalida('v=0\r\ns=\u0000\r\n')).toMatch(/control/);
    expect(motivoDeOfertaInvalida('v=0\r\ns=\u001b[2J\r\n')).toMatch(/control/);
  });
});
