import { describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { SaludController } from './salud.controller';
import type { ProveedorDeJwks } from '../autenticacion';
import type { SondaDePostgres } from '../arranque/sonda-postgres';
import type { Configuracion } from '../configuracion/esquema';

/**
 * `/ready` · lo que publica y cuándo se pone en rojo.
 *
 * **Por qué esta suite existe.** Se afirmó que `/ready` sondeaba el JWTS de
 * verdad y devolvía 503 si era inalcanzable. Era cierto —se comprobó contra un
 * servidor real que devuelve 404, y responde 503—, pero nadie la había
 * ejercido, y a su lado convivían dos huecos:
 *
 *  · un JWKS que responde `200 {"keys":[]}` daba `ok`, y con él no se puede
 *    verificar ni un token;
 *  · `postgres` era una CADENA FIJA, `'no-conectado-etapa-04'`, y `/ready`
 *    respondía 200 sin haber tocado la base.
 *
 * Una sonda que nadie ha visto ponerse en rojo no está demostrada.
 */
const reloj = { ahora: () => new Date('2026-09-10T12:00:00Z') };
const config = { origenesPermitidos: ['https://consola.ejemplo.co'] } as Configuracion;

const controlador = (jwks: unknown, postgres: unknown) =>
  new SaludController(reloj, config, jwks as ProveedorDeJwks, postgres as SondaDePostgres);

const jwksQue = (estado: unknown) => ({ sondear: async () => estado });
const postgresQue = (estado: string) => ({
  comprobar: async () => ({ estado, detalle: 'de prueba' }),
});

describe('/ready', () => {
  it('con todo en pie responde listo', async () => {
    const res = await controlador(jwksQue({ estado: 'ok', claves: 2 }), postgresQue('ok')).listo();
    expect(res).toEqual({
      estado: 'listo',
      dependencias: { configuracion: 'ok', jwks: 'ok', postgres: 'ok' },
    });
  });

  it('un JWKS inalcanzable lo pone en rojo, y lo NOMBRA', async () => {
    const c = controlador(jwksQue({ estado: 'inalcanzable', detalle: 'x' }), postgresQue('ok'));
    await expect(c.listo()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(c.listo()).rejects.toMatchObject({
      response: { dependencias: { jwks: 'inalcanzable' } },
    });
  });

  it('un JWKS que responde 200 SIN CLAVES también, y con otro nombre', async () => {
    // El caso que la sonda anterior daba por bueno. El nombre importa: uno se
    // arregla en el entorno y el otro en el panel de Supabase.
    const c = controlador(jwksQue({ estado: 'sin-claves' }), postgresQue('ok'));
    await expect(c.listo()).rejects.toMatchObject({
      response: { dependencias: { jwks: 'sin-claves' } },
    });
  });

  it('la base caída lo pone en rojo: ya no es una cadena fija', async () => {
    const c = controlador(jwksQue({ estado: 'ok', claves: 1 }), postgresQue('roto'));
    await expect(c.listo()).rejects.toMatchObject({
      response: { dependencias: { postgres: 'no-disponible' } },
    });
  });

  it('el detalle del fallo NO viaja en la respuesta: /ready es pública', async () => {
    const c = controlador(
      jwksQue({ estado: 'inalcanzable', detalle: 'JOSEError: https://ref-secreto.supabase.co' }),
      postgresQue('ok'),
    );
    await expect(c.listo()).rejects.not.toMatchObject({
      response: { dependencias: { jwks: expect.stringContaining('supabase.co') } },
    });
  });

  it('/health sigue diciendo solo que el proceso vive', async () => {
    // Confundir vivo con listo provoca reinicios en cadena cuando una
    // dependencia externa parpadea: /health no debe mirar ninguna.
    const c = controlador(jwksQue({ estado: 'inalcanzable', detalle: 'x' }), postgresQue('roto'));
    expect(c.salud()).toEqual({ estado: 'vivo', momento: '2026-09-10T12:00:00.000Z' });
  });
});
