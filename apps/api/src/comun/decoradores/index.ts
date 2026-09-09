import { SetMetadata } from '@nestjs/common';
import type { Rol } from '../../autenticacion';

export const CLAVE_PUBLICO = 'ncr:publico';
export const CLAVE_ROLES = 'ncr:roles';
export const CLAVE_SERVICIO = 'ncr:permite_servicio';

/**
 * `@Publico()` es la ÚNICA forma de eximir una ruta. El guard es global y
 * deniega por defecto (§2.1.4): si alguien añade un controlador y olvida
 * decorarlo, la ruta queda protegida, no abierta. La lista de exenciones es
 * corta y auditable porque cada una hay que escribirla a mano.
 */
export const Publico = (): MethodDecorator & ClassDecorator => SetMetadata(CLAVE_PUBLICO, true);

/** RBAC declarativo (§2.7.8): nunca `if (rol === 'admin')` disperso. */
export const Roles = (...roles: Rol[]): MethodDecorator & ClassDecorator =>
  SetMetadata(CLAVE_ROLES, roles);

/**
 * Marca una ruta como alcanzable por la identidad de servicio (Edge, workers,
 * ingesta). Obliga a que la validación de copropiedad ocurra en la capa de
 * aplicación, porque esa llave OMITE la RLS.
 */
export const PermiteServicio = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CLAVE_SERVICIO, true);

export const CLAVE_SIN_RECURSO_TENANT = 'ncr:sin_recurso_tenant';

/**
 * Declara que la ruta **no expone ningún recurso de una copropiedad**: opera
 * sobre la identidad del propio llamante (su sesión, su segundo factor).
 *
 * Existe para que la suite de aislamiento pueda distinguirlas sin una lista
 * escrita a mano en la prueba. La diferencia importa: una lista en el test se
 * amplía sin que nadie lo note; este decorador va en el controlador, aparece
 * en el diff y hay que justificarlo en la revisión. Sin él, toda ruta nueva
 * debe responder 403/404 ante un identificador de otra copropiedad o la suite
 * rompe el build.
 */
export const SinRecursoDeTenant = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CLAVE_SIN_RECURSO_TENANT, true);

export const CLAVE_SIN_SEGUNDO_FACTOR = 'ncr:sin_segundo_factor';

/**
 * Declara que la ruta es alcanzable **antes** de completar el segundo factor.
 *
 * Existe por un caso concreto y no debe crecer: tras restablecer la contraseña,
 * la sesión que emite el proveedor de identidad es `aal1` —el usuario acaba de
 * demostrar el control del buzón, no el del segundo factor—, y el rastro del
 * cambio de credencial tiene que quedar registrado en ese momento. Sin esta
 * exención, un administrador nunca podría dejar constancia de su propio
 * restablecimiento: exactamente el mismo callejón sin salida que hizo
 * inalcanzables las rutas de MFA retiradas en ADR-008.
 *
 * **No relaja RN-20.** La ruta que la lleva no expone ningún recurso de
 * copropiedad ni permite operar: solo escribe un registro de auditoría sobre el
 * propio llamante. Cualquier otra ruta sigue exigiendo `aal2` a los roles
 * administrativos, y la suite de aislamiento comprueba QUÉ rutas la declaran,
 * para que ampliarla sea un cambio visible en el diff y no un descuido.
 */
export const SinSegundoFactor = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CLAVE_SIN_SEGUNDO_FACTOR, true);
