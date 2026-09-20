import { describe, expect, it } from 'vitest';
import { DatabaseSync } from './motor';
import { ESQUEMA } from './esquema';
import { BandejaSqlite } from './bandeja-sqlite';
import { CacheDeReglasSqlite } from './cache-de-reglas';
import type { InstantaneaDeReglas } from '../../aplicacion/instantanea-de-reglas';

const COP = '11111111-1111-4111-8111-111111111111';
const AHORA = new Date('2026-09-21T10:00:00.000Z');

const base = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(ESQUEMA);
  return db;
};

const instantanea = (version: number): InstantaneaDeReglas => ({
  copropiedadId: COP,
  version,
  generadaEn: AHORA.toISOString(),
  autorizaciones: [],
  personasEnListaNegra: [],
  placasEnListaNegra: [],
  viviendasActivas: [],
  vehiculos: [],
  zonas: [],
  personasConConsentimiento: [],
  umbralDeConfianza: 0.7,
});

describe('caché de reglas · la versión solo AVANZA', () => {
  it('guarda la primera y la devuelve', () => {
    const cache = new CacheDeReglasSqlite(base());
    expect(cache.guardar(instantanea(3))).toBe(true);
    expect(cache.vigente(COP)?.version).toBe(3);
  });

  it('RECHAZA una versión anterior o igual', () => {
    // Una respuesta vieja que llega tarde haría retroceder las reglas y volver
    // a permitir lo que la nube acaba de prohibir, sin que ningún error lo
    // delatara. La versión es monótona por copropiedad (migración 0010).
    const cache = new CacheDeReglasSqlite(base());
    cache.guardar(instantanea(5));
    expect(cache.guardar(instantanea(4))).toBe(false);
    expect(cache.guardar(instantanea(5))).toBe(false);
    expect(cache.vigente(COP)?.version).toBe(5);
    expect(cache.guardar(instantanea(6))).toBe(true);
  });

  it('una copropiedad sin caché devuelve null, no un objeto vacío', () => {
    expect(new CacheDeReglasSqlite(base()).vigente(COP)).toBeNull();
  });

  it('una fila con JSON corrupto se trata como ausente', () => {
    // Un corte de luz a mitad de la escritura. Devolver un objeto a medias
    // sería decidir accesos con reglas rotas.
    const db = base();
    db.prepare(
      `INSERT INTO reglas_en_cache (copropiedad_id, version, generada_en, recibida_en, instantanea)
       VALUES (?, 1, ?, ?, ?)`,
    ).run(COP, AHORA.toISOString(), AHORA.toISOString(), '{"truncado":');
    expect(new CacheDeReglasSqlite(db).vigente(COP)).toBeNull();
  });
});

describe('bandeja SQLite · RN-17', () => {
  it('la misma clave dos veces deja UNA fila, y lo impide la base', () => {
    const bandeja = new BandejaSqlite(base());
    bandeja.encolar('k1', '{"a":1}', AHORA);
    bandeja.encolar('k1', '{"a":2}', AHORA);
    expect(bandeja.cuantosPendientes()).toBe(1);
    // Y se queda el PRIMERO: el segundo es un reintento del mismo hecho, no un
    // hecho nuevo que deba pisar al anterior.
    expect(bandeja.pendientes(AHORA, 10)[0]?.cuerpo).toBe('{"a":1}');
  });

  it('devuelve en ORDEN de llegada', () => {
    const bandeja = new BandejaSqlite(base());
    for (const k of ['c', 'a', 'b']) bandeja.encolar(k, '{}', AHORA);
    expect(bandeja.pendientes(AHORA, 10).map((p) => p.claveIdempotencia)).toEqual(['c', 'a', 'b']);
  });

  it('LA SECUENCIA NO SE REINICIA al vaciarse la bandeja', () => {
    // Derivarla de MAX(secuencia) de la bandeja daría 1 otra vez justo cuando
    // todo salió bien, y el orden de la siguiente reconciliación dejaría de ser
    // el de llegada.
    const bandeja = new BandejaSqlite(base());
    bandeja.encolar('k1', '{}', AHORA);
    bandeja.confirmar('k1');
    expect(bandeja.cuantosPendientes()).toBe(0);
    bandeja.encolar('k2', '{}', AHORA);
    expect(bandeja.pendientes(AHORA, 10)[0]?.secuencia).toBe(2);
  });

  it('no reencola lo YA CONFIRMADO', () => {
    const bandeja = new BandejaSqlite(base());
    bandeja.encolar('k1', '{}', AHORA);
    bandeja.confirmar('k1');
    bandeja.encolar('k1', '{}', AHORA);
    expect(bandeja.cuantosPendientes()).toBe(0);
    expect(bandeja.ultimaSecuenciaConfirmada()).toBe(1);
  });

  it('un envío con retroceso pendiente NO sale hasta que toca', () => {
    const bandeja = new BandejaSqlite(base());
    bandeja.encolar('k1', '{}', AHORA);
    bandeja.fallo('k1', 'sin conexión', new Date(AHORA.getTime() + 60_000));

    expect(bandeja.pendientes(AHORA, 10)).toHaveLength(0);
    expect(bandeja.pendientes(new Date(AHORA.getTime() + 61_000), 10)).toHaveLength(1);
    expect(bandeja.pendientes(new Date(AHORA.getTime() + 61_000), 10)[0]?.intentos).toBe(1);
  });

  it('confirmar algo que no está no revienta', () => {
    const bandeja = new BandejaSqlite(base());
    expect(() => bandeja.confirmar('inexistente')).not.toThrow();
    expect(bandeja.ultimaSecuenciaConfirmada()).toBe(0);
  });

  it('LO QUE SE ENCOLA SOBREVIVE AL REINICIO', () => {
    // Es la diferencia con la bandeja del teléfono: el residente puede volver a
    // crear una visita perdida; nadie va a volver a pasar por la talanquera.
    const db = base();
    new BandejaSqlite(db).encolar('k1', '{"acceso":1}', AHORA);
    // Otro objeto sobre la MISMA base: es lo que ve el proceso tras reiniciar.
    const trasReinicio = new BandejaSqlite(db);
    expect(trasReinicio.cuantosPendientes()).toBe(1);
    expect(trasReinicio.pendientes(AHORA, 10)[0]?.cuerpo).toBe('{"acceso":1}');
  });
});
