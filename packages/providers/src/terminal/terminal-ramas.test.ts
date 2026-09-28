import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { TerminalFacial } from './terminal-facial';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import { jpegConMedidas } from '../simulacion/imagenes-de-prueba';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-K · LA TERMINAL CUANDO CONTESTA MAL (H-SITIO-04)
 *
 * En sitio la carga falló con un 400 y la bitácora no decía por qué. Aquí: el
 * rechazo deja su línea de ERROR con los códigos del equipo, y las dos
 * preguntas de verificación (contar, buscar) dicen «no lo sé» —`null`— en vez
 * de inventar un número cuando el equipo contesta con error o no contesta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const RECHAZO =
  '{"statusCode":6,"statusString":"Invalid Content","subStatusCode":"badParameters","errorCode":1610637344,"errorMsg":"face"}';

const respuesta = (estado: number, cuerpo: string) =>
  ({
    status: estado,
    ok: estado >= 200 && estado < 300,
    headers: new Headers(),
    text: async () => cuerpo,
    body: null,
  }) as unknown as Response;

const terminalCon = (
  rotas: Record<string, 'error' | 'rechazo' | 'inalcanzable'>,
  traza?: Bitacora,
): TerminalFacial => {
  const simulado = equipoSimulado({ familia: 'terminal', usuario: 'servicio', clave: 'k' });
  return new TerminalFacial({
    host: `terminal-${String(Math.random()).slice(2)}.invalid`,
    usuario: 'servicio',
    clave: 'k',
    modo: 'decide_el_equipo',
    ...(traza === undefined ? {} : { traza }),
    peticion: async (url, opciones) => {
      const ruta = new URL(String(url)).pathname;
      const clave = Object.keys(rotas).find((r) => ruta.includes(r));
      if (clave === undefined) return simulado(url, opciones);
      if (rotas[clave] === 'inalcanzable') throw new TypeError('fetch failed');
      return rotas[clave] === 'rechazo' ? respuesta(400, RECHAZO) : respuesta(500, 'error');
    },
  });
};

describe('15-K · el rechazo de la carga se ve en la bitácora (H-SITIO-04)', () => {
  it('deja una línea de ERROR con statusCode, subStatusCode, errorCode y errorMsg', async () => {
    const lineas: { nivel: string; mensaje: string; datos: unknown }[] = [];
    const traza: Bitacora = {
      registrar: (nivel, mensaje, datos) => lineas.push({ nivel, mensaje, datos }),
    };
    const terminal = terminalCon({ '/FDLib/FDSetUp': 'rechazo' }, traza);
    await expect(
      terminal.sincronizar('t-1', '5e2b7c1a-0000-4000-8000-0000000000d1', jpegConMedidas()),
    ).rejects.toBeDefined();
    const carga = lineas.find((l) => l.mensaje === 'carga de plantilla en la terminal');
    expect(carga?.nivel).toBe('error');
    expect(carga?.datos).toMatchObject({
      estadoHttp: 400,
      subStatusCode: 'badParameters',
      errorMsg: 'face',
    });
    // El código del fabricante se escribe en hexadecimal, como en su diccionario.
    expect(String((carga?.datos as { errorCode: unknown }).errorCode)).toMatch(/^0x[0-9a-f]+$/i);
  });
});

describe('15-K · contar y buscar dicen «no lo sé» en vez de inventar', () => {
  it.each([
    ['contesta con error', 'error'],
    ['no contesta', 'inalcanzable'],
  ] as const)('contar() es null si el equipo %s', async (_c, rotura) => {
    expect(await terminalCon({ '/FDLib/Count': rotura }).contar()).toBeNull();
  });

  it.each([
    ['contesta con error', 'error'],
    ['no contesta', 'inalcanzable'],
  ] as const)('existe() es null si el equipo %s', async (_c, rotura) => {
    expect(
      await terminalCon({ '/FDLib/FDSearch': rotura }).existe(
        '5e2b7c1a-0000-4000-8000-0000000000d2',
      ),
    ).toBeNull();
  });
});

describe('15-K · abrir, contestar y estado cuando la terminal contesta mal', () => {
  it('una apertura notSupport es RutaNoSoportada: se captura la ruta buena, no se prueba otra', async () => {
    const simulado = equipoSimulado({ familia: 'terminal', usuario: 'servicio', clave: 'k' });
    const terminal = new TerminalFacial({
      host: `terminal-${String(Math.random()).slice(2)}.invalid`,
      usuario: 'servicio',
      clave: 'k',
      modo: 'decide_el_equipo',
      numeroDePuerta: 1,
      peticion: async (url, opciones) =>
        new URL(String(url)).pathname.includes('/RemoteControl/door/')
          ? respuesta(
              200,
              '<ResponseStatus><statusCode>4</statusCode><subStatusCode>notSupport</subStatusCode></ResponseStatus>',
            )
          : simulado(url, opciones),
    });
    await expect(terminal.abrir('t-1', 'operador-1')).rejects.toThrow(/no soporta/);
  });

  it('el veredicto remoto rechazado por el equipo es un error neutral, no un «aceptado»', async () => {
    const terminal = terminalCon({ '/AccessControl/remoteCheck': 'error' });
    await expect(
      terminal.responderVerificacion('t-1', { serie: 7, permitido: true, motivo: 'vigente' }),
    ).rejects.toBeDefined();
  });

  it('vivo pero contestando con error es «degradado», no «fuera de línea»', async () => {
    expect(await terminalCon({ '/System/deviceInfo': 'error' }).estado('t-1')).toBe('degradado');
    expect(await terminalCon({ '/System/deviceInfo': 'inalcanzable' }).estado('t-1')).toBe(
      'fuera_de_linea',
    );
  });
});
