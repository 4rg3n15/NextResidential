import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { get as getHttp } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Aforo, HorarioDeZona, RELOJ, Zona, esExito } from '@ncr/domain-core';
import {
  ADMINISTRADOR_DE_CUENTAS,
  PROVEEDOR_DE_IDENTIDAD,
  RepositorioDeCuentasEnMemoria,
} from '../src/cuentas';
import { RepositorioZonasEnMemoria } from '../src/zonas/infraestructura/repositorio-zonas-memoria';
import {
  CLAVE_CON_CAMBIO_PENDIENTE,
  CLAVE_DURANTE_EL_PATRULLAJE,
  CLAVE_FUERA_DE_TURNO,
  CLAVE_PUBLICO,
} from '../src/comun/decoradores';
import { MENSAJE_CAMBIO_PENDIENTE } from '../src/comun/guardas/cambio-de-contrasena.guard';
import { MENSAJE_GUARDIA_REMOTA } from '../src/plataforma';
import {
  COP_A,
  COP_B,
  crearApp,
  crearFirmante,
  direccionDe,
  enumerarRutas,
  rutasConMetadato,
  sinModoPruebas,
  tokenDe,
} from './utilidades';
import type { Firmante } from './utilidades';
import { ProveedorDeIdentidadFalso } from './dobles/proveedor-de-identidad';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ETAPA 15-H · CUENTAS POR USUARIO Y PORTERÍA, por HTTP y contra la API real
 *
 * Todo lo de producción —rutas, guardas globales en su orden, casos de uso,
 * dobles en memoria de los repositorios— salvo el proveedor de identidad, que
 * la suite no puede alcanzar y sustituye `ProveedorDeIdentidadFalso`. El reloj
 * es INYECTADO y se mueve a mano: es la única forma de probar «antes, durante
 * y después» de un turno y el cierre en el minuto exacto (ADR-024).
 *
 * La misma cadena contra base real está en `cuentas-y-porteria-pg.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════
 */

const INICIAL = 'Inicial#2026';
const NUEVA = 'Garita#2026x';
const CLAVE_DEL_ADMINISTRADOR = 'Clave#2026';
const SUPER = '00000000-0000-4000-8000-0000000000aa';
const DISPOSITIVO = '70000000-0000-4000-8000-000000000001';
const ZONA = '80000000-0000-4000-8000-00000000000a';

interface Banco {
  app: INestApplication;
  firmante: Firmante;
  proveedor: ProveedorDeIdentidadFalso;
  cuentas: RepositorioDeCuentasEnMemoria;
  mover: (iso: string) => void;
  superadmin: string;
  admin: string;
  cuerpos: string[];
  /** H2 (ADR-031) · etiqueta de la suite → número que asignó la API. */
  numeros: Map<string, string>;
}

const bancos: Banco[] = [];

const montar = async (inicio = '2026-09-26T02:00:00Z'): Promise<Banco> => {
  const firmante = await crearFirmante();
  let instante = new Date(inicio);
  const reloj = { ahora: (): Date => new Date(instante.getTime()) };
  const referencia: { cuentas?: RepositorioDeCuentasEnMemoria } = {};
  const proveedor = new ProveedorDeIdentidadFalso(
    firmante,
    async (id) => referencia.cuentas?.claimsDe(id) ?? null,
  );
  const app = await crearApp(firmante, (b) =>
    b
      .overrideProvider(PROVEEDOR_DE_IDENTIDAD)
      .useValue(proveedor)
      .overrideProvider(ADMINISTRADOR_DE_CUENTAS)
      .useValue(proveedor)
      .overrideProvider(RELOJ)
      .useValue(reloj),
  );
  const cuentas = app.get(RepositorioDeCuentasEnMemoria);
  referencia.cuentas = cuentas;
  const banco: Banco = {
    app,
    firmante,
    proveedor,
    cuentas,
    mover: (iso) => {
      instante = new Date(iso);
    },
    superadmin: await tokenDe(firmante, {
      rol: 'superadministrador',
      copropiedadId: null,
      usuarioId: SUPER,
    }),
    admin: await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A }),
    cuerpos: [],
    numeros: new Map(),
  };
  bancos.push(banco);
  return banco;
};

afterAll(async () => {
  // El correo sintético NUNCA en una respuesta: se revisan TODOS los cuerpos.
  const conSintetico = bancos
    .flatMap((b) => b.cuerpos)
    .filter((c) => c.includes('usuarios.ncr.invalid'));
  expect(conSintetico).toEqual([]);
  for (const b of bancos) await b.app.close();
});

type Metodo = 'get' | 'post' | 'put' | 'patch';
const pedir = async (
  b: Banco,
  metodo: Metodo,
  ruta: string,
  token?: string,
  cuerpo?: object,
  origen?: string,
) => {
  let p = request(b.app.getHttpServer())[metodo](ruta);
  if (token !== undefined) p = p.set('Authorization', `Bearer ${token}`);
  if (origen !== undefined) p = p.set('x-ncr-origen', origen);
  const r = await (cuerpo === undefined ? p : p.send(cuerpo));
  b.cuerpos.push(JSON.stringify(r.body ?? {}) + (r.text ?? ''));
  return r;
};

/** El texto del error, tal como lo envuelve el filtro global. */
const texto = (r: { body: { mensaje?: unknown } }): string => {
  const m = r.body.mensaje;
  if (typeof m === 'string') return m;
  const interno = (m as { message?: unknown } | undefined)?.message;
  return typeof interno === 'string' ? interno : JSON.stringify(m);
};

/**
 * H2 (ADR-031) · el alta lleva nombre, documento y contraseña temporal; el
 * número lo asigna la API, y la suite lo guarda bajo una etiqueta legible.
 */
const alta = async (b: Banco, etiqueta: string, extra: object = {}): Promise<string> => {
  const r = await pedir(b, 'post', `/copropiedades/${COP_A}/porteros`, b.superadmin, {
    documento: etiqueta.replace(/\./g, '-'),
    contrasenaInicial: INICIAL,
    nombre: `Portero ${etiqueta}`,
    porteria: 'Norte',
    sectores: ['Torre 1', 'Torre 2'],
    ...extra,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  b.numeros.set(etiqueta, String(r.body.numero));
  return r.body.usuarioId as string;
};

const turno = (
  b: Banco,
  porteroId: string,
  dia: string,
  horaInicio: string,
  horaFin: string,
  extra: object = {},
) =>
  pedir(b, 'post', `/copropiedades/${COP_A}/turnos`, b.superadmin, {
    porteroId,
    dia,
    horaInicio,
    horaFin,
    tipo: 'programado',
    ...extra,
  });

/** H3 (ADR-031) · el portero entra con su NÚMERO y su contraseña; nada más. */
const acceso = (b: Banco, etiqueta: string, contrasena: string, origen?: string) =>
  pedir(
    b,
    'post',
    '/auth/acceso',
    undefined,
    { usuario: b.numeros.get(etiqueta) ?? etiqueta, contrasena },
    origen,
  );

/** Lo mismo, desde otra IP de navegador: la que reenvía el proxy de confianza (H6). */
const accesoDesde = async (b: Banco, ip: string, etiqueta: string, contrasena: string) => {
  const r = await request(b.app.getHttpServer())
    .post('/auth/acceso')
    .set('x-forwarded-for', ip)
    .send({ usuario: b.numeros.get(etiqueta) ?? etiqueta, contrasena });
  b.cuerpos.push(JSON.stringify(r.body ?? {}) + (r.text ?? ''));
  return r;
};

/** Alta + turno amplio + primer cambio hecho: un portero listo para operar. */
const porteroListo = async (b: Banco, usuario: string): Promise<{ id: string; token: string }> => {
  const id = await alta(b, usuario);
  expect((await turno(b, id, '2026-09-25', '20:00', '19:00')).status).toBe(201);
  await b.cuentas.fijarCambioObligatorio(id, false);
  const r = await acceso(b, usuario, INICIAL);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return { id, token: r.body.accessToken as string };
};

const bitacora = async (b: Banco, tipo?: string) => {
  const q = `desde=2026-09-01T00:00:00Z&hasta=2026-10-30T00:00:00Z${tipo === undefined ? '' : `&tipo=${tipo}`}`;
  const r = await pedir(b, 'get', `/copropiedades/${COP_A}/porteria/bitacora?${q}`, b.superadmin);
  expect(r.status).toBe(200);
  return r.body.hechos as {
    tipo: string;
    usuarioId: string;
    actorId: string;
    duracionSegundos: number | null;
    origenDeclarado: string | null;
    detalle: string | null;
  }[];
};

// ─── B1 ───────────────────────────────────────────────────────────────────────

describe('B1 · porteros por NÚMERO del pool de la copropiedad (ADR-031)', () => {
  let b: Banco;
  beforeAll(async () => {
    b = await montar();
    // Aquí se prueban el bloqueo y los límites: sin el modo pruebas (H5).
    await sinModoPruebas(b.app);
  });

  it('el superadministrador da de alta un portero con documento y recibe su número; el correo sintético sólo llega al proveedor', async () => {
    const id = await alta(b, 'Porteria.Norte');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.numeros.get('Porteria.Norte')).toBe('1001');
    expect(b.proveedor.correosRecibidos).toHaveLength(1);
    expect(b.proveedor.correosRecibidos[0]).toMatch(
      new RegExp(`^p[0-9a-f]{12}@${COP_A}\\.usuarios\\.ncr\\.invalid$`),
    );
    const lista = await pedir(b, 'get', `/copropiedades/${COP_A}/porteros`, b.superadmin);
    expect(lista.body.porteros[0]).toMatchObject({
      numero: 1001,
      documento: 'PORTERIA-NORTE',
      debeCambiarContrasena: true,
      sectores: ['Torre 1', 'Torre 2'],
    });
    expect(lista.body.porteros[0]).not.toHaveProperty('usuario');
  });

  it('la siguiente alta recibe el siguiente número del pool', async () => {
    await alta(b, 'porteria.sur');
    expect(b.numeros.get('porteria.sur')).toBe('1002');
    const pool = await pedir(b, 'get', `/copropiedades/${COP_A}/porteros/pool`, b.superadmin);
    expect(pool.body).toMatchObject({ inicio: 1001, fin: 1999, siguiente: 1003, cupo: 999 });
  });

  it('formato del documento y política de la contraseña inicial se validan en el servidor', async () => {
    const base = { nombre: 'X', sectores: [] };
    expect(
      (
        await pedir(b, 'post', `/copropiedades/${COP_A}/porteros`, b.superadmin, {
          ...base,
          documento: 'con signo!',
          contrasenaInicial: INICIAL,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await pedir(b, 'post', `/copropiedades/${COP_A}/porteros`, b.superadmin, {
          ...base,
          documento: 'VALIDO-1',
          contrasenaInicial: 'corta',
        })
      ).status,
    ).toBe(400);
  });

  it('el alta ya no admite escoger el usuario: el campo no existe', async () => {
    const r = await pedir(b, 'post', `/copropiedades/${COP_A}/porteros`, b.superadmin, {
      usuario: 'escogido',
      documento: 'ESCOGIDO',
      contrasenaInicial: INICIAL,
      nombre: 'E',
      sectores: [],
    });
    expect(r.status).toBe(400);
  });

  it('ni el administrador ni el portero dan de alta porteros', async () => {
    const portero = await tokenDe(b.firmante, { rol: 'portero', copropiedadId: COP_A });
    for (const t of [b.admin, portero]) {
      const r = await pedir(b, 'post', `/copropiedades/${COP_A}/porteros`, t, {
        documento: 'INTRUSO',
        contrasenaInicial: INICIAL,
        nombre: 'I',
        sectores: [],
      });
      expect(r.status).toBe(403);
    }
  });

  it('una cuenta por CORREO, anterior a la 15-H, sigue entrando', async () => {
    const authUserId = b.proveedor.declarar('admin@ejemplo.co', CLAVE_DEL_ADMINISTRADOR);
    b.cuentas.declararCuentaPorCorreo({
      usuarioId: '00000000-0000-4000-8000-0000000000c1',
      authUserId,
      copropiedadId: COP_A,
      rol: 'administrador',
      correo: 'admin@ejemplo.co',
    });
    const r = await pedir(b, 'post', '/auth/acceso', undefined, {
      correo: 'Admin@Ejemplo.co',
      contrasena: CLAVE_DEL_ADMINISTRADOR,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ debeCambiarContrasena: false });
    expect(typeof r.body.accessToken).toBe('string');
  });

  it('un portero por CORREO anterior a la 15-H entra con su número; por correo, ya no', async () => {
    const authUserId = b.proveedor.declarar('garita.vieja@ejemplo.co', INICIAL);
    b.cuentas.declararCuentaPorCorreo({
      usuarioId: '00000000-0000-4000-8000-0000000000c2',
      authUserId,
      copropiedadId: COP_A,
      rol: 'portero',
      correo: 'garita.vieja@ejemplo.co',
      numeroDePortero: 1003,
    });
    // Por número llega al proveedor con SU correo real: la contraseña vale, y
    // lo que lo frena después es una regla de portero —aquí la de IP, porque
    // este banco no tiene el modo pruebas—, no la identidad (401).
    const porNumero = await pedir(b, 'post', '/auth/acceso', undefined, {
      usuario: '1003',
      contrasena: INICIAL,
    });
    expect(porNumero.status).toBe(403);
    expect(texto(porNumero)).toBe(MENSAJE_GUARDIA_REMOTA);
    // H3 · por correo, un portero ya no entra: el número es su única puerta.
    const porCorreo = await pedir(b, 'post', '/auth/acceso', undefined, {
      correo: 'garita.vieja@ejemplo.co',
      contrasena: INICIAL,
    });
    expect(porCorreo.status).toBe(401);
  });

  it('número, contraseña o código equivocados responden EXACTAMENTE lo mismo', async () => {
    const respuestas = await Promise.all([
      acceso(b, 'Porteria.Norte', 'Equivocada#1'),
      acceso(b, '1999', INICIAL),
      acceso(b, 'no.es.un.numero', INICIAL),
      pedir(b, 'post', '/auth/acceso', undefined, {
        codigo: 'ZZZ999',
        usuario: 'porteria.norte',
        contrasena: INICIAL,
      }),
    ]);
    expect(respuestas.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect(new Set(respuestas.map(texto)).size).toBe(1);
  });

  it('el NIT ya no es un campo de la entrada', async () => {
    const r = await pedir(b, 'post', '/auth/acceso', undefined, {
      nit: '900123456-7',
      usuario: '1001',
      contrasena: INICIAL,
    });
    expect(r.status).toBe(400);
  });

  it('el sexto intento contra el MISMO número desde la MISMA IP es 429 con Retry-After (H5)', async () => {
    const estados: number[] = [];
    let espera: string | undefined;
    for (let i = 0; i < 6; i += 1) {
      const r = await accesoDesde(b, '198.51.100.10', 'porteria.sur', 'Equivocada#1');
      estados.push(r.status);
      espera ??= r.headers['retry-after'] as string | undefined;
    }
    expect(estados).toEqual([401, 401, 401, 401, 401, 429]);
    expect(Number(espera)).toBeGreaterThan(0);
  });

  it('el bloqueo es por (IP, número), NUNCA por el número a secas: desde otra IP entra', async () => {
    const r = await accesoDesde(b, '198.51.100.11', 'porteria.sur', INICIAL);
    expect(r.status, JSON.stringify(r.body)).not.toBe(429);
    expect(r.status).not.toBe(401);
  });
});

// ─── Cupo y baja ─────────────────────────────────────────────────────────────

describe('H2 · cupo y baja del portero (ADR-031)', () => {
  let b: Banco;
  beforeAll(async () => {
    b = await montar();
  });

  it('el cupo se fija (0 a 999), y lleno rechaza el alta con un mensaje claro', async () => {
    await alta(b, 'uno');
    const fuera = await pedir(b, 'put', `/copropiedades/${COP_A}/porteros/cupo`, b.superadmin, {
      cupo: 1000,
    });
    expect(fuera.status).toBe(400);
    const cupo = await pedir(b, 'put', `/copropiedades/${COP_A}/porteros/cupo`, b.superadmin, {
      cupo: 1,
    });
    expect(cupo.status, JSON.stringify(cupo.body)).toBe(200);
    const r = await pedir(b, 'post', `/copropiedades/${COP_A}/porteros`, b.superadmin, {
      documento: 'SOBRA',
      contrasenaInicial: INICIAL,
      nombre: 'Sobra',
      sectores: [],
    });
    expect(r.status).toBe(409);
    expect(texto(r)).toMatch(/cupo de porteros activos/);
  });

  it('la baja libera la plaza, pero el número no vuelve: el siguiente es otro', async () => {
    const id = [
      ...(await pedir(b, 'get', `/copropiedades/${COP_A}/porteros`, b.superadmin)).body.porteros,
    ][0].usuarioId as string;
    const sinMotivo = await pedir(
      b,
      'post',
      `/copropiedades/${COP_A}/porteros/${id}/baja`,
      b.superadmin,
      { motivo: 'x' },
    );
    expect(sinMotivo.status).toBe(400);
    const baja = await pedir(
      b,
      'post',
      `/copropiedades/${COP_A}/porteros/${id}/baja`,
      b.superadmin,
      {
        motivo: 'Terminó su contrato',
      },
    );
    expect(baja.status, JSON.stringify(baja.body)).toBe(200);
    const otra = await pedir(
      b,
      'post',
      `/copropiedades/${COP_A}/porteros/${id}/baja`,
      b.superadmin,
      {
        motivo: 'Otra vez',
      },
    );
    expect(otra.status).toBe(404);
    await alta(b, 'dos');
    expect(b.numeros.get('uno')).toBe('1001');
    expect(b.numeros.get('dos')).toBe('1002');
    expect((await bitacora(b, 'baja_de_portero')).map((h) => h.detalle)).toEqual([
      'Terminó su contrato',
    ]);
  });

  it('ni el administrador ni el portero dan de baja ni tocan el cupo', async () => {
    const portero = await tokenDe(b.firmante, { rol: 'portero', copropiedadId: COP_A });
    for (const t of [b.admin, portero]) {
      expect(
        (await pedir(b, 'put', `/copropiedades/${COP_A}/porteros/cupo`, t, { cupo: 5 })).status,
      ).toBe(403);
    }
  });
});

// ─── Primer ingreso ──────────────────────────────────────────────────────────

describe('primer ingreso · cambio obligatorio impuesto en el servidor (ADR-023)', () => {
  let b: Banco;
  let id = '';
  let token = '';
  beforeAll(async () => {
    b = await montar('2026-09-26T12:00:00Z');
    id = await alta(b, 'relevo.dia');
    await turno(b, id, '2026-09-26', '06:00', '18:00');
    const r = await acceso(b, 'relevo.dia', INICIAL);
    expect(r.status).toBe(200);
    expect(r.body.debeCambiarContrasena).toBe(true);
    token = r.body.accessToken;
  });

  it('sólo DOS rutas admiten el cambio pendiente, leídas del código', () => {
    expect(rutasConMetadato(b.app, CLAVE_CON_CAMBIO_PENDIENTE)).toEqual([
      '/auth/cierre',
      '/auth/contrasena',
    ]);
    expect(rutasConMetadato(b.app, CLAVE_DURANTE_EL_PATRULLAJE)).toEqual([
      '/auth/cierre',
      '/porteria/sesion',
      '/porteria/sesion/desbloqueo',
    ]);
    expect(rutasConMetadato(b.app, CLAVE_FUERA_DE_TURNO)).toEqual([
      '/auth/cierre',
      '/porteria/sesion',
    ]);
  });

  it('con el cambio pendiente, el portero recibe 403 en su consola y en las operativas', async () => {
    for (const [m, ruta] of [
      ['get', '/porteria/sesion'],
      ['get', '/porteria/perfil'],
      ['get', '/auth/sesion'],
      ['get', `/copropiedades/${COP_A}/guardia/ordenes`],
      ['post', `/copropiedades/${COP_A}/guardia/ordenes`],
    ] as const) {
      const r = await pedir(b, m, ruta, token, m === 'post' ? {} : undefined);
      expect(r.status, `${m} ${ruta}`).toBe(403);
      expect(texto(r), `${m} ${ruta}`).toBe(MENSAJE_CAMBIO_PENDIENTE);
    }
  });

  it('TODA ruta autenticada responde 403 a una cuenta con el cambio pendiente, salvo cambio y cierre', async () => {
    const administrador = await tokenDe(b.firmante, {
      rol: 'administrador',
      copropiedadId: COP_A,
      debeCambiarContrasena: true,
    });
    const publicas = new Set(rutasConMetadato(b.app, CLAVE_PUBLICO));
    const abiertas: string[] = [];
    for (const r of enumerarRutas(b.app)) {
      if (
        publicas.has(r.ruta) ||
        ['/auth/contrasena', '/auth/cierre', '/health', '/ready'].includes(r.ruta)
      )
        continue;
      if (
        r.ruta.startsWith('/ingesta') ||
        r.ruta.startsWith('/alarm-server') ||
        r.ruta.startsWith('/consentimiento') ||
        r.ruta === '/copropiedades/ingesta'
      )
        continue;
      const ruta = r.ruta
        .replace(':id', COP_A)
        .replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-0000000000ff');
      const cliente = request(b.app.getHttpServer());
      const res = await cliente[r.metodo.toLowerCase() as Metodo](ruta)
        .set('Authorization', `Bearer ${administrador}`)
        .send({});
      if (res.status !== 403) abiertas.push(`${r.metodo} ${r.ruta} → ${res.status}`);
    }
    expect(abiertas).toEqual([]);
  }, 30_000); // 15-S1: una petición por ruta; 5 s no alcanzan con el runner de macOS cargado

  it('el cierre de sesión sí se admite con el cambio pendiente', async () => {
    const otro = await acceso(b, 'relevo.dia', INICIAL);
    const r = await pedir(b, 'post', '/auth/cierre', otro.body.accessToken);
    expect(r.status).toBe(200);
    expect(b.proveedor.revocados).toContain(otro.body.accessToken);
  });

  it('la nueva no puede ser la inicial, ni incumplir la política, y la actual tiene que ser la buena', async () => {
    expect(
      (await pedir(b, 'post', '/auth/contrasena', token, { actual: INICIAL, nueva: INICIAL }))
        .status,
    ).toBe(400);
    expect(
      (await pedir(b, 'post', '/auth/contrasena', token, { actual: INICIAL, nueva: 'sinmayus1!' }))
        .status,
    ).toBe(400);
    expect(
      (await pedir(b, 'post', '/auth/contrasena', token, { actual: 'Otra#2026', nueva: NUEVA }))
        .status,
    ).toBe(400);
    expect(b.cuentas.cambioPendiente(id)).toBe(true);
  });

  it('cambiada, el indicador se apaga y el siguiente ingreso ya opera', async () => {
    const r = await pedir(b, 'post', '/auth/contrasena', token, { actual: INICIAL, nueva: NUEVA });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(b.cuentas.cambioPendiente(id)).toBe(false);
    expect((await acceso(b, 'relevo.dia', INICIAL)).status).toBe(401);
    const nuevo = await acceso(b, 'relevo.dia', NUEVA);
    expect(nuevo.body.debeCambiarContrasena).toBe(false);
    const sesion = await pedir(b, 'get', '/porteria/sesion', nuevo.body.accessToken);
    expect(sesion.status).toBe(200);
    expect(sesion.body.codigo).toMatch(/^\d{4}$/);
    expect((await bitacora(b, 'cambio_de_contrasena')).map((h) => h.usuarioId)).toEqual([id]);
  });

  it('un administrador con aal1 y SIN el cambio pendiente no cambia la contraseña sin segundo factor', async () => {
    const aal1 = await tokenDe(b.firmante, {
      rol: 'administrador',
      copropiedadId: COP_A,
      aal: 'aal1',
    });
    expect(
      (await pedir(b, 'post', '/auth/contrasena', aal1, { actual: 'Clave#2026', nueva: NUEVA }))
        .status,
    ).toBe(403);
  });
});

// ─── Turnos ──────────────────────────────────────────────────────────────────

describe('turnos impuestos en el servidor, con la zona de la copropiedad (ADR-024)', () => {
  let b: Banco;
  let id = '';
  beforeAll(async () => {
    b = await montar('2026-09-26T02:59:59Z');
    id = await alta(b, 'noche');
    await b.cuentas.fijarCambioObligatorio(id, false);
  });

  it('un turno de 22:00 a 06:00 en Bogotá cruza la medianoche: 03:00Z a 11:00Z del día siguiente', async () => {
    const r = await turno(b, id, '2026-09-25', '22:00', '06:00');
    expect(r.status).toBe(201);
    expect(r.body.turno).toMatchObject({
      inicio: '2026-09-26T03:00:00.000Z',
      fin: '2026-09-26T11:00:00.000Z',
      cruzaMedianoche: true,
    });
  });

  it('ANTES del turno no entra, aunque la contraseña sea buena', async () => {
    const r = await acceso(b, 'noche', INICIAL, '203.0.113.7');
    expect(r.status).toBe(403);
    expect(texto(r)).toMatch(/Fuera de su turno/);
    expect(b.proveedor.revocados).toHaveLength(1);
  });

  let token = '';
  it('DURANTE el turno —pasada la medianoche— entra y opera', async () => {
    b.mover('2026-09-26T03:00:00Z');
    const r = await acceso(b, 'noche', INICIAL, '203.0.113.7');
    expect(r.status).toBe(200);
    token = r.body.accessToken;
    b.mover('2026-09-26T07:30:00Z');
    expect((await pedir(b, 'get', `/copropiedades/${COP_A}/guardia/ordenes`, token)).status).toBe(
      200,
    );
  });

  it('la sesión se BLOQUEA al terminar el turno: el último milisegundo sí, el minuto de fin ya no', async () => {
    b.mover('2026-09-26T10:59:59.999Z');
    expect((await pedir(b, 'get', `/copropiedades/${COP_A}/guardia/ordenes`, token)).status).toBe(
      200,
    );
    b.mover('2026-09-26T11:00:00Z');
    const fin = await pedir(b, 'get', `/copropiedades/${COP_A}/guardia/ordenes`, token);
    expect(fin.status).toBe(403);
    expect(texto(fin)).toMatch(/Fuera de su turno/);
    expect((await pedir(b, 'get', `/copropiedades/${COP_A}/guardia/ordenes`, token)).status).toBe(
      401,
    );
    const estado = await pedir(b, 'get', '/porteria/sesion', token);
    expect(estado.body).toMatchObject({
      estado: 'cerrada',
      motivoCierre: 'fin_de_turno',
      codigo: null,
    });
  });

  it('DESPUÉS del turno no entra', async () => {
    expect((await acceso(b, 'noche', INICIAL)).status).toBe(403);
  });

  it('la bitácora lo cuenta todo, con el origen que declaró la consola y la duración', async () => {
    const hechos = await bitacora(b);
    const tipos = hechos.map((h) => h.tipo);
    expect(tipos.filter((t) => t === 'acceso_rechazado')).toHaveLength(2);
    expect(hechos.find((h) => h.tipo === 'inicio_de_sesion')?.origenDeclarado).toBe('203.0.113.7');
    const cierre = hechos.find((h) => h.tipo === 'cierre_de_sesion');
    expect(cierre).toMatchObject({ detalle: 'fin_de_turno', duracionSegundos: 8 * 3600 });
  });

  it('turno EXTRA: sólo el superadministrador, y con motivo', async () => {
    const extra = { tipo: 'extra', motivo: 'Cubre la incapacidad del turno de día' };
    const portero = await tokenDe(b.firmante, { rol: 'portero', copropiedadId: COP_A });
    const datos = {
      porteroId: id,
      dia: '2026-09-26',
      horaInicio: '06:00',
      horaFin: '08:00',
      tipo: 'extra',
    };
    expect(
      (
        await pedir(b, 'post', `/copropiedades/${COP_A}/turnos`, b.admin, {
          ...datos,
          motivo: extra.motivo,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await pedir(b, 'post', `/copropiedades/${COP_A}/turnos`, portero, {
          ...datos,
          motivo: extra.motivo,
        })
      ).status,
    ).toBe(403);
    expect(
      (await pedir(b, 'post', `/copropiedades/${COP_A}/turnos`, b.superadmin, datos)).status,
    ).toBe(400);
    const r = await turno(b, id, '2026-09-26', '06:00', '08:00', extra);
    expect(r.status).toBe(201);
    expect(r.body.turno.tipo).toBe('extra');
    expect((await bitacora(b, 'turno_extra')).map((h) => h.detalle)).toEqual([extra.motivo]);
    // Y con el turno extra vigente, vuelve a entrar.
    expect((await acceso(b, 'noche', INICIAL)).status).toBe(200);
  });

  it('dos porteros solapados en la misma portería se permiten y quedan registrados', async () => {
    const otro = await alta(b, 'apoyo');
    const r = await turno(b, otro, '2026-09-26', '07:00', '09:00');
    expect(r.status).toBe(201);
    expect(r.body.solapes).toHaveLength(1);
    expect(await bitacora(b, 'solape_de_turno')).toHaveLength(1);
  });

  let relevada = '';
  it('el relevo es por turno PROPIO: si le asignan otro a continuación, la sesión sigue con código nuevo', async () => {
    b.mover('2026-09-26T12:30:00Z');
    const t = (await acceso(b, 'noche', INICIAL)).body.accessToken as string;
    relevada = t;
    const antes = (await pedir(b, 'get', '/porteria/sesion', t)).body;
    await turno(b, id, '2026-09-26', '08:00', '10:00');
    b.mover('2026-09-26T13:30:00Z');
    const despues = (await pedir(b, 'get', '/porteria/sesion', t)).body;
    expect(despues.estado).toBe('activa');
    expect(despues.turnoFin).toBe('2026-09-26T15:00:00.000Z');
    expect(despues.turnoFin).not.toBe(antes.turnoFin);
  });

  it('retirar el turno vigente cierra la sesión en la siguiente petición', async () => {
    const lista = await pedir(
      b,
      'get',
      `/copropiedades/${COP_A}/turnos?desde=2026-09-26T13:00:00Z&hasta=2026-09-26T16:00:00Z`,
      b.superadmin,
    );
    const vigente = (lista.body.turnos as { id: string; porteroId: string }[]).find(
      (x) => x.porteroId === id,
    );
    expect(vigente).toBeDefined();
    // La misma sesión del relevo: un sexto inicio de sesión en el mismo minuto
    // se lo llevaría el límite por cuenta (S-50), que es correcto.
    const t = relevada;
    expect(
      (
        await pedir(
          b,
          'post',
          `/copropiedades/${COP_A}/turnos/${vigente?.id}/retiro`,
          b.superadmin,
          { motivo: 'Cambio de programación' },
        )
      ).status,
    ).toBe(200);
    expect((await pedir(b, 'get', `/copropiedades/${COP_A}/guardia/ordenes`, t)).status).toBe(403);
  });
});

// ─── Patrullaje ──────────────────────────────────────────────────────────────

describe('patrullaje · bloqueo de pantalla impuesto en el servidor (ADR-024)', () => {
  let b: Banco;
  let token = '';
  let codigo = '';
  const orden = {
    dispositivoId: DISPOSITIVO,
    accion: 'abrir',
    motivo: 'Visitante anunciado por citófono',
  };
  beforeAll(async () => {
    b = await montar('2026-09-26T12:00:00Z');
    token = (await porteroListo(b, 'ronda')).token;
    codigo = (await pedir(b, 'get', '/porteria/sesion', token)).body.codigo;
    expect(codigo).toMatch(/^\d{4}$/);
  });
  const otroCodigo = (): string => String((Number(codigo) + 1) % 10_000).padStart(4, '0');

  it('en patrullaje la API rechaza TODA acción operativa con 423, y el código ya no se muestra', async () => {
    const p = await pedir(b, 'post', '/porteria/sesion/patrullaje', token);
    expect(p.body).toMatchObject({ estado: 'patrullaje', codigo: null });
    expect(
      (await pedir(b, 'post', `/copropiedades/${COP_A}/guardia/ordenes`, token, orden)).status,
    ).toBe(423);
    expect((await pedir(b, 'get', `/copropiedades/${COP_A}/eventos`, token)).status).toBe(423);
    expect((await pedir(b, 'get', '/porteria/perfil', token)).status).toBe(423);
  });

  it('recargar la consola no lo evita: el estado vive en el servidor', async () => {
    const r = await pedir(b, 'get', '/porteria/sesion', token);
    expect(r.body).toMatchObject({ estado: 'patrullaje', codigo: null, intentosRestantes: 5 });
  });

  it('un código equivocado no desbloquea; el correcto sí, y la duración queda en la bitácora', async () => {
    expect(
      (await pedir(b, 'post', '/porteria/sesion/desbloqueo', token, { codigo: otroCodigo() })).body
        .resultado,
    ).toBe('incorrecto');
    expect((await pedir(b, 'get', '/porteria/sesion', token)).body.intentosRestantes).toBe(4);
    b.mover('2026-09-26T12:15:00Z');
    expect(
      (await pedir(b, 'post', '/porteria/sesion/desbloqueo', token, { codigo })).body.resultado,
    ).toBe('desbloqueada');
    expect(
      (await pedir(b, 'post', `/copropiedades/${COP_A}/guardia/ordenes`, token, orden)).status,
    ).toBe(201);
    expect((await bitacora(b, 'fin_de_patrullaje'))[0]?.duracionSegundos).toBe(900);
  });

  it('el QUINTO código equivocado cierra la sesión del todo: aquí y en el proveedor', async () => {
    await pedir(b, 'post', '/porteria/sesion/patrullaje', token);
    const resultados: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      resultados.push(
        (await pedir(b, 'post', '/porteria/sesion/desbloqueo', token, { codigo: otroCodigo() }))
          .body.resultado,
      );
    }
    expect(resultados).toEqual(['incorrecto', 'incorrecto', 'incorrecto', 'incorrecto', 'agotado']);
    expect((await pedir(b, 'get', '/porteria/sesion', token)).body).toMatchObject({
      estado: 'cerrada',
      motivoCierre: 'intentos_agotados',
    });
    expect((await pedir(b, 'get', `/copropiedades/${COP_A}/guardia/ordenes`, token)).status).toBe(
      401,
    );
    expect(b.proveedor.revocados).toContain(token);
    // Con la contraseña vuelve a entrar: el patrullaje es un bloqueo, no un factor.
    expect((await acceso(b, 'ronda', INICIAL)).status).toBe(200);
  });
});

// ─── Permisos del portero ────────────────────────────────────────────────────

describe('permisos del portero, por guarda declarativa y contra la API real (E-02)', () => {
  let b: Banco;
  let portero = '';
  let propio = '';
  beforeAll(async () => {
    b = await montar('2026-09-26T12:00:00Z');
    const listo = await porteroListo(b, 'garita');
    portero = listo.token;
    propio = listo.id;
    b.app.get(RepositorioZonasEnMemoria).declarar(
      (() => {
        const z = Zona.crear({
          id: ZONA,
          copropiedadId: COP_A,
          nombre: 'Piscina',
          tipo: 'comun',
          horario: (HorarioDeZona.crear([], -300) as { ok: true; valor: HorarioDeZona }).valor,
          aforo: (Aforo.crear(10, 0) as { ok: true; valor: Aforo }).valor,
        });
        if (!esExito(z)) throw new Error('zona de prueba inválida');
        return z.valor;
      })(),
    );
  });

  const EQUIPO = '00000000-0000-4000-8000-0000000000e1';
  it.each([
    ['crear un equipo', 'post', `/copropiedades/${COP_A}/equipos`],
    ['editar un equipo', 'put', `/copropiedades/${COP_A}/equipos/${EQUIPO}`],
    ['configurar un equipo', 'post', `/copropiedades/${COP_A}/equipos/${EQUIPO}/correcciones`],
    ['dar de baja un equipo', 'post', `/copropiedades/${COP_A}/equipos/${EQUIPO}/baja`],
    [
      'probar la conexión de un equipo',
      'post',
      `/copropiedades/${COP_A}/equipos/prueba-de-conexion`,
    ],
    ['tocar la configuración de la copropiedad', 'patch', `/copropiedades/${COP_A}/configuracion`],
    ['configurar una zona común', 'post', `/copropiedades/${COP_A}/zonas/${ZONA}/configuracion`],
    ['asignarse un turno', 'post', `/copropiedades/${COP_A}/turnos`],
  ] as const)('NO puede %s', async (_que, metodo, ruta) => {
    expect((await pedir(b, metodo, ruta, portero, {})).status).toBe(403);
  });

  it('NO puede editar su perfil: no hay ruta suya, y la de supervisión es del superadministrador', async () => {
    const r = await pedir(b, 'put', `/copropiedades/${COP_A}/porteros/${propio}`, portero, {
      nombre: 'Me cambio',
      sectores: [],
    });
    expect(r.status).toBe(403);
    const perfil = await pedir(b, 'get', '/porteria/perfil', portero);
    expect(perfil.status).toBe(200);
    expect(perfil.body).toMatchObject({
      numero: Number(b.numeros.get('garita')),
      documento: 'GARITA',
      porteria: 'Norte',
      sectores: ['Torre 1', 'Torre 2'],
    });
    expect(JSON.stringify(perfil.body)).not.toContain('@');
  });

  it('PUEDE ver eventos y accionar un equipo (abrir)', async () => {
    const rango = 'desde=2026-09-26T00:00:00Z&hasta=2026-09-27T00:00:00Z';
    expect(
      (await pedir(b, 'get', `/copropiedades/${COP_A}/eventos?${rango}`, portero)).status,
    ).toBe(200);
    const r = await pedir(b, 'post', `/copropiedades/${COP_A}/guardia/ordenes`, portero, {
      dispositivoId: DISPOSITIVO,
      accion: 'abrir',
      motivo: 'Proveedor de gas autorizado',
    });
    expect(r.status).toBe(201);
  });

  it('PUEDE bloquear y desbloquear un acceso (C-32)', async () => {
    const r = await pedir(b, 'post', `/copropiedades/${COP_A}/guardia/bloqueo`, portero, {
      dispositivoId: DISPOSITIVO,
      bloqueado: true,
      motivo: 'Barrera averiada, se cierra el acceso',
    });
    expect(r.status).toBe(201);
  });

  it('PUEDE cerrar y abrir una zona común, con motivo (C-32)', async () => {
    const cerrar = await pedir(
      b,
      'post',
      `/copropiedades/${COP_A}/zonas/${ZONA}/apertura`,
      portero,
      { abierta: false, motivo: 'Tormenta eléctrica' },
    );
    expect(cerrar.status).toBe(201);
    expect(
      (
        await pedir(b, 'post', `/copropiedades/${COP_A}/zonas/${ZONA}/apertura`, portero, {
          abierta: true,
        })
      ).status,
    ).toBe(400);
  });

  it('PUEDE recibir el flujo en vivo (SSE) donde llegan las llamadas del videoportero', async () => {
    const estado = await new Promise<{ codigo: number; tipo: string }>((resolver, rechazar) => {
      const peticion = getHttp(
        `${direccionDe(b.app)}/copropiedades/${COP_A}/eventos/flujo`,
        { headers: { Authorization: `Bearer ${portero}` } },
        (res) => {
          resolver({
            codigo: res.statusCode ?? 0,
            tipo: String(res.headers['content-type'] ?? ''),
          });
          peticion.destroy();
        },
      );
      peticion.on('error', (e) => (e.message.includes('socket hang up') ? undefined : rechazar(e)));
    });
    expect(estado.codigo).toBe(200);
    expect(estado.tipo).toContain('text/event-stream');
  });
});

// ─── Restablecimiento y panel ────────────────────────────────────────────────

describe('restablecimiento por una persona y panel de supervisión (B4)', () => {
  let b: Banco;
  let portero = { id: '', token: '' };
  beforeAll(async () => {
    b = await montar('2026-09-26T12:00:00Z');
    portero = await porteroListo(b, 'central');
  });

  it('el panel lista al portero de turno y con sesión, con su origen', async () => {
    const r = await pedir(b, 'get', `/copropiedades/${COP_A}/porteros`, b.superadmin);
    const p = (
      r.body.porteros as {
        usuarioId: string;
        turnoVigente: unknown;
        sesionAbierta: { estado: string } | null;
      }[]
    ).find((x) => x.usuarioId === portero.id);
    expect(p?.turnoVigente).not.toBeNull();
    expect(p?.sesionAbierta?.estado).toBe('activa');
  });

  it('el panel es del superadministrador: el administrador recibe 403 en todas sus rutas', async () => {
    for (const [m, ruta] of [
      ['get', `/copropiedades/${COP_A}/porteros`],
      [
        'get',
        `/copropiedades/${COP_A}/turnos?desde=2026-09-26T00:00:00Z&hasta=2026-09-27T00:00:00Z`,
      ],
      [
        'get',
        `/copropiedades/${COP_A}/porteria/bitacora?desde=2026-09-26T00:00:00Z&hasta=2026-09-27T00:00:00Z`,
      ],
    ] as const) {
      expect((await pedir(b, m, ruta, b.admin)).status, ruta).toBe(403);
    }
  });

  it('el calendario no admite rangos de más de 62 días', async () => {
    expect(
      (
        await pedir(
          b,
          'get',
          `/copropiedades/${COP_A}/turnos?desde=2026-01-01T00:00:00Z&hasta=2026-06-01T00:00:00Z`,
          b.superadmin,
        )
      ).status,
    ).toBe(400);
  });

  it('el administrador NO restablece a un portero; el superadministrador sí, y la sesión viva del portero se cierra', async () => {
    const ruta = `/copropiedades/${COP_A}/usuarios/${portero.id}/restablecimiento`;
    expect((await pedir(b, 'post', ruta, b.admin, { temporal: 'Temporal#2026' })).status).toBe(403);
    expect((await pedir(b, 'post', ruta, b.superadmin, { temporal: 'debil' })).status).toBe(400);
    const r = await pedir(b, 'post', ruta, b.superadmin, { temporal: 'Temporal#2026' });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain('Temporal#2026');
    expect(
      (await pedir(b, 'get', `/copropiedades/${COP_A}/guardia/ordenes`, portero.token)).status,
    ).toBe(401);
    const otra = await acceso(b, 'central', 'Temporal#2026');
    expect(otra.body.debeCambiarContrasena).toBe(true);
    expect((await bitacora(b, 'restablecimiento_de_contrasena'))[0]).toMatchObject({
      usuarioId: portero.id,
      actorId: SUPER,
    });
  });

  it('el administrador SÍ restablece a un residente de su copropiedad, y no a uno de otra', async () => {
    const residente = '00000000-0000-4000-8000-0000000000d1';
    const ajeno = '00000000-0000-4000-8000-0000000000d2';
    b.cuentas.declararCuentaPorCorreo({
      usuarioId: residente,
      authUserId: b.proveedor.declarar('res@ejemplo.co', 'Res#20260'),
      copropiedadId: COP_A,
      rol: 'residente',
      correo: 'res@ejemplo.co',
    });
    b.cuentas.declararCuentaPorCorreo({
      usuarioId: ajeno,
      authUserId: b.proveedor.declarar('ajeno@ejemplo.co', 'Res#20260'),
      copropiedadId: COP_B,
      rol: 'residente',
      correo: 'ajeno@ejemplo.co',
    });
    expect(
      (
        await pedir(
          b,
          'post',
          `/copropiedades/${COP_A}/usuarios/${residente}/restablecimiento`,
          b.admin,
          { temporal: 'Temporal#2026' },
        )
      ).status,
    ).toBe(200);
    expect(b.cuentas.cambioPendiente(residente)).toBe(true);
    expect(
      (
        await pedir(
          b,
          'post',
          `/copropiedades/${COP_A}/usuarios/${ajeno}/restablecimiento`,
          b.admin,
          { temporal: 'Temporal#2026' },
        )
      ).status,
    ).toBe(404);
  });
});
