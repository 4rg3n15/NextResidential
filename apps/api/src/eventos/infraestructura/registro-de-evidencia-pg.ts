import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { EvidenciaGuardada, RegistroDeEvidencia } from '../aplicacion/registro-de-evidencia';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * H-15I-07 · la fila de `evidencias` que referencia el evento: el mismo
 * patrón que la fotografía del visitante (15-D), con hash y tamaño calculados
 * de los bytes que se guardaron. Camino de servicio con la copropiedad en cada
 * sentencia (§2.7.6); la escribe el actor de ingesta (S-44).
 */
export class RegistroDeEvidenciaPg implements RegistroDeEvidencia {
  constructor(
    private readonly pool: Pool,
    private readonly bucket: string,
    private readonly actorId: string,
  ) {}

  async registrar(e: EvidenciaGuardada): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO public.evidencias
         (copropiedad_id, bucket, ruta, tipo, hash_sha256, tipo_mime, tamano_bytes, creado_por)
       VALUES ($1, $2, $3, $4::tipo_evidencia, $5, $6, $7, $8)
       RETURNING id`,
      [
        e.copropiedadId,
        this.bucket,
        e.clave,
        e.tipo,
        createHash('sha256').update(e.contenido).digest('hex'),
        e.tipoMime,
        e.contenido.byteLength,
        this.actorId,
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error('la evidencia no devolvió identificador');
    return id;
  }

  async rutaDe(copropiedadId: string, referencia: string): Promise<string | null> {
    // Eventos anteriores al arreglo, o de un banco sin base, llevan la ruta.
    if (!UUID.test(referencia)) return referencia;
    const { rows } = await this.pool.query<{ ruta: string }>(
      `SELECT ruta FROM public.evidencias WHERE copropiedad_id = $1 AND id = $2`,
      [copropiedadId, referencia],
    );
    return rows[0]?.ruta ?? null;
  }
}
