import { ArbolDeSalidasDemasiadoHondo, aplanarSalidas, motivoLegible } from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';
import type { LectorDeSalidas, LecturaDeSalidas } from '../aplicacion/salidas-del-equipo';

/**
 * 15-P · P3 · el árbol de salidas, leído por el PROVEEDOR de equipos y
 * traducido aquí para que la aplicación no importe nada del paquete de
 * hardware (O2): el recorrido acotado (R3), el error de un árbol demasiado
 * hondo y el motivo en palabras del operador cuando el equipo no contesta.
 */
export class LectorDeSalidasPorProveedor implements LectorDeSalidas {
  constructor(private readonly proveedor: Pick<ProveedorDeEquipos, 'salidasDe'>) {}

  async leer(dispositivoId: string): Promise<LecturaDeSalidas> {
    if (this.proveedor.salidasDe === undefined) {
      return { estado: 'sin_lectura', motivo: 'El proveedor de equipos no lee salidas' };
    }
    let arbol;
    try {
      arbol = await this.proveedor.salidasDe(dispositivoId);
    } catch (error) {
      // Ni ruta, ni dirección, ni credencial: la frase que lee el operador (§2.7.8).
      return { estado: 'sin_lectura', motivo: motivoLegible(error) };
    }
    try {
      return { estado: 'leida', arbol, salidas: aplanarSalidas(arbol) };
    } catch (error) {
      if (error instanceof ArbolDeSalidasDemasiadoHondo) {
        return { estado: 'invalida', motivo: error.message };
      }
      throw error;
    }
  }
}
