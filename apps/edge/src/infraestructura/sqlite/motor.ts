/**
 * El único punto que carga `node:sqlite`, y por qué no es un `import`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * `node:sqlite` ES UN MÓDULO «SOLO CON PREFIJO»
 *
 * No aparece en `module.builtinModules` —`isBuiltin('node:sqlite')` es `true`
 * pero `builtinModules.includes('sqlite')` es `false`—, y los empaquetadores
 * deciden si algo es interno mirando esa lista tras quitar el `node:`. Vite lo
 * intenta resolver como un paquete llamado `sqlite`, no lo encuentra, y el
 * fichero de pruebas **entero** no llega a cargarse: la suite informa «0 test»,
 * que es peor que un rojo porque parece que no había nada que probar.
 *
 * `process.getBuiltinModule` (Node 22.3+) lo devuelve sin que exista ningún
 * especificador de importación que un empaquetador pueda intentar resolver. Los
 * tipos siguen siendo los reales vía `typeof import(...)`, así que no se pierde
 * ni una comprobación del compilador.
 *
 * Está aquí y no repartido: si mañana se cambia a `better-sqlite3` (la
 * contingencia del ADR-017), este fichero es el que se reescribe.
 */
import type * as Sqlite from 'node:sqlite';

/**
 * El `import type` de arriba NO genera código —TypeScript lo borra— así que no
 * hay ningún especificador que un empaquetador intente resolver. Los tipos son
 * los reales; la carga es la de abajo.
 */
const modulo = process.getBuiltinModule('node:sqlite') as typeof Sqlite;

export const { DatabaseSync } = modulo;
export type BaseSqlite = InstanceType<typeof Sqlite.DatabaseSync>;
