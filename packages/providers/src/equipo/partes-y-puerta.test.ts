import { describe, expect, it } from 'vitest';
import { LectorMultipart, boundaryDe } from './partes-del-flujo';
import { AperturaNoSoportada, abrirPuertaRemota } from './puerta-remota';
import { ClienteDeEquipo } from './cliente';
import { rutaPara } from './catalogo-de-rutas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-K · LOS BORDES DEL FLUJO MULTIPART (H-SITIO-14) Y DE LA PUERTA REMOTA
 * (H-SITIO-13)
 *
 * Lo que un firmware distinto puede hacer y el equipo de la visita no hizo:
 * saltos de línea sin retorno de carro, partes sin tipo ni longitud, un
 * delimitador que llega en el trozo siguiente; y, en la puerta, un
 * `notSupport` o un código ISAPI en JSON en vez de XML.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const bytes = (texto: string): Uint8Array => new TextEncoder().encode(texto);
const texto = (b: Uint8Array): string => new TextDecoder().decode(b);

describe('15-K · boundaryDe', () => {
  it('lee el boundary con y sin comillas; sin multipart o sin boundary, null', () => {
    expect(boundaryDe('multipart/mixed; boundary="MIME"')).toBe('MIME');
    expect(boundaryDe('multipart/mixed; boundary=otro')).toBe('otro');
    expect(boundaryDe('multipart/mixed')).toBeNull();
    expect(boundaryDe('application/json')).toBeNull();
    expect(boundaryDe(null)).toBeNull();
  });
});

describe('15-K · LectorMultipart en los bordes', () => {
  it('cabeceras separadas sólo por LF y sin Content-Type: la parte llega, «desconocido»', () => {
    const lector = new LectorMultipart('B');
    const partes = lector.alimentar(bytes('--B\nContent-Length: 4\n\nhola\n--B--'));
    expect(partes).toHaveLength(1);
    expect(partes[0]?.tipo).toBe('desconocido');
    expect(texto(partes[0]?.bytes ?? new Uint8Array())).toBe('hola');
  });

  it('sin Content-Length espera al delimitador siguiente, aunque llegue en otro trozo', () => {
    const lector = new LectorMultipart('B');
    expect(lector.alimentar(bytes('--B\r\nContent-Type: application/json\r\n\r\n{"a":1}'))).toEqual(
      [],
    );
    expect(lector.pendientes).toBeGreaterThan(0);
    const partes = lector.alimentar(bytes('\r\n--B\r\n'));
    expect(partes).toHaveLength(1);
    expect(partes[0]?.tipo).toBe('application/json');
    expect(texto(partes[0]?.bytes ?? new Uint8Array())).toBe('{"a":1}');
  });

  it('cabeceras que aún no terminan: no inventa una parte', () => {
    const lector = new LectorMultipart('B');
    expect(lector.alimentar(bytes('--B\r\nContent-Type: image/jpeg\r\n'))).toEqual([]);
  });

  it('con LF y CRLF mezclados, manda el primer fin de cabeceras', () => {
    const lector = new LectorMultipart('B');
    const partes = lector.alimentar(
      bytes('--B\nContent-Type: text/plain\nContent-Length: 2\n\nok\r\n\r\n--B--'),
    );
    expect(texto(partes[0]?.bytes ?? new Uint8Array())).toBe('ok');
  });
});

const clienteQueContesta = (estado: number, cuerpo: string) =>
  new ClienteDeEquipo({
    host: `puerta-${String(Math.random()).slice(2)}.invalid`,
    usuario: 'servicio',
    clave: 'k',
    peticion: async () =>
      ({
        status: estado,
        ok: estado >= 200 && estado < 300,
        headers: new Headers(),
        text: async () => cuerpo,
        body: null,
      }) as unknown as Response,
  });

describe('15-K · la puerta remota fuera del camino feliz (H-SITIO-13)', () => {
  const ruta = rutaPara('abrir la puerta desde la plataforma', 'terminal', 1);

  it('notSupport es AperturaNoSoportada, que manda a capturar la ruta buena', async () => {
    const cliente = clienteQueContesta(
      200,
      '<ResponseStatus><statusCode>4</statusCode><subStatusCode>notSupport</subStatusCode></ResponseStatus>',
    );
    await expect(abrirPuertaRemota(cliente, ruta, 'terminal-1')).rejects.toBeInstanceOf(
      AperturaNoSoportada,
    );
  });

  it('el código ISAPI en JSON también decide: 1 es aceptada, 3 es rechazo', async () => {
    await expect(
      abrirPuertaRemota(
        clienteQueContesta(200, '{"statusCode":1,"subStatusCode":"ok"}'),
        ruta,
        'terminal-1',
      ),
    ).resolves.toMatchObject({ aceptado: true });
    await expect(
      abrirPuertaRemota(
        clienteQueContesta(200, '{"statusCode":3,"subStatusCode":"deviceError"}'),
        ruta,
        'terminal-1',
      ),
    ).rejects.toBeDefined();
  });
});
