import type { Acceso, Alerta, FiltroDeEventos } from '@ncr/domain-core';
import type {
  EventoDeEquipoGuardado,
  EventoDeEquipoNuevo,
  FiltroDeEventosDeEquipo,
  RepositorioEventosDeEquipo,
} from '../aplicacion/eventos-de-equipo';
import type {
  EventoRegistrado,
  LatidoDeDispositivo,
  PaginaDeEventos,
  RepositorioAlertas,
  RepositorioDispositivos,
  RepositorioEventos,
  ResultadoAnexado,
} from '../aplicacion/puertos';
import { cursorDe, filtrarYPaginar, mapearAcceso } from './proyeccion-eventos';

/**
 * Adaptadores en memoria — **provisionales y declarados como tales**.
 *
 * Este entorno no tiene contraseña de PostgreSQL (D-17), así que la API arranca
 * con estos. No simulan una garantía que no dan: la inmutabilidad real la
 * imponen los permisos y el trigger de la base (ADR-005), y aquí solo se
 * respeta por construcción. Lo que sí es definitivo es el PUERTO que cumplen:
 * `RepositorioEventosPg` implementa exactamente el mismo, y la misma suite de
 * contrato corre contra los dos (LSP, §2.3).
 *
 * `anexar` reproduce la semántica que da el índice único de la migración 0011:
 * el segundo intento con la misma clave devuelve `duplicado` con el id del
 * primero, sin sobrescribir nada.
 */
export class RepositorioEventosEnMemoria implements RepositorioEventos {
  private readonly filas: EventoRegistrado[] = [];
  private readonly porClave = new Map<string, string>();

  async anexar(acceso: Acceso, _actorId: string): Promise<ResultadoAnexado> {
    const clave = `${acceso.copropiedadId}|${acceso.claveIdempotencia}`;
    const previo = this.porClave.get(clave);
    if (previo !== undefined) return { tipo: 'duplicado', id: previo };

    this.porClave.set(clave, acceso.id);
    this.filas.push(mapearAcceso(acceso));
    return { tipo: 'anexado', id: acceso.id };
  }

  async consultar(filtro: FiltroDeEventos): Promise<PaginaDeEventos> {
    return filtrarYPaginar(this.filas, filtro);
  }

  async porId(copropiedadId: string, eventoId: string): Promise<EventoRegistrado | null> {
    return this.filas.find((f) => f.copropiedadId === copropiedadId && f.id === eventoId) ?? null;
  }

  /** Solo para pruebas y para la sonda de latencia: no es parte del puerto. */
  get total(): number {
    return this.filas.length;
  }
}

export class RepositorioAlertasEnMemoria implements RepositorioAlertas {
  private readonly porId_ = new Map<string, Alerta>();

  async guardar(alerta: Alerta, _actorId: string): Promise<void> {
    this.porId_.set(`${alerta.copropiedadId}|${alerta.id}`, alerta);
  }

  async porId(copropiedadId: string, alertaId: string): Promise<Alerta | null> {
    return this.porId_.get(`${copropiedadId}|${alertaId}`) ?? null;
  }

  async abiertasDe(copropiedadId: string): Promise<readonly Alerta[]> {
    return [...this.porId_.values()].filter(
      (a) => a.copropiedadId === copropiedadId && a.estado !== 'resuelta',
    );
  }
}

export class RepositorioDispositivosEnMemoria implements RepositorioDispositivos {
  private readonly latidos_ = new Map<string, LatidoDeDispositivo>();

  async latidos(copropiedadId: string): Promise<readonly LatidoDeDispositivo[]> {
    return [...this.latidos_.values()].filter((l) => l.copropiedadId === copropiedadId);
  }

  async registrarLatido(copropiedadId: string, dispositivoId: string, ahora: Date): Promise<void> {
    this.latidos_.set(`${copropiedadId}|${dispositivoId}`, {
      copropiedadId,
      dispositivoId,
      ultimoLatido: new Date(ahora.getTime()),
    });
  }

  /** Alta de un dispositivo aún sin latir: `null` se trata como caído (P-06). */
  declarar(copropiedadId: string, dispositivoId: string, ultimoLatido: Date | null): void {
    this.latidos_.set(`${copropiedadId}|${dispositivoId}`, {
      copropiedadId,
      dispositivoId,
      ultimoLatido,
    });
  }
}

export { cursorDe };

/**
 * 15-L (Bloque B) · `eventos_de_equipo` en memoria, para la suite sin base.
 * Misma regla de idempotencia que la tabla: la clave repetida no crea fila.
 */
export class RepositorioEventosDeEquipoEnMemoria implements RepositorioEventosDeEquipo {
  readonly filas: EventoDeEquipoGuardado[] = [];
  private contador = 0;

  async registrar(e: EventoDeEquipoNuevo): Promise<EventoDeEquipoGuardado | null> {
    const repetida = this.filas.some(
      (f) => f.copropiedadId === e.copropiedadId && f.claveIdempotencia === e.claveIdempotencia,
    );
    if (repetida) return null;
    this.contador += 1;
    const guardada: EventoDeEquipoGuardado = {
      ...e,
      id: `ee-${String(this.contador).padStart(8, '0')}`,
      recibidoEn: new Date(),
    };
    this.filas.push(guardada);
    return guardada;
  }

  async registrarVarios(eventos: readonly EventoDeEquipoNuevo[]): Promise<number> {
    let nuevos = 0;
    for (const e of eventos) if ((await this.registrar(e)) !== null) nuevos += 1;
    return nuevos;
  }

  async consultar(f: FiltroDeEventosDeEquipo): Promise<readonly EventoDeEquipoGuardado[]> {
    return this.filas
      .filter(
        (e) =>
          e.copropiedadId === f.copropiedadId &&
          e.ocurridoEn >= f.desde &&
          e.ocurridoEn < f.hasta &&
          (f.dispositivoId === undefined ||
            f.dispositivoId === null ||
            e.dispositivoId === f.dispositivoId) &&
          (f.tipo === undefined || f.tipo === null || e.tipo === f.tipo),
      )
      .sort((a, b) => b.ocurridoEn.getTime() - a.ocurridoEn.getTime())
      .slice(0, f.limite);
  }
}
