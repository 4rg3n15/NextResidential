import { Inject, Injectable } from '@nestjs/common';
import {
  MENSAJE_CUENTA_DE_MENOR,
  RELOJ,
  TIPOS_DE_DOCUMENTO_DE_ADULTO,
  edadEn,
  explicacionDeVinculacion,
  puedeTenerCuenta,
  validarPerfil,
} from '@ncr/domain-core';
import type { CampoRechazado, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { AVISO_SIN_VIVIENDA } from './alta';
import { ALTA_DEL_RESIDENTE } from './puertos-hogar';
import type { AltaDelResidente } from './puertos-hogar';
import { PRIMER_INGRESO } from './puertos-del-primer-ingreso';
import type { PrimerIngreso } from './puertos-del-primer-ingreso';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PRIMER INGRESO · RONDA 15-W (D3)
 *
 * La cuenta ya trae su vivienda; el primer ingreso NO pide vivienda ni código.
 * Pide nombres y apellidos, documento de ADULTO (cédula, cédula de extranjería
 * o pasaporte), teléfono y fecha de nacimiento, y hace a la persona residente
 * de esa vivienda —titular si la cuenta la dio la administración (D1)—.
 *
 * La fecha es obligatoria aquí: al titular, cuya cuenta no pasó por «Crear
 * cuenta», es donde se le pide (D3). Si resulta MENOR de edad, la cuenta queda
 * BLOQUEADA en ese momento (D-W2) y no se escribe nada de la persona. El correo
 * es opcional: la app lleva el que se escribió en «Crear cuenta» (S-15W-04).
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface EntradaDePrimerIngreso {
  readonly nombres: string;
  readonly apellidos: string;
  readonly tipoDocumento: string;
  readonly numeroDocumento: string;
  readonly telefono: string;
  readonly fechaNacimiento: string;
  readonly correo: string | null;
}

export type MotivoDelPrimerIngreso =
  | 'SIN_VIVIENDA'
  | 'YA_VINCULADA'
  | 'DOCUMENTO_EN_USO'
  | 'CUENTA_BLOQUEADA_POR_EDAD';

export type ResultadoDePrimerIngreso =
  | { readonly completado: true; readonly debeDeclararOcupantes: boolean }
  | {
      readonly completado: false;
      readonly motivo: MotivoDelPrimerIngreso;
      readonly explicacion: string;
    }
  | { readonly completado: false; readonly campos: readonly CampoRechazado[] };

const EXPLICACIONES: Record<MotivoDelPrimerIngreso, string> = {
  SIN_VIVIENDA: AVISO_SIN_VIVIENDA,
  YA_VINCULADA: explicacionDeVinculacion('YA_VINCULADA'),
  DOCUMENTO_EN_USO: explicacionDeVinculacion('DOCUMENTO_EN_USO'),
  CUENTA_BLOQUEADA_POR_EDAD: MENSAJE_CUENTA_DE_MENOR,
};

const no = (motivo: MotivoDelPrimerIngreso): ResultadoDePrimerIngreso => ({
  completado: false,
  motivo,
  explicacion: EXPLICACIONES[motivo],
});

@Injectable()
export class CompletarMiPrimerIngreso {
  constructor(
    @Inject(ALTA_DEL_RESIDENTE) private readonly alta: AltaDelResidente,
    @Inject(PRIMER_INGRESO) private readonly primerIngreso: PrimerIngreso,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    entrada: EntradaDePrimerIngreso,
  ): Promise<ResultadoDePrimerIngreso> {
    const estado = await this.alta.estado(copropiedadId, ctx.usuarioId);
    if (estado.viviendaId !== null) return no('YA_VINCULADA');
    const asignada = estado.viviendaAsignada;
    if (asignada === null) return no('SIN_VIVIENDA');

    const ahora = this.reloj.ahora();
    const perfil = validarPerfil(entrada, ahora);
    // Un campo, un motivo: el del documento de ADULTO sustituye al genérico
    // del perfil («desconocido»), que también acepta «otro».
    const campos: CampoRechazado[] = perfil.ok
      ? []
      : perfil.error.filter((c) => c.campo !== 'tipoDocumento');
    if (!(TIPOS_DE_DOCUMENTO_DE_ADULTO as readonly string[]).includes(entrada.tipoDocumento)) {
      campos.push({ campo: 'tipoDocumento', motivo: 'Cédula, cédula de extranjería o pasaporte' });
    }
    if (campos.length > 0 || !perfil.ok) return { completado: false, campos };

    const edad = edadEn(entrada.fechaNacimiento, ahora);
    if (edad === null) {
      return {
        completado: false,
        campos: [{ campo: 'fechaNacimiento', motivo: 'Fecha no válida' }],
      };
    }
    if (!puedeTenerCuenta(edad)) {
      await this.primerIngreso.bloquearPorEdad(copropiedadId, ctx.usuarioId, ahora);
      return no('CUENTA_BLOQUEADA_POR_EDAD');
    }

    const escrito = await this.primerIngreso.completar({
      copropiedadId,
      usuarioId: ctx.usuarioId,
      viviendaId: asignada.viviendaId,
      comoTitular: asignada.comoTitular,
      perfil: perfil.valor,
      ahora,
    });
    if (!escrito.ok) return no(escrito.motivo);
    const despues = await this.alta.estado(copropiedadId, ctx.usuarioId);
    return { completado: true, debeDeclararOcupantes: despues.debeDeclararOcupantes };
  }
}
