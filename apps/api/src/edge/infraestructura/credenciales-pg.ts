import { createHmac } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { EquipoRegistrado } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type {
  EquipoSinClave,
  Huella,
  LecturaParaElEdge,
  MarcaDeCredencial,
} from '../aplicacion/credenciales-del-puente';
import type { CredencialesEnLaNube } from '../aplicacion/migrar-credenciales';

/**
 * 15-Q2 · D2/D3 en PostgreSQL. Todo con los claims de SERVICIO de la
 * copropiedad que la aplicación ya validó (§2.7.6): la política de
 * `credenciales_de_equipo` sólo admite al servicio, y `dispositivos` también.
 */
interface Registro {
  buscar(id: string): Promise<EquipoRegistrado | null>;
  sinClave(id: string): Promise<EquipoSinClave | null>;
}
interface SecretoDeCamara {
  secretoDe(ctx: ContextoTenant, copropiedadId: string, id: string): Promise<string | null>;
}

/** HMAC con una llave derivada de `EQUIPOS_LLAVE`: sin ella, la huella no dice nada. */
export const huellaConLlave =
  (llaveMaestra: string): Huella =>
  (copropiedadId, dispositivoId, clave) =>
    createHmac('sha256', `${llaveMaestra}|huella-de-credencial|${copropiedadId}`)
      .update(`${dispositivoId}|${clave}`)
      .digest('hex');

export class LecturaParaElEdgePg implements LecturaParaElEdge {
  constructor(
    private readonly registro: Registro,
    private readonly secretos: SecretoDeCamara,
  ) {}

  sinClave(dispositivoId: string): Promise<EquipoSinClave | null> {
    return this.registro.sinClave(dispositivoId);
  }

  secretoDeCamara(ctx: ContextoTenant, copropiedadId: string, id: string) {
    return this.secretos.secretoDe(ctx, copropiedadId, id);
  }
}

export class CredencialesEnLaNubePg implements CredencialesEnLaNube, MarcaDeCredencial {
  constructor(
    private readonly pool: Pool,
    private readonly registro: Registro,
  ) {}

  private comoServicio<T>(copropiedadId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return conCliente(this.pool, async (c) => {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      return await fn(c);
    });
  }

  pendientes(copropiedadId: string): Promise<readonly string[]> {
    return this.comoServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<{ dispositivo_id: string }>(
        `SELECT c.dispositivo_id
           FROM public.credenciales_de_equipo c
           JOIN public.dispositivos d ON d.id = c.dispositivo_id AND d.copropiedad_id = c.copropiedad_id
          WHERE c.copropiedad_id = $1 AND c.estado = 'activo' AND d.estado = 'activo'
          ORDER BY c.dispositivo_id`,
        [copropiedadId],
      );
      return rows.map((r) => r.dispositivo_id);
    });
  }

  completa(dispositivoId: string): Promise<EquipoRegistrado | null> {
    return this.registro.buscar(dispositivoId);
  }

  trasladar(copropiedadId: string, id: string, edgeId: string, huella: string): Promise<void> {
    return this.enElEdge(copropiedadId, id, edgeId, huella);
  }

  /**
   * Con una clave NUEVA en el Edge (`huella`), la que hubiera en la nube deja de
   * valer y sus BYTES se van (0050 lo exige con un CHECK); la fila se queda
   * (RN-19). Sin huella (sólo cambió el equipo), sólo la referencia.
   */
  enElEdge(copropiedadId: string, id: string, edgeId: string, huella: string | null) {
    return this.comoServicio(copropiedadId, async (c) => {
      if (huella === null) return this.marcar(c, copropiedadId, id, edgeId, null);
      await c.query('BEGIN');
      try {
        await c.query(
          `UPDATE public.credenciales_de_equipo
              SET iv = NULL, cuerpo = NULL, etiqueta = NULL, estado = 'inactivo',
                  desactivado_en = now(), trasladada_al_edge = $3, trasladada_en = now()
            WHERE copropiedad_id = $1 AND dispositivo_id = $2 AND estado = 'activo'`,
          [copropiedadId, id, edgeId],
        );
        await this.marcar(c, copropiedadId, id, edgeId, huella);
        await c.query('COMMIT');
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      }
    });
  }

  private async marcar(
    c: PoolClient,
    copropiedadId: string,
    id: string,
    edgeId: string,
    huella: string | null,
  ): Promise<void> {
    await c.query(
      `UPDATE public.dispositivos
          SET credencial_ref = 'edge:' || $3::text,
              huella_de_credencial = COALESCE($4, huella_de_credencial)
        WHERE id = $2 AND copropiedad_id = $1`,
      [copropiedadId, id, edgeId, huella],
    );
  }
}
