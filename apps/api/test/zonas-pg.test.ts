import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { Aforo, HorarioDeZona, Zona, esExito } from '@ncr/domain-core';
import {
  RepositorioAutorizacionesZonaPg,
  RepositorioZonasPg,
} from '../src/zonas/infraestructura/repositorio-zonas-pg';

/**
 * P1 (ETAPA 15-D) · las zonas persisten en PostgreSQL de verdad: alta, icono,
 * baja y permiso de zona, contra la base migrada. Se omite sin
 * `DATABASE_URL_PRUEBAS`, y el verificador lo dice.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-000000000001';
const ACTOR = '00000000-0000-4000-8000-000000000002';
const CORRIDA = randomBytes(4).toString('hex');
const claims = { rol: 'administrador', usuario_id: ACTOR, copropiedad_id: COP };

let pool: Pool | undefined;

beforeAll(() => {
  if (URL_BASE !== undefined) pool = new Pool({ connectionString: URL_BASE, max: 3 });
});
afterAll(async () => {
  await pool?.end();
});

const abrir = <T>(r: { ok: boolean; valor?: T }): T => {
  if (!r.ok || r.valor === undefined) throw new Error('resultado inesperado');
  return r.valor;
};

describe.skipIf(URL_BASE === undefined)('zonas en PostgreSQL (P1)', () => {
  it('una zona nueva se crea con su aforo a cero, se lista, cambia de icono y se da de baja', async () => {
    const repo = new RepositorioZonasPg(pool as Pool, claims);
    const id = `80000000-0000-4000-8000-${CORRIDA}0000`.slice(0, 36);
    const zona = abrir(
      Zona.crear({
        id,
        copropiedadId: COP,
        nombre: `Zona de prueba ${CORRIDA}`,
        tipo: 'peatonal',
        horario: abrir(HorarioDeZona.crear([], 0)),
        aforo: abrir(Aforo.crear(7, 0)),
        normas: ['Norma de prueba'],
      }),
    );
    await repo.guardar(zona, ACTOR);

    const leida = await repo.porId(COP, id);
    expect(leida?.nombre).toBe(`Zona de prueba ${CORRIDA}`);
    expect(leida?.tipo).toBe('peatonal');
    expect(leida?.aforo.maximo).toBe(7);
    expect(leida?.aforo.actual).toBe(0);
    expect(leida?.activa).toBe(true);

    // Guardar otra vez con otro máximo actualiza sin duplicar ni tocar el conteo.
    await repo.guardar(abrir(leida!.reconfigurar({ aforo: abrir(Aforo.crear(9, 0)) })), ACTOR);
    expect((await repo.porId(COP, id))?.aforo.maximo).toBe(9);

    await repo.fijarIcono(COP, id, 'trees', ACTOR);
    expect((await repo.presentacionDe(COP)).get(id)?.icono).toBe('trees');

    expect(await repo.desactivar(COP, id, 'Prueba de baja', ACTOR)).toBe(true);
    expect(await repo.desactivar(COP, id, 'Otra vez', ACTOR)).toBe(false);
    const deBaja = await repo.porId(COP, id);
    expect(deBaja?.activa).toBe(false);
    expect((await repo.listar(COP)).some((z) => z.id === id)).toBe(true);
  });

  it('el permiso de zona se persiste y no se duplica', async () => {
    const p = pool as Pool;
    const permisos = new RepositorioAutorizacionesZonaPg(p, claims);
    const { rows } = await p.query<{ id: string }>(
      `SELECT id FROM public.autorizaciones WHERE copropiedad_id = $1 LIMIT 1`,
      [COP],
    );
    const autorizacionId = rows[0]?.id;
    if (autorizacionId === undefined) throw new Error('la semilla no tiene autorizaciones');
    const zonaId = '80000000-0000-4000-8000-000000000002';
    const primera = await permisos.autorizar(COP, autorizacionId, zonaId, ACTOR);
    const segunda = await permisos.autorizar(COP, autorizacionId, zonaId, ACTOR);
    expect(segunda).toBe(false);
    expect(primera === true || (await permisos.zonasDe(COP, autorizacionId)).includes(zonaId)).toBe(
      true,
    );
    expect(esExito(Aforo.crear(1, 0))).toBe(true);
  });
});
