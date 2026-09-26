import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { esExito, esFallo } from '@ncr/domain-core';
import type { GeneradorDeId, Reloj } from '@ncr/domain-core';
import { RepositorioAutorizacionesPg } from '../src/autorizaciones/infraestructura/repositorio-autorizaciones-pg';
import {
  CrearAutorizacion,
  ModificarAutorizacion,
} from '../src/autorizaciones/aplicacion/casos-de-uso';
import { RepositorioPadronPg } from '../src/padron/infraestructura/repositorio-pg';
import type { ContextoTenant } from '../src/autenticacion/dominio/claims';

/**
 * O3 · la autorización creada DESDE LA CONSOLA contra base real.
 *
 * D-131 · hasta la 15-D, `guardar` escribía el identificador del USUARIO de la
 * consola en `autorizado_por`, y el disparador `tg_autorizacion_coherente`
 * (RN-05) lo rechazaba: ninguna autorización creada por un administrador o un
 * portero llegaba a existir contra una base real. Las pruebas con dobles no lo
 * veían. Esta sí: aquí el disparador está, y decide.
 *
 * Se OMITE si no hay base, y lo dice: una omisión no es un verde.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-000000000001';
const VIVIENDA_CON_TITULAR = '30000000-0000-4000-8000-000000000001';
const CORRIDA = randomBytes(3).toString('hex').toUpperCase();

let pool: Pool | undefined;
let disponible = false;
let actorId = '';
let personaId = '';

const reloj: Reloj = { ahora: () => new Date() };
const ids: GeneradorDeId = { nuevo: () => randomUUID() };
const ctx = (): ContextoTenant => ({
  usuarioId: actorId,
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
});
const enHoras = (h: number): string => new Date(Date.now() + h * 3600 * 1000).toISOString();

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    const usuario = await pool.query<{ id: string }>(
      `SELECT id FROM public.usuarios WHERE copropiedad_id = $1 ORDER BY id LIMIT 1`,
      [COP],
    );
    const persona = await pool.query<{ id: string }>(
      `SELECT id FROM public.personas WHERE copropiedad_id = $1 ORDER BY id LIMIT 1`,
      [COP],
    );
    actorId = usuario.rows[0]?.id ?? '';
    personaId = persona.rows[0]?.id ?? '';
    disponible = actorId !== '' && personaId !== '';
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  await pool?.end();
});

describe('O3 · autorizaciones de la consola contra base (D-131, S-38, RN-05)', () => {
  it('la base de pruebas contesta', () => {
    if (!URL_BASE) return;
    expect(disponible, 'DATABASE_URL_PRUEBAS definida pero la base no contesta').toBe(true);
  });

  let autorizacionId = '';

  it('un administrador crea: `autorizado_por` es el TITULAR de la vivienda y `creado_por` es él', async () => {
    if (!disponible || pool === undefined) return;
    const repo = new RepositorioAutorizacionesPg(pool, {}, 'bucket-de-prueba', reloj);
    const r = await new CrearAutorizacion(repo, reloj, ids).ejecutar(ctx(), {
      viviendaId: VIVIENDA_CON_TITULAR,
      personaId,
      desde: enHoras(-1),
      hasta: enHoras(24),
      placa: `au-${CORRIDA}`,
      observaciones: `Prueba O3 ${CORRIDA}`,
    });
    expect(esExito(r), esFallo(r) ? r.error.detalle : '').toBe(true);
    if (!esExito(r)) return;
    autorizacionId = r.valor.id;

    const { rows } = await pool.query<{
      autorizado_por: string;
      creado_por: string;
      placa: string;
      permite_acceso_vehicular: boolean;
      observaciones: string;
      es_titular: boolean;
      vivienda_id: string;
    }>(
      `SELECT a.autorizado_por, a.creado_por, a.placa, a.permite_acceso_vehicular,
              a.observaciones, r.es_titular, r.vivienda_id
         FROM public.autorizaciones a
         JOIN public.residentes r ON r.copropiedad_id = a.copropiedad_id AND r.id = a.autorizado_por
        WHERE a.copropiedad_id = $1 AND a.id = $2`,
      [COP, autorizacionId],
    );
    const fila = rows[0];
    expect(fila?.creado_por).toBe(actorId);
    expect(fila?.es_titular).toBe(true);
    expect(fila?.vivienda_id).toBe(VIVIENDA_CON_TITULAR);
    expect(fila?.placa).toBe(`AU${CORRIDA}`);
    expect(fila?.permite_acceso_vehicular).toBe(true);
    expect(fila?.observaciones).toBe(`Prueba O3 ${CORRIDA}`);
  });

  it('el motor la encuentra por la placa (D-25): `activasParaLectura` la rehidrata entera', async () => {
    if (!disponible || pool === undefined || autorizacionId === '') return;
    const repo = new RepositorioAutorizacionesPg(pool, {}, 'bucket-de-prueba', reloj);
    const activas = await repo.activasParaLectura(COP, { placa: `AU${CORRIDA}`, personaId: null });
    const mia = activas.find((a) => a.id === autorizacionId);
    expect(mia?.placa?.valor).toBe(`AU${CORRIDA}`);
    expect(mia?.observaciones).toBe(`Prueba O3 ${CORRIDA}`);
    const porId = await repo.porId(COP, autorizacionId);
    expect(porId?.placa?.valor).toBe(`AU${CORRIDA}`);
  });

  it('modificar: quita la placa (y el acceso vehicular con ella), cambia observaciones y fin', async () => {
    if (!disponible || pool === undefined || autorizacionId === '') return;
    const repo = new RepositorioAutorizacionesPg(pool, {}, 'bucket-de-prueba', reloj);
    const r = await new ModificarAutorizacion(repo, reloj).ejecutar(ctx(), autorizacionId, {
      placa: null,
      observaciones: 'Modificada',
      hasta: enHoras(48),
    });
    expect(esExito(r), esFallo(r) ? r.error.detalle : '').toBe(true);
    const { rows } = await pool.query<{
      placa: string | null;
      permite_acceso_vehicular: boolean;
      observaciones: string;
      autorizado_por: string;
    }>(
      `SELECT placa, permite_acceso_vehicular, observaciones, autorizado_por
         FROM public.autorizaciones WHERE copropiedad_id = $1 AND id = $2`,
      [COP, autorizacionId],
    );
    expect(rows[0]?.placa).toBeNull();
    expect(rows[0]?.permite_acceso_vehicular).toBe(false);
    expect(rows[0]?.observaciones).toBe('Modificada');
    const releida = await repo.porId(COP, autorizacionId);
    expect(releida?.vigencia.hasta.getTime()).toBeGreaterThan(Date.now() + 47 * 3600 * 1000);
  });

  it('la fotografía queda como fila de `evidencias` (referencia, nunca URL) y la lista lo dice', async () => {
    if (!disponible || pool === undefined || autorizacionId === '') return;
    const repo = new RepositorioAutorizacionesPg(pool, {}, 'bucket-de-prueba', reloj);
    const clave = `visitantes/${COP}/${autorizacionId}/${randomUUID()}.jpg`;
    const hash = 'a'.repeat(64);
    const enlazada = await repo.adjuntarFotografia(
      COP,
      autorizacionId,
      { clave, tipoMime: 'image/jpeg', hashSha256: hash, tamanoBytes: 11 },
      actorId,
    );
    expect(enlazada).toBe(true);
    expect(await repo.fotografiaDe(COP, autorizacionId)).toEqual({ clave, tipoMime: 'image/jpeg' });

    const { rows } = await pool.query<{ bucket: string; ruta: string; tipo: string }>(
      `SELECT e.bucket, e.ruta, e.tipo::text AS tipo
         FROM public.autorizaciones a
         JOIN public.evidencias e ON e.copropiedad_id = a.copropiedad_id AND e.id = a.evidencia_foto_id
        WHERE a.copropiedad_id = $1 AND a.id = $2`,
      [COP, autorizacionId],
    );
    expect(rows[0]).toEqual({ bucket: 'bucket-de-prueba', ruta: clave, tipo: 'foto_visitante' });

    const lista = await repo.listar(COP, 'activas');
    expect(lista.find((a) => a.id === autorizacionId)?.tieneFotografia).toBe(true);
    // Una autorización de otra copropiedad no se enlaza: el filtro de aplicación.
    expect(
      await repo.adjuntarFotografia(
        '10000000-0000-4000-8000-000000000002',
        autorizacionId,
        { clave: `${clave}.otra`, tipoMime: 'image/jpeg', hashSha256: hash, tamanoBytes: 11 },
        actorId,
      ),
    ).toBe(false);
  });

  it('una vivienda SIN titular activo no puede recibir autorizaciones desde la consola (RN-05)', async () => {
    if (!disponible || pool === undefined) return;
    const padron = new RepositorioPadronPg(pool, {});
    const vivienda = await padron.registrarVivienda({
      copropiedadId: COP,
      identificador: `ST${CORRIDA}`,
      agrupacion: 'Z',
      actorId,
    });
    if (vivienda.tipo !== 'registrada') throw new Error('no se pudo crear la vivienda de prueba');
    const repo = new RepositorioAutorizacionesPg(pool, {}, 'bucket-de-prueba', reloj);
    const r = await new CrearAutorizacion(repo, reloj, ids).ejecutar(ctx(), {
      viviendaId: vivienda.id,
      personaId,
      desde: enHoras(-1),
      hasta: enHoras(24),
    });
    expect(esFallo(r) && r.error.codigo).toBe('INVARIANTE_VIOLADA');
    expect(esFallo(r) && r.error.detalle).toMatch(/titular/);
  });
});
