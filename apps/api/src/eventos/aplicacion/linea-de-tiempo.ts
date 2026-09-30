import { FiltroDeEventos, esFallo, exito } from '@ncr/domain-core';
import type { ErrorDominio, MotivoAcceso, Resultado } from '@ncr/domain-core';
import type { EventoRegistrado, RepositorioEventos } from './puertos';
import type { EventoDeEquipoGuardado, RepositorioEventosDeEquipo } from './eventos-de-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA LÍNEA DE TIEMPO DE LA CONSOLA DE EVENTOS · 15-L (Bloque B2)
 *
 * Une en una sola lista, de lo más reciente a lo más antiguo, los ACCESOS
 * (`eventos`, lo que decidió el motor) y los EVENTOS DE EQUIPO (todo lo demás
 * que el equipo emitió y lo que la plataforma le hizo). Filtros: equipo, tipo
 * y fecha. `tipo = acceso` deja sólo los accesos; un tipo de equipo, sólo ese.
 *
 * El título va en español y sin jerga (Bloque I): el motivo de una negación
 * se traduce aquí, no en cada pantalla.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ElementoDeLineaDeTiempo {
  /** `acceso` (motor), `equipo` (lo emitió el aparato) o `plataforma`. */
  readonly origen: 'acceso' | 'equipo' | 'plataforma';
  readonly id: string;
  readonly ocurridoEn: string;
  readonly dispositivoId: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly resultado: 'permitido' | 'negado' | null;
  readonly enVivo: boolean;
  /** Para un acceso, su id; para un evento de equipo, el acceso al que acompaña. */
  readonly eventoId: string | null;
  readonly codigo: { readonly mayor: number; readonly menor: number } | null;
  /**
   * R2 (15-N) · con el reloj del equipo desviado, `ocurridoEn` es la hora de
   * RECEPCIÓN de la plataforma y aquí van la que dijo el equipo y el desvío
   * (segundos que iba por delante; negativo, atrasado). `null` si no lo estaba.
   */
  readonly horaDelEquipo: string | null;
  readonly relojDesviadoSegundos: number | null;
}

export interface CriteriosDeLineaDeTiempo {
  readonly copropiedadId: string;
  readonly desde: Date;
  readonly hasta: Date;
  readonly dispositivoId: string | null;
  readonly tipo: string | null;
  readonly limite: number;
}

const MOTIVO: Readonly<Record<MotivoAcceso, string>> = {
  VIGENCIA_EXPIRADA: 'autorización fuera de vigencia',
  AFORO_SUPERADO: 'aforo de la zona completo',
  LISTA_NEGRA: 'persona o placa en lista negra',
  ZONA_NO_AUTORIZADA: 'sin permiso sobre esa zona',
  FUERA_DE_PATRON: 'fuera del patrón de recurrencia',
  FUERA_DE_HORARIO: 'fuera del horario de la zona',
  SIN_CONSENTIMIENTO: 'sin consentimiento biométrico vigente',
  PLACA_DESCONOCIDA: 'placa no registrada',
  CONFIANZA_INSUFICIENTE: 'lectura dudosa: la confirma la portería',
  FALLO_TECNICO: 'sin datos para decidir',
};

const METODO: Readonly<Record<string, string>> = {
  placa: 'placa',
  facial: 'rostro',
  manual: 'a mano',
  qr: 'código QR',
  tarjeta: 'tarjeta',
};

/**
 * R2 (15-N) · el videoportero del 29/09 fechaba 13 h atrás y la consola
 * enseñaba sus eventos «de madrugada». Si el equipo declaró una hora que se
 * aparta de la de recepción más de lo tolerado, se enseña la de RECEPCIÓN y
 * se marca el desvío. No aplica a lo histórico ni a lo que decidió el Edge
 * sin conexión: ésos llegan tarde a propósito, no con el reloj mal.
 */
const horaMostrada = (
  ocurridoEn: Date,
  recibidoEn: Date | undefined,
  aplica: boolean,
  toleranciaS: number | undefined,
): Pick<ElementoDeLineaDeTiempo, 'ocurridoEn' | 'horaDelEquipo' | 'relojDesviadoSegundos'> => {
  const tal = {
    ocurridoEn: ocurridoEn.toISOString(),
    horaDelEquipo: null,
    relojDesviadoSegundos: null,
  };
  if (!aplica || toleranciaS === undefined || recibidoEn === undefined) return tal;
  const desvio = Math.round((ocurridoEn.getTime() - recibidoEn.getTime()) / 1000);
  if (Math.abs(desvio) <= toleranciaS) return tal;
  return {
    ocurridoEn: recibidoEn.toISOString(),
    horaDelEquipo: ocurridoEn.toISOString(),
    relojDesviadoSegundos: desvio,
  };
};

const deAcceso = (e: EventoRegistrado, toleranciaS?: number): ElementoDeLineaDeTiempo => {
  const como = METODO[e.metodo] ?? e.metodo;
  const placa = e.placaDetectada === null ? '' : ` ${e.placaDetectada}`;
  const titulo =
    e.resultado === 'permitido'
      ? `Acceso permitido · ${como}${placa}`
      : `Acceso negado · ${como}${placa} · ${e.motivo === null ? 'sin motivo' : MOTIVO[e.motivo]}`;
  return {
    origen: 'acceso',
    id: e.id,
    ...horaMostrada(e.ocurridoEn, e.registradoEn, !e.decididoPorEdge, toleranciaS),
    dispositivoId: e.dispositivoId,
    tipo: 'acceso',
    titulo,
    resultado: e.resultado,
    enVivo: true,
    eventoId: e.id,
    codigo: null,
  };
};

const deEquipo = (e: EventoDeEquipoGuardado, toleranciaS?: number): ElementoDeLineaDeTiempo => ({
  origen: e.origen,
  id: e.id,
  ...horaMostrada(e.ocurridoEn, e.recibidoEn, e.enVivo && e.origen === 'equipo', toleranciaS),
  dispositivoId: e.dispositivoId,
  tipo: e.tipo,
  titulo: e.enVivo ? e.titulo : `${e.titulo} (histórico del equipo)`,
  resultado: null,
  enVivo: e.enVivo,
  eventoId: e.eventoId,
  codigo:
    e.codigoMayor === null || e.codigoMenor === null
      ? null
      : { mayor: e.codigoMayor, menor: e.codigoMenor },
});

export class ConsultarLineaDeTiempo {
  constructor(
    private readonly accesos: RepositorioEventos,
    private readonly deEquipo: RepositorioEventosDeEquipo,
    /** R2 (15-N) · `EQUIPOS_DESVIO_DE_RELOJ_S`. Sin él, la hora es la del equipo, como antes. */
    private readonly toleranciaDeRelojS?: number,
  ) {}

  async ejecutar(
    c: CriteriosDeLineaDeTiempo,
  ): Promise<Resultado<{ readonly elementos: readonly ElementoDeLineaDeTiempo[] }, ErrorDominio>> {
    // El rango lo valida el objeto de valor de los accesos, también cuando
    // sólo se piden eventos de equipo: un rango incoherente no es de nadie.
    const filtro = FiltroDeEventos.crear({
      copropiedadId: c.copropiedadId,
      desde: c.desde,
      hasta: c.hasta,
      viviendaId: null,
      personaId: null,
      dispositivoId: c.dispositivoId,
      zonaId: null,
      tipo: null,
      resultado: null,
      motivo: null,
      tamanoPagina: c.limite,
      cursor: null,
    });
    if (esFallo(filtro)) return filtro;

    const soloAccesos = c.tipo === 'acceso';
    const soloEquipo = c.tipo !== null && !soloAccesos;
    const [accesos, delEquipo] = await Promise.all([
      soloEquipo ? Promise.resolve([]) : this.accesos.consultar(filtro.valor).then((p) => p.filas),
      soloAccesos
        ? Promise.resolve([])
        : this.deEquipo.consultar({
            copropiedadId: c.copropiedadId,
            desde: c.desde,
            hasta: c.hasta,
            dispositivoId: c.dispositivoId,
            tipo: soloEquipo ? c.tipo : null,
            limite: c.limite,
          }),
    ]);
    const tolerancia = this.toleranciaDeRelojS;
    const elementos = [
      ...accesos.map((a) => deAcceso(a, tolerancia)),
      ...delEquipo.map((e) => deEquipo(e, tolerancia)),
    ]
      .sort((a, b) => b.ocurridoEn.localeCompare(a.ocurridoEn))
      .slice(0, c.limite);
    return exito({ elementos });
  }
}
