import { describe, expect, it, vi } from 'vitest';
import type { CanalDeIntercom, EstadoDeCanal } from './puertos';
import { ConversacionDeAudio } from './conversacion-de-audio';
import type { ConversacionTerminada } from './conversacion-de-audio';
import { CanalConSesiones } from './sesiones-de-audio';

/**
 * 15-S1 · A1 · la sesión, sin socket ni equipo: un canal de mentira con UN
 * turno por equipo, que dice quién lo tiene y cuenta cada `soltar` que le
 * llega. Las pruebas van por orden de eventos; ninguna espera tiempo.
 */
const COP = 'cop-a';
const VP = 'vp-1';
const OP = 'op-1';

const estadoDe = (dispositivoId: string, abierta: boolean): EstadoDeCanal => ({
  dispositivoId,
  estado: abierta ? 'abierta' : 'cerrada',
  porDelante: 0,
  titular: abierta ? OP : null,
  timeoutSegundos: 90,
  transporte: abierta ? 'equipo' : 'ninguno',
  detalleTransporte: null,
  formatoDeAudio: abierta ? 'g711u' : null,
  via: 'websocket',
});

const montar = () => {
  /** Quién tiene la palabra en cada equipo (`null`: nadie). */
  const titulares = new Map<string, string | null>();
  const sueltas: string[] = [];
  let enEspera = false;
  const interno: CanalDeIntercom = {
    pedir: async (_c, d, o) => {
      if (enEspera) return { ...estadoDe(d, false), estado: 'en_espera', porDelante: 1 };
      if ((titulares.get(d) ?? null) === null) titulares.set(d, o);
      return estadoDe(d, titulares.get(d) === o);
    },
    soltar: async (_c, d, o) => {
      sueltas.push(`${d}|${o}`);
      if (titulares.get(d) === o) titulares.set(d, null);
      return estadoDe(d, false);
    },
    estado: async (_c, d, o) => estadoDe(d, titulares.get(d) === o),
    renovar: async (_c, d, o) => titulares.get(d) === o,
    recibirAudio: () => ({
      [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => undefined) }),
    }),
    enviarAudio: vi.fn(async () => undefined),
  };
  const bitacora = { registrar: vi.fn() };
  return {
    canal: new CanalConSesiones(interno, bitacora),
    interno,
    bitacora,
    sueltas,
    /** El turno se va SIN pasar por `soltar`: caduca, o lo toma otro. */
    perderElTurno: (d = VP) => titulares.set(d, 'otro'),
    liberarElTurno: (d = VP) => titulares.set(d, null),
    ponerEnEspera: (si: boolean) => (enEspera = si),
  };
};

const P = { copropiedadId: COP, dispositivoId: VP, operadorId: OP } as const;

describe('CanalConSesiones · la conversación suelta SU sesión', () => {
  it('colgar y volver a llamar: el soltar tardío de la vieja no toca el turno nuevo', async () => {
    const m = montar();
    await m.canal.pedir(COP, VP, OP); // sesión 1
    const vieja = m.canal.deLaConversacion(P);
    await m.canal.soltar(COP, VP, OP); // cuelga (HTTP)
    await m.canal.pedir(COP, VP, OP); // vuelve a llamar: sesión 2
    await vieja.soltar(COP, VP, OP); // el final tardío de la conversación vieja

    expect(m.sueltas).toEqual([`${VP}|${OP}`]); // sólo el del operador al colgar
    expect(await m.canal.estado(COP, VP, OP)).toMatchObject({ estado: 'abierta' });
    expect(m.bitacora.registrar).toHaveBeenCalledWith(
      'info',
      expect.stringMatching(/sin soltar: su sesión ya acabó/),
      { dispositivoId: VP, operadorId: OP },
    );
  });

  it('cambiar de equipo y volver sin colgar: la conversación nueva toma el turno y la vieja ya no lo suelta', async () => {
    const m = montar();
    await m.canal.pedir(COP, VP, OP);
    const vieja = m.canal.deLaConversacion(P);
    // La consola vuelve al equipo: el turno sigue siendo suyo y reabre el audio.
    const nueva = m.canal.deLaConversacion(P);
    await vieja.soltar(COP, VP, OP); // el cierre del socket viejo llega ahora
    expect(m.sueltas).toEqual([]);
    expect(await m.canal.estado(COP, VP, OP)).toMatchObject({ estado: 'abierta' });
    await nueva.soltar(COP, VP, OP); // y la nueva sí lo suelta al colgar
    expect(m.sueltas).toEqual([`${VP}|${OP}`]);
  });

  it('sin carrera, la conversación suelta su sesión: cerrar la pestaña libera el equipo', async () => {
    const m = montar();
    await m.canal.pedir(COP, VP, OP);
    const conversacion = m.canal.deLaConversacion(P);
    expect(await conversacion.soltar(COP, VP, OP)).toMatchObject({ estado: 'cerrada' });
    expect(m.sueltas).toEqual([`${VP}|${OP}`]);
    // Y la sesión acabó: una segunda conversación de ella ya no suelta nada.
    await m.canal.pedir(COP, VP, OP);
    await conversacion.soltar(COP, VP, OP);
    expect(m.sueltas).toHaveLength(1);
  });

  it('pedir otra vez con la palabra no abre otra sesión: la conversación sigue soltando', async () => {
    const m = montar();
    await m.canal.pedir(COP, VP, OP);
    const conversacion = m.canal.deLaConversacion(P);
    await m.canal.pedir(COP, VP, OP);
    await conversacion.soltar(COP, VP, OP);
    expect(m.sueltas).toEqual([`${VP}|${OP}`]);
  });

  it('el turno que caduca o toma otro acaba la sesión, aunque nadie llame a soltar', async () => {
    const m = montar();
    await m.canal.pedir(COP, VP, OP);
    const porEstado = m.canal.deLaConversacion(P);
    m.perderElTurno();
    await m.canal.estado(COP, VP, OP); // lo ve quien pregunte: la vigilancia, la consola
    m.liberarElTurno();
    await m.canal.pedir(COP, VP, OP);
    await porEstado.soltar(COP, VP, OP);
    expect(m.sueltas).toHaveLength(0);

    const porRenovar = m.canal.deLaConversacion(P);
    m.perderElTurno();
    expect(await m.canal.renovar(COP, VP, OP)).toBe(false);
    m.liberarElTurno();
    await m.canal.pedir(COP, VP, OP);
    await porRenovar.soltar(COP, VP, OP);
    expect(m.sueltas).toHaveLength(0);
  });

  it('sin la palabra no hay sesión: quien espera en la cola no suelta nada al terminar', async () => {
    const m = montar();
    m.ponerEnEspera(true);
    expect(await m.canal.pedir(COP, VP, OP)).toMatchObject({ estado: 'en_espera' });
    await m.canal.deLaConversacion(P).soltar(COP, VP, OP);
    expect(m.sueltas).toHaveLength(0);
  });

  it('las sesiones son por copropiedad, equipo y operador: otro equipo no mueve la suya', async () => {
    const m = montar();
    await m.canal.pedir(COP, VP, OP);
    const conversacion = m.canal.deLaConversacion(P);
    await m.canal.pedir(COP, 'vp-2', OP);
    await m.canal.soltar(COP, 'vp-2', OP);
    await m.canal.pedir('cop-b', VP, OP);
    await conversacion.soltar(COP, VP, OP);
    expect(m.sueltas).toEqual([`vp-2|${OP}`, `${VP}|${OP}`]);
  });

  it('el audio pasa tal cual, por el canal y por la vista de la conversación', async () => {
    const m = montar();
    const trama = Uint8Array.of(1, 2, 3);
    await m.canal.enviarAudio(COP, VP, OP, trama);
    const vista = m.canal.deLaConversacion(P);
    await vista.enviarAudio(COP, VP, OP, trama);
    expect(m.interno.enviarAudio).toHaveBeenCalledTimes(2);
    expect(m.interno.enviarAudio).toHaveBeenLastCalledWith(COP, VP, OP, trama);
    expect(vista.recibirAudio(COP, VP, OP)).toBeDefined();
    expect(m.canal.recibirAudio(COP, VP, OP)).toBeDefined();
    expect(await vista.pedir(COP, VP, OP)).toMatchObject({ estado: 'abierta' });
    expect(await vista.estado(COP, VP, OP)).toMatchObject({ estado: 'abierta' });
    expect(await vista.renovar(COP, VP, OP)).toBe(true);
  });
});

describe('CanalConSesiones · con la conversación de verdad (15-P)', () => {
  it('la conversación vieja termina después de la llamada nueva y no se lleva su turno', async () => {
    const m = montar();
    const registradas: ConversacionTerminada[] = [];
    await m.canal.pedir(COP, VP, OP);
    const vieja = new ConversacionDeAudio(
      {
        canal: m.canal.deLaConversacion(P),
        registro: { registrar: async (c) => void registradas.push(c) },
        reloj: { ahora: () => new Date('2026-10-05T12:00:00Z') },
        ids: { nuevo: () => 'conv-vieja' },
        bitacora: { registrar: vi.fn() },
        temporizador: { cadaSegundo: () => () => undefined },
      },
      P,
      { audio: vi.fn(), aviso: vi.fn(), cerrar: vi.fn() },
    );
    expect(await vieja.iniciar()).toBe(true);
    await m.canal.soltar(COP, VP, OP); // cuelga
    await m.canal.pedir(COP, VP, OP); // vuelve a llamar
    await vieja.terminar('El operador colgó'); // el cierre del socket viejo llega ahora

    expect(registradas).toHaveLength(1);
    expect(m.sueltas).toHaveLength(1);
    expect(await m.canal.estado(COP, VP, OP)).toMatchObject({
      estado: 'abierta',
      transporte: 'equipo',
    });
  });
});
