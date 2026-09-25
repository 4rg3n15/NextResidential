import { isIP } from 'node:net';
import type { Pool } from 'pg';
import type { Bitacora } from '@ncr/domain-core';
import type { RegistroDeAuditoria, RespuestaDeTitularAuditada } from './registro';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA AUDITORÍA DE SEGURIDAD EN POSTGRESQL · ETAPA 15-E (D-139)
 *
 * `auditoria_seguridad` existía desde la ETAPA 01 (D-14, KPI-38) y el módulo
 * de equipos escribía en ella; el puerto `RegistroDeAuditoria`, en cambio,
 * sólo tenía el doble en memoria, así que un acceso cruzado bloqueado (RN-15,
 * CA-24) o un restablecimiento no dejaban rastro que sobreviviera al proceso.
 *
 * Reglas de este adaptador, y no son detalles:
 *
 *  - **Nunca rompe la petición que audita.** Un fallo al escribir el rastro se
 *    registra en bitácora y la respuesta al cliente es la misma: un 404 que
 *    se convierte en 500 porque la auditoría falló revelaría, precisamente,
 *    que había algo que auditar.
 *  - Escribe SIN claims de tenant: la política de inserción de la tabla es
 *    `WITH CHECK (true)` a propósito («todo intento debe poder registrarse»),
 *    y el actor de un acceso cruzado puede no pertenecer a ninguna copropiedad.
 *  - `usuario_id` sólo si es un identificador de usuario real; los tokens de
 *    prueba llevan identificadores que la clave ajena rechazaría, y por eso el
 *    fallo se traga y se anota, no se propaga.
 *  - La IP se guarda sólo si es una IP (`inet` no admite otra cosa); el
 *    agente de usuario se acota.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class RegistroDeAuditoriaPg implements RegistroDeAuditoria {
  constructor(
    private readonly pool: Pool,
    private readonly bitacora: Bitacora,
  ) {}

  private async insertar(
    fila: {
      tipo: string;
      recurso: string;
      resultado: string;
      copropiedadObjetivo: string | null;
      usuarioId: string | null;
      identificador: string | null;
      ip: string | null;
      userAgent: string | null;
    },
    que: string,
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO public.auditoria_seguridad
           (copropiedad_id_objetivo, usuario_id, tipo, recurso, identificador_solicitado,
            ip, user_agent, resultado)
         VALUES ($1, $2, $3::tipo_evento_seguridad, $4, $5, $6, $7, $8)`,
        [
          fila.copropiedadObjetivo,
          fila.usuarioId,
          fila.tipo,
          fila.recurso.slice(0, 300),
          fila.identificador,
          fila.ip !== null && isIP(fila.ip) !== 0 ? fila.ip : null,
          fila.userAgent === null ? null : fila.userAgent.slice(0, 300),
          fila.resultado,
        ],
      );
    } catch (error) {
      this.bitacora.registrar('error', `no se pudo escribir la auditoría de seguridad: ${que}`, {
        tipo: fila.tipo,
        motivo: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async registrarAccesoCruzado(entrada: {
    usuarioId: string;
    rol: string;
    copropiedadSolicitada: string;
    recurso: string;
  }): Promise<void> {
    await this.insertar(
      {
        tipo: 'acceso_cruzado',
        recurso: `${entrada.rol}:${entrada.recurso}`,
        resultado: '404',
        copropiedadObjetivo: entrada.copropiedadSolicitada,
        usuarioId: entrada.usuarioId,
        identificador: entrada.copropiedadSolicitada,
        ip: null,
        userAgent: null,
      },
      'acceso cruzado',
    );
  }

  async registrarRestablecimiento(entrada: {
    usuarioId: string;
    rol: string;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void> {
    await this.insertar(
      {
        tipo: 'restablecimiento_contrasena',
        recurso: `${entrada.rol}:auth/restablecimiento`,
        resultado: 'permitido',
        copropiedadObjetivo: null,
        usuarioId: entrada.usuarioId,
        identificador: null,
        ip: entrada.ip,
        userAgent: entrada.userAgent,
      },
      'restablecimiento',
    );
  }

  async registrarRespuestaDeTitular(entrada: RespuestaDeTitularAuditada): Promise<void> {
    await this.insertar(
      {
        tipo: 'respuesta_de_titular',
        // El recurso lleva la respuesta y la versión de la política: es lo que
        // la Ley 1581 pide poder demostrar después.
        recurso: `consentimiento/${entrada.respuesta}/politica:${entrada.versionPolitica}`,
        resultado: 'permitido',
        copropiedadObjetivo: entrada.copropiedadId,
        usuarioId: null,
        identificador: entrada.consentimientoId,
        ip: entrada.ip,
        userAgent: entrada.userAgent,
      },
      'respuesta del titular',
    );
  }
}
