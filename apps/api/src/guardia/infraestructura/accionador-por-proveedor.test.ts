import { describe, expect, it, vi } from 'vitest';
import type { Bitacora, ControlDeBarrera } from '@ncr/domain-core';
import { ordenAceptada } from '@ncr/domain-core';
import { CapacidadNoSoportada } from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';
import { AccionadorPorProveedor } from './accionador-por-proveedor';

/**
 * A1 · la apertura de CUALQUIER dispositivo pasa por el proveedor, y la única
 * excepción —la barrera por entorno— es declarada y anotada. Lo que se afirma
 * aquí es a QUIÉN se entrega cada orden y cómo se traduce lo que contesta:
 * ninguna rama puede convertir un error del proveedor en «aceptada».
 */
const bitacora = (): Bitacora & { lineas: unknown[] } => {
  const lineas: unknown[] = [];
  return {
    lineas,
    registrar: (nivel, mensaje, contexto) => {
      lineas.push({ nivel, mensaje, contexto });
    },
  };
};

const proveedorDoble = (extras: Partial<ProveedorDeEquipos> = {}): ProveedorDeEquipos =>
  ({
    abrir: vi.fn(async () => ({ aceptado: true, latenciaMs: 42 })),
    fijarBloqueo: vi.fn(async () => ordenAceptada(7)),
    ...extras,
  }) as unknown as ProveedorDeEquipos;

const DISPOSITIVO = '90000000-0000-4000-8000-000000000001';
const OTRO = '90000000-0000-4000-8000-000000000002';

describe('AccionadorPorProveedor · a quién va cada orden', () => {
  it('sin BARRERA_*: abrir va al proveedor con el ACTOR, y se traduce a «aceptada»', async () => {
    const proveedor = proveedorDoble();
    const b = bitacora();
    const accionador = new AccionadorPorProveedor(proveedor, 'simulado', b, null);
    const r = await accionador.accionar(DISPOSITIVO, true, 'operador-1');
    expect(r.estado).toBe('aceptada');
    expect(r.latenciaMs).toBe(42);
    expect(proveedor.abrir).toHaveBeenCalledWith(DISPOSITIVO, 'operador-1');
    expect(JSON.stringify(b.lineas)).toMatch(/proveedor simulado/);
  });

  it('el dispositivo de BARRERA_* va por el control del entorno, y el resto por el proveedor', async () => {
    const proveedor = proveedorDoble();
    const control: ControlDeBarrera = {
      accionar: vi.fn(async () => ordenAceptada(120)),
      fijarBloqueo: vi.fn(async () => ordenAceptada(90)),
    };
    const b = bitacora();
    const accionador = new AccionadorPorProveedor(proveedor, 'simulado', b, {
      control,
      dispositivoId: DISPOSITIVO,
    });

    const porEntorno = await accionador.accionar(DISPOSITIVO, true, 'operador-1');
    expect(porEntorno.latenciaMs).toBe(120);
    expect(control.accionar).toHaveBeenCalledWith(DISPOSITIVO, true);
    expect(proveedor.abrir).not.toHaveBeenCalled();

    await accionador.accionar(OTRO, true, 'operador-1');
    expect(proveedor.abrir).toHaveBeenCalledWith(OTRO, 'operador-1');

    // Y cada orden dice quién la atendió: son dos caminos, ninguno silencioso.
    const textos = b.lineas.map((l) => JSON.stringify(l));
    expect(textos[0]).toMatch(/barrera por entorno/);
    expect(textos[1]).toMatch(/proveedor simulado/);
  });

  it('el bloqueo (H-3) también resuelve por el proveedor', async () => {
    const proveedor = proveedorDoble();
    const accionador = new AccionadorPorProveedor(proveedor, 'simulado', bitacora(), null);
    const r = await accionador.fijarBloqueo(DISPOSITIVO, true);
    expect(r.estado).toBe('aceptada');
    expect(proveedor.fijarBloqueo).toHaveBeenCalledWith(DISPOSITIVO, true);
  });
});

describe('AccionadorPorProveedor · lo que contesta el proveedor no se maquilla', () => {
  it('«no aceptado» del puerto es INALCANZABLE: se resuelve llamando al técnico', async () => {
    const proveedor = proveedorDoble({
      abrir: vi.fn(async () => ({ aceptado: false, latenciaMs: 3000 })),
    });
    const accionador = new AccionadorPorProveedor(proveedor, 'x', bitacora(), null);
    const r = await accionador.accionar(DISPOSITIVO, true, 'op');
    expect(r.estado).toBe('inalcanzable');
    expect(r.latenciaMs).toBe(3000);
  });

  it('un error tipado del proveedor baja como RECHAZADA con su motivo, nunca sube como 500', async () => {
    const proveedor = proveedorDoble({
      abrir: vi.fn(async () => {
        throw new CapacidadNoSoportada(DISPOSITIVO, 'aperturaRemota', false);
      }),
    });
    const accionador = new AccionadorPorProveedor(proveedor, 'x', bitacora(), null);
    const r = await accionador.accionar(DISPOSITIVO, true, 'op');
    expect(r.estado).toBe('rechazada');
    expect(r.estado === 'rechazada' ? r.motivo : '').toMatch(/aperturaRemota/);
  });

  it('el cierre momentáneo no existe en el puerto del dominio: se dice, no se finge', async () => {
    const proveedor = proveedorDoble();
    const accionador = new AccionadorPorProveedor(proveedor, 'x', bitacora(), null);
    const r = await accionador.accionar(DISPOSITIVO, false, 'op');
    expect(r.estado).toBe('rechazada');
    expect(proveedor.abrir).not.toHaveBeenCalled();
  });

  it('nunca afirma que el paso se franqueó (H-1, H-2)', async () => {
    const b = bitacora();
    const accionador = new AccionadorPorProveedor(proveedorDoble(), 'x', b, null);
    await accionador.accionar(DISPOSITIVO, true, 'op');
    expect(JSON.stringify(b.lineas)).toMatch(/"pasoFranqueadoObservable":false/);
  });
});
