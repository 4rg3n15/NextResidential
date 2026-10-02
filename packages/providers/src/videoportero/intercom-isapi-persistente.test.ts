import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tramaDeSilencio, tramaDeTono } from '../simulacion/marcas-de-audio';
import { videoporteroDeAudioEnRed } from '../simulacion/videoportero-de-audio';
import type { VideoporteroDeAudioEnRed } from '../simulacion/videoportero-de-audio';
import { CanalDeAudioOcupado } from '../nucleo/errores';
import { CanalDeEquipoNoHabilitado, IntercomDeEquipo } from './intercom-equipo';
import { IntercomIsapiPersistente } from './intercom-isapi-persistente';

/**
 * 15-P · P2 · el adaptador nuevo contra el videoportero simulado EN RED: el
 * flujo del manual, con Digest, por sockets de verdad.
 */
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;
let equipo: VideoporteroDeAudioEnRed;

beforeEach(async () => {
  equipo = await videoporteroDeAudioEnRed(CREDENCIAL);
});
afterEach(async () => {
  await equipo.cerrar();
});

const opciones = (extra: { canalHabilitado?: boolean } = {}) => ({
  host: '127.0.0.1',
  puerto: equipo.puerto,
  ...CREDENCIAL,
  // Cada prueba su propio transporte: no hereda el desafío de la anterior.
  peticion: (entrada: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(entrada, init),
  reloj: { ahora: () => new Date() },
  canalHabilitado: extra.canalHabilitado ?? true,
  canal: 1,
});

const hasta = async (condicion: () => boolean, plazoMs = 2000): Promise<void> => {
  const limite = Date.now() + plazoMs;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error('la condición no se cumplió a tiempo');
    await new Promise((listo) => setTimeout(listo, 5));
  }
};

describe('IntercomIsapiPersistente · contra el videoportero simulado en red', () => {
  it('abre el canal y la subida en el acto, CRUDA (sin chunked), y el tono llega al equipo', async () => {
    const intercom = new IntercomIsapiPersistente(opciones());
    expect(await intercom.abrirSesion('vp-1', 'op-1')).toBe('abierta');
    // La subida se abre sin esperar respuesta: el equipo la ve un instante después.
    await hasta(() => equipo.estado().subidasAbiertas === 1);
    expect(equipo.estado().aperturas).toBe(1);
    for (let i = 0; i < 3; i += 1) await intercom.enviarAudio(tramaDeSilencio());
    await intercom.enviarAudio(tramaDeTono(0));
    await hasta(() => equipo.marcasRecibidas.length === 1);
    expect(equipo.estado().entramadoDeSubida).toBe('crudo');
    expect(equipo.estado().bytesRecibidos).toBe(4 * 160);
    await intercom.cerrarSesion('fin de la prueba');
    expect(equipo.estado()).toMatchObject({ cierres: 1, sesionAbierta: false });
    expect(await intercom.estadoSesion()).toBe('cerrada');
  });

  it('la escucha trae las tramas del equipo y su marca', async () => {
    const intercom = new IntercomIsapiPersistente(opciones());
    await intercom.abrirSesion('vp-1', 'op-1');
    const flujo = intercom.recibirAudio()[Symbol.asyncIterator]();
    const primero = await flujo.next();
    expect(primero.done).toBe(false);
    equipo.bajada.marcar();
    let bytes = 0;
    while (equipo.bajada.marcasEmitidas.length === 0 || bytes < 1600) {
      const { value } = await flujo.next();
      bytes += value?.length ?? 0;
    }
    await intercom.cerrarSesion('fin');
    expect((await flujo.next()).done).toBe(true);
    expect(
      equipo.peticiones().filter((p) => p.startsWith('GET') && p.endsWith('audioData')),
    ).not.toHaveLength(0);
  });

  it('0x40002068: con el canal tomado por otro cliente dice «canal ocupado» y suelta el turno', async () => {
    equipo.ocupar();
    const intercom = new IntercomIsapiPersistente(opciones());
    await expect(intercom.abrirSesion('vp-1', 'op-1')).rejects.toBeInstanceOf(CanalDeAudioOcupado);
    expect(equipo.estado().ocupadoRespondido).toBe(1);
    expect(await intercom.estadoSesion()).toBe('cerrada');
    // El turno quedó libre: otro operador puede pedirlo (y vuelve a chocar con el equipo).
    await expect(intercom.abrirSesion('vp-1', 'op-2')).rejects.toThrow(/canal ocupado.*0x40002068/);
  });

  it('un canal deshabilitado no llega a tocar el equipo', async () => {
    const intercom = new IntercomIsapiPersistente(opciones({ canalHabilitado: false }));
    await expect(intercom.abrirSesion('vp-1', 'op-1')).rejects.toBeInstanceOf(
      CanalDeEquipoNoHabilitado,
    );
    expect(equipo.peticiones()).toEqual([]);
  });

  it('sin sesión abierta no se sube ni se escucha', async () => {
    const intercom = new IntercomIsapiPersistente(opciones());
    await expect(intercom.enviarAudio(tramaDeSilencio())).rejects.toThrow(/ninguna sesión/);
    await expect(intercom.recibirAudio()[Symbol.asyncIterator]().next()).rejects.toThrow(
      /ninguna sesión/,
    );
  });

  it('el transporte ACTUAL sube trozado (chunked): lo que el equipo no espera', async () => {
    const actual = new IntercomDeEquipo(opciones());
    await actual.abrirSesion('vp-1', 'op-1');
    await actual.enviarAudio(tramaDeTono(0));
    await hasta(() => equipo.estado().entramadoDeSubida !== null);
    expect(equipo.estado().entramadoDeSubida).toBe('chunked');
    await actual.cerrarSesion('fin');
  });
});
