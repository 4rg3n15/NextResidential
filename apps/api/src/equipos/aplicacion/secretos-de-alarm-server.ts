import { randomBytes } from 'node:crypto';
import type { ContextoTenant } from '../../autenticacion';
import type { EquipoDeclarado } from '../../comun/equipos-de-alarm-server';
import { coincideEnTiempoConstante } from '../../comun/equipos-de-alarm-server';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C6 (ETAPA 15-M) · EL SECRETO DE ALARM SERVER ES DE CADA CÁMARA, Y LO EMITE LA API
 *
 * Hasta aquí una cámara nueva exigía escribir su secreto a mano en
 * `ALARM_SERVER_EQUIPOS` y reiniciar la API. Ahora, al dar de alta una
 * `camara_lpr` desde la consola, la API GENERA un secreto aleatorio, lo guarda
 * cifrado con la misma bóveda que la credencial del equipo y lo enseña UNA
 * vez. El receptor lo acredita buscándolo por su huella (secreto → equipo →
 * copropiedad). La declaración del .env sigue valiendo: las dos fuentes
 * conviven, y la cámara que hoy publica no se toca.
 *
 * Este puerto lo declara el módulo de equipos (que emite y guarda) y lo
 * consume el receptor (que acredita), por el barril y no por ruta interna.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const SECRETOS_DE_ALARM_SERVER = Symbol.for('ncr.equipos.SecretosDeAlarmServer');

/** Por debajo de esto el secreto sería adivinable (mismo mínimo que la declaración). */
export const BYTES_DEL_SECRETO = 33; // 44 caracteres en base64url, siempre ≥ 32

export const nuevoSecretoDeAlarmServer = (): string =>
  randomBytes(BYTES_DEL_SECRETO).toString('base64url');

export interface EquipoConSecreto {
  readonly id: string;
  /** El origen desde el que publica: es la otra mitad de la acreditación (H-15-1). */
  readonly host: string;
}

export interface SecretosDeAlarmServer {
  /**
   * Emite (o ROTA) el secreto de una cámara y devuelve el valor en claro: es la
   * única vez que sale. Queda constancia en la auditoría; el valor, nunca.
   */
  emitir(ctx: ContextoTenant, copropiedadId: string, equipo: EquipoConSecreto): Promise<string>;
  /** El secreto vigente, descifrado, SÓLO para escribir la ruta en la cámara. */
  secretoDe(ctx: ContextoTenant, copropiedadId: string, equipoId: string): Promise<string | null>;
  /**
   * Quién publica con este secreto: búsqueda por huella y comparación en tiempo
   * constante. `null` si nadie. Lectura de servicio: la hace el receptor.
   */
  equipoPorSecreto(secreto: string): Promise<EquipoDeclarado | null>;
}

/** El doble de la suite sin base: mismo contrato, en memoria. */
export class SecretosDeAlarmServerEnMemoria implements SecretosDeAlarmServer {
  private readonly porEquipo = new Map<string, EquipoDeclarado>();

  async emitir(
    _ctx: ContextoTenant,
    copropiedadId: string,
    equipo: EquipoConSecreto,
  ): Promise<string> {
    const secreto = nuevoSecretoDeAlarmServer();
    this.porEquipo.set(equipo.id, {
      dispositivoId: equipo.id,
      copropiedadId,
      secreto,
      origenesPermitidos: [equipo.host],
    });
    return secreto;
  }

  async secretoDe(
    _ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
  ): Promise<string | null> {
    const guardado = this.porEquipo.get(equipoId);
    return guardado !== undefined && guardado.copropiedadId === copropiedadId
      ? guardado.secreto
      : null;
  }

  async equipoPorSecreto(secreto: string): Promise<EquipoDeclarado | null> {
    let encontrado: EquipoDeclarado | null = null;
    for (const equipo of this.porEquipo.values()) {
      if (coincideEnTiempoConstante(equipo.secreto, secreto)) encontrado = equipo;
    }
    return encontrado;
  }
}
