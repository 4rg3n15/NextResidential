import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import { RELOJ } from '@ncr/domain-core';
import { relojFijo } from '../src/eventos/aplicacion/dobles';
import { claimsDeServicio } from '../src/comun/claims-de-servicio';
import { SERVICIO_POR_COPROPIEDAD } from '../src/comun/claims-por-operacion';
import { RepositorioPadronPg } from '../src/padron/infraestructura/repositorio-pg';
import {
  RepositorioAutorizacionesZonaPg,
  RepositorioZonasPg,
} from '../src/zonas/infraestructura/repositorio-zonas-pg';
import { RepositorioAutorizacionesPg } from '../src/autorizaciones/infraestructura/repositorio-autorizaciones-pg';
import { DirectorioDelResidentePg } from '../src/residente/infraestructura/directorio-pg';
import { AutorizacionesDelResidentePg } from '../src/residente/infraestructura/autorizaciones-pg';
import { ZonasDelResidentePg } from '../src/residente/infraestructura/zonas-pg';
import { NotificacionesDelResidentePg } from '../src/residente/infraestructura/notificaciones-pg';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E2 · DT-15K-02 · LOS OCHO ADAPTADORES, CON UN ROL SUJETO A LA RLS
 *
 * La API se conecta con un rol que omite la RLS, y ocho adaptadores se
 * construían con claims `{}`: funcionaban SÓLO por eso (S-62). Aquí cada
 * conexión hace `SET ROLE authenticated` —sin `BYPASSRLS`—, que es lo que
 * vería un rol de aplicación dedicado (`app_api`, procedimiento de operador):
 *
 *  · con `SERVICIO_POR_COPROPIEDAD` cada uno lee y escribe SU copropiedad;
 *  · con `{}` (lo de antes) el padrón sale vacío: la RLS sí filtra, así que la
 *    prueba distingue el arreglo del defecto;
 *  · camino RLS del aislamiento: los claims de servicio de A no leen nada de B;
 *  · camino de aplicación: el administrador de B pide la ruta de A y recibe 404.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const RESIDENTE = '00000000-0000-4000-8000-000000000013';
const VIVIENDA_DEL_RESIDENTE = '30000000-0000-4000-8000-000000000042';
const AMBITO = { copropiedadId: COP_A, viviendaId: VIVIENDA_DEL_RESIDENTE } as const;
const ANTES = { estado: 'activo' } as const;
let rls: Pool | undefined;
let disponible = false;

beforeAll(async () => {
  if (!URL_BASE) return;
  rls = new Pool({ connectionString: URL_BASE, max: 3 });
  rls.on('connect', (c) => void c.query('SET ROLE authenticated'));
  try {
    await rls.query('SELECT 1 FROM public.viviendas LIMIT 1');
    disponible = true;
  } catch {
    disponible = false;
  }
});
afterAll(async () => {
  await rls?.end();
});

// H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
exigirBase('sin DATABASE_URL_PRUEBAS', () => disponible);

const pool = (): Pool => rls as Pool;

describe('E2 · con claims de servicio por copropiedad, la RLS deja ver lo propio', () => {
  it('padrón: las viviendas de A; con `{}` (antes) no se veía ninguna', async () => {
    if (!disponible) return;
    const ahora = await new RepositorioPadronPg(pool(), SERVICIO_POR_COPROPIEDAD).listarViviendas(
      COP_A,
      ANTES,
    );
    expect(ahora.viviendas.length).toBeGreaterThan(0);
    const antes = await new RepositorioPadronPg(pool(), {}).listarViviendas(COP_A, ANTES);
    expect(antes.viviendas).toHaveLength(0);
  });

  it('zonas y zonas de una autorización, de A', async () => {
    if (!disponible) return;
    expect(
      (await new RepositorioZonasPg(pool(), SERVICIO_POR_COPROPIEDAD).listar(COP_A)).length,
    ).toBeGreaterThan(0);
    const azp = new RepositorioAutorizacionesZonaPg(pool(), SERVICIO_POR_COPROPIEDAD);
    expect(await azp.zonasDe(COP_A, '00000000-0000-4000-8000-0000000000ff')).toEqual([]);
  });

  it('autorizaciones de A (la lista se lee sin error bajo RLS)', async () => {
    if (!disponible) return;
    const repo = new RepositorioAutorizacionesPg(
      pool(),
      SERVICIO_POR_COPROPIEDAD,
      'en-memoria',
      relojFijo(new Date()),
    );
    expect(Array.isArray(await repo.listar(COP_A, 'historial'))).toBe(true);
  });

  it('residente: su vínculo, su vivienda, sus zonas y lo que necesita para autorizar', async () => {
    if (!disponible) return;
    const directorio = new DirectorioDelResidentePg(pool());
    expect(await directorio.vinculoDe(RESIDENTE, COP_A)).toMatchObject({
      copropiedadId: COP_A,
      viviendaId: VIVIENDA_DEL_RESIDENTE,
    });
    expect(await directorio.vinculoDe(RESIDENTE, null)).toBeNull();
    expect(await directorio.vivienda(AMBITO)).not.toBeNull();
    expect(Array.isArray(await new ZonasDelResidentePg(pool()).zonas(AMBITO, new Date()))).toBe(
      true,
    );
    const hechos = await new AutorizacionesDelResidentePg(pool()).hechosParaAutorizar(AMBITO, {
      documento: null,
      placa: null,
    });
    expect(hechos).toBeDefined();
  });

  it('residente: registrar el aparato de notificaciones escribe bajo RLS', async () => {
    if (!disponible) return;
    const r = await new NotificacionesDelResidentePg(pool()).registrarToken(COP_A, RESIDENTE, {
      instalacionId: `e2-${String(Date.now())}`,
      token: `token-de-prueba-e2-${String(Date.now())}`,
      plataforma: 'android',
    });
    expect(r.id).toMatch(/[0-9a-f-]{36}/);
  });
});

describe('E2 · aislamiento por los dos caminos', () => {
  it('RLS: con los claims de servicio de A, el padrón de B sale vacío', async () => {
    if (!disponible) return;
    const deA = new RepositorioPadronPg(pool(), claimsDeServicio(COP_A));
    expect((await deA.listarViviendas(COP_B, ANTES)).viviendas).toHaveLength(0);
    const deB = new RepositorioPadronPg(pool(), SERVICIO_POR_COPROPIEDAD);
    expect((await deB.listarViviendas(COP_B, ANTES)).viviendas.length).toBeGreaterThan(0);
  });

  it('aplicación: el administrador de B pide el padrón de A y recibe 404', async () => {
    if (!disponible) return;
    const firmante = await crearFirmante();
    const app: INestApplication = await crearApp(
      firmante,
      (b) => b.overrideProvider(RELOJ).useValue(relojFijo(new Date())),
      {
        PERSISTENCIA_DE_EVENTOS: 'postgres',
        DATABASE_URL: URL_BASE ?? '',
        DATABASE_POOLER_URL: URL_BASE ?? '',
      },
    );
    try {
      const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
      await request(app.getHttpServer())
        .get(`/copropiedades/${COP_A}/padron/viviendas`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    } finally {
      await app.close();
    }
  });
});
