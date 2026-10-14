import { describe, expect, it } from 'vitest';
import { NombreDeEquipoPorActivos } from './nombre-de-equipo-por-activos';

describe('NombreDeEquipoPorActivos (15-Z2)', () => {
  const puerto = new NombreDeEquipoPorActivos({
    activos: async () => [
      { dispositivoId: 'd-1', copropiedadId: 'c', nombre: 'Portería de A' },
      { dispositivoId: 'd-2', copropiedadId: 'c', nombre: 'Peatonal' },
    ],
  });
  it('el nombre del activo; null si no está entre los activos', async () => {
    expect(await puerto.nombreDe('d-2')).toBe('Peatonal');
    expect(await puerto.nombreDe('d-9')).toBeNull();
  });
});
