import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { servidorDigest } from './servidor-digest';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-K · EL SERVIDOR DIGEST SIMULADO, TAN ESTRICTO COMO DICE (H-SITIO-12)
 *
 * Es la vara con la que se mide el cliente: si él mismo dejara pasar una
 * autorización que un equipo rechaza, las pruebas de H-SITIO-12 serían verdes
 * por el motivo equivocado. Se prueba lo que ningún cliente correcto le envía.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const md5 = (t: string): string => createHash('md5').update(t, 'utf8').digest('hex');
const valorDe = (cabecera: string, nombre: string): string =>
  new RegExp(`${nombre}="([^"]+)"`).exec(cabecera)?.[1] ?? '';

const servidor = () =>
  servidorDigest({
    usuario: 'servicio',
    clave: 'k',
    atender: async () => new Response('ok', { status: 200 }),
  });

describe('15-K · servidorDigest', () => {
  it('sin cabeceras ni método, desafía como a un GET: primer contacto', async () => {
    const s = servidor();
    const r = await s.peticion('http://equipo.invalid/a');
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toMatch(/stale="FALSE"/);
    expect(s.estadisticas().desafios.primero).toBe(1);
  });

  it('una autorización Basic no es Digest: se desafía, no se atiende', async () => {
    const s = servidor();
    const r = await s.peticion('http://equipo.invalid/a', {
      headers: { authorization: 'Basic c2VydmljaW86aw==' },
    });
    expect(r.status).toBe(401);
    expect(s.estadisticas().atendidas).toBe(0);
  });

  it('un resumen bueno con un nc ilegible es un nc repetido, no una clave mala', async () => {
    const s = servidor();
    const reto =
      (await s.peticion('http://equipo.invalid/a')).headers.get('www-authenticate') ?? '';
    const nonce = valorDe(reto, 'nonce');
    const reino = valorDe(reto, 'realm');
    const nc = 'zz';
    const cnonce = 'c1';
    const ha1 = md5(`servicio:${reino}:k`);
    const ha2 = md5('GET:/a');
    const respuesta = md5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`);
    const r = await s.peticion('http://equipo.invalid/a', {
      method: 'GET',
      headers: {
        authorization:
          `Digest username="servicio", realm="${reino}", nonce="${nonce}", uri="/a", ` +
          `qop=auth, nc=${nc}, cnonce="${cnonce}", response="${respuesta}"`,
      },
    });
    expect(r.status).toBe(401);
    expect(s.estadisticas().desafios.repetido).toBe(1);
    expect(s.estadisticas().desafios.clave).toBe(0);
  });

  it('una autorización Digest sin campos es una clave mala, no un nonce vencido', async () => {
    const s = servidor();
    const r = await s.peticion('http://equipo.invalid/a', {
      headers: { authorization: 'Digest username="servicio"' },
    });
    expect(r.status).toBe(401);
    expect(s.estadisticas().desafios.clave).toBe(1);
  });
});
