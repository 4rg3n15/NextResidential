/**
 * La bandeja de salida sobre SQLite. RN-17, CA-22.
 *
 * Es la misma mecánica que la bandeja de la app del residente —encolar antes de
 * intentar, clave que no cambia, lo rendido no se borra— y eso es deliberado:
 * un solo concepto en los dos sitios significa una sola forma de razonar sobre
 * los duplicados, y las dos pruebas se leen igual.
 *
 * La diferencia está en que aquí la durabilidad es el punto. El teléfono puede
 * perder una visita encolada y el residente la vuelve a crear; el Edge no puede
 * perder un acceso, porque RN-02 dice que ningún acceso existe sin evento y
 * nadie va a volver a pasar por la talanquera para regenerarlo.
 */
import type { BaseSqlite } from './motor';
import type { BandejaDeSalida, EnvioPendiente } from '../../aplicacion/puertos';

interface FilaPendiente {
  readonly clave_idempotencia: string;
  readonly secuencia: number;
  readonly cuerpo: string;
  readonly encolado_en: string;
  readonly intentos: number;
  readonly proximo_intento_en: string | null;
  readonly ultimo_error: string | null;
}

const aEnvio = (f: FilaPendiente): EnvioPendiente => ({
  claveIdempotencia: f.clave_idempotencia,
  secuencia: f.secuencia,
  cuerpo: f.cuerpo,
  encoladoEn: f.encolado_en,
  intentos: f.intentos,
  proximoIntentoEn: f.proximo_intento_en,
  ultimoError: f.ultimo_error,
});

export class BandejaSqlite implements BandejaDeSalida {
  constructor(private readonly db: BaseSqlite) {}

  /**
   * `INSERT OR IGNORE` sobre la clave primaria: encolar dos veces el mismo
   * hecho deja UNA fila, y lo garantiza la base. Un `SELECT` previo seguido de
   * un `INSERT` tendría una carrera entre los dos, que es exactamente el
   * defecto que ADR-04 prohíbe en la nube y que aquí sería igual de real.
   */
  encolar(clave: string, cuerpo: string, encoladoEn: Date): void {
    const ya = this.db
      .prepare('SELECT 1 FROM bandeja_de_salida WHERE clave_idempotencia = ?')
      .get(clave);
    if (ya !== undefined) return;
    // Tampoco se reencola lo ya confirmado: la nube lo tiene y reenviarlo solo
    // gastaría la ventana de reconciliación en duplicados.
    const confirmado = this.db
      .prepare('SELECT 1 FROM confirmados WHERE clave_idempotencia = ?')
      .get(clave);
    if (confirmado !== undefined) return;

    const secuencia = this.siguienteSecuencia();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO bandeja_de_salida
           (clave_idempotencia, secuencia, cuerpo, encolado_en)
         VALUES (?, ?, ?, ?)`,
      )
      .run(clave, secuencia, cuerpo, encoladoEn.toISOString());
  }

  private siguienteSecuencia(): number {
    const fila = this.db.prepare('SELECT siguiente FROM contador WHERE id = 1').get() as
      | { siguiente: number }
      | undefined;
    const siguiente = fila?.siguiente ?? 1;
    this.db.prepare('UPDATE contador SET siguiente = ? WHERE id = 1').run(siguiente + 1);
    return siguiente;
  }

  /** En orden de llegada, y solo los que ya toca reintentar. */
  pendientes(ahora: Date, limite: number): readonly EnvioPendiente[] {
    const filas = this.db
      .prepare(
        `SELECT * FROM bandeja_de_salida
          WHERE proximo_intento_en IS NULL OR proximo_intento_en <= ?
          ORDER BY secuencia ASC
          LIMIT ?`,
      )
      .all(ahora.toISOString(), limite) as FilaPendiente[];
    return filas.map(aEnvio);
  }

  confirmar(clave: string): void {
    const fila = this.db
      .prepare('SELECT secuencia FROM bandeja_de_salida WHERE clave_idempotencia = ?')
      .get(clave) as { secuencia: number } | undefined;
    if (fila === undefined) return;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO confirmados (clave_idempotencia, secuencia, confirmado_en)
         VALUES (?, ?, ?)`,
      )
      .run(clave, fila.secuencia, new Date().toISOString());
    this.db.prepare('DELETE FROM bandeja_de_salida WHERE clave_idempotencia = ?').run(clave);
  }

  fallo(clave: string, error: string, proximoIntentoEn: Date): void {
    this.db
      .prepare(
        `UPDATE bandeja_de_salida
            SET intentos = intentos + 1,
                ultimo_error = ?,
                proximo_intento_en = ?
          WHERE clave_idempotencia = ?`,
      )
      .run(error, proximoIntentoEn.toISOString(), clave);
  }

  cuantosPendientes(): number {
    const fila = this.db.prepare('SELECT COUNT(*) AS n FROM bandeja_de_salida').get() as {
      n: number;
    };
    return fila.n;
  }

  /**
   * CA-22 · desde dónde reanudar. Es la secuencia más alta que la nube confirmó,
   * y se guarda en una tabla propia porque la bandeja se vacía: derivarla de la
   * bandeja daría «ninguna» justo cuando todo salió bien.
   */
  ultimaSecuenciaConfirmada(): number {
    const fila = this.db
      .prepare('SELECT COALESCE(MAX(secuencia), 0) AS s FROM confirmados')
      .get() as { s: number };
    return fila.s;
  }
}
