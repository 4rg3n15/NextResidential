import { describe, expect, it, vi } from 'vitest';
import { explicacionDeVinculacion } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { AVISO_SIN_VIVIENDA, VerMiAlta, VincularMiVivienda } from './alta';
import type { EntradaDeAlta } from './alta';
import type {
  AltaDelResidente,
  BitacoraDeResidentes,
  CodigosDeOcupante,
  EstadoDeAltaGuardado,
  HechoDeResidente,
  OcupantesDeLaVivienda,
  PlazaDeOcupante,
  VinculoEscrito,
} from './puertos-hogar';

/**
 * 15-W · D3 y 3.5 · el estado del alta y el CAMBIO de vivienda SIN base. La
 * cuenta ya trae su vivienda; cambiarla exige el código de una plaza de la de
 * destino, con o sin el prefijo del conjunto —uno ajeno es un código
 * incorrecto—, los fallos se cuentan, y el titular no se muda (P-38).
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-06T15:00:00Z');
const ctx: ContextoTenant = {
  usuarioId: 'u-residente',
  rol: 'residente',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: false,
};
const como = <T>(o: object): T => o as unknown as T;
const VOCABULARIO = {
  copropiedadNombre: 'Urbanización Mira',
  tipo: 'casas',
  etiquetaVivienda: 'Casa',
  etiquetaAgrupacion: 'Manzana',
  codigoCorto: 'MIRA',
};
const VINCULADO: EstadoDeAltaGuardado = {
  viviendaId: 'v-origen',
  debeDeclararOcupantes: false,
  viviendaAsignada: null,
  topeDePlazas: 4,
};
const PLAZA: PlazaDeOcupante = {
  id: 'p-3',
  numero: 3,
  generacion: 2,
  usuarioId: null,
  ocupante: null,
};
const ENTRADA: EntradaDeAlta = {
  perfil: {
    nombres: 'Ana',
    apellidos: 'Pérez',
    fechaNacimiento: '1990-05-17',
    tipoDocumento: 'cedula',
    numeroDocumento: '52123456',
    correo: 'ana@correo.invalid',
    telefono: '+573001234567',
  },
  identificador: '42',
  agrupacion: null,
  codigo: 'mira-k7pq-2xwz',
};

const montar = (
  o: { estado?: EstadoDeAltaGuardado; titular?: boolean; intentos?: number } = {},
) => {
  const hechos: HechoDeResidente[] = [];
  const alta = {
    vocabulario: vi.fn(async () => VOCABULARIO),
    estado: vi.fn(async () => o.estado ?? VINCULADO),
    buscarVivienda: vi.fn(async () => [{ id: 'v-destino', activa: true, tieneCuenta: true }]),
    codigosIncorrectosDesde: vi.fn(async () => o.intentos ?? 0),
    plazasLibres: vi.fn(async () => [PLAZA]),
    vincular: vi.fn(async (): Promise<VinculoEscrito> => ({ ok: true, residenteId: 'r-9' })),
  };
  const codigos = {
    plazaDelCodigo: vi.fn((_c: string, plazas: readonly PlazaDeOcupante[], codigo: string) =>
      codigo === 'K7PQ2XWZ' ? (plazas[0] ?? null) : null,
    ),
    codigoDe: vi.fn(() => 'K7PQ2XWZ'),
  };
  const ocupantes = {
    declaracion: vi.fn(async () => ({
      esPrimerResidente: o.titular ?? false,
      declarada: true,
      tope: 4,
      codigoCorto: 'MIRA',
    })),
  };
  const caso = new VincularMiVivienda(
    como<AltaDelResidente>(alta),
    como<CodigosDeOcupante>(codigos),
    como<BitacoraDeResidentes>({ anotar: async (h: HechoDeResidente) => void hechos.push(h) }),
    { ahora: () => AHORA },
    como<OcupantesDeLaVivienda>(ocupantes),
  );
  return { caso, alta, hechos, ver: new VerMiAlta(como<AltaDelResidente>(alta)) };
};

describe('VerMiAlta (15-W, D3)', () => {
  it('con la vivienda asignada y sin vincular: falta el primer ingreso, sin aviso', async () => {
    const { ver } = montar({
      estado: {
        viviendaId: null,
        debeDeclararOcupantes: false,
        viviendaAsignada: { viviendaId: 'v-1', comoTitular: true },
        topeDePlazas: 6,
      },
    });
    expect(await ver.ejecutar(ctx, COP)).toMatchObject({
      completa: false,
      viviendaVinculada: false,
      viviendaAsignada: true,
      pideAgrupacion: false,
      aviso: null,
    });
  });

  it('una cuenta antigua sin vivienda: «la administración debe asignarle su vivienda»', async () => {
    const { ver } = montar({
      estado: {
        viviendaId: null,
        debeDeclararOcupantes: false,
        viviendaAsignada: null,
        topeDePlazas: null,
      },
    });
    expect(await ver.ejecutar(ctx, COP)).toMatchObject({
      viviendaAsignada: false,
      aviso: AVISO_SIN_VIVIENDA,
    });
  });

  it('una copropiedad que no existe para él: null', async () => {
    const { ver, alta } = montar();
    alta.vocabulario.mockResolvedValueOnce(null as unknown as typeof VOCABULARIO);
    expect(await ver.ejecutar(ctx, COP)).toBeNull();
  });
});

describe('VincularMiVivienda · el cambio de vivienda (15-W, 3.5)', () => {
  it('con el código de una plaza de la de destino, con prefijo y en minúsculas: se muda', async () => {
    const { caso, alta } = montar();
    expect(await caso.ejecutar(ctx, COP, ENTRADA)).toEqual({
      vinculada: true,
      debeDeclararOcupantes: false,
    });
    expect(alta.vincular).toHaveBeenCalledWith(
      expect.objectContaining({
        viviendaId: 'v-destino',
        modo: { tipo: 'plaza', plazaId: 'p-3', generacion: 2 },
      }),
    );
  });

  it('sin prefijo también vale; con el de OTRO conjunto es un código incorrecto, y cuenta', async () => {
    const sinPrefijo = montar();
    expect(
      (await sinPrefijo.caso.ejecutar(ctx, COP, { ...ENTRADA, codigo: 'K7PQ-2XWZ' })).vinculada,
    ).toBe(true);
    const ajeno = montar();
    const r = await ajeno.caso.ejecutar(ctx, COP, { ...ENTRADA, codigo: 'ROBLE-K7PQ-2XWZ' });
    expect(r).toEqual({
      vinculada: false,
      motivo: 'CODIGO_INCORRECTO',
      explicacion: explicacionDeVinculacion('CODIGO_INCORRECTO'),
    });
    expect(ajeno.hechos).toEqual([
      expect.objectContaining({ tipo: 'codigo_incorrecto', viviendaId: 'v-destino' }),
    ]);
    expect(ajeno.alta.vincular).not.toHaveBeenCalled();
  });

  it('el titular no se muda desde la app (P-38): ni se mira el código', async () => {
    const { caso, alta, hechos } = montar({ titular: true });
    expect(await caso.ejecutar(ctx, COP, ENTRADA)).toMatchObject({ motivo: 'TITULAR_NO_SE_MUDA' });
    expect(alta.plazasLibres).not.toHaveBeenCalled();
    expect(hechos).toEqual([
      expect.objectContaining({ tipo: 'vinculacion_rechazada', detalle: 'TITULAR_NO_SE_MUDA' }),
    ]);
  });

  it('cinco fallos en la ventana bloquean, con su propia fila en la bitácora', async () => {
    const { caso, hechos } = montar({ intentos: 5 });
    expect(await caso.ejecutar(ctx, COP, ENTRADA)).toMatchObject({ motivo: 'DEMASIADOS_INTENTOS' });
    expect(hechos).toEqual([expect.objectContaining({ tipo: 'vinculacion_bloqueada' })]);
  });

  it('sin vínculo previo, a la misma vivienda o con un número ambiguo: su motivo', async () => {
    const sinVinculo = montar({ estado: { ...VINCULADO, viviendaId: null } });
    expect(await sinVinculo.caso.ejecutar(ctx, COP, ENTRADA)).toMatchObject({
      motivo: 'VIVIENDA_INEXISTENTE',
    });
    const misma = montar({ estado: { ...VINCULADO, viviendaId: 'v-destino' } });
    expect(await misma.caso.ejecutar(ctx, COP, ENTRADA)).toMatchObject({ motivo: 'YA_VINCULADA' });
    const dos = montar();
    dos.alta.buscarVivienda.mockResolvedValueOnce([
      { id: 'v-a', activa: true, tieneCuenta: true },
      { id: 'v-b', activa: true, tieneCuenta: true },
    ]);
    expect(await dos.caso.ejecutar(ctx, COP, ENTRADA)).toMatchObject({
      motivo: 'AGRUPACION_REQUERIDA',
    });
    const ninguna = montar();
    ninguna.alta.buscarVivienda.mockResolvedValueOnce([]);
    expect(await ninguna.caso.ejecutar(ctx, COP, ENTRADA)).toMatchObject({
      motivo: 'VIVIENDA_INEXISTENTE',
    });
  });

  it('un perfil mal escrito: los campos; y lo que diga la base al escribir', async () => {
    const { caso } = montar();
    const r = await caso.ejecutar(ctx, COP, {
      ...ENTRADA,
      perfil: { ...ENTRADA.perfil, nombres: '' },
    });
    expect('campos' in r && r.campos.map((c) => c.campo)).toEqual(['nombres']);
    for (const motivo of ['CODIGO_INCORRECTO', 'DOCUMENTO_EN_USO'] as const) {
      const m = montar();
      m.alta.vincular.mockResolvedValueOnce({ ok: false, motivo });
      expect(await m.caso.ejecutar(ctx, COP, ENTRADA), motivo).toMatchObject({
        vinculada: false,
        motivo,
      });
    }
  });
});
