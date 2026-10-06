import type { AmbitoDelResidente } from '@ncr/domain-core';
import type { PuertoDeBorradoDeVehiculo, PuertoDeEdicionDeVehiculo } from '../../padron';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EDITAR Y ELIMINAR LOS VEHÍCULOS PROPIOS · RONDA 15-W (D-W5, D5)
 *
 * La lógica es la del padrón (`editarVehiculoCon`, `borrarVehiculoSinHistorial`):
 * lo único propio del residente es el REPOSITORIO, acotado a los vehículos que
 * registraron residentes de SU vivienda. Un vehículo del vecino, o uno del
 * padrón que puso la administración, no existe para él (404).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const EDICION_DE_VEHICULOS_PROPIOS = Symbol('EDICION_DE_VEHICULOS_PROPIOS');

export type VehiculosPropiosDeLaVivienda = PuertoDeEdicionDeVehiculo & PuertoDeBorradoDeVehiculo;

export interface EdicionDeVehiculosPropios {
  /** El repositorio del padrón, acotado a la vivienda del ámbito y con el residente como actor. */
  deLaVivienda(ambito: AmbitoDelResidente, actorId: string): VehiculosPropiosDeLaVivienda;
  /** Sustituye los ocupantes vinculados; `false` si el vehículo no es propio de la vivienda. */
  reemplazarOcupantes(
    ambito: AmbitoDelResidente,
    vehiculoId: string,
    residenteIds: readonly string[],
    actorId: string,
  ): Promise<boolean>;
}
