import { FiltroDeEventos, esFallo, exito } from '@ncr/domain-core';
import type {
  AlmacenEvidencia,
  CriteriosDeEventos,
  ErrorDominio,
  Resultado,
} from '@ncr/domain-core';
import type { EventoRegistrado, PaginaDeEventos, RepositorioEventos } from './puertos';

/**
 * Caso de uso `ConsultarEventos` — HU-32.
 *
 * Construye el objeto de valor y deja que él valide. La alternativa —validar
 * aquí— duplicaría la regla en cada consumidor: la consola, la exportación y la
 * app móvil pedirían lo mismo con tres validaciones que se van separando.
 */
export class ConsultarEventos {
  constructor(private readonly repositorio: RepositorioEventos) {}

  async ejecutar(criterios: CriteriosDeEventos): Promise<Resultado<PaginaDeEventos, ErrorDominio>> {
    const filtro = FiltroDeEventos.crear(criterios);
    if (esFallo(filtro)) return filtro;
    return exito(await this.repositorio.consultar(filtro.valor));
  }
}

/** Tope de filas por exportación. Ver el comentario de `ExportarEventos`. */
export const FILAS_MAXIMAS_EXPORTACION = 10_000;

/**
 * Caso de uso `ExportarEventos` — HU-32, pantalla de Informes del mockup.
 *
 * Recorre las páginas hasta agotar el rango, con **dos topes** que no son
 * arbitrarios: el del objeto de valor acota el rango de fechas, y este acota las
 * filas. Sin el segundo, un rango de un año sobre una copropiedad activa
 * construiría un arreglo de cientos de miles de filas en memoria para
 * serializarlo entero — la forma más fácil de tumbar la API con una petición
 * perfectamente legítima. Al llegar al tope se devuelve lo recogido **y se
 * declara que está truncado**, en vez de entregar un informe incompleto que
 * parece completo.
 */
export class ExportarEventos {
  constructor(private readonly repositorio: RepositorioEventos) {}

  async ejecutar(
    criterios: CriteriosDeEventos,
  ): Promise<Resultado<{ filas: readonly EventoRegistrado[]; truncado: boolean }, ErrorDominio>> {
    const filtro = FiltroDeEventos.crear({ ...criterios, tamanoPagina: 200, cursor: null });
    if (esFallo(filtro)) return filtro;

    const filas: EventoRegistrado[] = [];
    let cursor: string | null = null;
    let truncado = false;

    do {
      const pagina: PaginaDeEventos = await this.repositorio.consultar(
        cursor === null
          ? filtro.valor
          : abrirFiltro(FiltroDeEventos.crear({ ...criterios, tamanoPagina: 200, cursor })),
      );
      for (const fila of pagina.filas) {
        if (filas.length >= FILAS_MAXIMAS_EXPORTACION) {
          truncado = true;
          break;
        }
        filas.push(fila);
      }
      cursor = truncado ? null : pagina.siguiente;
    } while (cursor !== null);

    return exito({ filas, truncado });
  }
}

/**
 * El filtro ya se validó con los mismos criterios unas líneas antes; lo único
 * que cambia es el cursor, que el repositorio produjo. Si aun así fallara,
 * seguir sería peor que romper: significaría que el cursor está corrupto.
 */
const abrirFiltro = (r: Resultado<FiltroDeEventos, ErrorDominio>): FiltroDeEventos => {
  if (esFallo(r)) throw new Error(`cursor de exportación inválido: ${r.error.detalle}`);
  return r.valor;
};

export const SEGUNDOS_URL_EVIDENCIA = 120;

/**
 * Caso de uso `ObtenerEvidencia` — RN-21, §2.7.8.
 *
 * La evidencia vive en un bucket **privado** y nunca se sirve por la API: se
 * devuelve una URL firmada de vida corta. Dos minutos y no una hora porque el
 * enlace acaba en el historial del navegador, en un correo reenviado o en una
 * captura de pantalla, y ahí sigue siendo válido hasta que caduca.
 */
export class ObtenerEvidencia {
  constructor(
    private readonly repositorio: RepositorioEventos,
    private readonly almacen: AlmacenEvidencia,
  ) {}

  async ejecutar(copropiedadId: string, eventoId: string): Promise<string | null> {
    const evento = await this.repositorio.porId(copropiedadId, eventoId);
    if (evento === null || evento.evidenciaId === null) return null;
    return this.almacen.urlFirmada(evento.evidenciaId, SEGUNDOS_URL_EVIDENCIA);
  }
}
