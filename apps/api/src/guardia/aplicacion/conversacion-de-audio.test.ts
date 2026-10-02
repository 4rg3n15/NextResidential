import { describe, expect, it, vi } from 'vitest';
import type { CanalDeIntercom, EstadoDeCanal } from './puertos';
import { CIERRES, ConversacionDeAudio } from './conversacion-de-audio';
import type { ConversacionTerminada, SalidaDeConversacion } from './conversacion-de-audio';

/**
 * 15-P · P5 · la conversación sin socket ni equipo: un canal de mentira con el
 * turno en la mano, un reloj que se mueve a mano y un temporizador que late
 * cuando la prueba lo dice.
 */
const P = { copropiedadId: 'cop-a', dispositivoId: 'vp-1', operadorId: 'op-1' } as const;

const estadoDe = (estado: EstadoDeCanal['estado'], transporte: EstadoDeCanal['transporte']) =>
  ({
    dispositivoId: P.dispositivoId,
    estado,
    porDelante: 0,
    titular: estado === 'abierta' ? P.operadorId : null,
    timeoutSegundos: 90,
    transporte,
    detalleTransporte: null,
    formatoDeAudio: 'g711u',
    via: 'websocket',
  }) satisfies EstadoDeCanal;

const montar = (inicial = estadoDe('abierta', 'equipo')) => {
  let estado: EstadoDeCanal = inicial;
  let ahora = Date.parse('2026-10-01T12:00:00Z');
  const pendientes: ((r: IteratorResult<Uint8Array>) => void)[] = [];
  const subidas: Uint8Array[] = [];
  let sigueSiendoSuyo = true;
  const canal = {
    pedir: vi.fn(),
    estado: vi.fn(async () => estado),
    soltar: vi.fn(async () => estadoDe('cerrada', 'ninguno')),
    renovar: vi.fn(async () => sigueSiendoSuyo),
    enviarAudio: vi.fn(async (_c: string, _d: string, _o: string, t: Uint8Array) => {
      subidas.push(t);
    }),
    recibirAudio: () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<Uint8Array>>((r) => pendientes.push(r)),
        return: async () => {
          for (const r of pendientes.splice(0)) r({ done: true, value: undefined });
          return { done: true, value: undefined } as IteratorResult<Uint8Array>;
        },
      }),
    }),
  } as unknown as CanalDeIntercom;
  const salida = { audio: vi.fn(), aviso: vi.fn(), cerrar: vi.fn() } satisfies SalidaDeConversacion;
  const registradas: ConversacionTerminada[] = [];
  let latir: () => void = () => undefined;
  const conversacion = new ConversacionDeAudio(
    {
      canal,
      registro: { registrar: async (c) => void registradas.push(c) },
      reloj: { ahora: () => new Date(ahora) },
      ids: { nuevo: () => 'conv-1' },
      bitacora: { registrar: vi.fn() },
      temporizador: {
        cadaSegundo: (fn) => {
          latir = fn;
          return () => (latir = () => undefined);
        },
      },
    },
    P,
    salida,
  );
  const esperar = () => new Promise((r) => setTimeout(r, 0));
  return {
    conversacion,
    canal,
    salida,
    registradas,
    subidas,
    avanzar: (ms: number) => (ahora += ms),
    latir: async () => {
      latir();
      await esperar();
    },
    llegaDelEquipo: (t: Uint8Array) => pendientes.shift()?.({ done: false, value: t }),
    elEquipoCierra: () => pendientes.shift()?.({ done: true, value: undefined }),
    cambiarEstado: (e: EstadoDeCanal) => (estado = e),
    perderElTurno: () => (sigueSiendoSuyo = false),
    esperar,
  };
};

const trama = (n = 160) => new Uint8Array(n).fill(0x7f);

describe('ConversacionDeAudio · el turno', () => {
  it('sin la palabra no empieza: cierra con 4003 y no escucha', async () => {
    const m = montar(estadoDe('en_espera', 'ninguno'));
    expect(await m.conversacion.iniciar()).toBe(false);
    expect(m.salida.cerrar).toHaveBeenCalledWith(CIERRES.sinTurno, expect.any(String));
    await m.conversacion.terminar('fin');
    expect(m.registradas).toHaveLength(0);
  });

  it('con la palabra, escucha desde que abre sin pulsar nada', async () => {
    const m = montar();
    expect(await m.conversacion.iniciar()).toBe(true);
    m.llegaDelEquipo(trama());
    await m.esperar();
    expect(m.salida.audio).toHaveBeenCalledTimes(1);
  });
});

describe('ConversacionDeAudio · pulsar para hablar', () => {
  it('sin «pulsar» el audio se descarta; entre pulsar y soltar sube EN ORDEN', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.conversacion.alAudio(trama());
    m.conversacion.alTexto('{"tipo":"pulsar"}');
    m.conversacion.alAudio(Uint8Array.of(1));
    m.conversacion.alAudio(Uint8Array.of(2));
    m.conversacion.alTexto('{"tipo":"soltar"}');
    m.conversacion.alAudio(Uint8Array.of(3));
    await m.esperar();
    expect(m.subidas.map((t) => t[0])).toEqual([1, 2]);
    await m.conversacion.terminar('el operador colgó');
    expect(m.registradas[0]?.tramos).toHaveLength(1);
  });

  it('el servidor corta un tramo de más de 60 s y lo dice; la conversación sigue', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.conversacion.alTexto('{"tipo":"pulsar"}');
    m.avanzar(61_000);
    await m.latir();
    expect(m.salida.aviso).toHaveBeenCalledWith(expect.stringMatching(/superó los 60 s/));
    m.conversacion.alAudio(trama());
    await m.esperar();
    expect(m.subidas).toHaveLength(0);
    expect(m.salida.cerrar).not.toHaveBeenCalled();
  });

  it('turno caducado: cierra con 4001, suelta el turno y deja la constancia', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.conversacion.alTexto('{"tipo":"pulsar"}');
    m.avanzar(2000);
    m.conversacion.alTexto('{"tipo":"soltar"}');
    m.cambiarEstado(estadoDe('cerrada', 'ninguno'));
    await m.latir();
    await m.esperar();
    expect(m.salida.cerrar).toHaveBeenCalledWith(
      CIERRES.caducado,
      'El turno caducó por inactividad',
    );
    expect(m.canal.soltar).toHaveBeenCalledWith('cop-a', 'vp-1', 'op-1');
    const [c] = m.registradas;
    expect(c?.motivoDeCierre).toBe('El turno caducó por inactividad');
    expect(c?.tramos).toHaveLength(1);
    expect((c?.tramos[0]?.hasta.getTime() ?? 0) - (c?.tramos[0]?.desde.getTime() ?? 0)).toBe(2000);
    // Nunca el audio: la constancia no lleva bytes.
    expect(JSON.stringify(c)).not.toMatch(/"0":|Uint8Array/);
  });

  it('el audio renueva el turno como mucho una vez por segundo; si ya no es suyo, 4001', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.conversacion.alTexto('{"tipo":"pulsar"}');
    const llamadas = vi.mocked(m.canal.renovar).mock.calls.length;
    m.conversacion.alAudio(trama());
    m.conversacion.alAudio(trama());
    expect(vi.mocked(m.canal.renovar).mock.calls.length).toBe(llamadas);
    m.avanzar(1500);
    m.perderElTurno();
    m.conversacion.alAudio(trama());
    await m.esperar();
    expect(m.salida.cerrar).toHaveBeenCalledWith(CIERRES.caducado, 'El turno ya no es suyo');
  });
});

describe('ConversacionDeAudio · límites propios y fin', () => {
  it('una trama de más de 1600 B cierra con 4008', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.conversacion.alTexto('{"tipo":"pulsar"}');
    m.conversacion.alAudio(trama(1601));
    await m.esperar();
    expect(m.salida.cerrar).toHaveBeenCalledWith(CIERRES.abuso, expect.stringMatching(/tamaño/));
  });

  it('más de 100 tramas en un segundo cierran con 4008', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    for (let i = 0; i < 101; i += 1) m.conversacion.alAudio(trama());
    await m.esperar();
    expect(m.salida.cerrar).toHaveBeenCalledWith(
      CIERRES.abuso,
      expect.stringMatching(/por segundo/),
    );
  });

  it('el equipo cierra la escucha: 4010 y el turno se suelta', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.elEquipoCierra();
    await m.esperar();
    await m.esperar();
    expect(m.salida.cerrar).toHaveBeenCalledWith(
      CIERRES.equipo,
      'El equipo cerró el canal de audio',
    );
    expect(m.canal.soltar).toHaveBeenCalled();
  });

  it('terminar dos veces (corte y luego cierre del socket) registra UNA conversación', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    await m.conversacion.terminar('el operador colgó');
    await m.conversacion.terminar('socket cerrado');
    expect(m.registradas).toHaveLength(1);
    expect(m.canal.soltar).toHaveBeenCalledTimes(1);
  });

  it('un texto que no es JSON no rompe nada', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.conversacion.alTexto('no es json');
    expect(m.salida.cerrar).not.toHaveBeenCalled();
  });
});
