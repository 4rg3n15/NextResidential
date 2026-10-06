import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { aperturaDeVerificacion } from './apertura-de-verificacion';
import { aperturasFisicasPor, equiposSimulados } from '../simulacion/equipo-simulado';

/**
 * Anexo 15-K · `--abrir`. La verificación de la próxima visita tiene que
 * reproducir lo demostrado en sitio y decir en qué se aparta, sin adornos.
 */
const USUARIO = 'servicio';
const CLAVE = 'clave-de-prueba';
const TIPO = 'application/x-www-form-urlencoded; charset=UTF-8';

const conexion = (host: string, peticion: typeof fetch) => ({
  host,
  usuario: USUARIO,
  clave: CLAVE,
  peticion,
});

describe('anexo 15-K · aperturaDeVerificacion (--abrir)', () => {
  it.each(['terminal', 'videoportero'] as const)(
    '%s: 401 → 200, el cuerpo y el Content-Type en las dos, statusCode 1, y la puerta se mueve',
    async (familia) => {
      const host = `${familia}-abrir.simulado.invalid`;
      const peticion = equiposSimulados({
        [host]: { familia, usuario: USUARIO, clave: CLAVE, aperturaRemota: true },
      });
      const antes = aperturasFisicasPor.get(host) ?? 0;
      const r = await aperturaDeVerificacion(conexion(host, peticion), familia, 1);

      expect(r).toMatchObject({
        aceptada: true,
        statusCode: 1,
        subStatusCode: 'ok',
        error: null,
        desviaciones: [],
      });
      expect(r.peticiones.map((p) => [p.metodo, p.estado, p.conCredencial])).toEqual([
        ['PUT', 401, false],
        ['PUT', 200, true],
      ]);
      for (const p of r.peticiones) {
        expect(p.ruta).toBe('/ISAPI/AccessControl/RemoteControl/door/1');
        expect(p.tipo).toBe(TIPO);
        expect(p.cuerpo).toContain('xmlns="http://www.isapi.org/ver20/XMLSchema" version="2.0"');
      }
      expect(aperturasFisicasPor.get(host)).toBe(antes + 1);
    },
  );

  it('un equipo que contesta 200 sin desafío ni subStatusCode: NO aceptada, y se dice por qué', async () => {
    const peticion = (async () =>
      new Response('<ResponseStatus><statusCode>1</statusCode></ResponseStatus>', {
        status: 200,
      })) as typeof fetch;
    const r = await aperturaDeVerificacion(conexion('sin-digest.invalid', peticion), 'terminal', 1);
    expect(r.aceptada).toBe(false);
    expect(r.error).toMatch(/subStatusCode/);
    expect(r.desviaciones.join(' | ')).toMatch(/no recibió el desafío Digest \(HTTP 200\)/);
    expect(r.desviaciones.join(' | ')).toMatch(/la secuencia fue 200, no 401 → 200/);
  });

  it('un equipo inalcanzable: NO aceptada, sin peticiones y con la secuencia vacía dicha', async () => {
    const peticion = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const r = await aperturaDeVerificacion(conexion('caido.invalid', peticion), 'videoportero', 1);
    expect(r.aceptada).toBe(false);
    expect(r.error).toMatch(/inalcanzable/);
    expect(r.peticiones).toEqual([]);
    expect(r.desviaciones).toContain('la secuencia fue vacía, no 401 → 200');
  });

  it('si al equipo le llega el cuerpo vacío (400 badXmlContent) se señala como H-SITIO-15', async () => {
    // Algo entre el guion y el equipo «pierde» el cuerpo de la primera: el
    // equipo contesta 400 antes de autenticar, que es lo que se vio con curl.
    const host = 'terminal-vacia.simulado.invalid';
    const simulado = equiposSimulados({
      [host]: { familia: 'terminal', usuario: USUARIO, clave: CLAVE },
    });
    let n = 0;
    const peticion = ((url: string | URL, opciones?: RequestInit) =>
      simulado(url, n++ === 0 ? { ...opciones, body: null } : opciones)) as typeof fetch;
    const r = await aperturaDeVerificacion(conexion(host, peticion), 'terminal', 1);
    expect(r.aceptada).toBe(false);
    expect(r.peticiones[0]?.estado).toBe(400);
    expect(r.desviaciones.join(' | ')).toMatch(/H-SITIO-15/);
  });

  it('una respuesta que no se deja leer queda anotada como tal, y la orden no se da por aceptada', async () => {
    const peticion = (async () =>
      ({
        status: 200,
        ok: true,
        headers: new Headers(),
        body: null,
        text: () => Promise.reject(new Error('flujo cortado')),
      }) as unknown as Response) as typeof fetch;
    const r = await aperturaDeVerificacion(conexion('cortado.invalid', peticion), 'terminal', 1);
    expect(r.aceptada).toBe(false);
    expect(r.error).not.toBeNull();
    expect(r.peticiones[0]?.recibido).toBe('(no se pudo leer)');
    expect(r.statusCode).toBeNull();
  });

  it('un equipo que rechaza la orden con su código ISAPI: el error lo dice y nada se da por bueno', async () => {
    let n = 0;
    const peticion = (async () =>
      n++ === 0
        ? new Response('', {
            status: 401,
            headers: { 'www-authenticate': 'Digest realm="r", nonce="n1", qop="auth"' },
          })
        : new Response(
            '<ResponseStatus><statusCode>4</statusCode><subStatusCode>deviceBusy</subStatusCode>' +
              '<errorCode>1073741826</errorCode></ResponseStatus>',
            { status: 403 },
          )) as typeof fetch;
    const r = await aperturaDeVerificacion(
      conexion('ocupado.invalid', peticion),
      'videoportero',
      1,
    );
    expect(r.aceptada).toBe(false);
    expect(r.statusCode).toBe(4);
    expect(r.subStatusCode).toBe('deviceBusy');
    expect(r.desviaciones.join(' | ')).toMatch(/401 → 403/);
  });

  it('sin transporte inyectado usa el `fetch` de la plataforma: el del guion delante del equipo', async () => {
    // Un equipo mínimo por HTTP de verdad, en el bucle local: desafío y orden.
    const recibidos: string[] = [];
    const servidor = createServer((peticion, respuesta) => {
      let cuerpo = '';
      peticion.on('data', (t: Buffer) => (cuerpo += t.toString('utf8')));
      peticion.on('end', () => {
        recibidos.push(cuerpo);
        if (peticion.headers.authorization === undefined) {
          respuesta.writeHead(401, {
            'www-authenticate': 'Digest realm="r", nonce="n1", qop="auth"',
          });
          respuesta.end();
          return;
        }
        respuesta.writeHead(200, { 'content-type': 'application/xml' });
        respuesta.end(
          '<ResponseStatus><statusCode>1</statusCode><subStatusCode>ok</subStatusCode></ResponseStatus>',
        );
      });
    });
    await new Promise<void>((listo) => servidor.listen(0, 'localhost', listo));
    try {
      const { port } = servidor.address() as AddressInfo;
      const r = await aperturaDeVerificacion(
        { host: 'localhost', puerto: port, protocolo: 'http', usuario: USUARIO, clave: CLAVE },
        'terminal',
        1,
      );
      expect(r).toMatchObject({ aceptada: true, statusCode: 1, desviaciones: [] });
      expect(recibidos).toHaveLength(2);
      for (const c of recibidos) expect(c).toContain('version="2.0"');
    } finally {
      await new Promise((listo) => servidor.close(listo));
    }
  });
});
