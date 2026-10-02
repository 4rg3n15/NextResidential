/**
 * ═════════════════════════════════════════════════════════════════════════════
 * V2 (15-N) · QUÉ CANAL DE VIDEO SE PIDE: EL QUE EL EQUIPO DECLARA
 *
 * Hasta la 15-N, un equipo sin canal en su ficha iba al 102 —el subflujo de la
 * primera cámara— y la cámara del conjunto NO lo tiene: el 29/09 contestó RTSP
 * 412 y la consola quedó sin video. El canal no se supone: se toma de la lista
 * que el equipo DECLARA (`/Streaming/channels`, guardada en sus capacidades).
 *
 *  · La ficha manda si el equipo declara ese canal, o si el equipo no lista
 *    sus canales (no hay con qué contrastarla).
 *  · Si la ficha no tiene canal, o tiene uno que el equipo NO declara, se
 *    propone uno de los declarados: el subflujo (x02) si lo hay —es el que el
 *    navegador reproduce con menos retardo (KPI-33)—, si no, el primero. Es la
 *    misma regla que la consola usa para proponerlo en el formulario.
 *  · 15-P (0.5) · sin ficha y sin lista se propone el 101 —el flujo
 *    principal de la primera cámara—, dicho como «por omisión». Antes no había
 *    canal y la cámara del conjunto, que no lista sus flujos, quedaba en un 409
 *    «sin video» que nadie podía corregir desde la consola. [SUPUESTO] S-174:
 *    todo equipo de la familia expone `101`; si no, el equipo contesta RTSP 404
 *    y la consola lo dice («el equipo no tiene ese canal»).
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** 15-P (0.5) · el canal que se propone cuando el equipo no lista ninguno. */
export const CANAL_POR_OMISION = '101';
export interface CanalDeclaradoDeVideo {
  readonly id: string;
  readonly codec: string | null;
}

export type OrigenDelCanal = 'ficha' | 'propuesto' | 'por_omision' | 'sin_canal';

export interface EleccionDeCanal {
  readonly canal: string | null;
  readonly origen: OrigenDelCanal;
  /** El canal de la ficha que se sustituyó porque el equipo no lo declara. */
  readonly sustituido: string | null;
}

/** El subflujo (`x02`) declarado; si no, el primero declarado; sin lista, `null`. */
export const canalPropuesto = (
  canales: readonly CanalDeclaradoDeVideo[] | undefined,
): string | null => canales?.find((c) => c.id.endsWith('02'))?.id ?? canales?.[0]?.id ?? null;

export const elegirCanalDeVideo = (
  deLaFicha: string | null | undefined,
  declarados: readonly CanalDeclaradoDeVideo[] | undefined,
): EleccionDeCanal => {
  const guardado =
    deLaFicha === undefined || deLaFicha === null || deLaFicha === '' ? null : deLaFicha;
  const lista = declarados ?? [];
  if (lista.length === 0) {
    return guardado === null
      ? { canal: CANAL_POR_OMISION, origen: 'por_omision', sustituido: null }
      : { canal: guardado, origen: 'ficha', sustituido: null };
  }
  if (guardado !== null && lista.some((c) => c.id === guardado)) {
    return { canal: guardado, origen: 'ficha', sustituido: null };
  }
  return { canal: canalPropuesto(lista), origen: 'propuesto', sustituido: guardado };
};

/** La frase de la elección, para la ficha, el ensayo y la bitácora. */
export const fraseDeEleccion = (e: EleccionDeCanal): string =>
  e.origen === 'ficha'
    ? `canal ${e.canal ?? '?'} de la ficha`
    : e.origen === 'propuesto'
      ? e.sustituido === null
        ? `canal ${e.canal ?? '?'}, el que el equipo declara (la ficha no tenía canal)`
        : `canal ${e.canal ?? '?'}, el que el equipo declara: el ${e.sustituido} de la ficha no existe en el equipo`
      : e.origen === 'por_omision'
        ? `canal ${e.canal ?? CANAL_POR_OMISION} por omisión: el equipo no lista sus canales de video y la ficha no tiene uno`
        : 'sin canal: el equipo no lista sus canales de video y la ficha no tiene uno';
