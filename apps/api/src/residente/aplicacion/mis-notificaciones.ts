import { exito } from '@ncr/domain-core';
import type { ErrorDominio, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import type { AutorizacionDelResidente, DirectorioDelResidente } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-L · LO QUE LA APP DEL RESIDENTE VE DE SUS VISITAS, IGUAL QUE LA CONSOLA
 *
 * La app y la consola comparten la API: el estado de una visita no se calcula
 * en el teléfono. Aquí se deriva, con el reloj del servidor, lo que la tarjeta
 * de la app enseña —vigente, programada, vencida o rechazada con el motivo que
 * escribió portería o superadministración— y lo que la pantalla de
 * notificaciones lista.
 *
 * Todo sale del directorio del residente, que ya está acotado a SU vivienda y
 * SU copropiedad (el ámbito lo resuelve `ResolverMiAmbito` desde su vínculo):
 * no hay una consulta nueva que pudiera olvidarse de acotar.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const SITUACIONES_DE_VISITA = ['vigente', 'programada', 'vencida', 'rechazada'] as const;
export type SituacionDeVisita = (typeof SITUACIONES_DE_VISITA)[number];

export const situacionDe = (
  a: Pick<AutorizacionDelResidente, 'estado' | 'desde' | 'hasta'>,
  ahora: Date,
): SituacionDeVisita => {
  if (a.estado === 'revocada') return 'rechazada';
  if (new Date(a.hasta).getTime() <= ahora.getTime()) return 'vencida';
  if (new Date(a.desde).getTime() > ahora.getTime()) return 'programada';
  return 'vigente';
};

export interface MiVisitaConSituacion
  extends Omit<AutorizacionDelResidente, 'revocadaEn' | 'motivoRevocacion'> {
  readonly situacion: SituacionDeVisita;
  /** El motivo que escribió quien la rechazó; `null` si no está rechazada. */
  readonly motivoRechazo: string | null;
}

export const conSituacion = (a: AutorizacionDelResidente, ahora: Date): MiVisitaConSituacion => {
  const situacion = situacionDe(a, ahora);
  return {
    id: a.id,
    visitante: a.visitante,
    tipo: a.tipo,
    desde: a.desde,
    hasta: a.hasta,
    placa: a.placa,
    permiteAccesoVehicular: a.permiteAccesoVehicular,
    estado: a.estado,
    acompanantes: a.acompanantes,
    situacion,
    motivoRechazo: situacion === 'rechazada' ? a.motivoRevocacion : null,
  };
};

export const TIPOS_DE_NOTIFICACION = ['visita_rechazada', 'ingreso_de_visitante'] as const;
export type TipoDeNotificacion = (typeof TIPOS_DE_NOTIFICACION)[number];

export interface NotificacionDelResidente {
  /** Estable: la app la usa para saber qué ya vio. */
  readonly id: string;
  readonly tipo: TipoDeNotificacion;
  readonly en: string;
  readonly visitante: string | null;
  readonly motivo: string | null;
  readonly autorizacionId: string | null;
}

/** Las de los últimos 30 días, las 50 más recientes. */
export const VENTANA_DE_NOTIFICACIONES_MS = 30 * 24 * 3_600_000;
export const MAXIMO_DE_NOTIFICACIONES = 50;

/**
 * Las notificaciones de SU vivienda, de más reciente a más antigua: las visitas
 * rechazadas —con el motivo— y los ingresos de sus visitantes.
 */
export const notificacionesDe = (
  autorizaciones: readonly AutorizacionDelResidente[],
  eventos: readonly {
    readonly id: string;
    readonly ocurridoEn: string;
    readonly resultado: string | null;
    readonly persona: string | null;
    readonly deVisitante: boolean;
  }[],
  ahora: Date,
): readonly NotificacionDelResidente[] => {
  const desde = ahora.getTime() - VENTANA_DE_NOTIFICACIONES_MS;
  const rechazadas = autorizaciones
    .filter((a) => a.estado === 'revocada' && a.revocadaEn !== null)
    .map(
      (a): NotificacionDelResidente => ({
        id: `rechazo-${a.id}`,
        tipo: 'visita_rechazada',
        en: a.revocadaEn ?? '',
        visitante: a.visitante,
        motivo: a.motivoRevocacion,
        autorizacionId: a.id,
      }),
    );
  const ingresos = eventos
    .filter((e) => e.deVisitante && e.resultado === 'permitido')
    .map(
      (e): NotificacionDelResidente => ({
        id: `ingreso-${e.id}`,
        tipo: 'ingreso_de_visitante',
        en: e.ocurridoEn,
        visitante: e.persona,
        motivo: null,
        autorizacionId: null,
      }),
    );
  return [...rechazadas, ...ingresos]
    .filter((n) => new Date(n.en).getTime() >= desde)
    .sort((x, y) => y.en.localeCompare(x.en))
    .slice(0, MAXIMO_DE_NOTIFICACIONES);
};

/** `GET …/mi/notificaciones` · lo que le importa al residente, desde la API. */
export class VerMisNotificaciones {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    private readonly directorio: DirectorioDelResidente,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<Resultado<readonly NotificacionDelResidente[], ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { ambito } = r.valor;
    const [autorizaciones, eventos] = await Promise.all([
      this.directorio.autorizaciones(ambito),
      this.directorio.historial(ambito, { periodo: 'mes', limite: 200 }),
    ]);
    return exito(notificacionesDe(autorizaciones, eventos, this.reloj.ahora()));
  }
}

/** `GET …/mi/autorizaciones` con la situación que enseña la tarjeta de la app. */
export class VerMisVisitasConSituacion {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    private readonly directorio: DirectorioDelResidente,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<Resultado<readonly MiVisitaConSituacion[], ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const ahora = this.reloj.ahora();
    const lista = await this.directorio.autorizaciones(r.valor.ambito);
    return exito(lista.map((a) => conSituacion(a, ahora)));
  }
}
