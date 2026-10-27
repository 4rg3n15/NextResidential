import { createHash } from 'node:crypto';
import { FiltroDeEventos, TAMANO_PAGINA_MAXIMO, esFallo } from '@ncr/domain-core';
import type { EventoRegistrado, RepositorioEventos } from '../puertos';
import type { ResolutorDeNombres } from '../nombres-de-eventos';
import type { DiaDelRespaldo } from './dias';
import { rutaDelRespaldo } from './dias';
import type {
  AlmacenDeRespaldos,
  FilaDelRespaldo,
  FormatoDelRespaldo,
  RepositorioDeRespaldos,
  RespaldoGuardado,
} from './puertos';

/**
 * D-147 · GENERA EL RESPALDO DE UN DÍA, SI AÚN NO EXISTE
 *
 * Lee los accesos del día —sólo lee: `eventos` es append-only (RN-03)—, los
 * nombra por lotes como el buscador (D-145), los escribe con el serializador de
 * la exportación y guarda el fichero en el bucket privado. La FILA de
 * `respaldos_de_eventos` es la constancia y se escribe la última: si la
 * ejecución muere entre el fichero y la fila, el día sigue «sin respaldo» y la
 * siguiente lo vuelve a generar. Un día con fila no se regenera nunca.
 *
 * Riesgo residual, declarado: dos ejecuciones a la vez sobre el MISMO día (la
 * programada y una a mano en el mismo instante) suben el fichero las dos antes
 * de que exista la fila. Los eventos de un día pasado no cambian, así que el
 * contenido es el mismo; si un nombre cambió justo entre las dos, la huella de
 * la fila puede no ser la del fichero, y el envío lo detecta (la comprueba).
 */

/**
 * Más de esto en un día no es una portería: es un fallo. No se trunca —un
 * respaldo incompleto parecería completo—: se rechaza y se dice.
 */
export const MAXIMO_DE_EVENTOS_POR_DIA = 100_000;

const sinNulos = (ids: readonly (string | null)[]): string[] => [
  ...new Set(ids.filter((x): x is string => x !== null)),
];

export const sha256 = (contenido: Uint8Array): string =>
  createHash('sha256').update(contenido).digest('hex');

export class GenerarRespaldo {
  constructor(
    private readonly eventos: RepositorioEventos,
    private readonly nombres: ResolutorDeNombres,
    private readonly formato: FormatoDelRespaldo,
    private readonly almacen: AlmacenDeRespaldos,
    private readonly respaldos: RepositorioDeRespaldos,
  ) {}

  /** Devuelve el respaldo del día: el que ya había o el recién generado. */
  async ejecutar(
    copropiedadId: string,
    dia: DiaDelRespaldo,
    actorId: string,
  ): Promise<{ readonly respaldo: RespaldoGuardado; readonly generado: boolean }> {
    const existente = await this.respaldos.porFecha(copropiedadId, dia.fecha);
    if (existente !== null) return { respaldo: existente, generado: false };

    const accesos = await this.leerElDia(copropiedadId, dia);
    const filas = await this.nombrar(copropiedadId, accesos);
    const contenido = this.formato.serializar(filas);
    const ruta = rutaDelRespaldo(copropiedadId, dia.fecha);
    await this.almacen.guardar(ruta, contenido);
    const respaldo = await this.respaldos.registrar(
      {
        copropiedadId,
        fecha: dia.fecha,
        ruta,
        numeroDeEventos: accesos.length,
        permitidos: accesos.filter((a) => a.resultado === 'permitido').length,
        negados: accesos.filter((a) => a.resultado === 'negado').length,
        sha256: sha256(contenido),
        tamanoBytes: contenido.byteLength,
      },
      actorId,
    );
    return { respaldo, generado: true };
  }

  /** Todas las páginas del día, en orden cronológico. */
  private async leerElDia(
    copropiedadId: string,
    dia: DiaDelRespaldo,
  ): Promise<readonly EventoRegistrado[]> {
    const filas: EventoRegistrado[] = [];
    let cursor: string | null = null;
    do {
      const filtro = FiltroDeEventos.crear({
        copropiedadId,
        desde: dia.desde,
        hasta: dia.hasta,
        tamanoPagina: TAMANO_PAGINA_MAXIMO,
        cursor,
      });
      if (esFallo(filtro)) throw new Error(filtro.error.detalle);
      const pagina = await this.eventos.consultar(filtro.valor);
      filas.push(...pagina.filas);
      if (filas.length > MAXIMO_DE_EVENTOS_POR_DIA) {
        throw new Error(
          `el ${dia.fecha} tiene más de ${String(MAXIMO_DE_EVENTOS_POR_DIA)} eventos: ` +
            'no se genera un respaldo truncado',
        );
      }
      cursor = pagina.siguiente;
    } while (cursor !== null);
    // El repositorio pagina de lo más reciente a lo más antiguo; el Excel, al revés.
    return filas.reverse();
  }

  private async nombrar(
    copropiedadId: string,
    accesos: readonly EventoRegistrado[],
  ): Promise<readonly FilaDelRespaldo[]> {
    const nombres = await this.nombres.resolver(copropiedadId, {
      personas: sinNulos(accesos.map((a) => a.personaId)),
      viviendas: sinNulos(accesos.map((a) => a.viviendaId)),
      operadores: sinNulos(accesos.map((a) => a.operadorId)),
      dispositivos: sinNulos(accesos.map((a) => a.dispositivoId)),
    });
    return accesos.map((a) => {
      const persona = a.personaId === null ? undefined : nombres.personas.get(a.personaId);
      return {
        ocurridoEn: a.ocurridoEn,
        tipo: a.tipo,
        resultado: a.resultado,
        motivo: a.motivo,
        metodo: a.metodo,
        persona: a.personaId === null ? null : (persona?.nombre ?? 'Persona registrada'),
        clasePersona: persona?.clase ?? null,
        vivienda: a.viviendaId === null ? null : (nombres.viviendas.get(a.viviendaId) ?? null),
        placa: a.placaDetectada,
        equipo: nombres.dispositivos.get(a.dispositivoId) ?? null,
        operador: a.operadorId === null ? null : (nombres.operadores.get(a.operadorId) ?? null),
        motivoManual: a.motivoManual,
      };
    });
  }
}
