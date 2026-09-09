import { estadoPorLatido, ventanaDelDia } from '@ncr/domain-core';
import type { Reloj, VentanaDelDia } from '@ncr/domain-core';
import type {
  ConteosDeAlertas,
  ConteosDelPadron,
  ConteosDeVisitantes,
  DispositivoConEstado,
  FranjaDeAccesos,
  RepositorioTablero,
} from './puertos';

/**
 * Casos de uso de LECTURA del tablero (W-02).
 *
 * Son consultas, no reglas: no hay agregado que cargar ni invariante que
 * sostener. Aun así viven en la capa de aplicación y no en el controlador,
 * porque sí hay dos decisiones que no son de transporte y que se repetirían en
 * cada consumidor si se dejaran arriba: **qué significa «hoy»** para esta
 * copropiedad y **cuándo un dispositivo está en línea**. Las dos las resuelve el
 * dominio (`ventanaDelDia`, `estadoPorLatido`); esta capa solo las orquesta con
 * el reloj inyectado.
 */

export class CopropiedadDesconocida extends Error {
  constructor(readonly copropiedadId: string) {
    super('Copropiedad no encontrada');
    this.name = 'CopropiedadDesconocida';
  }
}

/** Base común: resolver la ventana del día antes de consultar nada. */
abstract class ConsultaDelDia {
  protected constructor(
    protected readonly repositorio: RepositorioTablero,
    protected readonly reloj: Reloj,
  ) {}

  protected async ventana(copropiedadId: string): Promise<VentanaDelDia> {
    const config = await this.repositorio.configuracion(copropiedadId);
    if (config === null) throw new CopropiedadDesconocida(copropiedadId);
    return ventanaDelDia(this.reloj.ahora(), config.zonaHoraria);
  }
}

export interface Indicadores {
  readonly padron: ConteosDelPadron;
  readonly visitantes: ConteosDeVisitantes;
  readonly alertas: ConteosDeAlertas;
  /** Se declara: la consola muestra «hoy» según la copropiedad, no según quien mira. */
  readonly ventana: { readonly desde: Date; readonly hasta: Date; readonly zonaHoraria: string };
}

/**
 * Las cuatro tarjetas del mockup. Las tres consultas van **en paralelo**: son
 * independientes y secuenciarlas triplicaría la latencia de la primera pantalla
 * que ve el administrador cada mañana.
 */
export class ConsultarIndicadores extends ConsultaDelDia {
  constructor(repositorio: RepositorioTablero, reloj: Reloj) {
    super(repositorio, reloj);
  }

  async ejecutar(copropiedadId: string): Promise<Indicadores> {
    const ventana = await this.ventana(copropiedadId);
    const [padron, visitantes, alertas] = await Promise.all([
      this.repositorio.conteosDelPadron(copropiedadId, ventana),
      this.repositorio.conteosDeVisitantes(copropiedadId, ventana),
      this.repositorio.conteosDeAlertas(copropiedadId),
    ]);
    return { padron, visitantes, alertas, ventana };
  }
}

export interface AccesosPorHora {
  readonly franjas: readonly FranjaDeAccesos[];
  readonly zonaHoraria: string;
  readonly desde: Date;
  readonly hasta: Date;
}

/**
 * El histograma del día. Se devuelven **las 24 franjas siempre**, incluidas las
 * de cero: si el repositorio solo entregara las horas con tráfico, la consola
 * tendría que rellenar los huecos, y ese relleno es exactamente el punto donde
 * una barra ausente se confunde con una barra en cero. El eje lo fija el
 * servidor, que es quien sabe en qué zona horaria está el conjunto.
 */
export class ConsultarAccesosPorHora extends ConsultaDelDia {
  constructor(repositorio: RepositorioTablero, reloj: Reloj) {
    super(repositorio, reloj);
  }

  async ejecutar(copropiedadId: string): Promise<AccesosPorHora> {
    const ventana = await this.ventana(copropiedadId);
    const medidas = await this.repositorio.accesosPorHora(copropiedadId, ventana);
    const porHora = new Map(medidas.map((f) => [f.hora, f]));
    const franjas = Array.from({ length: 24 }, (_, hora) => {
      const medida = porHora.get(hora);
      return medida ?? { hora, permitidos: 0, negados: 0 };
    });
    return {
      franjas,
      zonaHoraria: ventana.zonaHoraria,
      desde: ventana.desde,
      hasta: ventana.hasta,
    };
  }
}

export interface EstadoDeDispositivos {
  readonly dispositivos: readonly DispositivoConEstado[];
  readonly saludables: number;
  readonly degradados: number;
  readonly caidos: number;
}

/**
 * «EN LÍNEA / FALLA» del mockup, con el escalón intermedio que el dominio ya
 * tenía. El estado **no se lee de `estado_salud`**: se deriva del último latido
 * contra el umbral de la copropiedad (migración 0020) con el reloj inyectado.
 * La columna de la base la mantiene el vigilante de latidos y puede ir por
 * detrás; el tablero tiene que decir la verdad en el instante en que se pinta.
 */
export class ConsultarDispositivos {
  constructor(
    private readonly repositorio: RepositorioTablero,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(copropiedadId: string): Promise<EstadoDeDispositivos> {
    const config = await this.repositorio.configuracion(copropiedadId);
    if (config === null) throw new CopropiedadDesconocida(copropiedadId);

    const ahora = this.reloj.ahora();
    const dispositivos = (await this.repositorio.dispositivos(copropiedadId)).map((d) => ({
      ...d,
      estado: estadoPorLatido(d.ultimoLatido, ahora, config.umbralDeLatido),
      segundosSinLatir:
        d.ultimoLatido === null
          ? null
          : Math.max(0, Math.round((ahora.getTime() - d.ultimoLatido.getTime()) / 1000)),
    }));

    const contar = (estado: string): number =>
      dispositivos.filter((d) => d.estado === estado).length;
    return {
      dispositivos,
      saludables: contar('saludable'),
      degradados: contar('degradado'),
      caidos: contar('caido'),
    };
  }
}
