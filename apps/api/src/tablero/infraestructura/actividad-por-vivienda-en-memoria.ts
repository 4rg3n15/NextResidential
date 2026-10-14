import type {
  ActividadDeVivienda,
  ActividadPorVivienda,
} from '../aplicacion/actividad-por-vivienda';

/**
 * 15-Z3 · doble en memoria del puerto, para la suite sin base (KPI-12) y para
 * el arranque con `PERSISTENCIA_DE_EVENTOS=memoria`. Las filas se DECLARAN por
 * copropiedad; una copropiedad sin declarar es desconocida (`null`), igual que
 * en la base una que no existe.
 */
export class ActividadPorViviendaEnMemoria implements ActividadPorVivienda {
  private readonly porCopropiedad = new Map<string, readonly ActividadDeVivienda[]>();

  declarar(copropiedadId: string, filas: readonly ActividadDeVivienda[]): void {
    this.porCopropiedad.set(copropiedadId, filas);
  }

  async consultar(copropiedadId: string): Promise<readonly ActividadDeVivienda[] | null> {
    return this.porCopropiedad.get(copropiedadId) ?? null;
  }
}
