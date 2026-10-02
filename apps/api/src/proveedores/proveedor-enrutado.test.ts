import { describe, expect, it } from 'vitest';
import {
  EdgeDesconectado,
  FuenteDePlacas,
  HechoYaResueltoEnElEdge,
  SesionDeTunel,
  ejecutarOrdenes,
  enlacesEnMemoria,
} from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';
import { enHechoDelEdge } from './hecho-en-curso';
import { ProveedorEnrutado } from './proveedor-enrutado';
import type { RutasDeEquipos } from './rutas-de-equipos';
import { TunelesDeEdge } from './tuneles-de-edge';

/**
 * 15-Q2 · C1 · R1 · el enrutado elige equipo a equipo: sin puente, el directo
 * de siempre; con puente, el túnel de SU copropiedad. Y no inventa capacidades.
 */
const COP = '10000000-0000-4000-8000-000000000001';

const proveedorQueAnota = (quien: string, registro: string[], extra: object = {}) =>
  ({
    abrir: async (id: string) => {
      registro.push(`${quien}:abrir:${id}`);
      return { aceptado: true, latenciaMs: 1 };
    },
    estado: async () => 'en_linea' as const,
    suscribir: async () => undefined,
    capacidadesDe: async (id: string) => {
      registro.push(`${quien}:capacidades:${id}`);
      return {};
    },
    escuchar: async (id: string) => ({
      dispositivoId: id,
      transporte: 'escucha',
      detalle: quien,
      detener: () => undefined,
    }),
    abrirSesion: async (id: string) => {
      registro.push(`${quien}:sesion:${id}`);
      return 'abierta';
    },
    estadoSesion: async () => {
      registro.push(`${quien}:estadoSesion`);
      return 'cerrada';
    },
    recibirAudioDe: (id: string) =>
      (async function* () {
        registro.push(`${quien}:recibir:${id}`);
        yield new Uint8Array([7]);
      })(),
    olvidar: (id: string) => void registro.push(`${quien}:olvidar:${id}`),
    senalDeEventos: () => ({ transporte: 'escucha', ultimaSenal: null, rechazo: null }),
    ...extra,
  }) as unknown as ProveedorDeEquipos;

const montar = (opciones: { conTunel?: boolean; resuelto?: string } = {}) => {
  const registro: string[] = [];
  const tuneles = new TunelesDeEdge();
  const rutas: RutasDeEquipos = {
    puenteDe: async (id) => (id.startsWith('remoto') ? COP : null),
    olvidar: (id) => void registro.push(`rutas:olvidar:${String(id)}`),
  };
  const directo = proveedorQueAnota('directo', registro);
  const enrutado = new ProveedorEnrutado(directo, rutas, tuneles, new FuenteDePlacas());
  if (opciones.conTunel !== false) {
    const [a, b] = enlacesEnMemoria();
    const api = new SesionDeTunel(a, { paridad: 'par' });
    const edge = new SesionDeTunel(b, { paridad: 'impar' });
    ejecutarOrdenes(edge, proveedorQueAnota('edge', registro), {
      conoce: () => true,
      padreVigente: (p) => p !== opciones.resuelto,
    });
    tuneles.ocupar({ copropiedadId: COP, edgeId: 'e', sesion: api, desde: new Date() });
  }
  return { enrutado, registro, directo };
};

describe('ProveedorEnrutado (15-Q2, C1/R1)', () => {
  it('sin puente va al directo; con puente, por el túnel al proveedor del Edge', async () => {
    const m = montar();
    await m.enrutado.abrir('local-1', 'op');
    await m.enrutado.abrir('remoto-1', 'op');
    expect(m.registro).toEqual(['directo:abrir:local-1', 'edge:abrir:remoto-1']);
    expect(await m.enrutado.puenteDe('remoto-1')).toBe(COP);
    expect(await m.enrutado.puenteDe('local-1')).toBeNull();
  });

  it('C3 · con puente y sin túnel: abrir no aceptado con su motivo; lo demás, EdgeDesconectado', async () => {
    const m = montar({ conTunel: false });
    expect(await m.enrutado.abrir('remoto-1', 'op')).toMatchObject({
      aceptado: false,
      rechazo: 'el Edge del conjunto no está conectado',
    });
    await expect(m.enrutado.capacidadesDe('remoto-1')).rejects.toBeInstanceOf(EdgeDesconectado);
    expect(m.registro).toEqual([]);
  });

  it('B2 · una orden nacida de un hecho que el Edge ya resolvió NO llega a la barrera', async () => {
    const m = montar({ resuelto: 'hecho-9' });
    await expect(
      enHechoDelEdge('hecho-9', () => m.enrutado.abrir('remoto-1', 'nube')),
    ).rejects.toBeInstanceOf(HechoYaResueltoEnElEdge);
    await enHechoDelEdge('hecho-10', () => m.enrutado.abrir('remoto-1', 'nube'));
    expect(m.registro).toEqual(['edge:abrir:remoto-1']);
  });

  it('R1 · un opcional que el directo no tiene, tampoco lo tiene el enrutado', () => {
    const m = montar();
    expect(m.enrutado.sondearVideo).toBeUndefined();
    expect(m.enrutado.decideSolo).toBeUndefined();
    expect(typeof m.enrutado.recibirAudioDe).toBe('function');
  });

  it('B3 · escuchar un equipo con puente no abre nada desde la nube', async () => {
    const m = montar();
    expect((await m.enrutado.escuchar('remoto-1')).detalle).toContain('Edge del conjunto');
    expect((await m.enrutado.escuchar('local-1')).detalle).toBe('directo');
  });

  it('la sesión única de audio sigue al equipo que la abrió; el audio por equipo, a su ruta', async () => {
    const m = montar();
    await m.enrutado.abrirSesion('remoto-1', 'op');
    await m.enrutado.estadoSesion();
    const leidos: number[] = [];
    for await (const t of m.enrutado.recibirAudioDe('local-1')) leidos.push(...t);
    await m.enrutado.recibirAudioDe('local-1')[Symbol.asyncIterator]().return?.();
    expect(leidos).toEqual([7]);
    expect(m.registro).toEqual([
      'edge:sesion:remoto-1',
      'edge:estadoSesion',
      'directo:recibir:local-1',
    ]);
  });

  it('olvidar limpia la ruta y avisa a los dos lados; la señal de un remoto no se inventa', async () => {
    const m = montar();
    await m.enrutado.capacidadesDe('remoto-1');
    expect(m.enrutado.senalDeEventos('remoto-1')).toBeNull();
    expect(m.enrutado.senalDeEventos('local-1')).toMatchObject({ transporte: 'escucha' });
    m.enrutado.olvidar('remoto-1');
    await new Promise((r) => setTimeout(r, 10));
    expect(m.registro).toEqual([
      'edge:capacidades:remoto-1',
      'rutas:olvidar:remoto-1',
      'directo:olvidar:remoto-1',
      'edge:olvidar:remoto-1',
    ]);
  });
});
