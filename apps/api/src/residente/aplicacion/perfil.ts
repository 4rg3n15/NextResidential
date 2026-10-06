import { Inject, Injectable } from '@nestjs/common';
import { RELOJ, edadEn, puedeTenerCuenta, validarPerfil } from '@ncr/domain-core';
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

/**
 * 15-W (D-W2) · el perfil es de una CUENTA, y las cuentas son de mayores de
 * edad: una fecha de menor se rechaza aquí, como campo, antes de que la base la
 * rechace (`tg_persona_con_cuenta_solo_mayor`, 0055) con un error genérico.
 */
const fechaDeMenor = (fecha: string | null, ahora: Date): CampoRechazado | null => {
  const edad = fecha === null ? null : edadEn(fecha, ahora);
  return edad !== null && !puedeTenerCuenta(edad)
    ? { campo: 'fechaNacimiento', motivo: 'Las cuentas son para mayores de edad' }
    : null;
};

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
    const menor = fechaDeMenor(valido.valor.fechaNacimiento, this.reloj.ahora());
    if (menor !== null) return { guardado: false, campos: [menor] };
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

const CAMPOS_DEL_PERFIL = [
  'nombres',
  'apellidos',
  'fechaNacimiento',
  'tipoDocumento',
  'numeroDocumento',
  'correo',
  'telefono',
] as const;

/**
 * G (15-L) · EL SUPERADMINISTRADOR EDITA EL PERFIL DE UN RESIDENTE. Las mismas
 * validaciones del dominio que usa el propio residente (`validarPerfil`) y la
 * misma unicidad del documento en la base. El rastro dice QUIÉN editó a QUIÉN
 * y QUÉ CAMPOS cambiaron —sus nombres, nunca los valores: el documento no va a
 * la bitácora (§2.7.8)—.
 */
@Injectable()
export class PerfilDeResidentePorSuperadmin {
  constructor(
    @Inject(PERFIL_DEL_RESIDENTE) private readonly perfiles: PerfilDelResidente,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  ver(copropiedadId: string, usuarioId: string): Promise<PerfilGuardado | null> {
    return this.perfiles.perfil(copropiedadId, usuarioId);
  }

  async editar(
    ctx: ContextoTenant,
    copropiedadId: string,
    usuarioId: string,
    datos: DatosDelPerfil,
  ): Promise<ResultadoDePerfil> {
    const antes = await this.perfiles.perfil(copropiedadId, usuarioId);
    if (antes === null) return { guardado: false, motivo: 'SIN_VINCULO' };
    const valido = validarPerfil(datos, this.reloj.ahora());
    if (!valido.ok) return { guardado: false, campos: valido.error };
    const menor = fechaDeMenor(valido.valor.fechaNacimiento, this.reloj.ahora());
    if (menor !== null) return { guardado: false, campos: [menor] };
    const cambiados = CAMPOS_DEL_PERFIL.filter(
      (campo) => (antes[campo] ?? null) !== (valido.valor[campo] ?? null),
    );
    const r = await this.perfiles.guardar(copropiedadId, usuarioId, valido.valor, ctx.usuarioId);
    if (r !== 'guardado') return { guardado: false, motivo: r };
    await this.bitacora.anotar({
      copropiedadId,
      tipo: 'perfil_editado',
      ocurridoEn: this.reloj.ahora(),
      usuarioId,
      actorId: ctx.usuarioId,
      detalle:
        cambiados.length === 0
          ? 'editado por el superadministrador, sin cambios'
          : `editado por el superadministrador: ${cambiados.join(', ')}`,
    });
    const perfil = await this.perfiles.perfil(copropiedadId, usuarioId);
    return perfil === null
      ? { guardado: false, motivo: 'SIN_VINCULO' }
      : { guardado: true, perfil };
  }
}
