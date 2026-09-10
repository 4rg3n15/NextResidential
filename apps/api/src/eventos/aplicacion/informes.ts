import { FiltroDeEventos } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import { esExito, exito } from '@ncr/domain-core';
import type { EventoRegistrado, RepositorioEventos } from './puertos';

/**
 * Informes — HU-32, pantalla W-10 del mockup.
 *
 * **Los cuatro tipos salen del MISMO hecho: el evento.** No hay cuatro
 * consultas distintas ni cuatro tablas: hay una lectura de eventos acotada por
 * rango y cuatro formas de agregarla. Es lo que hace que los cuatro informes no
 * puedan contradecirse entre sí, que es el problema real de los sistemas de
 * informes: dos cifras del mismo día que no cuadran porque las calculó otra
 * consulta.
 *
 * `auditoria` es el caso aparte y por eso está declarado como tal: la
 * «bitácora de acciones del personal» que pide el mockup son las aperturas y
 * denegaciones MANUALES —las que llevan `operadorId` y `motivoManual`—, no
 * todo el tránsito. Un informe de auditoría que incluye cada paso de cada
 * residente no es una auditoría: es ruido con otro nombre.
 */
export type TipoDeInforme =
  | 'accesos_por_periodo'
  | 'visitantes_frecuentes'
  | 'uso_de_zonas'
  | 'auditoria_de_sistema';

export interface ParametrosDeInforme {
  readonly copropiedadId: string;
  readonly tipo: TipoDeInforme;
  readonly desde: Date;
  readonly hasta: Date;
  readonly viviendaId?: string | null;
  readonly dispositivoId?: string | null;
}

export interface FilaDeInforme {
  readonly momento: string;
  readonly titular: string;
  readonly vivienda: string;
  readonly dispositivo: string;
  readonly metodo: string;
  readonly resultado: 'permitido' | 'negado';
  readonly detalle: string;
}

export interface PuntoDeFrecuencia {
  /** Lunes de la semana ISO, en formato `YYYY-MM-DD`. */
  readonly semana: string;
  readonly total: number;
}

export interface Informe {
  readonly tipo: TipoDeInforme;
  readonly desde: string;
  readonly hasta: string;
  readonly total: number;
  readonly filas: readonly FilaDeInforme[];
  readonly frecuencia: readonly PuntoDeFrecuencia[];
  /** Verdadero si se alcanzó el tope: la interfaz lo dice en vez de mentir. */
  readonly truncado: boolean;
  /**
   * Limitaciones REALES de este informe, en texto, para que la pantalla las
   * muestre. No es cortesía: el mockup pide filtrar por «Residentes / Visitas»
   * y **el evento no registra esa distinción** —tiene `personaId`, no si esa
   * persona era residente o visitante—, así que un filtro que lo prometiera
   * estaría inventando. Se dice en vez de fingirlo (D-58).
   */
  readonly notas: readonly string[];
}

/** Tope de filas en la vista previa. La exportación completa va por su ruta. */
const TOPE_DE_VISTA_PREVIA = 500;

const lunesDe = (fecha: Date): string => {
  const d = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
  // ISO: lunes = 1. `getUTCDay()` da domingo = 0, así que domingo retrocede 6.
  const desplazamiento = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - desplazamiento);
  return d.toISOString().slice(0, 10);
};

export class GenerarInforme {
  constructor(private readonly repositorio: RepositorioEventos) {}

  async ejecutar(p: ParametrosDeInforme): Promise<Resultado<Informe, ErrorDominio>> {
    const filtro = FiltroDeEventos.crear({
      copropiedadId: p.copropiedadId,
      desde: p.desde,
      hasta: p.hasta,
      viviendaId: p.viviendaId ?? null,
      dispositivoId: p.dispositivoId ?? null,
      tamanoPagina: TOPE_DE_VISTA_PREVIA,
    });
    if (!esExito(filtro)) return filtro;

    const pagina = await this.repositorio.consultar(filtro.valor);
    const eventos = pagina.filas.filter((e) => this.entra(e, p));
    const notas = this.notasDe(p.tipo);

    if (p.tipo === 'auditoria_de_sistema' && eventos.length === 0 && pagina.filas.length > 0) {
      // No es un error: es un informe vacío, y la interfaz tiene su estado para
      // eso. Se distingue explícitamente de «no hubo tránsito» porque son cosas
      // distintas y el operador merece saber cuál de las dos ocurrió.
      return exito(this.vacio(p, notas));
    }

    return exito({
      tipo: p.tipo,
      desde: p.desde.toISOString(),
      hasta: p.hasta.toISOString(),
      total: eventos.length,
      filas: eventos.map((e) => this.fila(e)),
      frecuencia: this.frecuencia(eventos),
      truncado: pagina.siguiente !== null,
      notas,
    });
  }

  /** El tipo de informe no cambia la consulta: cambia qué eventos cuentan. */
  private entra(e: EventoRegistrado, p: ParametrosDeInforme): boolean {
    switch (p.tipo) {
      case 'visitantes_frecuentes':
        // Lo más cerca que el evento permite estar de «visitante»: un ingreso
        // con persona identificada. NO se filtra por «es visitante» porque el
        // evento no guarda esa condición — ver `notasDe`.
        return e.personaId !== null && e.tipo === 'ingreso';
      case 'uso_de_zonas':
        return e.zonaId !== null;
      case 'auditoria_de_sistema':
        // Solo lo que una PERSONA decidió: apertura o denegación manual.
        return e.operadorId !== null;
      case 'accesos_por_periodo':
      default:
        return true;
    }
  }

  private notasDe(tipo: TipoDeInforme): readonly string[] {
    if (tipo !== 'visitantes_frecuentes') return [];
    return [
      'El evento registra la persona, no si era residente o visitante: este informe cuenta ' +
        'ingresos con persona identificada, de los dos tipos. La distinción exige cruzar con ' +
        'el padrón y entra con la ETAPA 10 (D-58).',
    ];
  }

  private fila(e: EventoRegistrado): FilaDeInforme {
    return {
      momento: e.ocurridoEn.toISOString(),
      // Los identificadores salen tal cual y NO se resuelven a nombres aquí: la
      // resolución exige el padrón, y un informe que hace un viaje por fila
      // deja de poder generarse. La consola los presenta con lo que ya tiene.
      titular: e.personaId ?? e.placaDetectada ?? '—',
      vivienda: e.viviendaId ?? '—',
      dispositivo: e.dispositivoId,
      metodo: e.metodo,
      resultado: e.resultado,
      detalle:
        e.motivoManual ?? e.motivo ?? (e.decididoPorEdge ? 'decidido en el Edge' : e.reglaAplicada),
    };
  }

  private frecuencia(eventos: readonly EventoRegistrado[]): readonly PuntoDeFrecuencia[] {
    const porSemana = new Map<string, number>();
    for (const e of eventos) {
      const semana = lunesDe(e.ocurridoEn);
      porSemana.set(semana, (porSemana.get(semana) ?? 0) + 1);
    }
    return [...porSemana.entries()]
      .map(([semana, total]) => ({ semana, total }))
      .sort((a, b) => a.semana.localeCompare(b.semana));
  }

  private vacio(p: ParametrosDeInforme, notas: readonly string[]): Informe {
    return {
      tipo: p.tipo,
      desde: p.desde.toISOString(),
      hasta: p.hasta.toISOString(),
      total: 0,
      filas: [],
      frecuencia: [],
      truncado: false,
      notas,
    };
  }
}
