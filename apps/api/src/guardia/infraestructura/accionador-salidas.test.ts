import { describe, expect, it, vi } from 'vitest';
import type { Bitacora, ControlDeBarrera } from '@ncr/domain-core';
import { ordenAceptada } from '@ncr/domain-core';
import { EquipoInalcanzable } from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';
import { AccionadorPorProveedor } from './accionador-por-proveedor';

/**
 * 15-P · P3/P5 · abrir UNA salida elegida. Quien no sabe elegir puerta NO abre
 * «la de siempre» en su lugar: abrir otra puerta que la elegida es peor que no
 * abrir.
 */
const bitacora = (): Bitacora => ({ registrar: vi.fn() });
const DISPOSITIVO = '90000000-0000-4000-8000-000000000004';

const proveedor = (extras: Partial<ProveedorDeEquipos> = {}): ProveedorDeEquipos =>
  ({
    abrir: vi.fn(async () => ({ aceptado: true, latenciaMs: 10 })),
    fijarBloqueo: vi.fn(async () => ordenAceptada(1)),
    ...extras,
  }) as unknown as ProveedorDeEquipos;

describe('AccionadorPorProveedor · salida elegida', () => {
  it('va a abrirSalida con la puerta y el actor; NO a abrir', async () => {
    const abrirSalida = vi.fn(async () => ({ aceptado: true, latenciaMs: 33 }));
    const p = proveedor({ abrirSalida });
    const r = await new AccionadorPorProveedor(p, 'simulado', bitacora(), null).accionar(
      DISPOSITIVO,
      true,
      'op-1',
      2,
    );
    expect(r).toMatchObject({ estado: 'aceptada', latenciaMs: 33 });
    expect(abrirSalida).toHaveBeenCalledWith(DISPOSITIVO, 2, 'op-1');
    expect(p.abrir).not.toHaveBeenCalled();
  });

  it('un proveedor sin abrirSalida rechaza con motivo y no abre la puerta de la ficha', async () => {
    const p = proveedor();
    const r = await new AccionadorPorProveedor(p, 'simulado', bitacora(), null).accionar(
      DISPOSITIVO,
      true,
      'op-1',
      2,
    );
    expect(r).toMatchObject({
      estado: 'rechazada',
      motivo: expect.stringMatching(/no abre una puerta concreta/),
    });
    expect(p.abrir).not.toHaveBeenCalled();
  });

  it('la barrera por entorno no elige puerta: rechaza sin tocar el control', async () => {
    const control: ControlDeBarrera = {
      accionar: vi.fn(async () => ordenAceptada(1)),
      fijarBloqueo: vi.fn(async () => ordenAceptada(1)),
    };
    const r = await new AccionadorPorProveedor(
      proveedor({ abrirSalida: vi.fn() }),
      'x',
      bitacora(),
      {
        control,
        dispositivoId: DISPOSITIVO,
      },
    ).accionar(DISPOSITIVO, true, 'op-1', 1);
    expect(r.estado).toBe('rechazada');
    expect(control.accionar).not.toHaveBeenCalled();
  });

  it('un error del proveedor baja como rechazada; uno no aceptado, como sin respuesta', async () => {
    const falla = proveedor({
      abrirSalida: vi.fn(async () => {
        throw new EquipoInalcanzable('red', 3000);
      }),
    });
    const r1 = await new AccionadorPorProveedor(falla, 'h', bitacora(), null).accionar(
      DISPOSITIVO,
      true,
      'op',
      1,
    );
    expect(r1.estado).toBe('rechazada');
    const mudo = proveedor({
      abrirSalida: vi.fn(async () => ({ aceptado: false, latenciaMs: 3000 })),
    });
    const r2 = await new AccionadorPorProveedor(mudo, 'h', bitacora(), null).accionar(
      DISPOSITIVO,
      true,
      'op',
      1,
    );
    expect(r2.estado).toBe('inalcanzable');
    const negado = proveedor({
      abrirSalida: vi.fn(async () => ({
        aceptado: false,
        latenciaMs: 9,
        rechazo: 'puerta bloqueada',
      })),
    });
    const r3 = await new AccionadorPorProveedor(negado, 'h', bitacora(), null).accionar(
      DISPOSITIVO,
      true,
      'op',
      1,
    );
    expect(r3).toMatchObject({ estado: 'rechazada', motivo: 'puerta bloqueada' });
  });
});
