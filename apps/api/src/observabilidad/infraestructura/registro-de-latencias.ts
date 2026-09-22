import { CLAVES_KPI, KPIS } from '../aplicacion/kpis';
import type { ClaveKpi } from '../aplicacion/kpis';
import { resumirMuestras } from '../aplicacion/percentiles';
import type { FilaDeLatencia, Metricas, ResumenDeLatencias } from '../aplicacion/puertos';
import type { Reloj } from '@ncr/domain-core';

/**
 * Registro de latencias en memoria: un **anillo acotado** por indicador.
 *
 * POR QUÉ UN ANILLO Y NO UN ACUMULADOR. Un contador de suma y cuenta da la
 * media, y la media es exactamente la cifra que oculta el incumplimiento: diez
 * mil peticiones de 30 ms y cinco de 9 s dan una media de 34 ms con cinco
 * accesos fuera de plazo dentro. Los percentiles exigen las muestras, y
 * guardarlas todas no acota la memoria de un proceso que corre semanas. El
 * anillo guarda las últimas `ventana` y descarta la más antigua.
 *
 * LO QUE EL ANILLO NO PUEDE PERDER, y por eso va aparte: `observadas` y
 * `incumplimientos` son contadores desde el arranque. Si vivieran dentro del
 * anillo, una ráfaga de tráfico sano borraría el rastro de los incumplimientos
 * de hace una hora y el tablero diría «0 incumplimientos» sobre un día que
 * tuvo cuarenta.
 *
 * `null` EN `cumple` NO ES `false`. Sin muestras no hay nada que juzgar, y un
 * tablero recién arrancado que pintara «cumple» en verde estaría afirmando algo
 * que nadie ha medido.
 *
 * ALCANCE DECLARADO: es **por proceso**. Con más de una instancia de API cada
 * una tiene su anillo, igual que `CanalEnProceso` (D-29). Para un despliegue de
 * varias instancias la salida hay que agregarla fuera; queda anotado como
 * deuda, no disimulado con una cifra que parecería global sin serlo.
 */
const VENTANA_POR_OMISION = 2_048;

class Anillo {
  private readonly buffer: number[] = [];
  private siguiente = 0;
  observadas = 0;
  incumplimientos = 0;

  constructor(private readonly capacidad: number) {}

  anotar(ms: number, umbralMs: number): void {
    this.observadas += 1;
    if (ms > umbralMs) this.incumplimientos += 1;
    if (this.buffer.length < this.capacidad) this.buffer.push(ms);
    else {
      this.buffer[this.siguiente] = ms;
      this.siguiente = (this.siguiente + 1) % this.capacidad;
    }
  }

  muestras(): readonly number[] {
    return this.buffer;
  }
}

export class RegistroDeLatencias implements Metricas {
  private readonly anillos = new Map<ClaveKpi, Anillo>();
  private readonly desde: Date;

  constructor(
    reloj: Reloj,
    private readonly ventana: number = VENTANA_POR_OMISION,
  ) {
    this.desde = reloj.ahora();
    for (const clave of CLAVES_KPI) this.anillos.set(clave, new Anillo(ventana));
  }

  observar(kpi: ClaveKpi, milisegundos: number): void {
    // Una medición negativa o no finita no es una latencia: es un reloj mal
    // puesto o una resta contra `undefined`. Se descarta en vez de envenenar
    // el percentil, que es lo que haría un `-3` colado entre las muestras.
    if (!Number.isFinite(milisegundos) || milisegundos < 0) return;
    this.anillos.get(kpi)?.anotar(milisegundos, KPIS[kpi].umbralMs);
  }

  resumen(): ResumenDeLatencias {
    const filas: FilaDeLatencia[] = CLAVES_KPI.map((clave) => {
      const anillo = this.anillos.get(clave);
      const definicion = KPIS[clave];
      const resumen = resumirMuestras(anillo?.muestras() ?? []);
      return {
        ...resumen,
        definicion,
        observadas: anillo?.observadas ?? 0,
        incumplimientos: anillo?.incumplimientos ?? 0,
        cumple: resumen.p95 === null ? null : resumen.p95 <= definicion.umbralMs,
      };
    });
    return { desde: this.desde.toISOString(), ventana: this.ventana, filas };
  }

  /** Para las pruebas y para el arranque en frío: no hay ruta que lo exponga. */
  reiniciar(): void {
    for (const clave of CLAVES_KPI) this.anillos.set(clave, new Anillo(this.ventana));
  }

  /** Instante de arranque del registro; lo fija el reloj INYECTADO (§2.4). */
  get inicio(): Date {
    return this.desde;
  }
}
