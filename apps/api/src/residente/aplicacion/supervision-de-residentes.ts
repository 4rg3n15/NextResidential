import { Inject, Injectable } from '@nestjs/common';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { CrearCuentaPorUsuario, RechazoDeAlta } from '../../cuentas';
import { plazasVisibles } from './ocupantes';
import type { PlazaVisible } from './ocupantes';
import {
  BITACORA_DE_RESIDENTES,
  CODIGOS_DE_OCUPANTE,
  CUENTAS_DE_RESIDENTES,
  OCUPANTES_DE_LA_VIVIENDA,
  VEHICULOS_PROPIOS,
} from './puertos-hogar';
import type {
  BitacoraDeResidentes,
  CodigosDeOcupante,
  CuentaDeResidente,
  CuentasDeResidentes,
  OcupantesDeLaVivienda,
  VehiculoPropioGuardado,
  VehiculosPropios,
} from './puertos-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE EL SUPERADMINISTRADOR HACE CON LOS RESIDENTES · ETAPA 15-I
 *
 *  · 3.1 · crea la cuenta con usuario y contraseña inicial (el correo es
 *    sintético y no sale de la API, ADR-023); la cuenta nace obligada a cambiar
 *    la contraseña y sin vivienda.
 *  · D6 · añade o quita plazas de ocupante a petición del residente, con motivo
 *    y rastro. Quitar una plaza OCUPADA da de baja el vínculo de esa persona.
 *  · D5 a · ve los vehículos que registraron los residentes, con fecha y
 *    vivienda —el contrapeso de una propiedad que nadie comprueba—, y los
 *    desactiva por la ruta del padrón que ya existía.
 *
 * La barrera de rol es la guarda (`@Roles('superadministrador')`) y la de
 * copropiedad `exigirAlcance`, las dos en el controlador.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface AltaDeResidente {
  readonly usuario: string;
  readonly contrasenaInicial: string;
  readonly nombre: string;
  readonly telefono: string | null;
}

@Injectable()
export class CuentasDeResidentesDelSuperadmin {
  constructor(
    private readonly crearCuenta: CrearCuentaPorUsuario,
    @Inject(CUENTAS_DE_RESIDENTES) private readonly cuentas: CuentasDeResidentes,
    @Inject(VEHICULOS_PROPIOS) private readonly vehiculos: VehiculosPropios,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  listar(copropiedadId: string): Promise<readonly CuentaDeResidente[]> {
    return this.cuentas.listar(copropiedadId);
  }

  async alta(
    ctx: ContextoTenant,
    copropiedadId: string,
    alta: AltaDeResidente,
  ): Promise<
    | { readonly ok: true; readonly usuarioId: string }
    | { readonly ok: false; readonly rechazo: RechazoDeAlta }
  > {
    const r = await this.crearCuenta.ejecutar(
      {
        copropiedadId,
        usuario: alta.usuario,
        nombre: alta.nombre,
        telefono: alta.telefono,
        rol: 'residente',
        contrasenaInicial: alta.contrasenaInicial,
      },
      ctx.usuarioId,
    );
    if (!r.ok) return { ok: false, rechazo: r.error };
    await this.bitacora.anotar({
      copropiedadId,
      tipo: 'alta_de_cuenta',
      ocurridoEn: this.reloj.ahora(),
      usuarioId: r.valor.usuarioId,
      actorId: ctx.usuarioId,
    });
    return { ok: true, usuarioId: r.valor.usuarioId };
  }

  vehiculosDeResidentes(copropiedadId: string): Promise<readonly VehiculoPropioGuardado[]> {
    return this.vehiculos.registradosPorResidentes(copropiedadId);
  }
}

@Injectable()
export class OcupantesDelSuperadmin {
  constructor(
    @Inject(OCUPANTES_DE_LA_VIVIENDA) private readonly ocupantes: OcupantesDeLaVivienda,
    @Inject(CODIGOS_DE_OCUPANTE) private readonly codigos: CodigosDeOcupante,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async ver(copropiedadId: string, viviendaId: string): Promise<readonly PlazaVisible[]> {
    return plazasVisibles(
      this.codigos,
      copropiedadId,
      await this.ocupantes.plazas(copropiedadId, viviendaId),
    );
  }

  async anadir(
    ctx: ContextoTenant,
    copropiedadId: string,
    viviendaId: string,
    cantidad: number,
    motivo: string,
  ): Promise<readonly PlazaVisible[] | null> {
    const hechas = await this.ocupantes.anadir(copropiedadId, viviendaId, cantidad, ctx.usuarioId);
    if (hechas === null) return null;
    await this.bitacora.anotar({
      copropiedadId,
      tipo: 'plaza_anadida',
      ocurridoEn: this.reloj.ahora(),
      usuarioId: null,
      actorId: ctx.usuarioId,
      viviendaId,
      detalle: `${String(cantidad)} plaza(s) · ${motivo}`.slice(0, 500),
    });
    return this.ver(copropiedadId, viviendaId);
  }

  async retirar(
    ctx: ContextoTenant,
    copropiedadId: string,
    viviendaId: string,
    plazaId: string,
    motivo: string,
  ): Promise<boolean> {
    const hecho = await this.ocupantes.retirar(
      copropiedadId,
      viviendaId,
      plazaId,
      motivo,
      ctx.usuarioId,
    );
    if (hecho) {
      await this.bitacora.anotar({
        copropiedadId,
        tipo: 'plaza_retirada',
        ocurridoEn: this.reloj.ahora(),
        usuarioId: null,
        actorId: ctx.usuarioId,
        viviendaId,
        detalle: motivo.slice(0, 500),
      });
    }
    return hecho;
  }
}
