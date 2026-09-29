import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { ClienteDeEquipo, VENTANA_DE_CREDENCIAL_RECHAZADA_MS } from './cliente';
import { EscuchaDeAlertStream } from './escucha-alertstream';
import { comoErrorNeutral } from './errores-del-fabricante';
import { CredencialRechazada, SinDesafioDigest } from '../nucleo/errores';
import { servidorDigest } from '../simulacion/servidor-digest';
import type { PoliticaDeNonce } from '../simulacion/servidor-digest';
import { diagnosticarEquipo } from '../diagnostico/diagnostico-de-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E1 (15-M) · EL 401 AL NONCE GUARDADO NUNCA ES LA CLAVE
 *
 * La evidencia del 28/09: la terminal y el videoportero contestaban `401` a
 * las peticiones que reutilizaban el nonce de la escucha larga —sin
 * `WWW-Authenticate`, o con `stale="false"`— y la plataforma lo leía como
 * «usuario o clave» y dejaba de hablarles 30 min. Los cuatro simuladores que
 * pide el encargo, y sólo el cuarto termina en «credencial rechazada».
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

const bitacora = (): Bitacora & { lineas: { nivel: string; mensaje: string }[] } => {
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
      if (/deviceInfo/.test(ruta)) {
        return new Response(
          '<DeviceInfo><model>DS-K1T344MBFWX-E1</model><firmwareVersion>V4.61.0</firmwareVersion>' +
            '<serialNumber>SIM</serialNumber></DeviceInfo>',
          { status: 200 },
        );
      }
      return new Response(OK_XML, { status: 200 });
    },
  });

const cliente = (
  peticion: typeof fetch,
  traza: Bitacora,
  ahora: () => number,
  extra: { readonly sesionPropia?: boolean } = {},
) =>
  new ClienteDeEquipo({
    host: 'terminal.invalid',
    usuario: USUARIO,
    clave: CLAVE,
    peticion,
    traza,
    ahora,
    dispositivoId: 'terminal-1',
    ...extra,
  });

const nuncaCredencial = (traza: { lineas: { mensaje: string }[] }): void => {
  expect(traza.lineas.some((l) => /rechazó usuario o clave|BLOQUEADA/.test(l.mensaje))).toBe(false);
};

describe('E1 · caso 1: el equipo rota el nonce con la escucha abierta', () => {
  it('la orden que viajó con el nonce viejo se renegocia limpia: aceptada, nunca «clave»', async () => {
    const reloj = relojManual();
    const traza = bitacora();
    // El equipo invalida el nonce anterior cada vez que emite uno nuevo.
    const e = equipo({ ahora: reloj.ahora });
    const ordenes = cliente(e.peticion, traza, reloj.ahora);
    expect((await ordenes.pedir('GET', '/ISAPI/System/deviceInfo')).ok).toBe(true);

    // La escucha (sesión PROPIA) abre su conexión y negocia OTRO nonce.
    const escucha = cliente(e.peticion, traza, reloj.ahora, { sesionPropia: true });
    const flujo = await escucha.abrirFlujoDeEventos('/ISAPI/Event/notification/alertStream');
    expect(flujo.estado).toBe(200);

    // La orden siguiente viaja con el nonce guardado —ya inválido— y aun así entra.
    const r = await ordenes.pedir('GET', '/ISAPI/System/deviceInfo');
    expect(r.ok).toBe(true);
    expect(e.estadisticas().desafios.clave).toBe(0);
    expect(e.estadisticas().atendidas).toBe(3);
    nuncaCredencial(traza);
    expect(traza.lineas.some((l) => /nonce guardado: se descarta/.test(l.mensaje))).toBe(true);
  });
});

describe('E1 · caso 2: 401 SIN WWW-Authenticate al nonce caducado (la terminal del 28/09)', () => {
  it('se descarta el nonce y UN intercambio limpio entra; ningún «usuario o clave»', async () => {
    const reloj = relojManual();
    const traza = bitacora();
    const e = equipo({ vigenciaMs: 5_000, alVencer: 'sin_desafio', ahora: reloj.ahora });
    const c = cliente(e.peticion, traza, reloj.ahora);
    expect((await c.pedir('GET', '/ISAPI/System/deviceInfo')).ok).toBe(true);
    reloj.avanzar(9_000);
    const r = await c.pedir('GET', '/ISAPI/System/deviceInfo');
    expect(r.ok).toBe(true);
    expect(r.sinDesafio).toBeUndefined();
    const d = e.estadisticas().desafios;
    expect(d.clave).toBe(0);
    // Un saludo limpio por nonce nuevo: el vencido no cuenta como clave.
    expect(d.vencido).toBe(1);
    expect(e.estadisticas().atendidas).toBe(2);
    nuncaCredencial(traza);
  });
});

describe('E1 · caso 3: stale="false" al nonce caducado (el videoportero del 28/09)', () => {
  it('tampoco es la clave: intercambio limpio y aceptada', async () => {
    const reloj = relojManual();
    const traza = bitacora();
    const e = equipo({ vigenciaMs: 5_000, alVencer: 'stale_false', ahora: reloj.ahora });
    const c = cliente(e.peticion, traza, reloj.ahora);
    expect((await c.pedir('GET', '/ISAPI/System/deviceInfo')).ok).toBe(true);
    reloj.avanzar(35_000);
    expect((await c.pedir('GET', '/ISAPI/System/deviceInfo')).ok).toBe(true);
    reloj.avanzar(35_000);
    expect((await c.pedir('GET', '/ISAPI/System/deviceInfo')).ok).toBe(true);
    expect(e.estadisticas().desafios.clave).toBe(0);
    expect(e.estadisticas().atendidas).toBe(3);
    nuncaCredencial(traza);
  });
});

describe('E1 · caso 4: la clave ES errónea', () => {
  it('UN intento autenticado, «credencial rechazada», y ni un viaje más en la ventana', async () => {
    const reloj = relojManual();
    const traza = bitacora();
    const e = equipo({ ahora: reloj.ahora }, 'otra-clave');
    const c = cliente(e.peticion, traza, reloj.ahora);
    const r = await c.pedir('GET', '/ISAPI/System/deviceInfo');
    expect(r.estado).toBe(401);
    expect(r.sinDesafio).toBeUndefined();
    expect(r.desafioVencido).toBeUndefined();
    expect(e.estadisticas().desafios).toEqual({ primero: 1, vencido: 0, repetido: 0, clave: 1 });
    const error = comoErrorNeutral('terminal-1', r.cuerpo, r.estado, r);
    expect(error).toBeInstanceOf(CredencialRechazada);
    expect(error.message).toMatch(/acaba de rechazar/);

    // (d) · en la ventana no se presenta: sin red, y el mensaje dice cuánto hace.
    reloj.avanzar(5 * 60_000);
    await expect(c.pedir('GET', '/ISAPI/System/deviceInfo')).rejects.toMatchObject({
      name: 'CredencialRechazada',
      rechazadaHaceMs: 5 * 60_000,
    });
    await expect(c.pedir('GET', '/ISAPI/System/deviceInfo')).rejects.toThrow(/hace 5 min/);
    expect(e.estadisticas().desafios.clave).toBe(1);

    // (e) · «Probar conexión» borra la marca: se presenta UNA vez más.
    c.olvidarRechazo();
    await c.pedir('GET', '/ISAPI/System/deviceInfo');
    expect(e.estadisticas().desafios.clave).toBe(2);
  });

  it('(f) · el equipo declara la cuenta bloqueada: el error lo dice con el tiempo que queda', async () => {
    const reloj = relojManual();
    const traza = bitacora();
    const e = equipo({ ahora: reloj.ahora, bloqueaPorSegundos: 1800 }, 'otra-clave');
    const c = cliente(e.peticion, traza, reloj.ahora);
    const r = await c.pedir('GET', '/ISAPI/System/deviceInfo');
    const error = comoErrorNeutral('terminal-1', r.cuerpo, r.estado, r);
    expect(error).toBeInstanceOf(CredencialRechazada);
    expect(error.message).toMatch(/BLOQUEADA: se desbloquea en 1800 s/);
    expect(traza.lineas.some((l) => /cuenta BLOQUEADA/.test(l.mensaje))).toBe(true);
    // Y la marca dura lo que el equipo dijo: 20 min después sigue sin presentarse…
    reloj.avanzar(20 * 60_000);
    await expect(c.pedir('GET', '/ISAPI/System/deviceInfo')).rejects.toThrow(
      /se desbloquea en 600 s/,
    );
    // …y al pasar el bloqueo, vuelve a intentarlo.
    reloj.avanzar(11 * 60_000);
    await c.pedir('GET', '/ISAPI/System/deviceInfo');
    expect(e.estadisticas().desafios.clave).toBe(2);
  });

  it('la ventana de A5 sigue valiendo cuando el equipo no declara bloqueo', async () => {
    const reloj = relojManual();
    const e = equipo({ ahora: reloj.ahora }, 'otra-clave');
    const c = cliente(e.peticion, bitacora(), reloj.ahora);
    await c.pedir('GET', '/ISAPI/System/deviceInfo');
    reloj.avanzar(VENTANA_DE_CREDENCIAL_RECHAZADA_MS - 1);
    await expect(c.pedir('GET', '/ISAPI/System/deviceInfo')).rejects.toBeInstanceOf(
      CredencialRechazada,
    );
    reloj.avanzar(2);
    await c.pedir('GET', '/ISAPI/System/deviceInfo');
    expect(e.estadisticas().desafios.clave).toBe(2);
  });
});

describe('E1 · la marca es del equipo; el desafío, de cada conexión', () => {
  it('la escucha (sesión propia) NO presenta una clave que las órdenes ya vieron rechazada', async () => {
    const reloj = relojManual();
    const e = equipo({ ahora: reloj.ahora }, 'otra-clave');
    const ordenes = cliente(e.peticion, bitacora(), reloj.ahora);
    await ordenes.pedir('GET', '/ISAPI/System/deviceInfo');
    const escucha = cliente(e.peticion, bitacora(), reloj.ahora, { sesionPropia: true });
    await expect(
      escucha.abrirFlujoDeEventos('/ISAPI/Event/notification/alertStream'),
    ).rejects.toBeInstanceOf(CredencialRechazada);
    expect(e.estadisticas().desafios.clave).toBe(1);
  });

  it('un 401 sin desafío a la petición SIN credencial no es la clave: `sinDesafio`, reintentable', async () => {
    const traza = bitacora();
    let llamadas = 0;
    const c = cliente(
      (async () => {
        llamadas += 1;
        return new Response('<userCheck><statusValue>401</statusValue></userCheck>', {
          status: 401,
        });
      }) as typeof fetch,
      traza,
      () => 0,
    );
    const r = await c.pedir('GET', '/ISAPI/System/deviceInfo');
    expect(r.estado).toBe(401);
    expect(r.sinDesafio).toBe(true);
    expect(llamadas).toBe(1);
    const error = comoErrorNeutral('terminal-1', r.cuerpo, r.estado, r);
    expect(error).toBeInstanceOf(SinDesafioDigest);
    expect(error.reintentable).toBe(true);
    // Y la siguiente petición vuelve a intentarlo: no quedó marca.
    await c.pedir('GET', '/ISAPI/System/deviceInfo');
    expect(llamadas).toBe(2);
  });
});

describe('E1 · la escucha y el sondeo, con el mismo criterio', () => {
  it('la escucha con stale="false" al reconectar sigue viva y nunca lanza CredencialRechazada', async () => {
    const reloj = relojManual();
    const traza = bitacora();
    const e = equipo({ vigenciaMs: 1_000, alVencer: 'stale_false', ahora: reloj.ahora });
    const escucha = new EscuchaDeAlertStream({
      host: 'terminal.invalid',
      usuario: USUARIO,
      clave: CLAVE,
      peticion: e.peticion,
      traza,
      ahora: reloj.ahora,
      dispositivoId: 'terminal-1',
      familia: 'terminal',
      transporte: 'alertStream',
      esperar: async () => reloj.avanzar(5_000),
      azar: () => 0.5,
    });
    const control = new AbortController();
    let conexiones = 0;
    for await (const parte of escucha.escuchar(control.signal)) {
      void parte;
      conexiones += 1;
      if (conexiones >= 3) control.abort();
    }
    expect(e.estadisticas().desafios.clave).toBe(0);
    expect(traza.lineas.some((l) => /credencial|usuario o clave/i.test(l.mensaje))).toBe(false);
  });

  it('«Probar conexión» (olvidarRechazo) presenta la clave otra vez y la ficha dice «acaba de»', async () => {
    const reloj = relojManual();
    const e = equipo({ ahora: reloj.ahora }, 'otra-clave');
    const base = {
      host: 'terminal.invalid',
      usuario: USUARIO,
      clave: CLAVE,
      peticion: e.peticion,
      ahora: reloj.ahora,
      familia: 'terminal' as const,
    };
    const primero = await diagnosticarEquipo({ ...base, olvidarRechazo: true });
    expect(primero.contacto.clase).toBe('credencial');
    expect(primero.contacto.detalle).toMatch(/acaba de rechazar/);
    reloj.avanzar(3 * 60_000);
    // El sondeo periódico no la presenta y lo dice con el tiempo.
    const periodico = await diagnosticarEquipo(base);
    expect(periodico.contacto.clase).toBe('credencial');
    expect(periodico.contacto.detalle).toMatch(/hace 3 min/);
    expect(e.estadisticas().desafios.clave).toBe(1);
    // La persona pulsa el botón: UN intento más.
    await diagnosticarEquipo({ ...base, olvidarRechazo: true });
    expect(e.estadisticas().desafios.clave).toBe(2);
  });
});
