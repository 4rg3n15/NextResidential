import { setTimeout as esperar } from 'node:timers/promises';
import type { IgualadorDeTiempo } from '../aplicacion/puertos';

/** Reloj monótono: el de pared puede saltar y el cálculo del resto saldría negativo. */
export class IgualadorDeTiempoReal implements IgualadorDeTiempo {
  ahoraMs(): number {
    return performance.now();
  }

  async esperarHasta(inicioMs: number, minimoMs: number): Promise<void> {
    const resto = minimoMs - (performance.now() - inicioMs);
    if (resto > 0) await esperar(resto);
  }
}
