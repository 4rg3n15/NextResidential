import type { Bitacora } from '@ncr/domain-core';
import { motivoLegible } from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';
import type { EstadoDeAccionamiento } from '../aplicacion/apertura-manual';
import type { AccionadorDeModo, ModoTemporal } from '../aplicacion/modo-de-puerta';

/**
 * 15-R · P-25 · el modo de la puerta por el MISMO proveedor de equipos que abre
 * (`fijarModoDeSalida`): directo o vía Edge, lo decide el enrutado (15-Q2).
 *
 * La traducción, como en `accionador-por-proveedor`, nunca «pasa»: un error del
 * proveedor es una orden rechazada con su motivo legible. Con una diferencia
 * deliberada: el túnel caído o sin respuesta es `inalcanzable`, no `rechazada`
 * —la reversión automática lo distingue y REINTENTA; un rechazo del equipo
 * también se reintenta, pero la consola debe poder decir cuál de los dos fue—.
 * Por NOMBRE de clase, como el filtro de errores del túnel.
 */
const DEL_TUNEL = new Set(['EdgeDesconectado', 'OrdenVencida']);

export class AccionadorDeModoPorProveedor implements AccionadorDeModo {
  constructor(
    private readonly proveedor: ProveedorDeEquipos,
    private readonly bitacora: Bitacora,
  ) {}

  async fijar(
    dispositivoId: string,
    numeroDePuerta: number,
    modo: ModoTemporal | 'normal',
    actorId: string,
  ): Promise<{ readonly estado: EstadoDeAccionamiento; readonly detalle: string | null }> {
    if (this.proveedor.fijarModoDeSalida === undefined) {
      return {
        estado: 'rechazada',
        detalle: 'el proveedor de equipos no fija el modo de una puerta',
      };
    }
    try {
      const r = await this.proveedor.fijarModoDeSalida(
        dispositivoId,
        numeroDePuerta,
        modo,
        actorId,
      );
      if (r.aceptado) return { estado: 'aceptada', detalle: null };
      return r.rechazo !== undefined
        ? { estado: 'rechazada', detalle: r.rechazo }
        : { estado: 'inalcanzable', detalle: 'el equipo no respondió a la orden' };
    } catch (error) {
      const clase = error instanceof Error ? error.name : typeof error;
      this.bitacora.registrar('aviso', 'orden de modo de puerta no cumplida', {
        dispositivoId,
        numeroDePuerta,
        modo,
        clase,
        detalleTecnico: error instanceof Error ? error.message : String(error),
      });
      return {
        estado: DEL_TUNEL.has(clase) ? 'inalcanzable' : 'rechazada',
        detalle: motivoLegible(error),
      };
    }
  }
}
