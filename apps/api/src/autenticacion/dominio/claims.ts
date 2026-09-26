/**
 * Contrato de claims del token, fijado en `verificacion-jwt-asimetrica.md` §4.
 * Se valida con Zod porque un token bien firmado puede traer una carga útil
 * inesperada: la firma acredita el emisor, no la forma.
 */
import { z } from 'zod';

export const ROLES = [
  'superadministrador',
  'administrador',
  'portero',
  'operador_central',
  'residente',
  'servicio',
] as const;
export type Rol = (typeof ROLES)[number];

export const esquemaClaims = z
  .object({
    sub: z.string().min(1),
    usuario_id: z.string().uuid(),
    persona_id: z.string().uuid().optional(),
    rol: z.enum(ROLES),
    copropiedad_id: z.string().uuid().nullable().optional(),
    /** Alcance del operador de central, acotado al turno activo (S-10). */
    copropiedades: z.array(z.string().uuid()).max(64).optional(),
    /** Nivel de garantía de autenticación de Supabase: aal1 sin MFA, aal2 con MFA. */
    aal: z.enum(['aal1', 'aal2']).optional(),
    /**
     * ETAPA 15-H (ADR-024) · la sesión de Supabase a la que pertenece el token.
     * Es estable entre refrescos, y por eso la API la usa para registrar la
     * sesión del portero y su estado de patrullaje.
     */
    session_id: z.string().uuid().optional(),
    /** ETAPA 15-H (ADR-023) · primer ingreso o restablecimiento pendiente. */
    debe_cambiar_contrasena: z.boolean().optional(),
    exp: z.number().int(),
    iss: z.string(),
    aud: z.union([z.string(), z.array(z.string())]),
  })
  .passthrough();

export type Claims = z.infer<typeof esquemaClaims>;

/**
 * Contexto del tenant que se inyecta en cada caso de uso.
 * `readonly` en todo: un interceptor lo construye y nadie más lo modifica.
 */
export interface ContextoTenant {
  readonly usuarioId: string;
  readonly personaId?: string;
  readonly rol: Rol;
  readonly copropiedadId: string | null;
  readonly copropiedadesAtendidas: readonly string[];
  readonly mfaVerificado: boolean;
  /** ETAPA 15-H · `session_id` del token, si lo trae (ADR-024). */
  readonly sesionId?: string;
  /** ETAPA 15-H · cambio de contraseña obligatorio pendiente (ADR-023). */
  readonly debeCambiarContrasena?: boolean;
}

/** Roles que RN-20 obliga a proteger con segundo factor. */
export const ROLES_ADMINISTRATIVOS: readonly Rol[] = [
  'superadministrador',
  'administrador',
  'operador_central',
];

export const exigeSegundoFactor = (rol: Rol): boolean => ROLES_ADMINISTRATIVOS.includes(rol);

/**
 * Alcance efectivo sobre una copropiedad. Es la MISMA lógica que las funciones
 * `app.es_mi_copropiedad` / `app.es_copropiedad_atendida` de la migración 0003,
 * reimplementada aquí a propósito: §2.7.6 exige que el aislamiento se compruebe
 * por los DOS caminos, y la llave secreta omite la RLS por completo. Si la capa
 * de aplicación se limitara a confiar en la base, la ruta que usa esa llave
 * quedaría sin ninguna barrera.
 */
export const alcanzaCopropiedad = (ctx: ContextoTenant, copropiedadId: string): boolean => {
  if (ctx.rol === 'superadministrador') return true;
  if (ctx.rol === 'operador_central') return ctx.copropiedadesAtendidas.includes(copropiedadId);
  return ctx.copropiedadId === copropiedadId;
};
