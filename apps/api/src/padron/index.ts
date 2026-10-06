/**
 * API pública del módulo de padrón — el barril de §2.2.
 *
 * Hoy solo sale su raíz de composición: ningún otro módulo necesita el
 * agregado `Vivienda` ni sus casos de uso, y que no salgan es la señal de que
 * la frontera está donde debe.
 */
export { PadronModule } from './padron.module';
/**
 * A4 (15-E) · la única pregunta que otro módulo hace del padrón: dónde está la
 * vivienda que un videoportero nombra por unidad. Token y forma estrecha; el
 * repositorio entero sigue sin salir.
 */
export { LOCALIZADOR_DE_VIVIENDA } from './aplicacion/puertos';
export type { LocalizadorDeVivienda } from './aplicacion/puertos';
/**
 * 15-W (D5) · la lógica de editar y borrar un vehículo, para que el residente
 * la REUTILICE sobre sus vehículos propios sin copiarla. Sale la función y la
 * porción estrecha del puerto que usa; el repositorio entero sigue sin salir.
 */
export { borrarVehiculoSinHistorial, editarVehiculoCon } from './aplicacion/vehiculos-compartidos';
export type {
  EntradaEditarVehiculo,
  PuertoDeBorradoDeVehiculo,
  PuertoDeEdicionDeVehiculo,
} from './aplicacion/vehiculos-compartidos';
export type {
  EdicionDeVehiculo,
  HistorialDeVehiculo,
  ResultadoEdicionVehiculo,
} from './aplicacion/puertos';
