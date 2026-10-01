import { describe, expect, it } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { SaludController, VENTANA_DE_AVISO_MS } from './salud.controller';
import type { ProveedorDeJwks } from '../autenticacion';
import type { SondaDePostgres } from '../arranque/sonda-postgres';
import type { Configuracion } from '../configuracion/esquema';
import type { EstadoDelPlanificador, Planificador } from '../planificacion';

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

const enMarcha = { estado: (): EstadoDelPlanificador => ({ fase: 'en-marcha' }) };

const controlador = (jwks: unknown, postgres: unknown, planificador: unknown = enMarcha) =>
  new SaludController(
    reloj,
    config,
    jwks as ProveedorDeJwks,
    postgres as SondaDePostgres,
    planificador as Planificador,
  );

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

describe('15-O · /ready dice por qué, y lo que no la saca del balanceador', () => {
  const jwksOk = jwksQue({ estado: 'ok', claves: 1 });
  const baseQue = (resultado: Record<string, unknown>) => ({ comprobar: async () => resultado });

  it('el pool agotado es 503 `agotado`, con el motivo y sin el texto de pg', async () => {
    const c = controlador(
      jwksOk,
      baseQue({
        estado: 'roto',
        clase: 'agotado',
        detalle: 'las 10 conexiones del pool están ocupadas',
      }),
    );
    await expect(c.listo()).rejects.toMatchObject({
      response: {
        dependencias: { postgres: 'agotado' },
        motivos: { postgres: 'pool de la API agotado: las 10 conexiones del pool están ocupadas' },
      },
    });
  });

  it('la base que no contesta es 503 «base de datos no disponible»', async () => {
    const c = controlador(
      jwksOk,
      baseQue({ estado: 'roto', clase: 'no-disponible', detalle: 'la base cortó la conexión' }),
    );
    await expect(c.listo()).rejects.toMatchObject({
      response: { motivos: { postgres: 'base de datos no disponible: la base cortó la conexión' } },
    });
  });

  it('un corte YA REPUESTO es un aviso, no un 503', async () => {
    const hace = new Date(reloj.ahora().getTime() - 42_000);
    const c = controlador(
      jwksOk,
      baseQue({
        estado: 'ok',
        detalle: 'SELECT 1',
        ultimoCorte: { momento: hace, motivo: 'x', categoria: 'la base cortó la conexión' },
      }),
    );
    expect((await c.listo()).avisos).toEqual({
      postgres: 'la base cortó la conexión hace 42 s; el pool la descartó y ya responde',
    });
  });

  it('un corte de hace más de cinco minutos ya no se avisa', async () => {
    const hace = new Date(reloj.ahora().getTime() - VENTANA_DE_AVISO_MS);
    const c = controlador(
      jwksOk,
      baseQue({
        estado: 'ok',
        detalle: 'SELECT 1',
        ultimoCorte: { momento: hace, motivo: 'x', categoria: 'la base cortó la conexión' },
      }),
    );
    expect((await c.listo()).avisos).toBeUndefined();
  });

  it('el planificador que reintenta sale como aviso con su motivo; la API sigue lista', async () => {
    const c = controlador(jwksOk, postgresQue('ok'), {
      estado: () => ({ fase: 'reintentando', motivo: 'no se pudo abrir una conexión; intento 2' }),
    });
    const r = await c.listo();
    expect(r.estado).toBe('listo');
    expect(r.avisos).toEqual({
      planificador: 'reintentando: no se pudo abrir una conexión; intento 2',
    });
  });

  it('el planificador inerte, o parado, también se dice', async () => {
    const inerte = controlador(jwksOk, postgresQue('ok'), {
      estado: () => ({ fase: 'inerte', motivo: 'PLANIFICADOR_HABILITADO=false' }),
    });
    expect((await inerte.listo()).avisos).toEqual({
      planificador: 'inerte: PLANIFICADOR_HABILITADO=false',
    });
    const parado = controlador(jwksOk, postgresQue('ok'), { estado: () => ({ fase: 'detenido' }) });
    expect((await parado.listo()).avisos).toEqual({ planificador: 'detenido' });
  });

  it('en marcha con un error reciente de pg-boss: se avisa cuándo y de qué clase', async () => {
    const c = controlador(jwksOk, postgresQue('ok'), {
      estado: () => ({
        fase: 'en-marcha',
        ultimoError: {
          momento: new Date(reloj.ahora().getTime() - 3_000),
          categoria: 'la base cortó la conexión',
        },
      }),
    });
    expect((await c.listo()).avisos).toEqual({
      planificador: 'en marcha; último error hace 3 s: la base cortó la conexión',
    });
  });
});
