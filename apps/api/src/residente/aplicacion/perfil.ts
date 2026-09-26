import { Inject, Injectable } from '@nestjs/common';
import { RELOJ, validarPerfil } from '@ncr/domain-core';
import type { CampoRechazado, DatosDelPerfil, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { BITACORA_DE_RESIDENTES, PERFIL_DEL_RESIDENTE } from './puertos-hogar';
import type { BitacoraDeResidentes, PerfilDelResidente, PerfilGuardado } from './puertos-hogar';

/**
 * PERFIL DEL RESIDENTE (3.5). Editables: nombre, apellido, fecha de nacimiento,
 * documento, correo y teléfono. La copropiedad —nombre y dirección— y el
 * teléfono de portería se VEN y no se editan: son del superadministrador (D7).
 * El documento viaja sólo hacia su titular y nunca a un registro ni a la
 * bitácora (§2.7.8): el rastro dice «perfil editado», no qué se escribió.
 */
export type ResultadoDePerfil =
  | { readonly guardado: true; readonly perfil: PerfilGuardado }
  | { readonly guardado: false; readonly campos: readonly CampoRechazado[] }
  | { readonly guardado: false; readonly motivo: 'DOCUMENTO_EN_USO' | 'SIN_VINCULO' };

@Injectable()
export class VerMiPerfil {
  constructor(@Inject(PERFIL_DEL_RESIDENTE) private readonly perfiles: PerfilDelResidente) {}

  ejecutar(ctx: ContextoTenant, copropiedadId: string): Promise<PerfilGuardado | null> {
    return this.perfiles.perfil(copropiedadId, ctx.usuarioId);
  }
}

@Injectable()
export class EditarMiPerfil {
  constructor(
    @Inject(PERFIL_DEL_RESIDENTE) private readonly perfiles: PerfilDelResidente,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    datos: DatosDelPerfil,
  ): Promise<ResultadoDePerfil> {
    const valido = validarPerfil(datos, this.reloj.ahora());
    if (!valido.ok) return { guardado: false, campos: valido.error };
    const r = await this.perfiles.guardar(copropiedadId, ctx.usuarioId, valido.valor);
    if (r !== 'guardado') return { guardado: false, motivo: r };
    await this.bitacora.anotar({
      copropiedadId,
      tipo: 'perfil_editado',
      ocurridoEn: this.reloj.ahora(),
      usuarioId: ctx.usuarioId,
      actorId: ctx.usuarioId,
    });
    const perfil = await this.perfiles.perfil(copropiedadId, ctx.usuarioId);
    return perfil === null
      ? { guardado: false, motivo: 'SIN_VINCULO' }
      : { guardado: true, perfil };
  }
}
