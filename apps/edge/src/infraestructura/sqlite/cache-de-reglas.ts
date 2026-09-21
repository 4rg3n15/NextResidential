/**
 * La caché de reglas sobre SQLite.
 *
 * Una fila por copropiedad, con la instantánea entera en JSON. No se normaliza
 * en tablas por lo mismo que explica `instantanea-de-reglas.ts`: lo que el
 * motor necesita es un contexto cerrado, no un modelo relacional que haya que
 * volver a unir —y al unir es donde el Edge empezaría a tener su propio
 * criterio (RN-16).
 */
import type { BaseSqlite } from './motor';
import type { InstantaneaDeReglas } from '../../aplicacion/instantanea-de-reglas';
import type { CacheDeReglas } from '../../aplicacion/puertos';

interface Fila {
  readonly version: number;
  readonly instantanea: string;
}

export class CacheDeReglasSqlite implements CacheDeReglas {
  constructor(private readonly db: BaseSqlite) {}

  vigente(copropiedadId: string): InstantaneaDeReglas | null {
    const fila = this.db
      .prepare('SELECT version, instantanea FROM reglas_en_cache WHERE copropiedad_id = ?')
      .get(copropiedadId) as Fila | undefined;
    if (fila === undefined) return null;
    try {
      return JSON.parse(fila.instantanea) as InstantaneaDeReglas;
    } catch {
      // Una caché ilegible NO es una caché vacía con datos dentro: se trata
      // como si no hubiera, y la contingencia decide. Devolver un objeto a
      // medias sería decidir accesos con reglas rotas.
      return null;
    }
  }

  /**
   * Guarda solo si la versión AVANZA.
   *
   * La versión es monótona por copropiedad (migración 0010). Aceptar una
   * anterior haría que el Edge retrocediera de reglas —por ejemplo, tras una
   * respuesta vieja que llega tarde— y volviera a permitir lo que la nube acaba
   * de prohibir, sin que ningún error lo delatara.
   */
  guardar(instantanea: InstantaneaDeReglas): boolean {
    const actual = this.db
      .prepare('SELECT version FROM reglas_en_cache WHERE copropiedad_id = ?')
      .get(instantanea.copropiedadId) as { version: number } | undefined;
    if (actual !== undefined && instantanea.version <= actual.version) return false;

    this.db
      .prepare(
        `INSERT INTO reglas_en_cache (copropiedad_id, version, generada_en, recibida_en, instantanea)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (copropiedad_id) DO UPDATE SET
           version = excluded.version,
           generada_en = excluded.generada_en,
           recibida_en = excluded.recibida_en,
           instantanea = excluded.instantanea`,
      )
      .run(
        instantanea.copropiedadId,
        instantanea.version,
        instantanea.generadaEn,
        new Date().toISOString(),
        JSON.stringify(instantanea),
      );
    return true;
  }
}
