import { describe, expect, it, vi } from 'vitest';
import { MENSAJE_CUENTA_DE_MENOR } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { AVISO_SIN_VIVIENDA } from './alta';
import { CompletarMiPrimerIngreso } from './primer-ingreso';
import type { EntradaDePrimerIngreso } from './primer-ingreso';
import type { PrimerIngreso, PrimerIngresoEscrito } from './puertos-del-primer-ingreso';
import type { AltaDelResidente, EstadoDeAltaGuardado } from './puertos-hogar';

/**
 * 15-W · D3 · el primer ingreso SIN base: la cuenta ya trae su vivienda, el
 * documento es de adulto y la fecha decide la edad con el día de Bogotá. Un
 * menor deja la cuenta BLOQUEADA y no escribe nada de la persona.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-06T15:00:00Z');
const ctx: ContextoTenant = {
  usuarioId: 'u-titular',
  rol: 'residente',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: false,
};
const como = <T>(o: object): T => o as unknown as T;
const ENTRADA: EntradaDePrimerIngreso = {
  nombres: 'Ana María',
  apellidos: 'Pérez',
  tipoDocumento: 'cedula',
  numeroDocumento: '52123456',
  telefono: '+573001234567',
  fechaNacimiento: '1990-05-17',
  correo: 'ana@correo.invalid',
};
const ASIGNADA: EstadoDeAltaGuardado = {
  viviendaId: null,
  debeDeclararOcupantes: false,
  viviendaAsignada: { viviendaId: 'v-1', comoTitular: true },
  topeDePlazas: 4,
};

const montar = (antes: EstadoDeAltaGuardado = ASIGNADA, escrito?: PrimerIngresoEscrito) => {
  const estados = [antes, { ...antes, viviendaId: 'v-1', debeDeclararOcupantes: true }];
  const alta = { estado: vi.fn(async () => estados.shift() ?? antes) };
  const primer = {
    completar: vi.fn(
      async (): Promise<PrimerIngresoEscrito> => escrito ?? { ok: true, residenteId: 'r-1' },
    ),
    bloquearPorEdad: vi.fn(async () => undefined),
  };
  const caso = new CompletarMiPrimerIngreso(
    como<AltaDelResidente>(alta),
    como<PrimerIngreso>(primer),
    {
      ahora: () => AHORA,
    },
  );
  return { caso, primer };
};

describe('CompletarMiPrimerIngreso (15-W, D3)', () => {
  it('el titular completa su persona en SU vivienda y debe declarar ocupantes', async () => {
    const { caso, primer } = montar();
    expect(await caso.ejecutar(ctx, COP, ENTRADA)).toEqual({
      completado: true,
      debeDeclararOcupantes: true,
    });
    expect(primer.completar).toHaveBeenCalledWith(
      expect.objectContaining({
        viviendaId: 'v-1',
        comoTitular: true,
        usuarioId: 'u-titular',
        ahora: AHORA,
      }),
    );
  });

  it('ya vinculada, o sin vivienda asignada: su motivo, sin escribir nada', async () => {
    const vinculada = montar({ ...ASIGNADA, viviendaId: 'v-1' });
    expect(await vinculada.caso.ejecutar(ctx, COP, ENTRADA)).toMatchObject({
      motivo: 'YA_VINCULADA',
    });
    const sinVivienda = montar({ ...ASIGNADA, viviendaAsignada: null });
    expect(await sinVivienda.caso.ejecutar(ctx, COP, ENTRADA)).toEqual({
      completado: false,
      motivo: 'SIN_VIVIENDA',
      explicacion: AVISO_SIN_VIVIENDA,
    });
    expect(sinVivienda.primer.completar).not.toHaveBeenCalled();
  });

  it('un documento que no es de adulto, o un perfil mal escrito: los campos, todos a la vez', async () => {
    const { caso, primer } = montar();
    const r = await caso.ejecutar(ctx, COP, {
      ...ENTRADA,
      tipoDocumento: 'tarjeta_identidad',
      nombres: '',
    });
    expect(r.completado).toBe(false);
    // Un campo, un motivo: el del documento de adulto, no también el genérico.
    expect('campos' in r && r.campos).toEqual([
      expect.objectContaining({ campo: 'nombres' }),
      { campo: 'tipoDocumento', motivo: 'Cédula, cédula de extranjería o pasaporte' },
    ]);
    // «otro» vale para el perfil de siempre, no para el primer ingreso de un adulto.
    const otro = await montar().caso.ejecutar(ctx, COP, { ...ENTRADA, tipoDocumento: 'otro' });
    expect('campos' in otro && otro.campos.map((c) => c.campo)).toEqual(['tipoDocumento']);
    const fecha = await montar().caso.ejecutar(ctx, COP, {
      ...ENTRADA,
      fechaNacimiento: '1990-02-30',
    });
    expect('campos' in fecha && fecha.campos.map((c) => c.campo)).toContain('fechaNacimiento');
    expect(primer.completar).not.toHaveBeenCalled();
  });

  it('un MENOR: la cuenta queda bloqueada y nada de la persona se escribe', async () => {
    const { caso, primer } = montar();
    // Cumple 18 mañana en Bogotá.
    const r = await caso.ejecutar(ctx, COP, { ...ENTRADA, fechaNacimiento: '2008-10-07' });
    expect(r).toEqual({
      completado: false,
      motivo: 'CUENTA_BLOQUEADA_POR_EDAD',
      explicacion: MENSAJE_CUENTA_DE_MENOR,
    });
    expect(primer.bloquearPorEdad).toHaveBeenCalledWith(COP, 'u-titular', AHORA);
    expect(primer.completar).not.toHaveBeenCalled();
  });

  it('el documento de otra persona o la asignación que desapareció: el motivo de la base', async () => {
    for (const motivo of ['DOCUMENTO_EN_USO', 'SIN_VIVIENDA'] as const) {
      const { caso } = montar(ASIGNADA, { ok: false, motivo });
      expect(await caso.ejecutar(ctx, COP, ENTRADA)).toMatchObject({ completado: false, motivo });
    }
  });
});
