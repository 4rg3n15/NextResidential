import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { RELOJ } from '@ncr/domain-core';
import { ADMINISTRADOR_DE_CUENTAS, PROVEEDOR_DE_IDENTIDAD } from '../src/cuentas';
import {
  AJUSTES_DE_PLATAFORMA,
  AjustesDePlataformaEnMemoria,
  MENSAJE_GUARDIA_REMOTA,
} from '../src/plataforma';
import { AjustesDePlataformaPg } from '../src/plataforma/infraestructura/plataforma-pg';
import type { Configuracion } from '../src/configuracion/esquema';
import { crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { ProveedorDeIdentidadFalso } from './dobles/proveedor-de-identidad';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H7 (15-L) · PORTEROS POR IDENTIFICADOR, LISTA BLANCA DE IP Y MODO PRUEBAS,
 * DE PUNTA A PUNTA CONTRA LA BASE REAL
 *
 * Pools, números, cupo, baja, reglas de IP, presencia del superadministrador y
 * rastro en `auditoria_seguridad`: todo en PostgreSQL con la RLS forzada, y el
 * gancho de claims de la base. Sólo el proveedor de identidad es falso.
 *
 * Tres decisiones de la suite, y por qué:
 *  · COPROPIEDADES NUEVAS en cada corrida. El pool de una copropiedad sólo
 *    avanza (ADR-031): reutilizar las del banco lo agotaría corrida a corrida,
 *    y el cupo no se podría probar sin tocar lo que usan otras suites.
 *  · El MODO PRUEBAS se sustituye en memoria, APAGADO, salvo en el caso 12.
 *    El interruptor de la base es global y lo comparten las suites que corren
 *    en paralelo: apagarlo aquí las haría fallar. El adaptador de la base se
 *    prueba aparte, fijando el valor que ya tiene.
 *  · El RELOJ es fijo y se adelanta a mano: las reglas de IP se releen cada
 *    5 s (sin reiniciar), y así se ve el cambio sin esperar.
 *
 * Todas las IP son de documentación (RFC 5737). La IP del navegador llega en
 * `X-Forwarded-For` desde 127.0.0.1, que es el proxy de confianza por omisión
 * (H6): es lo que hace la consola en el Mac. El caso 10 monta la API con
 * OTRO proxy de confianza y comprueba que la misma cabecera ya no se cree.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SUPER = '00000000-0000-4000-8000-000000000001';
const INICIAL = 'Inicial#2026';
const NUEVA = 'Garita#2026x';
const SUFIJO = `${String(Date.now()).slice(-7)}${String(Math.floor(Math.random() * 90) + 10)}`;

const IP_REMOTA_PERMITIDA = '198.51.100.5';
const RED_REMOTA = '198.51.100.0/28';
const IP_NO_PERMITIDA = '203.0.113.20';
const IP_DE_PORTERIA = '198.51.100.200';
const IP_DEL_MAC = '198.51.100.60';
const IP_AJENA = '203.0.113.99';
/**
 * Desde donde el superadministrador entra en 9b. NUNCA una IP con la que se
 * pruebe un rechazo con la lista vacía: su sesión queda anotada en la base y,
 * con el reloj fijo, sigue «activa» para las corridas siguientes.
 */
const IP_DEL_SUPER_DE_VIAJE = '203.0.113.150';

let pool: Pool | undefined;
let app: INestApplication | undefined;
let conOtroProxy: INestApplication | undefined;
let disponible = false;
let firmante: Firmante;
let superadmin = '';
const ajustes = new AjustesDePlataformaEnMemoria();
let instante = new Date('2026-12-01T15:00:00Z'); // 10:00 en Bogotá
const avanzar = (ms: number): void => {
  instante = new Date(instante.getTime() + ms);
};

let proveedor: ProveedorDeIdentidadFalso;

/** Las dos APIs comparten el proveedor falso: las cuentas son las mismas. */
const montar = async (extra: Partial<Configuracion> = {}): Promise<INestApplication> =>
  crearApp(
    firmante,
    (b) =>
      b
        .overrideProvider(PROVEEDOR_DE_IDENTIDAD)
        .useValue(proveedor)
        .overrideProvider(ADMINISTRADOR_DE_CUENTAS)
        .useValue(proveedor)
        .overrideProvider(RELOJ)
        .useValue({ ahora: () => new Date(instante.getTime()) })
        .overrideProvider(AJUSTES_DE_PLATAFORMA)
        .useValue(ajustes),
    {
      PERSISTENCIA_DE_EVENTOS: 'postgres',
      DATABASE_URL: URL_BASE,
      DATABASE_POOLER_URL: URL_BASE,
      ...extra,
    },
  );

/** Una copropiedad NUEVA: el disparador de la 0042 le da su pool. */
const copropiedadNueva = async (nombre: string, n: number): Promise<string> => {
  const { rows } = await (pool as Pool).query<{ id: string }>(
    `INSERT INTO public.copropiedades (nombre, nit, creado_por, actualizado_por)
     VALUES ($1, $2, $3, $3) RETURNING id`,
    [`${nombre} ${SUFIJO}`, `8${SUFIJO}${String(n)}`, SUPER],
  );
  return rows[0]?.id ?? '';
};

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    await pool.query('SELECT 1 FROM public.pools_de_porteros LIMIT 1');
    disponible = true;
  } catch {
    disponible = false;
    return;
  }
  firmante = await crearFirmante();
  proveedor = new ProveedorDeIdentidadFalso(firmante, async (authUserId) => {
    const { rows } = await (pool as Pool).query<{ c: Record<string, unknown> }>(
      `SELECT public.custom_access_token_hook(jsonb_build_object('user_id', $1::text, 'claims', '{}'::jsonb)) -> 'claims' AS c`,
      [authUserId],
    );
    return rows[0]?.c ?? null;
  });
  await ajustes.fijarModoPruebas(false, SUPER);
  app = await montar();
  // H6 · la MISMA API, con un proxy de confianza que no es el que llama.
  conOtroProxy = await montar({ API_PROXIES_DE_CONFIANZA: '192.0.2.1' });
  superadmin = await tokenDe(firmante, {
    rol: 'superadministrador',
    copropiedadId: null,
    usuarioId: SUPER,
    sesionId: randomUUID(),
  });
});

afterAll(async () => {
  await app?.close();
  await conOtroProxy?.close();
  await pool?.end();
});

// H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
exigirBase('sin DATABASE_URL_PRUEBAS o sin la migración 0042', () => disponible);
const omitida = (): boolean => !disponible;

type Metodo = 'get' | 'post' | 'put' | 'patch';
const pedir = (
  metodo: Metodo,
  ruta: string,
  o: { token?: string; ip?: string; cuerpo?: object; api?: INestApplication } = {},
) => {
  let p = request((o.api ?? (app as INestApplication)).getHttpServer())[metodo](ruta);
  if (o.token !== undefined) p = p.set('Authorization', `Bearer ${o.token}`);
  if (o.ip !== undefined) p = p.set('X-Forwarded-For', o.ip);
  return o.cuerpo === undefined ? p : p.send(o.cuerpo);
};
const comoSuper = (metodo: Metodo, ruta: string, cuerpo?: object, ip = IP_DEL_MAC) =>
  pedir(metodo, ruta, { token: superadmin, ip, ...(cuerpo === undefined ? {} : { cuerpo }) });

const texto = (r: { body: { mensaje?: unknown } }): string => {
  const m = r.body.mensaje;
  if (typeof m === 'string') return m;
  const interno = (m as { message?: unknown } | undefined)?.message;
  return typeof interno === 'string' ? interno : JSON.stringify(m);
};

const alta = async (cop: string, documento: string) => {
  const r = await comoSuper('post', `/copropiedades/${cop}/porteros`, {
    documento,
    contrasenaInicial: INICIAL,
    nombre: `Portero ${documento}`,
    sectores: [],
  });
  return r;
};

const turnoDeHoy = async (cop: string, porteroId: string) => {
  const r = await comoSuper('post', `/copropiedades/${cop}/turnos`, {
    porteroId,
    dia: '2026-12-01',
    horaInicio: '06:00',
    horaFin: '18:00',
    tipo: 'programado',
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
};

const acceso = (numero: number, contrasena: string, ip: string, api?: INestApplication) =>
  pedir('post', '/auth/acceso', {
    ip,
    cuerpo: { usuario: String(numero), contrasena },
    ...(api === undefined ? {} : { api }),
  });

/** Alta + turno + primer cambio de contraseña hecho desde `ip`: listo para operar. */
const porteroListo = async (
  cop: string,
  documento: string,
  ip: string,
): Promise<{ id: string; numero: number; token: string }> => {
  const r = await alta(cop, documento);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const id = r.body.usuarioId as string;
  const numero = r.body.numero as number;
  await turnoDeHoy(cop, id);
  const primero = await acceso(numero, INICIAL, ip);
  expect(primero.status, JSON.stringify(primero.body)).toBe(200);
  expect(primero.body.debeCambiarContrasena).toBe(true);
  const cambio = await pedir('post', '/auth/contrasena', {
    token: primero.body.accessToken,
    ip,
    cuerpo: { actual: INICIAL, nueva: NUEVA },
  });
  expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
  const segundo = await acceso(numero, NUEVA, ip);
  expect(segundo.status, JSON.stringify(segundo.body)).toBe(200);
  return { id, numero, token: segundo.body.accessToken as string };
};

const poolDe = async (cop: string) =>
  (
    await (pool as Pool).query<{ numero: number; inicio: number; fin: number; siguiente: number }>(
      'SELECT numero, inicio, fin, siguiente FROM public.pools_de_porteros WHERE copropiedad_id = $1',
      [cop],
    )
  ).rows[0];

const rechazosDeIp = async (usuarioId: string, ip: string) =>
  (
    await (pool as Pool).query<{ recurso: string; resultado: string }>(
      `SELECT recurso, resultado FROM public.auditoria_seguridad
        WHERE tipo = 'restriccion_de_ip' AND usuario_id = $1 AND host(ip) = $2
        ORDER BY ocurrido_en`,
      [usuarioId, ip],
    )
  ).rows;

describe('H7 (15-L) · porteros por identificador, contra la base real', () => {
  let cop1 = '';
  let cop2 = '';
  let cop3 = '';
  let p1001: { id: string; numero: number; token: string };
  let p2: { id: string; numero: number; token: string };

  it('0 · copropiedades nuevas reciben su pool por la TABLA: [n·1000+1, n·1000+999], sin solape', async () => {
    if (omitida()) return;
    cop1 = await copropiedadNueva('H7 uno', 1);
    cop2 = await copropiedadNueva('H7 dos', 2);
    cop3 = await copropiedadNueva('H7 tres', 3);
    const [a, b] = [await poolDe(cop1), await poolDe(cop2)];
    expect(b?.numero).toBe((a?.numero ?? 0) + 1);
    const { rows } = await (pool as Pool).query<{ malos: string; primero: number | null }>(
      `SELECT count(*) FILTER (WHERE inicio <> numero * 1000 + 1 OR fin <> numero * 1000 + 999)::text AS malos,
              min(inicio) AS primero
         FROM public.pools_de_porteros`,
    );
    expect(rows[0]).toEqual({ malos: '0', primero: 1001 });
  });

  it('1 · dos porteros en la copropiedad reciben el primero y el siguiente número de SU pool', async () => {
    if (omitida()) return;
    const pool1 = await poolDe(cop1);
    // Con las listas vacías entra desde el Mac del superadministrador (H4 b).
    p1001 = await porteroListo(cop1, `H7-A-${SUFIJO}`, IP_DEL_MAC);
    const segundo = await alta(cop1, `H7-B-${SUFIJO}`);
    expect(segundo.status).toBe(201);
    expect([p1001.numero, segundo.body.numero]).toEqual([pool1?.inicio, (pool1?.inicio ?? 0) + 1]);
    const lista = await comoSuper('get', `/copropiedades/${cop1}/porteros`);
    expect(lista.body.porteros.map((p: { numero: number }) => p.numero).sort()).toEqual([
      p1001.numero,
      segundo.body.numero,
    ]);
  });

  it('2 · veinte altas SIMULTÁNEAS: veinte números distintos y consecutivos, sin duplicados', async () => {
    if (omitida()) return;
    const inicio = (await poolDe(cop3))?.inicio ?? 0;
    const respuestas = await Promise.all(
      Array.from({ length: 20 }, (_, i) => alta(cop3, `H7-C${String(i)}-${SUFIJO}`)),
    );
    expect(respuestas.map((r) => r.status)).toEqual(Array(20).fill(201));
    const numeros = respuestas.map((r) => r.body.numero as number).sort((x, y) => x - y);
    expect(numeros).toEqual(Array.from({ length: 20 }, (_, i) => inicio + i));
    const { rows } = await (pool as Pool).query<{ n: string; distintos: string }>(
      `SELECT count(*)::text AS n, count(DISTINCT numero_de_portero)::text AS distintos
         FROM public.usuarios WHERE copropiedad_id = $1`,
      [cop3],
    );
    expect(rows[0]).toEqual({ n: '20', distintos: '20' });
  });

  it('3 · con el cupo alcanzado, el alta se rechaza con un mensaje claro; el cupo no pasa de 999', async () => {
    if (omitida()) return;
    expect(
      (await comoSuper('put', `/copropiedades/${cop3}/porteros/cupo`, { cupo: 1000 })).status,
    ).toBe(400);
    const cupo = await comoSuper('put', `/copropiedades/${cop3}/porteros/cupo`, { cupo: 20 });
    expect(cupo.status, JSON.stringify(cupo.body)).toBe(200);
    const r = await alta(cop3, `H7-X-${SUFIJO}`);
    expect(r.status).toBe(409);
    expect(texto(r)).toBe(
      'La copropiedad alcanzó su cupo de porteros activos: súbalo o desactive a uno antes',
    );
    const auditado = await (pool as Pool).query(
      `SELECT 1 FROM public.auditoria_seguridad
        WHERE tipo = 'cambio_configuracion' AND identificador_solicitado = 'cupo_de_porteros'
          AND usuario_id = $1 AND recurso LIKE '%→ 20'`,
      [SUPER],
    );
    expect(auditado.rowCount).toBeGreaterThan(0);
    const estado = await comoSuper('get', `/copropiedades/${cop3}/porteros/pool`);
    expect(estado.body).toMatchObject({ cupo: 20, activos: 20 });
  });

  it('4 · el número de un portero dado de baja NO se reutiliza, y con él ya no se entra', async () => {
    if (omitida()) return;
    const inicio = (await poolDe(cop3))?.inicio ?? 0;
    const { rows } = await (pool as Pool).query<{ id: string }>(
      'SELECT id FROM public.usuarios WHERE copropiedad_id = $1 AND numero_de_portero = $2',
      [cop3, inicio],
    );
    const bajaId = rows[0]?.id ?? '';
    await turnoDeHoy(cop3, bajaId);
    const baja = await comoSuper('post', `/copropiedades/${cop3}/porteros/${bajaId}/baja`, {
      motivo: 'Terminó su contrato',
    });
    expect(baja.status, JSON.stringify(baja.body)).toBe(200);
    // La plaza del cupo se libera; el número, no.
    const siguiente = await alta(cop3, `H7-D-${SUFIJO}`);
    expect(siguiente.status, JSON.stringify(siguiente.body)).toBe(201);
    expect(siguiente.body.numero).toBe(inicio + 20);
    const fila = await (pool as Pool).query<{ estado: string; numero: number }>(
      'SELECT estado::text AS estado, numero_de_portero AS numero FROM public.usuarios WHERE id = $1',
      [bajaId],
    );
    expect(fila.rows[0]).toEqual({ estado: 'inactivo', numero: inicio });
    const sinCuenta = await acceso(inicio, INICIAL, IP_DEL_MAC);
    expect(sinCuenta.status).toBe(403);
    expect(texto(sinCuenta)).toBe('La cuenta no tiene un acceso habilitado');
    expect(sinCuenta.body).not.toHaveProperty('accessToken');
    const hecho = await (pool as Pool).query(
      `SELECT 1 FROM public.bitacora_de_porteria
        WHERE tipo = 'baja_de_portero' AND usuario_id = $1 AND detalle = 'Terminó su contrato'`,
      [bajaId],
    );
    expect(hecho.rowCount).toBe(1);
  });

  it('5 · el portero entra SÓLO con su número y su contraseña; el número no sirve por el camino del código', async () => {
    if (omitida()) return;
    const ip = IP_DEL_MAC;
    expect((await acceso(p1001.numero, NUEVA, ip)).status).toBe(200);
    expect((await acceso(p1001.numero, 'Equivocada#1', ip)).status).toBe(401);
    const porCodigo = await pedir('post', '/auth/acceso', {
      ip,
      cuerpo: { codigo: 'ZZZ999', usuario: String(p1001.numero), contrasena: NUEVA },
    });
    expect(porCodigo.status).toBe(401);
  });

  it('6 · con la lista remota configurada, desde una IP permitida entra y opera la guardia remota', async () => {
    if (omitida()) return;
    const conf = await comoSuper('patch', `/copropiedades/${cop1}/configuracion`, {
      ipsGuardiaRemota: [RED_REMOTA],
      ipsPorteria: [IP_DE_PORTERIA],
    });
    expect(conf.status, JSON.stringify(conf.body)).toBe(200);
    expect(conf.body).toMatchObject({
      ipsGuardiaRemota: [RED_REMOTA],
      ipsPorteria: [IP_DE_PORTERIA],
    });
    avanzar(6000); // las reglas se releen: sin reiniciar
    const r = await acceso(p1001.numero, NUEVA, IP_REMOTA_PERMITIDA);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    p1001 = { ...p1001, token: r.body.accessToken as string };
    const cola = await pedir('get', `/copropiedades/${cop1}/guardia/cola`, {
      token: p1001.token,
      ip: IP_REMOTA_PERMITIDA,
    });
    expect(cola.status, JSON.stringify(cola.body)).toBe(200);
  });

  it('7 · desde una IP que no está en la lista: «No autorizado para guardia remota», al entrar y en cada petición, con rastro', async () => {
    if (omitida()) return;
    const entrada = await acceso(p1001.numero, NUEVA, IP_NO_PERMITIDA);
    expect(entrada.status).toBe(403);
    expect(texto(entrada)).toBe(MENSAJE_GUARDIA_REMOTA);
    // Un token obtenido desde una IP buena no vale desde otra.
    const cola = await pedir('get', `/copropiedades/${cop1}/guardia/cola`, {
      token: p1001.token,
      ip: IP_NO_PERMITIDA,
    });
    expect(cola.status).toBe(403);
    expect(texto(cola)).toBe(MENSAJE_GUARDIA_REMOTA);
    const rastro = await rechazosDeIp(p1001.id, IP_NO_PERMITIDA);
    expect(rastro.map((f) => f.resultado)).toEqual(['403', '403']);
    // Sin depender del orden: con el reloj fijo las dos filas llevan la misma hora.
    expect(rastro.map((f) => f.recurso).sort()).toEqual([
      'GET /copropiedades/:id/guardia/cola',
      'auth/acceso',
    ]);
  });

  it('7b · desde el computador de PORTERÍA opera la consola presencial, pero no la guardia remota', async () => {
    if (omitida()) return;
    const ordenes = await pedir('get', `/copropiedades/${cop1}/guardia/ordenes`, {
      token: p1001.token,
      ip: IP_DE_PORTERIA,
    });
    expect(ordenes.status, JSON.stringify(ordenes.body)).toBe(200);
    const cola = await pedir('get', `/copropiedades/${cop1}/guardia/cola`, {
      token: p1001.token,
      ip: IP_DE_PORTERIA,
    });
    expect(cola.status).toBe(403);
    expect(texto(cola)).toBe(MENSAJE_GUARDIA_REMOTA);
  });

  it('8 · lista vacía: el portero entra desde la IP de una sesión ACTIVA de superadministrador (el mismo Mac)', async () => {
    if (omitida()) return;
    // El superadministrador trabaja desde el Mac: su sesión queda anotada.
    expect((await comoSuper('get', `/copropiedades/${cop2}/porteros/pool`)).status).toBe(200);
    p2 = await porteroListo(cop2, `H7-E-${SUFIJO}`, IP_DEL_MAC);
    const cola = await pedir('get', `/copropiedades/${cop2}/guardia/cola`, {
      token: p2.token,
      ip: IP_DEL_MAC,
    });
    expect(cola.status, JSON.stringify(cola.body)).toBe(200);
  });

  it('9 · lista vacía y OTRA IP: rechazado; y en cuanto la lista tiene una entrada, la regla del Mac deja de aplicar', async () => {
    if (omitida()) return;
    const entrada = await acceso(p2.numero, NUEVA, IP_AJENA);
    expect(entrada.status).toBe(403);
    expect(texto(entrada)).toBe(MENSAJE_GUARDIA_REMOTA);
    expect(await rechazosDeIp(p2.id, IP_AJENA)).toHaveLength(1);

    const conf = await comoSuper('patch', `/copropiedades/${cop2}/configuracion`, {
      ipsGuardiaRemota: ['192.0.2.0/24'],
    });
    expect(conf.status).toBe(200);
    avanzar(6000);
    const cola = await pedir('get', `/copropiedades/${cop2}/guardia/cola`, {
      token: p2.token,
      ip: IP_DEL_MAC,
    });
    expect(cola.status).toBe(403);
    expect(texto(cola)).toBe(MENSAJE_GUARDIA_REMOTA);
  });

  it('9b · el superadministrador entra desde cualquier IP; la regla es sólo del portero', async () => {
    if (omitida()) return;
    const r = await comoSuper(
      'get',
      `/copropiedades/${cop2}/guardia/cola`,
      undefined,
      IP_DEL_SUPER_DE_VIAJE,
    );
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  });

  it('10 · un X-Forwarded-For FALSIFICADO desde fuera del proxy de confianza no se cree', async () => {
    if (omitida()) return;
    // Por el proxy de confianza (127.0.0.1): la cabecera vale y la IP está en la lista.
    expect((await acceso(p1001.numero, NUEVA, IP_REMOTA_PERMITIDA)).status).toBe(200);
    // La MISMA petición a una API que sólo confía en 192.0.2.1: la cabecera se
    // ignora, la IP es la del socket (127.0.0.1), que no está en la lista.
    const falsa = await acceso(p1001.numero, NUEVA, IP_REMOTA_PERMITIDA, conOtroProxy);
    expect(falsa.status).toBe(403);
    expect(texto(falsa)).toBe(MENSAJE_GUARDIA_REMOTA);
    expect(await rechazosDeIp(p1001.id, IP_REMOTA_PERMITIDA)).toEqual([]);
    expect((await rechazosDeIp(p1001.id, '127.0.0.1')).length).toBeGreaterThan(0);
  });

  it('11 · el portero de una copropiedad no ve nada de otra', async () => {
    if (omitida()) return;
    for (const ruta of [
      `/copropiedades/${cop2}/guardia/cola`,
      `/copropiedades/${cop2}/guardia/ordenes`,
      `/copropiedades/${cop2}/porteros`,
      `/copropiedades/${cop2}/eventos?desde=2026-11-01T00:00:00Z&hasta=2026-12-02T00:00:00Z`,
    ]) {
      const r = await pedir('get', ruta, { token: p1001.token, ip: IP_REMOTA_PERMITIDA });
      expect([403, 404], `${ruta} → ${String(r.status)}`).toContain(r.status);
      expect(JSON.stringify(r.body)).not.toContain(p2.id);
    }
  });

  it('12 · con el MODO PRUEBAS activo, el caso 7 entra y queda anotado «habría sido rechazado»', async () => {
    if (omitida()) return;
    const cambio = await comoSuper('put', '/plataforma/modo-pruebas', { activo: true });
    expect(cambio.status, JSON.stringify(cambio.body)).toBe(200);
    expect(ajustes.cambios.at(-1)).toEqual({ activo: true, actorId: SUPER });
    try {
      const leido = await pedir('get', '/plataforma/modo-pruebas', {
        token: p1001.token,
        ip: IP_NO_PERMITIDA,
      });
      expect(leido.body).toEqual({ activo: true });
      const entrada = await acceso(p1001.numero, NUEVA, IP_NO_PERMITIDA);
      expect(entrada.status, JSON.stringify(entrada.body)).toBe(200);
      const cola = await pedir('get', `/copropiedades/${cop1}/guardia/cola`, {
        token: entrada.body.accessToken,
        ip: IP_NO_PERMITIDA,
      });
      expect(cola.status, JSON.stringify(cola.body)).toBe(200);
      const avisos = (await rechazosDeIp(p1001.id, IP_NO_PERMITIDA)).filter(
        (f) => f.resultado === 'permitido',
      );
      expect(avisos.length).toBeGreaterThan(0);
      for (const a of avisos) expect(a.recurso).toMatch(/habría sido rechazado \(modo pruebas\)$/);
    } finally {
      await comoSuper('put', '/plataforma/modo-pruebas', { activo: false });
    }
  });

  it('el adaptador de la base cambia el interruptor con rastro (fijando el valor que ya tiene)', async () => {
    if (omitida()) return;
    const base = new AjustesDePlataformaPg(pool as Pool);
    const actual = await base.modoPruebas();
    await base.fijarModoPruebas(actual, SUPER, IP_DEL_MAC);
    expect(await base.modoPruebas()).toBe(actual);
    const estado = actual ? 'activo' : 'inactivo';
    const fila = await (pool as Pool).query(
      `SELECT 1 FROM public.auditoria_seguridad
        WHERE tipo = 'cambio_configuracion' AND identificador_solicitado = 'modo_pruebas'
          AND usuario_id = $1 AND host(ip) = $2 AND recurso = $3`,
      [SUPER, IP_DEL_MAC, `plataforma/modo-pruebas: ${estado} → ${estado}`],
    );
    expect(fila.rowCount).toBeGreaterThan(0);
  });
});
