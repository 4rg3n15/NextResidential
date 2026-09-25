import type { EstadoConsentimiento } from '@ncr/domain-core';
import type { ConsentimientoBiometrico, PlantillaBiometrica } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';

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
/**
 * A2 (ETAPA 15-E) · lo que este módulo SABE y otros necesitan preguntar: a
 * quién pertenece una plantilla y si esa persona puede ser reconocida ahora.
 * Lo consumen el receptor de equipos (para traducir el `FPID` de la terminal
 * a una persona) y el cargador de contexto del motor (RN-09), cada uno por su
 * propia interfaz declarada; ésta las satisface a las dos.
 */
export const IDENTIDAD_BIOMETRICA = Symbol.for('ncr.puerto.IdentidadBiometrica');
/**
 * A3 (ETAPA 15-E) · las terminales a las que una plantilla DEBE llegar: las
 * activas de la copropiedad con biblioteca de rostros declarada (capacidad,
 * nunca marca ni modelo · ADR-019). Lo satisface el módulo de equipos.
 */
export const CATALOGO_DE_TERMINALES = Symbol.for('ncr.puerto.CatalogoDeTerminales');
/** A3 · quien firma y verifica el enlace con el que el TITULAR responde. */
export const FIRMANTE_DE_ENLACES = Symbol.for('ncr.puerto.FirmanteDeEnlaces');

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

/**
 * Una terminal donde la plantilla está o estuvo. Lleva la copropiedad porque
 * el adaptador de PostgreSQL presenta claims de servicio POR copropiedad
 * (§2.7.6): sin ella no sabría con qué identidad escribir la fila.
 */
export interface DestinoDePlantilla {
  readonly copropiedadId: string;
  readonly plantillaId: string;
  readonly dispositivoId: string;
}

export interface RepositorioPlantillas {
  porId(copropiedadId: string, id: string): Promise<PlantillaBiometrica | null>;
  /** A2 · las plantillas de una persona, suprimidas incluidas: el dominio decide. */
  deTitular(copropiedadId: string, titularId: string): Promise<readonly PlantillaBiometrica[]>;
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

/** Una terminal (o videoportero) con biblioteca de rostros, tal como se nombra. */
export interface TerminalConBiblioteca {
  readonly dispositivoId: string;
  readonly nombre: string;
}

/**
 * El contexto viaja en la llamada (§2.7.6): quien lo satisface lee el registro
 * de equipos con los claims de ESTA petición y el filtro de aplicación.
 */
export interface CatalogoDeTerminales {
  conBibliotecaDeRostros(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<readonly TerminalConBiblioteca[]>;
}

/** Lo que el enlace del titular lleva dentro. Nada más: ni nombre ni dato. */
export interface DatosDelEnlace {
  readonly copropiedadId: string;
  readonly consentimientoId: string;
  readonly titularId: string;
  /** Instante de caducidad. Un enlace sin caducidad es una contraseña. */
  readonly expiraEn: Date;
  /**
   * Estado del consentimiento AL EMITIR. Es lo que hace al enlace de UN SOLO
   * USO: usarlo cambia el estado —aceptado, rechazado, revocado— y con ese
   * cambio todo enlace emitido para el estado anterior deja de valer. No hace
   * falta una lista de tokens usados ni depender del reloj: el propio agregado
   * dice en qué estado está.
   */
  readonly estadoAlEmitir: EstadoConsentimiento;
}

/**
 * El enlace es una credencial AL PORTADOR, acotada a UN consentimiento y con
 * caducidad. Quien lo tiene responde como titular: por eso lo firma el
 * servidor con una llave derivada por copropiedad, y por eso el token no es
 * un identificador que se pueda adivinar ni reutilizar en otra copropiedad.
 */
export interface FirmanteDeEnlaces {
  firmar(datos: DatosDelEnlace): string;
  /** `null` si la firma no cuadra, el token está malformado o caducó. */
  verificar(token: string, ahora: Date): DatosDelEnlace | null;
}
