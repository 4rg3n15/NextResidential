import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, enumerarRutas, tokenDe } from './utilidades';
import type { Firmante, RutaExpuesta } from './utilidades';

/**
 * D-71 · **EL SUPERADMINISTRADOR TIENE QUE PODER ESCRIBIR.**
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL DEFECTO, Y POR QUÉ NINGUNA PRUEBA LO VIO
 *
 * Su `copropiedad_id` es **nulo por diseño**: no pertenece a ninguna, las
 * alcanza todas, y quien lo resuelve es `app.es_superadmin()`. Los casos de uso
 * de escritura leían la copropiedad del token, así que devolvían «La identidad
 * no tiene copropiedad» y **ninguna escritura funcionaba**: vivienda, residente,
 * vehículo, carga de padrón, autorización, lista negra, biometría.
 *
 * No se vio porque **todas las pruebas de escritura usaban administrador**, que
 * sí lleva `copropiedad_id`. Es el mismo hueco que dejó las ocho pantallas en
 * «sin permiso» durante una semana: el rol que no encaja en el modelo mental de
 * «una identidad, una copropiedad» es justo el que nadie recorre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTA SUITE SE DERIVA DEL ENRUTADOR, NO DE UNA LISTA
 *
 * Recorre **toda ruta de escritura** que el enrutador expone bajo
 * `copropiedades/:id`. Una ruta nueva entra sola; si alguien vuelve a colgar
 * una escritura de una raíz sin copropiedad, el primer `it` la nombra.
 */
let app: INestApplication;
let firmante: Firmante;
let rutas: RutaExpuesta[];

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  rutas = enumerarRutas(app);
});
afterAll(async () => {
  await app?.close();
});

/** Rutas de escritura exentas, con su motivo. La lista es corta a propósito. */
const EXENTAS = new Set([
  // Identidad del propio llamante: no operan sobre una copropiedad.
  '/auth/restablecimiento',
  '/auth/mfa/codigos',
  '/auth/mfa/recuperacion',
  // Identidad de SERVICIO: la copropiedad llega en el cuerpo firmado, y su
  // alcance lo comprueba `exigirAlcanceDeServicio` (§2.7.6).
  '/ingesta/eventos',
  '/ingesta/latidos',
  // ETAPA 12 · la bandeja del Edge. Cada evento del lote trae su
  // `copropiedadId` dentro del cuerpo FIRMADO, igual que los dos de arriba:
  // quien reconcilia es un equipo, no una sesión, y no hay token del que
  // derivar una copropiedad.
  '/ingesta/reconciliacion',
  '/copropiedades/ingesta',
]);

const escrituras = (): RutaExpuesta[] =>
  rutas.filter((r) => r.metodo !== 'GET' && !EXENTAS.has(r.ruta));

describe('ninguna escritura depende de que el token traiga copropiedad', () => {
  it('toda ruta de escritura cuelga de `copropiedades/:id`', () => {
    /**
     * Es la comprobación estructural que impide la reaparición. Una escritura
     * fuera de `copropiedades/:id` sólo puede sacar la copropiedad del token, y
     * ahí es donde el superadministrador no la tiene.
     */
    const sueltas = escrituras()
      .filter((r) => !r.ruta.startsWith('/copropiedades/:id'))
      .map((r) => `${r.metodo} ${r.ruta}`);
    expect(
      sueltas,
      'estas escrituras toman la copropiedad del token y fallarán con superadministrador',
    ).toEqual([]);
  });

  it('hay escrituras que comprobar (si esto falla, la suite no prueba nada)', () => {
    expect(escrituras().length).toBeGreaterThan(10);
  });
});

/**
 * El recorrido: **el mismo cuerpo, los dos roles**. Lo que se compara no es que
 * la operación tenga éxito —muchos cuerpos vacíos dan 400 por validación, y eso
 * está bien— sino que el superadministrador **no reciba nunca «La identidad no
 * tiene copropiedad»**, que es el síntoma de D-71.
 */
const SENAL_DE_D71 = /identidad no tiene copropiedad|sin copropiedad/i;

const cuerpoDe = (r: RutaExpuesta): Record<string, unknown> => {
  if (r.ruta.endsWith('/padron/viviendas')) return { identificador: 'CASA-1' };
  if (r.ruta.endsWith('/guardia/ordenes')) {
    return {
      dispositivoId: '20000000-0000-4000-8000-000000000001',
      accion: 'abrir',
      motivo: 'Visitante esperado por la vivienda 4',
    };
  }
  return {};
};

const invocar = (r: RutaExpuesta, token: string) => {
  const ruta = r.ruta
    .replace(':id', COP_B)
    .replace(/:[A-Za-z]+/g, '00000000-0000-4000-8000-0000000000ff');
  const metodo = r.metodo.toLowerCase() as 'post' | 'patch' | 'delete';
  const agente = request(app.getHttpServer());
  return agente[metodo](ruta).set('Authorization', `Bearer ${token}`).send(cuerpoDe(r));
};

describe('D-71 · el superadministrador escribe en la copropiedad del selector', () => {
  it('NINGUNA escritura le responde «la identidad no tiene copropiedad»', async () => {
    // Con `copropiedadId: null`, que es como el gancho de claims lo emite.
    const token = await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: null });
    const rotas: string[] = [];
    for (const r of escrituras()) {
      const res = await invocar(r, token);
      const cuerpo = JSON.stringify(res.body);
      if (SENAL_DE_D71.test(cuerpo)) rotas.push(`${r.metodo} ${r.ruta} → ${cuerpo.slice(0, 90)}`);
    }
    expect(rotas, `D-71 reaparecido en: ${rotas.join(' | ')}`).toEqual([]);
  });

  it('el alta de vivienda pasa el alcance y llega al repositorio', async () => {
    /**
     * Lo que ESTE banco puede demostrar y lo que no, dicho sin adornos.
     *
     * Aquí el repositorio del padrón es el de PostgreSQL y **no hay base**, así
     * que la petición termina en 500 al conectar. Eso no es D-71: D-71 era un
     * **400 del dominio** antes de tocar nada. La distinción es la prueba —si
     * el alcance siguiera roto, no se llegaría al repositorio—.
     *
     * El alta de verdad, con base, se ejerce en `padron-superadmin.test.ts`,
     * que corre en el paso 13 con `--con-base`.
     */
    const token = await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: null });
    const res = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/padron/viviendas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ identificador: `TORRE-A-${String(Date.now())}` });
    expect(res.status).not.toBe(400);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(SENAL_DE_D71);
  });
});

describe('el aislamiento NO se afloja al arreglarlo', () => {
  it('un administrador no escribe en otra copropiedad aunque manipule el selector', async () => {
    // La copropiedad de destino viene de la ruta, y la ruta la pone el cliente.
    // Por eso `exigirAlcance` la valida contra el alcance REAL antes de operar:
    // si no, mover la copropiedad al camino habría convertido el arreglo en la
    // fuga.
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    const res = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/padron/viviendas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ identificador: 'INTRUSA-1' });
    // 404 y no 403: un 403 confirmaría que la copropiedad existe.
    expect(res.status).toBe(404);
  });

  it('y tampoco por el resto de escrituras', async () => {
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    const fugas: string[] = [];
    for (const r of escrituras()) {
      const res = await invocar(r, token);
      if (res.status >= 200 && res.status < 300)
        fugas.push(`${r.metodo} ${r.ruta} → ${res.status}`);
    }
    expect(fugas, `FUGA: ${fugas.join(' | ')}`).toEqual([]);
  });

  it('un portero tampoco escribe en el padrón de la suya: no es su rol', async () => {
    const token = await tokenDe(firmante, { rol: 'portero', copropiedadId: COP_B });
    const res = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/padron/viviendas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ identificador: 'CASA-PORTERO' });
    expect(res.status).toBe(403);
  });
});
