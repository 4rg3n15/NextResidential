import { registrarAdaptador, clasesRegistradas } from '../fabrica';
import type { ConfiguracionDeProveedor } from '../fabrica';
import { ProveedorFicticio } from './proveedor-ficticio';
import type { EquipoFicticio } from './proveedor-ficticio';

/**
 * Registra la marca inventada en la fábrica, **como adaptador que NO es de
 * producción**. Lo llama la suite de contrato; no lo llama nadie más, y el
 * barril del paquete no lo exporta: una marca que no existe no puede acabar
 * en un despliegue por una variable de entorno mal escrita.
 */
export const CLASE_FICTICIA = 'orbita';

export interface ConfiguracionFicticia extends ConfiguracionDeProveedor {
  readonly equiposFicticios?: readonly EquipoFicticio[];
}

export const registrarAdaptadorFicticio = (): void => {
  if (clasesRegistradas().includes(CLASE_FICTICIA)) return;
  registrarAdaptador({
    clase: CLASE_FICTICIA,
    produccion: false,
    crear: (configuracion) =>
      new ProveedorFicticio({
        reloj: configuracion.reloj,
        equipos: (configuracion as ConfiguracionFicticia).equiposFicticios ?? [],
      }),
  });
};
