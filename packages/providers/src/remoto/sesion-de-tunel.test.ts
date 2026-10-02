import { afterEach, describe, expect, it, vi } from 'vitest';
import { Vigencia, esExito } from '@ncr/domain-core';
import { enlacesEnMemoria } from './enlace-en-memoria';
import type { Enlace } from './sesion-de-tunel';
import { SesionDeTunel } from './sesion-de-tunel';
import { EdgeDesconectado, ErrorRemoto, OrdenVencida, ProtocoloInvalido } from './errores-remotos';
import { CapacidadNoSoportada, CredencialRechazada } from '../nucleo/errores';
import { codificar, decodificar, PROFUNDIDAD_MAXIMA } from './serializacion';
import { leerMensaje, leerTramaBinaria, tramaBinaria, MENSAJE_MAXIMO_BYTES } from './protocolo';

/**
 * 15-Q2 · A2 · el túnel por dentro: lo que la suite de contrato no ve porque
 * el mundo es sano. Plazos, cortes, ritmo, mensajes inválidos y canales.
 */
const par = (opciones: Partial<ConstructorParameters<typeof SesionDeTunel>[1]> = {}) => {
  const [a, b] = enlacesEnMemoria();
  return {
    api: new SesionDeTunel(a, { paridad: 'par', ...opciones }),
    edge: new SesionDeTunel(b, { paridad: 'impar' }),
    a,
    b,
  };
};

afterEach(() => vi.useRealTimers());

describe('sesión del túnel (15-Q2, A2)', () => {
  it('un pedido atendido vuelve con su valor, bytes y fechas incluidos', async () => {
    const { api, edge } = par();
    edge.atender('eco', async (carga) => carga);
    const fecha = new Date('2026-10-02T12:00:00.000Z');
    const r = (await api.pedir('eco', { b: new Uint8Array([1, 2]), fecha }, { plazoMs: 1000 })) as {
      b: Uint8Array;
      fecha: Date;
    };
    expect([...r.b]).toEqual([1, 2]);
    expect(r.fecha).toEqual(fecha);
  });

  it('el error del otro lado llega con SU clase y sus campos', async () => {
    const { api, edge } = par();
    edge.atender('fallar', async () => {
      throw new CapacidadNoSoportada('cam', 'aperturaRemota', false);
    });
    const e = await api.pedir('fallar', null, { plazoMs: 1000 }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(CapacidadNoSoportada);
    expect((e as CapacidadNoSoportada).capacidad).toBe('aperturaRemota');
    expect((e as Error).message).toContain('no soporta');
  });

  it('un pedido sin quien lo atienda vuelve como error de protocolo, no se cuelga', async () => {
    const { api } = par();
    await expect(api.pedir('nadie', null, { plazoMs: 1000 })).rejects.toBeInstanceOf(
      ProtocoloInvalido,
    );
  });

  it('sin respuesta a tiempo: OrdenVencida, y la respuesta tardía se ignora', async () => {
    const { api, edge } = par();
    edge.atender('lento', () => new Promise((r) => setTimeout(() => r('tarde'), 50)));
    await expect(api.pedir('lento', null, { plazoMs: 5 })).rejects.toBeInstanceOf(OrdenVencida);
    await new Promise((r) => setTimeout(r, 80));
    expect(api.estaAbierta).toBe(true);
  });

  it('con el túnel cerrado: EdgeDesconectado EN EL ACTO, y los pendientes también (C3)', async () => {
    const { api, edge, a } = par();
    edge.atender('nunca', () => new Promise(() => undefined));
    const pendiente = api.pedir('nunca', null, { plazoMs: 60_000 });
    a.cortar();
    await expect(pendiente).rejects.toBeInstanceOf(EdgeDesconectado);
    await expect(api.pedir('eco', null, { plazoMs: 60_000 })).rejects.toBeInstanceOf(
      EdgeDesconectado,
    );
    const motivos: string[] = [];
    api.alCerrar((m) => motivos.push(m));
    expect(motivos).toEqual(['corte de red simulado']);
  });

  it('un mensaje fuera de protocolo cierra el túnel', async () => {
    const [a, b] = enlacesEnMemoria();
    const registros: string[] = [];
    const api = new SesionDeTunel(a, { paridad: 'par', registrar: (m) => registros.push(m) });
    b.enviar('{"v":1,"t":"hola"}');
    await new Promise((r) => setTimeout(r, 10));
    expect(api.estaAbierta).toBe(false);
    expect(registros[0]).toContain('fuera de protocolo');
  });

  it('pasado el ritmo admitido, se cierra (A2)', async () => {
    const { api, b } = par({ mensajesPorSegundo: 3 });
    for (let i = 0; i < 5; i += 1) b.enviar('{"v":1,"t":"latido"}');
    await new Promise((r) => setTimeout(r, 10));
    expect(api.estaAbierta).toBe(false);
  });

  it('un aviso llega sin respuesta, y los canales binarios van en orden y se cierran', async () => {
    const { api, edge } = par();
    const avisos: unknown[] = [];
    edge.alAviso('estado', (c) => avisos.push(c));
    api.avisar('estado', { modo: 'ok' });
    const canal = api.abrirCanal();
    expect(canal.id % 2).toBe(0);
    const remoto = edge.canal(canal.id);
    canal.enviar(new Uint8Array([1]));
    canal.enviar(new Uint8Array([2]));
    const leidos: number[] = [];
    setTimeout(() => canal.cerrar('fin'), 20);
    for await (const trozo of remoto) leidos.push(...trozo);
    expect(leidos).toEqual([1, 2]);
    expect(avisos).toEqual([{ modo: 'ok' }]);
    expect(edge.abrirCanal().id % 2).toBe(1);
  });

  it('padre y clave llegan al que atiende; un error sin forma o no-Error no rompe el túnel', async () => {
    const { api, edge, b } = par();
    const vistos: unknown[] = [];
    edge.atender('ver', async (_c, ctx) => vistos.push(ctx.padre, ctx.clave));
    edge.atender('tirar', () => Promise.reject(new Error('texto suelto').message));
    await api.pedir('ver', null, { plazoMs: 1000, padre: 'p-1', clave: 'k:1' });
    expect(vistos).toEqual(['p-1', 'k:1']);
    await expect(api.pedir('tirar', null, { plazoMs: 1000 })).rejects.toThrow('texto suelto');
    const pendiente = api.pedir('ver', null, { plazoMs: 1000 });
    b.enviar(tramaBinaria(99, new Uint8Array([1]))); // canal que nadie abrió: se ignora
    await pendiente;
    expect(api.estaAbierta).toBe(true);
    expect(api.senal).toBeGreaterThan(0);
  });

  it('una respuesta de error que no es un error se rechaza como error sin forma', async () => {
    const [a, b] = enlacesEnMemoria();
    const api = new SesionDeTunel(a, { paridad: 'par' });
    b.alRecibir((d) => {
      const id = (JSON.parse(String(d)) as { id: string }).id;
      b.enviar(JSON.stringify({ v: 1, t: 'respuesta', id, ok: false, error: 'nada' }));
    });
    await expect(api.pedir('x', null, { plazoMs: 1000 })).rejects.toThrow('error sin forma');
  });

  it('«bienvenida» después del apretón de manos cierra el túnel; un canal tardío nace cerrado', async () => {
    const { api, b } = par();
    const motivos: string[] = [];
    api.alCerrar((m) => motivos.push(m));
    b.enviar('{"v":1,"t":"bienvenida","copropiedadId":"10000000-0000-4000-8000-000000000001"}');
    await new Promise((r) => setTimeout(r, 10));
    expect(motivos).toEqual(['mensaje fuera de protocolo']);
    expect(api.canal(4).cerrado).toBe(true);
    api.cerrar(1000, 'otra vez'); // idempotente
    api.avisar('nadie', null); // con el túnel cerrado no sale nada
  });

  it('el latido mantiene vivo el túnel; el silencio lo cierra', async () => {
    vi.useFakeTimers();
    const enlace: Enlace = {
      enviar: () => undefined,
      cerrar: () => undefined,
      alRecibir: () => undefined,
      alCerrar: () => undefined,
    };
    let t = 0;
    const sola = new SesionDeTunel(enlace, {
      paridad: 'par',
      latidoMs: 100,
      silencioMaximoMs: 250,
      ahora: () => t,
    });
    t = 150;
    vi.advanceTimersByTime(100);
    expect(sola.estaAbierta).toBe(true);
    t = 400;
    vi.advanceTimersByTime(200);
    expect(sola.estaAbierta).toBe(false);
  });
});

describe('serialización y protocolo (15-Q2, A2)', () => {
  it('ida y vuelta: undefined en una lista, vigencia, error desconocido con su nombre', () => {
    const v = Vigencia.crear(new Date('2026-01-01'), new Date('2026-02-01'));
    if (!esExito(v)) throw new Error('vigencia');
    const vuelta = decodificar(
      JSON.parse(JSON.stringify(codificar([undefined, v.valor]))),
    ) as unknown[];
    expect(vuelta[0]).toBeUndefined();
    expect(vuelta[1]).toBeInstanceOf(Vigencia);
    const raro = Object.assign(new Error('x'), { name: 'Raro' });
    const e = decodificar(codificar(raro));
    expect(e).toBeInstanceOf(ErrorRemoto);
    expect((e as Error).name).toBe('Raro');
    const cred = decodificar(
      codificar(new CredencialRechazada('d', 120_000)),
    ) as CredencialRechazada;
    expect(cred).toBeInstanceOf(CredencialRechazada);
    expect(cred.rechazadaHaceMs).toBe(120_000);
  });

  it('lo que no se transporta se rechaza: funciones, no finitos, claves reservadas, profundidad', () => {
    expect(() => codificar(() => 1)).toThrow(ProtocoloInvalido);
    expect(() => codificar(Number.NaN)).toThrow(ProtocoloInvalido);
    expect(() => codificar({ $b: 'x' })).toThrow(ProtocoloInvalido);
    expect(() => decodificar({ $x: 1 })).toThrow(ProtocoloInvalido);
    expect(() => decodificar({ $d: 'no-es-fecha' })).toThrow(ProtocoloInvalido);
    let hondo: unknown = 1;
    for (let i = 0; i <= PROFUNDIDAD_MAXIMA + 1; i += 1) hondo = [hondo];
    expect(() => codificar(hondo)).toThrow(ProtocoloInvalido);
    class ConFuncion {
      f = () => 1;
    }
    expect(() => codificar(new ConFuncion())).toThrow(ProtocoloInvalido);
  });

  it('el lector de mensajes exige versión, tipo y campos con forma', () => {
    expect(() => leerMensaje('[]')).toThrow('no es un objeto');
    expect(() => leerMensaje('{"v":2,"t":"latido"}')).toThrow('versión');
    expect(() => leerMensaje('{"v":1,"t":"otro"}')).toThrow('tipo');
    expect(() => leerMensaje('{"v":1,"t":"pedido","id":"a","nombre":"x","plazoMs":0}')).toThrow(
      'plazo',
    );
    expect(() => leerMensaje('{"v":1,"t":"respuesta","id":"a"}')).toThrow('ok');
    expect(() => leerMensaje('{"v":1,"t":"canal","canal":0,"motivo":"x"}')).toThrow('canal');
    expect(() => leerMensaje('x'.repeat(MENSAJE_MAXIMO_BYTES + 1))).toThrow('grande');
    expect(
      leerMensaje(
        '{"v":1,"t":"bienvenida","copropiedadId":"10000000-0000-4000-8000-000000000001"}',
      ),
    ).toMatchObject({ t: 'bienvenida' });
  });

  it('la trama binaria lleva versión y canal, y rechaza las malformadas', () => {
    const t = tramaBinaria(7, new Uint8Array([9, 9]));
    expect(leerTramaBinaria(t)).toMatchObject({ canal: 7 });
    expect(() => leerTramaBinaria(new Uint8Array([1, 0]))).toThrow('tamaño');
    expect(() => leerTramaBinaria(tramaBinaria(0, new Uint8Array()))).toThrow('canal 0');
    const otraVersion = tramaBinaria(1, new Uint8Array());
    otraVersion[0] = 9;
    expect(() => leerTramaBinaria(otraVersion)).toThrow('versión');
  });
});
