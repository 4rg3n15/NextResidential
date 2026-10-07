/**
 * API pública del módulo del residente — el barril de §2.2.
 *
 * Sale su raíz de composición y nada más. El puerto y los casos de uso son
 * internos: si otro módulo necesitara leer la vivienda de un residente, la
 * conversación es sobre dónde vive esa regla, no sobre exportar el puerto.
 */
export { ResidenteModule } from './residente.module';
// 15-X · las rutas del rostro llevan la foto: `tuberia-http.ts` les sube el tope.
export { RUTAS_CON_FOTO_DE_ROSTRO } from './presentacion/limites-del-rostro';
