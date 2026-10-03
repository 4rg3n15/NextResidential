import { randomUUID } from 'node:crypto';
import type { EstadoDeAccionamiento } from '../aplicacion/apertura-manual';
import type {
  AjustesDePuertas,
  ModoVigente,
  NuevaOrdenDeModo,
  RegistroDeModosDePuerta,
} from '../aplicacion/modo-de-puerta';
import { DURACION_POR_OMISION_MIN } from '../aplicacion/modo-de-puerta';

/**
 * 15-R · P-25 · los mismos dos puertos sin base (`PERSISTENCIA_DE_EVENTOS`
 * distinto de postgres): la MISMA regla que la consulta de `modos-de-puerta-pg`
 * —la última orden no normal y no rechazada de cada puerta, sin una normal
 * aceptada después—, sobre una lista. Un reinicio la pierde, y el arranque lo
 * dice (`composicion-de-modos.ts`).
 */
interface Fila extends NuevaOrdenDeModo {
  readonly id: string;
  /** El orden de inserción, como `secuencia` en la base: no empata en el mismo instante. */
  readonly secuencia: number;
  resultado: EstadoDeAccionamiento | null;
  detalle: string | null;
}

const mismaPuerta = (a: Fila, b: Fila): boolean =>
  a.copropiedadId === b.copropiedadId &&
  a.dispositivoId === b.dispositivoId &&
  a.numeroDePuerta === b.numeroDePuerta;

export class RegistroDeModosDePuertaEnMemoria implements RegistroDeModosDePuerta {
  private readonly filas: Fila[] = [];

  async registrar(orden: NuevaOrdenDeModo): Promise<string> {
    const id = randomUUID();
    this.filas.push({ ...orden, id, secuencia: this.filas.length, resultado: null, detalle: null });
    return Promise.resolve(id);
  }

  async anotarResultado(
    _copropiedadId: string,
    id: string,
    resultado: EstadoDeAccionamiento,
    detalle: string | null,
  ): Promise<void> {
    const fila = this.filas.find((f) => f.id === id && f.resultado === null);
    if (fila !== undefined) {
      fila.resultado = resultado;
      fila.detalle = detalle;
    }
    return Promise.resolve();
  }

  async vigentes(copropiedadId: string): Promise<readonly ModoVigente[]> {
    const propias = this.filas.filter((f) => f.copropiedadId === copropiedadId);
    const ultimas = new Map<string, Fila>();
    for (const f of propias) {
      if (f.modo === 'normal' || f.resultado === 'rechazada') continue;
      const clave = `${f.dispositivoId}:${String(f.numeroDePuerta)}`;
      const previa = ultimas.get(clave);
      if (previa === undefined || previa.secuencia < f.secuencia) ultimas.set(clave, f);
    }
    const vigentes: ModoVigente[] = [];
    for (const u of ultimas.values()) {
      const despues = propias.filter(
        (n) => mismaPuerta(n, u) && n.modo === 'normal' && n.secuencia > u.secuencia,
      );
      if (despues.some((n) => n.resultado === 'aceptada')) continue;
      if (u.modo === 'normal' || u.revierteEn === null) continue;
      vigentes.push({
        id: u.id,
        copropiedadId,
        dispositivoId: u.dispositivoId,
        numeroDePuerta: u.numeroDePuerta,
        modo: u.modo,
        motivo: u.motivo,
        operadorId: u.operadorId,
        operadorNombre: null,
        rol: u.rol,
        ordenadaEn: u.ordenadaEn,
        revierteEn: u.revierteEn,
        resultado: u.resultado,
        reversionesFallidas: despues.length,
        ultimoIntento: despues.reduce<Date | null>(
          (m, n) => (m === null || n.ordenadaEn > m ? n.ordenadaEn : m),
          null,
        ),
      });
    }
    return Promise.resolve(
      vigentes.sort((a, b) => a.revierteEn.getTime() - b.revierteEn.getTime()),
    );
  }

  async copropiedadesConVigentes(): Promise<readonly string[]> {
    return Promise.resolve([
      ...new Set(this.filas.filter((f) => f.modo !== 'normal').map((f) => f.copropiedadId)),
    ]);
  }
}

export class AjustesDePuertasEnMemoria implements AjustesDePuertas {
  private readonly duraciones = new Map<string, number>();

  async duracionMaxima(copropiedadId: string): Promise<number> {
    return Promise.resolve(this.duraciones.get(copropiedadId) ?? DURACION_POR_OMISION_MIN);
  }

  async fijarDuracionMaxima(copropiedadId: string, minutos: number): Promise<void> {
    this.duraciones.set(copropiedadId, minutos);
    return Promise.resolve();
  }
}
