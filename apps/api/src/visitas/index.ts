/**
 * Barril del módulo de visitas (F, 15-L). Sale lo que el residente necesita
 * para generar SUS visitas y ver sus últimos visitantes —siempre con la
 * vivienda que él mismo resuelve de su vínculo— y la ruta del cuerpo grande.
 */
export { VisitasModule } from './visitas.module';
export { AvisoDeVisitas } from './aplicacion/aviso-de-visitas';
export { DatosParaVolverAAutorizar, UltimosVisitantes } from './aplicacion/consultar-visitas';
export type { Repeticion } from './aplicacion/consultar-visitas';
export {
  PLANTILLA_DE_LA_CASILLA,
  RegistrarRostroDeVisita,
  VERSION_DE_LA_CASILLA,
  revisarFoto,
  textoDeLaCasilla,
} from './aplicacion/rostro-de-visita';
export type { FotoDeVisita, RostroRegistrado } from './aplicacion/rostro-de-visita';
export { hastaDe, revisarForma } from './aplicacion/generar-visita';
export { confirmacionDePlaca, momentoCorto } from './aplicacion/confirmacion-de-placa';
export type { VisitanteReciente } from './aplicacion/puertos';
export { RUTAS_CON_FOTO_DE_VISITA } from './presentacion/limites';
// 15-X · el rostro del residente lleva la MISMA foto: tipo, tope y medidas.
export { MAX_BASE64_FOTOGRAFIA } from './aplicacion/foto';
export {
  FotoDeVisitaDto,
  MedidasDeFotoDto,
  MiVisitaDto,
  RepetirVisitaDto,
  VisitaGeneradaDto,
} from './presentacion/dtos';
