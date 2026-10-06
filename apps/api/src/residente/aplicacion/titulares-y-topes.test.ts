import { describe, expect, it, vi } from 'vitest';
import { exito, fallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { CrearCuentaPorUsuario } from '../../cuentas';
import type { EscrituraDelVinculo } from '../../cuentas';
import type { TitularidadDeViviendas } from './puertos-de-titularidad';
import type { SuspensionDelRegistro } from './puertos-de-suspension';
import type {
  BitacoraDeResidentes,
  CuentasDeResidentes,
  HechoDeResidente,
  VehiculosPropios,
} from './puertos-hogar';
import { CuentasDeResidentesDelSuperadmin } from './supervision-de-residentes';
import { RegistroDeResidentesDelSuperadmin, TitularesDeViviendas } from './titulares-y-registro';
import { TopeDePlazasPorOmision } from './tope-de-la-copropiedad';
import type { TopeDePlazasDeLaCopropiedad } from './tope-de-la-copropiedad';

/**
 * 15-W · D1, D2, D4 bis · lo que hace el superadministrador, SIN base: el
 * titular nace con su vivienda (o no nace), la vivienda de una cuenta antigua,
 * la reanudación del registro y el tope por omisión. Contra PostgreSQL:
 * `titular-por-administracion-pg`, `autorregistro.e2e` y `plazas-del-titular-pg`.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-06T15:00:00Z');
const ctx: ContextoTenant = {
  usuarioId: 'u-super',
  rol: 'superadministrador',
  copropiedadId: null,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};
const como = <T>(o: object): T => o as unknown as T;
const ALTA = {
  usuario: 'titular.uno',
  contrasenaInicial: 'Inicial#2026',
  nombre: 'Titular Uno',
  telefono: null,
  viviendaId: 'v-1',
};
const ESCRITURA: EscrituraDelVinculo = { escribir: async () => true };

const montarAlta = (vivienda: 'LIBRE' | 'INEXISTENTE' | 'INACTIVA' | 'CON_TITULAR' = 'LIBRE') => {
  const hechos: HechoDeResidente[] = [];
  const crear = {
    ejecutarConVinculo: vi.fn(
      async (): Promise<
        | { ok: true; valor: { usuarioId: string; numeroDePortero: null } }
        | { ok: false; error: { motivo: 'VINCULO' | 'DUPLICADO' } }
      > => exito({ usuarioId: 'u-nuevo', numeroDePortero: null }),
    ),
  };
  const titularidad = {
    viviendaParaTitular: vi.fn(async () => vivienda),
    escrituraDelTitular: vi.fn(() => ESCRITURA),
  };
  const caso = new CuentasDeResidentesDelSuperadmin(
    como<CrearCuentaPorUsuario>(crear),
    como<CuentasDeResidentes>({}),
    como<VehiculosPropios>({}),
    como<BitacoraDeResidentes>({ anotar: async (h: HechoDeResidente) => void hechos.push(h) }),
    { ahora: () => AHORA },
    como<TitularidadDeViviendas>(titularidad),
  );
  return { caso, crear, titularidad, hechos };
};

describe('CuentasDeResidentesDelSuperadmin.alta · el titular nace con su vivienda (D1)', () => {
  it('libre: la cuenta, con cambio obligatorio y la titularidad en su transacción', async () => {
    const { caso, crear, titularidad, hechos } = montarAlta();
    expect(await caso.alta(ctx, COP, ALTA)).toEqual({ ok: true, usuarioId: 'u-nuevo' });
    expect(crear.ejecutarConVinculo).toHaveBeenCalledWith(
      expect.objectContaining({
        rol: 'residente',
        origen: 'administracion',
        debeCambiarContrasena: true,
      }),
      ESCRITURA,
      'u-super',
    );
    expect(titularidad.escrituraDelTitular).toHaveBeenCalledWith(COP, 'v-1', 'u-super');
    expect(hechos).toEqual([
      expect.objectContaining({ tipo: 'alta_de_cuenta', usuarioId: 'u-nuevo' }),
    ]);
  });

  it('inexistente o inactiva: no encontrada; con titular: su motivo; y nunca se crea la cuenta', async () => {
    for (const [vivienda, motivo] of [
      ['INEXISTENTE', 'VIVIENDA_NO_ENCONTRADA'],
      ['INACTIVA', 'VIVIENDA_NO_ENCONTRADA'],
      ['CON_TITULAR', 'VIVIENDA_CON_TITULAR'],
    ] as const) {
      const { caso, crear } = montarAlta(vivienda);
      expect(await caso.alta(ctx, COP, ALTA), vivienda).toEqual({ ok: false, rechazo: { motivo } });
      expect(crear.ejecutarConVinculo).not.toHaveBeenCalled();
    }
  });

  it('otra alta simultánea ganó la titularidad (VINCULO): con titular; los demás rechazos, tal cual', async () => {
    const carrera = montarAlta();
    carrera.crear.ejecutarConVinculo.mockResolvedValueOnce(fallo({ motivo: 'VINCULO' as const }));
    expect(await carrera.caso.alta(ctx, COP, ALTA)).toEqual({
      ok: false,
      rechazo: { motivo: 'VIVIENDA_CON_TITULAR' },
    });
    expect(carrera.hechos).toEqual([]);
    const repetido = montarAlta();
    repetido.crear.ejecutarConVinculo.mockResolvedValueOnce(
      fallo({ motivo: 'DUPLICADO' as const }),
    );
    expect(await repetido.caso.alta(ctx, COP, ALTA)).toEqual({
      ok: false,
      rechazo: { motivo: 'DUPLICADO' },
    });
  });
});

describe('Titulares, registro y tope por omisión (D1, D2, D4 bis)', () => {
  it('asignar vivienda pasa el motivo y el actor; la búsqueda, tal cual', async () => {
    const titularidad = {
      asignarVivienda: vi.fn(async () => 'ASIGNADA' as const),
      viviendasSinTitular: vi.fn(async () => [
        { id: 'v-1', identificador: '42', agrupacion: null },
      ]),
    };
    const caso = new TitularesDeViviendas(como<TitularidadDeViviendas>(titularidad));
    expect(
      await caso.asignarVivienda(ctx, COP, 'u-vieja', { viviendaId: 'v-1', motivo: 'Cuenta 15-I' }),
    ).toBe('ASIGNADA');
    expect(titularidad.asignarVivienda).toHaveBeenCalledWith(
      COP,
      'u-vieja',
      'v-1',
      'Cuenta 15-I',
      'u-super',
    );
    expect(await caso.viviendasSinTitular(COP, '42')).toHaveLength(1);
  });

  it('el estado y la reanudación del registro usan el reloj inyectado', async () => {
    const suspension = {
      estado: vi.fn(async () => ({ suspendido: true, hasta: AHORA, fallosRecientes: 30 })),
      reanudar: vi.fn(async () => true),
    };
    const caso = new RegistroDeResidentesDelSuperadmin(como<SuspensionDelRegistro>(suspension), {
      ahora: () => AHORA,
    });
    expect((await caso.estado(COP)).suspendido).toBe(true);
    expect(suspension.estado).toHaveBeenCalledWith(COP, AHORA);
    expect(await caso.reanudar(ctx, COP, 'Revisado con portería')).toBe(true);
    expect(suspension.reanudar).toHaveBeenCalledWith(
      COP,
      'Revisado con portería',
      'u-super',
      AHORA,
    );
  });

  it('el tope por omisión: cambiado y anotado; en una copropiedad que no existe, nada', async () => {
    const hechos: HechoDeResidente[] = [];
    const topes = { leer: vi.fn(async () => 4), cambiar: vi.fn(async () => true) };
    const caso = new TopeDePlazasPorOmision(
      como<TopeDePlazasDeLaCopropiedad>(topes),
      como<BitacoraDeResidentes>({ anotar: async (h: HechoDeResidente) => void hechos.push(h) }),
      { ahora: () => AHORA },
    );
    expect(await caso.ver(COP)).toBe(4);
    expect(await caso.cambiar(ctx, COP, 3, 'Copropiedad pequeña')).toBe(true);
    expect(hechos).toEqual([
      expect.objectContaining({
        tipo: 'tope_de_plazas_cambiado',
        detalle: 'tope por omisión 3 · Copropiedad pequeña',
      }),
    ]);
    topes.cambiar.mockResolvedValueOnce(false);
    expect(await caso.cambiar(ctx, COP, 5, 'No existe')).toBe(false);
    expect(hechos).toHaveLength(1);
  });
});
