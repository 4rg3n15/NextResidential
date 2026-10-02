import type { BaseSqlite } from './motor';
import type { Accionamiento, MemoriaDeAccesos } from '../../aplicacion/contingencia-en-sitio';

/**
 * 15-Q · Q4/Q5 · sobre las MISMAS tablas de la bandeja (no hay otra memoria):
 *
 *  · `yaVisto`: la clave está en la bandeja o la nube ya la confirmó. Es la
 *    protección contra la repetición: una publicación repetida del equipo no
 *    acciona la talanquera dos veces.
 *  · `anotarAccionamiento`: lo que el Edge hizo con el equipo viaja DENTRO del
 *    cuerpo que ya está en la bandeja, para que la nube deje su constancia
 *    (Q4). Se escribe antes del primer envío; si ya hubiera salido sin él, el
 *    reenvío lo lleva y la nube lo acepta como duplicado del acceso y apunta la
 *    apertura con su propia clave (RN-17).
 */
export class MemoriaDeAccesosSqlite implements MemoriaDeAccesos {
  constructor(private readonly db: BaseSqlite) {}

  yaVisto(clave: string): boolean {
    const fila = this.db
      .prepare(
        `SELECT 1 AS v FROM bandeja_de_salida WHERE clave_idempotencia = ?
         UNION ALL SELECT 1 FROM confirmados WHERE clave_idempotencia = ? LIMIT 1`,
      )
      .get(clave, clave);
    return fila !== undefined;
  }

  anotarAccionamiento(clave: string, accionamiento: Accionamiento): void {
    this.db
      .prepare(
        `UPDATE bandeja_de_salida
            SET cuerpo = json_set(cuerpo, '$.accionamiento', json(?))
          WHERE clave_idempotencia = ?`,
      )
      .run(JSON.stringify(accionamiento), clave);
  }
}
