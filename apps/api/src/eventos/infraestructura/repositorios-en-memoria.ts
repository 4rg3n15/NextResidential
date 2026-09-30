import type { Acceso, Alerta, FiltroDeEventos, TipoDeAlerta } from '@ncr/domain-core';
import type {
  EventoDeEquipoGuardado,
  EventoDeEquipoNuevo,
  FiltroDeEventosDeEquipo,
  RepositorioEventosDeEquipo,
} from '../aplicacion/eventos-de-equipo';
import type {
  EstadoObservado,
  EventoRegistrado,
  FiltroDeAlertas,
  LatidoDeDispositivo,
  PaginaDeEventos,
  RepositorioAlertas,
  RepositorioDispositivos,
  RepositorioEventos,
  ResultadoAnexado,
  UltimaAlerta,
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

  /** E5 (15-M) · el archivo es lógico también aquí: la alerta queda, marcada. */
  private readonly archivadas = new Map<string, { motivo: string; por: string; en: Date }>();

  async abiertasDe(copropiedadId: string, filtro?: FiltroDeAlertas): Promise<readonly Alerta[]> {
    return [...this.porId_.values()].filter(
      (a) =>
        a.copropiedadId === copropiedadId &&
        a.estado !== 'resuelta' &&
        !this.archivadas.has(`${copropiedadId}|${a.id}`) &&
        ((filtro?.dispositivoId ?? null) === null || a.dispositivoId === filtro?.dispositivoId) &&
        ((filtro?.severidad ?? null) === null || a.severidad === filtro?.severidad) &&
        ((filtro?.tipo ?? null) === null || a.tipo === filtro?.tipo),
    );
  }

  async ultimaDe(
    copropiedadId: string,
    dispositivoId: string,
    tipo: TipoDeAlerta,
    clave?: string,
  ): Promise<UltimaAlerta | null> {
    const candidatas = [...this.porId_.values()]
      .filter(
        (a) =>
          a.copropiedadId === copropiedadId &&
          a.dispositivoId === dispositivoId &&
          a.tipo === tipo &&
          (clave === undefined || (a.notas ?? '').startsWith(`[${clave}]`)),
      )
      .sort((a, b) => b.generadaEn.getTime() - a.generadaEn.getTime());
    const ultima = candidatas[0];
    return ultima === undefined
      ? null
      : {
          id: ultima.id,
          generadaEn: ultima.generadaEn,
          estado: ultima.estado,
          archivada: this.archivadas.has(`${copropiedadId}|${ultima.id}`),
        };
  }

  async archivar(
    copropiedadId: string,
    alertaIds: readonly string[],
    motivo: string,
    actorId: string,
    ahora: Date,
  ): Promise<number> {
    let n = 0;
    for (const id of alertaIds) {
      const clave = `${copropiedadId}|${id}`;
      if (!this.porId_.has(clave) || this.archivadas.has(clave)) continue;
      this.archivadas.set(clave, { motivo, por: actorId, en: ahora });
      n += 1;
    }
    return n;
  }

  /** Sólo para pruebas: el archivo de una alerta, si lo hay. */
  archivoDe(copropiedadId: string, alertaId: string): { motivo: string; por: string } | null {
    return this.archivadas.get(`${copropiedadId}|${alertaId}`) ?? null;
  }
}

export class RepositorioDispositivosEnMemoria implements RepositorioDispositivos {
  private readonly latidos_ = new Map<string, LatidoDeDispositivo>();
  /** E5 (15-M) · el último estado observado por equipo; para pruebas. */
  readonly estados = new Map<string, EstadoObservado & { readonly en: Date }>();

  async registrarEstado(
    copropiedadId: string,
    dispositivoId: string,
    observado: EstadoObservado,
    ahora: Date,
  ): Promise<void> {
    this.estados.set(`${copropiedadId}|${dispositivoId}`, { ...observado, en: ahora });
  }

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
      // Con forma de UUID, como en la base: el id viaja como `eventoId` en la
      // orden manual que lo atiende (G1, 15-N), y ese campo se valida como UUID.
      id: `ee000000-0000-4000-8000-${String(this.contador).padStart(12, '0')}`,
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
    // G1 (15-N) · por recepción, como la base (la cola de atención).
    const hora = (e: EventoDeEquipoGuardado): Date =>
      f.porRecepcion === true ? e.recibidoEn : e.ocurridoEn;
    return this.filas
      .filter(
        (e) =>
          e.copropiedadId === f.copropiedadId &&
          hora(e) >= f.desde &&
          hora(e) < f.hasta &&
          (f.dispositivoId === undefined ||
            f.dispositivoId === null ||
            e.dispositivoId === f.dispositivoId) &&
          (f.tipo === undefined || f.tipo === null || e.tipo === f.tipo) &&
          (f.tipos === undefined || f.tipos === null || f.tipos.includes(e.tipo)) &&
          (f.soloEnVivo !== true || (e.enVivo && e.origen === 'equipo')),
      )
      .sort((a, b) => hora(b).getTime() - hora(a).getTime())
      .slice(0, f.limite);
  }
}
