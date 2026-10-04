import type { Bitacora } from '@ncr/domain-core';
import type { ProveedorDeIdentidad } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E4 · CERRAR SESIÓN NO DEPENDE DE QUE SUPABASE CONTESTE
 *
 * `POST /auth/cierre` respondía 500 si el proveedor de identidad no contestaba
 * —y el usuario se quedaba sin saber si había salido—. Lo local (el registro
 * de portería, la presencia del superadministrador) ya está cerrado cuando se
 * llega aquí; lo que falta es la REVOCACIÓN REMOTA del token. Si falla:
 *
 *  · la petición termina bien (la sesión local está cerrada);
 *  · la revocación se REINTENTA a los 5 s, 30 s y 2 min —dentro de la vida del
 *    token (5 min): después, Supabase ya no la aceptaría y el token caduca solo—;
 *  · cada fallo y el resultado final quedan en la bitácora, SIN el token
 *    (§2.7.8): sólo el número de intento y el tipo de fallo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const ESPERAS_DE_LA_REVOCACION_MS: readonly number[] = [5_000, 30_000, 120_000];

export type Programador = (esperaMs: number, tarea: () => void) => void;

const temporizadorReal: Programador = (esperaMs, tarea) => {
  setTimeout(tarea, esperaMs).unref();
};

const causa = (e: unknown): string => (e instanceof Error ? e.name : typeof e);

export class RevocacionConReintento implements Pick<ProveedorDeIdentidad, 'cerrarSesion'> {
  constructor(
    private readonly proveedor: Pick<ProveedorDeIdentidad, 'cerrarSesion'>,
    private readonly bitacora: Bitacora,
    private readonly programar: Programador = temporizadorReal,
  ) {}

  async cerrarSesion(accessToken: string): Promise<void> {
    try {
      await this.proveedor.cerrarSesion(accessToken);
    } catch (e) {
      this.bitacora.registrar('aviso', 'revocación remota pendiente: el proveedor no respondió', {
        intento: 1,
        causa: causa(e),
        consecuencia: 'la sesión local ya está cerrada; se reintenta la revocación',
      });
      this.reintentar(accessToken, 0);
    }
  }

  private reintentar(accessToken: string, indice: number): void {
    const espera = ESPERAS_DE_LA_REVOCACION_MS[indice];
    if (espera === undefined) {
      this.bitacora.registrar('error', 'revocación remota NO confirmada tras los reintentos', {
        intentos: ESPERAS_DE_LA_REVOCACION_MS.length + 1,
        consecuencia: 'el token caduca solo a los 5 min; la sesión local ya estaba cerrada',
      });
      return;
    }
    this.programar(espera, () => {
      this.proveedor.cerrarSesion(accessToken).then(
        () =>
          this.bitacora.registrar('info', 'revocación remota confirmada tras reintento', {
            intento: indice + 2,
          }),
        (e: unknown) => {
          this.bitacora.registrar('aviso', 'revocación remota pendiente', {
            intento: indice + 2,
            causa: causa(e),
          });
          this.reintentar(accessToken, indice + 1);
        },
      );
    });
  }
}
