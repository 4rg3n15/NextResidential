import { afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { crearApp, crearFirmante, direccionDe, tokenDe } from '../utilidades';
import type { Firmante } from '../utilidades';
import { BITACORA } from '@ncr/domain-core';
import { PROVEEDOR_DIRECTO } from '../../src/proveedores/proveedores.module';
import { CONFIGURACION } from '../../src/configuracion/configuracion.module';
import { CREDENCIALES_EN_EL_EDGE } from '../../src/comun/credenciales-en-el-edge';
import * as conEdge from '../../src/equipos/infraestructura/composicion-con-edge';
import type { DatosDeSondeo, RepositorioDeEquipos, SondaDeEquipo } from '../../src/equipos';
import { conHijo, guardianDeEquipos } from './banco-del-padre';
import type { Hijo } from './banco-del-padre';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · DoD · EL MONTAJE: la API real contra PostgreSQL en ESTE proceso, con
 * su proveedor DIRECTO sustituido por el guardián, y el Edge puente en OTRO
 * (`edge-hijo.ts`). Lo único que los une es el túnel que el Edge abre.
 *
 * Una copropiedad NUEVA por corrida: marcar un puente en la de la semilla
 * desviaría por el Edge las suites que corren a la vez contra la misma base.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const SUFIJO = randomBytes(3).toString('hex').toUpperCase();
const SUPER = '00000000-0000-4000-8000-000000000002';
export const VP = { usuario: 'servicio', clave: 'clave-del-videoportero-simulado' };
export const CLAVE_SIM = 'clave-simulada';
export const COP_SEMILLA = '10000000-0000-4000-8000-000000000001';
export const OPERADOR = '00000000-0000-4000-8000-0000000000c7';
export const guardian = guardianDeEquipos();

/** Lo que las pruebas comparten: se llena en `beforeAll` y en las primeras pruebas. */
export const dod = {
  pool: undefined as Pool | undefined,
  app: undefined as INestApplication | undefined,
  firmante: undefined as unknown as Firmante,
  hijo: undefined as Hijo | undefined,
  disponible: false,
  cop: '',
  edgeId: '',
  secretoEdge: '',
  secretoCamara: '',
  vivienda: '',
  equipo: { heredada: '', camara: '', terminal: '', portero: '' } as Record<
    'heredada' | 'camara' | 'terminal' | 'portero',
    string
  >,
};

/**
 * `crearApp` sustituye SIEMPRE el repositorio de equipos y la sonda por dobles
 * en memoria. Aquí tienen que ser los de verdad —con base y por el Edge—, y se
 * construyen con piezas de la propia app: se pasan como un proxy que resuelve
 * al real en cuanto la app existe.
 */
let reales: { repositorio: RepositorioDeEquipos; sonda: SondaDeEquipo } | null = null;
const realesDeLaApp = () => {
  const app = dod.app;
  if (reales !== null || app === undefined) return reales;
  const c = app.get(CONFIGURACION);
  const edge = app.get(CREDENCIALES_EN_EL_EDGE);
  reales = {
    repositorio: conEdge.repositorioDeEquipos(app.get(Pool), c, edge),
    sonda: conEdge.sondaDeEquipo(app.get(BITACORA), c, edge),
  };
  return reales;
};
const repositorioPerezoso = new Proxy({} as RepositorioDeEquipos, {
  get: (_o, nombre) => {
    const real = realesDeLaApp()?.repositorio as unknown as
      | Record<string | symbol, unknown>
      | undefined;
    const valor = real?.[nombre];
    if (typeof valor === 'function') return (valor as (...a: unknown[]) => unknown).bind(real);
    // Antes de que exista la app (el arranque): listas vacías, nada más.
    return typeof nombre === 'string' && nombre !== 'then' ? async () => [] : undefined;
  },
});

export const token = (rol: string, extra: Record<string, unknown> = {}) =>
  tokenDe(dod.firmante, {
    rol: rol as never,
    copropiedadId: rol === 'superadministrador' ? null : dod.cop,
    ...(rol === 'superadministrador' ? { usuarioId: SUPER } : {}),
    ...extra,
  });
export const api = () => request(direccionDe(dod.app as INestApplication));
export const como = async (rol: string, extra: Record<string, unknown> = {}) => {
  const t = await token(rol, extra);
  return {
    get: (ruta: string) => api().get(ruta).set('Authorization', `Bearer ${t}`),
    post: (ruta: string, cuerpo: object = {}) =>
      api().post(ruta).set('Authorization', `Bearer ${t}`).send(cuerpo),
  };
};
export const hasta = async (condicion: () => Promise<boolean> | boolean, plazo = 8000) => {
  const limite = Date.now() + plazo;
  while (!(await condicion())) {
    if (Date.now() > limite) throw new Error('no llegó a tiempo');
    await new Promise((r) => setTimeout(r, 25));
  }
};
export const alta = async (cuerpo: Record<string, unknown>) =>
  (await como('administrador')).post(`/copropiedades/${dod.cop}/equipos`, {
    protocolo: 'http',
    host: '127.0.0.1',
    ...cuerpo,
  });

const arrancar = async (URL_BASE: string | undefined): Promise<void> => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  const pool = new Pool({ connectionString: URL_BASE, max: 3 });
  dod.pool = pool;
  const nueva = await pool.query<{ id: string }>(
    `INSERT INTO public.copropiedades (nombre, nit, creado_por, actualizado_por)
     VALUES ($1, $2, $3, $3) RETURNING id`,
    [`Puente ${SUFIJO}`, `7${String(Date.now()).slice(-9)}`, SUPER],
  );
  dod.cop = nueva.rows[0]?.id ?? '';
  dod.firmante = await crearFirmante();
  const app = await crearApp(
    dod.firmante,
    (b) => b.overrideProvider(PROVEEDOR_DIRECTO).useValue(guardian.proveedor),
    {
      CARGADOR_DE_CONTEXTO: 'postgres',
      PERSISTENCIA_DE_EVENTOS: 'postgres',
      PERSISTENCIA_DE_BIOMETRIA: 'postgres',
      DATABASE_URL: URL_BASE,
      DATABASE_POOLER_URL: URL_BASE,
    },
    {
      repositorio: repositorioPerezoso,
      sonda: {
        probar: (d) =>
          (realesDeLaApp() as NonNullable<typeof reales>).sonda.probar(d as DatosDeSondeo),
      },
    },
  );
  dod.app = app;
  guardian.vigilarFetch();
  const superadmin = await como('superadministrador');
  const gw = await superadmin.post(`/copropiedades/${dod.cop}/edge-gateways`, {
    nombre: `Edge puente ${SUFIJO}`,
  });
  dod.edgeId = gw.body.edgeId as string;
  dod.secretoEdge = gw.body.secreto as string;

  // D3 · un equipo dado de alta ANTES del puente: su clave está en la nube.
  const previa = await alta({
    nombre: 'Terminal heredada',
    tipo: 'terminal_facial',
    puerto: 8003,
    usuario: 'servicio',
    secreto: CLAVE_SIM,
    modoDeTerminal: 'reporta_y_espera',
    probarConexion: false,
  });
  dod.equipo.heredada = previa.body.id as string;

  await superadmin.post(`/copropiedades/${dod.cop}/edge-gateways/${dod.edgeId}/puente`, {
    puente: true,
  });
  const hijo = await conHijo({
    EDGE_GATEWAY_ID: dod.edgeId,
    EDGE_COPROPIEDAD_ID: dod.cop,
    EDGE_INGESTA_SECRETO: dod.secretoEdge,
    NEXT_CONTROL_API_URL: direccionDe(app),
    SQLITE_PATH: join(tmpdir(), `edge-puente-${SUFIJO}.sqlite`),
    EDGE_PLAZO_NUBE_MS: '4000',
  });
  dod.hijo = hijo;
  await hasta(async () => (await hijo.estado()).tunel, 30_000);
  guardian.vigilarPuerto(hijo.puertoDelVideoportero);
  dod.disponible = gw.status === 201 && previa.status === 201;
};

const desmontar = async (): Promise<void> => {
  dod.hijo?.terminar();
  if (dod.pool !== undefined && dod.edgeId !== '') {
    await dod.pool.query(
      'UPDATE public.edge_gateways SET puente = false, puente_desde = NULL WHERE id = $1',
      [dod.edgeId],
    );
  }
  guardian.soltarFetch();
  await dod.app?.close();
  await dod.pool?.end();
};

/** Se llama dentro del fichero de prueba, que registra además su `exigirBase` y le da la base. */
export const montarDoD = (urlBase: string | undefined): void => {
  beforeAll(() => arrancar(urlBase), 90_000);
  afterAll(desmontar);
};
