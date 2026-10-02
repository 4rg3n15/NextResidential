import { describe, expect, it, vi } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { SesionDeTunel, enlacesEnMemoria } from '@ncr/providers';
import type { EquiposDelConjunto } from './alerta-de-desconexion';
import { InventarioDelEdge } from './inventario-del-edge';

/**
 * 15-Q2 · D2 · al abrirse el túnel, el Edge recibe qué equipos SIGUEN de alta
 * en su copropiedad (aviso `equipos.vigentes`), y retira los demás. Si la base
 * no contesta, no se avisa nada —una lista vacía haría que el Edge lo retirara
 * todo— y lo dice la bitácora.
 */
const COP_A = '10000000-0000-4000-8000-000000000001';
const COP_B = '10000000-0000-4000-8000-000000000002';

const montar = (activos: EquiposDelConjunto['activos']) => {
  const lineas: { nivel: string; mensaje: string; contexto: unknown }[] = [];
  const bitacora: Bitacora = {
    registrar: (nivel, mensaje, contexto) => void lineas.push({ nivel, mensaje, contexto }),
  };
  const [a, b] = enlacesEnMemoria();
  const api = new SesionDeTunel(a, { paridad: 'par' });
  const edge = new SesionDeTunel(b, { paridad: 'impar' });
  const avisos: unknown[] = [];
  edge.atender('equipos.vigentes', (carga) => void avisos.push(carga));
  const inventario = new InventarioDelEdge({ activos }, bitacora);
  return { inventario, api, avisos, lineas };
};

const esperarEntrega = () => new Promise((r) => setTimeout(r, 10));

describe('InventarioDelEdge (15-Q2, D2)', () => {
  it('avisa `equipos.vigentes` con los equipos activos de SU copropiedad, no los de otra', async () => {
    const m = montar(async () => [
      { copropiedadId: COP_A, dispositivoId: 'cam-a' },
      { copropiedadId: COP_B, dispositivoId: 'cam-b' },
      { copropiedadId: COP_A, dispositivoId: 'portero-a' },
    ]);
    await m.inventario.enviar(m.api, COP_A);
    await vi.waitFor(() => expect(m.avisos).toHaveLength(1));
    expect(m.avisos).toEqual([{ vigentes: ['cam-a', 'portero-a'] }]);
    expect(m.lineas).toEqual([]);
  });

  it('sin equipos activos en la copropiedad: la lista va vacía (el Edge retira todo lo suyo)', async () => {
    const m = montar(async () => [{ copropiedadId: COP_B, dispositivoId: 'cam-b' }]);
    await m.inventario.enviar(m.api, COP_A);
    await vi.waitFor(() => expect(m.avisos).toEqual([{ vigentes: [] }]));
  });

  it('si no se pueden leer los equipos: no lanza, NO avisa, y lo dice la bitácora', async () => {
    const m = montar(async () => {
      throw new Error('base caída');
    });
    await expect(m.inventario.enviar(m.api, COP_A)).resolves.toBeUndefined();
    await esperarEntrega();
    expect(m.avisos).toEqual([]);
    expect(m.lineas).toEqual([
      {
        nivel: 'aviso',
        mensaje: 'no se pudo enviar el inventario al Edge',
        contexto: { copropiedadId: COP_A, error: 'base caída' },
      },
    ]);
  });

  it('un fallo que no es Error se registra por su texto', async () => {
    const m = montar(() => Promise.reject('sin conexión'));
    await m.inventario.enviar(m.api, COP_A);
    expect(m.lineas[0]?.contexto).toEqual({ copropiedadId: COP_A, error: 'sin conexión' });
  });

  it('con la sesión ya cerrada, el aviso se descarta sin lanzar', async () => {
    const m = montar(async () => [{ copropiedadId: COP_A, dispositivoId: 'cam-a' }]);
    m.api.cerrar(1000, 'fin');
    await expect(m.inventario.enviar(m.api, COP_A)).resolves.toBeUndefined();
    await esperarEntrega();
    expect(m.avisos).toEqual([]);
    expect(m.lineas).toEqual([]);
  });
});
