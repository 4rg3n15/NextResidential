import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { FiltroDeEventos, esExito } from '@ncr/domain-core';
import { RepositorioEventosPgDeServicio } from './repositorio-eventos-pg-de-servicio';

/**
 * Lo que este envoltorio AFIRMA: que cada consulta fija en la conexión los
 * claims de SERVICIO de la copropiedad de ESA llamada, y no unos fijos. Se
 * prueba con un `Pool` falso que anota lo que recibe: la sentencia SQL real se
 * ejercita en `test/eventos-pg.test.ts` contra base.
 */
const poolFalso = () => {
  const sentencias: { texto: string; parametros: unknown[] }[] = [];
  const cliente = {
    query: async (texto: string, parametros: unknown[] = []) => {
      sentencias.push({ texto, parametros });
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  return { sentencias, pool: { connect: async () => cliente } as unknown as Pool };
};

const COP = '10000000-0000-4000-8000-000000000001';

describe('RepositorioEventosPgDeServicio', () => {
  it('fija los claims de servicio de la copropiedad de la LLAMADA antes de consultar', async () => {
    const { pool, sentencias } = poolFalso();
    const repo = new RepositorioEventosPgDeServicio(pool);
    await repo.porId(COP, '20000000-0000-4000-8000-000000000001');

    const claims = sentencias.find((s) => s.texto.includes('request.jwt.claims'));
    expect(claims).toBeDefined();
    const valor = JSON.parse(String(claims?.parametros[0])) as Record<string, unknown>;
    expect(valor['rol']).toBe('servicio');
    expect(valor['copropiedad_id']).toBe(COP);
    expect(valor['copropiedades']).toEqual([COP]);
  });

  it('con otra copropiedad, otros claims: nunca «para todas»', async () => {
    const { pool, sentencias } = poolFalso();
    const repo = new RepositorioEventosPgDeServicio(pool);
    const OTRA = '10000000-0000-4000-8000-000000000002';
    const filtro = FiltroDeEventos.crear({
      copropiedadId: OTRA,
      desde: new Date('2026-09-25T00:00:00Z'),
      hasta: new Date('2026-09-25T23:59:59Z'),
      tamanoPagina: 10,
    });
    if (!esExito(filtro)) throw new Error('filtro inválido en la prueba');
    await repo.consultar(filtro.valor);

    const claims = sentencias.find((s) => s.texto.includes('request.jwt.claims'));
    const valor = JSON.parse(String(claims?.parametros[0])) as Record<string, unknown>;
    expect(valor['copropiedad_id']).toBe(OTRA);
  });
});
