import { Inject, Injectable } from '@nestjs/common';
import { RELOJ } from '@ncr/domain-core';
import type { Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { CrearCuentaPorUsuario, RechazoDeAlta } from '../../cuentas';
import type { SuprimirYRetirarYa } from '../../biometria';
import { plazasVisibles } from './ocupantes';
import type { PlazaVisible } from './ocupantes';
import { TITULARIDAD_DE_VIVIENDAS } from './puertos-de-titularidad';
import type { TitularidadDeViviendas } from './puertos-de-titularidad';
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
  /** 15-W (D1) · la vivienda de la que esta cuenta será el TITULAR. */
  readonly viviendaId: string;
}

/** 15-W (D1) · por qué no se crea: 404 (vivienda), 409 (titular) o lo de `crearCuenta`. */
export type RechazoDeAltaDeTitular =
  | RechazoDeAlta
  | { readonly motivo: 'VIVIENDA_NO_ENCONTRADA' }
  | { readonly motivo: 'VIVIENDA_CON_TITULAR' };

@Injectable()
export class CuentasDeResidentesDelSuperadmin {
  constructor(
    private readonly crearCuenta: CrearCuentaPorUsuario,
    @Inject(CUENTAS_DE_RESIDENTES) private readonly cuentas: CuentasDeResidentes,
    @Inject(VEHICULOS_PROPIOS) private readonly vehiculos: VehiculosPropios,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(TITULARIDAD_DE_VIVIENDAS) private readonly titularidad: TitularidadDeViviendas,
    /**
     * C9 (15-M) · sin él, la baja deja las plantillas vivas hasta que venzan.
     * 15-X · y las saca de los equipos en el acto, no a las 6 h del barrido.
     */
    private readonly suprimirPlantillas: Pick<SuprimirYRetirarYa, 'deTitular'> | null = null,
  ) {}

  listar(copropiedadId: string): Promise<readonly CuentaDeResidente[]> {
    return this.cuentas.listar(copropiedadId);
  }

  /**
   * C9 (15-M) · BAJA CON MOTIVO (RN-19, CA-02). Nada se borra: la cuenta, el
   * rol y los vínculos quedan inactivos y auditados; sus plantillas
   * biométricas se suprimen (RN-11); las autorizaciones vigentes se conservan
   * y no se crean nuevas (RN-13). `null` = no hay residente activo con ese id.
   */
  async baja(
    ctx: ContextoTenant,
    copropiedadId: string,
    usuarioId: string,
    motivo: string,
  ): Promise<{ readonly plantillasSuprimidas: number } | null> {
    const hecha = await this.cuentas.darDeBaja(copropiedadId, usuarioId, motivo, ctx.usuarioId);
    if (hecha === null) return null;
    let plantillasSuprimidas = 0;
    if (hecha.personaId !== null && this.suprimirPlantillas !== null) {
      const r = await this.suprimirPlantillas.deTitular(ctx, copropiedadId, hecha.personaId);
      plantillasSuprimidas = r.suprimidas;
    }
    return { plantillasSuprimidas };
  }

  /**
   * 15-W (D1, D-W9) · la PRIMERA cuenta de una vivienda, ya asignada a ella: es
   * su titular. La vivienda tiene que existir aquí, estar activa y no tener
   * titular; la titularidad se escribe en la MISMA transacción que la cuenta, y
   * si otra alta simultánea la ganó, la cuenta del proveedor se elimina.
   */
  async alta(
    ctx: ContextoTenant,
    copropiedadId: string,
    alta: AltaDeResidente,
  ): Promise<
    | { readonly ok: true; readonly usuarioId: string }
    | { readonly ok: false; readonly rechazo: RechazoDeAltaDeTitular }
  > {
    const vivienda = await this.titularidad.viviendaParaTitular(copropiedadId, alta.viviendaId);
    if (vivienda === 'INEXISTENTE' || vivienda === 'INACTIVA') {
      return { ok: false, rechazo: { motivo: 'VIVIENDA_NO_ENCONTRADA' } };
    }
    if (vivienda === 'CON_TITULAR')
      return { ok: false, rechazo: { motivo: 'VIVIENDA_CON_TITULAR' } };
    const r = await this.crearCuenta.ejecutarConVinculo(
      {
        copropiedadId,
        usuario: alta.usuario,
        nombre: alta.nombre,
        telefono: alta.telefono,
        rol: 'residente',
        contrasenaInicial: alta.contrasenaInicial,
        origen: 'administracion',
        debeCambiarContrasena: true,
      },
      this.titularidad.escrituraDelTitular(copropiedadId, alta.viviendaId, ctx.usuarioId),
      ctx.usuarioId,
    );
    if (!r.ok) {
      // VINCULO: otra alta simultánea se llevó la titularidad (la base decidió).
      return {
        ok: false,
        rechazo: r.error.motivo === 'VINCULO' ? { motivo: 'VIVIENDA_CON_TITULAR' } : r.error,
      };
    }
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
    // Sólo el prefijo: quien pregunta no es residente, y no importa si es el titular.
    const { codigoCorto } = await this.ocupantes.declaracion(
      copropiedadId,
      viviendaId,
      ACTOR_INGESTA,
    );
    return plazasVisibles(
      this.codigos,
      copropiedadId,
      await this.ocupantes.plazas(copropiedadId, viviendaId),
      codigoCorto,
    );
  }

  async anadir(
    ctx: ContextoTenant,
    copropiedadId: string,
    viviendaId: string,
    cantidad: number,
    motivo: string,
  ): Promise<readonly PlazaVisible[] | null | 'COTA_DE_LA_PLATAFORMA'> {
    const hechas = await this.ocupantes.anadir(copropiedadId, viviendaId, cantidad, ctx.usuarioId);
    if (hechas === null || hechas === 'COTA_DE_LA_PLATAFORMA') return hechas;
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
