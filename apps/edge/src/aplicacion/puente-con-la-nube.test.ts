import { describe, expect, it, vi } from 'vitest';
import {
  EquipoNoRegistrado,
  ProtocoloInvalido,
  SesionDeTunel,
  enlacesEnMemoria,
} from '@ncr/providers';
import type {
  ContextoDePedido,
  IngestorDePublicaciones,
  PublicacionDeEquipo,
  ResultadoDeIngesta,
} from '@ncr/providers';
import { PuenteConLaNube } from './puente-con-la-nube';

/**
 * 15-Q2 · B2 · con túnel decide la nube; sin respuesta a tiempo, el Edge. Y
 * nunca los dos: `enManosDeLaNube` es la regla de un solo actor que consulta el
 * ejecutor antes de obedecer una orden de la nube.
 */
const CAMARA = '90000000-0000-4000-8000-000000000001';

const publicacion = (): PublicacionDeEquipo =>
  ({
    evento: {
      clase: 'placa',
      placa: 'ABC123',
      confianza: 0.95,
      dispositivoId: CAMARA,
      ocurridoEn: new Date('2026-10-01T10:00:00.000Z'),
      enVivo: true,
      referenciaDelEquipo: 'ref-1',
    },
    foto: null,
    recorte: null,
    transporte: 'escucha',
  }) as unknown as PublicacionDeEquipo;

const DEL_EDGE: ResultadoDeIngesta = { registrado: true, motivo: 'decidido con la caché' };

type Atencion = (carga: unknown, contexto: ContextoDePedido) => Promise<unknown>;

const montar = (opciones: { plazoMs?: number; ahora?: () => number; memoriaMs?: number } = {}) => {
  const [a, b] = enlacesEnMemoria();
  const nube = new SesionDeTunel(a, { paridad: 'par' });
  const edge = new SesionDeTunel(b, { paridad: 'impar' });
  const ingerir = vi.fn(async (_p: PublicacionDeEquipo) => DEL_EDGE);
  const local: IngestorDePublicaciones = { ingerir };
  const avisos: { nivel: string; mensaje: string; contexto: unknown }[] = [];
  let conTunel = true;
  const puente = new PuenteConLaNube(local, () => (conTunel ? edge : null), {
    plazoMs: opciones.plazoMs ?? 1_000,
    registrar: (nivel, mensaje, contexto) => void avisos.push({ nivel, mensaje, contexto }),
    ...(opciones.ahora === undefined ? {} : { ahora: opciones.ahora }),
    ...(opciones.memoriaMs === undefined ? {} : { memoriaMs: opciones.memoriaMs }),
  });
  const hechos: string[] = [];
  const nubeAtiende = (atencion: Atencion): void =>
    nube.atender('publicacion', async (carga, contexto) => {
      hechos.push((carga as { hechoId: string }).hechoId);
      return atencion(carga, contexto);
    });
  return {
    puente,
    ingerir,
    avisos,
    hechos,
    nubeAtiende,
    sinTunel: () => (conTunel = false),
    cortar: () => a.cortar(),
  };
};

const esperar = (ms = 15) => new Promise((r) => setTimeout(r, ms));

describe('PuenteConLaNube · sin túnel decide el Edge', () => {
  it('sin sesión, la publicación va directa al ingestor local', async () => {
    const m = montar();
    m.sinTunel();
    expect(await m.puente.ingerir(publicacion())).toEqual(DEL_EDGE);
    expect(m.ingerir).toHaveBeenCalledTimes(1);
    expect(m.hechos).toEqual([]);
  });
});

describe('PuenteConLaNube · con túnel decide la nube', () => {
  it('la nube contesta a tiempo: su desenlace manda y el Edge NO decide', async () => {
    const m = montar();
    let recibido: unknown = null;
    let clave: string | undefined;
    m.nubeAtiende(async (carga, contexto) => {
      recibido = carga;
      clave = contexto.clave;
      return { desenlace: 'ingerida', motivo: null };
    });
    expect(await m.puente.ingerir(publicacion())).toEqual({ registrado: true, motivo: null });
    expect(m.ingerir).not.toHaveBeenCalled();
    // El hecho viaja con su identificador, que es también la clave de idempotencia.
    const hechoId = m.hechos[0];
    expect(clave).toBe(hechoId);
    expect(recibido).toMatchObject({ hechoId, publicacion: { evento: { dispositivoId: CAMARA } } });
  });

  it.each([
    [{ desenlace: 'historica' }, { registrado: true, motivo: null }],
    [
      { desenlace: 'descartada', motivo: 'duplicado' },
      { registrado: false, motivo: 'duplicado' },
    ],
    [{}, { registrado: false, motivo: null }],
  ])('el desenlace %j de la nube se traduce a %j', async (respuesta, esperado) => {
    const m = montar();
    m.nubeAtiende(async () => respuesta);
    expect(await m.puente.ingerir(publicacion())).toEqual(esperado);
    expect(m.ingerir).not.toHaveBeenCalled();
  });

  it('tras contestar, el hecho sigue en manos de la nube: su orden se obedece', async () => {
    const m = montar();
    m.nubeAtiende(async () => ({ desenlace: 'ingerida' }));
    await m.puente.ingerir(publicacion());
    expect(m.puente.enManosDeLaNube(String(m.hechos[0]))).toBe(true);
  });
});

describe('PuenteConLaNube · sin respuesta a tiempo, contingencia', () => {
  it('vence el plazo: decide el Edge UNA vez, y la respuesta tardía de la nube se ignora', async () => {
    const m = montar({ plazoMs: 30 });
    let contestar: (v: unknown) => void = () => undefined;
    m.nubeAtiende(() => new Promise((r) => (contestar = r)));
    expect(await m.puente.ingerir(publicacion())).toEqual(DEL_EDGE);
    expect(m.ingerir).toHaveBeenCalledTimes(1);
    expect(m.avisos).toEqual([
      {
        nivel: 'aviso',
        mensaje: 'la nube no contestó a tiempo: decide el Edge',
        contexto: { motivo: 'OrdenVencida', dispositivoId: CAMARA },
      },
    ]);
    contestar({ desenlace: 'ingerida' });
    await esperar();
    expect(m.ingerir).toHaveBeenCalledTimes(1);
    // B2 · un solo actor: la orden tardía de la nube para ese hecho NO se obedece.
    expect(m.puente.enManosDeLaNube(String(m.hechos[0]))).toBe(false);
  });

  it('si la orden de la nube llegó antes que el plazo, el hecho es de ella aunque no conteste', async () => {
    // Plazo holgado: la orden tiene que llegar ANTES de que venza, también con la máquina cargada.
    const m = montar({ plazoMs: 300 });
    let tomada: boolean | null = null;
    m.nubeAtiende(async (_carga, contexto) => {
      // La orden de apertura llega al ejecutor con este hecho como padre.
      tomada = m.puente.enManosDeLaNube(String(contexto.clave));
      return new Promise(() => undefined);
    });
    expect(await m.puente.ingerir(publicacion())).toEqual({ registrado: true, motivo: null });
    expect(tomada).toBe(true);
    expect(m.ingerir).not.toHaveBeenCalled();
    expect(m.puente.enManosDeLaNube(String(m.hechos[0]))).toBe(true);
  });

  it('un fallo de la nube que no es un rechazo (su base caída) cae a la caché', async () => {
    const m = montar();
    m.nubeAtiende(async () => {
      throw new Error('la base de la nube no responde');
    });
    expect(await m.puente.ingerir(publicacion())).toEqual(DEL_EDGE);
    expect(m.ingerir).toHaveBeenCalledTimes(1);
    expect(m.avisos[0]?.contexto).toMatchObject({ motivo: 'Error' });
  });

  it('el túnel se corta con el hecho en vuelo: EdgeDesconectado y decide el Edge', async () => {
    const m = montar();
    m.nubeAtiende(async () => {
      m.cortar();
      return new Promise(() => undefined);
    });
    expect(await m.puente.ingerir(publicacion())).toEqual(DEL_EDGE);
    expect(m.avisos[0]?.contexto).toMatchObject({ motivo: 'EdgeDesconectado' });
  });

  it('un rechazo que no es un Error se trata como «desconocido» y decide el Edge', async () => {
    const ingerir = vi.fn(async () => DEL_EDGE);
    const avisos: unknown[] = [];
    const sesion = {
      pedir: () => Promise.reject('no es un Error'),
    } as unknown as SesionDeTunel;
    const puente = new PuenteConLaNube({ ingerir }, () => sesion, {
      plazoMs: 10,
      registrar: (_n, _m, contexto) => void avisos.push(contexto),
    });
    expect(await puente.ingerir(publicacion())).toEqual(DEL_EDGE);
    expect(avisos).toEqual([{ motivo: 'desconocido', dispositivoId: CAMARA }]);
  });
});

describe('PuenteConLaNube · la nube rechaza con razón: nadie decide (RN-15)', () => {
  it.each([
    ['EquipoNoRegistrado', () => new EquipoNoRegistrado(CAMARA)],
    ['ProtocoloInvalido', () => new ProtocoloInvalido('publicación sin forma')],
  ])('%s: no registrado, sin decisión local', async (nombre, error) => {
    const m = montar();
    m.nubeAtiende(async () => {
      throw error();
    });
    expect(await m.puente.ingerir(publicacion())).toEqual({
      registrado: false,
      motivo: `la nube rechazó el hecho: ${nombre}`,
    });
    expect(m.ingerir).not.toHaveBeenCalled();
    expect(m.avisos).toEqual([]);
  });
});

describe('PuenteConLaNube · enManosDeLaNube', () => {
  it('un hecho que no conoce (reiniciado, olvidado) NO es de la nube: denegar por defecto', () => {
    const m = montar();
    expect(m.puente.enManosDeLaNube('hecho-que-nunca-existio')).toBe(false);
  });

  it('mientras espera, la primera orden lo pasa a la nube', async () => {
    const m = montar();
    let enEspera: boolean | null = null;
    m.nubeAtiende(async (_c, contexto) => {
      enEspera = m.puente.enManosDeLaNube(String(contexto.clave));
      return { desenlace: 'ingerida' };
    });
    await m.puente.ingerir(publicacion());
    expect(enEspera).toBe(true);
  });

  it('pasada la memoria, el hecho se olvida al ingerir el siguiente', async () => {
    let reloj = 0;
    const m = montar({ ahora: () => reloj, memoriaMs: 1_000 });
    m.nubeAtiende(async () => ({ desenlace: 'ingerida' }));
    await m.puente.ingerir(publicacion());
    const primero = String(m.hechos[0]);
    reloj = 500;
    await m.puente.ingerir(publicacion());
    expect(m.puente.enManosDeLaNube(primero)).toBe(true);
    reloj = 1_501;
    await m.puente.ingerir(publicacion());
    expect(m.puente.enManosDeLaNube(primero)).toBe(false);
    expect(m.puente.enManosDeLaNube(String(m.hechos[2]))).toBe(true);
  });
});
