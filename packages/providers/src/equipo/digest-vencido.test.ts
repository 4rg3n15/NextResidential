import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { ClienteDeEquipo } from './cliente';
import { EscuchaDeAlertStream } from './escucha-alertstream';
import { rutaPara } from './catalogo-de-rutas';
import { Videoportero } from '../videoportero/videoportero';
import { comoErrorNeutral } from './errores-del-fabricante';
import { CredencialRechazada, DesafioVencido } from '../nucleo/errores';
import { servidorDigest } from '../simulacion/servidor-digest';
import type { PoliticaDeNonce } from '../simulacion/servidor-digest';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-12 · EL NONCE VENCE Y NADIE LO CONFUNDE CON LA CLAVE
 *
 * En sitio, el 26/09/2026, la PRIMERA orden a la terminal y al videoportero
 * tras arrancar la API fue aceptada; la SIGUIENTE, 9-35 s después, se rechazó
 * como «usuario o clave» en los dos. Aquí se ejecuta cada tipo de petición
 * —órdenes, sondeos y suscripciones— contra un servidor Digest que vence el
 * nonce y lleva la cuenta de `nc`, como un equipo estricto.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const USUARIO = 'servicio';
const CLAVE = 'clave-de-prueba';
const OK_XML =
  '<ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString><subStatusCode>ok</subStatusCode></ResponseStatus>';

const relojManual = (): { ahora: () => number; avanzar: (ms: number) => void } => {
  let t = 1_000_000;
  return { ahora: () => t, avanzar: (ms) => (t += ms) };
};

const bitacoraQueGuarda = (): Bitacora & { lineas: { nivel: string; mensaje: string }[] } => {
  const lineas: { nivel: string; mensaje: string }[] = [];
  return { lineas, registrar: (nivel, mensaje) => lineas.push({ nivel, mensaje }) };
};

const equipo = (politica: PoliticaDeNonce, clave = CLAVE) =>
  servidorDigest({
    usuario: USUARIO,
    clave,
    politica,
    atender: async (entrada) => {
      const ruta = new URL(String(entrada)).pathname;
      if (/subscribeEvent|alertStream/.test(ruta)) {
        const bloque = JSON.stringify({
          eventType: 'AccessControllerEvent',
          AccessControllerEvent: { employeeNoString: 'p1', currentEvent: true },
        });
        return new Response(bloque, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(OK_XML, { status: 200 });
    },
  });

const conexion = (peticion: typeof fetch, traza?: Bitacora) => ({
  host: 'equipo.invalid',
  usuario: USUARIO,
  clave: CLAVE,
  peticion,
  ...(traza === undefined ? {} : { traza }),
});

describe('H-SITIO-12 · órdenes: la segunda orden, con el nonce vencido, se acepta', () => {
  it('el patrón de sitio: aceptada, 9-35 s después otra vez aceptada, sin «usuario o clave»', async () => {
    const reloj = relojManual();
    const { peticion, estadisticas } = equipo({ vigenciaMs: 5_000, ahora: reloj.ahora });
    const portero = new Videoportero({ ...conexion(peticion), numeroDePuerta: 1 });

    expect((await portero.abrir('vp-1', 'operador-1')).aceptado).toBe(true);
    reloj.avanzar(9_000);
    expect((await portero.abrir('vp-1', 'operador-1')).aceptado).toBe(true);
    reloj.avanzar(35_000);
    expect((await portero.abrir('vp-1', 'operador-1')).aceptado).toBe(true);

    const e = estadisticas();
    expect(e.atendidas).toBe(3);
    // Dos vencimientos, cada uno seguido de un saludo limpio (E1-b, 15-M): el
    // nonce rechazado se descarta y se negocia otro desde cero. Nunca la clave.
    expect(e.desafios).toEqual({ primero: 3, vencido: 2, repetido: 0, clave: 0 });
  });

  it('dos clientes del MISMO equipo comparten el nonce y no repiten `nc`', async () => {
    // El equipo da el mismo nonce a todo el que llega mientras esté vigente.
    // Con una sesión por cliente, el segundo reenviaba `nc=00000001` ya usado
    // y el equipo lo rechazaba; reiniciar el contador lo repetía otra vez.
    const { peticion, estadisticas } = equipo({ reutilizaNonceVigente: true });
    const sondeo = new ClienteDeEquipo(conexion(peticion));
    const orden = new ClienteDeEquipo(conexion(peticion));
    const ruta = rutaPara('abrir la puerta del videoportero', 'videoportero', 1);

    expect((await sondeo.pedir('GET', '/ISAPI/System/deviceInfo')).ok).toBe(true);
    expect(
      (await orden.pedir(ruta.metodo, ruta.ruta, { tipo: 'application/xml', contenido: '<x/>' }))
        .ok,
    ).toBe(true);
    expect((await sondeo.pedir('GET', '/ISAPI/System/deviceInfo')).ok).toBe(true);

    expect(estadisticas().desafios).toEqual({ primero: 1, vencido: 0, repetido: 0, clave: 0 });
  });

  it('una clave errónea: UN reintento, nunca más, y se lee como credencial', async () => {
    const { peticion, estadisticas } = equipo({}, 'otra-clave');
    const portero = new Videoportero({ ...conexion(peticion), numeroDePuerta: 1 });
    await expect(portero.abrir('vp-1', 'operador-1')).rejects.toBeInstanceOf(CredencialRechazada);
    const e = estadisticas();
    expect(e.desafios.primero + e.desafios.clave).toBe(2);
    expect(e.atendidas).toBe(0);
  });
});

describe('H-SITIO-12 · sondeos: cada lectura renegocia sola', () => {
  it('con el nonce vencido por USOS, las lecturas siguen entrando', async () => {
    const { peticion, estadisticas } = equipo({ usosMaximos: 2 });
    const cliente = new ClienteDeEquipo(conexion(peticion));
    for (let i = 0; i < 5; i += 1) {
      expect((await cliente.pedir('GET', '/ISAPI/System/deviceInfo')).ok).toBe(true);
    }
    expect(estadisticas().atendidas).toBe(5);
    expect(estadisticas().desafios.clave).toBe(0);
  });
});

describe('H-SITIO-12 · suscripciones: la escucha re-arma con un nonce vencido', () => {
  it('cada reconexión renegocia y entrega el evento en vivo', async () => {
    const reloj = relojManual();
    const { peticion, estadisticas } = equipo({ vigenciaMs: 1_000, ahora: reloj.ahora });
    const escucha = new EscuchaDeAlertStream({
      ...conexion(peticion),
      dispositivoId: 'terminal-1',
      familia: 'terminal',
      transporte: 'subscribeEvent',
      esperar: async () => reloj.avanzar(5_000),
      azar: () => 0.5,
    });
    const control = new AbortController();
    const recibidos: string[] = [];
    for await (const evento of escucha.escuchar(control.signal)) {
      recibidos.push(evento.personaId ?? '?');
      if (recibidos.length === 3) control.abort();
    }
    expect(recibidos).toEqual(['p1', 'p1', 'p1']);
    const e = estadisticas();
    expect(e.atendidas).toBe(3);
    expect(e.desafios.clave).toBe(0);
    expect(e.desafios.vencido).toBe(2);
  });
});

describe('H-SITIO-12 · stale=true distinguido de la clave', () => {
  it('dos vencimientos seguidos NO son CredencialRechazada: son DesafioVencido', () => {
    const vencido = comoErrorNeutral('vp-1', '', 401, { desafioVencido: true });
    expect(vencido).toBeInstanceOf(DesafioVencido);
    expect(vencido.message).toMatch(/no es la clave/i);
    expect(comoErrorNeutral('vp-1', '', 401)).toBeInstanceOf(CredencialRechazada);
  });

  it('el cliente lo marca en la respuesta cuando el segundo 401 trae stale=true', async () => {
    let n = 0;
    const siempreVencido = (async () => {
      n += 1;
      return new Response('', {
        status: 401,
        headers: {
          'www-authenticate': `Digest realm="r", nonce="n${String(n)}", qop="auth", stale="${n > 1 ? 'TRUE' : 'FALSE'}"`,
        },
      });
    }) as typeof fetch;
    const traza = bitacoraQueGuarda();
    const r = await new ClienteDeEquipo(conexion(siempreVencido, traza)).pedir('GET', '/x');
    expect(r.estado).toBe(401);
    expect(r.desafioVencido).toBe(true);
    expect(n).toBe(2);
    expect(traza.lineas.some((l) => /NO es la clave/.test(l.mensaje))).toBe(true);
  });

  it('la renegociación por nonce vencido queda en la bitácora', async () => {
    const reloj = relojManual();
    const { peticion } = equipo({ vigenciaMs: 1_000, ahora: reloj.ahora });
    const traza = bitacoraQueGuarda();
    const cliente = new ClienteDeEquipo(conexion(peticion, traza));
    await cliente.pedir('GET', '/ISAPI/System/deviceInfo');
    reloj.avanzar(2_000);
    await cliente.pedir('GET', '/ISAPI/System/deviceInfo');
    expect(
      traza.lineas.filter((l) => l.mensaje === 'Digest renegociado con el equipo'),
    ).toHaveLength(2);
  });
});
