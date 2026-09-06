import type { BusDeEventos, EventoDeDominio, ManejadorDeEvento } from './evento-de-dominio';

/**
 * Bus en memoria. Vive en el dominio porque no hace I/O: solo despacha.
 *
 * Un manejador que falla NO tumba a los demás ni al publicador: se recoge y se
 * informa. Si un fallo al notificar por push pudiera abortar el registro de un
 * evento de acceso, la trazabilidad quedaría a merced de un servicio externo,
 * que es justo lo que OE-05 no admite.
 */
export class BusDeEventosEnMemoria implements BusDeEventos {
  private readonly manejadores = new Map<string, ManejadorDeEvento[]>();

  constructor(private readonly alFallar?: (evento: EventoDeDominio, error: unknown) => void) {}

  suscribir(nombre: string, manejador: ManejadorDeEvento): void {
    const actuales = this.manejadores.get(nombre) ?? [];
    this.manejadores.set(nombre, [...actuales, manejador]);
  }

  async publicar(evento: EventoDeDominio): Promise<void> {
    const manejadores = this.manejadores.get(evento.nombre) ?? [];
    const resultados = await Promise.allSettled(manejadores.map((m) => m(evento)));
    for (const r of resultados) {
      if (r.status === 'rejected') this.alFallar?.(evento, r.reason);
    }
  }
}
