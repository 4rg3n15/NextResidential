/**
 * API pública del módulo de biometría — el barril de §2.2.
 *
 * Sale la raíz de composición y los puertos. **No sale nada que permita leer un
 * vector biométrico**, porque ese método no existe en ninguna capa: la bóveda
 * cifra al guardar y descifra solo hacia la terminal, dentro del adaptador.
 */
export { BiometriaModule } from './biometria.module';
/**
 * El CASO DE USO de captura sale del barril; el controlador no.
 *
 * La app del residente necesita capturar el rostro de su visitante, y esa ruta
 * no puede ser la del mostrador de portería: aquella recibe `titularId` desde
 * el cuerpo, que abierta al rol `residente` sería una forma de pedirle el
 * consentimiento a quien uno quiera (RN-10). Lo que se comparte, por tanto, es
 * la lógica —calidad, cifrado, solicitud de consentimiento, supresión
 * programada—, y cada superficie pone su propia puerta y su propio titular.
 *
 * Sigue sin salir nada que permita LEER un vector: ese método no existe.
 */
// ETAPA 14 · el barrido sale por el barril porque lo invoca el planificador
// (D-40). Antes solo lo alcanzaba su propio controlador.
export { BarrerPlantillasVencidas, CapturarRostro } from './aplicacion/casos-de-uso';
export type { ResultadoBarrido } from './aplicacion/casos-de-uso';
export type { ResultadoCaptura, SolicitudDeCaptura } from './aplicacion/casos-de-uso';
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
