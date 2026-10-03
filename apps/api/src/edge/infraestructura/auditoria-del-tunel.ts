import type { Pool } from 'pg';
import type { Bitacora } from '@ncr/domain-core';
import type { AuditoriaDelTunel } from '../aplicacion/abrir-tunel';

/**
 * 15-Q2 · A1 · el túnel rechazado, en `auditoria_seguridad` (tipo
 * `tunel_edge_rechazado`, 0050). Como `RegistroDeAuditoriaPg`: escribe sin
 * claims de tenant (la política de inserción es `WITH CHECK (true)`: todo
 * intento debe poder registrarse) y NUNCA rompe lo que audita: un fallo al
 * escribir va a la bitácora y el rechazo al Edge es el mismo.
 */
type Rechazo = Parameters<AuditoriaDelTunel['registrarRechazo']>[0];

const RESULTADO: Readonly<Record<Rechazo['motivo'], string>> = {
  NO_ES_PUENTE: '403',
  YA_CONECTADO: '409',
};

export class AuditoriaDelTunelPg implements AuditoriaDelTunel {
  constructor(
    private readonly pool: Pool,
    private readonly bitacora: Bitacora,
  ) {}

  async registrarRechazo(rechazo: Rechazo): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO public.auditoria_seguridad
           (copropiedad_id_objetivo, usuario_id, tipo, recurso, identificador_solicitado, resultado)
         VALUES ($1, $2, 'tunel_edge_rechazado'::tipo_evento_seguridad, $3, $4, $5)`,
        [
          rechazo.copropiedadId,
          rechazo.usuarioServicioId,
          `/edge/tunel · ${rechazo.motivo}`,
          rechazo.edgeId,
          RESULTADO[rechazo.motivo],
        ],
      );
    } catch (error) {
      this.bitacora.registrar('error', 'no se pudo auditar el túnel rechazado', {
        motivo: rechazo.motivo,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Sin base: lo que se habría escrito, para que las pruebas lo vean. */
export class AuditoriaDelTunelEnMemoria implements AuditoriaDelTunel {
  readonly rechazos: Rechazo[] = [];

  async registrarRechazo(rechazo: Rechazo): Promise<void> {
    this.rechazos.push(rechazo);
  }
}
