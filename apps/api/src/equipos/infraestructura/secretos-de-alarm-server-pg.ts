import { createHmac } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { ContextoTenant } from '../../autenticacion';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { EquipoDeclarado } from '../../comun/equipos-de-alarm-server';
import { coincideEnTiempoConstante } from '../../comun/equipos-de-alarm-server';
import {
  PROPOSITOS,
  aplanar,
  cifrar,
  derivarLlave,
  desaplanar,
  descifrar,
} from '../../comun/cripto/sobre-aes-gcm';
import type {
  EquipoConSecreto,
  SecretosDeAlarmServer,
} from '../aplicacion/secretos-de-alarm-server';
import { nuevoSecretoDeAlarmServer } from '../aplicacion/secretos-de-alarm-server';
import { conCliente } from '../../persistencia/con-cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C6 (15-M) · EL SECRETO DE CADA CÁMARA, EN `dispositivos` (migración 0045)
 *
 *  · `secreto_alarm_server_sobre`  — cifrado con la bóveda de EQUIPOS_LLAVE
 *    (HKDF por copropiedad + AES-256-GCM), como la credencial del equipo.
 *  · `secreto_alarm_server_huella` — HMAC-SHA256 con llave derivada de la
 *    maestra y sal FIJA: cuando llega una publicación aún no se sabe de qué
 *    copropiedad es, y la huella es justo lo que lo dice.
 *
 * Emitir y leer el propio secreto van con los claims del ADMINISTRADOR que
 * opera la ficha (la RLS de `dispositivos` lo admite en su copropiedad).
 * Acreditar una publicación es lectura de SERVICIO, con la misma identidad de
 * lectura que el registro del proveedor: una fila por huella y nada más.
 *
 * El secreto en claro vive en memoria el tiempo de una petición y NUNCA se
 * registra (RN-21, §2.7.8). La huella tampoco: es un identificador estable.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SAL_DE_LA_HUELLA = 'alarm-server';

const CLAIMS_DE_LECTURA = JSON.stringify({
  rol: 'superadministrador',
  usuario_id: ACTOR_INGESTA,
  copropiedad_id: null,
  copropiedades: [],
});

interface FilaAcreditable {
  readonly id: string;
  readonly copropiedad_id: string;
  readonly host: string;
  readonly secreto_alarm_server_sobre: Buffer;
}

export class SecretosDeAlarmServerPg implements SecretosDeAlarmServer {
  constructor(
    private readonly pool: Pool,
    private readonly llaveMaestra: string,
  ) {}

  private huella(secreto: string): Buffer {
    const llave = derivarLlave(this.llaveMaestra, SAL_DE_LA_HUELLA, PROPOSITOS.huellaDeAlarmServer);
    return createHmac('sha256', llave).update(secreto, 'utf8').digest();
  }

  private sobre(copropiedadId: string, secreto: string): Buffer {
    const llave = derivarLlave(this.llaveMaestra, copropiedadId, PROPOSITOS.secretoDeAlarmServer);
    return aplanar(cifrar(llave, Buffer.from(secreto, 'utf8')));
  }

  private abrir(copropiedadId: string, plano: Buffer): string {
    const llave = derivarLlave(this.llaveMaestra, copropiedadId, PROPOSITOS.secretoDeAlarmServer);
    return descifrar(llave, desaplanar(plano)).toString('utf8');
  }

  private async conClaims<T>(claims: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return conCliente(this.pool, async (cliente) => {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [claims]);
      return await fn(cliente);
    });
  }

  private claimsDe(ctx: ContextoTenant): string {
    return JSON.stringify({
      rol: ctx.rol,
      usuario_id: ctx.usuarioId,
      copropiedad_id: ctx.copropiedadId,
      copropiedades: ctx.copropiedadesAtendidas,
    });
  }

  async emitir(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipo: EquipoConSecreto,
  ): Promise<string> {
    const secreto = nuevoSecretoDeAlarmServer();
    await this.conClaims(this.claimsDe(ctx), async (c) => {
      await c.query('BEGIN');
      try {
        const { rowCount } = await c.query(
          `UPDATE public.dispositivos
              SET secreto_alarm_server_sobre = $3, secreto_alarm_server_huella = $4,
                  secreto_alarm_server_emitido_en = now(), actualizado_por = $5
            WHERE id = $1 AND copropiedad_id = $2 AND tipo = 'camara_lpr'`,
          [
            equipo.id,
            copropiedadId,
            this.sobre(copropiedadId, secreto),
            this.huella(secreto),
            ctx.usuarioId,
          ],
        );
        if (rowCount !== 1) {
          throw new Error(
            'No se pudo emitir el secreto: el equipo no es una cámara de esta copropiedad',
          );
        }
        // Queda constancia de QUE se emitió; el valor, nunca.
        await c.query(
          `INSERT INTO public.auditoria_seguridad
             (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo, recurso,
              identificador_solicitado, resultado, creado_por)
           VALUES ($1, $1, $2, 'cambio_configuracion', 'equipos/secreto-alarm-server', $3,
                   'permitido', $2)`,
          [copropiedadId, ctx.usuarioId, equipo.id],
        );
        await c.query('COMMIT');
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      }
    });
    return secreto;
  }

  async secretoDe(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
  ): Promise<string | null> {
    return this.conClaims(this.claimsDe(ctx), async (c) => {
      const { rows } = await c.query<{ secreto_alarm_server_sobre: Buffer | null }>(
        `SELECT secreto_alarm_server_sobre FROM public.dispositivos
          WHERE id = $1 AND copropiedad_id = $2 AND estado = 'activo'`,
        [equipoId, copropiedadId],
      );
      const sobre = rows[0]?.secreto_alarm_server_sobre ?? null;
      return sobre === null ? null : this.abrir(copropiedadId, sobre);
    });
  }

  async equipoPorSecreto(secreto: string): Promise<EquipoDeclarado | null> {
    if (secreto === '') return null;
    const fila = await this.conClaims(CLAIMS_DE_LECTURA, async (c) => {
      const { rows } = await c.query<FilaAcreditable>(
        `SELECT id, copropiedad_id, host, secreto_alarm_server_sobre FROM public.dispositivos
          WHERE secreto_alarm_server_huella = $1 AND estado = 'activo'`,
        [this.huella(secreto)],
      );
      return rows[0] ?? null;
    });
    if (fila === null) return null;
    // La huella ya lo encontró; la comparación en tiempo constante es la
    // segunda cerradura: una colisión de HMAC no acredita a nadie.
    if (
      !coincideEnTiempoConstante(
        this.abrir(fila.copropiedad_id, fila.secreto_alarm_server_sobre),
        secreto,
      )
    ) {
      return null;
    }
    return {
      dispositivoId: fila.id,
      copropiedadId: fila.copropiedad_id,
      secreto,
      origenesPermitidos: [fila.host],
    };
  }
}
