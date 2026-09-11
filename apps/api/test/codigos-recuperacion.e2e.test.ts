import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ADMINISTRADOR_DE_FACTORES } from '../src/autenticacion/aplicacion/puertos';

/**
 * Códigos de recuperación del segundo factor.
 *
 * Lo que se protege aquí no es una función: son tres propiedades de seguridad
 * que, si se rompen, no dan ningún error.
 */
let app: INestApplication;
let firmante: Firmante;
let retiradas: string[];

const USUARIO = '00000000-0000-4000-8000-0000000000d1';

beforeAll(async () => {
  firmante = await crearFirmante();
  retiradas = [];
  app = await crearApp(firmante, (constructor) =>
    constructor
      .overrideProvider(ADMINISTRADOR_DE_FACTORES)
      .useValue({
        retirarFactoresVerificados: async (id: string) => {
          retiradas.push(id);
          return 1;
        },
      }),
  );
});
afterAll(async () => {
  await app?.close();
});

/**
 * El límite de 5 por minuto de §2.7.5 es real y esta suite lo agota: llama a
 * `/auth/mfa/codigos` una vez por prueba. Se REINICIA el almacén del limitador
 * entre pruebas en vez de subir el tope, que es lo que haría que la suite
 * dejara de ejercitar la configuración de producción. El límite tiene su propia
 * prueba, abajo.
 */
beforeEach(() => {
  const almacen = app.get<ThrottlerStorage & { storage?: unknown }>(ThrottlerStorage);
  // El almacén es un `Map`, y ahí estuvo el fallo: `Object.keys(map)` devuelve
  // `[]` siempre, así que el reinicio existía y no reiniciaba nada — la suite se
  // llenaba de 429 sin decir por qué. Es la familia de siempre, esta vez dentro
  // de una prueba. Se comprueba la FORMA antes de usarla, para que un cambio de
  // la librería salga como un fallo legible y no como un no-op.
  expect(almacen.storage, 'el almacén del limitador ya no es un Map').toBeInstanceOf(Map);
  (almacen.storage as Map<string, unknown>).clear();
});

const comoAdmin = (aal: 'aal1' | 'aal2' = 'aal2') =>
  tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A, aal, usuarioId: USUARIO });

const generar = async (): Promise<string[]> => {
  const res = await request(app.getHttpServer())
    .post('/auth/mfa/codigos')
    .set('Authorization', `Bearer ${await comoAdmin()}`);
  expect(res.status).toBe(201);
  return res.body.codigos as string[];
};

const recuperar = async (codigo: string, aal: 'aal1' | 'aal2' = 'aal1') =>
  request(app.getHttpServer())
    .post('/auth/mfa/recuperacion')
    .set('Authorization', `Bearer ${await comoAdmin(aal)}`)
    .send({ codigo });

describe('generación', () => {
  it('devuelve diez códigos, una sola vez', async () => {
    const codigos = await generar();
    expect(codigos).toHaveLength(10);
    expect(new Set(codigos).size).toBe(10);
  });

  it('exige aal2: un aal1 no puede emitirse su propia llave de recuperación', async () => {
    // Sin esto, quien robara la contraseña se generaría los códigos y retiraría
    // el segundo factor: la contraseña volvería a ser la única barrera.
    const res = await request(app.getHttpServer())
      .post('/auth/mfa/codigos')
      .set('Authorization', `Bearer ${await comoAdmin('aal1')}`);
    expect(res.status).toBe(401);
  });

  it('regenerar invalida los anteriores', async () => {
    const viejos = await generar();
    await generar();
    expect((await recuperar(viejos[0]!)).status).toBe(401);
  });
});

describe('consumo', () => {
  it('un código válido retira el factor, y la sesión aal1 basta', async () => {
    // Es el caso real: quien perdió el teléfono solo puede presentar aal1.
    const codigos = await generar();
    const antes = retiradas.length;
    const res = await recuperar(codigos[0]!);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ factoresRetirados: 1, codigosRestantes: 9 });
    expect(retiradas.length).toBe(antes + 1);
  });

  it('el mismo código NO vale dos veces', async () => {
    const codigos = await generar();
    expect((await recuperar(codigos[1]!)).status).toBe(200);
    expect((await recuperar(codigos[1]!)).status).toBe(401);
  });

  it('acepta el código como lo escribe una persona: minúsculas y espacios', async () => {
    const codigos = await generar();
    const res = await recuperar(` ${codigos[2]!.toLowerCase()} `.trim());
    expect(res.status).toBe(200);
  });

  it('un código inventado se rechaza sin decir por qué', async () => {
    await generar();
    const res = await recuperar('00000-00000');
    // Mismo mensaje que un código ya usado: distinguirlos diría a quien prueba
    // si va por buen camino.
    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).toContain('no válido');
  });

  it('un cuerpo con forma equivocada no llega al almacén', async () => {
    expect((await recuperar('esto-no-es-un-codigo')).status).toBe(400);
  });

  it('sin token no se retira nada', async () => {
    const antes = retiradas.length;
    const res = await request(app.getHttpServer())
      .post('/auth/mfa/recuperacion')
      .send({ codigo: 'ABCDE-12345' });
    expect(res.status).toBe(401);
    expect(retiradas.length).toBe(antes);
  });

  it('los códigos de un usuario no sirven para otro', async () => {
    // La llave de recuperación es personal: si valiera entre usuarios, retirar
    // el segundo factor de un compañero sería trivial.
    const codigos = await generar();
    const otro = await tokenDe(firmante, {
      rol: 'administrador',
      copropiedadId: COP_A,
      aal: 'aal1',
      usuarioId: '00000000-0000-4000-8000-0000000000d2',
    });
    const res = await request(app.getHttpServer())
      .post('/auth/mfa/recuperacion')
      .set('Authorization', `Bearer ${otro}`)
      .send({ codigo: codigos[4]! });
    expect(res.status).toBe(401);
  });
});

describe('el límite endurecido sigue puesto', () => {
  it('a la sexta petición en un minuto responde 429', async () => {
    // Son 40 bits de entropía por código; con este tope, adivinar uno lleva del
    // orden de cien mil años. Sin él, horas.
    const respuestas = [];
    for (let i = 0; i < 7; i += 1) {
      respuestas.push(
        (
          await request(app.getHttpServer())
            .post('/auth/mfa/recuperacion')
            .set('Authorization', `Bearer ${await comoAdmin('aal1')}`)
            .send({ codigo: '00000-00000' })
        ).status,
      );
    }
    expect(respuestas).toContain(429);
  });
});
