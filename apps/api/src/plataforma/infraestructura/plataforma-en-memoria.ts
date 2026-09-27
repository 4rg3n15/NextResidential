import type {
  AjustesDePlataforma,
  EventoDeSeguridad,
  RegistroDePresencia,
  RegistroDeSeguridad,
  ReglasDeIp,
  RepositorioDeReglasDeIp,
} from '../aplicacion/puertos';

/**
 * La plataforma sin base (persistencia en memoria: pruebas y desarrollo). Como
 * en PostgreSQL: el modo pruebas empieza ACTIVO (la 0042, H5), las reglas por
 * copropiedad vacías y los fallos se cuentan por (IP, identificador). La suite
 * que prueba una restricción lo apaga ella misma (`sinModoPruebas`).
 */
export class AjustesDePlataformaEnMemoria implements AjustesDePlataforma {
  private activo = true;
  readonly cambios: { readonly activo: boolean; readonly actorId: string }[] = [];

  async modoPruebas(): Promise<boolean> {
    return this.activo;
  }

  async fijarModoPruebas(activo: boolean, actorId: string): Promise<void> {
    this.activo = activo;
    this.cambios.push({ activo, actorId });
  }
}

export class ReglasDeIpEnMemoria implements RepositorioDeReglasDeIp {
  private readonly reglas = new Map<string, ReglasDeIp>();

  async de(copropiedadId: string): Promise<ReglasDeIp> {
    return this.reglas.get(copropiedadId) ?? { ipsPorteria: [], ipsRemotas: [] };
  }

  /** Lo que en PostgreSQL escribe la configuración de la copropiedad. */
  fijar(copropiedadId: string, reglas: ReglasDeIp): void {
    this.reglas.set(copropiedadId, reglas);
  }
}

export class RegistroDePresenciaEnMemoria implements RegistroDePresencia {
  private readonly sesiones = new Map<string, { ip: string; ultima: Date; cerrada: boolean }>();

  async anotar(p: {
    readonly sesionId: string;
    readonly ip: string;
    readonly ahora: Date;
  }): Promise<void> {
    const actual = this.sesiones.get(p.sesionId);
    if (actual?.cerrada === true) return;
    this.sesiones.set(p.sesionId, {
      ip: p.ip.replace(/^::ffff:/i, ''),
      ultima: p.ahora,
      cerrada: false,
    });
  }

  async cerrar(sesionId: string): Promise<void> {
    const actual = this.sesiones.get(sesionId);
    if (actual !== undefined) actual.cerrada = true;
  }

  async ipsActivas(desde: Date): Promise<readonly string[]> {
    return [...this.sesiones.values()]
      .filter((s) => !s.cerrada && s.ultima.getTime() >= desde.getTime())
      .map((s) => s.ip);
  }
}

export class RegistroDeSeguridadEnMemoria implements RegistroDeSeguridad {
  readonly eventos: EventoDeSeguridad[] = [];

  async registrar(e: EventoDeSeguridad): Promise<void> {
    this.eventos.push(e);
  }

  async fallosRecientes(ip: string, identificador: string, desde: Date): Promise<number> {
    const buscada = ip.replace(/^::ffff:/i, '');
    return this.eventos.filter(
      (e) =>
        e.tipo === 'login_fallido' &&
        (e.ip ?? '').replace(/^::ffff:/i, '') === buscada &&
        e.identificador === identificador &&
        e.ocurridoEn.getTime() >= desde.getTime(),
    ).length;
  }
}
