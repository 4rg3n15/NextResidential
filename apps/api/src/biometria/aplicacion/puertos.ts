import type { ConsentimientoBiometrico, PlantillaBiometrica } from '@ncr/domain-core';

/**
 * Puertos del módulo de biometría.
 *
 * El más importante es `BovedaDePlantillas`, y lo importante de él es lo que
 * **no** ofrece: no hay `leerVector(plantillaId)`.
 *
 * La plantilla se cifra al guardarla y solo se descifra en el momento de
 * empujarla a la terminal, dentro del propio adaptador. Si el puerto expusiera
 * una lectura, cualquier caso de uso —o cualquier controlador que alguien
 * escriba dentro de seis meses— podría sacar el vector a la capa de
 * presentación y de ahí al navegador. «La plantilla vive en la terminal y
 * cifrada en base, nunca en el cliente» deja de ser una norma que hay que
 * recordar y pasa a ser una operación que no existe.
 */
export const REPOSITORIO_CONSENTIMIENTOS = Symbol.for('ncr.puerto.RepositorioConsentimientos');
export const REPOSITORIO_PLANTILLAS = Symbol.for('ncr.puerto.RepositorioPlantillas');
export const BOVEDA_DE_PLANTILLAS = Symbol.for('ncr.puerto.BovedaDePlantillas');

export interface RepositorioConsentimientos {
  porId(copropiedadId: string, id: string): Promise<ConsentimientoBiometrico | null>;
  vigenteDe(copropiedadId: string, titularId: string): Promise<ConsentimientoBiometrico | null>;
  pendientesVencidos(
    copropiedadId: string,
    ahora: Date,
    plazoHoras: number,
  ): Promise<readonly ConsentimientoBiometrico[]>;
  guardar(consentimiento: ConsentimientoBiometrico, actorId: string): Promise<void>;
}

/** Una terminal donde la plantilla está o estuvo. */
export interface DestinoDePlantilla {
  readonly plantillaId: string;
  readonly dispositivoId: string;
}

export interface RepositorioPlantillas {
  porId(copropiedadId: string, id: string): Promise<PlantillaBiometrica | null>;
  deConsentimiento(
    copropiedadId: string,
    consentimientoId: string,
  ): Promise<readonly PlantillaBiometrica[]>;
  vencidas(copropiedadId: string, ahora: Date): Promise<readonly PlantillaBiometrica[]>;
  /** Cola de retirada de CA-10: derivada, nunca un estado que alguien escribe. */
  porRetirar(copropiedadId: string): Promise<readonly DestinoDePlantilla[]>;
  guardar(plantilla: PlantillaBiometrica, actorId: string): Promise<void>;
  /** Borra el vector y marca la fila. Suprimir es borrar, no etiquetar (CA-10). */
  suprimirVector(copropiedadId: string, plantillaId: string, actorId: string): Promise<void>;
  registrarSincronizacion(destino: DestinoDePlantilla, actorId: string): Promise<void>;
  registrarRetirada(destino: DestinoDePlantilla, actorId: string): Promise<void>;
}

export interface BovedaDePlantillas {
  /** Cifra y guarda. Devuelve la referencia de llave, nunca la llave. */
  guardar(
    copropiedadId: string,
    plantillaId: string,
    vector: Uint8Array,
  ): Promise<{ readonly llaveRef: string; readonly algoritmo: string }>;
  /**
   * Descifra y entrega a la terminal **dentro del adaptador**. El vector no
   * cruza de vuelta a la capa de aplicación: por eso esto empuja en vez de
   * devolver.
   */
  empujarATerminal(
    copropiedadId: string,
    plantillaId: string,
    dispositivoId: string,
  ): Promise<void>;
  retirarDeTerminal(plantillaId: string, dispositivoId: string): Promise<void>;
  olvidar(copropiedadId: string, plantillaId: string): Promise<void>;
}
