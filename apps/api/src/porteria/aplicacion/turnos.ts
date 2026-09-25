import { exito, fallo } from '@ncr/domain-core';
import type { Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { BitacoraDeIdentidad } from '../../comun/bitacora-de-identidad';
import { esDia, esHora, franjaDe, seSolapan } from '../dominio/turno';
import type {
  DatosDeTurno,
  RepositorioDePerfiles,
  RepositorioDeTurnos,
  TurnoRegistrado,
  ZonasHorarias,
} from './puertos';

export type RechazoDeTurno =
  | { readonly motivo: 'FORMATO'; readonly detalle: string }
  | { readonly motivo: 'NO_ENCONTRADO' }
  | { readonly motivo: 'TERMINADO' };

export interface TurnoConSolapes {
  readonly turno: TurnoRegistrado;
  /** Otros turnos activos de la MISMA portería que se solapan. Se permiten y se registran. */
  readonly solapes: readonly TurnoRegistrado[];
}

/** Ventana máxima de consulta del calendario: dos meses y un poco. */
export const DIAS_MAXIMOS_DE_CONSULTA = 62;

/**
 * CALENDARIO DE TURNOS · sólo el superadministrador (ADR-024, B4).
 *
 * Asignar, editar y retirar; los turnos EXTRA exigen motivo. Los solapes con
 * otro portero de la misma portería se permiten —el relevo se cruza— y quedan
 * en la bitácora. Un turno ya terminado no se edita ni se retira: es historia
 * y la bitácora de sesiones lo cita.
 */
export class CalendarioDeTurnos {
  constructor(
    private readonly turnos: RepositorioDeTurnos,
    private readonly perfiles: RepositorioDePerfiles,
    private readonly zonas: ZonasHorarias,
    private readonly bitacora: BitacoraDeIdentidad,
    private readonly reloj: Reloj,
  ) {}

  async asignar(
    ctx: ContextoTenant,
    copropiedadId: string,
    datos: DatosDeTurno,
  ): Promise<Resultado<TurnoConSolapes, RechazoDeTurno>> {
    return this.guardar(ctx, copropiedadId, datos, undefined);
  }

  async editar(
    ctx: ContextoTenant,
    copropiedadId: string,
    turnoId: string,
    datos: DatosDeTurno,
  ): Promise<Resultado<TurnoConSolapes, RechazoDeTurno>> {
    const actual = await this.turnos.porId(copropiedadId, turnoId);
    if (actual === null || !actual.activo) return fallo({ motivo: 'NO_ENCONTRADO' });
    if (actual.franja.fin.getTime() <= this.reloj.ahora().getTime())
      return fallo({ motivo: 'TERMINADO' });
    return this.guardar(ctx, copropiedadId, datos, turnoId);
  }

  async retirar(
    ctx: ContextoTenant,
    copropiedadId: string,
    turnoId: string,
    motivo: string,
  ): Promise<Resultado<void, RechazoDeTurno>> {
    const ahora = this.reloj.ahora();
    const actual = await this.turnos.porId(copropiedadId, turnoId);
    if (actual === null || !actual.activo) return fallo({ motivo: 'NO_ENCONTRADO' });
    if (actual.franja.fin.getTime() <= ahora.getTime()) return fallo({ motivo: 'TERMINADO' });
    await this.turnos.retirar(copropiedadId, turnoId, motivo, ctx.usuarioId, ahora);
    await this.bitacora.anotar({
      tipo: 'turno_retirado',
      copropiedadId,
      ocurridoEn: ahora,
      usuarioId: actual.porteroId,
      actorId: ctx.usuarioId,
      turnoId,
      detalle: motivo,
    });
    return exito(undefined);
  }

  async listar(
    copropiedadId: string,
    desde: Date,
    hasta: Date,
  ): Promise<Resultado<readonly TurnoRegistrado[], RechazoDeTurno>> {
    const dias = (hasta.getTime() - desde.getTime()) / 86_400_000;
    if (!(dias > 0) || dias > DIAS_MAXIMOS_DE_CONSULTA) {
      return fallo({
        motivo: 'FORMATO',
        detalle: `El rango va de 1 a ${DIAS_MAXIMOS_DE_CONSULTA} días`,
      });
    }
    return exito(await this.turnos.entre(copropiedadId, desde, hasta));
  }

  private async guardar(
    ctx: ContextoTenant,
    copropiedadId: string,
    d: DatosDeTurno,
    turnoId: string | undefined,
  ): Promise<Resultado<TurnoConSolapes, RechazoDeTurno>> {
    const invalido = this.invalido(d);
    if (invalido !== null) return fallo({ motivo: 'FORMATO', detalle: invalido });
    const perfil = await this.perfiles.perfilDe(copropiedadId, d.porteroId);
    const zona = await this.zonas.de(copropiedadId);
    if (perfil === null || zona === null) return fallo({ motivo: 'NO_ENCONTRADO' });

    const porteria = d.porteria ?? perfil.porteria;
    const franja = franjaDe(d.dia, d.horaInicio, d.horaFin, zona);
    const turno = await this.turnos.guardar(
      copropiedadId,
      { ...d, porteria, franja, ...(turnoId === undefined ? {} : { id: turnoId }) },
      ctx.usuarioId,
    );
    if (turno === null) return fallo({ motivo: 'NO_ENCONTRADO' });

    const solapes = (
      await this.turnos.entre(copropiedadId, turno.franja.inicio, turno.franja.fin)
    ).filter(
      (t) =>
        t.id !== turno.id && t.porteria === turno.porteria && seSolapan(t.franja, turno.franja),
    );
    const ahora = this.reloj.ahora();
    const base = {
      copropiedadId,
      ocurridoEn: ahora,
      usuarioId: turno.porteroId,
      actorId: ctx.usuarioId,
      turnoId: turno.id,
    };
    await this.bitacora.anotar({
      ...base,
      tipo:
        turnoId !== undefined
          ? 'turno_editado'
          : turno.tipo === 'extra'
            ? 'turno_extra'
            : 'turno_asignado',
      detalle: turno.tipo === 'extra' ? turno.motivo : null,
    });
    if (solapes.length > 0) {
      await this.bitacora.anotar({
        ...base,
        tipo: 'solape_de_turno',
        detalle: `se solapa con ${solapes.length} turno(s) de la misma portería`,
      });
    }
    return exito({ turno, solapes });
  }

  private invalido(d: DatosDeTurno): string | null {
    if (!esDia(d.dia)) return 'El día es una fecha AAAA-MM-DD válida';
    if (!esHora(d.horaInicio) || !esHora(d.horaFin)) return 'Las horas van en formato HH:MM';
    if (d.horaInicio === d.horaFin)
      return 'El turno necesita una hora de fin distinta de la de inicio';
    if (d.tipo === 'extra' && (d.motivo === null || d.motivo.trim().length < 5)) {
      return 'Un turno extra exige un motivo de al menos 5 caracteres';
    }
    return null;
  }
}
