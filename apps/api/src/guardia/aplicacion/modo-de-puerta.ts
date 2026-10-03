import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import type { Rol } from '../../autenticacion';
import type { EstadoDeAccionamiento } from './apertura-manual';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · P-25 · PUERTA LIBRE O BLOQUEADA, Y SIEMPRE DE VUELTA A NORMAL
 *
 * Decisión del cliente: el videoportero (y la terminal) puede quedar «libre»
 * (`alwaysOpen`) o «bloqueado» (`alwaysClose`). Es estado, no un pulso: deja al
 * conjunto sin control de acceso, o sin acceso. Por eso, aquí y no en la
 * consola:
 *
 *  · sólo administrador y superadministrador (el guard lo declara en la ruta y
 *    el caso de uso lo vuelve a exigir: dos barreras);
 *  · con motivo, como toda orden manual (RN-08);
 *  · con plazo: ninguna orden dura más que la duración máxima de su
 *    copropiedad (2 h por omisión, hasta 12 h) y al vencer se REVIERTE sola;
 *  · si el equipo o el túnel no contestan al revertir, se reintenta con espera
 *    creciente y se levanta una alerta (RN-18): una puerta que sigue libre sin
 *    que nadie lo sepa es el peor desenlace.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type ModoTemporal = 'libre' | 'bloqueada';
export type OrigenDeModo = 'consola' | 'revertir_ahora' | 'reversion_automatica';

export const ROLES_QUE_FIJAN_MODO: readonly Rol[] = ['administrador', 'superadministrador'];
export const DURACION_POR_OMISION_MIN = 120;
export const DURACION_MINIMA_CONFIGURABLE_MIN = 15;
/** [SUPUESTO] S-15R-04 · el tope de plataforma: 12 h. */
export const TOPE_DE_PLATAFORMA_MIN = 720;
/** Espera entre reintentos de una reversión fallida: 1, 2, 4… hasta 30 min. */
export const ESPERA_MAXIMA_ENTRE_REINTENTOS_MIN = 30;

export interface NuevaOrdenDeModo {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly numeroDePuerta: number;
  readonly modo: ModoTemporal | 'normal';
  readonly origen: OrigenDeModo;
  readonly motivo: string;
  readonly operadorId: string;
  readonly rol: Rol;
  readonly ordenadaEn: Date;
  readonly revierteEn: Date | null;
}

/** Una puerta que HOY puede estar libre o bloqueada, con lo que se sabe de ella. */
export interface ModoVigente {
  readonly id: string;
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly numeroDePuerta: number;
  readonly modo: ModoTemporal;
  readonly motivo: string;
  readonly operadorId: string;
  /** Para el aviso de la consola: quién, en lenguaje de persona (`null` si no se lee). */
  readonly operadorNombre: string | null;
  readonly rol: Rol;
  readonly ordenadaEn: Date;
  readonly revierteEn: Date;
  readonly resultado: EstadoDeAccionamiento | null;
  /** Reversiones intentadas desde que se ordenó, que no lograron devolverla. */
  readonly reversionesFallidas: number;
  readonly ultimoIntento: Date | null;
}

export const REGISTRO_DE_MODOS = Symbol.for('ncr.puerto.RegistroDeModosDePuerta');
export interface RegistroDeModosDePuerta {
  /** Escribe la orden ANTES de accionar; devuelve su id. */
  registrar(orden: NuevaOrdenDeModo): Promise<string>;
  anotarResultado(
    copropiedadId: string,
    id: string,
    resultado: EstadoDeAccionamiento,
    detalle: string | null,
  ): Promise<void>;
  vigentes(copropiedadId: string): Promise<readonly ModoVigente[]>;
  /** Las copropiedades con alguna puerta libre o bloqueada: lo que el barrido recorre. */
  copropiedadesConVigentes(): Promise<readonly string[]>;
}

export const AJUSTES_DE_PUERTAS = Symbol.for('ncr.puerto.AjustesDePuertas');
export interface AjustesDePuertas {
  duracionMaxima(copropiedadId: string): Promise<number>;
  fijarDuracionMaxima(copropiedadId: string, minutos: number, actorId: string): Promise<void>;
}

export const ACCIONADOR_DE_MODO = Symbol.for('ncr.puerto.AccionadorDeModo');
export interface AccionadorDeModo {
  fijar(
    dispositivoId: string,
    numeroDePuerta: number,
    modo: ModoTemporal | 'normal',
    actorId: string,
  ): Promise<{ readonly estado: EstadoDeAccionamiento; readonly detalle: string | null }>;
}

/** Cuántos minutos dura una orden: lo pedido, o la máxima; nunca más que ella. */
export const duracionDeLaOrden = (
  pedidos: number | undefined,
  maxima: number,
): Resultado<number, ErrorDominio> => {
  const minutos = pedidos ?? maxima;
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > maxima) {
    return fallo(
      errorDominio(
        'DATO_INVALIDO',
        `La duración va de 1 a ${String(maxima)} minutos en esta copropiedad`,
      ),
    );
  }
  return exito(minutos);
};

/** ¿Se puede intentar revertir ya? Vencida, y pasada la espera tras el último fallo. */
export const tocaRevertir = (v: ModoVigente, ahora: Date): boolean => {
  if (v.revierteEn.getTime() > ahora.getTime()) return false;
  if (v.reversionesFallidas === 0 || v.ultimoIntento === null) return true;
  const espera = Math.min(2 ** (v.reversionesFallidas - 1), ESPERA_MAXIMA_ENTRE_REINTENTOS_MIN);
  return ahora.getTime() >= v.ultimoIntento.getTime() + espera * 60_000;
};
