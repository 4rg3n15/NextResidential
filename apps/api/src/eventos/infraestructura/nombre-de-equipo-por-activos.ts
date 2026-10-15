import type { EquipoQueEmite } from '../../equipos';
import type { NombreDeEquipo } from '../aplicacion/aviso-al-residente';

/**
 * 15-Z2 (DT-15R-08) · el nombre de un equipo por el puerto `EQUIPOS_ACTIVOS`
 * del módulo de equipos (R1, 15-L): sin consultar su tabla desde aquí (§2.2).
 * Un equipo dado de baja no está entre los activos y queda sin nombre.
 */
export class NombreDeEquipoPorActivos implements NombreDeEquipo {
  constructor(private readonly equipos: { activos(): Promise<readonly EquipoQueEmite[]> }) {}

  async nombreDe(dispositivoId: string): Promise<string | null> {
    const todos = await this.equipos.activos();
    return todos.find((e) => e.dispositivoId === dispositivoId)?.nombre ?? null;
  }
}
