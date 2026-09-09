import { afterAll, beforeAll, describe, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';

/** Identificador de relleno: el pipe actúa antes de que se busque la alerta. */
const ALERTA = '00000000-0000-4000-8000-0000000000aa';

/**
 * §2.7.3 · El `ValidationPipe` está ACTIVO, comprobado por ejecución.
 *
 * Esta prueba existe por un defecto real encontrado el 2026-09-07: los
 * controladores importaban sus DTOs con `import type`, lo que borra la clase al
 * compilar y deja `design:paramtypes` en `Object`. El pipe entonces no valida
 * nada y devuelve el cuerpo tal cual — sin error, sin aviso, con la suite en
 * verde. Un POST con un tipo equivocado y un campo no declarado llegaba al
 * manejador.
 *
 * Es la tercera vez que un detalle del compilado produce un verde que no
 * significa lo que parece (metadata de decoradores en la 03, `dist` viejo en la
 * 04). Por eso no se comprueba leyendo el import: se comprueba mandando un
 * cuerpo inválido y exigiendo 400.
 */
describe('validación de DTOs activa en toda superficie con @Body()', () => {
  let app: INestApplication;
  let admin: string;

  beforeAll(async () => {
    const firmante = await crearFirmante();
    app = await crearApp(firmante);
    admin = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  });
  afterAll(async () => {
    await app.close();
  });

  const post = (ruta: string, cuerpo: unknown) =>
    request(app.getHttpServer()).post(ruta).set('authorization', `Bearer ${admin}`).send(cuerpo);

  /**
   * Antes esta comprobación iba contra `/auth/mfa/verificacion`. Esa ruta se
   * retiró en la ETAPA 09-A (ADR-008), así que la superficie de `eventos`
   * ocupa su lugar: lo que importa no es la ruta concreta sino que el pipe
   * esté activo en MÓDULOS DISTINTOS, porque el defecto que originó esta
   * prueba se introduce fichero a fichero.
   */
  it('alertas · tipo equivocado y campo no declarado → 400', async () => {
    const ruta = `/copropiedades/${COP_A}/alertas/${ALERTA}/resolucion`;
    await post(ruta, { notas: 12345 }).expect(400);
    await post(ruta, { notas: 'motivo suficiente', colado: 'x' }).expect(400);
  });

  it('padrón · vehículo con identificadores no válidos → 400', async () => {
    await post('/padron/vehiculos', { viviendaId: 'no-es-uuid', placa: 'ABC123' }).expect(400);
    await post('/padron/vehiculos', {
      viviendaId: '20000000-0000-4000-8000-000000000001',
      placa: 'ABC123',
      colado: 'x',
    }).expect(400);
  });
});
