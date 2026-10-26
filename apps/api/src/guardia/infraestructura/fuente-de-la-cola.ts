import { FiltroDeEventos, esFallo } from '@ncr/domain-core';
import { motivoDelEquipo } from '@ncr/providers';
import type {
  EventoRegistrado,
  RepositorioEventos,
  RepositorioEventosDeEquipo,
} from '../../eventos';
import type { MaterialDeLaCola } from '../aplicacion/cola-de-atencion';
import type { FuenteDeLaCola } from '../aplicacion/consultar-cola';
import type { BitacoraDeOrdenes } from '../aplicacion/apertura-manual';
import { TIPOS_DE_EQUIPO_QUE_DISPARAN, TIPOS_QUE_TERMINAN_LA_LLAMADA } from '../../eventos';

/**
 * G1 (15-N) · DE DÓNDE SALE LA COLA: TRES PUERTOS QUE YA EXISTEN
 *
 * Los accesos NEGADOS de `eventos`, lo que los equipos emitieron EN VIVO y
 * dispara (o termina una llamada) por hora de RECEPCIÓN, y las órdenes
 * manuales recientes (lo que nombran ya se atendió). Por puertos y no por SQL
 * propio: con base o en memoria es la misma fuente, y la frontera del tenant
 * la pone cada repositorio como siempre.
 */
/**
 * D-144 · con una hora de vigencia, una portería con LPR puede negar más de
 * una página de accesos (cada placa desconocida que pasa es un negado). Los
 * negados se recorren por páginas hasta cubrir la ventana entera; los eventos
 * de equipo y las órdenes, con el mismo tope. Acotado (§2.4: nada sin límite)
 * y muy por encima de lo que cabe en una hora real.
 */
export const TOPE_DE_ACCESOS_EN_LA_VENTANA = 2000;
const PAGINA_DE_ACCESOS = 200;

export class FuenteDeLaColaPorPuertos implements FuenteDeLaCola {
  constructor(
    private readonly eventos: RepositorioEventos,
    private readonly eventosDeEquipo: RepositorioEventosDeEquipo,
    private readonly ordenes: BitacoraDeOrdenes,
  ) {}

  async material(copropiedadId: string, desde: Date, hasta: Date): Promise<MaterialDeLaCola> {
    const [accesos, deEquipos, ordenes] = await Promise.all([
      this.negadosDeLaVentana(copropiedadId, desde, hasta),
      this.eventosDeEquipo.consultar({
        copropiedadId,
        desde,
        hasta,
        porRecepcion: true,
        soloEnVivo: true,
        tipos: [...TIPOS_DE_EQUIPO_QUE_DISPARAN, ...TIPOS_QUE_TERMINAN_LA_LLAMADA],
        limite: TOPE_DE_ACCESOS_EN_LA_VENTANA,
      }),
      // Lo que nombran las órdenes ya se atendió: tienen que alcanzar toda la ventana.
      this.ordenes.ultimas(copropiedadId, TOPE_DE_ACCESOS_EN_LA_VENTANA),
    ]);
    return {
      accesos: accesos.map((a) => ({
        id: a.id,
        ocurridoEn: new Date(a.ocurridoEn),
        resultado: a.resultado,
        motivo: a.motivo,
        metodo: a.metodo,
        dispositivoId: a.dispositivoId,
        viviendaId: a.viviendaId,
        placaDetectada: a.placaDetectada,
        evidenciaId: a.evidenciaId,
      })),
      eventosDeEquipo: deEquipos.map((e) => ({
        id: e.id,
        dispositivoId: e.dispositivoId,
        tipo: e.tipo,
        titulo: e.titulo,
        enVivo: e.enVivo,
        origen: e.origen,
        eventoId: e.eventoId,
        recibidoEn: e.recibidoEn,
        // R2 (15-N) · «permiso vencido» que decidió el equipo: VIGENCIA_EXPIRADA.
        motivo: motivoDelEquipo(e.codigoMayor, e.codigoMenor),
      })),
      atendidos: new Set(
        ordenes.flatMap((o) =>
          o.eventoId === null || o.eventoId === undefined ? [] : [o.eventoId],
        ),
      ),
    };
  }

  /** Todos los negados de la ventana, página a página, hasta el tope. */
  private async negadosDeLaVentana(
    copropiedadId: string,
    desde: Date,
    hasta: Date,
  ): Promise<readonly EventoRegistrado[]> {
    const filas: EventoRegistrado[] = [];
    let cursor: string | null = null;
    do {
      const filtro = FiltroDeEventos.crear({
        copropiedadId,
        desde,
        hasta,
        resultado: 'negado',
        tamanoPagina: PAGINA_DE_ACCESOS,
        cursor,
      });
      if (esFallo(filtro)) throw new Error(filtro.error.detalle);
      const pagina = await this.eventos.consultar(filtro.valor);
      filas.push(...pagina.filas);
      cursor = pagina.siguiente;
    } while (cursor !== null && filas.length < TOPE_DE_ACCESOS_EN_LA_VENTANA);
    return filas;
  }
}
