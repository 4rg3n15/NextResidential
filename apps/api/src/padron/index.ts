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
