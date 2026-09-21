/**
 * El esquema local del Edge. SQLite, y `node:sqlite` en vez de un módulo nativo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ `node:sqlite` Y NO `better-sqlite3` · ADR-017
 *
 * `better-sqlite3` es mejor biblioteca y se descartó por dónde corre esto: un
 * equipo en la portería de una copropiedad. Un módulo nativo obliga a compilar
 * con `node-gyp` en el sitio, o a publicar binarios por arquitectura —x64 y
 * arm64, que es lo que lleva un mini-PC barato— y a rehacerlos en cada
 * actualización de Node. Cada una de esas es una forma de que una actualización
 * remota deje un gateway sin arrancar, y un gateway que no arranca es una
 * puerta que no abre.
 *
 * `node:sqlite` viene con el runtime. Está marcado experimental y por eso vive
 * detrás de un puerto: sustituirlo es reescribir estos dos adaptadores y nada
 * más. La contingencia está escrita en el ADR.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE EL ESQUEMA GARANTIZA POR ESTRUCTURA
 *
 * · `clave_idempotencia` es CLAVE PRIMARIA de la bandeja. Encolar dos veces el
 *   mismo hecho no crea dos filas; lo impide la base y no un `if` (ADR-04
 *   aplicado al Edge).
 * · `secuencia` es `AUTOINCREMENT`: el orden de llegada es un hecho persistido,
 *   no el orden en que una consulta decida devolver las filas.
 * · `version` de la caché es monótona por copropiedad, con un `CHECK` que
 *   impide retroceder.
 */
import { DatabaseSync } from './motor';
import type { BaseSqlite } from './motor';

export const ESQUEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
-- Sin esto, un corte de luz a mitad de una escritura puede dejar la bandeja
-- corrupta. En un equipo que vive en una portería el corte de luz no es una
-- hipótesis: es el martes.
PRAGMA synchronous = FULL;

CREATE TABLE IF NOT EXISTS reglas_en_cache (
  copropiedad_id TEXT PRIMARY KEY,
  version        INTEGER NOT NULL CHECK (version >= 1),
  generada_en    TEXT    NOT NULL,
  recibida_en    TEXT    NOT NULL,
  instantanea    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS bandeja_de_salida (
  clave_idempotencia TEXT PRIMARY KEY,
  secuencia          INTEGER NOT NULL,
  cuerpo             TEXT    NOT NULL,
  encolado_en        TEXT    NOT NULL,
  intentos           INTEGER NOT NULL DEFAULT 0,
  proximo_intento_en TEXT,
  ultimo_error       TEXT
);

-- El índice del vaciado: por secuencia, que es el orden de llegada (CA-22).
CREATE INDEX IF NOT EXISTS ix_bandeja_secuencia ON bandeja_de_salida (secuencia);

CREATE TABLE IF NOT EXISTS confirmados (
  clave_idempotencia TEXT PRIMARY KEY,
  secuencia          INTEGER NOT NULL,
  confirmado_en      TEXT    NOT NULL,
  duplicado          INTEGER NOT NULL DEFAULT 0
);

-- Contador único de secuencia. No se deriva de MAX(secuencia) de la bandeja
-- porque la bandeja se vacía: al quedar vacía, el siguiente hecho volvería a la
-- secuencia 1 y el orden de la reconciliación dejaría de ser el de llegada.
CREATE TABLE IF NOT EXISTS contador (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  siguiente INTEGER NOT NULL
);
INSERT OR IGNORE INTO contador (id, siguiente) VALUES (1, 1);
`;

export const abrirBase = (ruta: string): BaseSqlite => {
  const db = new DatabaseSync(ruta);
  db.exec(ESQUEMA);
  return db;
};
