# ADR-008 · Supabase Auth es el único mecanismo de segundo factor

- **Estado:** Aceptada
- **Fecha:** 2026-09-09 (ETAPA 09-A)
- **Origen:** defecto **D-39**, reportado al cerrar la ETAPA 09-A; decisión del cliente el 2026-09-09
- **Afecta a:** ETAPAS 03, 09, 10, 11, 13 · RN-20 · CA-25
- **Supersede:** la implementación de `/auth/mfa/*` de la ETAPA 03, que se retira

## Contexto

La ETAPA 03 construyó dos cosas que parecían complementarias y no lo eran:

1. El guard de autenticación **exige `aal2` en el token** para los tres roles administrativos (RN-20, CA-25). Ese claim lo emite **Supabase** al verificar un factor.
2. Un servicio TOTP propio con `otplib`, expuesto en `/auth/mfa/inscripcion` y `/auth/mfa/verificacion`, con códigos de recuperación en hash y límite endurecido de 5 intentos por minuto.

Al montar el acceso de la consola apareció el problema. Los guards corren en orden **límite → autenticación → roles**, y el de autenticación rechaza a un rol administrativo con `aal1` **antes** de que el de roles llegue a mirar nada. Las dos rutas de MFA exigían rol administrativo. La consecuencia:

> **Un administrador sin segundo factor no podía alcanzar la ruta que sirve para inscribirlo.** Y aunque hubiera podido, verificar allí no habría cambiado el `aal` de su token, porque ese claim no lo emite nuestra API. La ruta no desbloqueaba nada.

No era solo código inalcanzable. Eran **dos fuentes de verdad para el mismo hecho** —«este usuario tiene segundo factor»—, y solo una de ellas gobierna el acceso.

## Decisión

**Supabase Auth es el mecanismo autoritativo del segundo factor. `/auth/mfa/*` se retira.**

Se elimina el vertical completo: las dos rutas, sus DTOs de entrada y salida, `ServicioMfa` y el módulo de dominio `mfa.ts` con sus códigos de recuperación.

La consola verifica el factor contra `/auth/v1/factors/{id}/challenge` y `/verify` de Supabase, que devuelve un token nuevo con `aal2`. **El guard de la API no cambia**: sigue exigiendo `aal2` y sigue siendo quien hace cumplir RN-20.

## Alternativas consideradas

| Alternativa                                                  | Por qué se descarta                                                                                                                                                               |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dejarlo como estaba**                                      | Un endpoint que existe, está protegido y nadie puede alcanzar es un hallazgo seguro en la auditoría de la ETAPA 13, y con razón: nadie sabe si es un resto o un agujero pendiente |
| **Eximir `/auth/mfa/*` del requisito de `aal2`**             | Haría la ruta alcanzable sin arreglar lo de fondo: verificar allí seguiría sin emitir el `aal2` que el guard exige, así que el administrador seguiría sin entrar                  |
| **Hacer autoritativo el TOTP propio y dejar de mirar `aal`** | Obligaría a emitir tokens propios o a mantener un estado de sesión paralelo al de Supabase. Es rehacer un proveedor de identidad para no usar el que ya está en el stack (§2.6)   |
| **Conservar `ServicioMfa` sin exponerlo, «por si acaso»**    | Código muerto. La ETAPA 13 lo marcaría igual, y un servicio sin consumidor envejece sin que nadie lo note                                                                         |

## Consecuencias

**Que se aceptan:**

- **RN-20 y CA-25 se cumplen igual, y por el mismo sitio de siempre**: el guard de autenticación. La retirada no toca la regla, solo elimina una implementación que no participaba en ella.
- La **inscripción del factor** pasa a ser una operación del panel de Supabase o de un flujo de la consola en una etapa posterior. Queda documentada en `docs/guias/APROVISIONAMIENTO_USUARIOS.md`.
- Se pierden los **códigos de recuperación propios**. Supabase admite varios factores por usuario, que es su equivalente; queda anotado para la ETAPA 13.
- La suite de aislamiento pierde dos exenciones de `@SinRecursoDeTenant()`. Su propia comprobación de coherencia lo habría delatado si se hubiera olvidado.

**A asumir en etapas siguientes:**

- **ETAPA 11 (Flutter):** el residente no exige segundo factor, pero si algún día se le exigiera, el camino es el de Supabase y no otro.
- **ETAPA 13:** verificar que no queda ningún resto del TOTP propio y que la política de factores de Supabase está configurada.

## Verificación

- `apps/api/test/mfa-retirado.e2e.test.ts` · las rutas no existen en el enrutador —no basta con que devuelvan 404, que no distinguiría «no existe» de «existe y el guard la rechaza»— **y** los tres roles administrativos con `aal1` siguen sin entrar. La segunda mitad es la que impide que la retirada haya abierto un agujero.
- `apps/api/test/aislamiento.e2e.test.ts` · la lista de exenciones y los decoradores del código siguen coincidiendo.
- `scripts/lib/contrato-desfasado.mjs` · el contrato y el cliente generado ya no las mencionan.

## Contingencia

Si Supabase MFA resultara insuficiente, la salida **no** es reintroducir un TOTP paralelo: es que el emisor de tokens emita el claim que el guard ya lee. El guard no cambia; cambia quién firma.
