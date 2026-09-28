/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ENTRADA DE OPERACIÓN · para guiones que se ejecutan DELANTE de los equipos
 *
 * El barril (`index.ts`) es la API pública para la aplicación, y la 15-C lo
 * dejó mínimo a propósito: la API no debe ver rutas, clientes ni jueces del
 * fabricante (KPI-11). Pero el guion de puesta en marcha en sitio sí necesita
 * exactamente eso —recorrer el catálogo ruta por ruta y decir cuál contesta—,
 * y al perder el barril esas exportaciones se quedó roto sin que nada lo
 * detectara (D-132, ETAPA 15-D).
 *
 * Esta entrada existe para ese único consumidor y se publica como subruta
 * `@ncr/providers/operacion`. El control de extensibilidad sigue vigente: nada
 * bajo `apps/` la importa, y el guion la carga desde `dist/` como siempre.
 */
export {
  RUTAS,
  MARCADOR_DE_CANAL,
  rutaPara,
  rutasDeFamilia,
  exigeCanal,
  opcionesDeEscritura,
} from './equipo/catalogo-de-rutas';
export type { RutaDeEquipo, Procedencia } from './equipo/tipos-de-ruta';
export { ClienteDeEquipo, EquipoInalcanzable } from './equipo/cliente';
export { interpretarError } from './equipo/errores-del-fabricante';
export { juzgarModo, leerCtrlMod } from './camara/modo-de-control';
export { CARRIL_VERIFICADO_DE_LA_CAMARA } from './camara/carril';
export { diagnosticarEquipo, documentoSaneado } from './diagnostico/diagnostico-de-equipo';
// 15-K (§5) · lo que necesita `--capturar`: la carga de prueba (que construye
// el adaptador DENTRO del paquete, O2) y el saneado.
export { cargaDePruebaDeRostro } from './diagnostico/carga-de-prueba';
export { IMAGEN_SIN_ROSTRO } from './diagnostico/imagen-sin-rostro';
export type { ResultadoDeCargaDePrueba } from './diagnostico/carga-de-prueba';
export { fichaDe } from './diagnostico/ficha';
// Anexo 15-K · `--abrir`: la apertura como abrió en sitio, y el oráculo del
// simulado para ensayarla (¿se movió la puerta?).
export { aperturaDeVerificacion } from './diagnostico/apertura-de-verificacion';
export type {
  FamiliaConPuerta,
  ResultadoDeAperturaDeVerificacion,
} from './diagnostico/apertura-de-verificacion';
export { equiposSimulados, aperturasFisicasPor } from './simulacion/equipo-simulado';
// J (15-L) · `pnpm sitio:ensayo`: los ocho pasos por equipo, el respaldo y la
// reversión de la configuración, y el informe sin credenciales.
export { ensayarEquipo } from './ensayo/ensayo-en-sitio';
export type { InformeDeEnsayo } from './ensayo/ensayo-en-sitio';
export { capturarRespaldo, restaurarRespaldo } from './ensayo/respaldo-de-configuracion';
export type { RespaldoDeEquipo, ResultadoDeRestauracion } from './ensayo/respaldo-de-configuracion';
export { lineasDelInforme, recuentoDe, sinSecretosConocidos } from './ensayo/informe-de-ensayo';
export { GESTO } from './ensayo/paso-de-eventos';
export type {
  EquipoDeEnsayo,
  EventosDeLaPlataforma,
  FamiliaDeEnsayo,
  Interlocutor,
  OpcionesDeEnsayo,
} from './ensayo/tipos';
export { LIMITES_DE_FOTO_POR_OMISION } from './terminal/foto-del-rostro';
export { FlujoEnVivo } from './simulacion/equipo-simulado';
export { servidorRtspSimulado } from './simulacion/servidor-rtsp';
// C2 (corrección de la 15-L) · la IP del Mac en la red de cada equipo.
export { ipHaciaElEquipo, mismaSubred } from './red/ip-hacia-el-equipo';
export type { IpHaciaElEquipo, InterfazDeRed } from './red/ip-hacia-el-equipo';
// Corrección de la 15-L (C1, C2, C7, F2, F3, F4) · lo que el ensayo añade: la
// plataforma, el receptor de la cámara, los tiempos de la verificación remota y
// la escucha que ya tiene otra plataforma; y el `--simulado` entero, montado aquí.
export {
  juzgarConexionDePgBoss,
  juzgarProveedorDeEquipos,
  lineasDeComprobaciones,
} from './ensayo/comprobaciones-de-plataforma';
export type {
  ComprobacionDePlataforma,
  EntornoDeLaPlataforma,
} from './ensayo/comprobaciones-de-plataforma';
export type {
  ReceptorEsperado,
  VerificacionMedida,
  VerificacionesDeLaPlataforma,
} from './ensayo/tipos';
export { clasificarConexionDeEventosRechazada } from './equipo/conexion-de-eventos-rechazada';
export type { ConexionDeEventosRechazada } from './equipo/conexion-de-eventos-rechazada';
export { montarEnsayoSimulado } from './simulacion/ensayo-simulado';
export type { EnsayoSimulado } from './simulacion/ensayo-simulado';
