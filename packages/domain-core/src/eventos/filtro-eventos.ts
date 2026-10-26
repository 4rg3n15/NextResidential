import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio, MotivoAcceso } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';
import type { TipoDeEvento } from './acceso';
import type { MetodoDeAcceso } from '../reglas/contexto';
import { Placa } from '../padron/placa';

/**
 * Objeto de valor `FiltroDeEventos` — HU-32, y el hueco D-05 del mockup.
 *
 * La auditoría de mockups registró que el filtro dibujado no cubre HU-32: le
 * faltan el rango de fechas y la vivienda. El filtro se define aquí, en el
 * dominio, con lo que la historia exige, y la pantalla de la ETAPA 09 se hace
 * contra él; al revés —derivarlo de la pantalla— habría heredado el hueco.
 *
 * Se valida al construir, y por eso el caso de uso no puede recibir un rango
 * invertido ni una página de diez mil filas: un `LIMIT` sin techo es una
 * denegación de servicio contra la propia base con una petición legítima.
 */
export const TAMANO_PAGINA_MAXIMO = 200;
export const RANGO_MAXIMO_DIAS = 366;

/**
 * D-145 · si el evento identificó a ALGUIEN (persona_id) o no: «Identificación:
 * conocida / desconocida» del buscador de la consola (decisión del 23/10).
 */
export type IdentificacionDeEvento = 'conocida' | 'desconocida';

export interface CriteriosDeEventos {
  readonly copropiedadId: string;
  readonly desde: Date;
  /** Fin del rango, EXCLUIDO — igual que `Vigencia`, por el mismo motivo. */
  readonly hasta: Date;
  readonly viviendaId?: string | null;
  readonly personaId?: string | null;
  readonly dispositivoId?: string | null;
  readonly zonaId?: string | null;
  readonly tipo?: TipoDeEvento | null;
  readonly resultado?: 'permitido' | 'negado' | null;
  readonly motivo?: MotivoAcceso | null;
  /** D-145 · se NORMALIZA con `Placa` antes de consultar: `abc-123` busca `ABC123`. */
  readonly placa?: string | null;
  /** D-145 · quién abrió o negó a mano. */
  readonly operadorId?: string | null;
  readonly metodo?: MetodoDeAcceso | null;
  readonly identificacion?: IdentificacionDeEvento | null;
  readonly tamanoPagina?: number;
  readonly cursor?: string | null;
}

type CamposDelFiltro = {
  readonly [K in keyof CriteriosDeEventos]-?: Exclude<CriteriosDeEventos[K], undefined>;
};

export class FiltroDeEventos {
  readonly copropiedadId: string;
  readonly desde: Date;
  readonly hasta: Date;
  readonly viviendaId: string | null;
  readonly personaId: string | null;
  readonly dispositivoId: string | null;
  readonly zonaId: string | null;
  readonly tipo: TipoDeEvento | null;
  readonly resultado: 'permitido' | 'negado' | null;
  readonly motivo: MotivoAcceso | null;
  /** Ya normalizada: la forma del `CHECK eventos_placa_normalizada`. */
  readonly placa: string | null;
  readonly operadorId: string | null;
  readonly metodo: MetodoDeAcceso | null;
  readonly identificacion: IdentificacionDeEvento | null;
  readonly tamanoPagina: number;
  readonly cursor: string | null;

  /**
   * D-145 · un solo objeto en vez de dieciséis parámetros posicionales: con
   * cuatro filtros más, el orden de los argumentos dejaba de poder leerse.
   */
  private constructor(c: CamposDelFiltro) {
    this.copropiedadId = c.copropiedadId;
    this.desde = c.desde;
    this.hasta = c.hasta;
    this.viviendaId = c.viviendaId;
    this.personaId = c.personaId;
    this.dispositivoId = c.dispositivoId;
    this.zonaId = c.zonaId;
    this.tipo = c.tipo;
    this.resultado = c.resultado;
    this.motivo = c.motivo;
    this.placa = c.placa;
    this.operadorId = c.operadorId;
    this.metodo = c.metodo;
    this.identificacion = c.identificacion;
    this.tamanoPagina = c.tamanoPagina;
    this.cursor = c.cursor;
    Object.freeze(this);
  }

  static crear(c: CriteriosDeEventos): Resultado<FiltroDeEventos, ErrorDominio> {
    if (c.copropiedadId.length === 0) {
      return fallo(errorDominio('DATO_INVALIDO', 'El filtro se acota a una copropiedad', 'RN-15'));
    }
    if (Number.isNaN(c.desde.getTime()) || Number.isNaN(c.hasta.getTime())) {
      return fallo(errorDominio('DATO_INVALIDO', 'El rango de fechas no es válido'));
    }
    if (c.hasta.getTime() <= c.desde.getTime()) {
      return fallo(errorDominio('DATO_INVALIDO', 'El fin del rango debe ser posterior al inicio'));
    }

    // `eventos` está particionada por mes: un rango abierto obligaría a recorrer
    // todas las particiones y a mantener el resultado entero en memoria. El
    // techo se pone aquí y no en el adaptador para que la exportación tenga el
    // mismo límite que la consulta.
    const dias = (c.hasta.getTime() - c.desde.getTime()) / 86_400_000;
    if (dias > RANGO_MAXIMO_DIAS) {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          `El rango no puede superar ${RANGO_MAXIMO_DIAS} días; acota o exporta por tramos`,
        ),
      );
    }

    const tamano = c.tamanoPagina ?? 50;
    if (!Number.isInteger(tamano) || tamano < 1 || tamano > TAMANO_PAGINA_MAXIMO) {
      return fallo(
        errorDominio('DATO_INVALIDO', `El tamaño de página está entre 1 y ${TAMANO_PAGINA_MAXIMO}`),
      );
    }

    // D-145 · la placa se busca como la guarda la base: normalizada por el
    // mismo objeto de valor que la escribió. Una placa que no es placa es un
    // 400 con motivo, no una búsqueda que nunca encuentra nada.
    let placa: string | null = null;
    if (c.placa !== undefined && c.placa !== null && c.placa.trim() !== '') {
      const normalizada = Placa.crear(c.placa);
      if (!normalizada.ok) return normalizada;
      placa = normalizada.valor.valor;
    }

    return exito(
      new FiltroDeEventos({
        copropiedadId: c.copropiedadId,
        desde: new Date(c.desde.getTime()),
        hasta: new Date(c.hasta.getTime()),
        viviendaId: c.viviendaId ?? null,
        personaId: c.personaId ?? null,
        dispositivoId: c.dispositivoId ?? null,
        zonaId: c.zonaId ?? null,
        tipo: c.tipo ?? null,
        resultado: c.resultado ?? null,
        motivo: c.motivo ?? null,
        placa,
        operadorId: c.operadorId ?? null,
        metodo: c.metodo ?? null,
        identificacion: c.identificacion ?? null,
        tamanoPagina: tamano,
        cursor: c.cursor ?? null,
      }),
    );
  }

  /**
   * D-145 · ¿pide algo que sólo un ACCESO tiene? Persona, vivienda, zona,
   * resultado, motivo, placa, operador, método o identificación: un evento de
   * equipo (puerta forzada, timbre) no los lleva y no puede cumplirlos.
   */
  get soloDeAccesos(): boolean {
    return [
      this.viviendaId,
      this.personaId,
      this.zonaId,
      this.resultado,
      this.motivo,
      this.placa,
      this.operadorId,
      this.metodo,
      this.identificacion,
    ].some((v) => v !== null);
  }
}
