import type { Pool } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import type { IdentidadDePersona } from '../aplicacion/puertos';

type Identidad = Awaited<ReturnType<IdentidadDePersona['porId']>>;

/**
 * D-10 · la identidad del titular, leída con los claims de SERVICIO de la
 * copropiedad que se pregunta y en una transacción de sólo lectura: la RLS
 * forzada filtra por esa copropiedad y nada más (§2.7.6), y los claims no
 * quedan pegados a la conexión del pool (`set_config(…, true)`).
 */
export class IdentidadDePersonaPg implements IdentidadDePersona {
  constructor(private readonly pool: Pool) {}

  async porId(copropiedadId: string, personaId: string): Promise<Identidad> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN READ ONLY');
      await cliente.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      const { rows } = await cliente.query<{ nombre_completo: string; numero_documento: string }>(
        `SELECT nombre_completo, numero_documento
           FROM public.personas
          WHERE copropiedad_id = $1 AND id = $2 AND estado = 'activo'`,
        [copropiedadId, personaId],
      );
      await cliente.query('COMMIT');
      const fila = rows[0];
      return fila === undefined
        ? null
        : { nombreCompleto: fila.nombre_completo, numeroDocumento: fila.numero_documento };
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      cliente.release();
    }
  }
}

/** El doble sin base: la suite declara a quién conoce. */
export class IdentidadDePersonaEnMemoria implements IdentidadDePersona {
  private readonly personas = new Map<string, NonNullable<Identidad>>();

  declarar(copropiedadId: string, personaId: string, identidad: NonNullable<Identidad>): void {
    this.personas.set(`${copropiedadId}/${personaId}`, identidad);
  }

  async porId(copropiedadId: string, personaId: string): Promise<Identidad> {
    return this.personas.get(`${copropiedadId}/${personaId}`) ?? null;
  }
}
