import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { Acceso, FiltroDeEventos, VersionDeReglas, esExito, permitir } from '@ncr/domain-core';
import type { CriteriosDeEventos, HechoDeAcceso } from '@ncr/domain-core';
import { RepositorioEventosPg } from '../src/eventos/infraestructura/repositorio-eventos-pg';
import { ResolutorDeNombresPg } from '../src/eventos/infraestructura/resolutor-de-nombres-pg';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * D-145 · EL BUSCADOR DE EVENTOS CONTRA UNA BASE REAL
 *
 * Cada filtro nuevo —placa, operador, método, identificación— sobre filas
 * que escribe el adaptador de la aplicación, y lo que no puede pasar:
 *   · una placa escrita con guiones o en minúsculas encuentra la normalizada;
 *   · ningún filtro cruza copropiedades, ni por el filtro ni por la RLS;
 *   · los nombres se resuelven sólo dentro de la copropiedad;
 *   · nada de esto escribe en `eventos` (RN-03): no hay UPDATE ni DELETE.
 *
 * Otras suites anexan en la misma copropiedad a la vez: las aserciones miran
 * las filas de ESTA corrida (placa y claves únicas) o que TODAS las devueltas
 * cumplen el filtro, nunca un total.
 */
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();
const COP = '10000000-0000-4000-8000-000000000001';
const COP_AJENA = '10000000-0000-4000-8000-000000000002';
const PLACA = `B${CORRIDA}`;

let pool: Pool | undefined;
let disponible = false;
let actorId = '';
let dispositivoId = '';
let viviendaId = '';
let personaId = '';
let idPlaca = '';
let idRostro = '';
let idManual = '';

const claims = (copropiedadId = COP): Record<string, unknown> => ({
  rol: 'administrador',
  usuario_id: actorId,
  copropiedad_id: copropiedadId,
});

const acceso = (extra: Partial<HechoDeAcceso>): Acceso => {
  const version = VersionDeReglas.crear(1, COP);
  if (!esExito(version)) throw new Error('versión inválida');
  const a = Acceso.desdeDecision(
    {
      id: randomUUID(),
      copropiedadId: COP,
      ocurridoEn: new Date(),
      tipo: 'ingreso',
      metodo: 'placa',
      dispositivoId,
      viviendaId,
      claveIdempotencia: `buscador-${CORRIDA}-${randomUUID()}`,
      ...extra,
    },
    permitir(version.valor, 'prueba.buscador'),
  );
  if (!esExito(a)) throw new Error(`hecho inválido: ${a.error.detalle}`);
  return a.valor;
};

const buscar = async (
  extra: Partial<CriteriosDeEventos>,
  copropiedadId = COP,
  claimsDe = COP,
): Promise<
  readonly { id: string; personaId: string | null; operadorId: string | null; metodo: string }[]
> => {
  const filtro = FiltroDeEventos.crear({
    copropiedadId,
    desde: new Date(Date.now() - 10 * 60_000),
    hasta: new Date(Date.now() + 10 * 60_000),
    tamanoPagina: 200,
    ...extra,
  });
  if (!esExito(filtro)) throw new Error(`filtro inválido: ${filtro.error.detalle}`);
  return (await new RepositorioEventosPg(pool as Pool, claims(claimsDe)).consultar(filtro.valor))
    .filas;
};

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    pool = new Pool({ connectionString: URL_BASE, max: 4 });
    const c = await pool.connect();
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        rol: 'administrador',
        usuario_id: '00000000-0000-4000-8000-000000000010',
        copropiedad_id: COP,
      }),
    ]);
    const uno = async (sql: string): Promise<string> =>
      (await c.query<{ id: string }>(sql, [COP])).rows[0]?.id ?? '';
    actorId = await uno('SELECT id FROM public.usuarios WHERE copropiedad_id=$1 LIMIT 1');
    dispositivoId = await uno('SELECT id FROM public.dispositivos WHERE copropiedad_id=$1 LIMIT 1');
    viviendaId = await uno(
      "SELECT id FROM public.viviendas WHERE copropiedad_id=$1 AND estado='activo' LIMIT 1",
    );
    personaId = await uno(
      'SELECT persona_id AS id FROM public.residentes WHERE copropiedad_id=$1 LIMIT 1',
    );
    c.release();
    if (!(actorId && dispositivoId && viviendaId && personaId)) return;

    const repo = new RepositorioEventosPg(pool, claims());
    const placa = acceso({ placaDetectada: PLACA });
    const rostro = acceso({ metodo: 'facial', personaId, placaDetectada: null });
    const manual = acceso({
      tipo: 'manual',
      metodo: 'manual',
      operadorId: actorId,
      motivoManual: 'Prueba del buscador',
      placaDetectada: null,
    });
    for (const a of [placa, rostro, manual]) await repo.anexar(a, actorId);
    [idPlaca, idRostro, idManual] = [placa.id, rostro.id, manual.id];
    disponible = true;
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  await pool?.end();
});

exigirBase('sin DATABASE_URL_PRUEBAS o sin semillas', () => disponible);
const omitida = (): boolean => !disponible;

describe('D-145 · cada filtro nuevo del buscador', () => {
  it('placa: la escrita con guion y en minúsculas encuentra la normalizada', async () => {
    if (omitida()) return;
    const escrita = `${PLACA.slice(0, 3)}-${PLACA.slice(3)}`.toLowerCase();
    expect((await buscar({ placa: escrita })).map((f) => f.id)).toEqual([idPlaca]);
    expect((await buscar({ placa: PLACA })).map((f) => f.id)).toEqual([idPlaca]);
  });

  it('operador: sólo lo que abrió o negó a mano esa persona', async () => {
    if (omitida()) return;
    const filas = await buscar({ operadorId: actorId });
    expect(filas.map((f) => f.id)).toContain(idManual);
    expect(filas.every((f) => f.operadorId === actorId)).toBe(true);
  });

  it('método: el del dominio, traducido al enumerado de la base', async () => {
    if (omitida()) return;
    const filas = await buscar({ metodo: 'facial' });
    expect(filas.map((f) => f.id)).toContain(idRostro);
    expect(filas.every((f) => f.metodo === 'facial')).toBe(true);
    expect(filas.map((f) => f.id)).not.toContain(idPlaca);
  });

  it('identificación: conocida (con persona) y desconocida (sin ella)', async () => {
    if (omitida()) return;
    const conocidas = await buscar({ identificacion: 'conocida' });
    expect(conocidas.map((f) => f.id)).toContain(idRostro);
    expect(conocidas.every((f) => f.personaId !== null)).toBe(true);
    const desconocidas = await buscar({ identificacion: 'desconocida' });
    expect(desconocidas.map((f) => f.id)).toEqual(expect.arrayContaining([idPlaca, idManual]));
    expect(desconocidas.every((f) => f.personaId === null)).toBe(true);
  });
});

describe('D-145 · ningún filtro cruza copropiedades', () => {
  it('la misma placa desde otra copropiedad no encuentra nada', async () => {
    if (omitida()) return;
    expect(await buscar({ placa: PLACA }, COP_AJENA, COP_AJENA)).toEqual([]);
  });

  it('y con el filtro de otra copropiedad y claims propios, la RLS tampoco deja', async () => {
    if (omitida()) return;
    expect(await buscar({ placa: PLACA }, COP_AJENA, COP)).toEqual([]);
    expect(await buscar({ operadorId: actorId }, COP_AJENA, COP)).toEqual([]);
  });

  it('los nombres se resuelven en la copropiedad del evento, y en otra no', async () => {
    if (omitida()) return;
    const resolutor = new ResolutorDeNombresPg(pool as Pool);
    const ids = { personas: [personaId], viviendas: [viviendaId], operadores: [actorId] };
    const propios = await resolutor.resolver(COP, ids);
    expect(propios.personas.get(personaId)?.clase).toBe('residente');
    expect(propios.personas.get(personaId)?.nombre.length).toBeGreaterThan(0);
    expect(propios.viviendas.get(viviendaId)?.length).toBeGreaterThan(0);
    expect(propios.operadores.get(actorId)?.length).toBeGreaterThan(0);
    const ajenos = await resolutor.resolver(COP_AJENA, ids);
    expect([ajenos.personas.size, ajenos.viviendas.size, ajenos.operadores.size]).toEqual([
      0, 0, 0,
    ]);
  });
});

describe('D-145 · el buscador no escribe en eventos (RN-03, CA-23)', () => {
  it('ni el repositorio, ni el resolutor, ni la 0059 tienen UPDATE o DELETE', () => {
    const raiz = resolve(__dirname, '..', '..', '..');
    for (const fichero of [
      'apps/api/src/eventos/infraestructura/repositorio-eventos-pg.ts',
      'apps/api/src/eventos/infraestructura/resolutor-de-nombres-pg.ts',
      'supabase/migrations/20261026120000_0059_indices_del_buscador_de_eventos.sql',
    ]) {
      const codigo = readFileSync(resolve(raiz, fichero), 'utf8')
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*|--)/.test(l))
        .join('\n');
      expect(codigo, fichero).not.toMatch(/\b(UPDATE|DELETE)\b/);
    }
  });
});
