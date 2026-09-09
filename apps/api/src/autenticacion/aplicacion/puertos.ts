/**
 * Puertos del módulo de autenticación.
 *
 * Aparecen en la ETAPA 09-A porque hasta ahora este módulo no persistía nada:
 * verificaba tokens que emitía Supabase y nada más. Los códigos de recuperación
 * son lo primero suyo que necesita almacenamiento.
 */

export interface RepositorioCodigosMfa {
  /**
   * Sustituye los códigos del usuario por otros nuevos.
   *
   * Sustituir y no añadir: regenerar deja sin valor los anteriores. Si se
   * acumularan, un juego de códigos apuntado en un papel de hace dos años
   * seguiría abriendo la puerta.
   */
  reemplazar(usuarioId: string, hashes: readonly string[], actorId: string): Promise<void>;

  /** Hashes aún sin consumir. Nunca devuelve códigos en claro: no existen. */
  hashesVigentes(usuarioId: string): Promise<readonly string[]>;

  /**
   * Marca uno como consumido. Devuelve `false` si ya lo estaba, para que
   * «un solo uso» lo decida el almacén en una sola operación y no una
   * comprobación previa que otra petición simultánea podría adelantar.
   */
  consumir(usuarioId: string, hash: string, ip: string | null): Promise<boolean>;
}

export const REPOSITORIO_CODIGOS_MFA = Symbol.for('ncr.puerto.RepositorioCodigosMfa');

/**
 * Retirada de factores en el proveedor de identidad.
 *
 * Es la única operación del sistema que usa la llave secreta contra Supabase
 * Auth, y por eso está detrás de un puerto: la ETAPA 13 tiene que poder
 * auditarla mirando un solo sitio.
 */
export interface AdministradorDeFactores {
  /** Retira los factores TOTP verificados del usuario. Devuelve cuántos. */
  retirarFactoresVerificados(authUserId: string): Promise<number>;
}

export const ADMINISTRADOR_DE_FACTORES = Symbol.for('ncr.puerto.AdministradorDeFactores');
