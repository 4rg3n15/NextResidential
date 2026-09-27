import type { OpcionesDeEquipo } from '../equipo/cliente';
import { confirmada } from '../equipo/confirmacion-isapi';
import { TerminalFacial } from '../terminal/terminal-facial';
import { identificadorEnElEquipo } from '../terminal/identificador-en-el-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 · PASO 6 · EL ROSTRO DE PRUEBA: ALTA → BÚSQUEDA → ESPERA → BÚSQUEDA → BAJA
 *
 * Con el adaptador de producción (`TerminalFacial`), que es también el que
 * carga los rostros del videoportero con biblioteca (F4): la persona, su
 * rostro, la búsqueda que confirma que está (A3) y, al final, la supresión
 * verificada por búsqueda (RN-11) y la baja de la persona. Nada nuestro queda
 * en el equipo, se acepte o no.
 *
 * C7 (corrección de la 15-L) · entre el alta y la baja, una ESPERA y otra
 * búsqueda. Los equipos están dados de alta también en HikCentral, que
 * sincroniza el equipo con su propia lista y borra lo que no es suyo: el
 * rostro estaba al darlo de alta y un minuto después no. Sin esta segunda
 * búsqueda, el ensayo decía OK y la primera visita del día se quedaba fuera.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ResultadoDelRostroDePrueba {
  readonly employeeNo: string;
  readonly aceptada: boolean;
  /** Por qué lo rechazó el equipo, tal como lo dijo (ya saneado por el cliente). */
  readonly rechazo: string | null;
  /** C7 · ¿seguía tras la espera? `null`: no se buscó o el equipo no contestó. */
  readonly seguiaTrasLaEspera: boolean | null;
  /** La supresión NO se verificó (seguía tras suprimir, o el equipo lo rechazó). */
  readonly errorDeSupresion: string | null;
  /** La baja de la persona: se PIDE siempre; el equipo la ejecuta en segundo plano. */
  readonly baja: { readonly estado: number; readonly ok: boolean } | null;
  readonly errorDeBaja: string | null;
}

const mensaje = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const rostroDePrueba = async (
  conexion: OpcionesDeEquipo,
  imagen: Uint8Array,
  plantillaId: string,
  esperaMs: number,
  esperar: (ms: number) => Promise<void>,
): Promise<ResultadoDelRostroDePrueba> => {
  const equipo = new TerminalFacial({ ...conexion, modo: 'decide_el_equipo' });
  const employeeNo = identificadorEnElEquipo(plantillaId);
  let aceptada = false;
  let rechazo: string | null = null;
  try {
    // El alta ya BUSCA el rostro recién cargado: sin él, no la da por hecha (A3).
    await equipo.sincronizar('ensayo-en-sitio', plantillaId, imagen);
    aceptada = true;
  } catch (error) {
    rechazo = mensaje(error);
  }
  let seguia: boolean | null = null;
  let errorDeSupresion: string | null = null;
  if (aceptada) {
    await esperar(esperaMs);
    seguia = await equipo.existe(plantillaId).catch(() => null);
    if (seguia !== false) {
      try {
        await equipo.suprimir('ensayo-en-sitio', plantillaId);
      } catch (error) {
        errorDeSupresion = mensaje(error);
      }
    }
  }
  try {
    const r = await equipo.darDeBajaPersona(plantillaId);
    return {
      employeeNo,
      aceptada,
      rechazo,
      seguiaTrasLaEspera: seguia,
      errorDeSupresion,
      baja: { estado: r.estado, ok: confirmada(r) },
      errorDeBaja: null,
    };
  } catch (error) {
    return {
      employeeNo,
      aceptada,
      rechazo,
      seguiaTrasLaEspera: seguia,
      errorDeSupresion,
      baja: null,
      errorDeBaja: mensaje(error),
    };
  }
};
