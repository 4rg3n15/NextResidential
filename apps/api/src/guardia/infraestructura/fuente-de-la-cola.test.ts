import { describe, expect, it } from 'vitest';
import type { FiltroDeEventos } from '@ncr/domain-core';
import type { EventoRegistrado, RepositorioEventos } from '../../eventos';
import { RepositorioEventosDeEquipoEnMemoria } from '../../eventos/infraestructura/repositorios-en-memoria';
import { BitacoraDeOrdenesEnMemoria } from './adaptadores-en-memoria';
import { FuenteDeLaColaPorPuertos, TOPE_DE_ACCESOS_EN_LA_VENTANA } from './fuente-de-la-cola';

/**
 * D-144 · con una hora en la cola, una portería con LPR puede negar más de una
 * página de accesos. La fuente recorre TODAS las páginas de la ventana —el
 * negado de hace 59 minutos sigue en la cola—, con un tope acotado.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-26T15:00:00.000Z');

const negado = (i: number, minutosAtras: number): EventoRegistrado => ({
  id: `neg-${String(i)}`,
  copropiedadId: COP,
  ocurridoEn: new Date(AHORA.getTime() - minutosAtras * 60_000),
  tipo: 'ingreso',
  resultado: 'negado',
  motivo: 'PLACA_DESCONOCIDA',
  metodo: 'placa',
  personaId: null,
  viviendaId: null,
  zonaId: null,
  dispositivoId: '90000000-0000-4000-8000-000000000001',
  placaDetectada: 'ABC123',
  confianza: 0.9,
  reglaAplicada: 'x',
  versionReglas: 1,
  operadorId: null,
  motivoManual: null,
  evidenciaId: null,
  decididoPorEdge: false,
});

/** Un repositorio que pagina como el de verdad: de lo más reciente a lo más antiguo. */
const paginado = (filas: readonly EventoRegistrado[]) => {
  const paginas: number[] = [];
  const repo: RepositorioEventos = {
    anexar: async () => {
      throw new Error('no se usa');
    },
    porId: async () => null,
    consultar: async (f: FiltroDeEventos) => {
      const desde = f.cursor === null ? 0 : Number(f.cursor);
      paginas.push(f.tamanoPagina);
      const pagina = filas.slice(desde, desde + f.tamanoPagina);
      const siguiente =
        desde + f.tamanoPagina < filas.length ? String(desde + f.tamanoPagina) : null;
      return { filas: pagina, siguiente };
    },
  };
  return { repo, paginas };
};

const fuente = (repo: RepositorioEventos) =>
  new FuenteDeLaColaPorPuertos(
    repo,
    new RepositorioEventosDeEquipoEnMemoria(),
    new BitacoraDeOrdenesEnMemoria(),
  );

describe('D-144 · la cola ve la hora entera, no la primera página', () => {
  it('con 450 negados en la hora, llegan los 450 y el de hace 59 minutos', async () => {
    const filas = Array.from({ length: 450 }, (_, i) => negado(i, (i * 59) / 449));
    const { repo, paginas } = paginado(filas);
    const m = await fuente(repo).material(COP, new Date(AHORA.getTime() - 3_600_000), AHORA);
    expect(m.accesos).toHaveLength(450);
    expect(m.accesos.map((a) => a.id)).toContain('neg-449');
    expect(paginas.length).toBe(3);
  });

  it('acotada: nunca más que el tope, por mucho que haya', async () => {
    const filas = Array.from({ length: TOPE_DE_ACCESOS_EN_LA_VENTANA + 500 }, (_, i) =>
      negado(i, 1),
    );
    const { repo } = paginado(filas);
    const m = await fuente(repo).material(COP, new Date(AHORA.getTime() - 3_600_000), AHORA);
    expect(m.accesos).toHaveLength(TOPE_DE_ACCESOS_EN_LA_VENTANA);
  });
});
