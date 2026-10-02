import type { ContextoTenant } from '../autenticacion';

/**
 * 15-Q2 · D2 · el puerto por el que el módulo de equipos entrega una credencial
 * al Edge de su copropiedad en lugar de guardarla en la nube.
 *
 * Vive en `comun` y no en `edge`: lo consume `equipos` y lo cumple `edge`, que
 * ya importa `equipos`. Declararlo en cualquiera de los dos cerraría un ciclo
 * de barriles (D-66: el orden de carga importa).
 */
export interface EntregaAlEdge {
  /** El Edge la guardó cifrada y, con ella, ¿el equipo autenticó? */
  readonly autenticado: boolean;
  readonly estado: 'en_linea' | 'fuera_de_linea' | 'degradado';
}

export interface CredencialesEnElEdge {
  /** El Edge puente de la copropiedad, o `null` si va directo (R1). */
  puenteDe(copropiedadId: string): Promise<string | null>;
  /** C3 · sin túnel, `EdgeDesconectado` EN EL ACTO: antes de escribir nada. */
  exigirTunel(copropiedadId: string): void;
  /**
   * Manda al Edge el equipo con su credencial (`clave`), o sólo sus datos
   * (`null`: el Edge conserva la que tiene). Con clave, deja en la base la
   * referencia `edge:<gateway>` y una huella no reversible. Sin túnel lanza
   * `EdgeDesconectado`: nada se guarda a medias en la nube.
   */
  entregar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    clave: string | null,
  ): Promise<EntregaAlEdge>;
  /** Baja del equipo: el Edge la borra. Sin túnel, se registra y no lanza. */
  retirar(copropiedadId: string, dispositivoId: string): Promise<void>;
  /**
   * C2 · una orden que no pasa por el puerto (diagnóstico, corrección), al Edge
   * de la copropiedad. Sin túnel, `EdgeDesconectado` en el acto.
   */
  pedir(copropiedadId: string, nombre: string, carga: unknown, plazoMs: number): Promise<unknown>;
}

export const CREDENCIALES_EN_EL_EDGE = Symbol.for('ncr.comun.CredencialesEnElEdge');

/** Lo que `credencialPara` devuelve de un equipo cuya clave sólo tiene el Edge. */
export const CLAVE_EN_EL_EDGE = (dispositivoId: string): string => `edge:${dispositivoId}`;
export const esClaveEnElEdge = (secreto: string): boolean => /^edge:[0-9a-f-]{36}$/i.test(secreto);
