import type { Bitacora } from '@ncr/domain-core';
import type { Planificador, TrabajoProgramado } from '../aplicacion/puertos';

/**
 * Planificador que **registra y no ejecuta**.
 *
 * Existe para los despliegues sin planificador —la suite, el contrato, un
 * proceso que solo sirve HTTP— y no es un objeto nulo mudo: al arrancar escribe
 * qué trabajos NO va a ejecutar y con qué horario. La diferencia importa. Un
 * silencio deja creer que el barrido de plantillas está corriendo; esta línea
 * dice que no, y RN-11 tiene un plazo legal detrás.
 *
 * `ejecutarAhora` permite dispararlos a mano: es lo que usa la prueba y lo que
 * permite a un operador forzar un barrido sin esperar al cron.
 */
export class PlanificadorInerte implements Planificador {
  private readonly trabajos: TrabajoProgramado[] = [];

  constructor(
    private readonly bitacora: Bitacora,
    private readonly motivo: string,
  ) {}

  get programados(): readonly TrabajoProgramado[] {
    return this.trabajos;
  }

  programar(trabajo: TrabajoProgramado): void {
    this.trabajos.push(trabajo);
  }

  async arrancar(): Promise<void> {
    for (const trabajo of this.trabajos) {
      this.bitacora.registrar('aviso', 'trabajo programado NO se ejecutará', {
        trabajo: trabajo.nombre,
        cron: trabajo.cron,
        motivo: this.motivo,
      });
    }
  }

  async detener(): Promise<void> {
    /* no hay nada que detener */
  }

  /** Dispara un trabajo por su nombre. Devuelve `null` si no está programado. */
  async ejecutarAhora(nombre: string): Promise<Readonly<Record<string, number>> | null> {
    const trabajo = this.trabajos.find((t) => t.nombre === nombre);
    return trabajo === undefined ? null : trabajo.ejecutar();
  }
}
