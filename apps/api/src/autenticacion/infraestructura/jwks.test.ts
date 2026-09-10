import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProveedorDeJwks } from './jwks';
import { VerificadorDeJwt } from './verificador-jwt';
import { RechazoDeAutenticacion } from '../dominio/errores';

/**
 * D-60 · el JWKS que no responde, y el que responde vacío.
 *
 * Estas pruebas usan un servidor HTTP REAL y no un doble de `jose`. Es
 * deliberado: el defecto que motivó la corrección sobrevivió a nueve etapas
 * precisamente porque todo lo que tocaba el JWKS era un doble, y el doble
 * respondía donde la plataforma real no responde (DT-12). Un doble aquí volvería
 * a demostrar únicamente que el doble funciona.
 */
describe('ProveedorDeJwks contra un servidor real', () => {
  let servidor: Server;
  let base: string;

  beforeAll(async () => {
    servidor = createServer((peticion, respuesta) => {
      if (peticion.url === '/vacio') {
        respuesta.writeHead(200, { 'content-type': 'application/json' });
        respuesta.end(JSON.stringify({ keys: [] }));
        return;
      }
      if (peticion.url === '/con-clave') {
        respuesta.writeHead(200, { 'content-type': 'application/json' });
        respuesta.end(
          JSON.stringify({
            keys: [{ kty: 'RSA', kid: 'k1', use: 'sig', alg: 'RS256', n: 'sQ', e: 'AQAB' }],
          }),
        );
        return;
      }
      // Exactamente lo que devuelve Supabase en /auth/v1/jwks.
      respuesta.writeHead(404, { 'content-type': 'text/plain' });
      respuesta.end('404 page not found');
    });
    await new Promise<void>((listo) => servidor.listen(0, listo));
    const direccion = servidor.address();
    base = `http://127.0.0.1:${typeof direccion === 'object' && direccion ? direccion.port : 0}`;
  });

  afterAll(() => {
    servidor.close();
  });

  const proveedor = (ruta: string) =>
    new ProveedorDeJwks({ url: `${base}${ruta}`, ttlSegundos: 600, refrescoMinimoSegundos: 60 });

  it('un 404 se sonda como INALCANZABLE, no como disponible', async () => {
    expect(await proveedor('/auth/v1/jwks').sondear()).toMatchObject({ estado: 'inalcanzable' });
  });

  it('un 200 con {"keys":[]} NO es un JWKS utilizable', async () => {
    // El caso que la sonda anterior daba por bueno: hay endpoint, hay JSON
    // válido, y no se puede verificar ni un token. Supabase responde así cuando
    // el proyecto no tiene llaves asimétricas habilitadas.
    expect(await proveedor('/vacio').sondear()).toEqual({ estado: 'sin-claves' });
  });

  it('un documento con al menos una clave sí lo es', async () => {
    expect(await proveedor('/con-clave').sondear()).toEqual({ estado: 'ok', claves: 1 });
  });

  it('con el JWKS en 404, el motivo es JWKS_NO_DISPONIBLE y NO FIRMA_INVALIDA', async () => {
    /**
     * La regresión concreta que costó tres rondas de trabajo. `jose` lanza un
     * `JOSEError` genérico —no una clase propia del JWKS— cuando la descarga no
     * da 200, así que clasificar por el tipo de la excepción hacía que un
     * endpoint caído se registrara como una firma rota.
     */
    const verificador = new VerificadorDeJwt(proveedor('/auth/v1/jwks'), {
      emisor: 'https://emisor.invalid',
      audiencia: 'authenticated',
      toleranciaRelojSegundos: 5,
    });
    const token = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImsxIn0.eyJzdWIiOiIxIn0.firma';

    await expect(verificador.verificar(token)).rejects.toMatchObject({
      motivo: 'JWKS_NO_DISPONIBLE',
    });
    await expect(verificador.verificar(token)).rejects.toBeInstanceOf(RechazoDeAutenticacion);
  });
});
