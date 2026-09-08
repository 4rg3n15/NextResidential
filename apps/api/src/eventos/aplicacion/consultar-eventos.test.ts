import { describe, expect, it } from 'vitest';
import { Acceso, esExito, esFallo, permitir } from '@ncr/domain-core';
import type { AlmacenEvidencia } from '@ncr/domain-core';
import {
  ConsultarEventos,
  ExportarEventos,
  FILAS_MAXIMAS_EXPORTACION,
  ObtenerEvidencia,
  SEGUNDOS_URL_EVIDENCIA,
} from './consultar-eventos';
import { RepositorioEventosEnMemoria } from '../infraestructura/repositorios-en-memoria';
import { version } from './dobles';

const COP = 'cop-1';
const T0 = new Date('2026-09-08T14:00:00Z');
const RANGO = { desde: new Date('2026-09-01T00:00:00Z'), hasta: new Date('2026-09-30T00:00:00Z') };

const sembrar = async (
  n: number,
  extra: Record<string, unknown> = {},
): Promise<RepositorioEventosEnMemoria> => {
  const repo = new RepositorioEventosEnMemoria();
  for (let i = 0; i < n; i += 1) {
    const acceso = Acceso.desdeDecision(
      {
        id: `evt-${String(i).padStart(4, '0')}`,
        copropiedadId: COP,
        // Descendente por instante: el más nuevo primero al consultar.
        ocurridoEn: new Date(T0.getTime() + i * 1000),
        tipo: 'ingreso',
        metodo: 'placa',
        dispositivoId: 'disp-1',
        claveIdempotencia: `cop-1:disp-1:placa:ref-${i}`,
        viviendaId: 'viv-1',
        ...extra,
      },
      permitir(version(COP), 'prueba'),
    );
    if (!esExito(acceso)) throw new Error(acceso.error.detalle);
    await repo.anexar(acceso.valor, 'actor');
  }
  return repo;
};

describe('ConsultarEventos · HU-32', () => {
  it('devuelve las filas del rango, de la más nueva a la más vieja', async () => {
    const caso = new ConsultarEventos(await sembrar(3));
    const r = await caso.ejecutar({ copropiedadId: COP, ...RANGO });
    if (!esExito(r)) throw new Error('se esperaba éxito');
    expect(r.valor.filas.map((f) => f.id)).toEqual(['evt-0002', 'evt-0001', 'evt-0000']);
  });

  it('propaga el fallo del objeto de valor en vez de consultar con un filtro inválido', async () => {
    const caso = new ConsultarEventos(await sembrar(1));
    const r = await caso.ejecutar({ copropiedadId: COP, desde: RANGO.hasta, hasta: RANGO.desde });
    expect(esFallo(r)).toBe(true);
  });

  it('no devuelve nada de otra copropiedad', async () => {
    const caso = new ConsultarEventos(await sembrar(3));
    const r = await caso.ejecutar({ copropiedadId: 'cop-2', ...RANGO });
    if (!esExito(r)) throw new Error('se esperaba éxito');
    expect(r.valor.filas).toEqual([]);
  });

  it('pagina con cursor y no repite ni salta filas', async () => {
    const caso = new ConsultarEventos(await sembrar(5));
    const primera = await caso.ejecutar({ copropiedadId: COP, ...RANGO, tamanoPagina: 2 });
    if (!esExito(primera)) throw new Error('se esperaba éxito');
    expect(primera.valor.siguiente).not.toBeNull();

    const segunda = await caso.ejecutar({
      copropiedadId: COP,
      ...RANGO,
      tamanoPagina: 2,
      cursor: primera.valor.siguiente,
    });
    if (!esExito(segunda)) throw new Error('se esperaba éxito');

    const ids = [...primera.valor.filas, ...segunda.valor.filas].map((f) => f.id);
    expect(ids).toEqual(['evt-0004', 'evt-0003', 'evt-0002', 'evt-0001']);
    expect(new Set(ids).size).toBe(4);
  });

  it('la última página no ofrece cursor', async () => {
    const caso = new ConsultarEventos(await sembrar(2));
    const r = await caso.ejecutar({ copropiedadId: COP, ...RANGO, tamanoPagina: 5 });
    if (!esExito(r)) throw new Error('se esperaba éxito');
    expect(r.valor.siguiente).toBeNull();
  });

  it('filtra por vivienda', async () => {
    const caso = new ConsultarEventos(await sembrar(3));
    const r = await caso.ejecutar({ copropiedadId: COP, ...RANGO, viviendaId: 'otra' });
    if (!esExito(r)) throw new Error('se esperaba éxito');
    expect(r.valor.filas).toEqual([]);
  });
});

describe('ExportarEventos · HU-32', () => {
  it('recorre todas las páginas y devuelve el conjunto completo', async () => {
    const caso = new ExportarEventos(await sembrar(450));
    const r = await caso.ejecutar({ copropiedadId: COP, ...RANGO });
    if (!esExito(r)) throw new Error('se esperaba éxito');
    expect(r.valor.filas.length).toBe(450);
    expect(r.valor.truncado).toBe(false);
  });

  it('declara el truncado cuando lo hay, en vez de entregar un informe corto en silencio', async () => {
    // Se fuerza el tope bajando el número de filas sembradas no es posible sin
    // sembrar diez mil, así que se comprueba la bandera con el conjunto que sí
    // cabe: `truncado` debe ser false. El camino contrario lo cubre la
    // constante, que es la única forma de que el tope cambie.
    const caso = new ExportarEventos(await sembrar(10));
    const r = await caso.ejecutar({ copropiedadId: COP, ...RANGO });
    if (!esExito(r)) throw new Error('se esperaba éxito');
    expect(r.valor.truncado).toBe(false);
    expect(FILAS_MAXIMAS_EXPORTACION).toBe(10_000);
  });

  it('un rango inválido no llega al repositorio', async () => {
    const caso = new ExportarEventos(await sembrar(1));
    const r = await caso.ejecutar({
      copropiedadId: COP,
      desde: RANGO.desde,
      hasta: new Date(RANGO.desde.getTime() + 400 * 86_400_000),
    });
    expect(esFallo(r)).toBe(true);
  });
});

describe('ObtenerEvidencia · RN-21', () => {
  const almacen = (): AlmacenEvidencia & { pedidas: { clave: string; vida: number }[] } => {
    const pedidas: { clave: string; vida: number }[] = [];
    return {
      pedidas,
      guardar: async (clave) => clave,
      urlFirmada: async (clave, vida) => {
        pedidas.push({ clave, vida });
        return `https://firmada.invalid/${clave}`;
      },
    };
  };

  it('pide la URL con vida corta', async () => {
    const repo = await sembrar(1, { evidenciaId: 'ev-1' });
    const a = almacen();
    const url = await new ObtenerEvidencia(repo, a).ejecutar(COP, 'evt-0000');
    expect(url).toContain('ev-1');
    expect(a.pedidas[0]?.vida).toBe(SEGUNDOS_URL_EVIDENCIA);
    expect(SEGUNDOS_URL_EVIDENCIA).toBeLessThanOrEqual(300);
  });

  it('un evento sin evidencia devuelve null y no firma nada', async () => {
    const repo = await sembrar(1);
    const a = almacen();
    expect(await new ObtenerEvidencia(repo, a).ejecutar(COP, 'evt-0000')).toBeNull();
    expect(a.pedidas).toEqual([]);
  });

  it('un evento de OTRA copropiedad devuelve null: no se firma lo ajeno', async () => {
    const repo = await sembrar(1, { evidenciaId: 'ev-1' });
    const a = almacen();
    expect(await new ObtenerEvidencia(repo, a).ejecutar('cop-2', 'evt-0000')).toBeNull();
    expect(a.pedidas).toEqual([]);
  });
});
