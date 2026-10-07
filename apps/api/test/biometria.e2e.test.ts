import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { FACE_TEMPLATE_PROVIDER } from '@ncr/domain-core';
import type { MockProvider } from '@ncr/providers';
import type { ContextoTenant } from '../src/autenticacion';
import { CapturarRostro } from '../src/biometria';
import { AlmacenEnMemoria } from '../src/biometria/infraestructura/boveda-cifrada';

/**
 * Lo que sigue a la foto de la visita, por HTTP: sincronizar, reintentar,
 * revocar y barrer (RN-09, RN-11, CA-09, CA-10, CA-11).
 *
 * F (15-L, ADR-032) · la foto y su consentimiento declarado nacen al generar
 * la autorización (`visitas-pg.test.ts` recorre ese camino contra la base).
 * Aquí se parte de una captura con casilla hecha por el caso de uso, y se
 * vigila además una ausencia: **ninguna ruta devuelve un vector biométrico**,
 * y ya no existe el enlace ni la página pública del titular.
 */
const TITULAR = '40000000-0000-4000-8000-000000000103';
const HORA = 3_600_000;
/** Terminal facial dada de alta en el `MockProvider` (ADR-03). */
const TERMINAL = '90000000-0000-4000-8000-000000000001';
const TERMINAL_DESCONOCIDA = '90000000-0000-4000-8000-0000000000ff';
const ADMIN = '00000000-0000-4000-8000-000000000010';

let app: INestApplication;
let firmante: Firmante;
let tokenAdmin: string;
let tokenTitular: string;

const ctxAdmin: ContextoTenant = {
  usuarioId: ADMIN,
  rol: 'administrador',
  copropiedadId: COP_A,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  tokenAdmin = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  // Revocar es del TITULAR (RN-10): su `usuario_id` es su propia persona.
  tokenTitular = await tokenDe(firmante, {
    rol: 'residente',
    copropiedadId: COP_A,
    usuarioId: TITULAR,
  });
  // El `MockProvider` rechaza un equipo que no conoce, que es exactamente lo
  // que hace un lector real. Se da de alta el que la suite usa como terminal
  // buena, y se deja otro sin dar de alta para probar el camino de fallo.
  // El simulado no tiene alta pública de equipos: se entra en su lista PRIVADA a
  // propósito, y la conversión lo deja escrito en vez de esconderlo.
  const simulado = app.get<MockProvider>(FACE_TEMPLATE_PROVIDER) as unknown as {
    readonly dispositivos: Set<string>;
  };
  simulado.dispositivos.add(TERMINAL);
});
afterAll(async () => {
  await app?.close();
});

const comoAdmin = (metodo: 'get' | 'post', ruta: string) =>
  request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${tokenAdmin}`);
const comoTitular = (metodo: 'get' | 'post', ruta: string) =>
  request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${tokenTitular}`);

const base = `/copropiedades/${COP_A}/biometria`;

/** La foto de una visita con la casilla marcada, como la deja «Generar autorización». */
const conCasilla = async (): Promise<{ plantillaId: string; consentimientoId: string }> => {
  const r = await app.get(CapturarRostro).ejecutar(ctxAdmin, {
    titularId: TITULAR,
    medidas: { rostrosDetectados: 1, nitidez: 0.85, iluminacion: 0.6, proporcionRostro: 0.4 },
    vector: new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1]),
    versionPolitica: 'casilla-v1',
    canal: 'presencial',
    suprimirEn: new Date(Date.now() + 8 * HORA),
    declaracion: { declaradoPor: ADMIN },
  });
  if (!r.ok || !r.valor.aceptada) throw new Error('la captura debía aceptarse');
  return r.valor;
};

describe('biometría · lo que sigue a la foto de la visita', () => {
  it('con la casilla, la plantilla ya se sincroniza (RN-09, CA-09)', async () => {
    const { plantillaId } = await conCasilla();
    await comoAdmin('post', `${base}/plantillas/${plantillaId}/sincronizacion`)
      .send({ dispositivoId: TERMINAL })
      .expect(201);
  });

  it('una terminal que no responde da 503, NO un 403 ni un 500', async () => {
    // Distinguirlo importa: 403 acusaría al visitante de no haber consentido, y
    // 500 diría «error interno» donde el hecho es «el lector no contestó».
    const { plantillaId } = await conCasilla();
    const r = await comoAdmin('post', `${base}/plantillas/${plantillaId}/sincronizacion`)
      .send({ dispositivoId: TERMINAL_DESCONOCIDA })
      .expect(503);
    expect(JSON.stringify(r.body)).toContain(TERMINAL_DESCONOCIDA);
  });

  it('el ADMINISTRADOR no revoca por el titular (RN-10)', async () => {
    const { consentimientoId } = await conCasilla();
    const r = await comoAdmin('post', `${base}/consentimientos/${consentimientoId}/revocacion`)
      .send({})
      .expect(403);
    expect(JSON.stringify(r.body)).toContain('titular');
  });

  it('revocar suprime: el sobre cifrado desaparece del almacén (CA-11)', async () => {
    const { consentimientoId, plantillaId } = await conCasilla();
    const almacen = app.get(AlmacenEnMemoria);
    const r = await comoTitular(
      'post',
      `${base}/consentimientos/${consentimientoId}/revocacion`,
    ).expect(201);
    expect(r.body.plantillasSuprimidas).toBeGreaterThanOrEqual(1);
    expect(await almacen.tomar(COP_A, plantillaId)).toBeNull();
    // Y lo suprimido no vuelve a ningún equipo.
    await comoAdmin('post', `${base}/plantillas/${plantillaId}/sincronizacion`)
      .send({ dispositivoId: TERMINAL })
      .expect(403);
  });

  it('el barrido responde con las dos cuentas separadas', async () => {
    const r = await comoAdmin('post', `${base}/barrido`).expect(201);
    expect(r.body).toHaveProperty('suprimidas');
    expect(r.body).toHaveProperty('retiradas');
    expect(r.body).toHaveProperty('retiradasFallidas');
  });
});

describe('biometría · lo que no existe', () => {
  const rutas = (): string[] => {
    const servidor = app.getHttpAdapter().getInstance() as {
      _router?: { stack: { route?: { path: string } }[] };
      router?: { stack: { route?: { path: string } }[] };
    };
    const pila = servidor._router?.stack ?? servidor.router?.stack ?? [];
    return pila.flatMap((c) => (c.route ? [c.route.path] : []));
  };

  it('NINGUNA ruta expone un vector, una plantilla en claro ni una llave', () => {
    expect(rutas().filter((r) => /vector|llave|plantillas\/[^/]+$/.test(r))).toEqual([]);
    // Y sí existen las del ciclo, para que la prueba no pase por estar vacía.
    expect(rutas().some((r) => r.includes('biometria/barrido'))).toBe(true);
  });

  it('F4 · el flujo anterior ya no existe: ni enlace, ni página pública, ni captura suelta', () => {
    // 15-X (ADR-039) · la única `…/rostro` que vuelve es la del propio residente
    // y la del menor a su cargo, con su cuenta: no es la captura suelta de una visita.
    const delResidente = /\/mi\/(menores\/:[^/]+\/)?rostro$/;
    const anteriores = rutas().filter(
      (r) =>
        /\/consentimiento\/|\/enlace$|\/respuesta$|biometria\/capturas|\/rostro$/.test(r) &&
        !delResidente.test(r),
    );
    expect(anteriores).toEqual([]);
  });
});

describe('biometría · aislamiento', () => {
  it('un administrador de otra copropiedad no sincroniza aquí', async () => {
    const { plantillaId } = await conCasilla();
    const ajeno = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    const r = await request(app.getHttpServer())
      .post(`${base}/plantillas/${plantillaId}/sincronizacion`)
      .set('Authorization', `Bearer ${ajeno}`)
      .send({ dispositivoId: TERMINAL });
    expect([403, 404]).toContain(r.status);
  });

  it('sin token no se llega a ninguna ruta de biometría', async () => {
    await request(app.getHttpServer()).post(`${base}/barrido`).expect(401);
  });
});
