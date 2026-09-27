import { describe, expect, it } from 'vitest';
import { ipDelCliente, proxiesDeConfianza } from '../../ip-del-cliente.mjs';

/**
 * H6 (15-L) · la IP con la que la consola presenta a su cliente ante la API.
 * `next start` conserva la `X-Forwarded-For` que mande el navegador; el
 * arranque propio (`servidor.mjs`) la sustituye por ésta.
 */
describe('la IP del cliente de la consola es la de su socket', () => {
  const ninguno = proxiesDeConfianza(undefined);

  it('sin proxy delante, una X-Forwarded-For del navegador se IGNORA', () => {
    expect(ipDelCliente('192.0.2.50', '198.51.100.7', ninguno)).toBe('192.0.2.50');
    expect(ipDelCliente('::ffff:192.0.2.50', undefined, ninguno)).toBe('192.0.2.50');
    expect(ipDelCliente('2001:db8::5', '192.0.2.1', ninguno)).toBe('2001:db8::5');
  });

  it('detrás de un proxy DECLARADO, la primera IP de lo que ese proxy trae', () => {
    const balanceador = proxiesDeConfianza(' 198.51.100.250 , ::ffff:198.51.100.251 ');
    expect([...balanceador]).toEqual(['198.51.100.250', '198.51.100.251']);
    expect(ipDelCliente('198.51.100.250', '192.0.2.9, 198.51.100.250', balanceador)).toBe(
      '192.0.2.9',
    );
    expect(ipDelCliente('::ffff:198.51.100.251', ['192.0.2.8'], balanceador)).toBe('192.0.2.8');
    // Si el proxy no trae nada, el proxy es el cliente.
    expect(ipDelCliente('198.51.100.250', '', balanceador)).toBe('198.51.100.250');
    // Otro socket que no es el proxy: su propia cabecera no cuenta.
    expect(ipDelCliente('192.0.2.66', '198.51.100.250', balanceador)).toBe('192.0.2.66');
  });
});
