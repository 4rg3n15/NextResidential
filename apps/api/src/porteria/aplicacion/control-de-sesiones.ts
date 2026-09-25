import type { Reloj } from '@ncr/domain-core';
import type { BitacoraDeIdentidad } from '../../comun/bitacora-de-identidad';
import type { GanchoDeSesion, OrigenDeAcceso, VeredictoDeSesion } from '../../cuentas';
import { contiene, duracionSegundos } from '../dominio/turno';
import { alCerrar } from '../dominio/sesion-de-porteria';
import type { MotivoDeCierre, SesionDePorteria } from '../dominio/sesion-de-porteria';
import type {
  CodigoDePatrullaje,
  RepositorioDePerfiles,
  RepositorioDeSesiones,
  RepositorioDeTurnos,
  TurnoRegistrado,
} from './puertos';

/** Lo que la guarda necesita saber de la sesión de ESTA petición. */
export type EstadoDeLaPeticion =
  | { readonly tipo: 'sin_registro' }
  | { readonly tipo: 'cerrada'; readonly motivo: MotivoDeCierre | null }
  | { readonly tipo: 'fuera_de_turno' }
  | {
      readonly tipo: 'activa' | 'patrullaje';
      readonly sesion: SesionDePorteria;
      readonly turno: TurnoRegistrado;
    };

export interface IdentidadDeLaPeticion {
  readonly copropiedadId: string | null;
  readonly usuarioId: string;
  readonly sesionId: string | undefined;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CONTROL DE SESIONES DEL PORTERO (ADR-024)
 *
 * Es el gancho que cuentas invoca al entrar, salir y restablecer, y es lo que
 * la guarda global consulta en CADA petición de un portero. Las dos cosas en
 * un solo sitio porque son la misma regla vista desde dos momentos: sin turno
 * vigente no se entra, y al acabar el turno se sale.
 *
 * El relevo es automático por turno PROPIO: si al terminar la franja el mismo
 * portero tiene otro turno vigente —uno extra a continuación—, la sesión pasa
 * a ese turno con su código nuevo; si no, se cierra con `fin_de_turno`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class ControlDeSesiones implements GanchoDeSesion {
  constructor(
    private readonly perfiles: RepositorioDePerfiles,
    private readonly turnos: RepositorioDeTurnos,
    private readonly sesiones: RepositorioDeSesiones,
    private readonly codigo: CodigoDePatrullaje,
    private readonly bitacora: BitacoraDeIdentidad,
    private readonly reloj: Reloj,
  ) {}

  async alIniciar(e: {
    readonly usuarioId: string;
    readonly copropiedadId: string;
    readonly sesionId: string;
    readonly origen: OrigenDeAcceso;
  }): Promise<VeredictoDeSesion> {
    const ahora = this.reloj.ahora();
    const perfil = await this.perfiles.perfilDe(e.copropiedadId, e.usuarioId);
    const turno =
      perfil === null ? null : await this.turnos.vigenteDe(e.copropiedadId, e.usuarioId, ahora);
    if (turno === null) {
      await this.bitacora.anotar({
        tipo: 'acceso_rechazado',
        copropiedadId: e.copropiedadId,
        ocurridoEn: ahora,
        usuarioId: e.usuarioId,
        actorId: e.usuarioId,
        origen: e.origen,
        detalle: perfil === null ? 'sin perfil de portero' : 'fuera de turno',
      });
      return {
        permitido: false,
        motivo:
          perfil === null
            ? 'La cuenta no tiene perfil de portero'
            : 'Fuera de su turno: no tiene un turno vigente en este momento',
      };
    }
    const hash = await this.codigo.hash(
      this.codigo.derivar(e.copropiedadId, turno.id, e.usuarioId),
    );
    await this.sesiones.abrir({
      sesionId: e.sesionId,
      copropiedadId: e.copropiedadId,
      porteroId: e.usuarioId,
      turnoId: turno.id,
      codigoHash: hash,
      iniciadaEn: ahora,
      origen: e.origen,
    });
    await this.bitacora.anotar({
      tipo: 'inicio_de_sesion',
      copropiedadId: e.copropiedadId,
      ocurridoEn: ahora,
      usuarioId: e.usuarioId,
      actorId: e.usuarioId,
      sesionId: e.sesionId,
      turnoId: turno.id,
      origen: e.origen,
    });
    return { permitido: true };
  }

  async alCerrar(e: {
    readonly usuarioId: string;
    readonly copropiedadId: string;
    readonly sesionId: string;
  }): Promise<void> {
    const s = await this.sesiones.de(e.copropiedadId, e.sesionId);
    if (s === null || s.porteroId !== e.usuarioId || s.estado === 'cerrada') return;
    await this.cerrar(s, 'manual', e.usuarioId);
  }

  async alRestablecer(e: {
    readonly usuarioId: string;
    readonly copropiedadId: string;
    readonly actorId: string;
  }): Promise<void> {
    for (const s of await this.sesiones.abiertas(e.copropiedadId, e.usuarioId)) {
      await this.cerrar(s, 'restablecimiento', e.actorId);
    }
  }

  /** Lo que la guarda consulta en cada petición del portero. */
  async validar(id: IdentidadDeLaPeticion): Promise<EstadoDeLaPeticion> {
    if (id.copropiedadId === null || id.sesionId === undefined) return { tipo: 'sin_registro' };
    const s = await this.sesiones.de(id.copropiedadId, id.sesionId);
    if (s === null || s.porteroId !== id.usuarioId) return { tipo: 'sin_registro' };
    if (s.estado === 'cerrada') return { tipo: 'cerrada', motivo: s.motivoCierre };

    const ahora = this.reloj.ahora();
    const propio = await this.turnos.porId(s.copropiedadId, s.turnoId);
    if (propio !== null && propio.activo && contiene(propio.franja, ahora)) {
      return { tipo: s.estado, sesion: s, turno: propio };
    }
    const siguiente = await this.turnos.vigenteDe(s.copropiedadId, s.porteroId, ahora);
    if (siguiente !== null) {
      const hash = await this.codigo.hash(
        this.codigo.derivar(s.copropiedadId, siguiente.id, s.porteroId),
      );
      const relevada = await this.sesiones.actualizar(
        s.copropiedadId,
        s.sesionId,
        { turnoId: siguiente.id, codigoHash: hash },
        s.porteroId,
      );
      if (relevada !== null && relevada.estado !== 'cerrada') {
        return { tipo: relevada.estado, sesion: relevada, turno: siguiente };
      }
    }
    await this.cerrar(s, 'fin_de_turno', s.porteroId);
    return { tipo: 'fuera_de_turno' };
  }

  /** Cierra y deja constancia con la duración. Compartido con el patrullaje. */
  async cerrar(s: SesionDePorteria, motivo: MotivoDeCierre, actorId: string): Promise<void> {
    const ahora = this.reloj.ahora();
    const cerrada = await this.sesiones.actualizar(
      s.copropiedadId,
      s.sesionId,
      alCerrar(motivo, ahora),
      actorId,
    );
    if (cerrada === null) return;
    await this.bitacora.anotar({
      tipo: 'cierre_de_sesion',
      copropiedadId: s.copropiedadId,
      ocurridoEn: ahora,
      usuarioId: s.porteroId,
      actorId,
      sesionId: s.sesionId,
      turnoId: s.turnoId,
      duracionSegundos: duracionSegundos(s.iniciadaEn, ahora),
      detalle: motivo,
    });
  }
}
