/**
 * API pública del módulo de biometría — el barril de §2.2.
 *
 * Sale la raíz de composición y los puertos. **No sale nada que permita leer un
 * vector biométrico**, porque ese método no existe en ninguna capa: la bóveda
 * cifra al guardar y descifra solo hacia la terminal, dentro del adaptador.
 */
export { BiometriaModule } from './biometria.module';
export {
  BOVEDA_DE_PLANTILLAS,
  REPOSITORIO_CONSENTIMIENTOS,
  REPOSITORIO_PLANTILLAS,
} from './aplicacion/puertos';
export type {
  BovedaDePlantillas,
  DestinoDePlantilla,
  RepositorioConsentimientos,
  RepositorioPlantillas,
} from './aplicacion/puertos';
