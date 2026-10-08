import { describe, expect, it, vi } from 'vitest';
import type { CanalDeIntercom, EstadoDeCanal } from './puertos';
import { ConversacionDeAudio } from './conversacion-de-audio';
import type { ConversacionTerminada } from './conversacion-de-audio';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B3 (15-S2) · MANOS LIBRES Y DÚPLEX EN LA CONVERSACIÓN · extensión E-09
 *
 *  · la bajada NO se detiene mientras el operador habla;
 *  · en manos libres el micrófono no calla: el audio NO renueva el turno (la
 *    caducidad por inactividad sigue), el texto «voz» sí;
 *  · el tope de 60 s (S-177) parte el registro en tramos en vez de cortar;
 *  · si el equipo calla mientras recibe, la consola recibe «semiduplex».
 * ═════════════════════════════════════════════════════════════════════════════
 */
const P = { copropiedadId: 'cop-a', dispositivoId: 'vp-1', operadorId: 'op-1' } as const;
const ABIERTA = {
  dispositivoId: P.dispositivoId,
  estado: 'abierta',
  porDelante: 0,
  titular: P.operadorId,
  timeoutSegundos: 90,
  transporte: 'equipo',
  detalleTransporte: null,
  formatoDeAudio: 'g711u',
  via: 'websocket',
} satisfies EstadoDeCanal;

/** Un medidor de mentira: cuenta lo que le dan y dice «semidúplex» cuando la prueba quiera. */
const medidorFalso = () => {
  const cuenta = { subida: 0, bajada: 0, tics: 0 };
  let semiduplexEn = Infinity;
  return {
    cuenta,
    medidor: {
      contarSubida: (b: number) => void (cuenta.subida += b),
      contarBajada: (b: number) => void (cuenta.bajada += b),
      tic: () => ++cuenta.tics === semiduplexEn,
    },
    semiduplexAlSegundo: (n: number) => (semiduplexEn = n),
  };
};

const montar = () => {
  const falso = medidorFalso();
  let ahora = Date.parse('2026-10-08T12:00:00Z');
  const pendientes: ((r: IteratorResult<Uint8Array>) => void)[] = [];
  const canal = {
    estado: vi.fn(async () => ABIERTA),
    soltar: vi.fn(async () => ({ ...ABIERTA, estado: 'cerrada' })),
    renovar: vi.fn(async () => true),
    enviarAudio: vi.fn(async () => undefined),
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
  const salida = { audio: vi.fn(), aviso: vi.fn(), cerrar: vi.fn(), semiduplex: vi.fn() };
  const registradas: ConversacionTerminada[] = [];
  let latir: () => void = () => undefined;
  const conversacion = new ConversacionDeAudio(
    {
      canal,
      registro: { registrar: async (c) => void registradas.push(c) },
      reloj: { ahora: () => new Date(ahora) },
      ids: { nuevo: () => 'conv-1' },
      bitacora: { registrar: vi.fn() },
      temporizador: { cadaSegundo: (fn) => ((latir = fn), () => undefined) },
      crearMedidorDeDuplex: () => falso.medidor,
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
    esperar,
    falso,
    /** Un segundo de reloj: lo que sube y baja en él, y el latido. */
    segundo: async (subida: number, bajada: number) => {
      // Al ritmo del micrófono: cada trama sale antes de la siguiente.
      for (let i = 0; i < subida; i += 1) {
        conversacion.alAudio(new Uint8Array(160).fill(0x7f));
        await esperar();
      }
      for (let i = 0; i < bajada; i += 1) {
        pendientes.shift()?.({ done: false, value: new Uint8Array(160) });
        await esperar();
      }
      ahora += 1000;
      latir();
      await esperar();
    },
  };
};

describe('ConversacionDeAudio · manos libres y dúplex (B3)', () => {
  it('la bajada sigue llegando mientras el operador habla (dúplex en la API)', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.conversacion.alTexto(JSON.stringify({ tipo: 'pulsar' }));
    await m.segundo(50, 10);
    expect(m.salida.audio).toHaveBeenCalledTimes(10);
    expect(m.canal.enviarAudio).toHaveBeenCalledTimes(50);
  });

  it('manos libres: el audio no renueva el turno; «voz» sí', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.conversacion.alTexto(JSON.stringify({ tipo: 'pulsar', modo: 'manos_libres' }));
    const tras = vi.mocked(m.canal.renovar).mock.calls.length;
    await m.segundo(50, 0);
    await m.segundo(50, 0);
    expect(m.canal.enviarAudio).toHaveBeenCalled();
    expect(vi.mocked(m.canal.renovar).mock.calls.length).toBe(tras);
    m.conversacion.alTexto(JSON.stringify({ tipo: 'voz' }));
    expect(vi.mocked(m.canal.renovar).mock.calls.length).toBe(tras + 1);
  });

  it('manos libres: pasado el tope de 60 s, el tramo se parte sin cortar ni avisar', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.conversacion.alTexto(JSON.stringify({ tipo: 'pulsar', modo: 'manos_libres' }));
    for (let s = 0; s < 62; s += 1) await m.segundo(0, 0);
    expect(m.salida.aviso).not.toHaveBeenCalled();
    m.conversacion.alAudio(new Uint8Array(160));
    await m.esperar();
    expect(m.canal.enviarAudio).toHaveBeenCalledTimes(1);
    await m.conversacion.terminar('colgó');
    expect(m.registradas[0]?.tramos).toHaveLength(2);
  });

  it('pulsar para hablar conserva el corte del tramo a los 60 s, con aviso', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.conversacion.alTexto(JSON.stringify({ tipo: 'pulsar' }));
    for (let s = 0; s < 62; s += 1) await m.segundo(0, 0);
    expect(m.salida.aviso).toHaveBeenCalledWith(expect.stringMatching(/superó los 60 s/));
  });

  it('el medidor recibe lo que sube y lo que baja; cuando dice semidúplex, la consola se entera', async () => {
    const m = montar();
    await m.conversacion.iniciar();
    m.conversacion.alTexto(JSON.stringify({ tipo: 'pulsar', modo: 'manos_libres' }));
    m.falso.semiduplexAlSegundo(3);
    await m.segundo(5, 2);
    expect(m.falso.cuenta).toMatchObject({ subida: 800, bajada: 320 });
    await m.segundo(0, 0);
    expect(m.salida.semiduplex).not.toHaveBeenCalled();
    await m.segundo(0, 0);
    expect(m.salida.semiduplex).toHaveBeenCalledTimes(1);
  });
});
