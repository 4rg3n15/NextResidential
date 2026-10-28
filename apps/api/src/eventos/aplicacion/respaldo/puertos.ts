/**
 * D-147 · LOS PUERTOS DEL RESPALDO DIARIO DE LOS EVENTOS
 *
 * El respaldo es una COPIA: lee `eventos` y no escribe en ella (RN-03). Lo que
 * escribe son dos tablas propias, también append-only (0061): el respaldo de
 * cada día y cada intento de enviarlo.
 */

/** Un respaldo ya guardado: su fichero en Storage y su constancia en la base. */
export interface RespaldoGuardado {
  readonly id: string;
  readonly copropiedadId: string;
  /** El día de la copropiedad que cubre, `AAAA-MM-DD`. */
  readonly fecha: string;
  readonly ruta: string;
  readonly numeroDeEventos: number;
  readonly permitidos: number;
  readonly negados: number;
  readonly sha256: string;
  readonly tamanoBytes: number;
  readonly generadoEn: Date;
}

export type RespaldoNuevo = Omit<RespaldoGuardado, 'id' | 'generadoEn'>;

export type ResultadoDelIntento = 'enviado' | 'error' | 'sin_configurar';

/** Un intento de envío de un respaldo a UN destinatario. Nunca se reescribe. */
export interface IntentoDeEnvio {
  readonly respaldoId: string;
  readonly destinatarioId: string;
  readonly resultado: ResultadoDelIntento;
  readonly error: string | null;
  readonly enviadoEn: Date | null;
  readonly conEnlace: boolean;
  readonly intentadoEn: Date;
}

export type IntentoNuevo = Omit<IntentoDeEnvio, 'intentadoEn'>;

export const REPOSITORIO_DE_RESPALDOS = Symbol.for('ncr.puerto.RepositorioDeRespaldos');

/** La constancia de cada día (`respaldos_de_eventos`). */
export interface RepositorioDeRespaldos {
  /** Los respaldos de la copropiedad desde esa fecha (incluida), del más antiguo al más reciente. */
  desde(copropiedadId: string, fecha: string): Promise<readonly RespaldoGuardado[]>;
  porFecha(copropiedadId: string, fecha: string): Promise<RespaldoGuardado | null>;
  /**
   * Inserta, o devuelve el que ya estaba si otra ejecución lo registró antes:
   * la fila es la constancia, y el día es único por copropiedad.
   */
  registrar(respaldo: RespaldoNuevo, actorId: string): Promise<RespaldoGuardado>;
  /** Los últimos respaldos, del más reciente al más antiguo, para Informes. */
  ultimos(copropiedadId: string, cuantos: number): Promise<readonly RespaldoGuardado[]>;
}

export const ENVIOS_DE_RESPALDO = Symbol.for('ncr.puerto.EnviosDeRespaldo');

/** Los intentos de envío (`envios_de_respaldo`): sólo se anotan, nunca se reescriben (C-68). */
export interface EnviosDeRespaldo {
  /** Los intentos de esos respaldos, del más reciente al más antiguo. */
  intentos(
    copropiedadId: string,
    respaldoIds: readonly string[],
  ): Promise<readonly IntentoDeEnvio[]>;
  anotar(copropiedadId: string, intentos: readonly IntentoNuevo[], actorId: string): Promise<void>;
}

export const ALMACEN_DE_RESPALDOS = Symbol.for('ncr.puerto.AlmacenDeRespaldos');

/** El bucket PRIVADO `respaldo-de-eventos` (RN-21): se lee por URL firmada. */
export interface AlmacenDeRespaldos {
  guardar(ruta: string, contenido: Uint8Array): Promise<void>;
  leer(ruta: string): Promise<Uint8Array | null>;
  urlFirmada(ruta: string, segundosDeVida: number): Promise<string>;
}

export interface Destinatario {
  readonly id: string;
  readonly correo: string;
}

export const DESTINATARIOS_DEL_RESPALDO = Symbol.for('ncr.puerto.DestinatariosDelRespaldo');

/**
 * Quién recibe el respaldo: los superadministradores ACTIVOS, con el correo de
 * su cuenta. Nunca una dirección escrita en código.
 */
export interface DestinatariosDelRespaldo {
  superadministradores(copropiedadId: string): Promise<readonly Destinatario[]>;
  nombreDeCopropiedad(copropiedadId: string): Promise<string>;
}

/** Una fila del Excel: las columnas del buscador de eventos (D-145), con nombres. */
export interface FilaDelRespaldo {
  readonly ocurridoEn: Date;
  readonly tipo: string;
  readonly resultado: string;
  readonly motivo: string | null;
  readonly metodo: string;
  readonly persona: string | null;
  readonly clasePersona: string | null;
  readonly vivienda: string | null;
  readonly placa: string | null;
  readonly equipo: string | null;
  readonly operador: string | null;
  readonly motivoManual: string | null;
}

export const FORMATO_DEL_RESPALDO = Symbol.for('ncr.puerto.FormatoDelRespaldo');

/**
 * El fichero, en el formato de la exportación existente (`aExcel`). Es un
 * puerto porque el serializador vive en presentación y la aplicación no puede
 * importarla (§2.2): el módulo lo inyecta.
 */
export interface FormatoDelRespaldo {
  serializar(filas: readonly FilaDelRespaldo[]): Uint8Array;
}
