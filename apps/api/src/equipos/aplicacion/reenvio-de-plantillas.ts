/**
 * R1 (15-N) · CUANDO UN EQUIPO PASA A «RECIBE PLANTILLAS», SE LE ENVÍAN LAS QUE LE FALTAN
 *
 * El puerto lo declara quien lo consume —este módulo, que es quien ve el
 * cambio de capacidades en el alta, la edición y «Probar conexión»—; lo
 * satisface la planificación (pg-boss, o en el proceso sin planificador), que
 * ya depende de biometría. Nunca lanza: el alta de un equipo pesa más que el
 * reenvío, que se reintenta.
 */
export interface ReenvioDePlantillasAEquipo {
  encolar(copropiedadId: string, dispositivoId: string): Promise<void>;
}

export const REENVIO_DE_PLANTILLAS_A_EQUIPO = Symbol.for('ncr.puerto.ReenvioDePlantillasAEquipo');

/** «Recibe plantillas» es lo mismo que decide el catálogo de destinos: la capacidad declarada. */
export const recibePlantillas = (
  capacidades: { readonly bibliotecaDeRostros?: { readonly estado?: string } } | null | undefined,
): boolean => capacidades?.bibliotecaDeRostros?.estado === 'si';
