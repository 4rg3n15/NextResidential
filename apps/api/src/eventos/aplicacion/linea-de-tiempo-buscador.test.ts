import { describe, expect, it, vi } from 'vitest';
import type { FiltroDeEventos } from '@ncr/domain-core';
import { ConsultarLineaDeTiempo } from './linea-de-tiempo';
import type { CriteriosDeLineaDeTiempo } from './linea-de-tiempo';
import type { IdsPorResolver, NombresDeEventos, ResolutorDeNombres } from './nombres-de-eventos';
import type { EventoRegistrado, RepositorioEventos } from './puertos';
import { RepositorioEventosDeEquipoEnMemoria } from '../infraestructura/repositorios-en-memoria';
import { criteriosDeAcceso } from '../presentacion/criterios-de-acceso';

/**
 * D-145 · el buscador de la consola sobre la línea de tiempo: los filtros
 * nuevos llegan al repositorio, un filtro que sólo cumple un acceso deja fuera
 * los eventos de equipo, y los nombres se resuelven por lotes —una llamada,
 * sin repetidos— dentro de la copropiedad.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = '90000000-0000-4000-8000-000000000001';
const PERSONA = '30000000-0000-4000-8000-000000000001';
const VIVIENDA = '20000000-0000-4000-8000-000000000001';
const OPERADOR = '00000000-0000-4000-8000-000000000010';
const T = (m: number): Date => new Date(Date.UTC(2026, 9, 26, 15, m));

const fila = (m: number, extra: Partial<EventoRegistrado> = {}): EventoRegistrado => ({
  id: `acc-${String(m)}`,
  copropiedadId: COP,
  ocurridoEn: T(m),
  tipo: 'ingreso',
  resultado: 'permitido',
  motivo: null,
  metodo: 'placa',
  personaId: null,
  viviendaId: null,
  zonaId: null,
  dispositivoId: EQUIPO,
  placaDetectada: 'ABC123',
  confianza: 0.9,
  reglaAplicada: 'x',
  versionReglas: 1,
  operadorId: null,
  motivoManual: null,
  evidenciaId: null,
  decididoPorEdge: false,
  ...extra,
});

const NOMBRES: NombresDeEventos = {
  personas: new Map([[PERSONA, { nombre: 'Laura Gómez', clase: 'residente' as const }]]),
  viviendas: new Map([[VIVIENDA, 'Casa 12']]),
  operadores: new Map([[OPERADOR, 'Pedro Portero']]),
};

const montar = async (filas: readonly EventoRegistrado[]) => {
  const consultar = vi.fn(async (_f: FiltroDeEventos) => ({ filas, siguiente: null }));
  const accesos: RepositorioEventos = {
    anexar: async () => {
      throw new Error('no se usa');
    },
    consultar,
    porId: async () => null,
  };
  const deEquipo = new RepositorioEventosDeEquipoEnMemoria();
  await deEquipo.registrar({
    copropiedadId: COP,
    dispositivoId: EQUIPO,
    tipo: 'puerta_forzada',
    titulo: 'Puerta forzada',
    codigoMayor: 5,
    codigoMenor: 27,
    origen: 'equipo',
    enVivo: true,
    ocurridoEn: T(2),
    horaDelEquipo: null,
    eventoId: null,
    claveIdempotencia: 'clave-puerta',
    carga: {},
    creadoPor: 'actor',
  });
  const resolver = vi.fn(async (_c: string, _ids: IdsPorResolver) => NOMBRES);
  const nombres: ResolutorDeNombres = { resolver };
  return { caso: new ConsultarLineaDeTiempo(accesos, deEquipo, nombres), consultar, resolver };
};

const criterios = (extra: Partial<CriteriosDeLineaDeTiempo> = {}): CriteriosDeLineaDeTiempo => ({
  copropiedadId: COP,
  desde: T(0),
  hasta: T(59),
  dispositivoId: null,
  tipo: null,
  limite: 50,
  ...extra,
});

describe('D-145 · filtros del buscador en la línea de tiempo', () => {
  it('sin filtros de acceso, accesos y eventos de equipo juntos', async () => {
    const m = await montar([fila(1)]);
    const r = await m.caso.ejecutar(criterios());
    if (!r.ok) throw new Error(r.error.detalle);
    expect(r.valor.elementos.map((e) => e.origen).sort()).toEqual(['acceso', 'equipo']);
  });

  it.each([
    ['placa', { placa: 'abc-123' }],
    ['operador', { operadorId: OPERADOR }],
    ['método', { metodo: 'facial' as const }],
    ['identificación', { identificacion: 'desconocida' as const }],
    ['vivienda', { viviendaId: VIVIENDA }],
  ])('con filtro de %s, los eventos de equipo quedan fuera', async (_n, extra) => {
    const m = await montar([fila(1)]);
    const r = await m.caso.ejecutar(criterios(extra));
    if (!r.ok) throw new Error(r.error.detalle);
    expect(r.valor.elementos.every((e) => e.origen === 'acceso')).toBe(true);
  });

  it('los filtros llegan al repositorio, con la placa ya normalizada', async () => {
    const m = await montar([]);
    await m.caso.ejecutar(
      criterios({
        placa: ' abc-123 ',
        operadorId: OPERADOR,
        metodo: 'manual',
        identificacion: 'conocida',
      }),
    );
    const filtro = m.consultar.mock.calls[0]?.[0];
    expect(filtro).toMatchObject({
      placa: 'ABC123',
      operadorId: OPERADOR,
      metodo: 'manual',
      identificacion: 'conocida',
    });
  });

  it('una placa que no puede ser placa se rechaza sin consultar', async () => {
    const m = await montar([]);
    const r = await m.caso.ejecutar(criterios({ placa: '¡¡' }));
    expect(r.ok).toBe(false);
    expect(m.consultar).not.toHaveBeenCalled();
  });
});

describe('D-145 · cada fila trae quién, dónde y cómo', () => {
  it('persona con su clase, vivienda y operador, resueltos en UNA llamada sin repetidos', async () => {
    const m = await montar([
      fila(1, { personaId: PERSONA, viviendaId: VIVIENDA, metodo: 'facial' }),
      fila(3, { personaId: PERSONA, viviendaId: VIVIENDA, operadorId: OPERADOR }),
    ]);
    const r = await m.caso.ejecutar(criterios({ tipo: 'acceso' }));
    if (!r.ok) throw new Error(r.error.detalle);
    expect(m.resolver).toHaveBeenCalledTimes(1);
    expect(m.resolver).toHaveBeenCalledWith(COP, {
      personas: [PERSONA],
      viviendas: [VIVIENDA],
      operadores: [OPERADOR],
    });
    expect(r.valor.elementos[0]).toMatchObject({
      persona: 'Laura Gómez',
      clasePersona: 'residente',
      vivienda: 'Casa 12',
      operador: 'Pedro Portero',
      placa: 'ABC123',
      metodo: 'placa',
    });
  });

  it('sin persona: «desconocida» es `null`, y el evento de equipo no inventa nada', async () => {
    const m = await montar([fila(1)]);
    const r = await m.caso.ejecutar(criterios());
    if (!r.ok) throw new Error(r.error.detalle);
    const acceso = r.valor.elementos.find((e) => e.origen === 'acceso');
    const equipo = r.valor.elementos.find((e) => e.origen === 'equipo');
    expect(acceso).toMatchObject({ personaId: null, persona: null, clasePersona: null });
    expect(equipo).toMatchObject({ metodo: null, placa: null, persona: null, operador: null });
  });
});

describe('D-145 · la exportación y el listado leen los mismos filtros', () => {
  it('criteriosDeAcceso traduce los nueve campos y deja `null` lo ausente', () => {
    expect(criteriosDeAcceso({ placa: 'abc-123', metodo: 'manual' })).toEqual({
      viviendaId: null,
      personaId: null,
      zonaId: null,
      resultado: null,
      motivo: null,
      placa: 'abc-123',
      operadorId: null,
      metodo: 'manual',
      identificacion: null,
    });
  });
});
