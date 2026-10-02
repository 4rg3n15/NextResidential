import type { BaseSqlite } from './motor';
import type { FeDeVidaDeReglas } from '../../aplicacion/descarga-de-reglas';

/**
 * Q2 (15-Q) · la nube dio fe de que la versión vigente SIGUE siéndolo: se
 * renueva su `generadaEn` —en la columna y dentro de la instantánea, que es de
 * donde lo lee la decisión— sin tocar su contenido ni su versión.
 *
 * Sólo si la versión es la misma (la nube habla de ESA) y sólo hacia delante
 * (una fe de vida vieja que llega tarde no rejuvenece nada).
 */
export class FeDeVidaSqlite implements FeDeVidaDeReglas {
  constructor(private readonly db: BaseSqlite) {}

  revalidar(copropiedadId: string, version: number, generadaEn: string): boolean {
    if (Number.isNaN(new Date(generadaEn).getTime())) return false;
    const r = this.db
      .prepare(
        `UPDATE reglas_en_cache
            SET generada_en = ?, instantanea = json_set(instantanea, '$.generadaEn', ?)
          WHERE copropiedad_id = ? AND version = ? AND generada_en < ?`,
      )
      .run(generadaEn, generadaEn, copropiedadId, version, generadaEn);
    return Number(r.changes) > 0;
  }
}
