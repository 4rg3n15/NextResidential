/**
 * API pública del módulo de autenticación — el barril de §2.2.
 *
 * Es el módulo más consultado del monolito: los claims del token son el
 * contexto de toda operación, así que casi cualquier caso de uso necesita
 * `ContextoTenant`. Precisamente por eso importaba tener una puerta: hasta la
 * ETAPA 08, treinta y cinco importaciones entraban por dentro —a
 * `dominio/claims`, a `infraestructura/jwks`— y mover un fichero habría roto
 * media aplicación a distancia (D-34).
 *
 * Sale el vocabulario del contexto y las piezas que las guardas y la sonda de
 * salud necesitan. NO salen los controladores ni los DTOs de MFA: son detalles
 * de su capa de presentación.
 */
export { AutenticacionModule } from './autenticacion.module';
export {
  ROLES,
  ROLES_ADMINISTRATIVOS,
  alcanzaCopropiedad,
  exigeSegundoFactor,
} from './dominio/claims';
export type { ContextoTenant, Rol } from './dominio/claims';
export { RechazoDeAutenticacion } from './dominio/errores';
export { VerificadorDeJwt } from './infraestructura/verificador-jwt';
export { ProveedorDeJwks } from './infraestructura/jwks';
