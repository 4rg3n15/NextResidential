import { describe, expect, it, vi } from 'vitest';
import { exito } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import type { HistorialDeVehiculo, ResultadoEdicionVehiculo } from '../../padron';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import type { EdicionDeVehiculosPropios } from './puertos-de-vehiculos-propios';
import type { BitacoraDeResidentes, HechoDeResidente, VehiculosPropios } from './puertos-hogar';
import {
  EditarYEliminarMiVehiculo,
  MENSAJE_PLACA_CON_HISTORIAL,
} from './vehiculos-propios-edicion';
import type { CambiosDeVehiculoPropio } from './vehiculos-propios-edicion';

/**
 * 15-W · D5 · editar y eliminar un vehículo propio SIN base: la placa sólo
 * cambia sin historial y pasa por el objeto de valor; los ocupantes son de SU
 * vivienda; sin historial se borra, con él se da de baja. Contra PostgreSQL,
 * con el índice único y el disparador del borrado: `vehiculos-propios-pg`.
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
const CAMBIOS: CambiosDeVehiculoPropio = { color: 'Azul', modelo: 'Mazda 2' };

const montar = (
  historial: HistorialDeVehiculo | null = { placa: 'ABC123', eventos: 0, autorizaciones: 0 },
) => {
  const hechos: HechoDeResidente[] = [];
  const repo = {
    historialDeVehiculo: vi.fn(async () => historial),
    editarVehiculo: vi.fn(
      async (_e: object): Promise<ResultadoEdicionVehiculo> => ({ tipo: 'editado' }),
    ),
    borrarVehiculoDefinitivamente: vi.fn(
      async (): Promise<{ borrado: boolean; motivo?: string }> => ({
        borrado: true,
      }),
    ),
  };
  const edicion = { deLaVivienda: vi.fn(() => repo), reemplazarOcupantes: vi.fn(async () => true) };
  const vehiculos = {
    ocupantes: vi.fn(async () => ['r-1', 'r-2']),
    desactivar: vi.fn(async () => true),
  };
  const resolver = {
    ejecutar: vi.fn(
      async (): Promise<Resultado<object, ErrorDominio>> =>
        exito({ ambito: { copropiedadId: COP, viviendaId: 'v-1' }, vinculo: {} }),
    ),
  };
  const caso = new EditarYEliminarMiVehiculo(
    como<ResolverMiAmbito>(resolver),
    como<EdicionDeVehiculosPropios>(edicion),
    como<VehiculosPropios>(vehiculos),
    como<BitacoraDeResidentes>({ anotar: async (h: HechoDeResidente) => void hechos.push(h) }),
    { ahora: () => AHORA },
  );
  return { caso, repo, edicion, vehiculos, hechos };
};

const estado = (r: Awaited<ReturnType<EditarYEliminarMiVehiculo['editar']>>) =>
  r.ok && !r.valor.hecho ? r.valor.estado : r.ok ? 'hecho' : r.error.codigo;

describe('EditarYEliminarMiVehiculo · editar (15-W, D5)', () => {
  it('sin historial cambia la placa —normalizada— y los ocupantes, y lo anota', async () => {
    const { caso, repo, edicion, hechos } = montar();
    const r = await caso.editar(ctx, COP, 've-1', {
      ...CAMBIOS,
      placa: ' xyz 789 ',
      ocupantes: ['r-2'],
    });
    expect(r).toEqual({ ok: true, valor: { hecho: true } });
    expect(repo.editarVehiculo).toHaveBeenCalledWith(
      expect.objectContaining({
        placa: expect.objectContaining({ valor: 'XYZ789' }),
        color: 'Azul',
      }),
    );
    expect(edicion.reemplazarOcupantes).toHaveBeenCalledWith(
      { copropiedadId: COP, viviendaId: 'v-1' },
      've-1',
      ['r-2'],
      'u-residente',
    );
    expect(hechos).toEqual([
      expect.objectContaining({ tipo: 'vehiculo_propio_editado', vehiculoId: 've-1' }),
    ]);
  });

  it('la misma placa no es un cambio de placa: con historial también se edita el resto', async () => {
    const { caso, repo } = montar({ placa: 'ABC123', eventos: 3, autorizaciones: 1 });
    expect(await caso.editar(ctx, COP, 've-1', { ...CAMBIOS, placa: 'abc-123' })).toEqual({
      ok: true,
      valor: { hecho: true },
    });
    expect(repo.editarVehiculo.mock.calls[0]?.[0]).not.toHaveProperty('placa');
  });

  it('con historial, una placa NUEVA es otro vehículo: 409 y no se toca nada', async () => {
    const { caso, repo } = montar({ placa: 'ABC123', eventos: 1, autorizaciones: 0 });
    const r = await caso.editar(ctx, COP, 've-1', { ...CAMBIOS, placa: 'XYZ789' });
    expect(r).toEqual({
      ok: true,
      valor: { hecho: false, estado: 409, explicacion: MENSAJE_PLACA_CON_HISTORIAL },
    });
    expect(repo.editarVehiculo).not.toHaveBeenCalled();
  });

  it('el de otra vivienda no existe (404); una placa imposible o ocupantes ajenos, 400', async () => {
    expect(estado(await montar(null).caso.editar(ctx, COP, 've-9', CAMBIOS))).toBe(404);
    const { caso, repo } = montar();
    expect(estado(await caso.editar(ctx, COP, 've-1', { ...CAMBIOS, placa: '!!' }))).toBe(400);
    expect(
      estado(await caso.editar(ctx, COP, 've-1', { ...CAMBIOS, ocupantes: ['r-vecino'] })),
    ).toBe(400);
    expect(estado(await caso.editar(ctx, COP, 've-1', { ...CAMBIOS, ocupantes: [] }))).toBe(400);
    expect(repo.editarVehiculo).not.toHaveBeenCalled();
  });

  it('lo que diga la base: desaparecido entre medias (404) o placa duplicada (409)', async () => {
    for (const [tipo, esperado] of [
      ['no_encontrado', 404],
      ['placa_activa_duplicada', 409],
    ] as const) {
      const { caso, repo, hechos } = montar();
      repo.editarVehiculo.mockResolvedValueOnce({ tipo });
      expect(
        estado(await caso.editar(ctx, COP, 've-1', { ...CAMBIOS, placa: 'XYZ789' })),
        tipo,
      ).toBe(esperado);
      expect(hechos).toEqual([]);
    }
  });

  it('historial llegado entre la comprobación y el cambio: la base lo dice, 409 con su texto', async () => {
    const { caso, repo, hechos } = montar();
    repo.editarVehiculo.mockResolvedValueOnce({ tipo: 'placa_con_historial' });
    expect(await caso.editar(ctx, COP, 've-1', { ...CAMBIOS, placa: 'XYZ789' })).toEqual({
      ok: true,
      valor: { hecho: false, estado: 409, explicacion: MENSAJE_PLACA_CON_HISTORIAL },
    });
    expect(hechos).toEqual([]);
  });
});

describe('EditarYEliminarMiVehiculo · eliminar (15-W, D5)', () => {
  it('sin historial: borrado de verdad, y anotado con su placa', async () => {
    const { caso, vehiculos, hechos } = montar();
    expect(await caso.eliminar(ctx, COP, 've-1')).toEqual({ ok: true, valor: 'borrado' });
    expect(vehiculos.desactivar).not.toHaveBeenCalled();
    expect(hechos).toEqual([
      expect.objectContaining({ tipo: 'vehiculo_propio_borrado', detalle: 'placa ABC123' }),
    ]);
  });

  it('con historial: baja lógica (RN-19); si ya no era suyo, null (404)', async () => {
    const conHistorial = montar({ placa: 'ABC123', eventos: 2, autorizaciones: 0 });
    expect(await conHistorial.caso.eliminar(ctx, COP, 've-1')).toEqual({
      ok: true,
      valor: 'dado_de_baja',
    });
    expect(conHistorial.vehiculos.desactivar).toHaveBeenCalled();
    conHistorial.vehiculos.desactivar.mockResolvedValueOnce(false);
    expect(await conHistorial.caso.eliminar(ctx, COP, 've-1')).toEqual({ ok: true, valor: null });
    expect(await montar(null).caso.eliminar(ctx, COP, 've-9')).toEqual({ ok: true, valor: null });
  });
});
