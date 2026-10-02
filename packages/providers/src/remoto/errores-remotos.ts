/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · LOS ERRORES QUE CRUZAN EL TÚNEL, CON SU CLASE
 *
 * La API decide qué hacer según la CLASE del error —`CapacidadNoSoportada` no
 * se reintenta, `EquipoOcupado` sí, `CredencialRechazada` bloquea la cuenta—.
 * Si al cruzar el túnel llegara un `Error` genérico con el mismo texto, toda esa
 * lógica caería en la rama «fallo desconocido» sin que nada fallara. Por eso el
 * otro lado lo reconstruye como instancia de la MISMA clase, con sus campos.
 *
 * Una clase que no está aquí llega como `ErrorRemoto`, con su nombre: se ve, no
 * se disfraza de otra cosa.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import {
  BibliotecaLlena,
  CanalDeAudioOcupado,
  CapacidadNoSoportada,
  CredencialRechazada,
  DesafioVencido,
  EquipoAveriado,
  EquipoOcupado,
  ErrorDeEquipo,
  OrdenSinConfirmar,
  PeticionRechazada,
  ReinicioNecesario,
  RelojDelEquipoDesviado,
  SinCanalDeVideo,
  SinDesafioDigest,
  VideoNoReproducible,
} from '../nucleo/errores';
import { EquipoInalcanzable } from '../equipo/cliente';
import { EquipoNoRegistrado } from '../hikvision/registro-de-equipos';
import { EquipoDecidePorSuCuenta } from '../camara/modo-de-control';
import {
  CanalDeAudioSinDescubrir,
  CanalDeEquipoNoHabilitado,
} from '../videoportero/intercom-equipo';
import { AudioRechazadoPorElEquipo } from '../videoportero/intercom-isapi-persistente';
import { VideoporteroSinOperador } from '../videoportero/videoportero';
import { ArbolDeSalidasDemasiadoHondo } from '../nucleo/salidas';
import { AperturaNoSoportada } from '../equipo/puerta-remota';
import { FotoNoAdmitida } from '../terminal/foto-del-rostro';

/** El Edge del conjunto no tiene el túnel abierto: la orden no sale (C3). */
export class EdgeDesconectado extends Error {
  constructor(readonly detalle = 'el Edge del conjunto no está conectado') {
    super(detalle);
    this.name = 'EdgeDesconectado';
  }
}

/** Nadie contestó dentro del plazo de la orden. No se sabe si se ejecutó. */
export class OrdenVencida extends Error {
  constructor(
    readonly orden: string,
    readonly plazoMs: number,
  ) {
    super(`la orden «${orden}» no tuvo respuesta en ${String(plazoMs)} ms`);
    this.name = 'OrdenVencida';
  }
}

/**
 * B2 · un solo actor: la orden de la nube pertenece a un hecho que el Edge ya
 * resolvió por contingencia. Llegó tarde; ejecutarla sería accionar dos veces.
 */
export class HechoYaResueltoEnElEdge extends Error {
  constructor(readonly padre: string) {
    super('el Edge ya resolvió este acceso por contingencia: la orden de la nube llegó tarde');
    this.name = 'HechoYaResueltoEnElEdge';
  }
}

/** Un mensaje que no cumple el protocolo. Quien lo recibe cierra el túnel. */
export class ProtocoloInvalido extends Error {
  constructor(readonly detalle: string) {
    super(`mensaje fuera de protocolo: ${detalle}`);
    this.name = 'ProtocoloInvalido';
  }
}

/** Un error cuya clase este lado no conoce: llega con su nombre, sin disfraz. */
export class ErrorRemoto extends Error {
  constructor(nombre: string, mensaje: string) {
    super(mensaje);
    this.name = nombre;
  }
}

type ClaseDeError = abstract new (...args: never[]) => Error;

const CLASES: readonly ClaseDeError[] = [
  ErrorDeEquipo,
  CapacidadNoSoportada,
  VideoNoReproducible,
  SinCanalDeVideo,
  EquipoOcupado,
  CanalDeAudioOcupado,
  EquipoAveriado,
  ReinicioNecesario,
  CredencialRechazada,
  SinDesafioDigest,
  DesafioVencido,
  BibliotecaLlena,
  RelojDelEquipoDesviado,
  PeticionRechazada,
  OrdenSinConfirmar,
  EquipoInalcanzable,
  EquipoNoRegistrado,
  EquipoDecidePorSuCuenta,
  AudioRechazadoPorElEquipo,
  CanalDeAudioSinDescubrir,
  CanalDeEquipoNoHabilitado,
  VideoporteroSinOperador,
  ArbolDeSalidasDemasiadoHondo,
  AperturaNoSoportada,
  FotoNoAdmitida,
  EdgeDesconectado,
  OrdenVencida,
  ProtocoloInvalido,
  HechoYaResueltoEnElEdge,
];

const POR_NOMBRE = new Map<string, ClaseDeError>(CLASES.map((c) => [c.name, c]));

/**
 * Reconstruye sin llamar al constructor: los constructores COMPONEN el mensaje
 * (con el dispositivo, el tiempo, el bloqueo), y recomponerlo aquí daría un
 * texto distinto del que vio el otro lado. Se copia el mensaje tal cual.
 */
export const reconstruirError = (
  nombre: string,
  mensaje: string,
  campos: Readonly<Record<string, unknown>>,
): Error => {
  const clase = POR_NOMBRE.get(nombre);
  if (clase === undefined) return Object.assign(new ErrorRemoto(nombre, mensaje), campos);
  const error = Object.create(clase.prototype as object) as Error;
  Object.defineProperty(error, 'message', { value: mensaje, writable: true, configurable: true });
  Object.defineProperty(error, 'name', { value: nombre, writable: true, configurable: true });
  return Object.assign(error, campos);
};
