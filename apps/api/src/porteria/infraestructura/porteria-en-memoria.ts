import { randomUUID } from 'node:crypto';
import { contiene, seSolapan } from '../dominio/turno';
import type { Franja } from '../dominio/turno';
import type { CambioDeSesion, SesionDePorteria } from '../dominio/sesion-de-porteria';
import type {
  DatosDeTurno,
  NuevaSesion,
  PerfilDePortero,
  RepositorioDePerfiles,
  RepositorioDeSesiones,
  RepositorioDeTurnos,
  TurnoRegistrado,
} from '../aplicacion/puertos';

/** Perfiles en memoria: doble de la suite y del ensayo sin base. */
export class PerfilesEnMemoria implements RepositorioDePerfiles {
  private readonly filas = new Map<string, PerfilDePortero>();
  private clave = (c: string, u: string): string => `${c}|${u}`;

  async perfilDe(copropiedadId: string, usuarioId: string): Promise<PerfilDePortero | null> {
    return this.filas.get(this.clave(copropiedadId, usuarioId)) ?? null;
  }
  async perfiles(copropiedadId: string): Promise<readonly PerfilDePortero[]> {
    return [...this.filas.values()].filter((p) => p.copropiedadId === copropiedadId);
  }
  async guardar(perfil: PerfilDePortero): Promise<void> {
    this.filas.set(this.clave(perfil.copropiedadId, perfil.usuarioId), {
      ...perfil,
      sectores: [...perfil.sectores],
    });
  }
}

/** Turnos en memoria. La franja la trae el caso de uso, calculada por el dominio. */
export class TurnosEnMemoria implements RepositorioDeTurnos {
  private readonly filas = new Map<string, TurnoRegistrado>();

  async vigenteDe(
    copropiedadId: string,
    porteroId: string,
    instante: Date,
  ): Promise<TurnoRegistrado | null> {
    return (
      [...this.filas.values()].find(
        (t) =>
          t.copropiedadId === copropiedadId &&
          t.porteroId === porteroId &&
          t.activo &&
          contiene(t.franja, instante),
      ) ?? null
    );
  }
  async porId(copropiedadId: string, turnoId: string): Promise<TurnoRegistrado | null> {
    const t = this.filas.get(turnoId);
    return t !== undefined && t.copropiedadId === copropiedadId ? t : null;
  }
  async entre(
    copropiedadId: string,
    desde: Date,
    hasta: Date,
  ): Promise<readonly TurnoRegistrado[]> {
    const ventana: Franja = { inicio: desde, fin: hasta };
    return [...this.filas.values()]
      .filter((t) => t.copropiedadId === copropiedadId && t.activo && seSolapan(t.franja, ventana))
      .sort((a, b) => a.franja.inicio.getTime() - b.franja.inicio.getTime());
  }
  async guardar(
    copropiedadId: string,
    turno: DatosDeTurno & { readonly id?: string; readonly franja: Franja },
  ): Promise<TurnoRegistrado | null> {
    if (turno.id !== undefined && (await this.porId(copropiedadId, turno.id)) === null) return null;
    const id = turno.id ?? randomUUID();
    const registrado: TurnoRegistrado = { ...turno, id, copropiedadId, activo: true };
    this.filas.set(id, registrado);
    return registrado;
  }
  async retirar(copropiedadId: string, turnoId: string): Promise<boolean> {
    const t = await this.porId(copropiedadId, turnoId);
    if (t === null) return false;
    this.filas.set(turnoId, { ...t, activo: false });
    return true;
  }
}

/** Sesiones en memoria, con la misma regla que la base: una cerrada no se reabre. */
export class SesionesEnMemoria implements RepositorioDeSesiones {
  private readonly filas = new Map<string, SesionDePorteria>();

  async de(copropiedadId: string, sesionId: string): Promise<SesionDePorteria | null> {
    const s = this.filas.get(sesionId);
    return s !== undefined && s.copropiedadId === copropiedadId ? s : null;
  }
  async abrir(n: NuevaSesion): Promise<void> {
    if (this.filas.has(n.sesionId)) throw new Error('sesión de portería duplicada');
    this.filas.set(n.sesionId, {
      sesionId: n.sesionId,
      copropiedadId: n.copropiedadId,
      porteroId: n.porteroId,
      turnoId: n.turnoId,
      estado: 'activa',
      codigoHash: n.codigoHash,
      intentosFallidos: 0,
      iniciadaEn: n.iniciadaEn,
      patrullajeDesde: null,
      cerradaEn: null,
      motivoCierre: null,
      origenDeclarado: n.origen.declarado,
    });
  }
  async actualizar(
    copropiedadId: string,
    sesionId: string,
    cambio: CambioDeSesion,
  ): Promise<SesionDePorteria | null> {
    const s = await this.de(copropiedadId, sesionId);
    if (s === null || s.estado === 'cerrada') return null;
    const nueva: SesionDePorteria = { ...s, ...cambio };
    this.filas.set(sesionId, nueva);
    return nueva;
  }
  async registrarIntentoFallido(copropiedadId: string, sesionId: string): Promise<number | null> {
    const s = await this.de(copropiedadId, sesionId);
    if (s === null || s.estado !== 'patrullaje') return null;
    const intentos = Math.min(s.intentosFallidos + 1, 5);
    this.filas.set(sesionId, { ...s, intentosFallidos: intentos });
    return intentos;
  }
  async abiertas(copropiedadId: string, porteroId?: string): Promise<readonly SesionDePorteria[]> {
    return [...this.filas.values()].filter(
      (s) =>
        s.copropiedadId === copropiedadId &&
        s.estado !== 'cerrada' &&
        (porteroId === undefined || s.porteroId === porteroId),
    );
  }
}
