/**
 * Barril del módulo de cuentas (§2.2, ADR-023). Sale lo que portería necesita
 * —crear cuentas, inscribir su gancho, leer datos visibles de una cuenta— y
 * nada que construya o lea un correo sintético.
 */
export { CuentasModule } from './cuentas.module';
export { CrearCuentaPorUsuario } from './aplicacion/crear-cuenta';
export type { RechazoDeAlta, SolicitudDeCuenta } from './aplicacion/crear-cuenta';
export {
  ADMINISTRADOR_DE_CUENTAS,
  DIRECTORIO_DE_CUENTAS,
  GANCHOS_DE_SESION,
  LECTOR_DE_TOKEN,
  PROVEEDOR_DE_IDENTIDAD,
  REPOSITORIO_DE_CUENTAS,
} from './aplicacion/puertos';
export type {
  AdministradorDeCuentas,
  DirectorioDeCuentas,
  GanchoDeSesion,
  GanchosDeSesion,
  OrigenDeAcceso,
  ProveedorDeIdentidad,
  ResumenDeCuenta,
  SesionEmitida,
  VeredictoDeSesion,
} from './aplicacion/puertos';
export { RepositorioDeCuentasEnMemoria } from './infraestructura/repositorio-cuentas-memoria';
export { limitadoresDeAcceso } from './presentacion/limites-de-acceso';
export { MENSAJE_CREDENCIALES } from './presentacion/cuentas.controller';
