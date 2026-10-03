import type { BaseSqlite } from './motor';
import type { EnvioPendiente } from '../../aplicacion/puertos';
import { conConstancia } from '../../aplicacion/cuarentena';
import type { Cuarentena, EnvioEnCuarentena } from '../../aplicacion/cuarentena';

/**
 * 15-R · E6 · la cuarentena sobre el MISMO SQLite que la bandeja. Pasar de la
 * bandeja a aquí es UNA transacción: un corte de luz a mitad no puede dejar el
 * envío en los dos sitios ni en ninguno. La tabla se crea aquí (idempotente)
 * para no tocar el esquema de la bandeja que ya está desplegado.
 */
const TABLA = `
CREATE TABLE IF NOT EXISTS cuarentena (
  clave_idempotencia TEXT PRIMARY KEY,
  secuencia          INTEGER NOT NULL,
  cuerpo             TEXT    NOT NULL,
  encolado_en        TEXT    NOT NULL,
  intentos           INTEGER NOT NULL,
  motivo             TEXT    NOT NULL,
  apartado_en        TEXT    NOT NULL
);`;

interface Fila {
  readonly clave_idempotencia: string;
  readonly secuencia: number;
  readonly cuerpo: string;
  readonly encolado_en: string;
  readonly intentos: number;
  readonly motivo: string;
  readonly apartado_en: string;
}

export class CuarentenaSqlite implements Cuarentena {
  constructor(private readonly db: BaseSqlite) {
    db.exec(TABLA);
  }

  apartar(envio: EnvioPendiente, motivo: string, en: Date): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO cuarentena
             (clave_idempotencia, secuencia, cuerpo, encolado_en, intentos, motivo, apartado_en)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          envio.claveIdempotencia,
          envio.secuencia,
          envio.cuerpo,
          envio.encoladoEn,
          envio.intentos + 1,
          motivo.slice(0, 500),
          en.toISOString(),
        );
      this.db
        .prepare('DELETE FROM bandeja_de_salida WHERE clave_idempotencia = ?')
        .run(envio.claveIdempotencia);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  listar(): readonly EnvioEnCuarentena[] {
    const filas = this.db
      .prepare('SELECT * FROM cuarentena ORDER BY secuencia ASC')
      .all() as unknown as Fila[];
    return filas.map((f) => ({
      claveIdempotencia: f.clave_idempotencia,
      secuencia: f.secuencia,
      cuerpo: f.cuerpo,
      encoladoEn: f.encolado_en,
      intentos: f.intentos,
      motivo: f.motivo,
      apartadoEn: f.apartado_en,
    }));
  }
}

/** La de sitio: sobre este SQLite y con constancia en el registro del Edge. */
export const cuarentenaConConstancia = (
  db: BaseSqlite,
  registrar: Parameters<typeof conConstancia>[1],
): Cuarentena => conConstancia(new CuarentenaSqlite(db), registrar);
