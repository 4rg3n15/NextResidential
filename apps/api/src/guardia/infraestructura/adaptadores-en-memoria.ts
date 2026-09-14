import { Injectable } from '@nestjs/common';
import type { Bitacora, ResultadoDeAccionamiento } from '@ncr/domain-core';
import { ordenAceptada } from '@ncr/domain-core';
import type {
  AccionadorDePuerta,
  BitacoraDeOrdenes,
  BloqueoDeAcceso,
  EstadoDeAccionamiento,
  OrdenEjecutada,
} from '../aplicacion/apertura-manual';
import type { BloqueoVigente, RegistroDeBloqueos } from '../aplicacion/bloqueo-de-acceso';

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
export class AccionadorSimulado implements AccionadorDePuerta, BloqueoDeAcceso {
  constructor(private readonly bitacora: Bitacora) {}

  async accionar(dispositivoId: string, abrir: boolean): Promise<ResultadoDeAccionamiento> {
    this.bitacora.registrar('info', 'orden de relé (proveedor SIMULADO, ETAPA 15 lo sustituye)', {
      dispositivoId,
      accion: abrir ? 'abrir' : 'mantener',
    });
    /**
     * Devuelve `aceptada`, **nunca «abierta»**, igual que el adaptador real.
     * Si el simulado afirmara más que el equipo, la suite pasaría con una
     * afirmación que el hardware no sostiene — y ese es exactamente el falso
     * verde que ADR-03 existe para impedir (LSP, KPI-12).
     */
    return ordenAceptada(0);
  }

  async fijarBloqueo(dispositivoId: string, bloqueado: boolean): Promise<ResultadoDeAccionamiento> {
    this.bitacora.registrar('info', 'orden de bloqueo (proveedor SIMULADO)', {
      dispositivoId,
      bloqueado,
    });
    return ordenAceptada(0);
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

  /**
   * Segunda escritura, después de accionar. La primera —el rastro— ya ocurrió y
   * no depende de ésta: si ésta falla, la orden sigue registrada.
   */
  async anotarResultado(
    id: string,
    resultado: EstadoDeAccionamiento,
    detalle: string | null,
  ): Promise<void> {
    for (const [copropiedad, lista] of this.porCopropiedad) {
      const indice = lista.findIndex((o) => o.id === id);
      if (indice === -1) continue;
      const actualizada = [...lista];
      actualizada[indice] = { ...lista[indice]!, resultado, detalle };
      this.porCopropiedad.set(copropiedad, actualizada);
      return;
    }
  }

  async ultimas(copropiedadId: string, cuantas: number): Promise<readonly OrdenEjecutada[]> {
    return (this.porCopropiedad.get(copropiedadId) ?? []).slice(0, cuantas);
  }
}

/**
 * Registro de bloqueos vigentes, en memoria.
 *
 * Provisional como la bitácora de órdenes y por el mismo motivo (D-70): la
 * frontera ya es definitiva, el adaptador PostgreSQL entra con su tabla. Lo que
 * NO es provisional es que el estado tenga dueño y fecha: un bloqueo anónimo es
 * el fallo de operación que este registro existe para impedir.
 */
@Injectable()
export class RegistroDeBloqueosEnMemoria implements RegistroDeBloqueos {
  private readonly porAcceso = new Map<string, BloqueoVigente>();

  private static clave(copropiedadId: string, dispositivoId: string): string {
    return `${copropiedadId}::${dispositivoId}`;
  }

  async fijar(bloqueo: BloqueoVigente): Promise<void> {
    this.porAcceso.set(
      RegistroDeBloqueosEnMemoria.clave(bloqueo.copropiedadId, bloqueo.dispositivoId),
      bloqueo,
    );
  }

  async anotarResultado(
    copropiedadId: string,
    dispositivoId: string,
    resultado: EstadoDeAccionamiento,
    detalle: string | null,
  ): Promise<void> {
    const clave = RegistroDeBloqueosEnMemoria.clave(copropiedadId, dispositivoId);
    const actual = this.porAcceso.get(clave);
    if (actual === undefined) return;
    this.porAcceso.set(clave, { ...actual, resultado, detalle });
  }

  async vigente(copropiedadId: string, dispositivoId: string): Promise<BloqueoVigente | null> {
    return (
      this.porAcceso.get(RegistroDeBloqueosEnMemoria.clave(copropiedadId, dispositivoId)) ?? null
    );
  }

  async todos(copropiedadId: string): Promise<readonly BloqueoVigente[]> {
    return [...this.porAcceso.values()].filter((b) => b.copropiedadId === copropiedadId);
  }
}
