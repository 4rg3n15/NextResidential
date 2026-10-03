import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import {
  EdgeDesconectado,
  ProtocoloInvalido,
  OrdenVencida,
  SesionDeTunel,
  enlacesEnMemoria,
} from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import { TunelesDeEdge } from '../../proveedores';
import type { RutasDeEquipos } from '../../proveedores';
import { CredencialesDelPuente, pedirGuardar } from './credenciales-del-puente';
import type { EquipoSinClave, Huella, LecturaParaElEdge } from '../aplicacion/puertos-del-puente';

/**
 * 15-Q2 · D1-D3 · la credencial de cada equipo viaja al Edge por el túnel y la
 * nube sólo guarda la referencia y una huella. Sin túnel, `EdgeDesconectado`
 * tipado y nada se marca; la clave nunca aparece en lo que se devuelve, se
 * lanza o se registra.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const OTRA = '10000000-0000-4000-8000-000000000002';
const EDGE = 'a0000001-0000-4000-8000-000000000001';
const EQUIPO = 'd0000001-0000-4000-8000-000000000001';
const CLAVE = 'clave-de-prueba-no-real-7Q';
const SECRETO_AS = 'secreto-de-alarm-server-de-prueba';

const ctx: ContextoTenant = {
  usuarioId: '00000000-0000-4000-8000-0000000000a1',
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};

const SIN_CLAVE: EquipoSinClave = {
  dispositivoId: EQUIPO,
  tipo: 'camara_lpr',
  host: '192.0.2.10',
  puerto: 80,
  protocolo: 'http',
  usuario: 'operador-de-prueba',
};

interface Opciones {
  readonly puente?: boolean;
  readonly conTunel?: boolean;
  readonly equipo?: EquipoSinClave | null;
  readonly secreto?: string | null;
  readonly respuesta?: (carga: unknown) => unknown;
}

const montar = (o: Opciones = {}) => {
  const lineas: { nivel: string; mensaje: string; contexto: unknown }[] = [];
  const bitacora: Bitacora = {
    registrar: (nivel, mensaje, contexto) => void lineas.push({ nivel, mensaje, contexto }),
  };
  const olvidados: (string | undefined)[] = [];
  const rutas: RutasDeEquipos = {
    puenteDe: async () => null,
    edgeDe: async (cop) => (o.puente !== false && cop === COP ? EDGE : null),
    olvidar: (id) => void olvidados.push(id),
  };
  const tuneles = new TunelesDeEdge();
  const recibidos: { nombre: string; carga: unknown; plazoMs: number }[] = [];
  const [a, b] = enlacesEnMemoria();
  const api = new SesionDeTunel(a, { paridad: 'par' });
  const edge = new SesionDeTunel(b, { paridad: 'impar' });
  const anotar = (nombre: string) => (carga: unknown, c: { plazoMs: number }) =>
    void recibidos.push({ nombre, carga, plazoMs: c.plazoMs });
  const respuesta = o.respuesta ?? (() => ({ autenticado: true, estado: 'en_linea' }));
  edge.atender('credencial.guardar', async (carga, c) => {
    anotar('credencial.guardar')(carga, c);
    return respuesta(carga);
  });
  edge.atender('credencial.retirar', async (carga, c) => anotar('credencial.retirar')(carga, c));
  edge.atender('equipo.diagnosticar', async (carga, c) => {
    anotar('equipo.diagnosticar')(carga, c);
    return { veredicto: 'alcanzado' };
  });
  if (o.conTunel !== false) {
    tuneles.ocupar({ copropiedadId: COP, edgeId: EDGE, sesion: api, desde: new Date(0) });
  }
  const lectura: LecturaParaElEdge = {
    sinClave: async () => (o.equipo === undefined ? SIN_CLAVE : o.equipo),
    secretoDeCamara: async () => o.secreto ?? null,
  };
  const marcas: unknown[][] = [];
  const huellas: string[][] = [];
  const huella: Huella = (cop, id, clave) => {
    huellas.push([cop, id, clave]);
    return `huella-hmac-de-${id}`;
  };
  const puente = new CredencialesDelPuente(
    rutas,
    tuneles,
    lectura,
    { enElEdge: async (...args) => void marcas.push(args) },
    huella,
    bitacora,
  );
  return { puente, tuneles, recibidos, marcas, huellas, olvidados, lineas, api, cortar: a.cortar };
};

const textoDe = (valor: unknown): string =>
  valor instanceof Error ? `${valor.name} ${valor.message}` : JSON.stringify(valor);

afterEach(() => void vi.useRealTimers());

describe('pedirGuardar (15-Q2, D3)', () => {
  it('sin túnel: EdgeDesconectado en el acto', async () => {
    await expect(pedirGuardar(new TunelesDeEdge(), COP, {})).rejects.toBeInstanceOf(
      EdgeDesconectado,
    );
  });

  it('con túnel: pide `credencial.guardar` con { equipo } y plazo de 15 s', async () => {
    const m = montar();
    const r = await pedirGuardar(m.tuneles, COP, { dispositivoId: EQUIPO });
    expect(r).toEqual({ autenticado: true, estado: 'en_linea' });
    expect(m.recibidos).toEqual([
      {
        nombre: 'credencial.guardar',
        carga: { equipo: { dispositivoId: EQUIPO } },
        plazoMs: 15_000,
      },
    ]);
  });
});

describe('CredencialesDelPuente (15-Q2, D1-D3)', () => {
  it('R1 · puenteDe es el Edge de la copropiedad, o null si va directo', async () => {
    const m = montar();
    expect(await m.puente.puenteDe(COP)).toBe(EDGE);
    expect(await m.puente.puenteDe(OTRA)).toBeNull();
  });

  it('C3 · exigirTunel: con túnel abierto no lanza; sin él, o cerrado, EdgeDesconectado', () => {
    const m = montar();
    expect(() => m.puente.exigirTunel(COP)).not.toThrow();
    expect(() => m.puente.exigirTunel(OTRA)).toThrow(EdgeDesconectado);
    m.api.cerrar(1000, 'fin');
    expect(() => m.puente.exigirTunel(COP)).toThrow(EdgeDesconectado);
  });

  it('entregar con clave: el Edge recibe equipo, clave y secreto; la nube sólo la huella', async () => {
    const m = montar({ secreto: SECRETO_AS });
    const r = await m.puente.entregar(ctx, COP, EQUIPO, CLAVE);
    expect(r).toEqual({ autenticado: true, estado: 'en_linea' });
    expect(m.recibidos).toEqual([
      {
        nombre: 'credencial.guardar',
        carga: { equipo: { ...SIN_CLAVE, clave: CLAVE, secretoAlarmServer: SECRETO_AS } },
        plazoMs: 15_000,
      },
    ]);
    expect(m.huellas).toEqual([[COP, EQUIPO, CLAVE]]);
    expect(m.marcas).toEqual([[COP, EQUIPO, EDGE, `huella-hmac-de-${EQUIPO}`]]);
    expect(m.olvidados).toEqual([EQUIPO]);
    expect(m.lineas).toEqual([
      {
        nivel: 'info',
        mensaje: 'equipo entregado al Edge',
        contexto: { dispositivoId: EQUIPO, conClave: true, autenticado: true },
      },
    ]);
    expect(textoDe(r)).not.toContain(CLAVE);
    expect(textoDe(m.marcas)).not.toContain(CLAVE);
    expect(textoDe(m.lineas)).not.toContain(CLAVE);
  });

  it('entregar sin clave (null): el Edge conserva la suya; sin secreto no viaja, huella nula', async () => {
    const m = montar();
    await m.puente.entregar(ctx, COP, EQUIPO, null);
    expect(m.recibidos[0]?.carga).toEqual({ equipo: SIN_CLAVE });
    expect(m.huellas).toEqual([]);
    expect(m.marcas).toEqual([[COP, EQUIPO, EDGE, null]]);
    expect(m.lineas[0]?.contexto).toMatchObject({ conClave: false });
  });

  it('el Edge no autentica con ella: se devuelve tal cual y la referencia queda igual', async () => {
    const m = montar({ respuesta: () => ({ autenticado: false, estado: 'fuera_de_linea' }) });
    const r = await m.puente.entregar(ctx, COP, EQUIPO, CLAVE);
    expect(r).toEqual({ autenticado: false, estado: 'fuera_de_linea' });
    expect(m.marcas).toHaveLength(1);
    expect(m.lineas[0]?.contexto).toMatchObject({ autenticado: false });
  });

  it.each([
    ['la copropiedad no tiene puente', { puente: false }],
    ['el equipo no existe o está de baja', { equipo: null }],
  ])('%s: EdgeDesconectado, y nada viaja ni se marca', async (_caso, opciones) => {
    const m = montar(opciones);
    const error = await m.puente.entregar(ctx, COP, EQUIPO, CLAVE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EdgeDesconectado);
    expect((error as Error).message).toBe('el equipo no va por un Edge');
    expect(m.recibidos).toEqual([]);
    expect(m.marcas).toEqual([]);
  });

  it('puente con el túnel caído: EdgeDesconectado tipado, sin marca y sin la clave', async () => {
    const m = montar({ conTunel: false, secreto: SECRETO_AS });
    const error = await m.puente.entregar(ctx, COP, EQUIPO, CLAVE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EdgeDesconectado);
    expect(textoDe(error)).not.toContain(CLAVE);
    expect(textoDe(error)).not.toContain(SECRETO_AS);
    expect(m.marcas).toEqual([]);
    expect(m.olvidados).toEqual([]);
  });

  it('el túnel se corta con la entrega en vuelo: EdgeDesconectado, sin marca', async () => {
    const m = montar({ respuesta: () => new Promise(() => undefined) });
    const enVuelo = m.puente.entregar(ctx, COP, EQUIPO, CLAVE).catch((e: unknown) => e);
    await vi.waitFor(() => expect(m.recibidos).toHaveLength(1));
    m.cortar();
    const error = await enVuelo;
    expect(error).toBeInstanceOf(EdgeDesconectado);
    expect(textoDe(error)).not.toContain(CLAVE);
    expect(m.marcas).toEqual([]);
  });

  it('sin respuesta en 15 s: OrdenVencida de `credencial.guardar`, sin marca', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const m = montar({ respuesta: () => new Promise(() => undefined) });
    const enVuelo = m.puente.entregar(ctx, COP, EQUIPO, CLAVE).catch((e: unknown) => e);
    await vi.waitFor(() => expect(m.recibidos).toHaveLength(1));
    await vi.advanceTimersByTimeAsync(15_000);
    const error = await enVuelo;
    expect(error).toBeInstanceOf(OrdenVencida);
    expect(error).toMatchObject({ orden: 'credencial.guardar', plazoMs: 15_000 });
    expect(textoDe(error)).not.toContain(CLAVE);
    expect(m.marcas).toEqual([]);
  });

  it('respuesta del Edge sin forma (vacía, «"false"», 1): ProtocoloInvalido y NADA se marca', async () => {
    for (const respuesta of [
      undefined,
      { autenticado: 'false', estado: 'en_linea' },
      { autenticado: 1 },
    ]) {
      const m = montar({ respuesta: () => respuesta });
      await expect(m.puente.entregar(ctx, COP, EQUIPO, CLAVE)).rejects.toBeInstanceOf(
        ProtocoloInvalido,
      );
      expect(m.marcas).toHaveLength(0);
    }
  });

  it('C2 · pedir: llega al Edge con su plazo; sin túnel, EdgeDesconectado en el acto', async () => {
    const m = montar();
    const r = await m.puente.pedir(COP, 'equipo.diagnosticar', { host: '192.0.2.10' }, 60_000);
    expect(r).toEqual({ veredicto: 'alcanzado' });
    expect(m.recibidos).toEqual([
      { nombre: 'equipo.diagnosticar', carga: { host: '192.0.2.10' }, plazoMs: 60_000 },
    ]);
    await expect(m.puente.pedir(OTRA, 'equipo.diagnosticar', {}, 1)).rejects.toBeInstanceOf(
      EdgeDesconectado,
    );
  });

  it('retirar: pide `credencial.retirar` con el equipo y plazo de 10 s', async () => {
    const m = montar();
    await m.puente.retirar(COP, EQUIPO);
    expect(m.recibidos).toEqual([
      { nombre: 'credencial.retirar', carga: { dispositivoId: EQUIPO }, plazoMs: 10_000 },
    ]);
    expect(m.lineas).toEqual([]);
  });

  it('retirar sin túnel NO lanza: lo registra (el inventario lo arreglará al reconectar)', async () => {
    const m = montar({ conTunel: false });
    await expect(m.puente.retirar(COP, EQUIPO)).resolves.toBeUndefined();
    expect(m.lineas).toEqual([
      {
        nivel: 'aviso',
        mensaje: 'el Edge no pudo retirar el equipo dado de baja',
        contexto: { dispositivoId: EQUIPO, error: 'el Edge del conjunto no está conectado' },
      },
    ]);
  });

  it('retirar con un rechazo que no es Error: se registra su texto y no lanza', async () => {
    const lineas: unknown[] = [];
    const tuneles = {
      sesionDe: () => ({ pedir: () => Promise.reject('corte crudo') }),
    } as unknown as TunelesDeEdge;
    const puente = new CredencialesDelPuente(
      {} as RutasDeEquipos,
      tuneles,
      {} as LecturaParaElEdge,
      { enElEdge: async () => undefined },
      () => '',
      { registrar: (_n, _m, contexto) => void lineas.push(contexto) },
    );
    await puente.retirar(COP, EQUIPO);
    expect(lineas).toEqual([{ dispositivoId: EQUIPO, error: 'corte crudo' }]);
  });
});
