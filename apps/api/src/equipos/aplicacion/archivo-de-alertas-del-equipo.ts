/**
 * A1 (15-N) · AL DAR DE BAJA UN EQUIPO, SUS ALERTAS ABIERTAS SE ARCHIVAN
 *
 * Una alerta «caído» de un equipo retirado no la va a resolver nadie: el
 * equipo ya no late. Se archiva con el motivo de la baja (archivo lógico,
 * RN-19). El puerto lo declara quien lo consume, como el retiro de
 * plantillas: este módulo no importa eventos; eventos lo satisface.
 */
export interface ArchivoDeAlertasDelEquipo {
  archivarPorBaja(
    copropiedadId: string,
    dispositivoId: string,
    motivo: string,
    actorId: string,
  ): Promise<number>;
}

export const ARCHIVO_DE_ALERTAS_DEL_EQUIPO = Symbol.for('ncr.puerto.ArchivoDeAlertasDelEquipo');
