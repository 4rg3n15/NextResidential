import { describe, expect, it } from 'vitest';
import { MockProvider } from '../mock/mock-provider';
import { PERFIL_IDEAL } from '../mock/simulacion';
import { ORDEN_DEL_MODO, fijarModoDePuerta } from './modo-de-puerta';
import { AperturaNoSoportada } from './puerta-remota';
import type { ModoDeSalida } from '../nucleo/proveedor';
import { tunelEnMemoria } from '../remoto/tunel-en-memoria';
import { EdgeDesconectado } from '../remoto/errores-remotos';

/**
 * 15-R · P-25 · la puerta libre, bloqueada o normal sale por la MISMA ruta,
 * el MISMO cuerpo y la MISMA confirmación que la apertura que abrió en sitio:
 * sólo cambia la orden. Se comprueba sobre lo que viaja al equipo.
 */
const ACEPTADA =
  '<ResponseStatus><statusCode>1</statusCode><subStatusCode>ok</subStatusCode></ResponseStatus>';

const conexionQueRegistra = (enviados: { metodo: string; url: string; cuerpo: string }[]) => ({
  host: `puerta-${String(Math.random()).slice(2)}.invalid`,
  usuario: 'servicio',
  clave: 'k',
  peticion: async (url: string | URL | Request, init?: RequestInit) => {
    enviados.push({
      metodo: init?.method ?? 'GET',
      url: String(url),
      cuerpo: typeof init?.body === 'string' ? init.body : '',
    });
    return {
      status: 200,
      ok: true,
      headers: new Headers(),
      text: async () => ACEPTADA,
      body: null,
    } as unknown as Response;
  },
});

describe('15-R · el modo de la puerta, por la ruta de la apertura', () => {
  it.each<[ModoDeSalida, string]>([
    ['libre', 'alwaysOpen'],
    ['bloqueada', 'alwaysClose'],
    ['normal', 'close'],
  ])('%s viaja como <cmd>%s</cmd> al door/{canal} de la puerta elegida', async (modo, cmd) => {
    const enviados: { metodo: string; url: string; cuerpo: string }[] = [];
    const r = await fijarModoDePuerta(
      conexionQueRegistra(enviados),
      'videoportero',
      2,
      'vp-1',
      modo,
    );
    expect(r.aceptado).toBe(true);
    expect(ORDEN_DEL_MODO[modo]).toBe(cmd);
    const ultimo = enviados.at(-1);
    expect(ultimo?.metodo).toBe('PUT');
    expect(ultimo?.url).toMatch(/\/ISAPI\/AccessControl\/RemoteControl\/door\/2$/);
    expect(ultimo?.cuerpo).toContain(`<cmd>${cmd}</cmd>`);
    expect(ultimo?.cuerpo).toContain('xmlns="http://www.isapi.org/ver20/XMLSchema" version="2.0"');
    expect(ultimo?.cuerpo).not.toContain('<cmd>open</cmd>');
  });

  it('un equipo que no lo admite (notSupport) es AperturaNoSoportada, no un «aceptado»', async () => {
    const conexion = {
      ...conexionQueRegistra([]),
      peticion: async () =>
        ({
          status: 200,
          ok: true,
          headers: new Headers(),
          text: async () =>
            '<ResponseStatus><statusCode>4</statusCode><subStatusCode>notSupport</subStatusCode></ResponseStatus>',
          body: null,
        }) as unknown as Response,
    };
    await expect(
      fijarModoDePuerta(conexion, 'terminal', 1, 'terminal-1', 'libre'),
    ).rejects.toBeInstanceOf(AperturaNoSoportada);
  });

  it('el simulado GUARDA el modo por equipo y puerta: una prueba afirma el hecho', async () => {
    const simulado = new MockProvider({ perfil: PERFIL_IDEAL, semilla: 1 });
    await simulado.fijarModoDeSalida('disp-porteria', 1, 'libre');
    expect(simulado.modosDeSalida.get('disp-porteria:1')).toBe('libre');
    await simulado.fijarModoDeSalida('disp-porteria', 1, 'normal');
    expect(simulado.modosDeSalida.get('disp-porteria:1')).toBe('normal');
  });
});

describe('15-R · el modo de la puerta, vía Edge (por el túnel)', () => {
  it('la orden cruza el túnel y la cumple el proveedor del Edge; sin Edge, rechaza tipado', async () => {
    const delEdge = new MockProvider({ perfil: PERFIL_IDEAL, semilla: 1 });
    const { proveedor, cortar } = tunelEnMemoria(delEdge);
    const r = await proveedor.fijarModoDeSalida('disp-porteria', 2, 'bloqueada', 'operador-1');
    expect(r.aceptado).toBe(true);
    expect(delEdge.modosDeSalida.get('disp-porteria:2')).toBe('bloqueada');

    cortar();
    await expect(
      proveedor.fijarModoDeSalida('disp-porteria', 2, 'normal', 'operador-1'),
    ).rejects.toBeInstanceOf(EdgeDesconectado);
    expect(delEdge.modosDeSalida.get('disp-porteria:2')).toBe('bloqueada');
  });
});
