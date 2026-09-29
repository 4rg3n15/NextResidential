import { describe, expect, it } from 'vitest';
import { ControlDeBarreraVehicular } from './control-barrera';
import { ClienteDeEquipo, VENTANA_DE_CREDENCIAL_RECHAZADA_MS } from '../equipo/cliente';
import { servidorDigest } from '../simulacion/servidor-digest';
import type { PoliticaDeNonce } from '../simulacion/servidor-digest';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * REGRESIÓN · LA CÁMARA DEL 28/09/2026, TAL COMO FUNCIONÓ
 *
 * La cámara LPR es la única ruta verificada con hardware: lectura → publicación
 * al servidor de alarma → decisión → relé 1 por `PUT …/barrierGate` con Digest.
 * La ETAPA 15-M toca el código Digest COMPARTIDO (E1) y esta suite existe para
 * que la cámara no cambie su comportamiento observable: se escribió ANTES del
 * cambio y sus aserciones no se tocan. Si un arreglo obliga a cambiarlas, es
 * un cambio de la ruta de la cámara y se reporta antes de hacerlo.
 *
 * El equipo es el servidor Digest de pruebas —el mismo cálculo de resumen que
 * el aparato— con el nonce que vence, como el de sitio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const USUARIO = 'servicio';
const CLAVE = 'clave-de-prueba';
const HOST = 'camara.invalid';
const OK_XML =
  '<?xml version="1.0" encoding="UTF-8"?><ResponseStatus><statusCode>1</statusCode>' +
  '<statusString>OK</statusString><subStatusCode>ok</subStatusCode></ResponseStatus>';
const IDENTIDAD =
  '<?xml version="1.0" encoding="UTF-8"?><DeviceInfo><model>DS-TCG405-E</model>' +
  '<firmwareVersion>V5.4.0</firmwareVersion><serialNumber>SIMULADA</serialNumber></DeviceInfo>';

const relojManual = (): { ahora: () => number; avanzar: (ms: number) => void } => {
  let t = 1_000_000;
  return { ahora: () => t, avanzar: (ms) => (t += ms) };
};

const camara = (politica: PoliticaDeNonce, clave = CLAVE) => {
  const ordenes: string[] = [];
  const servidor = servidorDigest({
    usuario: USUARIO,
    clave,
    reino: 'IP Camera(C1234)',
    politica,
    atender: async (entrada, init) => {
      const ruta = new URL(String(entrada)).pathname;
      if (/barrierGate/.test(ruta)) {
        ordenes.push(String(init?.body ?? ''));
        return new Response(OK_XML, { status: 200 });
      }
      if (/deviceInfo/.test(ruta)) return new Response(IDENTIDAD, { status: 200 });
      return new Response(OK_XML, { status: 200 });
    },
  });
  return { ...servidor, ordenes };
};

const barrera = (peticion: typeof fetch, ahora: () => number): ControlDeBarreraVehicular =>
  new ControlDeBarreraVehicular({ host: HOST, usuario: USUARIO, clave: CLAVE, peticion, ahora });

describe('regresión 28/09 · la orden a la barrera con Digest', () => {
  it('primera orden: 401 limpio → autenticada → aceptada, con el cuerpo capturado del equipo', async () => {
    const reloj = relojManual();
    const equipo = camara({ ahora: reloj.ahora });
    const r = await barrera(equipo.peticion, reloj.ahora).accionar('camara-entrada', true);
    expect(r.estado).toBe('aceptada');
    expect(r.estado === 'aceptada' && r.pasoFranqueadoObservable).toBe(false);
    expect(equipo.ordenes).toHaveLength(1);
    expect(equipo.ordenes[0]).toMatch(/<ctrlMode>open<\/ctrlMode>/);
    expect(equipo.estadisticas().desafios).toEqual({
      primero: 1,
      vencido: 0,
      repetido: 0,
      clave: 0,
    });
  });

  it('segunda orden inmediata: reutiliza el desafío y NO vuelve a saludar', async () => {
    const reloj = relojManual();
    const equipo = camara({ ahora: reloj.ahora });
    const control = barrera(equipo.peticion, reloj.ahora);
    expect((await control.accionar('camara-entrada', true)).estado).toBe('aceptada');
    expect((await control.accionar('camara-entrada', false)).estado).toBe('aceptada');
    expect(equipo.estadisticas().atendidas).toBe(2);
    expect(equipo.estadisticas().desafios.primero).toBe(1);
    expect(equipo.ordenes[1]).toMatch(/<ctrlMode>close<\/ctrlMode>/);
  });

  it('H-SITIO-12 · dos órdenes seguidas 9 y 35 s después, con el nonce vencido: aceptadas, nunca «clave»', async () => {
    const reloj = relojManual();
    const equipo = camara({ vigenciaMs: 5_000, ahora: reloj.ahora });
    const control = barrera(equipo.peticion, reloj.ahora);
    expect((await control.accionar('camara-entrada', true)).estado).toBe('aceptada');
    reloj.avanzar(9_000);
    expect((await control.accionar('camara-entrada', true)).estado).toBe('aceptada');
    reloj.avanzar(35_000);
    expect((await control.accionar('camara-entrada', true)).estado).toBe('aceptada');
    const e = equipo.estadisticas();
    expect(e.atendidas).toBe(3);
    expect(e.desafios.clave).toBe(0);
    expect(equipo.ordenes).toHaveLength(3);
  });

  it('el sondeo y la orden comparten la sesión del equipo: ningún `nc` repetido', async () => {
    const reloj = relojManual();
    const equipo = camara({ reutilizaNonceVigente: true, ahora: reloj.ahora });
    const sondeo = new ClienteDeEquipo({
      host: HOST,
      usuario: USUARIO,
      clave: CLAVE,
      peticion: equipo.peticion,
      ahora: reloj.ahora,
    });
    expect((await sondeo.pedir('GET', '/ISAPI/System/deviceInfo')).ok).toBe(true);
    expect(
      (await barrera(equipo.peticion, reloj.ahora).accionar('camara-entrada', true)).estado,
    ).toBe('aceptada');
    expect((await sondeo.pedir('GET', '/ISAPI/System/deviceInfo')).ok).toBe(true);
    expect(equipo.estadisticas().desafios.repetido).toBe(0);
    expect(equipo.estadisticas().atendidas).toBe(3);
  });

  it('clave errónea: UN intento autenticado, «rechazó las credenciales», y sin red después', async () => {
    const reloj = relojManual();
    const equipo = camara({ ahora: reloj.ahora }, 'otra-clave');
    const control = barrera(equipo.peticion, reloj.ahora);
    const r = await control.accionar('camara-entrada', true);
    expect(r.estado).toBe('rechazada');
    expect(r.estado === 'rechazada' ? r.motivo : '').toMatch(/rechazó las credenciales/);
    expect(equipo.estadisticas().desafios.clave).toBe(1);
    expect(equipo.ordenes).toHaveLength(0);

    // A5 · dentro de la ventana no se vuelve a presentar la clave: ni un viaje.
    reloj.avanzar(60_000);
    const otra = await control.accionar('camara-entrada', true);
    expect(otra.estado).toBe('rechazada');
    expect(equipo.estadisticas().desafios.clave).toBe(1);

    // Pasada la ventana vuelve a intentarlo: preventiva con el desafío guardado
    // y una renegociada. Son DOS resúmenes malos por ventana: es lo que la
    // barrera hace hoy, y esta suite lo documenta en vez de cambiarlo.
    reloj.avanzar(VENTANA_DE_CREDENCIAL_RECHAZADA_MS);
    await control.accionar('camara-entrada', true);
    expect(equipo.estadisticas().desafios.clave).toBe(3);
  });

  it('inalcanzable no es rechazada: el portero tiene que distinguirlas', async () => {
    const control = new ControlDeBarreraVehicular({
      host: HOST,
      usuario: USUARIO,
      clave: CLAVE,
      peticion: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    const r = await control.accionar('camara-entrada', true);
    expect(r.estado).toBe('inalcanzable');
    expect(r.estado === 'inalcanzable' ? r.motivo : 'credencial').not.toMatch(/credencial/i);
  });
});
