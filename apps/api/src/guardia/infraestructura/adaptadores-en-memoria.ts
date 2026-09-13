import { Injectable } from '@nestjs/common';
import type { Bitacora } from '@ncr/domain-core';
import type {
  AccionadorDePuerta,
  BitacoraDeOrdenes,
  OrdenEjecutada,
} from '../aplicacion/apertura-manual';

/**
 * Accionador **simulado** de puerta — ADR-03.
 *
 * No es un doble de pruebas: es el adaptador que la ETAPA 10 despliega, y lo
 * dice en la bitácora cada vez que actúa. El relé real llega en la ETAPA 15
 * detrás de este mismo puerto.
 *
 * Registra la orden con nivel `info` y con el dispositivo: sin eso, una consola
 * que «abre» sin que nada se mueva es indistinguible de una que funciona, y esa
 * ambigüedad es la que hace que un despliegue mal cableado llegue a producción.
 */
@Injectable()
export class AccionadorSimulado implements AccionadorDePuerta {
  constructor(private readonly bitacora: Bitacora) {}

  async accionar(dispositivoId: string, abrir: boolean): Promise<void> {
    this.bitacora.registrar('info', 'orden de relé (proveedor SIMULADO, ETAPA 15 lo sustituye)', {
      dispositivoId,
      accion: abrir ? 'abrir' : 'mantener',
    });
  }
}

/**
 * Bitácora de órdenes manuales en memoria.
 *
 * Provisional y **acotada a propósito**: guarda las últimas 200 por
 * copropiedad. Una lista sin tope en memoria es una fuga lenta que sólo se ve
 * en producción, y el historial que la portería necesita es el inmediato
 * (HU-23) — el completo vive en `eventos`, que sí es append-only y persistente.
 *
 * El adaptador PostgreSQL entra con la tabla de órdenes; la frontera ya es
 * definitiva. Queda como **D-70**.
 */
@Injectable()
export class BitacoraDeOrdenesEnMemoria implements BitacoraDeOrdenes {
  private static readonly TOPE_POR_COPROPIEDAD = 200;
  private readonly porCopropiedad = new Map<string, OrdenEjecutada[]>();

  async registrar(orden: OrdenEjecutada): Promise<void> {
    const lista = this.porCopropiedad.get(orden.copropiedadId) ?? [];
    lista.unshift(orden);
    this.porCopropiedad.set(
      orden.copropiedadId,
      lista.slice(0, BitacoraDeOrdenesEnMemoria.TOPE_POR_COPROPIEDAD),
    );
  }

  async ultimas(copropiedadId: string, cuantas: number): Promise<readonly OrdenEjecutada[]> {
    return (this.porCopropiedad.get(copropiedadId) ?? []).slice(0, cuantas);
  }
}
