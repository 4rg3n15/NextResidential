import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio, MotivoAcceso } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';
import type { TipoDeEvento } from './acceso';

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
  readonly tamanoPagina?: number;
  readonly cursor?: string | null;
}

export class FiltroDeEventos {
  private constructor(
    readonly copropiedadId: string,
    readonly desde: Date,
    readonly hasta: Date,
    readonly viviendaId: string | null,
    readonly personaId: string | null,
    readonly dispositivoId: string | null,
    readonly zonaId: string | null,
    readonly tipo: TipoDeEvento | null,
    readonly resultado: 'permitido' | 'negado' | null,
    readonly motivo: MotivoAcceso | null,
    readonly tamanoPagina: number,
    readonly cursor: string | null,
  ) {
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

    return exito(
      new FiltroDeEventos(
        c.copropiedadId,
        new Date(c.desde.getTime()),
        new Date(c.hasta.getTime()),
        c.viviendaId ?? null,
        c.personaId ?? null,
        c.dispositivoId ?? null,
        c.zonaId ?? null,
        c.tipo ?? null,
        c.resultado ?? null,
        c.motivo ?? null,
        tamano,
        c.cursor ?? null,
      ),
    );
  }
}
