import { exito, fallo } from '@ncr/domain-core';
import type { Reloj, Resultado } from '@ncr/domain-core';
import type { BitacoraDeIdentidad } from '../../comun/bitacora-de-identidad';
import type { ContextoTenant, Rol } from '../../autenticacion';
import { motivoDeRechazoDeContrasena } from '../dominio/politica-de-contrasena';
import type {
  AdministradorDeCuentas,
  GanchosDeSesion,
  OrigenDeAcceso,
  RepositorioDeCuentas,
} from './puertos';

export type RechazoDeRestablecimiento =
  | { readonly motivo: 'NO_ENCONTRADO' }
  | { readonly motivo: 'PROHIBIDO'; readonly detalle: string }
  | { readonly motivo: 'POLITICA'; readonly detalle: string };

/**
 * Quién restablece a quién, mientras no exista canal real de recuperación
 * (BE-01, P-18). El superadministrador, a cualquier cuenta de la copropiedad
 * que no sea otro superadministrador; el administrador, sólo a residentes.
 */
const PUEDE_RESTABLECER: Readonly<Partial<Record<Rol, readonly Rol[]>>> = {
  superadministrador: ['administrador', 'operador_central', 'portero', 'residente'],
  administrador: ['residente'],
};

/**
 * RESTABLECIMIENTO POR UNA PERSONA · con rastro y con cambio obligatorio (S-51).
 *
 * La contraseña temporal la escribe quien restablece y cumple la política. El
 * servidor no la genera ni la devuelve: una contraseña generada tendría que
 * viajar en una respuesta. La cuenta queda obligada a cambiarla en el
 * siguiente ingreso, y las sesiones vivas del portero se cierran en el acto.
 */
export class RestablecerContrasena {
  constructor(
    private readonly administrador: AdministradorDeCuentas,
    private readonly cuentas: RepositorioDeCuentas,
    private readonly ganchos: GanchosDeSesion,
    private readonly bitacora: BitacoraDeIdentidad,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    usuarioId: string,
    temporal: string,
    origen: OrigenDeAcceso,
  ): Promise<Resultado<void, RechazoDeRestablecimiento>> {
    const cuenta = await this.cuentas.identidadDe(usuarioId);
    // Otra copropiedad responde igual que «no existe» (CA-24): ni se confirma.
    if (cuenta === null || cuenta.copropiedadId !== copropiedadId || cuenta.rol === null) {
      return fallo({ motivo: 'NO_ENCONTRADO' });
    }
    if (cuenta.usuarioId === ctx.usuarioId) {
      return fallo({
        motivo: 'PROHIBIDO',
        detalle: 'La propia contraseña se cambia, no se restablece',
      });
    }
    if (!(PUEDE_RESTABLECER[ctx.rol] ?? []).includes(cuenta.rol)) {
      return fallo({
        motivo: 'PROHIBIDO',
        detalle: 'Su rol no restablece la contraseña de esta cuenta',
      });
    }
    const politica = motivoDeRechazoDeContrasena(temporal);
    if (politica !== null) return fallo({ motivo: 'POLITICA', detalle: politica });

    await this.administrador.fijarContrasena(cuenta.authUserId, temporal);
    await this.cuentas.fijarCambioObligatorio(cuenta.usuarioId, true, ctx.usuarioId);
    await this.ganchos.de(cuenta.rol)?.alRestablecer({
      usuarioId: cuenta.usuarioId,
      copropiedadId,
      actorId: ctx.usuarioId,
    });
    await this.bitacora.anotar({
      tipo: 'restablecimiento_de_contrasena',
      copropiedadId,
      usuarioId: cuenta.usuarioId,
      actorId: ctx.usuarioId,
      ocurridoEn: this.reloj.ahora(),
      origen,
    });
    return exito(undefined);
  }
}
