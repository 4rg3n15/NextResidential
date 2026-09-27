import type { OpcionesDeEquipo } from '../equipo/cliente';
import { TerminalFacial } from '../terminal/terminal-facial';
import { identificadorEnElEquipo } from '../terminal/identificador-en-el-equipo';
import { confirmada } from '../equipo/confirmacion-isapi';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-K (§5) · LA CARGA DE PRUEBA DE LA CAPTURA DE SITIO
 *
 * H-SITIO-04: en sitio la carga de plantillas falló y no quedó qué contestó el
 * equipo. `--capturar` hace una carga con una imagen SIN ROSTRO —lo esperado es
 * que la rechace— para registrar CÓMO responde a la secuencia completa (alta de
 * persona, formulario de la imagen, búsqueda). Después da de baja la persona de
 * prueba, la acepte o no: no queda nada nuestro en el equipo.
 *
 * Vive aquí y no en el guion por la frontera de extensibilidad (O2): fuera de
 * `packages/providers` nadie construye un adaptador de marca.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ResultadoDeCargaDePrueba {
  /** El equipo aceptó una imagen sin rostro: no valida lo que recibe. */
  readonly aceptada: boolean;
  /** Por qué la rechazó, tal como lo dijo (ya saneado por el cliente). */
  readonly rechazo: string | null;
  /** La baja de la persona: se PIDE siempre; el equipo la ejecuta en segundo plano. */
  readonly baja: { readonly estado: number; readonly ok: boolean } | null;
  /** La baja no se pudo ni pedir: la persona puede seguir en el equipo. */
  readonly errorDeBaja: string | null;
  /** El `employeeNo` de la persona de prueba, para buscarla a mano si hace falta. */
  readonly employeeNo: string;
}

const mensaje = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const cargaDePruebaDeRostro = async (
  conexion: OpcionesDeEquipo,
  imagen: Uint8Array,
  plantillaId: string,
): Promise<ResultadoDeCargaDePrueba> => {
  const terminal = new TerminalFacial({ ...conexion, modo: 'decide_el_equipo' });
  let aceptada = false;
  let rechazo: string | null = null;
  try {
    await terminal.sincronizar('captura-de-sitio', plantillaId, imagen);
    aceptada = true;
  } catch (error) {
    rechazo = mensaje(error);
  }
  try {
    if (aceptada) await terminal.suprimir('captura-de-sitio', plantillaId);
    const r = await terminal.darDeBajaPersona(plantillaId);
    return {
      aceptada,
      rechazo,
      // Anexo 15-K (c) · «aceptada» sólo con statusCode 1 y su subStatusCode.
      baja: { estado: r.estado, ok: confirmada(r) },
      errorDeBaja: null,
      employeeNo: identificadorEnElEquipo(plantillaId),
    };
  } catch (error) {
    return {
      aceptada,
      rechazo,
      baja: null,
      errorDeBaja: mensaje(error),
      employeeNo: identificadorEnElEquipo(plantillaId),
    };
  }
};
