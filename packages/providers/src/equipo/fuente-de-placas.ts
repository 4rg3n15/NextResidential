import type { LecturaDePlaca, PlateEventSource } from '@ncr/domain-core';
import type { EventoDeEquipo } from '../hikvision/contratos-de-evento';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PUERTO QUE ESTABA DECLARADO Y NADIE IMPLEMENTABA
 *
 * `PlateEventSource.suscribir` existe en el dominio desde la ETAPA 05 y hasta
 * hoy **no tenía una sola implementación real**: la placa entraba por el
 * receptor del «servidor de alarma», que llamaba al caso de uso directamente.
 * El puerto quedaba de adorno — y un puerto de adorno es peor que no tenerlo,
 * porque afirma un desacople que no existe.
 *
 * Aquí converge, y por **los dos transportes**, que no son intercambiables:
 *
 * | Transporte | Quién inicia        | Cuándo se usa                            |
 * | ---------- | ------------------- | ---------------------------------------- |
 * | ARMADO     | Nuestro sistema     | El equipo admite mantener el flujo abierto |
 * | ESCUCHA    | **El equipo**       | El equipo publica en nuestro receptor     |
 *
 * Son dos porque el propio fabricante enumera, entre los fallos previstos de la
 * integración, que **un modelo puede no admitir la escucha de eventos**. Con un
 * solo transporte, ese modelo se queda fuera y el diagnóstico es «no llegan
 * eventos» sin más.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DOS CANALES DE SALIDA, Y LA RAZÓN ESTÁ EN EL TIPO DEL DOMINIO
 *
 * `LecturaDePlaca` —lo que el puerto entrega— tiene cuatro campos: placa,
 * confianza, dispositivo y cuándo. **No tiene sitio para la evidencia**, y la
 * evidencia tiene que guardarse ANTES del evento porque `eventos` es
 * append-only y no se puede corregir después (ADR-05).
 *
 * Las salidas posibles eran tres y dos son peores:
 *
 * 1. Añadir campos a `LecturaDePlaca`. Es **cambiar el dominio** por una
 *    necesidad de transporte, y la regla dura de esta etapa dice que si hace
 *    falta tocar el dominio hay que **pararse y reportarlo**. Reportado queda.
 * 2. Dejar que el receptor siga llamando al caso de uso por su cuenta. Es lo
 *    que había, y es el puerto decorativo.
 * 3. Un canal **de este paquete** —no del dominio— para lo que el puerto no
 *    expresa, y el puerto intacto para lo que sí. Es lo que se hace.
 *
 * Hay **un solo ingestor**: el que convierte una publicación en un hecho
 * registrado. Los suscriptores del puerto son observadores adicionales y no
 * escriben nada. Así no vuelve a haber dos caminos a `RegistrarAcceso`, que es
 * justo lo que esta etapa viene a cerrar.
 */

/** Lo que un transporte entrega. Es de este paquete, no del dominio. */
export interface PublicacionDeEquipo {
  readonly evento: EventoDeEquipo;
  /** Escena completa, si el transporte la trajo. */
  readonly foto: Buffer | null;
  /** Recorte de la placa, si el transporte lo trajo. */
  readonly recorte: Buffer | null;
  /** Por dónde entró. Se registra: distingue un modelo del otro en sitio. */
  readonly transporte: 'escucha' | 'armado';
}

/**
 * Quien convierte una publicación en un hecho registrado e inmutable.
 *
 * Lo implementa la capa de aplicación de la API. Aquí sólo se declara, porque
 * este paquete no sabe qué es un evento de acceso ni una copropiedad.
 */
export interface ResultadoDeIngesta {
  readonly registrado: boolean;
  /** Por qué no se registró. `null` cuando sí se registró. */
  readonly motivo: string | null;
}

export interface IngestorDePublicaciones {
  ingerir(publicacion: PublicacionDeEquipo): Promise<ResultadoDeIngesta>;
}

/** Una lectura utilizable, o `null` si la publicación no traía placa. */
export const lecturaDe = (evento: EventoDeEquipo): LecturaDePlaca | null => {
  if (evento.clase !== 'placa' || evento.placa === null) return null;
  return {
    placa: evento.placa,
    // Sin confianza declarada se entrega 0 y **no** 1: el umbral de lectura
    // dudosa (CU-01, excepción 3a) tiene que poder actuar, y suponer certeza
    // donde el equipo no la afirma es decidir por él.
    confianza: evento.confianza ?? 0,
    dispositivoId: evento.dispositivoId,
    ocurridoEn: evento.ocurridoEn,
  };
};

/**
 * Qué pasó con una publicación. Lo que el receptor traduce en su respuesta.
 *
 * `no_registrada` existe y no se colapsa con las demás: el hecho llegó y era
 * una lectura buena, y aun así no se escribió. Confundirlo con «sin placa»
 * escondería un fallo de la base detrás de un sobre mal formado.
 */
export type DesenlaceDePublicacion = 'ingerida' | 'historica' | 'sin_placa' | 'no_registrada';

export interface ResultadoDePublicacion {
  readonly desenlace: DesenlaceDePublicacion;
  readonly motivo: string | null;
}

export class FuenteDePlacas implements PlateEventSource {
  private readonly suscriptores: ((lectura: LecturaDePlaca) => Promise<void>)[] = [];
  private ingestor: IngestorDePublicaciones | null = null;

  constructor(ingestor?: IngestorDePublicaciones) {
    this.ingestor = ingestor ?? null;
  }

  /** El puerto del dominio. Observadores, no escritores. */
  async suscribir(alLeer: (lectura: LecturaDePlaca) => Promise<void>): Promise<void> {
    this.suscriptores.push(alLeer);
  }

  /**
   * Se fija **una sola vez**. Un segundo ingestor produciría dos eventos por
   * cada lectura en una tabla que no admite borrado, y el defecto no se vería
   * hasta que alguien contara los accesos del día.
   */
  fijarIngestor(ingestor: IngestorDePublicaciones): void {
    if (this.ingestor !== null) {
      throw new Error(
        'La fuente de placas ya tiene ingestor. Dos producirían dos eventos por lectura ' +
          'en una tabla append-only, y el defecto sólo se vería contando accesos',
      );
    }
    this.ingestor = ingestor;
  }

  /**
   * Publica lo que un transporte trajo.
   *
   * **Lo histórico no llega a nadie.** El equipo reenvía su historial por los
   * dos transportes, y sin este corte la portería mostraría accesos de hace
   * días como si ocurrieran ahora, en una tabla que no se puede limpiar.
   */
  async publicar(publicacion: PublicacionDeEquipo): Promise<ResultadoDePublicacion> {
    if (!publicacion.evento.enVivo) {
      return { desenlace: 'historica', motivo: 'el equipo lo marcó histórico' };
    }

    const lectura = lecturaDe(publicacion.evento);
    if (lectura === null) return { desenlace: 'sin_placa', motivo: 'sin lectura de placa' };

    const ingesta =
      this.ingestor === null
        ? { registrado: true, motivo: null }
        : await this.ingestor.ingerir(publicacion);

    /**
     * Los observadores del puerto se avisan **aunque la ingesta falle**: la
     * placa se leyó, y eso es cierto con independencia de que la base la haya
     * aceptado. Callárselo convertiría un fallo de escritura en un evento que
     * nadie vio ocurrir.
     */
    for (const suscriptor of this.suscriptores) await suscriptor(lectura);

    return ingesta.registrado
      ? { desenlace: 'ingerida', motivo: null }
      : { desenlace: 'no_registrada', motivo: ingesta.motivo ?? 'el hecho no se pudo registrar' };
  }
}
