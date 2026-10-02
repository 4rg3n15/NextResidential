import { describe, expect, it } from 'vitest';
import { DatabaseSync } from '../infraestructura/sqlite/motor';
import { ESQUEMA } from '../infraestructura/sqlite/esquema';
import { CacheDeReglasSqlite } from '../infraestructura/sqlite/cache-de-reglas';
import { FeDeVidaSqlite } from '../infraestructura/sqlite/fe-de-vida';
import { instantaneaDePrueba, COP } from '../../test/banco-de-sitio';
import { DescargaDeReglas, hashDelContenido } from './descarga-de-reglas';
import type { InstantaneaDeReglas, ReglasVigentes } from './instantanea-de-reglas';
import type { ClienteDeNube } from './puertos';

/**
 * 15-Q · Q2 · la descarga de reglas, con la caché SQLite de verdad: la versión
 * sólo avanza, lo inservible no se guarda, y «sin cambios» renueva la fe de vida.
 */
const montar = (respuesta: () => Promise<InstantaneaDeReglas | ReglasVigentes | null>) => {
  const db = new DatabaseSync(':memory:');
  db.exec(ESQUEMA);
  const cache = new CacheDeReglasSqlite(db);
  const nube: ClienteDeNube = { reconciliar: async () => [], descargarReglas: respuesta };
  const descarga = new DescargaDeReglas(nube, cache, new FeDeVidaSqlite(db), {
    copropiedadId: COP,
    cadaSegundos: 300,
  });
  return { cache, descarga, db };
};

describe('DescargaDeReglas (15-Q, Q2)', () => {
  it('toca al empezar, al recuperar el WAN y cada N segundos; no antes', async () => {
    const { descarga } = montar(async () => null);
    const t0 = new Date('2026-10-02T12:00:00Z');
    expect(descarga.toca(t0, false)).toBe(true);
    await descarga.ejecutar(t0);
    expect(descarga.toca(new Date(+t0 + 299_000), false)).toBe(false);
    expect(descarga.toca(new Date(+t0 + 1_000), true)).toBe(true);
    expect(descarga.toca(new Date(+t0 + 300_000), false)).toBe(true);
  });

  it('guarda una nueva con su hash; «sin cambios» renueva la fe de vida sin tocar el contenido', async () => {
    const primera = instantaneaDePrueba(1, '2026-10-02T12:00:00.000Z');
    let respuesta: InstantaneaDeReglas | ReglasVigentes = primera;
    const { descarga, cache } = montar(async () => respuesta);
    expect(await descarga.ejecutar(new Date())).toEqual({ estado: 'nueva', version: 1 });
    respuesta = { sinCambios: true, version: 1, generadaEn: '2026-10-02T13:00:00.000Z' };
    expect(await descarga.ejecutar(new Date())).toEqual({ estado: 'vigente', version: 1 });
    const vigente = cache.vigente(COP);
    expect(vigente?.generadaEn).toBe('2026-10-02T13:00:00.000Z');
    expect(vigente?.placasEnListaNegra).toEqual(primera.placasEnListaNegra);
    // Una fe de vida VIEJA que llega tarde no rejuvenece nada.
    respuesta = { sinCambios: true, version: 1, generadaEn: '2026-10-02T12:30:00.000Z' };
    await descarga.ejecutar(new Date());
    expect(cache.vigente(COP)?.generadaEn).toBe('2026-10-02T13:00:00.000Z');
  });

  it('la versión sólo avanza: una igual o menor se rechaza y se dice', async () => {
    let version = 2;
    const { descarga } = montar(async () => instantaneaDePrueba(version));
    await descarga.ejecutar(new Date());
    version = 1;
    expect(await descarga.ejecutar(new Date())).toMatchObject({
      estado: 'rechazada',
      detalle: expect.stringContaining('la versión sólo avanza'),
    });
  });

  it('una instantánea incompleta o con un hash ajeno no se guarda', async () => {
    const rota = { ...instantaneaDePrueba(1), zonas: undefined } as unknown as InstantaneaDeReglas;
    const { descarga, cache } = montar(async () => rota);
    expect(await descarga.ejecutar(new Date())).toMatchObject({ estado: 'rechazada' });
    const falsa = { ...instantaneaDePrueba(1), hash: 'f'.repeat(64) };
    const otra = montar(async () => falsa);
    expect(await otra.descarga.ejecutar(new Date())).toMatchObject({
      estado: 'rechazada',
      detalle: expect.stringContaining('hash'),
    });
    expect(cache.vigente(COP)).toBeNull();
  });

  it('sin respuesta útil o con un fallo de red, se informa y la caché sigue igual', async () => {
    expect(await montar(async () => null).descarga.ejecutar(new Date())).toMatchObject({
      estado: 'sin_respuesta',
      version: null,
    });
    const caida = montar(async () => {
      throw new Error('la nube respondió 409');
    });
    expect(await caida.descarga.ejecutar(new Date())).toMatchObject({
      estado: 'error',
      detalle: 'la nube respondió 409',
    });
  });

  it('el hash del contenido no depende de la cabecera (versión, instante, hash)', () => {
    const a = instantaneaDePrueba(1, '2026-01-01T00:00:00.000Z');
    const b = { ...a, version: 7, generadaEn: '2027-01-01T00:00:00.000Z', hash: 'x' };
    expect(hashDelContenido(a)).toBe(hashDelContenido(b));
  });

  it('una fecha de fe de vida ilegible no toca la caché', () => {
    const { db } = montar(async () => null);
    expect(new FeDeVidaSqlite(db).revalidar(COP, 1, 'no-es-fecha')).toBe(false);
  });
});
