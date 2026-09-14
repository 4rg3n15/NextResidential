import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant, Rol } from '../../autenticacion';
import { alcanzaCopropiedad } from '../../autenticacion';
import type { BloqueoDeAcceso, EstadoDeAccionamiento } from './apertura-manual';
import { motivoValido } from './apertura-manual';

/**
 * Bloquear y desbloquear un acceso.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO ES EL MISMO CASO DE USO QUE LA APERTURA MANUAL
 *
 * Comparten transporte y comparten la regla del motivo, pero no son lo mismo.
 * Abrir es un **pulso**: afecta a un vehículo y se acaba. Bloquear es **estado
 * que queda** y que manda sobre todo lo que venga después — con el acceso
 * bloqueado, una placa autorizada no abre y el motor de reglas queda sin
 * efecto. Es el hallazgo H-3 de la validación en sitio, y es la diferencia
 * entre una decisión operativa y una decisión de servicio.
 *
 * De ahí lo demás: **no lo ejerce el portero**. Un portero abre para quien está
 * esperando; dejar el conjunto sin entrada vehicular es de administración.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const ROLES_QUE_BLOQUEAN: readonly Rol[] = ['administrador', 'superadministrador'];

export interface OrdenDeBloqueo {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly bloqueado: boolean;
  readonly motivo: string;
}

/**
 * Quién dejó el acceso como está, y desde cuándo.
 *
 * **No es el registro de que hubo una orden**: es el estado vigente con dueño.
 * Un bloqueo sin dueño visible es un fallo de operación esperando a ocurrir —
 * alguien bloquea un viernes, nadie recuerda quién, y el lunes el conjunto
 * entero está sin entrada vehicular mientras se busca al responsable.
 */
export interface BloqueoVigente {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly bloqueado: boolean;
  readonly motivo: string;
  readonly operadorId: string;
  readonly rol: Rol;
  readonly desde: Date;
  readonly resultado: EstadoDeAccionamiento | null;
  readonly detalle: string | null;
}

export interface RegistroDeBloqueos {
  /** Escribe el estado con su dueño. Se llama ANTES de accionar. */
  fijar(bloqueo: BloqueoVigente): Promise<void>;
  anotarResultado(
    copropiedadId: string,
    dispositivoId: string,
    resultado: EstadoDeAccionamiento,
    detalle: string | null,
  ): Promise<void>;
  vigente(copropiedadId: string, dispositivoId: string): Promise<BloqueoVigente | null>;
  todos(copropiedadId: string): Promise<readonly BloqueoVigente[]>;
}
export const REGISTRO_DE_BLOQUEOS = Symbol.for('ncr.puerto.RegistroDeBloqueos');

export class FijarBloqueoDeAcceso {
  constructor(
    private readonly barrera: BloqueoDeAcceso,
    private readonly registro: RegistroDeBloqueos,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    orden: OrdenDeBloqueo,
  ): Promise<Resultado<BloqueoVigente, ErrorDominio>> {
    if (!ROLES_QUE_BLOQUEAN.includes(ctx.rol)) {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          'Tu rol no bloquea ni desbloquea accesos: es una decisión de administración',
          'RN-08',
        ),
      );
    }
    if (!alcanzaCopropiedad(ctx, orden.copropiedadId)) {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no alcanza esta copropiedad', 'RN-15'),
      );
    }

    /**
     * La misma regla que la apertura manual, y por el mismo motivo (RN-08).
     * Se comprueba **antes** de accionar: sin motivo no se bloquea, no es que
     * se bloquee y se anote «sin motivo». Dejar un conjunto sin entrada sin
     * justificación registrada es peor que abrir sin motivo, no mejor.
     */
    const motivo = motivoValido(orden.motivo);
    if (!motivo.ok) return motivo;

    const vigente: BloqueoVigente = {
      copropiedadId: orden.copropiedadId,
      dispositivoId: orden.dispositivoId,
      bloqueado: orden.bloqueado,
      motivo: motivo.valor,
      operadorId: ctx.usuarioId,
      rol: ctx.rol,
      desde: this.reloj.ahora(),
      resultado: null,
      detalle: null,
    };

    // El rastro ANTES de accionar, igual que la apertura manual: una caída
    // entre accionar y registrar dejaría un acceso bloqueado sin dueño, que es
    // justamente el estado que este registro existe para impedir.
    await this.registro.fijar(vigente);

    const resultado = await this.barrera.fijarBloqueo(orden.dispositivoId, orden.bloqueado);
    const detalle = resultado.estado === 'aceptada' ? null : resultado.motivo;
    await this.registro.anotarResultado(
      orden.copropiedadId,
      orden.dispositivoId,
      resultado.estado,
      detalle,
    );

    return exito({ ...vigente, resultado: resultado.estado, detalle });
  }
}
