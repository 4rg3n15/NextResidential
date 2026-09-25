import { exito, fallo } from '@ncr/domain-core';
import type { Reloj, Resultado } from '@ncr/domain-core';
import type { BitacoraDeIdentidad } from '../../comun/bitacora-de-identidad';
import { exigeSegundoFactor } from '../../autenticacion';
import type { ContextoTenant } from '../../autenticacion';
import { correoSintetico } from '../dominio/correo-sintetico';
import { motivoDeRechazoDeContrasena } from '../dominio/politica-de-contrasena';
import type {
  AdministradorDeCuentas,
  IdentidadDeCuenta,
  OrigenDeAcceso,
  ProveedorDeIdentidad,
  RepositorioDeCuentas,
} from './puertos';

export type RechazoDeCambio =
  | { readonly motivo: 'POLITICA'; readonly detalle: string }
  | { readonly motivo: 'IGUAL' }
  | { readonly motivo: 'ACTUAL_INCORRECTA' }
  | { readonly motivo: 'SEGUNDO_FACTOR' }
  | { readonly motivo: 'SIN_CUENTA' };

/** El identificador con el que el proveedor conoce la cuenta, calculado aquí y sólo aquí. */
export const correoDeAcceso = (cuenta: IdentidadDeCuenta): string | null => {
  if (cuenta.acceso.tipo === 'correo') return cuenta.acceso.correo;
  return cuenta.copropiedadId === null
    ? null
    : correoSintetico(cuenta.acceso.usuario, cuenta.copropiedadId);
};

/**
 * CAMBIO DE LA PROPIA CONTRASEÑA · y con él, el fin del primer ingreso (ADR-023).
 *
 * Exige la actual, y la comprueba contra el proveedor —no contra un hash
 * propio, que no existe—; la sesión que abre esa comprobación se revoca en el
 * acto. La nueva cumple la política del servidor y no puede ser la misma: en
 * el primer ingreso la actual ES la inicial, que la escribió otra persona.
 *
 * Un rol administrativo con `aal1` sólo llega aquí con el cambio pendiente. Sin
 * eso, quien tuviera sólo su contraseña podría cambiarla sin el segundo factor
 * y dejar fuera a su dueño.
 */
export class CambiarContrasena {
  constructor(
    private readonly proveedor: ProveedorDeIdentidad,
    private readonly administrador: AdministradorDeCuentas,
    private readonly cuentas: RepositorioDeCuentas,
    private readonly bitacora: BitacoraDeIdentidad,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    actual: string,
    nueva: string,
    origen: OrigenDeAcceso,
  ): Promise<Resultado<void, RechazoDeCambio>> {
    if (exigeSegundoFactor(ctx.rol) && !ctx.mfaVerificado && ctx.debeCambiarContrasena !== true) {
      return fallo({ motivo: 'SEGUNDO_FACTOR' });
    }
    const politica = motivoDeRechazoDeContrasena(nueva);
    if (politica !== null) return fallo({ motivo: 'POLITICA', detalle: politica });
    if (nueva === actual) return fallo({ motivo: 'IGUAL' });

    const cuenta = await this.cuentas.identidadDe(ctx.usuarioId);
    const correo = cuenta === null ? null : correoDeAcceso(cuenta);
    if (cuenta === null || correo === null) return fallo({ motivo: 'SIN_CUENTA' });

    const comprobacion = await this.proveedor.iniciarSesion(correo, actual);
    if (comprobacion === null) return fallo({ motivo: 'ACTUAL_INCORRECTA' });
    await this.proveedor.cerrarSesion(comprobacion.accessToken);

    await this.administrador.fijarContrasena(cuenta.authUserId, nueva);
    await this.cuentas.fijarCambioObligatorio(cuenta.usuarioId, false, cuenta.usuarioId);
    if (cuenta.copropiedadId !== null) {
      await this.bitacora.anotar({
        tipo: 'cambio_de_contrasena',
        copropiedadId: cuenta.copropiedadId,
        usuarioId: cuenta.usuarioId,
        actorId: cuenta.usuarioId,
        ocurridoEn: this.reloj.ahora(),
        origen,
      });
    }
    return exito(undefined);
  }
}
