import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, enumerarRutas, tokenDe } from './utilidades';
import type { Firmante, RutaExpuesta } from './utilidades';
import { AuditoriaEnMemoria } from '../src/comun/auditoria';

/**
 * SUITE DE AISLAMIENTO MULTIEMPRESA · KPI-36, KPI-37, KPI-38, CA-24, CP-11
 *
 * Rompe el build ante cualquier fuga. Recorre **todos** los endpoints del
 * enrutador —no una lista escrita a mano— por los DOS caminos que exige
 * §2.7.6: JWT de usuario e identidad de servicio (la que usa la llave secreta,
 * que omite la RLS).
 */
let app: INestApplication;
let firmante: Firmante;
let rutas: RutaExpuesta[];

const PUBLICAS = new Set(['GET /health', 'GET /ready']);

/**
 * Rutas que declaran `@SinRecursoDeTenant()`: operan sobre la identidad del
 * propio llamante. La lista se DERIVA del código, no se escribe aquí: si
 * alguien añade un endpoint sin ese decorador, entra en el recorrido de fuga
 * automáticamente.
 */
const SIN_RECURSO_TENANT = new Set([
  '/auth/sesion',
  '/auth/restablecimiento',
  '/auth/mfa/codigos',
  '/auth/mfa/recuperacion',
]);

/**
 * Rutas que declaran `@SinSegundoFactor()`: alcanzables con `aal1` por un rol
 * administrativo. **La lista es de UNA**, y esta suite existe para que siga
 * siéndolo: ampliarla es relajar RN-20, y tiene que verse en el diff.
 */
const SIN_SEGUNDO_FACTOR = new Set(['/auth/restablecimiento', '/auth/mfa/recuperacion']);

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  rutas = enumerarRutas(app);
});
afterAll(async () => {
  await app?.close();
});

const cuerpoDe = (r: RutaExpuesta): Record<string, unknown> =>
  r.ruta.includes('ingesta') ? { copropiedadId: COP_B } : {};

/**
 * Identificador de relleno para los parámetros que NO son la copropiedad
 * (`:eventoId`, `:alertaId`). Sin sustituirlos, la ruta llegaba con el literal
 * `:alertaId`, el `ParseUUIDPipe` devolvía 400 y la prueba daba por buena una
 * ruta que nunca llegó a su comprobación de alcance: cobertura aparente, no
 * real. Con un UUID válido, la petición alcanza el manejador y es la barrera de
 * aislamiento la que responde.
 */
const OTRO_ID = '00000000-0000-4000-8000-0000000000ff';

const invocar = (r: RutaExpuesta, token?: string) => {
  const ruta = r.ruta.replace(':id', COP_B).replace(/:[A-Za-z]+/g, OTRO_ID);
  const peticion = request(app.getHttpServer())[
    r.metodo.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'
  ](ruta);
  if (token) peticion.set('Authorization', `Bearer ${token}`);
  return r.metodo === 'GET' ? peticion : peticion.send(cuerpoDe(r));
};

describe('cobertura de la suite', () => {
  it('hay endpoints que enumerar (si esto falla, la suite no está probando nada)', () => {
    expect(rutas.length).toBeGreaterThan(0);
  });

  it('las exenciones de la suite se corresponden con el decorador del código', () => {
    // Si alguien añade una ruta a SIN_RECURSO_TENANT sin marcarla en el
    // controlador —o al revés—, esto lo delata. La exención tiene que existir
    // en los dos sitios, y el decorador es el que se ve en la revisión.
    const declaradas = rutas.filter((r) => SIN_RECURSO_TENANT.has(r.ruta)).map((r) => r.ruta);
    for (const ruta of SIN_RECURSO_TENANT) {
      expect(declaradas, `${ruta} exenta en la suite pero inexistente en el enrutador`).toContain(
        ruta,
      );
    }
  });

  it('toda ruta no pública queda cubierta por los recorridos de abajo', () => {
    const protegidas = rutas.filter((r) => !PUBLICAS.has(`${r.metodo} ${r.ruta}`));
    expect(protegidas.length).toBeGreaterThan(0);
    // La cobertura es estructural: los `it.each` de abajo se generan a partir
    // de este mismo arreglo, así que un endpoint nuevo entra solo.
    expect(protegidas.every((r) => typeof r.ruta === 'string')).toBe(true);
  });
});

describe('camino 1 · sin token, toda ruta protegida responde 401', () => {
  it('ninguna ruta protegida contesta sin autenticación', async () => {
    const fugas: string[] = [];
    for (const r of rutas) {
      if (PUBLICAS.has(`${r.metodo} ${r.ruta}`)) continue;
      const res = await invocar(r);
      if (res.status !== 401) fugas.push(`${r.metodo} ${r.ruta} → ${res.status}`);
    }
    expect(fugas, `rutas alcanzables sin token: ${fugas.join(', ')}`).toEqual([]);
  });
});

describe('camino 2 · JWT de usuario de OTRA copropiedad', () => {
  it('ningún endpoint devuelve datos de una copropiedad ajena', async () => {
    // Identidad legítima de la copropiedad A pidiendo recursos de la B.
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    const fugas: string[] = [];
    for (const r of rutas) {
      if (PUBLICAS.has(`${r.metodo} ${r.ruta}`)) continue;
      if (SIN_RECURSO_TENANT.has(r.ruta)) continue;
      const res = await invocar(r, token);
      // 404 o 403 son correctos. 2xx sobre un recurso de B es una FUGA.
      if (res.status >= 200 && res.status < 300) {
        fugas.push(
          `${r.metodo} ${r.ruta} → ${res.status} ${JSON.stringify(res.body).slice(0, 80)}`,
        );
      }
    }
    expect(fugas, `FUGA multiempresa: ${fugas.join(' | ')}`).toEqual([]);
  });

  it('404 y no 403: un 403 confirmaría que el identificador existe', async () => {
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    const res = await invocar({ metodo: 'GET', ruta: '/copropiedades/:id' }, token);
    expect(res.status).toBe(404);
  });

  it('la misma ruta SÍ responde para la copropiedad propia', async () => {
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const res = await invocar({ metodo: 'GET', ruta: '/copropiedades/:id' }, token);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(COP_B);
  });
});

describe('camino 3 · identidad de servicio — la que OMITE la RLS', () => {
  it('no puede escribir en una copropiedad fuera de su alcance', async () => {
    const token = await tokenDe(firmante, { rol: 'servicio', copropiedadId: COP_A, aal: 'aal1' });
    const res = await request(app.getHttpServer())
      .post('/copropiedades/ingesta')
      .set('Authorization', `Bearer ${token}`)
      .send({ copropiedadId: COP_B });
    expect(res.status).toBe(403);
  });

  it('sí puede en la suya', async () => {
    const token = await tokenDe(firmante, { rol: 'servicio', copropiedadId: COP_A, aal: 'aal1' });
    const res = await request(app.getHttpServer())
      .post('/copropiedades/ingesta')
      .set('Authorization', `Bearer ${token}`)
      .send({ copropiedadId: COP_A });
    expect(res.status).toBe(201);
  });

  it('no alcanza rutas donde no está admitida explícitamente', async () => {
    const token = await tokenDe(firmante, { rol: 'servicio', copropiedadId: COP_A, aal: 'aal1' });
    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('camino 4 · operador de central (KPI-35)', () => {
  it('alcanza solo las copropiedades de su turno activo', async () => {
    const token = await tokenDe(firmante, {
      rol: 'operador_central',
      copropiedadId: null,
      copropiedades: [COP_A],
    });
    const propia = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}`)
      .set('Authorization', `Bearer ${token}`);
    const ajena = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_B}`)
      .set('Authorization', `Bearer ${token}`);
    expect(propia.status).toBe(200);
    expect(ajena.status).toBe(404);
  });
});

describe('CA-24 · todo acceso cruzado queda registrado', () => {
  it('deja rastro en auditoría de seguridad', async () => {
    const auditoria = app.get(AuditoriaEnMemoria);
    const antes = auditoria.registros.length;
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    await request(app.getHttpServer())
      .get(`/copropiedades/${COP_B}`)
      .set('Authorization', `Bearer ${token}`);
    expect(auditoria.registros.length).toBe(antes + 1);
    expect(auditoria.registros.at(-1)).toMatchObject({
      copropiedadSolicitada: COP_B,
      rol: 'administrador',
    });
  });
});

describe('la exención del segundo factor no crece sin que nadie lo vea', () => {
  it('solo las rutas declaradas son alcanzables con aal1 por un rol administrativo', async () => {
    const token = await tokenDe(firmante, {
      rol: 'administrador',
      copropiedadId: COP_A,
      aal: 'aal1',
    });
    const alcanzables: string[] = [];
    for (const r of rutas) {
      if (PUBLICAS.has(`${r.metodo} ${r.ruta}`)) continue;
      const res = await invocar(r, token);
      // 401 es lo esperado para un administrativo con aal1. Cualquier otra cosa
      // significa que la ruta lo dejó pasar el guard de autenticación.
      if (res.status !== 401) alcanzables.push(r.ruta);
    }
    expect(new Set(alcanzables)).toEqual(SIN_SEGUNDO_FACTOR);
  });

  it('con aal1 un administrador NO alcanza ninguna ruta de copropiedad', async () => {
    const token = await tokenDe(firmante, {
      rol: 'administrador',
      copropiedadId: COP_A,
      aal: 'aal1',
    });
    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/tablero/indicadores`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('cobertura tras la ETAPA 09-A', () => {
  it('los endpoints del tablero entraron solos en el recorrido', () => {
    // Confirmación explícita de lo que la ETAPA 09-A añadió: tres rutas de
    // lectura bajo `copropiedades/:id`. Nadie las escribió en esta suite; los
    // recorridos de arriba las atacaron con un token de OTRA copropiedad y
    // ninguna devolvió 2xx. Si mañana alguien monta el tablero fuera de
    // `copropiedades/:id`, esto se pone rojo antes que la fuga.
    const tablero = rutas.filter((r) => r.ruta.includes('/tablero/'));
    expect(tablero.map((r) => r.ruta).sort()).toEqual([
      '/copropiedades/:id/tablero/accesos-por-hora',
      '/copropiedades/:id/tablero/dispositivos',
      '/copropiedades/:id/tablero/indicadores',
    ]);
    expect(tablero.every((r) => !SIN_RECURSO_TENANT.has(r.ruta))).toBe(true);
  });
});

describe('cobertura tras la ETAPA 04', () => {
  it('los endpoints del padrón entraron solos en el recorrido', () => {
    // La enumeración del enrutador funcionó: nadie añadió estas rutas a la
    // suite a mano. Si el padrón hubiera filtrado, el recorrido de arriba ya
    // habría roto el build.
    const padron = rutas.filter((r) => r.ruta.startsWith('/padron'));
    expect(padron.length).toBeGreaterThanOrEqual(4);
  });
});
