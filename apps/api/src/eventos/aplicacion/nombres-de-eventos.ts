/**
 * D-145 · LOS NOMBRES DE LO QUE CUENTA UN EVENTO
 *
 * `eventos` guarda identificadores —persona, vivienda, operador— y es
 * append-only (RN-03): no se le añaden columnas de nombre ni se reescribe. El
 * buscador de la consola necesita leerlos, así que se resuelven AL CONSULTAR,
 * por lotes —una consulta por clase de identificador, nunca una por fila
 * (§2.4)— y sólo dentro de la copropiedad del evento (RN-15).
 *
 * La persona sale como `residente` si tiene vínculo de residente en la
 * copropiedad, y si no como `visitante`. [SUPUESTO] S-145-01: un residente
 * que entra como visitante de otra vivienda se ve como residente.
 */
export type ClaseDePersona = 'residente' | 'visitante';

export interface PersonaDelEvento {
  readonly nombre: string;
  readonly clase: ClaseDePersona;
}

export interface NombresDeEventos {
  readonly personas: ReadonlyMap<string, PersonaDelEvento>;
  readonly viviendas: ReadonlyMap<string, string>;
  readonly operadores: ReadonlyMap<string, string>;
  /** D-147 · el nombre del equipo, para el respaldo diario. */
  readonly dispositivos: ReadonlyMap<string, string>;
}

export interface IdsPorResolver {
  readonly personas: readonly string[];
  readonly viviendas: readonly string[];
  readonly operadores: readonly string[];
  /** D-147 · opcional: la línea de tiempo los nombra en la consola. */
  readonly dispositivos?: readonly string[];
}

export interface ResolutorDeNombres {
  resolver(copropiedadId: string, ids: IdsPorResolver): Promise<NombresDeEventos>;
}
export const RESOLUTOR_DE_NOMBRES = Symbol.for('ncr.eventos.ResolutorDeNombres');

export const SIN_NOMBRES: NombresDeEventos = {
  personas: new Map(),
  viviendas: new Map(),
  operadores: new Map(),
  dispositivos: new Map(),
};

/** Sin base (PERSISTENCIA_DE_EVENTOS en memoria): no hay padrón que leer. */
export class ResolutorDeNombresSinBase implements ResolutorDeNombres {
  async resolver(): Promise<NombresDeEventos> {
    return SIN_NOMBRES;
  }
}
